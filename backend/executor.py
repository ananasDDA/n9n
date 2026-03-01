"""
Выполнение workflow: граф (nodes + edges) → выполнение шагов.
Поддержка: trigger, agent (LLM с провайдерами DeepSeek/Ollama/OpenAI), http, knowledge (RAG-контекст), condition (простая проверка), tools в промпте агента.
Стриминг ответа агента через run_workflow_stream.
"""
from collections import defaultdict
import json
import os
import re
import httpx
from openai import OpenAI

# Провайдеры LLM
DEEPSEEK_BASE = "https://api.deepseek.com"
OLLAMA_BASE = "http://localhost:11434/v1"
OPENAI_BASE = "https://api.openai.com/v1"

DEFAULT_MODEL = "deepseek-chat"


def _get_client(provider: str, base_url: str | None, api_key: str | None):
    """Возвращает OpenAI-совместимый клиент для провайдера (deepseek, ollama, openai)."""
    provider = (provider or "deepseek").lower().strip()
    base = (base_url or "").strip() or None
    key = (api_key or "").strip()

    if provider == "ollama":
        return OpenAI(base_url=OLLAMA_BASE, api_key="ollama")
    if provider == "openai":
        key = key or os.environ.get("OPENAI_API_KEY")
        return OpenAI(api_key=key or "sk-", base_url=base or OPENAI_BASE)
    # deepseek
    key = key or os.environ.get("DEEPSEEK_API_KEY")
    return OpenAI(api_key=key or "sk-", base_url=base or DEEPSEEK_BASE)


def _topological_order(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Ноды в порядке выполнения (линейный обход; ветвление condition пока не разбивает цепочку)."""
    by_id = {n["id"]: n for n in nodes}
    in_degree = defaultdict(int)
    out_edges = defaultdict(list)
    for e in edges:
        out_edges[e["source"]].append(e["target"])
        in_degree[e["target"]] += 1
    for n in nodes:
        if n["id"] not in in_degree:
            in_degree[n["id"]] = 0
    queue = [nid for nid, d in in_degree.items() if d == 0]
    order = []
    while queue:
        nid = queue.pop(0)
        order.append(by_id[nid])
        for target in out_edges[nid]:
            in_degree[target] -= 1
            if in_degree[target] == 0:
                queue.append(target)
    return order if len(order) == len(nodes) else nodes


def validate_workflow(nodes: list[dict], edges: list[dict]) -> None:
    if not nodes:
        raise ValueError("Граф пуст: нет нод")
    by_id = {n.get("id") for n in nodes if n.get("id")}
    if len(by_id) != len([n for n in nodes if n.get("id")]):
        raise ValueError("Дубликаты id нод")
    types = {n.get("type") for n in nodes if n.get("type")}
    if "trigger" not in types:
        raise ValueError("Нужна хотя бы одна нода типа trigger")
    if "agent" not in types:
        raise ValueError("Нужна хотя бы одна нода типа agent")
    for e in edges or []:
        s, t = e.get("source"), e.get("target")
        if s not in by_id or t not in by_id:
            raise ValueError(f"Ребро ссылается на несуществующую ноду: {s} -> {t}")


def _eval_condition(condition: str, current: str) -> bool:
    """Простая проверка: contains(текст), empty, not_empty."""
    c = (condition or "").strip().lower()
    cur = current or ""
    if c == "empty" or c == "пусто":
        return not cur.strip()
    if c == "not_empty" or c == "not empty":
        return bool(cur.strip())
    m = re.match(r"contains\((.+)\)", c)
    if m:
        return m.group(1).strip() in cur
    return bool(cur.strip())


def _get_connected_knowledge(node_id: str, edges: list[dict], nodes_by_id: dict, steps_outputs: dict[str, str]) -> list[str]:
    """Собирает контент из Knowledge нод, подключенных к агенту через context handle."""
    context_parts = []
    for e in edges:
        if e.get("target") == node_id and e.get("targetHandle") == "context":
            source_id = e.get("source")
            source_node = nodes_by_id.get(source_id)
            if source_node and source_node.get("type") == "knowledge":
                content = steps_outputs.get(source_id, "")
                if content:
                    context_parts.append(content[:8000])
    return context_parts


def _run_node(node: dict, current: str, steps_outputs: dict[str, str], edges: list[dict], nodes_by_id: dict) -> tuple[str, bool | None]:
    """Выполняет одну ноду. Возвращает (output, condition_result | None)."""
    nid = node["id"]
    ntype = node.get("type", "action")
    data = node.get("data") or {}

    if ntype == "trigger":
        return (current or "(нет входа)", None)

    if ntype == "knowledge":
        docs = data.get("documents")
        if isinstance(docs, list) and docs:
            return ("\n\n".join(str(d) for d in docs), None)
        url = (data.get("url") or "").strip()
        if url:
            try:
                with httpx.Client(timeout=15.0, follow_redirects=True) as h:
                    r = h.get(url, headers={"User-Agent": "Mozilla/5.0"})
                    if r.status_code == 200:
                        text = r.text
                        text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
                        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
                        text = re.sub(r'<[^>]+>', ' ', text)
                        text = re.sub(r'\s+', ' ', text).strip()
                        return (text[:15000] if text else "[Пустой документ]", None)
                    else:
                        return (f"[Ошибка HTTP {r.status_code}]", None)
            except Exception as e:
                return (f"[Ошибка загрузки URL: {e}]", None)
        search_query = data.get("label") or data.get("description") or "general knowledge"
        try:
            wiki_text = _fetch_wikipedia(search_query)
            if wiki_text:
                return (wiki_text[:15000], None)
        except Exception:
            pass
        return ("[Нет данных для knowledge. Добавьте URL или текст документов.]", None)

    if ntype == "agent":
        provider = (data.get("provider") or "deepseek").strip() or "deepseek"
        base_url = (data.get("baseUrl") or data.get("base_url") or "").strip() or None
        api_key = (data.get("apiKey") or data.get("api_key") or "").strip()
        model = (data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
        system = (data.get("systemPrompt") or "Ты полезный ассистент.").strip()
        tools_config = data.get("tools") or []
        if isinstance(tools_config, str):
            try:
                tools_config = json.loads(tools_config)
            except (json.JSONDecodeError, TypeError):
                tools_config = []
        if not isinstance(tools_config, list):
            tools_config = []
        context_parts = _get_connected_knowledge(nid, edges, nodes_by_id, steps_outputs)
        if context_parts:
            system = system + "\n\nКонтекст из базы знаний:\n" + "\n---\n".join(context_parts)
        if tools_config:
            tools_desc = []
            for t in tools_config:
                name = t.get("name") or t.get("url") or "tool"
                desc = t.get("description") or t.get("url") or ""
                tools_desc.append(f"- {name}: {desc}")
            system = system + "\n\nДоступные инструменты:\n" + "\n".join(tools_desc)
        client = _get_client(provider, base_url, api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": current or "Привет!"},
            ],
            max_tokens=1024,
        )
        return ((resp.choices[0].message.content or "").strip(), None)

    if ntype == "http":
        method = (data.get("method") or "GET").upper()
        url = (data.get("url") or "").strip()
        if not url:
            return ("[HTTP: URL не задан]", None)
        with httpx.Client(timeout=30.0) as h:
            if method in ("POST", "PUT", "PATCH") and current:
                s = current.strip()
                if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
                    try:
                        r = h.request(method, url, json=json.loads(s))
                    except (json.JSONDecodeError, TypeError):
                        r = h.request(method, url, content=current)
                else:
                    r = h.request(method, url, content=current)
            else:
                r = h.request(method, url)
        return (r.text[:2000] if r.text else str(r.status_code), None)

    if ntype == "condition":
        cond = (data.get("condition") or "not_empty").strip()
        res = _eval_condition(cond, current)
        return ("true" if res else "false", res)

    if ntype in ("action", "code"):
        return (current, None)

    return (current, None)


def _fetch_wikipedia(query: str) -> str | None:
    """Загружает summary из Wikipedia по запросу (сначала ru, потом en)."""
    try:
        wiki_apis = [
            "https://ru.wikipedia.org/w/api.php",
            "https://en.wikipedia.org/w/api.php",
        ]
        params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": 1,
        }
        with httpx.Client(timeout=10.0) as h:
            for search_url in wiki_apis:
                r = h.get(search_url, params=params)
                data = r.json()
                search_results = data.get("query", {}).get("search", [])
                if not search_results:
                    continue
                title = search_results[0]["title"]
                summary_params = {
                    "action": "query",
                    "prop": "extracts",
                    "exintro": True,
                    "explaintext": True,
                    "titles": title,
                    "format": "json",
                }
                r = h.get(search_url, params=summary_params)
                data = r.json()
                pages = data.get("query", {}).get("pages", {})
                for page in pages.values():
                    extract = page.get("extract", "")
                    if extract:
                        return f"Source: Wikipedia - {title}\n\n{extract}"
        return None
    except Exception:
        return None


def run_workflow(nodes: list[dict], edges: list[dict], user_input: str = "") -> dict:
    validate_workflow(nodes, edges)
    steps = []
    current = user_input or ""
    by_id = {n["id"]: n for n in nodes}
    steps_outputs: dict[str, str] = {}

    for node in _topological_order(nodes, edges):
        nid = node["id"]
        ntype = node.get("type", "action")
        try:
            result = _run_node(node, current, steps_outputs, edges, by_id)
            if result is None:
                raise RuntimeError(f"_run_node returned None for {ntype} node {nid}")
            step_out, _ = result
        except Exception as e:
            steps.append({"nodeId": nid, "type": ntype, "error": str(e)})
            return {"output": "", "steps": steps, "error": str(e)}
        steps_outputs[nid] = step_out
        # knowledge — контекст идёт в агент через system prompt (_get_connected_knowledge)
        # condition — проверяет, не трансформирует данные
        if ntype not in ("condition", "knowledge"):
            current = step_out
        steps.append({"nodeId": nid, "type": ntype, "output": step_out[:500]})

    return {"output": current, "steps": steps}


def run_workflow_stream(nodes: list[dict], edges: list[dict], user_input: str = ""):
    """Стриминг: выполняет workflow и по мере ответа агента отдаёт чанки (JSON-строки с полем text)."""
    import json as json_mod
    validate_workflow(nodes, edges)
    current = user_input or ""
    by_id = {n["id"]: n for n in nodes}
    steps_outputs: dict[str, str] = {}
    order = _topological_order(nodes, edges)

    for node in order:
        nid = node["id"]
        ntype = node.get("type", "action")
        data = node.get("data") or {}

        if ntype == "trigger":
            current = current or "(нет входа)"
            steps_outputs[nid] = current
            continue
        if ntype == "knowledge":
            try:
                result = _run_node(node, "", steps_outputs, edges, by_id)
                if result is None:
                    raise RuntimeError(f"_run_node returned None for knowledge node {nid}")
                knowledge_out, _ = result
                steps_outputs[nid] = knowledge_out
            except Exception as e:
                yield json_mod.dumps({"error": str(e)})
                return
            continue
        if ntype == "http":
            try:
                current, _ = _run_node(node, current, steps_outputs, edges, by_id)
            except Exception as e:
                yield json_mod.dumps({"error": str(e)})
                return
            steps_outputs[nid] = current
            continue
        if ntype == "condition":
            try:
                result = _run_node(node, current, steps_outputs, edges, by_id)
                if result is None:
                    raise RuntimeError(f"_run_node returned None for condition node {nid}")
                cond_result, _ = result
                steps_outputs[nid] = cond_result
            except Exception as e:
                yield json_mod.dumps({"error": str(e)})
                return
            continue
        if ntype == "agent":
            provider = (data.get("provider") or "deepseek").strip() or "deepseek"
            base_url = (data.get("baseUrl") or data.get("base_url") or "").strip() or None
            api_key = (data.get("apiKey") or data.get("api_key") or "").strip()
            model = (data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
            system = (data.get("systemPrompt") or "Ты полезный ассистент.").strip()
            tools_config = data.get("tools") or []
            if isinstance(tools_config, str):
                try:
                    tools_config = json.loads(tools_config)
                except (json.JSONDecodeError, TypeError):
                    tools_config = []
            if not isinstance(tools_config, list):
                tools_config = []
            context_parts = _get_connected_knowledge(nid, edges, by_id, steps_outputs)
            if context_parts:
                system = system + "\n\nКонтекст из базы знаний:\n" + "\n---\n".join(c[:8000] for c in context_parts)
            if tools_config:
                tools_desc = [f"- {t.get('name') or t.get('url') or 'tool'}: {t.get('description') or t.get('url') or ''}" for t in tools_config]
                system = system + "\n\nДоступные инструменты:\n" + "\n".join(tools_desc)

            try:
                client = _get_client(provider, base_url, api_key)
                stream = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": current or "Привет!"},
                    ],
                    max_tokens=1024,
                    stream=True,
                )
                full = []
                for chunk in stream:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        full.append(delta)
                        yield json_mod.dumps({"text": delta})
                current = "".join(full)
            except Exception as e:
                yield json_mod.dumps({"error": str(e)})
                return
            steps_outputs[nid] = current
            continue
        try:
            current, _ = _run_node(node, current, steps_outputs, edges, by_id)
        except Exception as e:
            yield json_mod.dumps({"error": str(e)})
            return
        steps_outputs[node["id"]] = current
        continue

    yield json_mod.dumps({"done": True, "output": current})
