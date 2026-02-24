import { useEffect, useState } from 'react'

interface TypewriterTextProps {
  text: string
  speed?: number
  onComplete?: () => void
  className?: string
  delay?: number
}

export function TypewriterText({ text, speed = 30, onComplete, className = '', delay = 0 }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(delay <= 0)

  useEffect(() => {
    if (!text) {
      onComplete?.()
      return
    }
    if (delay > 0 && !started) {
      const t = setTimeout(() => setStarted(true), delay)
      return () => clearTimeout(t)
    }
    if (!started) return

    let i = 0
    setDisplayed('')
    const id = setInterval(() => {
      i += 1
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(id)
        onComplete?.()
      }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, started, delay, onComplete])

  if (!started && delay > 0) return <span className={className} />
  return (
    <span className={className}>
      {displayed}
      {displayed.length < text.length && <span className="typewriter-cursor">|</span>}
    </span>
  )
}
