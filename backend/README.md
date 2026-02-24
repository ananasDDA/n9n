# Backend — генерация агента по промпту и запуск для теста

## Назначение

- **POST /api/generate-workflow** — по промпту (DeepSeek API) вернуть граф (nodes + edges). Без `DEEPSEEK_API_KEY` возвращается заглушка (trigger → agent).
- **POST /api/run-workflow** — выполнить текущий граф: вход — текст пользователя, выход — ответ (например от ноды «Агент»). Нужен `DEEPSEEK_API_KEY` для ноды agent.
- **POST /api/export-python** — позже (501).

## Запуск

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Опционально: cp .env.example .env и задать DEEPSEEK_API_KEY
uvicorn api.main:app --reload --port 8000
```

Запуск **обязательно из каталога backend** (чтобы находились модули `generate_workflow` и `executor`).

API: http://localhost:8000  
Docs: http://localhost:8000/docs

## Переменные окружения

| Переменная      | Описание |
|-----------------|----------|
| `DEEPSEEK_API_KEY` | Ключ DeepSeek API для генерации графа по промпту и для выполнения ноды «Агент». Без него: заглушка при генерации, при run агент вернёт сообщение о том, что ключ не задан. |

Файл `.env` в каталоге `backend/` подхватывается автоматически (см. `.env.example`).
