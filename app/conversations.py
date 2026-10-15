from __future__ import annotations
import glob
import json
import os
import re
import shutil
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

HOME_DIR = Path.home()
CLI_DIR = Path(os.environ.get("AGY_CLI_DIR", HOME_DIR / ".gemini" / "antigravity-cli"))
DB_PATH = Path(os.environ.get("AGY_DB_PATH", CLI_DIR / "conversation_summaries.db"))
BRAIN_DIR = Path(os.environ.get("AGY_BRAIN_DIR", CLI_DIR / "brain"))
CONVERSATIONS_DIR = Path(os.environ.get("AGY_CONVERSATIONS_DIR", CLI_DIR / "conversations"))
DELETED_CONVERSATIONS_FILE = Path(os.environ.get("AGY_DELETED_FILE", CLI_DIR / "deleted_conversations.json"))


def clean_user_content(raw_text: str) -> str:
    """Extract clean user request text from the logged prompt envelope."""
    match = re.search(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw_text.strip()


class ConversationManager:
    def __init__(
        self,
        db_path: Path = DB_PATH,
        brain_dir: Path = BRAIN_DIR,
        conversations_dir: Path = CONVERSATIONS_DIR,
        deleted_file: Path = DELETED_CONVERSATIONS_FILE,
    ):
        self.db_path = db_path
        self.brain_dir = brain_dir
        self.conversations_dir = conversations_dir
        self.deleted_file = deleted_file

    def _load_deleted_ids(self) -> Set[str]:
        if not self.deleted_file.exists():
            return set()
        try:
            with open(self.deleted_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data) if isinstance(data, list) else set()
        except Exception:
            return set()

    def _save_deleted_ids(self, ids: Set[str]) -> None:
        try:
            self.deleted_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.deleted_file, "w", encoding="utf-8") as f:
                json.dump(sorted(list(ids)), f, indent=2)
        except Exception as e:
            print(f"Error saving deleted conversation IDs: {e}")

    def get_conversation_title(self, conversation_id: str) -> Optional[str]:
        """Fetch title for a specific conversation."""
        summary = self._get_db_summary(conversation_id)
        if summary and summary.get("title"):
            return summary["title"]
        hist = self.get_conversation_history(conversation_id)
        if hist and hist.get("title"):
            return hist["title"]
        return None

    def list_conversations(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List past conversations with titles, timestamps, and step counts."""
        if not self.db_path.exists():
            return []

        deleted_ids = self._load_deleted_ids()
        results: List[Dict[str, Any]] = []
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            c = conn.cursor()

            # Ensure any conversations previously deleted are cleaned up from summaries DB
            if deleted_ids:
                placeholders = ",".join(["?"] * len(deleted_ids))
                c.execute(
                    f"DELETE FROM conversation_summaries WHERE conversation_id IN ({placeholders})",
                    list(deleted_ids),
                )
                conn.commit()

            c.execute(
                """
                SELECT conversation_id, title, preview, step_count, last_modified_time, status
                FROM conversation_summaries
                ORDER BY last_modified_time DESC
                LIMIT ?
                """,
                (limit + len(deleted_ids),)
            )
            for row in c.fetchall():
                conv_id, title, preview, step_count, last_mod, status = row
                if conv_id in deleted_ids:
                    continue
                results.append({
                    "id": conv_id,
                    "title": title or preview or "Untitled Conversation",
                    "preview": preview or "",
                    "step_count": step_count or 0,
                    "updated_at": last_mod or "",
                    "status": status or "",
                })
                if len(results) >= limit:
                    break
            conn.close()
        except Exception as e:
            print(f"Error querying conversation summaries: {e}")

        return results

    def get_conversation_history(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        Reads and structures the transcript steps for a given conversation.
        """
        deleted_ids = self._load_deleted_ids()
        if conversation_id in deleted_ids:
            return None

        log_file = self.brain_dir / conversation_id / ".system_generated" / "logs" / "transcript.jsonl"
        if not log_file.exists():
            # Check if conversation exists in db
            summary = self._get_db_summary(conversation_id)
            if summary:
                return {
                    "id": conversation_id,
                    "title": summary.get("title", "Conversation"),
                    "messages": [],
                    "updated_at": summary.get("updated_at", ""),
                }
            return None

        messages: List[Dict[str, Any]] = []
        pending_tool_calls: Dict[int, Dict[str, Any]] = {}

        total_input = 0
        total_output = 0
        total_thinking = 0
        total_cache_read = 0

        try:
            with open(log_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        step = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    step_type = step.get("type")
                    source = step.get("source")
                    step_index = step.get("step_index", len(messages))
                    created_at = step.get("created_at", "")

                    if step_type == "USER_INPUT":
                        raw_content = step.get("content", "")
                        clean_text = clean_user_content(raw_content)
                        messages.append({
                            "role": "user",
                            "step_index": step_index,
                            "content": clean_text,
                            "timestamp": created_at,
                        })

                    elif step_type == "PLANNER_RESPONSE":
                        content = step.get("content", "")
                        thinking = step.get("thinking", "")
                        tool_calls_raw = step.get("tool_calls", [])
                        input_tokens = step.get("input_tokens", 0) or 0
                        output_tokens = step.get("output_tokens", 0) or 0
                        cache_read_tokens = step.get("cache_read_tokens", 0) or 0
                        thinking_tokens = step.get("thinking_tokens", 0) or 0

                        total_input += input_tokens
                        total_output += output_tokens
                        total_cache_read += cache_read_tokens
                        total_thinking += thinking_tokens

                        parsed_tools: List[Dict[str, Any]] = []
                        for tc in tool_calls_raw:
                            t_name = tc.get("name", "")
                            t_args = tc.get("args", {})
                            # Args may be string-encoded in JSON
                            clean_args = {}
                            if isinstance(t_args, dict):
                                for k, v in t_args.items():
                                    if isinstance(v, str) and (v.startswith('"') and v.endswith('"')):
                                        clean_args[k] = v[1:-1]
                                    else:
                                        clean_args[k] = v
                            else:
                                clean_args = t_args

                            tool_item = {
                                "name": t_name,
                                "args": clean_args,
                                "output": None,
                            }
                            parsed_tools.append(tool_item)
                            # Record pending to match with subsequent GENERIC step
                            pending_tool_calls[step_index] = tool_item

                        if messages and messages[-1].get("role") == "assistant":
                            last_msg = messages[-1]
                            if content:
                                if last_msg.get("content"):
                                    last_msg["content"] += "\n" + content
                                else:
                                    last_msg["content"] = content
                            if thinking:
                                if last_msg.get("thinking"):
                                    last_msg["thinking"] += "\n" + thinking
                                else:
                                    last_msg["thinking"] = thinking
                            if parsed_tools:
                                last_msg["tool_calls"].extend(parsed_tools)
                            if "usage" in last_msg and isinstance(last_msg["usage"], dict):
                                last_msg["usage"]["input_tokens"] += input_tokens
                                last_msg["usage"]["output_tokens"] += output_tokens
                                last_msg["usage"]["thinking_tokens"] += thinking_tokens
                                last_msg["usage"]["cache_read_tokens"] += cache_read_tokens
                        else:
                            messages.append({
                                "role": "assistant",
                                "step_index": step_index,
                                "content": content,
                                "thinking": thinking,
                                "tool_calls": parsed_tools,
                                "usage": {
                                    "input_tokens": input_tokens,
                                    "output_tokens": output_tokens,
                                    "thinking_tokens": thinking_tokens,
                                    "cache_read_tokens": cache_read_tokens,
                                },
                                "timestamp": created_at,
                            })

                    elif step_type == "GENERIC":
                        # Tool execution output
                        tool_output = step.get("content", "")
                        # Find the last assistant message with tool calls that lacks output
                        for msg in reversed(messages):
                            if msg.get("role") == "assistant" and msg.get("tool_calls"):
                                for tc in msg["tool_calls"]:
                                    if tc.get("output") is None:
                                        tc["output"] = tool_output
                                        break
                                break

            summary = self._get_db_summary(conversation_id)
            title = summary.get("title") if summary else "Conversation"

            return {
                "id": conversation_id,
                "title": title or "Conversation",
                "messages": messages,
                "updated_at": summary.get("updated_at") if summary else "",
                "usage": {
                    "input_tokens": total_input,
                    "output_tokens": total_output,
                    "thinking_tokens": total_thinking,
                    "cache_read_tokens": total_cache_read,
                    "total_tokens": total_input + total_output,
                }
            }

        except Exception as e:
            print(f"Error parsing transcript for {conversation_id}: {e}")
            return None

    def _get_db_summary(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        if not self.db_path.exists():
            return None
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            c = conn.cursor()
            c.execute(
                """
                SELECT title, preview, step_count, last_modified_time, status
                FROM conversation_summaries
                WHERE conversation_id = ?
                """,
                (conversation_id,)
            )
            row = c.fetchone()
            conn.close()
            if row:
                title, preview, step_count, last_mod, status = row
                return {
                    "title": title or preview or "Untitled Conversation",
                    "preview": preview,
                    "step_count": step_count,
                    "updated_at": last_mod,
                    "status": status,
                }
        except Exception:
            pass
        return None

    def delete_conversation(self, conversation_id: str) -> bool:
        """Permanently removes a conversation record from SQLite, brain logs, conversation files, and records tombstone."""
        try:
            deleted_ids = self._load_deleted_ids()
            deleted_ids.add(conversation_id)
            self._save_deleted_ids(deleted_ids)

            # 1. Remove from SQLite summaries DB
            if self.db_path.exists():
                try:
                    conn = sqlite3.connect(str(self.db_path), timeout=5.0)
                    c = conn.cursor()
                    c.execute("DELETE FROM conversation_summaries WHERE conversation_id = ?", (conversation_id,))
                    conn.commit()
                    conn.close()
                except Exception as e:
                    print(f"Error deleting conversation {conversation_id} from db: {e}")

            # 2. Remove conversation files (.db, .db-shm, .db-wal)
            if self.conversations_dir.exists():
                for p in self.conversations_dir.glob(f"{conversation_id}.db*"):
                    try:
                        p.unlink(missing_ok=True)
                    except Exception as e:
                        print(f"Error deleting file {p}: {e}")

            # 3. Remove brain directory & transcripts
            brain_path = self.brain_dir / conversation_id
            if brain_path.exists():
                try:
                    shutil.rmtree(brain_path, ignore_errors=True)
                except Exception as e:
                    print(f"Error deleting brain dir {brain_path}: {e}")

            return True
        except Exception as e:
            print(f"Error permanently deleting conversation {conversation_id}: {e}")
            return False


conv_manager = ConversationManager()
