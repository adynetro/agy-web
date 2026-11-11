from __future__ import annotations
import time
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CronJobCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of the scheduled cron job")
    description: Optional[str] = Field(default="", max_length=500, description="Optional description of the job")
    cron_expression: str = Field(default="0 8 * * *", description="Standard 5-field cron expression")
    prompt: str = Field(..., min_length=1, description="Prompt or instruction for the agent to execute")
    model: Optional[str] = Field(default=None, description="Optional model to use (default: global setting)")
    mode: Optional[str] = Field(default="yolo", description="Agent mode (e.g. yolo, standard)")
    effort: Optional[str] = Field(default=None, description="Reasoning effort (e.g. low, medium, high)")
    target_type: str = Field(default="new", description="Target session strategy: 'new', 'dedicated', or 'existing'")
    target_conversation_id: Optional[str] = Field(default=None, description="Target conversation ID when target_type is 'existing'")
    notify_channels: List[str] = Field(default_factory=list, description="Channels to notify upon completion (e.g. web, telegram, discord)")
    enabled: bool = Field(default=True, description="Whether this schedule is active")
    timeout_seconds: int = Field(default=600, ge=30, le=7200, description="Max execution duration in seconds")


class CronJobUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    cron_expression: Optional[str] = None
    prompt: Optional[str] = Field(default=None, min_length=1)
    model: Optional[str] = None
    mode: Optional[str] = None
    effort: Optional[str] = None
    target_type: Optional[str] = None
    target_conversation_id: Optional[str] = None
    notify_channels: Optional[List[str]] = None
    enabled: Optional[bool] = None
    timeout_seconds: Optional[int] = Field(default=None, ge=30, le=7200)


class CronRunRecord(BaseModel):
    run_id: str = Field(default_factory=lambda: f"run_{uuid.uuid4().hex[:10]}")
    job_id: str
    job_name: str
    started_at: float = Field(default_factory=time.time)
    finished_at: Optional[float] = None
    duration_seconds: Optional[float] = None
    status: str = "running"  # "running", "success", "failed", "timeout", "aborted"
    conversation_id: Optional[str] = None
    prompt: str
    output_snippet: Optional[str] = None
    error: Optional[str] = None


class CronJob(BaseModel):
    id: str = Field(default_factory=lambda: f"cron_{uuid.uuid4().hex[:8]}")
    name: str
    description: str = ""
    cron_expression: str = "0 8 * * *"
    prompt: str
    model: Optional[str] = None
    mode: Optional[str] = "yolo"
    effort: Optional[str] = None
    target_type: str = "new"  # "new", "dedicated", "existing"
    target_conversation_id: Optional[str] = None
    notify_channels: List[str] = Field(default_factory=list)
    enabled: bool = True
    timeout_seconds: int = 600
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    last_run_at: Optional[float] = None
    last_status: str = "idle"  # "idle", "running", "success", "failed", "timeout"
    last_duration_seconds: Optional[float] = None
    last_error: Optional[str] = None
    last_conversation_id: Optional[str] = None
    next_run_at: Optional[float] = None
    run_count: int = 0
