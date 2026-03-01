import type { Node } from '@xyflow/react'
import type { NodeType } from '../types'

interface NodeConfigPanelProps {
  node: Node | null
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
}

export function NodeConfigPanel({ node, onUpdate }: NodeConfigPanelProps) {
  if (!node) {
    return (
      <aside className="config-panel config-panel--empty">
        <p className="config-panel__hint">Выберите ноду на канвасе</p>
      </aside>
    )
  }

  const { id, type, data } = node
  const patch = (key: string, value: unknown) => onUpdate(id, { [key]: value })

  return (
    <aside className="config-panel">
      <h3 className="config-panel__title">Настройки ноды</h3>
      <div className="config-panel__type">{type}</div>

      <label className="config-panel__label">
        Название
        <input
          type="text"
          className="config-panel__input"
          value={(data.label as string) ?? ''}
          onChange={(e) => patch('label', e.target.value)}
        />
      </label>

      {(type as NodeType) === 'trigger' && (
        <label className="config-panel__label">
          Тип триггера
          <select
            className="config-panel__input"
            value={(data.triggerType as string) ?? 'manual'}
            onChange={(e) => patch('triggerType', e.target.value)}
          >
            <option value="manual">Вручную (тест из интерфейса)</option>
            <option value="webhook">Webhook (позже)</option>
            <option value="schedule">По расписанию (позже)</option>
          </select>
        </label>
      )}

      {(type as NodeType) === 'agent' && (
        <>
          <label className="config-panel__label">
            Провайдер
            <select
              className="config-panel__input"
              value={(data.provider as string) ?? 'deepseek'}
              onChange={(e) => patch('provider', e.target.value)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="ollama">Ollama (локально)</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="config-panel__label">
            Base URL (опционально)
            <input
              type="text"
              className="config-panel__input"
              placeholder="https://api.deepseek.com или http://localhost:11434/v1"
              value={(data.baseUrl as string) ?? ''}
              onChange={(e) => patch('baseUrl', e.target.value)}
            />
          </label>
          <label className="config-panel__label">
            Модель
            <input
              type="text"
              className="config-panel__input"
              placeholder="deepseek-chat"
              value={(data.model as string) ?? ''}
              onChange={(e) => patch('model', e.target.value)}
            />
          </label>
          <label className="config-panel__label">
            Системный промпт
            <textarea
              className="config-panel__textarea"
              placeholder="Роль и инструкции для агента"
              value={(data.systemPrompt as string) ?? ''}
              onChange={(e) => patch('systemPrompt', e.target.value)}
              rows={3}
            />
          </label>
          <label className="config-panel__label">
            Инструменты (JSON-массив: name, description, url, method)
            <textarea
              className="config-panel__textarea"
              placeholder='[{"name":"search","description":"Поиск в интернете","url":"https://..."}]'
              value={typeof data.tools === 'string' ? (data.tools as string) : JSON.stringify((data.tools as unknown[]) ?? [], null, 2)}
              onChange={(e) => {
                try {
                  const v = JSON.parse(e.target.value || '[]')
                  if (Array.isArray(v)) patch('tools', v)
                } catch {
                  patch('tools', [])
                }
              }}
              rows={2}
            />
          </label>
        </>
      )}

      {(type as NodeType) === 'http' && (
        <>
          <label className="config-panel__label">
            Метод
            <select
              className="config-panel__input"
              value={(data.method as string) ?? 'GET'}
              onChange={(e) => patch('method', e.target.value)}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="config-panel__label">
            URL
            <input
              type="text"
              className="config-panel__input"
              placeholder="https://api.example.com/..."
              value={(data.url as string) ?? ''}
              onChange={(e) => patch('url', e.target.value)}
            />
          </label>
          <p className="config-panel__hint">Вход от предыдущей ноды отправляется как тело запроса (POST/PUT/PATCH). Если это JSON — уйдёт с Content-Type: application/json.</p>
        </>
      )}

      {(type as NodeType) === 'knowledge' && (
        <>
          <label className="config-panel__label">
            Описание
            <input
              type="text"
              className="config-panel__input"
              placeholder="Краткое описание содержимого"
              value={(data.description as string) ?? ''}
              onChange={(e) => patch('description', e.target.value)}
            />
          </label>
          <label className="config-panel__label">
            Теги (через запятую)
            <input
              type="text"
              className="config-panel__input"
              placeholder="grammar, verbs, beginner"
              value={Array.isArray(data.tags) ? (data.tags as string[]).join(', ') : ''}
              onChange={(e) => patch('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            />
          </label>
          <label className="config-panel__label">
            Категория
            <input
              type="text"
              className="config-panel__input"
              placeholder="language_learning"
              value={(data.category as string) ?? ''}
              onChange={(e) => patch('category', e.target.value)}
            />
          </label>
          <label className="config-panel__label">
            Источник
            <input
              type="text"
              className="config-panel__input"
              placeholder="textbook.pdf"
              value={(data.source as string) ?? ''}
              onChange={(e) => patch('source', e.target.value)}
            />
          </label>
          <label className="config-panel__label">
            URL документа (опционально)
            <input
              type="text"
              className="config-panel__input"
              placeholder="https://example.com/doc.txt"
              value={(data.url as string) ?? ''}
              onChange={(e) => patch('url', e.target.value)}
            />
            <p className="config-panel__hint">Если URL задан — документ загрузится автоматически. Если нет URL и нет текста — будет использован Wikipedia API.</p>
          </label>
          <label className="config-panel__label">
            Тексты документов (по одному на строку, если нет URL)
            <textarea
              className="config-panel__textarea"
              placeholder="Текст первого документа..."
              value={Array.isArray(data.documents) ? (data.documents as string[]).join('\n\n') : ''}
              onChange={(e) => patch('documents', e.target.value.split('\n\n').filter(Boolean))}
              rows={4}
            />
          </label>
        </>
      )}

      {(type as NodeType) === 'condition' && (
        <>
          <label className="config-panel__label">
            Условие
            <input
              type="text"
              className="config-panel__input"
              value={(data.condition as string) ?? 'not_empty'}
              onChange={(e) => patch('condition', e.target.value)}
              placeholder="contains(слово) или not_empty"
            />
          </label>
          <p className="config-panel__hint">
            Формат: <code>contains(слово)</code> — проверяет наличие слова во входе. 
            <br/>Примеры: <code>contains(сложн)</code>, <code>contains(ошибка)</code>, <code>not_empty</code>
            <br/>Выход «истина» — правое ребро (true), «ложь» — нижнее (false).
            <br/><strong>Важно:</strong> Condition должен быть ДО агента, чтобы влиять на его работу.
          </p>
        </>
      )}

      {!['trigger', 'agent', 'http', 'knowledge', 'condition'].includes(type as string) && (
        <p className="config-panel__hint">Редактировать можно только название.</p>
      )}
    </aside>
  )
}
