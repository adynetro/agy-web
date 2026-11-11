from __future__ import annotations
import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from croniter import croniter
    HAS_CRONITER = True
except ImportError:
    HAS_CRONITER = False

from app.config import settings
from app.cron.models import CronJob, CronJobCreate, CronJobUpdate, CronRunRecord
from app.session_manager import session_manager
from app.channels.web import web_channel
from app.channels.manager import channel_manager

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"
CRON_JOBS_FILE = CONFIG_DIR / "cron_jobs.json"
CRON_RUNS_FILE = CONFIG_DIR / "cron_runs.json"
MAX_SAVED_RUNS = 100


def describe_cron(expr: str) -> str:
    """Provides a human-friendly English description for common 5-part cron patterns."""
    expr = expr.strip()
    parts = expr.split()
    if len(parts) != 5:
        return expr

    m, h, dom, mon, dow = parts

    # Presets
    if expr == "* * * * *":
        return "Every minute"
    if expr == "*/5 * * * *":
        return "Every 5 minutes"
    if expr == "*/10 * * * *":
        return "Every 10 minutes"
    if expr == "*/15 * * * *":
        return "Every 15 minutes"
    if expr == "*/30 * * * *":
        return "Every 30 minutes"
    if expr == "0 * * * *":
        return "Every hour (at minute 0)"
    if expr == "0 */2 * * *":
        return "Every 2 hours"
    if expr == "0 */6 * * *":
        return "Every 6 hours"
    if expr == "0 */12 * * *":
        return "Every 12 hours"
    if m == "0" and h.isdigit() and dom == "*" and mon == "*" and dow == "*":
        return f"Daily at {int(h):02d}:00 UTC"
    if m.isdigit() and h.isdigit() and dom == "*" and mon == "*" and dow == "*":
        return f"Daily at {int(h):02d}:{int(m):02d} UTC"
    if m == "0" and h == "0" and dom == "*" and mon == "*" and dow == "0":
        return "Weekly on Sunday at midnight UTC"
    if m == "0" and h.isdigit() and dom == "*" and mon == "*" and dow == "1":
        return f"Weekly on Monday at {int(h):02d}:00 UTC"
    if m == "0" and h.isdigit() and dom == "*" and mon == "*" and dow in ("1-5", "1,2,3,4,5"):
        return f"Monday through Friday at {int(h):02d}:00 UTC"
    if m == "0" and h == "0" and dom == "1" and mon == "*" and dow == "*":
        return "Monthly on the 1st at midnight UTC"

    return f"Cron: {expr}"


def get_next_run(expr: str, base_time: Optional[float] = None) -> Optional[float]:
    """Calculates next execution epoch timestamp for a cron expression."""
    base_ts = base_time or time.time()
    if not HAS_CRONITER:
        return base_ts + 3600.0

    try:
        base_dt = datetime.fromtimestamp(base_ts, tz=timezone.utc)
        cron = croniter(expr.strip(), base_dt)
        next_dt = cron.get_next(datetime)
        return next_dt.timestamp()
    except Exception as e:
        print(f"[CronManager] Error calculating next run for '{expr}': {e}")
        return None


def validate_cron_expression(expr: str) -> Tuple[bool, str, List[float]]:
    """Validates cron expression, returns (valid, description, next_5_timestamps)."""
    expr = expr.strip()
    if not HAS_CRONITER:
        parts = expr.split()
        return len(parts) == 5, describe_cron(expr), [time.time() + (i * 3600) for i in range(1, 6)]

    try:
        now_dt = datetime.now(timezone.utc)
        cron = croniter(expr, now_dt)
        next_timestamps: List[float] = []
        for _ in range(5):
            nxt = cron.get_next(datetime)
            next_timestamps.append(nxt.timestamp())
        return True, describe_cron(expr), next_timestamps
    except Exception as e:
        return False, str(e), []


class CronManager:
    """
    Central scheduler and automation manager for recurring Antigravity agent jobs.
    Runs in the background, checks schedules, executes turns, and broadcasts status.
    """

    def __init__(self):
        self._jobs: Dict[str, CronJob] = {}
        self._runs: List[CronRunRecord] = []
        self._running_jobs: Dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()
        self._running = False
        self._ticker_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Starts the scheduler background loop."""
        async with self._lock:
            self._load_from_disk()
            self._running = True
            if not self._ticker_task or self._ticker_task.done():
                self._ticker_task = asyncio.create_task(self._ticker_loop())
            print(f"[CronManager] Scheduler started with {len(self._jobs)} scheduled jobs.")

    async def stop(self) -> None:
        """Stops the scheduler and cancels background tasks."""
        self._running = False
        if self._ticker_task:
            self._ticker_task.cancel()
            try:
                await self._ticker_task
            except asyncio.CancelledError:
                pass
            self._ticker_task = None
        print("[CronManager] Scheduler stopped.")

    def _load_from_disk(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        # Load Jobs
        if CRON_JOBS_FILE.exists():
            try:
                with open(CRON_JOBS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        for item in data:
                            try:
                                job = CronJob(**item)
                                # Recalculate next run time if missing or past
                                now = time.time()
                                if job.enabled and (not job.next_run_at or job.next_run_at < now):
                                    job.next_run_at = get_next_run(job.cron_expression, now)
                                self._jobs[job.id] = job
                            except Exception as e:
                                print(f"[CronManager] Skipping invalid job entry: {e}")
            except Exception as e:
                print(f"[CronManager] Error loading {CRON_JOBS_FILE}: {e}")

        # If no jobs exist on first boot, initialize with practical Homelab templates (disabled by default)
        if not self._jobs:
            self._seed_default_templates()
            self._save_jobs_to_disk()

        # Load Runs History
        if CRON_RUNS_FILE.exists():
            try:
                with open(CRON_RUNS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._runs = [CronRunRecord(**item) for item in data[:MAX_SAVED_RUNS]]
            except Exception as e:
                print(f"[CronManager] Error loading {CRON_RUNS_FILE}: {e}")

    def _seed_default_templates(self) -> None:
        now = time.time()
        job1 = CronJob(
            id="cron_homelab_health",
            name="Homelab & Proxmox Health Check",
            description="Daily automated audit of Proxmox VE hypervisor status, VM/LXC health, and Home Assistant OS.",
            cron_expression="0 8 * * *",
            prompt="Run a comprehensive homelab health check: verify pve status, check Home Assistant OS health with `ha core info`, inspect storage pool usage with `pve pvesm status`, and report any degraded containers or failed units.",
            mode="yolo",
            target_type="new",
            enabled=False,
            created_at=now,
            updated_at=now,
            next_run_at=get_next_run("0 8 * * *", now),
        )
        job2 = CronJob(
            id="cron_repo_sync",
            name="Git Repositories Drift & Status Check",
            description="Periodic check of git status across local repositories to ensure work trees are clean and synced.",
            cron_expression="0 */6 * * *",
            prompt="Check git status across homelab repositories in /root (agy-webui, okd-mickey17, devops-technical-challenge). Report any unstaged changes, untracked files, or unpushed commits.",
            mode="yolo",
            target_type="dedicated",
            enabled=False,
            created_at=now,
            updated_at=now,
            next_run_at=get_next_run("0 */6 * * *", now),
        )
        self._jobs[job1.id] = job1
        self._jobs[job2.id] = job2

    def _save_jobs_to_disk(self) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp_file = CRON_JOBS_FILE.with_suffix(".tmp")
            data = [job.model_dump() for job in self._jobs.values()]
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_file, CRON_JOBS_FILE)
        except Exception as e:
            print(f"[CronManager] Error saving jobs to disk: {e}")

    def _save_runs_to_disk(self) -> None:
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            tmp_file = CRON_RUNS_FILE.with_suffix(".tmp")
            data = [run.model_dump() for run in self._runs[:MAX_SAVED_RUNS]]
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_file, CRON_RUNS_FILE)
        except Exception as e:
            print(f"[CronManager] Error saving runs to disk: {e}")

    async def _ticker_loop(self) -> None:
        """Background loop ticking every 10 seconds checking for due cron jobs."""
        while self._running:
            try:
                await asyncio.sleep(10)
                if not self._running:
                    break

                now = time.time()
                due_jobs: List[CronJob] = []

                async with self._lock:
                    for job in list(self._jobs.values()):
                        if (
                            job.enabled
                            and job.next_run_at
                            and job.next_run_at <= now
                            and job.id not in self._running_jobs
                        ):
                            due_jobs.append(job)
                            # Advance next run time immediately to prevent double-firing
                            job.next_run_at = get_next_run(job.cron_expression, now + 1)

                    if due_jobs:
                        self._save_jobs_to_disk()

                # Trigger due jobs concurrently in the background
                for job in due_jobs:
                    task = asyncio.create_task(self.execute_job(job.id, is_manual=False))
                    self._running_jobs[job.id] = task

                    def _cleanup(t, jid=job.id):
                        self._running_jobs.pop(jid, None)

                    task.add_done_callback(_cleanup)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[CronManager] Unexpected error in ticker loop: {e}")

    async def execute_job(self, job_id: str, is_manual: bool = False) -> Optional[CronRunRecord]:
        """Executes a single cron job turn asynchronously."""
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None

            job.last_status = "running"
            job.last_run_at = time.time()
            self._save_jobs_to_disk()

        # Broadcast live status update
        await self._broadcast_job_event("cron_job_started", job_id)

        run_record = CronRunRecord(
            job_id=job.id,
            job_name=job.name,
            started_at=time.time(),
            status="running",
            prompt=job.prompt,
        )

        # Determine target conversation
        conv_id: Optional[str] = None
        if job.target_type == "dedicated":
            conv_id = f"cron_dedicated_{job.id}"
        elif job.target_type == "existing" and job.target_conversation_id:
            conv_id = job.target_conversation_id
        else:
            # "new" conversation per run
            conv_id = f"cron_{job.id}_{int(time.time())}"

        run_record.conversation_id = conv_id
        start_ts = time.time()

        try:
            print(f"[CronManager] Firing cron job '{job.name}' ({job.id}) in conversation '{conv_id}'")
            session, task = await session_manager.start_turn(
                prompt=job.prompt,
                conversation_id=conv_id,
                model=job.model,
                effort=job.effort,
                mode=job.mode or "yolo",
            )

            # Wait for turn execution with timeout
            await asyncio.wait_for(task, timeout=float(job.timeout_seconds))

            finished_ts = time.time()
            duration = round(finished_ts - start_ts, 2)
            run_record.finished_at = finished_ts
            run_record.duration_seconds = duration

            # Inspect session results
            if session.status == "completed" or (session.result and session.result.get("status") == "SUCCESS"):
                run_record.status = "success"
                # Extract output snippet
                snippet = "Turn completed successfully."
                if session.result:
                    res_obj = session.result.get("result") or session.result
                    if isinstance(res_obj, dict) and res_obj.get("content"):
                        snippet = str(res_obj["content"])[:300]
                    elif isinstance(res_obj, dict) and res_obj.get("message"):
                        snippet = str(res_obj["message"])[:300]
                run_record.output_snippet = snippet

            elif session.status == "aborted":
                run_record.status = "aborted"
                run_record.error = "Turn was aborted."

            else:
                run_record.status = "failed"
                run_record.error = session.error or "Agent turn failed or returned an error status."

        except asyncio.TimeoutError:
            finished_ts = time.time()
            duration = round(finished_ts - start_ts, 2)
            run_record.finished_at = finished_ts
            run_record.duration_seconds = duration
            run_record.status = "timeout"
            run_record.error = f"Execution exceeded maximum timeout of {job.timeout_seconds}s."
            if conv_id:
                await session_manager.abort_turn(conv_id)

        except Exception as e:
            finished_ts = time.time()
            duration = round(finished_ts - start_ts, 2)
            run_record.finished_at = finished_ts
            run_record.duration_seconds = duration
            run_record.status = "failed"
            run_record.error = str(e)

        # Update Job state
        async with self._lock:
            job.last_status = run_record.status
            job.last_duration_seconds = run_record.duration_seconds
            job.last_error = run_record.error
            job.last_conversation_id = run_record.conversation_id
            job.run_count += 1
            if not job.next_run_at or job.next_run_at <= time.time():
                job.next_run_at = get_next_run(job.cron_expression, time.time() + 1)
            self._save_jobs_to_disk()

            # Record run in memory and disk
            self._runs.insert(0, run_record)
            self._runs = self._runs[:MAX_SAVED_RUNS]
            self._save_runs_to_disk()

        print(f"[CronManager] Finished cron job '{job.name}' ({job.id}) - Status: {run_record.status} ({run_record.duration_seconds}s)")

        # Disseminate notifications to channels if requested
        await self._dispatch_notifications(job, run_record)

        # Broadcast live event to WebSockets
        await self._broadcast_job_event("cron_job_finished", job_id, run_record.model_dump())

        return run_record

    async def _dispatch_notifications(self, job: CronJob, run: CronRunRecord) -> None:
        """Sends summary notifications to configured channels."""
        if not job.notify_channels:
            return

        status_emoji = "✅" if run.status == "success" else ("⚠️" if run.status == "timeout" else "❌")
        summary_text = (
            f"{status_emoji} *[Cron Job] {job.name}*\n"
            f"• *Status*: {run.status.upper()}\n"
            f"• *Duration*: {run.duration_seconds or 0}s\n"
            f"• *Time*: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        )
        if run.output_snippet:
            clean_snippet = run.output_snippet.strip().replace("`", "")[:250]
            summary_text += f"\n*Preview*:\n_{clean_snippet}_\n"
        if run.error:
            summary_text += f"\n*Error*: `{run.error[:200]}`\n"

        # Telegram
        if "telegram" in job.notify_channels:
            try:
                tg = channel_manager.get_channel("telegram")
                if tg and tg.is_enabled and getattr(settings, "telegram_allowed_users", []):
                    # Send to allowed chat IDs
                    for chat_id in getattr(settings, "telegram_allowed_users", []):
                        if str(chat_id).isdigit():
                            await tg._send_text(int(chat_id), summary_text, parse_mode="Markdown")
            except Exception as e:
                print(f"[CronManager] Failed to dispatch Telegram notification: {e}")

        # Discord
        if "discord" in job.notify_channels:
            try:
                dc = channel_manager.get_channel("discord")
                if dc and dc.is_enabled and getattr(settings, "discord_allowed_channels", []):
                    for ch_id in getattr(settings, "discord_allowed_channels", []):
                        if str(ch_id).isdigit():
                            channel = dc.client.get_channel(int(ch_id))
                            if channel:
                                await channel.send(summary_text.replace("*", "**"))
            except Exception as e:
                print(f"[CronManager] Failed to dispatch Discord notification: {e}")

    async def _broadcast_job_event(self, event_type: str, job_id: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Broadcasts cron status events over WebSocket to all open browser windows."""
        try:
            payload = {
                "event": event_type,
                "job_id": job_id,
                "timestamp": time.time(),
                "data": data or {},
            }
            await web_channel.broadcast("", payload)
        except Exception:
            pass

    # Public CRUD Operations
    def list_jobs(self) -> List[Dict[str, Any]]:
        return [
            {
                **job.model_dump(),
                "schedule_description": describe_cron(job.cron_expression),
                "is_running": job.id in self._running_jobs,
            }
            for job in sorted(self._jobs.values(), key=lambda j: j.name.lower())
        ]

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        return {
            **job.model_dump(),
            "schedule_description": describe_cron(job.cron_expression),
            "is_running": job.id in self._running_jobs,
        }

    async def create_job(self, payload: CronJobCreate) -> Dict[str, Any]:
        valid, desc, next_runs = validate_cron_expression(payload.cron_expression)
        if not valid:
            raise ValueError(f"Invalid cron expression '{payload.cron_expression}': {desc}")

        now = time.time()
        job = CronJob(
            name=payload.name,
            description=payload.description or "",
            cron_expression=payload.cron_expression.strip(),
            prompt=payload.prompt,
            model=payload.model,
            mode=payload.mode or "yolo",
            effort=payload.effort,
            target_type=payload.target_type,
            target_conversation_id=payload.target_conversation_id,
            notify_channels=payload.notify_channels,
            enabled=payload.enabled,
            timeout_seconds=payload.timeout_seconds,
            created_at=now,
            updated_at=now,
            next_run_at=get_next_run(payload.cron_expression, now) if payload.enabled else None,
        )

        async with self._lock:
            self._jobs[job.id] = job
            self._save_jobs_to_disk()

        await self._broadcast_job_event("cron_job_created", job.id)
        return self.get_job(job.id)

    async def update_job(self, job_id: str, payload: CronJobUpdate) -> Optional[Dict[str, Any]]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None

            update_data = payload.model_dump(exclude_unset=True)
            if "cron_expression" in update_data and update_data["cron_expression"]:
                valid, desc, _ = validate_cron_expression(update_data["cron_expression"])
                if not valid:
                    raise ValueError(f"Invalid cron expression '{update_data['cron_expression']}': {desc}")

            for k, v in update_data.items():
                if v is not None:
                    setattr(job, k, v)

            job.updated_at = time.time()
            if job.enabled:
                job.next_run_at = get_next_run(job.cron_expression, time.time())
            else:
                job.next_run_at = None

            self._save_jobs_to_disk()

        await self._broadcast_job_event("cron_job_updated", job.id)
        return self.get_job(job.id)

    async def delete_job(self, job_id: str) -> bool:
        async with self._lock:
            if job_id not in self._jobs:
                return False
            del self._jobs[job_id]
            self._save_jobs_to_disk()

        await self._broadcast_job_event("cron_job_deleted", job_id)
        return True

    async def toggle_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None

            job.enabled = not job.enabled
            job.updated_at = time.time()
            if job.enabled:
                job.next_run_at = get_next_run(job.cron_expression, time.time())
            else:
                job.next_run_at = None

            self._save_jobs_to_disk()

        await self._broadcast_job_event("cron_job_updated", job.id)
        return self.get_job(job.id)

    def list_runs(self, job_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        runs = self._runs
        if job_id:
            runs = [r for r in runs if r.job_id == job_id]
        return [r.model_dump() for r in runs[:limit]]


cron_manager = CronManager()
