import { useCallback, useRef, useState } from 'react'
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

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

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
    scrollToBottom()

    abortRef.current = new AbortController()
    try {
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
  }, [input, loading, messages, welcomeMessage, onReadyToCreate, scrollToBottom, setMessagesState])

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
                    onComplete={() => {
                    setTypewriterDone(msg.id)
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
          <input
            type="text"
            className="chat__input"
            placeholder="Напишите сообщение..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={loading}
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
