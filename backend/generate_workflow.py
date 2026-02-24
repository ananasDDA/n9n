"""
Генерация графа workflow по промпту пользователя через DeepSeek API (OpenAI-совместимый).
Вызывается после нажатия Build: в промпте приходят запрос пользователя и контекст из чата с копайлотом.
"""
import json
import os
import re
from openai import OpenAI

from prompts import GENERATE_WORKFLOW_CONTEXT

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"

VALID_NODE_TYPES = {"trigger", "agent", "http", "knowledge", "condition"}

WORKFLOW_JSON_SCHEMA = """Ты генерируешь JSON для визуального редактора workflow в приложении Workflow Editor. Ответь ТОЛЬКО валидным JSON, без markdown и без текста до или после.

Доступны типы нод: "trigger", "agent", "http", "knowledge", "condition".

Формат: один объект с ключами "nodes" и "edges".

"nodes" — массив. Каждый элемент: "id" (строка, например "trigger-1", "agent-1", "http-1"), "type" (строка: trigger, agent, http, knowledge или condition), "position" (объект с числами "x" и "y"), "data" (объект):
- trigger: "label", "triggerType": "manual" (для MVP только manual).
- agent: "label", "model": "deepseek-chat", "systemPrompt": описание роли агента.
- http: "label", "method", "url". knowledge: "label", "url" или "documents" (массив строк). condition: "label", "condition": "not_empty" или "contains(текст)".

"edges" — массив. Каждый элемент: "id" (строка), "source" (id ноды), "target" (id ноды). Цепочка: trigger → agent или trigger → http → agent и т.д.

Правила:
- Первая нода — всегда type: "trigger", дальше хотя бы одна "agent".
- Можно добавить ноду "http" (например для вызова API перед агентом).
- position.x: 80, 280, 480... (шаг 200), position.y: 120.

Пример минимального ответа:
{"nodes":[{"id":"trigger-1","type":"trigger","position":{"x":80,"y":120},"data":{"label":"Старт","triggerType":"manual"}},{"id":"agent-1","type":"agent","position":{"x":280,"y":120},"data":{"label":"Агент","model":"deepseek-chat","systemPrompt":"Ты полезный ассистент."}}],"edges":[{"id":"e1","source":"trigger-1","target":"agent-1"}]}
"""


def generate_workflow_from_prompt(prompt: str) -> dict:
    """
    Возвращает { "nodes": [...], "edges": [...] } для редактора.
    При отсутствии DEEPSEEK_API_KEY возвращает заглушку.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key or not api_key.strip():
        return _stub_workflow()

    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
    user_message = f"{GENERATE_WORKFLOW_CONTEXT}\n\nЗапрос и контекст из чата:\n{prompt}\n\nСгенерируй workflow (nodes + edges) в формате JSON по инструкции выше."

    try:
        resp = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": WORKFLOW_JSON_SCHEMA},
                {"role": "user", "content": user_message},
            ],
            max_tokens=1500,
        )
        text = (resp.choices[0].message.content or "").strip()
        # Убрать markdown-обёртку
        if "```" in text:
            match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
            if match:
                text = match.group(1).strip()
        # Вырезать первый JSON-объект (на случай текста до/после)
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        text = text[start : i + 1]
                        break
        data = json.loads(text)
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])
        if not nodes or not isinstance(nodes, list):
            return _stub_workflow()
        # Нормализация и валидация нод
        node_ids = set()
        for i, n in enumerate(nodes):
            if not isinstance(n, dict):
                continue
            nid = n.get("id") or f"node-{i+1}"
            if nid in node_ids:
                nid = f"{nid}-{i}"
            node_ids.add(nid)
            n["id"] = nid
            ntype = (n.get("type") or "agent").lower()
            if ntype not in VALID_NODE_TYPES:
                ntype = "agent" if i > 0 else "trigger"
            n["type"] = ntype
            if "position" not in n or not isinstance(n["position"], dict):
                n["position"] = {"x": 80 + i * 200, "y": 120}
            n["position"] = {"x": int(n["position"].get("x", 80 + i * 200)), "y": int(n["position"].get("y", 120))}
            if "data" not in n or not isinstance(n["data"], dict):
                n["data"] = {}
            n["data"]["label"] = n["data"].get("label") or ntype
            if ntype == "agent" and "model" not in n["data"]:
                n["data"]["model"] = "deepseek-chat"
        # Оставить только валидные ноды
        nodes = [n for n in nodes if isinstance(n, dict) and n.get("id") and n.get("type")]
        if not nodes:
            return _stub_workflow()
        # Нормализация рёбер
        valid_ids = {n["id"] for n in nodes}
        edges = [e for e in (edges or []) if isinstance(e, dict) and e.get("source") in valid_ids and e.get("target") in valid_ids]
        for i, e in enumerate(edges):
            if not e.get("id"):
                e["id"] = f"e{i+1}"
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Ошибка генерации workflow: {e}") from e


def _stub_workflow() -> dict:
    return {
        "nodes": [
            {"id": "trigger-1", "type": "trigger", "position": {"x": 80, "y": 120}, "data": {"label": "Триггер", "triggerType": "manual"}},
            {"id": "agent-1", "type": "agent", "position": {"x": 280, "y": 120}, "data": {"label": "Агент", "model": "deepseek-chat", "systemPrompt": "Ты полезный ассистент. Отвечай кратко по делу."}},
        ],
        "edges": [
            {"id": "e1", "source": "trigger-1", "target": "agent-1"},
        ],
    }
