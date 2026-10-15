from __future__ import annotations
import asyncio
import json
import os
import re
import signal
import time
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional, Any
from app.config import settings


class AgentEngine:
    def __init__(self, agy_bin: Optional[str] = None):
        self.agy_bin = agy_bin or settings.agy_bin
        self._active_processes: Dict[str, asyncio.subprocess.Process] = {}
        self._active_pids: Dict[int, str] = {}
        self._locks: Dict[str, asyncio.Lock] = {}

    def _get_lock(self, conversation_id: str) -> asyncio.Lock:
        if conversation_id not in self._locks:
            self._locks[conversation_id] = asyncio.Lock()
        return self._locks[conversation_id]

    async def get_available_models(self) -> List[Dict[str, str]]:
        """Fetch available models from `agy models`."""
        try:
            proc = await asyncio.create_subprocess_exec(
                self.agy_bin, "models",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            output = stdout.decode("utf-8", errors="ignore")
            
            # Lines format: "gemini-3.8-flash-high     Gemini 3.8 Flash (High)"
            models: List[Dict[str, str]] = []
            for line in output.splitlines():
                line = re.sub(r"^[⠋⠙⠹⠸⠼⠴⠦⠧]\s+Fetching available models\.\.\.", "", line).strip()
                if not line:
                    continue
                parts = line.split(maxsplit=1)
                if len(parts) == 2:
                    model_id, model_name = parts[0].strip(), parts[1].strip()
                    models.append({"id": model_id, "name": model_name})
                elif len(parts) == 1:
                    models.append({"id": parts[0].strip(), "name": parts[0].strip()})
            
            if not models:
                # Fallback models if parsing returns empty
                return [
                    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
                    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
                    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)"},
                    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6 (Thinking)"},
                    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 (Thinking)"},
                    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"},
                ]
            return models
        except Exception as e:
            print(f"Error fetching models: {e}")
            return [
                {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
                {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
            ]

    def _extract_tool_summary(self, tool_name: str, tool_info: Dict[str, Any]) -> str:
        params = tool_info.get("parameters") if isinstance(tool_info, dict) else {}
        if not isinstance(params, dict):
            return tool_name

        if tool_name == "run_command" and params.get("CommandLine"):
            return f"{params['CommandLine']}"
        if tool_name in ("view_file", "write_to_file", "replace_file_content", "sed_file") and params.get("AbsolutePath"):
            return f"{params['AbsolutePath']}"
        if params.get("TargetFile"):
            return f"{params['TargetFile']}"
        if params.get("toolAction"):
            return f"{params['toolAction']}"
        if params.get("toolSummary"):
            return f"{params['toolSummary']}"
        if params.get("query"):
            return f"{params['query']}"
        if params.get("Url"):
            return f"{params['Url']}"

        for key in ("command", "path", "file", "name"):
            if key in params:
                return f"{params[key]}"
        return tool_name

    async def execute_turn(
        self,
        prompt: str,
        conversation_id: Optional[str] = None,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        mode: Optional[str] = None,
        cwd: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Executes a prompt turn with `agy` and streams standardized events + live CLI logs.
        """
        # Determine parameters with fallback to settings
        selected_model = model or settings.default_model
        selected_effort = effort or settings.default_effort
        selected_mode = mode or settings.default_mode
        selected_cwd = cwd or settings.default_cwd

        cmd: List[str] = [
            self.agy_bin,
            "-p", prompt,
            "--output-format", "stream-json",
        ]

        if settings.dangerously_skip_permissions:
            cmd.append("--dangerously-skip-permissions")

        if conversation_id:
            cmd.extend(["--conversation", conversation_id])

        if selected_model:
            cmd.extend(["--model", selected_model])

        if selected_effort:
            has_effort_in_name = any(
                selected_model.endswith(f"-{eff}")
                for eff in ["low", "medium", "high", "max", "thinking"]
            )
            if not has_effort_in_name:
                cmd.extend(["--effort", selected_effort])

        if selected_mode:
            cmd.extend(["--mode", selected_mode])

        if selected_cwd and os.path.isdir(selected_cwd):
            cmd.extend(["--add-dir", selected_cwd])

        # Generate a temporary key if conversation_id is not yet known
        session_key = conversation_id or f"temp_{id(prompt)}"
        lock = self._get_lock(session_key)

        async with lock:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=selected_cwd if (selected_cwd and os.path.isdir(selected_cwd)) else (
                        settings.default_cwd if (settings.default_cwd and os.path.isdir(settings.default_cwd)) else str(Path.home())
                    )
                )
                self._active_processes[session_key] = proc
                if proc.pid:
                    self._active_pids[proc.pid] = session_key
                current_conv_id = conversation_id

                # Broadcast initial invocation log
                yield {
                    "event": "cli_log",
                    "conversation_id": current_conv_id,
                    "stream": "stdout",
                    "level": "info",
                    "message": f"🚀 Invoking agy (model: {selected_model}, mode: {selected_mode})",
                    "timestamp": time.time(),
                }

                # Concurrent reader for stdout and stderr
                queue: asyncio.Queue[tuple[bool, Optional[str]]] = asyncio.Queue()

                async def read_stream(stream, is_stderr: bool):
                    try:
                        while True:
                            line_bytes = await stream.readline()
                            if not line_bytes:
                                break
                            line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
                            if line:
                                await queue.put((is_stderr, line))
                    except Exception:
                        pass
                    finally:
                        await queue.put((is_stderr, None))

                stdout_task = asyncio.create_task(read_stream(proc.stdout, False))
                stderr_task = asyncio.create_task(read_stream(proc.stderr, True))

                active_streams = 2
                while active_streams > 0:
                    is_stderr, line = await queue.get()
                    if line is None:
                        active_streams -= 1
                        continue

                    if is_stderr:
                        lvl = "warning" if "warning:" in line.lower() else "error"
                        yield {
                            "event": "cli_log",
                            "conversation_id": current_conv_id,
                            "stream": "stderr",
                            "level": lvl,
                            "message": f"[STDERR] {line}",
                            "timestamp": time.time(),
                        }
                        continue

                    # Non-JSON or warning line on stdout
                    if not (line.startswith("{") and line.endswith("}")):
                        lvl = "warning" if "warning:" in line.lower() else ("error" if "error:" in line.lower() else "info")
                        yield {
                            "event": "cli_log",
                            "conversation_id": current_conv_id,
                            "stream": "stdout",
                            "level": lvl,
                            "message": f"[CLI] {line}",
                            "timestamp": time.time(),
                        }
                        if "warning:" in line or "error:" in line:
                            yield {"event": "warning", "message": line}
                        continue

                    try:
                        raw = json.loads(line)
                    except json.JSONDecodeError:
                        yield {
                            "event": "cli_log",
                            "conversation_id": current_conv_id,
                            "stream": "stdout",
                            "level": "info",
                            "message": f"[RAW] {line}",
                            "timestamp": time.time(),
                        }
                        continue

                    event_type = raw.get("event")

                    if event_type == "init":
                        init_conv_id = raw.get("conversation_id")
                        if init_conv_id:
                            current_conv_id = init_conv_id
                            self._active_processes[init_conv_id] = proc

                        tools = raw.get("init", {}).get("tools", [])
                        yield {
                            "event": "cli_log",
                            "conversation_id": current_conv_id,
                            "stream": "stdout",
                            "level": "info",
                            "message": f"[INIT] Session {current_conv_id[:8] if current_conv_id else ''} ready • {len(tools)} tools available",
                            "timestamp": time.time(),
                        }
                        yield {
                            "event": "init",
                            "conversation_id": current_conv_id,
                            "init": raw.get("init", {}),
                            "model": selected_model,
                        }

                    elif event_type == "step_update":
                        step = raw.get("step_update", {})
                        step_type = step.get("step_type")
                        state = step.get("state")
                        step_index = step.get("step_index")

                        if step_type == "agent_response":
                            text_delta = step.get("text_delta", "")
                            duration = step.get("duration_seconds")
                            usage = step.get("usage")

                            if duration or usage:
                                out_tok = usage.get("output_tokens", 0) if usage else 0
                                think_tok = usage.get("thinking_tokens", 0) if usage else 0
                                dur_str = f"{duration:.1f}s" if duration else ""
                                yield {
                                    "event": "cli_log",
                                    "conversation_id": current_conv_id,
                                    "stream": "stdout",
                                    "level": "step",
                                    "message": f"[STEP {step_index}] Model response generated ({dur_str} • {out_tok} out, {think_tok} thinking tokens)",
                                    "timestamp": time.time(),
                                }

                            yield {
                                "event": "agent_response",
                                "conversation_id": current_conv_id,
                                "step_index": step_index,
                                "state": state,
                                "delta": text_delta,
                                "duration_seconds": duration,
                                "usage": usage,
                            }

                        elif step_type == "tool":
                            tool_name = step.get("tool_name", "")
                            tool_info = step.get("tool_info", {})
                            duration = step.get("duration_seconds")
                            summary = self._extract_tool_summary(tool_name, tool_info)

                            if state == "ACTIVE":
                                yield {
                                    "event": "cli_log",
                                    "conversation_id": current_conv_id,
                                    "stream": "stdout",
                                    "level": "exec",
                                    "message": f"[STEP {step_index}] ⚡ Running {tool_name} › {summary}",
                                    "timestamp": time.time(),
                                }
                            elif state == "DONE":
                                dur_str = f" in {duration:.2f}s" if duration else ""
                                yield {
                                    "event": "cli_log",
                                    "conversation_id": current_conv_id,
                                    "stream": "stdout",
                                    "level": "done",
                                    "message": f"[STEP {step_index}] ✔ Finished {tool_name}{dur_str}",
                                    "timestamp": time.time(),
                                }

                            yield {
                                "event": "tool",
                                "conversation_id": current_conv_id,
                                "step_index": step_index,
                                "state": state,
                                "tool_name": tool_name,
                                "tool_info": tool_info,
                                "summary": summary,
                                "duration_seconds": duration,
                            }

                        elif step_type == "user_input":
                            yield {
                                "event": "cli_log",
                                "conversation_id": current_conv_id,
                                "stream": "stdout",
                                "level": "info",
                                "message": f"[STEP {step_index}] Prompt ingested by agent",
                                "timestamp": time.time(),
                            }
                            yield {
                                "event": "step_update",
                                "conversation_id": current_conv_id,
                                "raw": step
                            }

                        else:
                            yield {
                                "event": "step_update",
                                "conversation_id": current_conv_id,
                                "raw": step
                            }

                    elif event_type == "result":
                        res = raw.get("result", {})
                        dur = res.get("duration_seconds", 0)
                        usage = res.get("usage", {})
                        tot_tok = usage.get("total_tokens", 0)
                        status_str = res.get("status", "SUCCESS")
                        yield {
                            "event": "cli_log",
                            "conversation_id": current_conv_id,
                            "stream": "stdout",
                            "level": "result",
                            "message": f"[RESULT] Finished in {dur:.1f}s • {tot_tok:,} total tokens ({status_str})",
                            "timestamp": time.time(),
                        }
                        yield {
                            "event": "result",
                            "conversation_id": current_conv_id,
                            "status": status_str,
                            "response": res.get("response", ""),
                            "error": res.get("error"),
                            "duration_seconds": dur,
                            "num_turns": res.get("num_turns"),
                            "usage": usage,
                        }

                # Ensure reader tasks finish
                await stdout_task
                await stderr_task

                # Wait for process exit
                return_code = await proc.wait()
                if return_code != 0:
                    yield {
                        "event": "cli_log",
                        "conversation_id": current_conv_id,
                        "stream": "stderr",
                        "level": "error",
                        "message": f"agy process exited with code {return_code}",
                        "timestamp": time.time(),
                    }
                    if proc.stderr:
                        stderr_bytes = await proc.stderr.read()
                        err_msg = stderr_bytes.decode("utf-8", errors="replace").strip()
                        if err_msg:
                            yield {
                                "event": "error",
                                "conversation_id": current_conv_id,
                                "error": f"agy exited with code {return_code}: {err_msg}"
                            }

            except asyncio.CancelledError:
                # Cancel requested
                if session_key in self._active_processes:
                    proc = self._active_processes[session_key]
                    try:
                        proc.terminate()
                        await asyncio.sleep(0.2)
                        if proc.returncode is None:
                            proc.kill()
                    except ProcessLookupError:
                        pass
                yield {
                    "event": "cancelled",
                    "conversation_id": current_conv_id,
                    "message": "Turn was aborted."
                }
                raise

            except Exception as e:
                yield {
                    "event": "error",
                    "conversation_id": current_conv_id,
                    "error": str(e)
                }

            finally:
                self._active_processes.pop(session_key, None)
                if current_conv_id:
                    self._active_processes.pop(current_conv_id, None)
                if proc and proc.pid:
                    self._active_pids.pop(proc.pid, None)

    async def abort(self, conversation_id: str) -> bool:
        """Aborts an ongoing execution for a conversation."""
        proc = self._active_processes.get(conversation_id)
        if proc and proc.returncode is None:
            try:
                proc.send_signal(signal.SIGINT)
                await asyncio.sleep(0.3)
                if proc.returncode is None:
                    proc.terminate()
                return True
            except ProcessLookupError:
                return False
        return False


engine = AgentEngine()
