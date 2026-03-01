import { useEffect, useRef, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './ExportSection.css'

const API_BASE =
  (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  'http://localhost:8000'

const FILE_LANGUAGE: Record<string, string> = {
  'main.py': 'python',
  'workflow.py': 'python',
  'requirements.txt': 'text',
  Dockerfile: 'docker',
  '.env.example': 'bash',
}

interface ExportSectionProps {
  files: Record<string, string>
}

export function ExportSection({ files }: ExportSectionProps) {
  const fileNames = Object.keys(files)
  const [activeFile, setActiveFile] = useState(fileNames[0] ?? 'main.py')
  const [botRunning, setBotRunning] = useState(false)
  const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'stopped'>('idle')
  const [logs, setLogs] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Check initial bot status
  useEffect(() => {
    fetch(`${API_BASE}/api/bot-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.running) {
          setBotRunning(true)
          setBotStatus('running')
          startLogStream()
        }
      })
      .catch(() => {})
  }, [])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  function startLogStream() {
    eventSourceRef.current?.close()
    const es = new EventSource(`${API_BASE}/api/bot-logs`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { line: string; done?: boolean }
        if (data.line) {
          setLogs((prev) => [...prev, data.line])
        }
        if (data.done) {
          setBotRunning(false)
          setBotStatus('stopped')
          es.close()
        }
      } catch {
        // non-JSON keepalive
      }
    }

    es.onerror = () => {
      setBotRunning(false)
      setBotStatus('stopped')
      es.close()
    }
  }

  async function handleRunBot() {
    setBotStatus('starting')
    setLogs([])
    try {
      const res = await fetch(`${API_BASE}/api/run-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (!res.ok) throw new Error(await res.text())
      setBotRunning(true)
      setBotStatus('running')
      startLogStream()
    } catch (err) {
      setLogs([`[ERROR] ${err}`])
      setBotStatus('stopped')
    }
  }

  async function handleStopBot() {
    eventSourceRef.current?.close()
    try {
      await fetch(`${API_BASE}/api/stop-bot`, { method: 'POST' })
    } catch {}
    setBotRunning(false)
    setBotStatus('stopped')
    setLogs((prev) => [...prev, '[Бот остановлен]'])
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`${API_BASE}/api/download-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bot.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    } finally {
      setDownloading(false)
    }
  }

  const language = FILE_LANGUAGE[activeFile] ?? 'python'

  const statusLabel: Record<typeof botStatus, string> = {
    idle: '',
    starting: 'Запуск...',
    running: 'Работает',
    stopped: 'Остановлен',
  }

  return (
    <div className="export-section">
      {/* Code Viewer */}
      <div className="export-section__widget export-section__code-widget">
        <div className="export-section__toolbar">
          <span className="export-section__title">Код проекта</span>
          <button
            className="export-section__btn export-section__btn--download"
            onClick={handleDownload}
            disabled={downloading}
            title="Скачать zip-архив"
          >
            {downloading ? 'Скачивание...' : '↓ Скачать zip'}
          </button>
        </div>

        <div className="export-section__file-tabs">
          {fileNames.map((name) => (
            <button
              key={name}
              className={`export-section__file-tab ${activeFile === name ? 'export-section__file-tab--active' : ''}`}
              onClick={() => setActiveFile(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="export-section__code-body">
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '16px',
              fontSize: '12.5px',
              lineHeight: '1.6',
              background: 'transparent',
              height: '100%',
              overflowY: 'auto',
            }}
            showLineNumbers
          >
            {files[activeFile] ?? ''}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* Bot Logs */}
      <div className="export-section__widget export-section__logs-widget">
        <div className="export-section__toolbar">
          <div className="export-section__logs-title-row">
            <span className="export-section__title">Telegram Bot</span>
            {botStatus !== 'idle' && (
              <span
                className={`export-section__status-badge export-section__status-badge--${botStatus}`}
              >
                {statusLabel[botStatus]}
              </span>
            )}
          </div>
          <div className="export-section__btn-group">
            {!botRunning ? (
              <button
                className="export-section__btn export-section__btn--run"
                onClick={handleRunBot}
                disabled={botStatus === 'starting'}
              >
                {botStatus === 'starting' ? '...' : '▶ Запустить бота'}
              </button>
            ) : (
              <button
                className="export-section__btn export-section__btn--stop"
                onClick={handleStopBot}
              >
                ■ Остановить
              </button>
            )}
          </div>
        </div>

        <div className="export-section__logs-body">
          {logs.length === 0 ? (
            <div className="export-section__logs-empty">
              Нажмите «Запустить бота» чтобы увидеть логи
            </div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={`export-section__log-line ${line.startsWith('[ERR') ? 'export-section__log-line--error' : ''}`}>
                {line}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}
