import { useCallback, useRef, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { TypewriterText } from './TypewriterText'
import { TypewriterMarkdown } from './TypewriterMarkdown'
import './Chat.css'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  done?: boolean
}

interface WorkflowData {
  nodes: unknown[]
  edges: unknown[]
}

interface ChatProps {
  welcomeMessage: string
  /** Контролируемые сообщения (история сохраняется при переходе landing → workspace) */
  messages?: ChatMessage[]
  setMessages?: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  onReadyToCreate?: () => void
  typewriterSpeed?: number
  welcomeImmediate?: boolean
  compact?: boolean
  /** Если передано — id сообщений, для которых печать уже завершена (не перепечатывать при смене вкладки) */
  completedTypewriterIds?: Set<string>
  onTypewriterComplete?: (messageId: string) => void
  /** Режим: landing (первый экран) или workspace (редактор) */
  mode?: 'landing' | 'workspace'
  /** Получить текущий workflow (только для workspace) */
  getCurrentWorkflow?: () => WorkflowData | null
  /** Callback при обновлении workflow (только для workspace) */
  onWorkflowUpdate?: (workflow: WorkflowData) => void
}

const API_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? 'http://localhost:8000'

const SUGGEST_BUILD = /build|билд|созда(ть|й)|проект|редактор|граф|workflow|открой проект/i

export function Chat({
  welcomeMessage,
  messages: messagesProp,
  setMessages: setMessagesProp,
  onReadyToCreate,
  typewriterSpeed = 30,
  welcomeImmediate = false,
  compact = false,
  completedTypewriterIds: completedTypewriterIdsProp,
  onTypewriterComplete,
  mode = 'landing',
  getCurrentWorkflow,
  onWorkflowUpdate,
}: ChatProps) {
  const [internalMessages, setInternalMessages] = useState<ChatMessage[]>([])
  const messages = messagesProp ?? internalMessages
  const setMessagesState = setMessagesProp ?? setInternalMessages

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [internalDoneIds, setInternalDoneIds] = useState<Set<string>>(() => new Set())
  const typewriterDoneIds = completedTypewriterIdsProp ?? internalDoneIds
  const setTypewriterDone = onTypewriterComplete ?? ((id: string) => setInternalDoneIds((prev) => new Set(prev).add(id)))

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior })
  }, [])
  
  // Auto-scroll during typewriter effect
  const [isTypewriterActive, setIsTypewriterActive] = useState(false)
  
  useEffect(() => {
    if (isTypewriterActive && listRef.current) {
      const interval = setInterval(() => {
        listRef.current?.scrollTo({ 
          top: listRef.current.scrollHeight, 
          behavior: 'auto' 
        })
      }, 100)
      return () => clearInterval(interval)
    }
  }, [isTypewriterActive])

  const stopGeneration = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, done: true }
    setMessagesState((m) => [...m, userMsg])
    setLoading(true)
    scrollToBottom('auto')

    abortRef.current = new AbortController()
    try {
      // В режиме workspace можем редактировать workflow
      if (mode === 'workspace' && getCurrentWorkflow) {
        const currentWorkflow = getCurrentWorkflow()
        if (currentWorkflow) {
          // Проверяем, запрашивает ли пользователь изменения workflow
          const editKeywords = /добавь|удали|измени|переделай|обнови|редактируй|поменяй|вставь|убери|настрой|измени промпт|добавь ноду|удали ноду/i
          const questionKeywords = /что у меня|какие ноды|что делает|как работает|объясни|покажи|сколько|какой|какая/i
          
          if (editKeywords.test(text) || questionKeywords.test(text)) {
            // Очищаем ноды от метаданных React Flow (measured, selected, dragging)
            // чтобы LLM видела чистый JSON и не тратила токены на мусор
            const cleanNodes = (currentWorkflow.nodes as Record<string, unknown>[]).map((n) => ({
              id: n.id,
              type: n.type,
              position: {
                x: Math.round(((n.position as Record<string, number>)?.x) ?? 0),
                y: Math.round(((n.position as Record<string, number>)?.y) ?? 0),
              },
              data: n.data,
            }))
            const cleanEdges = (currentWorkflow.edges as Record<string, unknown>[]).map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
              targetHandle: e.targetHandle,
            }))

            const res = await fetch(`${API_BASE}/api/edit-workflow`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                current_nodes: cleanNodes,
                current_edges: cleanEdges,
                user_request: text,
                chat_history: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
              }),
              signal: abortRef.current.signal,
            })
            
            if (res.ok) {
              const data = await res.json()
              const reply = data.explanation || 'Workflow обновлён.'

              if (data.changed !== false && data.nodes && data.edges && onWorkflowUpdate) {
                onWorkflowUpdate({ nodes: data.nodes, edges: data.edges })
              }
              
              const assistantMsg: ChatMessage = { 
                id: `a-${Date.now()}`, 
                role: 'assistant', 
                content: reply, 
                done: true 
              }
              setMessagesState((m) => [...m, assistantMsg])
              setLoading(false)
              abortRef.current = null
              scrollToBottom()
              return
            }
          }
        }
      }
      
      // Обычный чат
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
          welcome: welcomeMessage,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(res.statusText)
      const data = await res.json()
      const reply = typeof data.reply === 'string' ? data.reply : (data.content ?? data.message ?? '')
      const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: 'assistant', content: reply, done: true }
      setMessagesState((m) => [...m, assistantMsg])
      // Кнопку Build показываем только после окончания печати — см. onComplete у TypewriterMarkdown ниже
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessagesState((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: 'Генерация остановлена.', done: true }])
      } else {
        setMessagesState((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: 'Не удалось получить ответ. Проверьте бэкенд.', done: true }])
      }
    } finally {
      setLoading(false)
      abortRef.current = null
      scrollToBottom()
    }
  }, [input, loading, messages, welcomeMessage, onReadyToCreate, scrollToBottom, setMessagesState, mode, getCurrentWorkflow, onWorkflowUpdate])

  const showWelcome = messages.length === 0

  return (
    <div className={`chat ${compact ? 'chat--compact' : ''}`}>
      <div className="chat__messages" ref={listRef}>
        {showWelcome && (
          <div className="chat__message chat__message--assistant">
            <div className="chat__bubble chat__bubble--md">
              {welcomeImmediate ? (
                <ReactMarkdown>{welcomeMessage}</ReactMarkdown>
              ) : (
                <TypewriterText
                  text={welcomeMessage}
                  speed={typewriterSpeed}
                  onComplete={onReadyToCreate}
                />
              )}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat__message chat__message--${msg.role}`}>
            <div className="chat__bubble chat__bubble--md">
              {msg.role === 'assistant' ? (
                typewriterDoneIds.has(msg.id) ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  <TypewriterMarkdown
                    key={msg.id}
                    text={msg.content}
                    speed={typewriterSpeed}
                    onStart={() => setIsTypewriterActive(true)}
                    onComplete={() => {
                    setTypewriterDone(msg.id)
                    setIsTypewriterActive(false)
                    if (messages[messages.length - 1]?.id === msg.id && SUGGEST_BUILD.test(msg.content) && onReadyToCreate) onReadyToCreate()
                  }}
                  />
                )
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat__message chat__message--assistant">
            <div className="chat__bubble chat__bubble--typing">
              <span className="chat__dot" />
              <span className="chat__dot" />
              <span className="chat__dot" />
            </div>
          </div>
        )}
      </div>
      <div className="chat__footer">
        <div className="chat__input-wrap">
          <textarea
            className="chat__textarea"
            placeholder={mode === 'workspace' ? "Напиши изменения или вопросы о workflow..." : "Напишите сообщение..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            disabled={loading}
            rows={1}
          />
          {loading ? (
            <button type="button" className="chat__send chat__send--stop" onClick={stopGeneration} title="Остановить">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="6" y="6" width="12" height="12" /></svg>
            </button>
          ) : (
            <button type="button" className="chat__send" onClick={sendMessage} disabled={!input.trim()} title="Отправить">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
