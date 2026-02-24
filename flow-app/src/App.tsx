import { useCallback, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { ChatMessage } from './components/Chat'
import { LandingView } from './views/LandingView'
import { WorkspaceView } from './views/WorkspaceView'

function App() {
  const [view, setView] = useState<'landing' | 'workspace'>('landing')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [showBuildButton, setShowBuildButton] = useState(false)
  const [buildPrompt, setBuildPrompt] = useState<string | null>(null)
  const buildPromptRef = useRef<string | null>(null)
  const [completedTypewriterIds, setCompletedTypewriterIds] = useState<Set<string>>(() => new Set())

  const openProject = useCallback(() => {
    const rev = [...messages].reverse()
    const lastUser = rev.find((m) => m.role === 'user')
    const lastAssistant = rev.find((m) => m.role === 'assistant')
    const userPart = lastUser?.content?.trim() || ''
    const assistantPart = lastAssistant?.content?.trim()?.slice(0, 1500) || ''
    const combined = userPart
      ? (assistantPart ? `${userPart}\n\nКонтекст ответа ассистента (кратко): ${assistantPart}` : userPart)
      : assistantPart || null
    const promptToUse = combined || 'Простой агент-ассистент'
    buildPromptRef.current = promptToUse
    setBuildPrompt(promptToUse)
    setView('workspace')
  }, [messages])

  const onFlowGenerated = useCallback(() => {
    setTimeout(() => {
      buildPromptRef.current = null
      setBuildPrompt(null)
    }, 2000)
  }, [])

  if (view === 'landing') {
    return (
      <LandingView
        messages={messages}
        setMessages={setMessages}
        showBuildButton={showBuildButton}
        setShowBuildButton={setShowBuildButton}
        onBuild={openProject}
        completedTypewriterIds={completedTypewriterIds}
        onTypewriterComplete={(id) => setCompletedTypewriterIds((s) => new Set(s).add(id))}
      />
    )
  }

  return (
    <ReactFlowProvider>
      <WorkspaceView
        messages={messages}
        setMessages={setMessages}
        buildPrompt={buildPrompt}
        buildPromptRef={buildPromptRef}
        completedTypewriterIds={completedTypewriterIds}
        onTypewriterComplete={(id) => setCompletedTypewriterIds((s) => new Set(s).add(id))}
        onFlowGenerated={onFlowGenerated}
      />
    </ReactFlowProvider>
  )
}

export default App
