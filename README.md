# n9n — Workflow Editor MVP

Чат → описание задачи → **Build** → редактор графа (React Flow) с возможностью открыть на полный экран. Бэкенд: генерация workflow по промпту (LLM), запуск агента.

## Запуск

**Фронт** (из `flow-app/`):

```bash
cd flow-app && npm install && npm run dev
```

**Бэкенд** (из `backend/`):

```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# cp .env.example .env — при необходимости задать DEEPSEEK_API_KEY
uvicorn api.main:app --reload --port 8000
```

Фронт по умолчанию ходит на `http://localhost:8000`.

## Стек

- **flow-app:** Vite, React, TypeScript, React Flow, OGL (фон Faulty Terminal)
- **backend:** FastAPI, OpenAI-совместимый API (DeepSeek)
