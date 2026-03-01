import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface TypewriterMarkdownProps {
  text: string
  speed?: number
  onComplete?: () => void
  onStart?: () => void
  className?: string
}

/**
 * Печатает текст посимвольно и рендерит текущий фрагмент как Markdown.
 * Используется для красивого появления ответов ассистента в чате.
 * onComplete в ref, чтобы ввод в чат (ре-рендер) не перезапускал печать.
 */
export function TypewriterMarkdown({ text, speed = 20, onComplete, onStart, className = '' }: TypewriterMarkdownProps) {
  const [displayed, setDisplayed] = useState('')
  const onCompleteRef = useRef(onComplete)
  const onStartRef = useRef(onStart)
  const hasStartedRef = useRef(false)
  onCompleteRef.current = onComplete
  onStartRef.current = onStart

  useEffect(() => {
    if (!text) {
      onCompleteRef.current?.()
      return
    }
    setDisplayed('')
    // Notify start on first render
    if (!hasStartedRef.current) {
      hasStartedRef.current = true
      onStartRef.current?.()
    }
    let i = 0
    const id = setInterval(() => {
      i += 1
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(id)
        onCompleteRef.current?.()
      }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  return (
    <span className={className}>
      <ReactMarkdown>{displayed}</ReactMarkdown>
    </span>
  )
}
