# Обзор проекта Sim (simstudioai/sim)

Краткий разбор [Sim](https://github.com/simstudioai/sim) — платформа для визуальной сборки, деплоя и оркестрации AI-агентов. Релевантно для идеи «аналог n8n с no-code, ИИ и выходом в Python + Docker».

---

## Что это

- **Продукт:** low-code редактор workflow’ов на канвасе (агенты, инструменты, блоки), запуск «из коробки», Copilot для генерации/правки нод и RAG (векторные хранилища).
- **Хостинг:** облако [sim.ai](https://sim.ai) или self-hosted (Docker, NPM `npx simstudio`, dev container).
- **Лицензия:** Apache-2.0.

---

## Стек (из README и структуры)

| Слой | Технология |
|------|------------|
| Фронт / приложение | Next.js 16 (App Router), React 19 |
| Рантайм | Bun |
| БД | PostgreSQL + pgvector, Drizzle ORM |
| Аутентификация | Better Auth |
| UI | Shadcn, Tailwind, Zustand |
| **Редактор графа** | **ReactFlow** |
| Документация | Fumadocs |
| Монорепо | Turborepo |
| Realtime | Socket.io |
| Фоновые задачи | Trigger.dev |
| Выполнение кода | E2B (remote code execution) |

---

## Структура репозитория

```
sim/
├── apps/sim/          # Основное Next.js приложение
│   ├── app/           # Роуты, API
│   ├── blocks/        # Определения блоков + registry (аналог нод n8n)
│   ├── components/    # UI (emcn/, ui/, icons)
│   ├── executor/      # Движок выполнения workflow (DAG, handlers, execution)
│   ├── hooks/         # React Query, селекторы
│   ├── lib/            # Конфиг, утилиты
│   ├── providers/      # Интеграции LLM
│   ├── stores/         # Zustand
│   ├── tools/          # Определения инструментов (API-вызовы и т.д.)
│   ├── triggers/       # Триггеры (webhook и др.)
│   ├── serializer/     # Сериализация графа/блоков
│   ├── socket/         # Realtime
│   └── background/     # Фоновые джобы (Trigger.dev)
├── packages/
│   ├── db/             # Схема БД, Drizzle
│   ├── cli/            # CLI (npx simstudio → Docker)
│   ├── ts-sdk/         # TypeScript SDK для запуска workflow
│   ├── python-sdk/     # Python SDK для запуска workflow
│   ├── logger/, testing/, tsconfig/
├── docker/, helm/      # Docker и Helm для деплоя
```

---

## Архитектурные идеи, полезные для твоего продукта

### 1. Блоки (blocks) и инструменты (tools)

- **Tools** — атомарные действия: описание (id, name, params, request), OAuth, вызов API. Регистрация в `tools/registry.ts`.
- **Blocks** — визуальные ноды в редакторе: тип, иконка, подблоки (поля формы), привязка к tools, inputs/outputs. Регистрация в `blocks/registry.ts`.
- Добавление интеграции: Tool → Block → Icon → (опционально) Trigger. В CLAUDE.md описан чеклист и паттерны (condition, dependsOn, file-upload и т.д.).

Для твоего «на выходе Python»: блоки можно маппить в шаги пайплайна; один блок = один шаг/функция в сгенерированном коде.

### 2. Executor (движок выполнения)

- **executor/** — DAG, execution, handlers, variables, human-in-the-loop, orchestrators.
- Отдельные типы и константы (`types.ts`, `constants.ts`), утилиты и тесты (`utils.ts`, `utils.test.ts`).
- Workflow выполняется на их инфраструктуре (Trigger.dev, E2B), а не как «скопированный Python-проект». У тебя цель иная — генерация артефакта (Python + Docker), но идея «граф → DAG → упорядоченное выполнение» та же.

### 3. Редактор (ReactFlow)

- Визуальный редактор на ReactFlow — как в твоём flow-app.
- Состояние графа, скорее всего, в Zustand + синхронизация с бэкендом; сериализация в `serializer/`.

### 4. Copilot и ИИ

- Copilot — облачный сервис Sim (API key в self-hosted). Генерация нод, правки по ошибкам, итерации по флоу из естественного языка.
- Для твоего продукта: тот же паттерн — «описание цели / граф» → ИИ → обновлённый граф или сгенерированный Python.

### 5. SDK (TS и Python)

- **packages/ts-sdk** и **packages/python-sdk** — запуск workflow через их API (выполнение на стороне Sim).
- У тебя «выход = Python-проект», а не вызов облачного API: можно взять идею «единый контракт workflow» (например, JSON-схема графа), а генератор будет выдавать Python-код под этот контракт.

### 6. Деплой

- Self-hosted: Docker Compose, образы в `docker/`, оркестрация в `helm/sim`. Локальные модели — Ollama; опционально vLLM.
- Твой финал — не их облако, а «скачать Python + Dockerfile» и деплоить у себя; логика «всё в контейнере» похожа.

---

## Что взять в работу над своим продуктом

1. **Разделение Tools vs Blocks** — инструмент (действие API/логика) и визуальный блок (нода в графе) с чётким маппингом. Удобно для кодогенерации: один тип блока = один шаблон кода.
2. **Executor как DAG** — граф → топологический порядок → выполнение шагов. У тебя это может быть «граф → порядок шагов в Python (celery/script)`.
3. **Регистры (tools/registry, blocks/registry)** — единая точка расширения интеграций и типов нод.
4. **Сериализация графа** — отдельный слой (serializer), чтобы формат хранения/обмена был стабильным и пригодным для генератора кода.
5. **Документация для разработчиков** — CLAUDE.md с правилами импортов, Zustand, добавления интеграций; аналог можно завести у себя по мере роста кодовой базы.

---

## Отличия от твоей идеи

| Аспект | Sim | Твой продукт |
|--------|-----|--------------|
| Выполнение | В их облаке / self-hosted Sim (Trigger.dev, E2B) | На выходе — **Python-проект**, пользователь деплоит сам |
| Артефакт | Workflow в БД, запуск через API/SDK | **Код + Docker**, репозиторий, свой CI/CD |
| ИИ | Copilot (ноды, правки, RAG) | Генерация сценариев + тесты + возможно код |
| Язык бэкенда | TypeScript/Node (Next, Bun) | Генерация **Python** |

Итого: Sim — отличный ориентир по архитектуре редактора (ReactFlow, blocks/tools, executor как DAG, serializer), по процессу добавления интеграций и по роли ИИ. Твоя фишка — «на выходе свой код и контейнер» — остаётся уникальной; можно опираться на их структуру, не копируя выполнение в облаке.

---

## Ссылки

- Репозиторий: https://github.com/simstudioai/sim  
- Документация: https://sim.ai (и в репо)  
- Быстрый старт self-hosted: `npx simstudio` или `docker compose -f docker-compose.prod.yml up -d`
