from __future__ import annotations
import glob
import json
import os
import re
import signal
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings
from app.conversations import conv_manager
from app.engine import engine


class ProcessManager:
    def __init__(self):
        self._output_tail_cache: Dict[int, deque] = {}

    def _detect_conversation_id(self, pid: int, parsed: Dict[str, Any]) -> Optional[str]:
        """Resolves conversation ID from CLI flags, engine memory, or open file descriptors."""
        # 1. From CLI flags
        if parsed.get("conversation_id"):
            return parsed["conversation_id"]

        # 2. From engine active PID mapping
        if pid in engine._active_pids:
            candidate = engine._active_pids[pid]
            if candidate and not candidate.startswith("temp_"):
                return candidate

        # 3. From /proc/{pid}/fd open database or lock files
        try:
            for fd_link in glob.glob(f"/proc/{pid}/fd/*"):
                try:
                    target = os.readlink(fd_link)
                    m = re.search(r"/(?:conversations|presence)/([0-9a-fA-F-]{36})\.(?:db|lock)", target)
                    if m:
                        return m.group(1)
                except (OSError, FileNotFoundError):
                    continue
        except Exception:
            pass

        return None

    def list_processes(self) -> List[Dict[str, Any]]:
        """Scans /proc for all running Google Antigravity (agy) CLI processes."""
        processes = []
        now = time.time()

        for pid_dir in glob.glob("/proc/[0-9]*"):
            try:
                pid = int(os.path.basename(pid_dir))
            except ValueError:
                continue

            try:
                # Read cmdline
                with open(f"/proc/{pid}/cmdline", "rb") as f:
                    raw_cmd = f.read().split(b"\0")
                cmdline = [c.decode("utf-8", errors="replace") for c in raw_cmd if c]
                if not cmdline:
                    continue

                # Check if this executable is agy
                exe = os.path.basename(cmdline[0])
                if not (exe == "agy" or (len(cmdline) > 1 and "agy" in cmdline[0])):
                    continue
                # Ignore python or uvicorn wrappers
                if "python" in cmdline[0] or "uvicorn" in cmdline[0]:
                    continue

                # Read /proc/{pid}/status for VmRSS and State
                rss_kb = 0
                state = "?"
                ppid = 0
                try:
                    with open(f"/proc/{pid}/status", "r") as f:
                        for line in f:
                            if line.startswith("VmRSS:"):
                                rss_kb = int(line.split()[1])
                            elif line.startswith("State:"):
                                state = line.split()[1]
                            elif line.startswith("PPid:"):
                                ppid = int(line.split()[1])
                except Exception:
                    pass

                # Read CWD
                cwd = ""
                try:
                    cwd = os.readlink(f"/proc/{pid}/cwd")
                except Exception:
                    pass

                # Read start time from /proc/{pid}/stat
                start_time_seconds = 0.0
                try:
                    stat_mtime = os.path.getmtime(f"/proc/{pid}")
                    start_time_seconds = stat_mtime
                except Exception:
                    pass

                uptime_seconds = max(0, int(now - start_time_seconds)) if start_time_seconds else 0

                # Parse agy arguments
                parsed = self._parse_agy_cmdline(cmdline)

                # Check if this process has a known conversation title
                conv_id = self._detect_conversation_id(pid, parsed)
                conv_title = "CLI Session"
                if conv_id:
                    conv_title = conv_manager.get_conversation_title(conv_id) or f"Session {conv_id[:8]}"

                processes.append({
                    "pid": pid,
                    "ppid": ppid,
                    "state": state,
                    "state_label": self._format_state(state),
                    "rss_mb": round(rss_kb / 1024, 1),
                    "cwd": cwd,
                    "started_at": start_time_seconds,
                    "uptime_seconds": uptime_seconds,
                    "uptime_str": self._format_uptime(uptime_seconds),
                    "conversation_id": conv_id,
                    "conversation_title": conv_title,
                    "model": parsed.get("model") or "default",
                    "mode": parsed.get("mode") or "auto",
                    "effort": parsed.get("effort") or "default",
                    "prompt": parsed.get("prompt") or "",
                    "cmdline": cmdline,
                    "cmdline_str": " ".join(cmdline),
                    "is_engine_managed": ppid == os.getpid() or (conv_id in engine._active_processes) or (pid in engine._active_pids),
                })
            except (ProcessLookupError, PermissionError, FileNotFoundError):
                continue
            except Exception:
                continue

        # Sort by PID descending (most recent first)
        processes.sort(key=lambda p: p["pid"], reverse=True)
        return processes

    def _parse_agy_cmdline(self, cmdline: List[str]) -> Dict[str, Any]:
        """Extracts flags and parameters from an agy command line."""
        result: Dict[str, Any] = {
            "conversation_id": None,
            "model": None,
            "mode": None,
            "effort": None,
            "prompt": None,
            "add_dirs": [],
        }

        i = 1
        while i < len(cmdline):
            arg = cmdline[i]
            if arg in ("--conversation", "-c") and i + 1 < len(cmdline):
                result["conversation_id"] = cmdline[i + 1]
                i += 2
            elif arg in ("--model", "-m") and i + 1 < len(cmdline):
                result["model"] = cmdline[i + 1]
                i += 2
            elif arg == "--mode" and i + 1 < len(cmdline):
                result["mode"] = cmdline[i + 1]
                i += 2
            elif arg == "--effort" and i + 1 < len(cmdline):
                result["effort"] = cmdline[i + 1]
                i += 2
            elif arg in ("-p", "--prompt", "--print") and i + 1 < len(cmdline):
                result["prompt"] = cmdline[i + 1]
                i += 2
            elif arg == "--add-dir" and i + 1 < len(cmdline):
                result["add_dirs"].append(cmdline[i + 1])
                i += 2
            else:
                i += 1

        return result

    def _format_state(self, code: str) -> str:
        mapping = {
            "R": "Running",
            "S": "Sleeping (Waiting I/O)",
            "D": "Disk Sleep",
            "Z": "Zombie",
            "T": "Stopped",
            "t": "Tracing Stop",
            "X": "Dead",
        }
        return mapping.get(code, code)

    def _format_uptime(self, seconds: int) -> str:
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            m = seconds // 60
            s = seconds % 60
            return f"{m}m {s}s"
        else:
            h = seconds // 3600
            m = (seconds % 3600) // 60
            return f"{h}h {m}m"

    def get_process_output(self, pid: int, limit: int = 150) -> Dict[str, Any]:
        """Fetches current live output or transcript steps for a given agy process."""
        # First verify process exists
        if not os.path.exists(f"/proc/{pid}"):
            return {
                "pid": pid,
                "status": "terminated",
                "lines": [{"type": "error", "message": f"Process {pid} is no longer running."}]
            }

        # Find process metadata to locate conversation_id
        cmdline = []
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmdline = [c.decode("utf-8", errors="replace") for c in f.read().split(b"\0") if c]
        except Exception:
            pass

        parsed = self._parse_agy_cmdline(cmdline)
        conv_id = self._detect_conversation_id(pid, parsed)

        lines: List[Dict[str, Any]] = []

        # 1. If we have a conversation_id, read latest entries from transcript.jsonl
        if conv_id:
            transcript_path = (
                Path.home()
                / ".gemini"
                / "antigravity-cli"
                / "brain"
                / conv_id
                / ".system_generated"
                / "logs"
                / "transcript.jsonl"
            )

            if transcript_path.exists():
                try:
                    with open(transcript_path, "r", encoding="utf-8") as f:
                        raw_lines = f.readlines()

                    recent = raw_lines[-limit:] if len(raw_lines) > limit else raw_lines
                    for r in recent:
                        try:
                            step = json.loads(r)
                            lines.append(self._format_transcript_step(step))
                        except Exception:
                            lines.append({"type": "raw", "message": r.strip()})
                except Exception as e:
                    lines.append({"type": "warning", "message": f"Could not read transcript log: {e}"})

        # 2. Check cached in-memory buffer
        if pid in self._output_tail_cache:
            for item in list(self._output_tail_cache[pid]):
                lines.append(item)

        # Fallback if no lines found yet: command preview
        if not lines:
            lines.append({
                "type": "info",
                "message": f"Process {pid} active. Command: {' '.join(cmdline[:6])}...",
                "timestamp": time.time(),
            })

        return {
            "pid": pid,
            "status": "active",
            "conversation_id": conv_id,
            "prompt": parsed.get("prompt"),
            "lines": lines,
        }

    def _format_transcript_step(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """Converts raw transcript JSON step into user-friendly output record."""
        step_idx = step.get("step_index", 0)
        source = step.get("source", "SYSTEM")
        step_type = step.get("type", "GENERIC")
        created_at = step.get("created_at", "")

        entry: Dict[str, Any] = {
            "step_index": step_idx,
            "source": source,
            "type": step_type,
            "timestamp": created_at,
        }

        if step_type == "USER_INPUT":
            content = step.get("content", "")
            # Clean envelope if present
            if "<USER_REQUEST>" in content:
                import re
                m = re.search(r"<USER_REQUEST>(.*?)</USER_REQUEST>", content, re.DOTALL)
                if m:
                    content = m.group(1).strip()
            entry["content"] = content
            entry["label"] = f"Step {step_idx}: User Input"

        elif step_type == "PLANNER_RESPONSE":
            tool_calls = step.get("tool_calls", [])
            thinking = step.get("thinking", "")
            if tool_calls:
                tools_summary = ", ".join(t.get("name", "tool") for t in tool_calls)
                entry["label"] = f"Step {step_idx}: Calling tool(s): {tools_summary}"
                entry["tool_calls"] = tool_calls
            else:
                entry["label"] = f"Step {step_idx}: Agent Thinking"
            if thinking:
                entry["thinking"] = thinking[:400] + ("..." if len(thinking) > 400 else "")

        elif source == "TOOL":
            entry["label"] = f"Step {step_idx}: Tool Output"
            entry["content"] = str(step.get("content", ""))[:500]

        else:
            entry["label"] = f"Step {step_idx}: {step_type}"
            entry["content"] = str(step.get("content", ""))[:400]

        return entry

    def stop_process(self, pid: int, force: bool = False) -> Dict[str, Any]:
        """Stops or kills a running agy process."""
        if not os.path.exists(f"/proc/{pid}"):
            return {"status": "not_found", "message": f"Process {pid} is not running."}

        try:
            if force:
                os.kill(pid, signal.SIGKILL)
                return {"status": "killed", "message": f"Sent SIGKILL to process {pid}."}
            else:
                # First try gentle SIGINT
                os.kill(pid, signal.SIGINT)
                return {"status": "stopping", "message": f"Sent SIGINT to process {pid}."}
        except ProcessLookupError:
            return {"status": "not_found", "message": f"Process {pid} already exited."}
        except PermissionError as e:
            return {"status": "error", "message": f"Permission denied stopping process {pid}: {e}"}

    def inject_steering(
        self,
        conversation_id: str,
        message: str,
        interrupt: bool = False,
    ) -> Dict[str, Any]:
        """Injects a /btw steering instruction into a running agent session."""
        if not conversation_id:
            return {"status": "error", "message": "Missing conversation_id for /btw steering."}

        clean_message = message.strip()
        if not clean_message:
            return {"status": "error", "message": "Empty steering message."}

        # 1. Write high-priority message JSON to .system_generated/messages/undelivered/
        undelivered_dir = (
            Path.home()
            / ".gemini"
            / "antigravity-cli"
            / "brain"
            / conversation_id
            / ".system_generated"
            / "messages"
            / "undelivered"
        )
        undelivered_dir.mkdir(parents=True, exist_ok=True)

        msg_id = str(uuid.uuid4())
        msg_payload = {
            "id": msg_id,
            "recipient": conversation_id,
            "sender": "user",
            "priority": "MESSAGE_PRIORITY_HIGH",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "hideFromUser": False,
            "content": f"[USER STEERING / BTW]: {clean_message}"
        }

        try:
            file_path = undelivered_dir / f"{msg_id}.json"
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(msg_payload, f, indent=2)
        except Exception as e:
            return {"status": "error", "message": f"Failed to write steering queue: {e}"}

        # 2. If interrupt=True requested, find process and send SIGINT to break stuck tool
        interrupted = False
        if interrupt:
            for p in self.list_processes():
                if p.get("conversation_id") == conversation_id:
                    try:
                        os.kill(p["pid"], signal.SIGINT)
                        interrupted = True
                    except Exception:
                        pass

        return {
            "status": "injected",
            "message_id": msg_id,
            "conversation_id": conversation_id,
            "steering_message": clean_message,
            "interrupted": interrupted,
            "timestamp": time.time(),
        }


# Global process manager singleton
process_manager = ProcessManager()
