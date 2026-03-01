"""
API: генерация workflow, запуск (в т.ч. стриминг), сохранение workflow, webhook,
     экспорт в Python + Telegram-бот (запуск / логи / стоп).
Запуск: uvicorn api.main:app --reload --port 8000
"""
from pathlib import Path
if (Path(__file__).resolve().parent.parent / ".env").exists():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import io
import json
import os
import subprocess
import sys
import threading
import zipfile
from typing import AsyncGenerator

import httpx

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from generate_workflow import generate_workflow_from_prompt, normalize_workflow
from prompts import COPILOT_SYSTEM, EDIT_WORKFLOW_CONTEXT
from executor import run_workflow, run_workflow_stream
from workflows_store import (
    create as wf_create,
    list_workflows as wf_list,
    get as wf_get,
    update as wf_update,
    delete as wf_delete,
)
from openai import OpenAI

# ---------------------------------------------------------------------------
# Bot runner state (module-level singleton for MVP)
# ---------------------------------------------------------------------------
_bot_process: subprocess.Popen | None = None
_bot_logs: list[str] = []
_bot_logs_lock = threading.Lock()
_bot_dir = Path(__file__).resolve().parent.parent / "tmp" / "bot"
_bot_pid_file = _bot_dir / "bot.pid"


def _kill_pid_if_running(pid: int) -> None:
    """Send SIGKILL to a PID if the process is alive."""
    import signal
    try:
        os.kill(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _kill_all_bot_processes() -> None:
    """Kill every python process whose cwd is our bot directory (handles all orphans)."""
    import signal
    bot_dir_str = str(_bot_dir.resolve())
    try:
        result = subprocess.run(
            ["ps", "-axo", "pid=,args="],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            try:
                pid = int(parts[0])
            except ValueError:
                continue
            # Match: process running main.py in our bot dir
            # Check via lsof if process cwd matches
            if "main.py" not in parts[1]:
                continue
            try:
                cwd_result = subprocess.run(
                    ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
                    capture_output=True, text=True
                )
                if bot_dir_str in cwd_result.stdout:
                    os.kill(pid, signal.SIGKILL)
            except Exception:
                pass
    except Exception:
        pass

    # Also kill via PID file
    try:
        if _bot_pid_file.exists():
            pid = int(_bot_pid_file.read_text().strip())
            _kill_pid_if_running(pid)
            _bot_pid_file.unlink(missing_ok=True)
    except Exception:
        pass


def _save_bot_pid(pid: int) -> None:
    _bot_dir.mkdir(parents=True, exist_ok=True)
    _bot_pid_file.write_text(str(pid))


def _read_bot_output() -> None:
    """Background thread: reads subprocess stdout and appends to _bot_logs."""
    global _bot_process
    if _bot_process is None or _bot_process.stdout is None:
        return
    try:
        for raw_line in _bot_process.stdout:
            line = raw_line.rstrip()
            with _bot_logs_lock:
                _bot_logs.append(line)
    except Exception:
        pass


# Kill any orphaned bot from a previous backend session on startup
_kill_all_bot_processes()


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Workflow API", version="0.4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class GenerateWorkflowRequest(BaseModel):
    prompt: str


class GenerateWorkflowResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]


class RunWorkflowRequest(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    input: str = ""


class ExportPythonRequest(BaseModel):
    nodes: list[dict]
    edges: list[dict]


class RunBotRequest(BaseModel):
    files: dict[str, str]


class WorkflowCreateRequest(BaseModel):
    name: str = "Без названия"
    nodes: list[dict]
    edges: list[dict]


class WorkflowUpdateRequest(BaseModel):
    name: str | None = None
    nodes: list[dict] | None = None
    edges: list[dict] | None = None


# ---------------------------------------------------------------------------
# Workflow generation & execution
# ---------------------------------------------------------------------------

@app.post("/api/generate-workflow", response_model=GenerateWorkflowResponse)
async def generate_workflow_api(body: GenerateWorkflowRequest):
    result = generate_workflow_from_prompt(body.prompt or "Простой агент-ассистент")
    return GenerateWorkflowResponse(nodes=result["nodes"], edges=result["edges"])


@app.post("/api/run-workflow")
async def run_workflow_api(body: RunWorkflowRequest):
    try:
        out = run_workflow(body.nodes, body.edges, body.input or "")
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/run-workflow-stream")
async def run_workflow_stream_api(body: RunWorkflowRequest):
    try:
        def gen():
            for chunk in run_workflow_stream(body.nodes, body.edges, body.input or ""):
                yield f"data: {chunk}\n\n"
        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Workflow CRUD
# ---------------------------------------------------------------------------

@app.get("/api/workflows")
async def list_workflows_api():
    return wf_list()


@app.post("/api/workflows")
async def create_workflow_api(body: WorkflowCreateRequest):
    return wf_create(body.name, body.nodes, body.edges)


@app.get("/api/workflows/{wf_id}")
async def get_workflow_api(wf_id: str):
    wf = wf_get(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return wf


@app.put("/api/workflows/{wf_id}")
async def update_workflow_api(wf_id: str, body: WorkflowUpdateRequest):
    wf = wf_update(wf_id, body.name, body.nodes, body.edges)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return wf


@app.delete("/api/workflows/{wf_id}")
async def delete_workflow_api(wf_id: str):
    if not wf_delete(wf_id):
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

class WebhookBody(BaseModel):
    input: str = ""


@app.post("/api/trigger/{wf_id}")
async def webhook_trigger_api(wf_id: str, body: WebhookBody = Body(default=WebhookBody())):
    wf = wf_get(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    try:
        out = run_workflow(wf["nodes"], wf["edges"], (body.input or "").strip())
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Chat & edit-workflow
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = []
    welcome: str = ""


def _chat_reply(messages: list[dict], system_prefix: str) -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key or not api_key.strip():
        return "Настройте DEEPSEEK_API_KEY для диалога."
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    system = (system_prefix or "").strip() or COPILOT_SYSTEM
    msgs = [{"role": "system", "content": system}]
    for m in messages:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            msgs.append({"role": m["role"], "content": m["content"]})
    if not any(m.get("role") == "user" for m in messages):
        return "Опишите, какой агент или сценарий вам нужен."
    try:
        r = client.chat.completions.create(model="deepseek-chat", messages=msgs, max_tokens=1024)
        return (r.choices[0].message.content or "").strip()
    except Exception as e:
        return f"Ошибка: {e}"


@app.post("/api/chat")
async def chat_api(body: ChatRequest):
    reply = _chat_reply([m.model_dump() for m in body.messages], body.welcome)
    return {"reply": reply}


class EditWorkflowRequest(BaseModel):
    current_nodes: list[dict]
    current_edges: list[dict]
    user_request: str
    chat_history: list[ChatMessage] = []


class EditWorkflowResponse(BaseModel):
    nodes: list[dict]
    edges: list[dict]
    explanation: str
    changed: bool = True


@app.post("/api/edit-workflow", response_model=EditWorkflowResponse)
async def edit_workflow_api(body: EditWorkflowRequest):
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key or not api_key.strip():
        return EditWorkflowResponse(
            nodes=body.current_nodes,
            edges=body.current_edges,
            explanation="DEEPSEEK_API_KEY не настроен. Изменения не внесены."
        )

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    workflow_json = json.dumps({"nodes": body.current_nodes, "edges": body.current_edges},
                               ensure_ascii=False, indent=2)
    messages = [
        {"role": "system", "content": EDIT_WORKFLOW_CONTEXT},
        {"role": "user", "content": (
            f"Текущий workflow:\n```json\n{workflow_json}\n```\n\n"
            f"Запрос пользователя: {body.user_request}\n\n"
            "Верни ПОЛНЫЙ обновлённый workflow (ВСЕ ноды, включая существующие и новые) в JSON."
        )},
    ]
    try:
        resp = client.chat.completions.create(model="deepseek-chat", messages=messages, max_tokens=4000)
        text = (resp.choices[0].message.content or "").strip()

        import re
        if "```" in text:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
            if match:
                text = match.group(1).strip()

        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        text = text[start:i + 1]
                        break

        result = json.loads(text)
        raw_nodes = result.get("nodes")
        raw_edges = result.get("edges")
        explanation = result.get("explanation", "Workflow обновлён.")

        if not raw_nodes or not isinstance(raw_nodes, list):
            return EditWorkflowResponse(
                nodes=body.current_nodes, edges=body.current_edges,
                explanation=explanation or "Workflow не изменён.", changed=False,
            )

        normalized = normalize_workflow(raw_nodes, raw_edges or [], relayout=False)
        out_nodes = normalized["nodes"]
        out_edges = normalized["edges"]

        if not out_nodes:
            return EditWorkflowResponse(
                nodes=body.current_nodes, edges=body.current_edges,
                explanation="Не удалось нормализовать workflow. Текущий сохранён.", changed=False,
            )

        return EditWorkflowResponse(nodes=out_nodes, edges=out_edges, explanation=explanation, changed=True)

    except Exception as e:
        return EditWorkflowResponse(
            nodes=body.current_nodes, edges=body.current_edges,
            explanation=f"Ошибка при редактировании: {str(e)}. Текущий workflow сохранён.", changed=False,
        )


# ---------------------------------------------------------------------------
# Export to Python
# ---------------------------------------------------------------------------

@app.post("/api/export-python")
async def export_python(body: ExportPythonRequest):
    """Generate Python project from workflow graph. Returns {files: {name: content}}."""
    try:
        from generator.graph_to_python import generate_files
        files = generate_files(body.nodes, body.edges)
        return JSONResponse({"files": files})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


@app.post("/api/download-zip")
async def download_zip(body: dict):
    """Create and return a zip archive of the provided files dict."""
    files: dict[str, str] = body.get("files", {})
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=bot.zip"},
    )


# ---------------------------------------------------------------------------
# Bot runner
# ---------------------------------------------------------------------------

@app.post("/api/run-bot")
async def run_bot_api(body: RunBotRequest):
    """Save generated files and launch the Telegram bot as a subprocess."""
    import asyncio

    global _bot_process, _bot_logs

    # 1. Kill current in-memory process
    if _bot_process is not None and _bot_process.poll() is None:
        _bot_process.terminate()
        try:
            await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, _bot_process.wait),
                timeout=3,
            )
        except asyncio.TimeoutError:
            _bot_process.kill()

    # 2. Kill any orphan from previous backend sessions (via PID file)
    _kill_all_bot_processes()

    # 3. Claim the Telegram polling session to evict any stale getUpdates
    #    connection (even from processes we can't see in ps).
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if tg_token:
        try:
            resp = httpx.get(
                f"https://api.telegram.org/bot{tg_token}/getUpdates",
                params={"limit": 0, "timeout": 0},
                timeout=8,
            )
            # 200 = session claimed; 409 = we terminated someone, then retry once
            if resp.status_code == 409:
                await asyncio.sleep(1)
                httpx.get(
                    f"https://api.telegram.org/bot{tg_token}/getUpdates",
                    params={"limit": 0, "timeout": 0},
                    timeout=8,
                )
        except Exception:
            pass
        # Brief pause so Telegram registers the session as free
        await asyncio.sleep(1)

    # 4. Write project files
    _bot_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in body.files.items():
        target = _bot_dir / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    # 5. Write .env with actual tokens (never exposed in generated code)
    ds_key = os.getenv("DEEPSEEK_API_KEY", "")
    (_bot_dir / ".env").write_text(
        f"TELEGRAM_BOT_TOKEN={tg_token}\nDEEPSEEK_API_KEY={ds_key}\n",
        encoding="utf-8",
    )

    with _bot_logs_lock:
        _bot_logs.clear()

    # 6. Launch bot using the current Python interpreter (same venv)
    _bot_process = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=str(_bot_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    # 7. Persist PID so we can kill it on next backend restart
    _save_bot_pid(_bot_process.pid)

    # 8. Background thread reads output
    t = threading.Thread(target=_read_bot_output, daemon=True)
    t.start()

    return {"ok": True, "pid": _bot_process.pid}


@app.get("/api/bot-logs")
async def bot_logs_sse():
    """SSE stream of bot stdout/stderr logs."""
    import asyncio

    async def generate() -> AsyncGenerator[str, None]:
        sent = 0
        max_idle = 300  # seconds with no new lines before giving up
        idle = 0

        while True:
            with _bot_logs_lock:
                snapshot = list(_bot_logs)

            while sent < len(snapshot):
                line = snapshot[sent]
                yield f"data: {json.dumps({'line': line})}\n\n"
                sent += 1
                idle = 0

            # Check if process has ended and all logs sent
            if _bot_process is not None and _bot_process.poll() is not None and sent >= len(snapshot):
                yield f"data: {json.dumps({'line': '[Бот остановлен]', 'done': True})}\n\n"
                break

            await asyncio.sleep(0.25)
            idle += 0.25
            if idle > max_idle:
                break

            # Keepalive comment every ~15s
            if int(idle * 4) % 60 == 0:
                yield ": keepalive\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/stop-bot")
async def stop_bot_api():
    """Terminate the running bot subprocess."""
    import asyncio

    global _bot_process

    _kill_all_bot_processes()  # also kill any orphan

    if _bot_process is None or _bot_process.poll() is not None:
        with _bot_logs_lock:
            _bot_logs.append("[Бот остановлен]")
        return {"ok": True, "message": "Бот остановлен"}

    _bot_process.terminate()
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, lambda: _bot_process.wait(5))
    except subprocess.TimeoutExpired:
        _bot_process.kill()

    with _bot_logs_lock:
        _bot_logs.append("[Бот остановлен]")

    return {"ok": True, "message": "Бот остановлен"}


@app.get("/api/bot-status")
async def bot_status_api():
    """Return current bot process status."""
    if _bot_process is None:
        return {"running": False, "pid": None}
    running = _bot_process.poll() is None
    return {"running": running, "pid": _bot_process.pid if running else None}
