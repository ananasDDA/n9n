import { useState, useRef, useCallback } from 'react'
import FaultyTerminal from '../backgrounds/FaultyTerminal'
import { Chat } from '../components/Chat'
import type { ChatMessage } from '../components/Chat'
import { FlowEditor } from './FlowEditor'
import { ExportSection } from '../components/ExportSection'
import './WorkspaceView.css'

const API_BASE =
  (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  'http://localhost:8000'

const WORKSPACE_WELCOME = `Редактор открыт. Я вижу твой workflow и могу:
• Отвечать на вопросы о структуре бота
• Вносить изменения (добавить/удалить ноды, изменить промпты)
• Объяснять, как работает твой workflow

Просто напиши, что хочешь изменить или спроси!`

interface WorkspaceViewProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  buildPrompt?: string | null
  buildPromptRef?: React.RefObject<string | null>
  onFlowGenerated?: () => void
  completedTypewriterIds?: Set<string>
  onTypewriterComplete?: (messageId: string) => void
}

export function WorkspaceView({
  messages,
  setMessages,
  buildPrompt,
  buildPromptRef,
  onFlowGenerated,
  completedTypewriterIds,
  onTypewriterComplete,
}: WorkspaceViewProps) {
  const [flowFullscreen, setFlowFullscreen] = useState(false)
  const [workflowUpdate, setWorkflowUpdate] = useState<{ nodes: unknown[]; edges: unknown[] } | null>(null)
  const [exportedFiles, setExportedFiles] = useState<Record<string, string> | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const flowEditorRef = useRef<{
    getWorkflow: () => { nodes: unknown[]; edges: unknown[] }
    setWorkflow: (w: { nodes: unknown[]; edges: unknown[] }) => void
  } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const exportSectionRef = useRef<HTMLDivElement>(null)

  const registerFlowEditor = useCallback((api: {
    getWorkflow: () => { nodes: unknown[]; edges: unknown[] }
    setWorkflow: (w: { nodes: unknown[]; edges: unknown[] }) => void
  }) => {
    flowEditorRef.current = api
  }, [])

  const handleWorkflowUpdate = useCallback((newWorkflow: { nodes: unknown[]; edges: unknown[] }) => {
    setWorkflowUpdate(newWorkflow)
    if (flowEditorRef.current) {
      flowEditorRef.current.setWorkflow(newWorkflow)
    }
  }, [])

  const handleExport = useCallback(async () => {
    const workflow = flowEditorRef.current?.getWorkflow()
    if (!workflow) return

    setIsExporting(true)
    try {
      const res = await fetch(`${API_BASE}/api/export-python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as { files: Record<string, string> }
      setExportedFiles(data.files)
      // Scroll to export section after React renders it
      setTimeout(() => {
        exportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }, [])

  return (
    <div className="workspace workspace--enter">
      <div className="workspace__bg">
        <FaultyTerminal
          scale={2.7}
          gridMul={[2, 1]}
          digitSize={1.2}
          timeScale={0.5}
          pause={false}
          scanlineIntensity={0.5}
          glitchAmount={1}
          flickerAmount={1}
          noiseAmp={1}
          chromaticAberration={0}
          dither={0}
          curvature={0.1}
          tint="#942192"
          mouseReact
          mouseStrength={0.5}
          pageLoadAnimation
          brightness={0.6}
        />
      </div>

      <div className="workspace__scroll-container" ref={scrollContainerRef}>
        <div className="workspace__content">
          <div className="workspace__chat-widget">
            <Chat
              welcomeMessage={WORKSPACE_WELCOME}
              messages={messages}
              setMessages={setMessages}
              typewriterSpeed={25}
              compact
              completedTypewriterIds={completedTypewriterIds}
              onTypewriterComplete={onTypewriterComplete}
              mode="workspace"
              getCurrentWorkflow={() => flowEditorRef.current?.getWorkflow() || null}
              onWorkflowUpdate={handleWorkflowUpdate}
            />
          </div>

          <div
            className={`workspace__flow-widget ${flowFullscreen ? 'workspace__flow-widget--fullscreen' : ''}`}
            aria-expanded={flowFullscreen}
          >
            <div className="workspace__flow-toolbar">
              <span className="workspace__flow-title">Workflow</span>
              <div className="workspace__flow-toolbar-actions">
                <button
                  type="button"
                  className="workspace__export-btn"
                  onClick={handleExport}
                  disabled={isExporting}
                  title="Сгенерировать Python-проект и Telegram бота"
                >
                  {isExporting ? (
                    <span className="workspace__export-btn-spinner" />
                  ) : null}
                  {isExporting ? 'Экспорт...' : 'Export'}
                </button>
                <button
                  type="button"
                  className="workspace__flow-fullscreen-btn"
                  onClick={() => setFlowFullscreen((v) => !v)}
                  title={flowFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть на полный экран'}
                >
                  {flowFullscreen ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="workspace__flow-editor-wrap">
              <FlowEditor
                initialPrompt={buildPrompt ?? undefined}
                initialPromptRef={buildPromptRef}
                onFlowGenerated={onFlowGenerated}
                workflowUpdate={workflowUpdate}
                onRegisterApi={registerFlowEditor}
              />
            </div>
          </div>
        </div>

        {exportedFiles && (
          <div ref={exportSectionRef}>
            <ExportSection files={exportedFiles} />
          </div>
        )}
      </div>
    </div>
  )
}
