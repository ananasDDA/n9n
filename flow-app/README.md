# Workflow Editor — MVP платформы агентов

**Сценарий MVP:** пользователь переходит по ссылке → вводит запрос в поле «Создать агента по запросу» → нажимает «Сгенерировать агента» → получает граф (триггер → агент и др.) → вводит сообщение в «Протестировать агента» и нажимает «Запустить» → видит ответ агента.

Редактор на React Flow: ноды (Триггер, Агент, HTTP, Условие, Код и др.), настройка нод в правой панели, сохранение/загрузка JSON. Бэкенд: генерация графа по промпту (OpenAI, при наличии `OPENAI_API_KEY`) и **запуск workflow** для теста агента. Дорожная карта — [ROADMAP.md](../ROADMAP.md).

## Запуск

```bash
npm install
npm run dev
```

Сборка для продакшена:

```bash
npm run build
```

Статика будет в `dist/`.

## GitHub Pages

**Фронт этого приложения можно раздавать с GitHub Pages.** Pages отдают только статику (HTML/CSS/JS), серверный код не выполняется.

- Включи GitHub Pages в настройках репозитория (Source: branch `main` / `gh-pages`, папка `dist` или корень).
- Если репо доступен как `https://<user>.github.io/<repo>/`, в `vite.config.ts` раскомментируй и задай `base: '/<repo>/'` (например `base: '/AI_Arch/'`), затем снова `npm run build`.
- Бэкенд (API, генерация Python/Docker, ИИ) на Pages не запустишь — его нужно хостить отдельно (Vercel, Railway, свой сервер).

## Бэкенд (для генерации и теста агента)

Запуск из каталога `backend/`:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
# Опционально: cp .env.example .env и задать DEEPSEEK_API_KEY
uvicorn api.main:app --reload --port 8000
```

- **С DEEPSEEK_API_KEY:** «Сгенерировать агента» строит граф по промпту через DeepSeek API; «Запустить» выполняет workflow (нода «Агент» вызывает LLM).
- **Без ключа:** генерация возвращает заглушку (триггер → агент); при запуске агент вернёт сообщение о том, что ключ не задан.

Фронт по умолчанию обращается к `http://localhost:8000`.

## Стек

- Vite, React 18, TypeScript
- [@xyflow/react](https://www.npmjs.com/package/@xyflow/react) (React Flow) — граф, ноды, связи
- [ogl](https://github.com/oframe/ogl) — фон лендинга в стиле [Faulty Terminal](https://reactbits.dev/backgrounds/faulty-terminal?tint=942192) (сетка, сканлайны, шум, tint #942192)
