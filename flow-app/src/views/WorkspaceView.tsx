import { useState } from 'react'
import FaultyTerminal from '../backgrounds/FaultyTerminal'
import { Chat } from '../components/Chat'
import type { ChatMessage } from '../components/Chat'
import { FlowEditor } from './FlowEditor'
import './WorkspaceView.css'

const WELCOME = `Привет. Я помогу спроектировать агента или workflow.

Кратко опиши задачу — при необходимости задам уточняющие вопросы. Когда всё будет ясно, подскажу нажать **Build** и откроется редактор.`

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
      <div className="workspace__content">
        <div className="workspace__chat-widget">
          <Chat
            welcomeMessage={WELCOME}
            messages={messages}
            setMessages={setMessages}
            typewriterSpeed={25}
            compact
            completedTypewriterIds={completedTypewriterIds}
            onTypewriterComplete={onTypewriterComplete}
          />
        </div>
        <div
          className={`workspace__flow-widget ${flowFullscreen ? 'workspace__flow-widget--fullscreen' : ''}`}
          aria-expanded={flowFullscreen}
        >
          <div className="workspace__flow-toolbar">
            <span className="workspace__flow-title">Workflow</span>
            <button
              type="button"
              className="workspace__flow-fullscreen-btn"
              onClick={() => setFlowFullscreen((v) => !v)}
              title={flowFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть на полный экран'}
            >
              {flowFullscreen ? '✕ Закрыть' : '⛶ На полный экран'}
            </button>
          </div>
          <div className="workspace__flow-editor-wrap">
            <FlowEditor
              initialPrompt={buildPrompt ?? undefined}
              initialPromptRef={buildPromptRef}
              onFlowGenerated={onFlowGenerated}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
