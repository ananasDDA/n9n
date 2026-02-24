import FaultyTerminal from '../backgrounds/FaultyTerminal'
import { Chat } from '../components/Chat'
import type { ChatMessage } from '../components/Chat'
import './LandingView.css'

const WELCOME = `Привет. Я помогу спроектировать агента или workflow.

Кратко опиши задачу — при необходимости задам уточняющие вопросы. Когда всё будет ясно, подскажу нажать **Build** и откроется редактор.`

interface LandingViewProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  showBuildButton: boolean
  setShowBuildButton: (v: boolean) => void
  onBuild: () => void
  completedTypewriterIds?: Set<string>
  onTypewriterComplete?: (messageId: string) => void
}

export function LandingView({
  messages,
  setMessages,
  showBuildButton,
  setShowBuildButton,
  onBuild,
  completedTypewriterIds,
  onTypewriterComplete,
}: LandingViewProps) {
  return (
    <div className="landing">
      <div className="landing__bg">
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
      <div className="landing__content">
        <div className="landing__chat-wrap">
          <Chat
            welcomeMessage={WELCOME}
            messages={messages}
            setMessages={setMessages}
            onReadyToCreate={() => setShowBuildButton(true)}
            typewriterSpeed={25}
            welcomeImmediate
            completedTypewriterIds={completedTypewriterIds}
            onTypewriterComplete={onTypewriterComplete}
          />
        </div>
        {showBuildButton && (
          <div className="landing__build-wrap">
            <button
              type="button"
              className="landing__build-btn"
              onClick={onBuild}
              title="Открыть редактор графа: ваш запрос и ответ копайлота отправятся на сервер, по ним соберётся workflow (ноды и связи) и отобразится на канвасе справа"
            >
              Build
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
