"""
Генератор Python-проекта из workflow JSON.
Принимает {nodes, edges}, возвращает dict[filename -> content].
"""
from __future__ import annotations

import textwrap
from typing import Any


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Sort nodes in execution order following targetHandle='input' edges only."""
    node_map = {n["id"]: n for n in nodes}

    children: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

    for e in edges:
        src = e.get("source", "")
        tgt = e.get("target", "")
        if e.get("targetHandle", "input") == "input" and src in node_map and tgt in node_map:
            children[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid in in_degree if in_degree[nid] == 0]
    result: list[dict] = []

    while queue:
        nid = queue.pop(0)
        result.append(node_map[nid])
        for child in children[nid]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    seen = {n["id"] for n in result}
    for n in nodes:
        if n["id"] not in seen:
            result.append(n)

    return result


def _get_knowledge_nodes(agent_id: str, nodes: list[dict], edges: list[dict]) -> list[dict]:
    """Find knowledge nodes wired to this agent via targetHandle='context'."""
    node_map = {n["id"]: n for n in nodes}
    return [
        node_map[e["source"]]
        for e in edges
        if (
            e.get("target") == agent_id
            and e.get("targetHandle") == "context"
            and e.get("source", "") in node_map
            and node_map[e["source"]].get("type") == "knowledge"
        )
    ]


def _safe_id(node_id: str) -> str:
    return node_id.replace("-", "_").replace(" ", "_")


# ---------------------------------------------------------------------------
# Per-node code generation
# ---------------------------------------------------------------------------

def _gen_trigger(nid: str, data: dict) -> list[str]:
    return [
        f"async def step_{nid}(text: str) -> str:",
        f"    # Trigger — pass user input through",
        f"    return text",
        "",
        "",
    ]


def _gen_agent(nid: str, data: dict, knowledge_nodes: list[dict]) -> list[str]:
    system_prompt: str = data.get("systemPrompt", "Ты полезный ассистент.")
    model: str = data.get("model", "deepseek-chat")

    # Inject knowledge context into system prompt
    extra = ""
    for kn in knowledge_nodes:
        kd = kn.get("data", {})
        docs = kd.get("documents", [])
        desc = kd.get("description", "")
        label = kd.get("label", "")
        if docs:
            extra += f"\n\nКонтекст ({label}):\n" + "\n".join(str(d) for d in docs[:5])
        elif desc:
            extra += f"\n\nКонтекст ({label}): {desc}"

    full_system = system_prompt + extra

    return [
        f"async def step_{nid}(text: str) -> str:",
        f"    client = _make_client()",
        f"    system = {repr(full_system)}",
        f"    resp = await client.chat.completions.create(",
        f"        model={repr(model)},",
        f"        messages=[",
        f"            {{\"role\": \"system\", \"content\": system}},",
        f"            {{\"role\": \"user\", \"content\": text}},",
        f"        ],",
        f"        max_tokens=1024,",
        f"    )",
        f"    return (resp.choices[0].message.content or \"\").strip()",
        "",
        "",
    ]


def _gen_http(nid: str, data: dict) -> list[str]:
    method = data.get("method", "GET").upper()
    url = data.get("url", "https://example.com")
    return [
        f"async def step_{nid}(text: str) -> str:",
        f"    async with httpx.AsyncClient(timeout=30) as client:",
        f"        resp = await client.{method.lower()}({repr(url)})",
        f"        return resp.text",
        "",
        "",
    ]


def _gen_condition(nid: str, data: dict) -> list[str]:
    condition = data.get("condition", "not_empty")
    return [
        f"async def step_{nid}(text: str) -> str:",
        f"    # condition: {condition}",
        f"    # Returns text unchanged; add branching logic here if needed",
        f"    return text",
        "",
        "",
    ]


def _gen_passthrough(nid: str, node_type: str) -> list[str]:
    return [
        f"async def step_{nid}(text: str) -> str:",
        f"    # {node_type} — pass-through",
        f"    return text",
        "",
        "",
    ]


# ---------------------------------------------------------------------------
# File generators
# ---------------------------------------------------------------------------

def _generate_workflow_py(nodes: list[dict], edges: list[dict]) -> str:
    sorted_nodes = _topological_sort(nodes, edges)

    lines = [
        "\"\"\"Auto-generated workflow execution logic.\"\"\"",
        "import os",
        "import httpx",
        "from openai import AsyncOpenAI",
        "",
        "",
        "def _make_client() -> AsyncOpenAI:",
        "    return AsyncOpenAI(",
        "        api_key=os.getenv(\"DEEPSEEK_API_KEY\", \"\"),",
        "        base_url=\"https://api.deepseek.com\",",
        "    )",
        "",
        "",
    ]

    # Generate per-node async functions
    for node in sorted_nodes:
        ntype = node.get("type", "")
        nid = _safe_id(node["id"])
        data = node.get("data", {})

        if ntype == "trigger":
            lines += _gen_trigger(nid, data)
        elif ntype == "agent":
            kn = _get_knowledge_nodes(node["id"], nodes, edges)
            lines += _gen_agent(nid, data, kn)
        elif ntype == "http":
            lines += _gen_http(nid, data)
        elif ntype == "condition":
            lines += _gen_condition(nid, data)
        else:
            lines += _gen_passthrough(nid, ntype)

    # Generate run_workflow — skip knowledge nodes in the call chain
    main_chain = [n for n in sorted_nodes if n.get("type") != "knowledge"]

    lines += [
        "async def run_workflow(user_input: str) -> str:",
        "    \"\"\"Run the full workflow and return the final result.\"\"\"",
        "    result = user_input",
    ]
    for node in main_chain:
        nid = _safe_id(node["id"])
        lines.append(f"    result = await step_{nid}(result)")

    lines += [
        "    return result",
        "",
    ]

    return "\n".join(lines)


def _generate_main_py() -> str:
    return textwrap.dedent("""\
        # Telegram bot entry point. Auto-generated by n9n.
        import os
        import re
        import asyncio
        from dotenv import load_dotenv
        from telegram import Update
        from telegram.constants import ChatAction, ParseMode
        from telegram.ext import Application, MessageHandler, filters, ContextTypes

        load_dotenv()

        from workflow import run_workflow


        def _escape_html(text: str) -> str:
            return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


        def _md_to_html(text: str) -> str:
            parts = []
            code_re = re.compile(r'```(?:\\w*\\n?)?(.*?)```', re.DOTALL)
            last = 0
            for m in code_re.finditer(text):
                parts.append(_inline_fmt(text[last:m.start()]))
                code = _escape_html(m.group(1).strip())
                parts.append(f"<pre><code>{code}</code></pre>")
                last = m.end()
            parts.append(_inline_fmt(text[last:]))
            return "".join(parts)


        def _inline_fmt(text: str) -> str:
            text = _escape_html(text)
            text = re.sub(r'^#{1,6}\\s+(.+)$', r'<b>\\1</b>', text, flags=re.MULTILINE)
            text = re.sub(r'^(\\-{3,}|\\*{3,}|_{3,})\\s*$', '──────────────', text, flags=re.MULTILINE)
            text = re.sub(r'\\*\\*(.+?)\\*\\*', r'<b>\\1</b>', text, flags=re.DOTALL)
            text = re.sub(r'__(.+?)__', r'<b>\\1</b>', text, flags=re.DOTALL)
            text = re.sub(r'\\*(.+?)\\*', r'<i>\\1</i>', text)
            text = re.sub(r'_(.+?)_', r'<i>\\1</i>', text)
            text = re.sub(r'`([^`]+)`', lambda m: f"<code>{m.group(1)}</code>", text)
            return text


        async def _typing_loop(chat_id: int, context: ContextTypes.DEFAULT_TYPE, stop: asyncio.Event) -> None:
            while not stop.is_set():
                await context.bot.send_chat_action(chat_id=chat_id, action=ChatAction.TYPING)
                try:
                    await asyncio.wait_for(stop.wait(), timeout=4)
                except asyncio.TimeoutError:
                    pass


        async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
            user_text = update.message.text or ""
            user_name = getattr(update.effective_user, "first_name", "User")
            chat_id = update.effective_chat.id
            print(f"[MSG] {user_name}: {user_text}", flush=True)

            stop_event = asyncio.Event()
            typing_task = asyncio.create_task(_typing_loop(chat_id, context, stop_event))

            try:
                response = await run_workflow(user_text)
                stop_event.set()
                await typing_task
                html = _md_to_html(response)
                await update.message.reply_text(html, parse_mode=ParseMode.HTML)
                preview = response[:120].replace("\\n", " ")
                print(f"[BOT] → {preview}", flush=True)
            except Exception as exc:
                stop_event.set()
                await typing_task
                await update.message.reply_text(f"⚠️ Ошибка: {exc}")
                print(f"[ERR] {exc}", flush=True)


        def main() -> None:
            token = os.getenv("TELEGRAM_BOT_TOKEN")
            if not token:
                raise ValueError("TELEGRAM_BOT_TOKEN не задан в .env")
            print("[START] Bot starting...", flush=True)
            app = Application.builder().token(token).build()
            app.add_handler(MessageHandler(filters.TEXT, handle_message))
            print("[START] Bot is running! Write a message in Telegram to test.", flush=True)
            app.run_polling(drop_pending_updates=True)


        if __name__ == "__main__":
            main()
        """)


def _generate_requirements() -> str:
    return textwrap.dedent("""\
        python-telegram-bot==21.6
        openai>=1.0.0
        httpx>=0.27.0
        python-dotenv>=1.0.0
        """)


def _generate_dockerfile() -> str:
    return textwrap.dedent("""\
        FROM python:3.12-slim

        WORKDIR /app

        COPY requirements.txt .
        RUN pip install --no-cache-dir -r requirements.txt

        COPY . .

        CMD ["python", "main.py"]
        """)


def _generate_env_example() -> str:
    return textwrap.dedent("""\
        TELEGRAM_BOT_TOKEN=
        DEEPSEEK_API_KEY=
        """)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_files(nodes: list[dict], edges: list[dict]) -> dict[str, str]:
    """
    Generate all project files from a workflow graph.
    Returns {filename: content}.
    """
    return {
        "main.py": _generate_main_py(),
        "workflow.py": _generate_workflow_py(nodes, edges),
        "requirements.txt": _generate_requirements(),
        "Dockerfile": _generate_dockerfile(),
        ".env.example": _generate_env_example(),
    }
