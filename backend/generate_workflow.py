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

VALID_NODE_TYPES = {"trigger", "agent", "http", "knowledge", "condition", "action", "code"}

WORKFLOW_JSON_SCHEMA = """Ты генерируешь JSON для визуального редактора workflow. Ответь ТОЛЬКО валидным JSON, без markdown и без текста.

Типы нод: "trigger", "agent", "http", "knowledge", "condition".

Формат: {"nodes": [...], "edges": [...]}

Каждая нода: "id", "type", "position" ({"x","y"}), "data" (объект):
- trigger: "label", "triggerType": "manual"
- agent: "label", "model": "deepseek-chat", "systemPrompt": подробное описание роли
- http: "label", "method", "url"
- knowledge: "label", "documents" (массив строк с полезным текстом) или "url"
- condition: "label", "condition": "not_empty" или "contains(текст)"

Каждое ребро: "id", "source", "target", "sourceHandle", "targetHandle".

ТОПОЛОГИЯ:
- Основная цепочка: trigger → [http|condition] → agent (targetHandle: "input")
- Knowledge подключается ПАРАЛЛЕЛЬНО к agent через targetHandle: "context" (НЕ в основную цепочку)
- sourceHandle: "output" (для condition: "true")

ПОЗИЦИИ (шаг 280px):
- trigger: x=80, y=200
- http/condition: x=360, y=200
- agent: x=640, y=200 (или x=360 если нет промежуточных)
- knowledge: x такой же как agent, y=80 (НАД агентом)

Пример минимальный (trigger + agent):
{"nodes":[{"id":"trigger-1","type":"trigger","position":{"x":80,"y":200},"data":{"label":"Старт","triggerType":"manual"}},{"id":"agent-1","type":"agent","position":{"x":360,"y":200},"data":{"label":"Ассистент","model":"deepseek-chat","systemPrompt":"Ты полезный ассистент. Отвечай кратко и по делу."}}],"edges":[{"id":"e1","source":"trigger-1","target":"agent-1","sourceHandle":"output","targetHandle":"input"}]}

Пример с knowledge (параллельное подключение):
{"nodes":[{"id":"trigger-1","type":"trigger","position":{"x":80,"y":200},"data":{"label":"Старт","triggerType":"manual"}},{"id":"knowledge-1","type":"knowledge","position":{"x":360,"y":80},"data":{"label":"База знаний","documents":["Текст документа..."]}},{"id":"agent-1","type":"agent","position":{"x":360,"y":200},"data":{"label":"Эксперт","model":"deepseek-chat","systemPrompt":"Ты эксперт. Используй контекст из базы знаний."}}],"edges":[{"id":"e1","source":"trigger-1","target":"agent-1","sourceHandle":"output","targetHandle":"input"},{"id":"e2","source":"knowledge-1","target":"agent-1","sourceHandle":"output","targetHandle":"context"}]}
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
            max_tokens=2500,
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
        result = normalize_workflow(nodes, edges, relayout=True)
        if not result["nodes"]:
            return _stub_workflow()
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise RuntimeError(f"Ошибка генерации workflow: {e}") from e


def normalize_workflow(nodes: list, edges: list, *, relayout: bool = False) -> dict:
    """
    Нормализация workflow: валидация нод/рёбер, гарантия handles,
    при relayout=True — пересчёт позиций для ровной раскладки.
    Используется и при генерации, и при редактировании.
    """
    if not nodes or not isinstance(nodes, list):
        return {"nodes": [], "edges": []}

    node_ids: set[str] = set()
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
            if ntype == "trigger":
                n["position"] = {"x": 80, "y": 200}
            elif ntype == "knowledge":
                n["position"] = {"x": 360, "y": 80}
            elif ntype in ("http", "condition"):
                n["position"] = {"x": 360, "y": 200}
            else:
                n["position"] = {"x": 640, "y": 200}
        else:
            n["position"] = {
                "x": int(n["position"].get("x", 80)),
                "y": int(n["position"].get("y", 200))
            }
        if "data" not in n or not isinstance(n["data"], dict):
            n["data"] = {}
        n["data"]["label"] = n["data"].get("label") or ntype
        if ntype == "agent" and "model" not in n["data"]:
            n["data"]["model"] = "deepseek-chat"

    nodes = [n for n in nodes if isinstance(n, dict) and n.get("id") and n.get("type")]
    if not nodes:
        return {"nodes": [], "edges": []}

    nodes_by_id = {n["id"]: n for n in nodes}
    valid_ids = set(nodes_by_id.keys())
    edges = [e for e in (edges or []) if isinstance(e, dict) and e.get("source") in valid_ids and e.get("target") in valid_ids]

    for i, e in enumerate(edges):
        if not e.get("id"):
            e["id"] = f"e{i+1}"

    if relayout:
        trigger_node = next((n for n in nodes if n["type"] == "trigger"), None)
        agent_nodes = [n for n in nodes if n["type"] == "agent"]
        knowledge_nodes = [n for n in nodes if n["type"] == "knowledge"]
        main_middle = [n for n in nodes if n["type"] not in ("trigger", "agent", "knowledge")]
        main_middle.sort(key=lambda n: n.get("position", {}).get("x", 0))

        first_agent = agent_nodes[0] if agent_nodes else None
        chain = []
        if trigger_node:
            chain.append(trigger_node)
        chain.extend(main_middle)
        if first_agent and first_agent not in chain:
            chain.append(first_agent)

        step_x = 280
        for idx, node in enumerate(chain):
            node["position"] = {"x": 80 + step_x * idx, "y": 200}

        if first_agent:
            agent_x = first_agent["position"]["x"]
            for ki, kn in enumerate(knowledge_nodes):
                kn["position"] = {"x": agent_x, "y": 80 - ki * 120}

        for i in range(len(chain) - 1):
            source = chain[i]
            target = chain[i + 1]
            existing = any(
                e.get("source") == source["id"] and e.get("target") == target["id"]
                for e in edges
            )
            if not existing:
                source_type = source.get("type", "")
                edges.append({
                    "id": f"e{len(edges) + 1}",
                    "source": source["id"],
                    "target": target["id"],
                    "sourceHandle": "true" if source_type == "condition" else "output",
                    "targetHandle": "input",
                })

        if first_agent:
            for kn in knowledge_nodes:
                existing = any(
                    e.get("source") == kn["id"] and e.get("target") == first_agent["id"]
                    for e in edges
                )
                if not existing:
                    edges.append({
                        "id": f"e{len(edges) + 1}",
                        "source": kn["id"],
                        "target": first_agent["id"],
                        "sourceHandle": "output",
                        "targetHandle": "context",
                    })

    # Убираем рёбра knowledge -> не-agent
    nodes_by_id = {n["id"]: n for n in nodes}
    def _is_valid_edge(e):
        src = nodes_by_id.get(e.get("source", ""))
        tgt = nodes_by_id.get(e.get("target", ""))
        if not src or not tgt:
            return False
        if src.get("type") == "knowledge" and tgt.get("type") != "agent":
            return False
        return True
    edges = [e for e in edges if _is_valid_edge(e)]

    # Нормализуем handles
    for e in edges:
        source_node = nodes_by_id.get(e.get("source", ""), {})
        target_node = nodes_by_id.get(e.get("target", ""), {})
        source_type = source_node.get("type", "")
        target_type = target_node.get("type", "")

        if source_type == "knowledge" and target_type == "agent":
            e["targetHandle"] = "context"
        elif "targetHandle" not in e:
            e["targetHandle"] = "input"

        if "sourceHandle" not in e or e.get("sourceHandle") is None:
            if source_type == "condition":
                e["sourceHandle"] = "true"
            else:
                e["sourceHandle"] = "output"

    return {"nodes": nodes, "edges": edges}


def _stub_workflow() -> dict:
    return {
        "nodes": [
            {"id": "trigger-1", "type": "trigger", "position": {"x": 80, "y": 200}, "data": {"label": "Триггер", "triggerType": "manual"}},
            {"id": "agent-1", "type": "agent", "position": {"x": 360, "y": 200}, "data": {"label": "Агент", "model": "deepseek-chat", "systemPrompt": "Ты полезный ассистент. Отвечай кратко по делу."}},
        ],
        "edges": [
            {"id": "e1", "source": "trigger-1", "target": "agent-1", "sourceHandle": "output", "targetHandle": "input"},
        ],
    }
