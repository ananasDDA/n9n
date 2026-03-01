"""
API: генерация workflow, запуск (в т.ч. стриминг), сохранение workflow, webhook.
Запуск: uvicorn api.main:app --reload --port 8000
"""
from pathlib import Path
if (Path(__file__).resolve().parent.parent / ".env").exists():
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from generate_workflow import generate_workflow_from_prompt, normalize_workflow
from prompts import COPILOT_SYSTEM, EDIT_WORKFLOW_CONTEXT
from executor import run_workflow, run_workflow_stream
from workflows_store import create as wf_create, list_workflows as wf_list, get as wf_get, update as wf_update, delete as wf_delete
import json
import os
from openai import OpenAI

app = FastAPI(title="Workflow API", version="0.3.0")

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


class WorkflowCreateRequest(BaseModel):
    name: str = "Без названия"
    nodes: list[dict]
    edges: list[dict]


class WorkflowUpdateRequest(BaseModel):
    name: str | None = None
    nodes: list[dict] | None = None
    edges: list[dict] | None = None


@app.post("/api/generate-workflow", response_model=GenerateWorkflowResponse)
async def generate_workflow(body: GenerateWorkflowRequest):
    """По описанию (промпт) вернуть граф workflow. Использует OpenAI, если задан OPENAI_API_KEY."""
    result = generate_workflow_from_prompt(body.prompt or "Простой агент-ассистент")
    return GenerateWorkflowResponse(nodes=result["nodes"], edges=result["edges"])


@app.post("/api/run-workflow")
async def run_workflow_api(body: RunWorkflowRequest):
    """Выполнить workflow: вход — текст пользователя, выход — ответ последней ноды."""
    try:
        out = run_workflow(body.nodes, body.edges, body.input or "")
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/run-workflow-stream")
async def run_workflow_stream_api(body: RunWorkflowRequest):
    """Выполнить workflow со стримингом ответа агента (SSE)."""
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


@app.get("/api/workflows")
async def list_workflows_api():
    """Список сохранённых workflow."""
    return wf_list()


@app.post("/api/workflows")
async def create_workflow_api(body: WorkflowCreateRequest):
    """Создать и сохранить workflow."""
    wf = wf_create(body.name, body.nodes, body.edges)
    return wf


@app.get("/api/workflows/{wf_id}")
async def get_workflow_api(wf_id: str):
    """Получить workflow по id."""
    wf = wf_get(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return wf


@app.put("/api/workflows/{wf_id}")
async def update_workflow_api(wf_id: str, body: WorkflowUpdateRequest):
    """Обновить workflow."""
    wf = wf_update(wf_id, body.name, body.nodes, body.edges)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return wf


@app.delete("/api/workflows/{wf_id}")
async def delete_workflow_api(wf_id: str):
    """Удалить workflow."""
    if not wf_delete(wf_id):
        raise HTTPException(status_code=404, detail="Workflow не найден")
    return {"ok": True}


class WebhookBody(BaseModel):
    input: str = ""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = []
    welcome: str = ""


def _chat_reply(messages: list[dict], system_prefix: str) -> str:
    import os
    from openai import OpenAI
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
        r = client.chat.completions.create(
            model="deepseek-chat",
            messages=msgs,
            max_tokens=1024,
        )
        return (r.choices[0].message.content or "").strip()
    except Exception as e:
        return f"Ошибка: {e}"


@app.post("/api/chat")
async def chat_api(body: ChatRequest):
    """Чат для уточнения задачи перед созданием проекта. Возвращает ответ ИИ."""
    reply = _chat_reply([m.model_dump() for m in body.messages], body.welcome)
    return {"reply": reply}


@app.post("/api/trigger/{wf_id}")
async def webhook_trigger_api(wf_id: str, body: WebhookBody = Body(default=WebhookBody())):
    """Webhook: запустить сохранённый workflow. body.input — вход (или пустая строка)."""
    wf = wf_get(wf_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow не найден")
    user_input = (body.input or "").strip()
    try:
        out = run_workflow(wf["nodes"], wf["edges"], user_input)
        return out
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export-python")
async def export_python(body: ExportPythonRequest):
    """По графу сгенерировать Python-проект + Dockerfile. Позже."""
    raise HTTPException(status_code=501, detail="Export to Python will be implemented in Phase 3")


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
    """Редактирование workflow через чат: AI видит текущий граф и вносит изменения по запросу."""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key or not api_key.strip():
        return EditWorkflowResponse(
            nodes=body.current_nodes,
            edges=body.current_edges,
            explanation="DEEPSEEK_API_KEY не настроен. Изменения не внесены."
        )

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    workflow_json = json.dumps({
        "nodes": body.current_nodes,
        "edges": body.current_edges
    }, ensure_ascii=False, indent=2)

    messages = [
        {"role": "system", "content": EDIT_WORKFLOW_CONTEXT},
        {"role": "user", "content": f"Текущий workflow:\n```json\n{workflow_json}\n```\n\nЗапрос пользователя: {body.user_request}\n\nВерни ПОЛНЫЙ обновлённый workflow (ВСЕ ноды, включая существующие и новые) в JSON."}
    ]

    try:
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            max_tokens=4000,
        )
        text = (resp.choices[0].message.content or "").strip()

        if "```" in text:
            import re
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
                nodes=body.current_nodes,
                edges=body.current_edges,
                explanation=explanation if explanation else "Workflow не изменён.",
                changed=False,
            )

        normalized = normalize_workflow(raw_nodes, raw_edges or [], relayout=False)
        out_nodes = normalized["nodes"]
        out_edges = normalized["edges"]

        if not out_nodes:
            return EditWorkflowResponse(
                nodes=body.current_nodes,
                edges=body.current_edges,
                explanation="Не удалось нормализовать workflow. Текущий сохранён.",
                changed=False,
            )

        return EditWorkflowResponse(
            nodes=out_nodes,
            edges=out_edges,
            explanation=explanation,
            changed=True,
        )
    except Exception as e:
        return EditWorkflowResponse(
            nodes=body.current_nodes,
            edges=body.current_edges,
            explanation=f"Ошибка при редактировании: {str(e)}. Текущий workflow сохранён.",
            changed=False,
        )
