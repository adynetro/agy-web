from __future__ import annotations
import asyncio
import json
import os
import re
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Set

from app.config import settings
from app.conversations import conv_manager, clean_user_content, BRAIN_DIR
from app.engine import engine
from app.channels.web import web_channel
from app.processes import process_manager


def _format_tool_summary(name: str, args: Any) -> str:
    """Format tool arguments into a concise single-line summary."""
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            return args[:80]
    if not isinstance(args, dict):
        return str(args)[:80]

    if name == "run_command" and args.get("CommandLine"):
        clean_cmd = str(args["CommandLine"]).strip().strip('"')
        return clean_cmd[:80]
    if name in ("read_file", "view_file", "write_file", "edit_file", "replace_file_content") and (
        args.get("Path") or args.get("AbsolutePath")
    ):
        p = str(args.get("Path") or args.get("AbsolutePath")).strip().strip('"')
        return os.path.basename(p) or p
    if args.get("toolSummary"):
        return str(args["toolSummary"]).strip().strip('"')[:80]
    if args.get("query"):
        return str(args["query"]).strip().strip('"')[:80]
    if args.get("prompt"):
        return str(args["prompt"]).strip().strip('"')[:80]
    for k, v in args.items():
        return f"{k}={str(v).strip().strip('\"')[:60]}"
    return name


def extract_terminal_history_from_disk(conversation_id: str, limit: int = 150) -> List[Dict[str, Any]]:
    """Reads transcript.jsonl from disk and converts steps into terminal-friendly log lines."""
    if not conversation_id:
        return []

    full_log_file = BRAIN_DIR / conversation_id / ".system_generated" / "logs" / "transcript_full.jsonl"
    compact_log_file = BRAIN_DIR / conversation_id / ".system_generated" / "logs" / "transcript.jsonl"
    log_file = full_log_file if full_log_file.exists() else compact_log_file
    if not log_file.exists():
        return []

    entries: List[Dict[str, Any]] = []
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            raw_lines = f.readlines()

        recent = raw_lines[-limit:] if len(raw_lines) > limit else raw_lines
        for line in recent:
            line = line.strip()
            if not line:
                continue
            try:
                step = json.loads(line)
            except Exception:
                continue

            step_type = step.get("type")
            source = step.get("source")
            step_idx = step.get("step_index", 0)
            created_at = step.get("created_at")
            ts = time.time()
            if created_at:
                try:
                    from datetime import datetime
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    ts = dt.timestamp()
                except Exception:
                    pass

            if step_type == "USER_INPUT":
                content = clean_user_content(step.get("content", ""))
                preview = content.split("\n")[0][:140]
                entries.append({
                    "level": "info",
                    "type": "user_input",
                    "label": f"Step {step_idx}: User Input",
                    "content": content,
                    "message": f"[USER] > {preview}",
                    "timestamp": ts,
                    "stream": "stdin"
                })

            elif step_type == "PLANNER_RESPONSE":
                tool_calls = step.get("tool_calls", [])
                thinking = step.get("thinking", "")
                if tool_calls:
                    for tc in tool_calls:
                        name = tc.get("name", "tool")
                        args = tc.get("args", {})
                        summary = _format_tool_summary(name, args)
                        entries.append({
                            "level": "exec",
                            "type": "tool_call",
                            "label": f"Step {step_idx}: Calling tool {name}",
                            "tool_calls": [tc],
                            "summary": summary,
                            "content": f"{name} › {summary}" if summary else f"Running {name}",
                            "message": f"[STEP {step_idx}] ⚡ Running {name} › {summary}",
                            "timestamp": ts,
                            "stream": "stdout"
                        })
                elif thinking:
                    entries.append({
                        "level": "step",
                        "type": "thinking",
                        "label": f"Step {step_idx}: Agent Thinking",
                        "thinking": thinking,
                        "content": thinking[:500] + ("..." if len(thinking) > 500 else ""),
                        "message": f"[STEP {step_idx}] Model thinking ({len(thinking)} chars)",
                        "timestamp": ts,
                        "stream": "stdout"
                    })

            elif step_type == "GENERIC" or source == "TOOL":
                content = str(step.get("content", "")).strip()
                if content:
                    first_line = content.split("\n")[0].strip()
                    entries.append({
                        "level": "info",
                        "type": "tool_output" if source == "TOOL" else "info",
                        "label": f"Step {step_idx}: Tool Output" if source == "TOOL" else f"Step {step_idx}: Output",
                        "content": content[:800] + ("..." if len(content) > 800 else ""),
                        "message": f"[CLI] {first_line[:140]}",
                        "timestamp": ts,
                        "stream": "stdout"
                    })

            elif step_type == "RESULT" or "result" in step:
                res = step.get("result", {})
                dur = res.get("duration_seconds", 0)
                status = res.get("status", "SUCCESS")
                entries.append({
                    "level": "result",
                    "type": "result",
                    "label": f"Step {step_idx}: Finished",
                    "content": f"Turn execution completed in {dur:.1f}s ({status})",
                    "message": f"[RESULT] Finished in {dur:.1f}s ({status})",
                    "timestamp": ts,
                    "stream": "stdout"
                })

    except Exception as e:
        entries.append({
            "level": "warning",
            "message": f"Could not load transcript logs: {e}",
            "timestamp": time.time(),
            "stream": "stderr"
        })

    return entries


class SessionState:
    def __init__(self, conversation_id: str):
        self.conversation_id: str = conversation_id
        self.status: str = "idle"  # idle, running, completed, error, aborted
        self.is_generating: bool = False
        self.prompt: str = ""
        self.model: str = ""
        self.start_time: float = 0.0
        self.end_time: float = 0.0
        self.seq: int = 0
        self.task: Optional[asyncio.Task] = None
        self.event_buffer: deque[Dict[str, Any]] = deque(maxlen=2000)
        self.terminal_logs: deque[Dict[str, Any]] = deque(maxlen=2000)
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.active_pid: Optional[int] = None

    def add_event(self, event: Dict[str, Any]) -> int:
        self.seq += 1
        event_copy = dict(event)
        event_copy["seq"] = self.seq
        if "timestamp" not in event_copy:
            event_copy["timestamp"] = time.time()
        self.event_buffer.append(event_copy)

        # If it's a cli_log or tool/step event, also record to terminal_logs
        ev_type = event.get("event") or event.get("type")
        if ev_type == "cli_log":
            self.terminal_logs.append({
                "level": event.get("level", "info"),
                "type": event.get("type", "cli_log"),
                "label": event.get("label", "Terminal Output"),
                "content": event.get("content") or event.get("message", ""),
                "message": event.get("message", ""),
                "timestamp": event_copy["timestamp"],
                "stream": event.get("stream", "stdout"),
                "seq": self.seq,
            })
        elif ev_type == "tool":
            tool_name = event.get("tool_name", "tool")
            summary = event.get("summary", "")
            state = event.get("state", "ACTIVE")
            self.terminal_logs.append({
                "level": "exec",
                "type": "tool_call",
                "label": f"Tool Execution: {tool_name}",
                "content": f"{tool_name} › {summary}" if summary else f"Running {tool_name} ({state})",
                "message": f"[STEP {self.seq}] ⚡ {tool_name} › {summary}" if summary else f"[STEP {self.seq}] ⚡ Running {tool_name}",
                "timestamp": event_copy["timestamp"],
                "seq": self.seq,
            })
        elif ev_type == "result":
            dur = event.get("duration_seconds", 0)
            status_str = event.get("status", "SUCCESS")
            self.terminal_logs.append({
                "level": "result",
                "type": "result",
                "label": "Turn Result",
                "content": f"Finished in {dur:.1f}s ({status_str})",
                "message": f"[RESULT] Finished in {dur:.1f}s ({status_str})",
                "timestamp": event_copy["timestamp"],
                "seq": self.seq,
            })
        elif ev_type == "error":
            err_msg = event.get('error', 'Unknown execution error')
            self.terminal_logs.append({
                "level": "error",
                "type": "error",
                "label": "Execution Error",
                "content": err_msg,
                "message": f"[ERROR] {err_msg}",
                "timestamp": event_copy["timestamp"],
                "seq": self.seq,
            })
        elif ev_type in ("aborted", "cancelled"):
            self.terminal_logs.append({
                "level": "warning",
                "type": "warning",
                "label": "Execution Stopped",
                "content": "Turn was stopped by user",
                "message": "[ABORTED] Turn was stopped by user",
                "timestamp": event_copy["timestamp"],
                "seq": self.seq,
            })

        return self.seq

    def get_events_since(self, since_seq: int = 0) -> List[Dict[str, Any]]:
        if since_seq <= 0:
            return list(self.event_buffer)
        return [e for e in self.event_buffer if e.get("seq", 0) > since_seq]

    def get_terminal_logs_since(self, since_seq: int = 0) -> List[Dict[str, Any]]:
        if since_seq <= 0:
            return list(self.terminal_logs)
        return [l for l in self.terminal_logs if l.get("seq", 0) > since_seq]


class SessionManager:
    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

    def get_or_create(self, conversation_id: str) -> SessionState:
        if conversation_id not in self._sessions:
            self._sessions[conversation_id] = SessionState(conversation_id)
        return self._sessions[conversation_id]

    def get_session(self, conversation_id: str) -> Optional[SessionState]:
        return self._sessions.get(conversation_id)

    async def start_turn(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        mode: Optional[str] = None,
        cwd: Optional[str] = None,
    ) -> Tuple[SessionState, asyncio.Task]:
        """
        Starts an autonomous background execution turn for a conversation.
        Decoupled from client WebSocket lifecycles so disconnection never terminates the turn.
        """
        async with self._lock:
            temp_key = conversation_id or f"temp_{int(time.time() * 1000)}"
            session = self.get_or_create(temp_key)

            # If already running, return existing task
            if session.is_generating and session.task and not session.task.done():
                return session, session.task

            session.status = "running"
            session.is_generating = True
            session.prompt = prompt
            session.model = model or settings.default_model
            session.start_time = time.time()
            session.result = None
            session.error = None

            # Add initial invocation log
            session.add_event({
                "event": "cli_log",
                "conversation_id": temp_key,
                "level": "info",
                "message": f"🚀 Invoking agy (model: {session.model}, mode: {mode or settings.default_mode})",
                "timestamp": time.time(),
            })

            # Start background execution task
            task = asyncio.create_task(
                self._run_execution(
                    session=session,
                    temp_key=temp_key,
                    prompt=prompt,
                    conversation_id=conversation_id,
                    model=model,
                    effort=effort,
                    mode=mode,
                    cwd=cwd,
                )
            )
            session.task = task
            return session, task

    async def _run_execution(
        self,
        session: SessionState,
        temp_key: str,
        prompt: str,
        conversation_id: Optional[str],
        model: Optional[str],
        effort: Optional[str],
        mode: Optional[str],
        cwd: Optional[str],
    ) -> None:
        current_conv_id = conversation_id or temp_key

        try:
            async for event in engine.execute_turn(
                prompt=prompt,
                conversation_id=conversation_id,
                model=model,
                effort=effort,
                mode=mode,
                cwd=cwd,
            ):
                ev_type = event.get("event")

                # If init arrived, re-index session with the real conversation_id
                if ev_type == "init":
                    real_conv_id = event.get("conversation_id")
                    if real_conv_id and real_conv_id != current_conv_id:
                        async with self._lock:
                            self._sessions[real_conv_id] = session
                            session.conversation_id = real_conv_id
                            if temp_key in self._sessions and temp_key != real_conv_id:
                                del self._sessions[temp_key]
                            # Transfer any WebSocket listeners from temp_key to real_conv_id
                            web_channel.migrate_clients(temp_key, real_conv_id)
                            current_conv_id = real_conv_id

                # Record sequence and append to buffer
                event["conversation_id"] = current_conv_id
                session.add_event(event)

                # Broadcast to all connected clients for this conversation
                await web_channel.broadcast(current_conv_id, event)

                if ev_type == "result":
                    session.result = event
                    session.status = "completed"
                    session.is_generating = False

                elif ev_type == "error":
                    session.error = event.get("error")
                    session.status = "error"
                    session.is_generating = False

                elif ev_type == "cancelled":
                    session.status = "aborted"
                    session.is_generating = False

        except asyncio.CancelledError:
            session.status = "aborted"
            session.is_generating = False
            abort_ev = {
                "event": "aborted",
                "conversation_id": current_conv_id,
                "message": "Turn was aborted."
            }
            session.add_event(abort_ev)
            await web_channel.broadcast(current_conv_id, abort_ev)

        except Exception as e:
            session.status = "error"
            session.error = str(e)
            session.is_generating = False
            err_ev = {
                "event": "error",
                "conversation_id": current_conv_id,
                "error": str(e)
            }
            session.add_event(err_ev)
            await web_channel.broadcast(current_conv_id, err_ev)

        finally:
            session.is_generating = False
            session.end_time = time.time()

    async def abort_turn(self, conversation_id: str) -> bool:
        """Aborts an active turn execution for a conversation."""
        session = self._sessions.get(conversation_id)
        aborted = await engine.abort(conversation_id)
        if session:
            session.status = "aborted"
            session.is_generating = False
            if session.task and not session.task.done():
                session.task.cancel()
            abort_ev = {
                "event": "aborted",
                "conversation_id": conversation_id,
                "message": "Turn was aborted by user."
            }
            session.add_event(abort_ev)
            await web_channel.broadcast(conversation_id, abort_ev)
            return True
        return aborted

    def get_session_state(self, conversation_id: str, last_seq: int = 0) -> Dict[str, Any]:
        """
        Returns full synchronization state for a selected conversation tab.
        Includes live status, buffer delta since last_seq, and terminal logs.
        """
        session = self._sessions.get(conversation_id)

        # Check if an external process is running for this conversation
        is_external_running = False
        external_pid = None
        for p in process_manager.list_processes():
            if p.get("conversation_id") == conversation_id and (p.get("state") == "R" or p.get("state") == "S"):
                is_external_running = True
                external_pid = p.get("pid")
                break

        if session:
            events = session.get_events_since(last_seq)
            terminal_logs = session.get_terminal_logs_since(last_seq if last_seq > 0 else 0)

            # If no terminal logs in memory yet, read from disk
            if not terminal_logs and not session.is_generating:
                terminal_logs = extract_terminal_history_from_disk(conversation_id, limit=120)

            return {
                "type": "session_state",
                "conversation_id": conversation_id,
                "status": session.status if not is_external_running else "running",
                "is_generating": session.is_generating or is_external_running,
                "model": session.model,
                "prompt": session.prompt,
                "uptime_seconds": (time.time() - session.start_time) if session.is_generating else 0,
                "last_seq": session.seq,
                "events": events[-100:] if last_seq == 0 else events,
                "terminal_logs": terminal_logs[-150:],
                "pid": session.active_pid or external_pid,
            }
        else:
            # Idle session (or running externally)
            history_logs = extract_terminal_history_from_disk(conversation_id, limit=120)
            return {
                "type": "session_state",
                "conversation_id": conversation_id,
                "status": "running" if is_external_running else "idle",
                "is_generating": is_external_running,
                "model": "default",
                "prompt": "",
                "uptime_seconds": 0,
                "last_seq": 0,
                "events": [],
                "terminal_logs": history_logs,
                "pid": external_pid,
            }

    def get_terminal_history(self, conversation_id: str, limit: int = 150) -> List[Dict[str, Any]]:
        """Returns terminal logs for a conversation from memory or disk."""
        session = self._sessions.get(conversation_id)
        if session and session.terminal_logs:
            return list(session.terminal_logs)[-limit:]
        return extract_terminal_history_from_disk(conversation_id, limit=limit)


session_manager = SessionManager()
