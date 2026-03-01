import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Group, Panel as ResizablePanel, Separator } from 'react-resizable-panels'

import { nodeTypes } from '../nodes'
import type { NodeType } from '../types'
import { NodeConfigPanel } from '../components/NodeConfigPanel'

// Icon component for sidebar nodes
function NodeIcon({ type }: { type: NodeType }) {
  const icons: Record<NodeType, React.ReactNode> = {
    trigger: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    agent: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="9" cy="9" r="2"/>
        <path d="M15 8h2"/><path d="M15 12h2"/><path d="M9 16h6"/>
      </svg>
    ),
    http: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    ),
    knowledge: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    condition: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    action: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>
      </svg>
    ),
    code: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  }
  return <div className="sidebar__node-icon">{icons[type]}</div>
}

const initialNodes: Node[] = [
  { id: 'trigger-1', type: 'trigger', position: { x: 100, y: 150 }, data: { label: 'Триггер', triggerType: 'manual' } },
  { id: 'agent-1', type: 'agent', position: { x: 320, y: 150 }, data: { label: 'Агент', model: 'deepseek-chat', systemPrompt: 'Ты полезный ассистент.' } },
]
const initialEdges: Edge[] = [{ id: 'e1', source: 'trigger-1', target: 'agent-1' }]

const API_BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? 'http://localhost:8000'
const SIDEBAR_NODES: { type: NodeType; label: string }[] = [
  { type: 'trigger', label: 'Триггер' },
  { type: 'agent', label: 'Агент' },
  { type: 'http', label: 'HTTP' },
  { type: 'knowledge', label: 'База знаний' },
  { type: 'condition', label: 'Условие' },
]

interface FlowEditorProps {
  initialPrompt?: string
  initialPromptRef?: React.RefObject<string | null>
  onFlowGenerated?: () => void
  /** Внешнее обновление workflow (из чата) */
  workflowUpdate?: { nodes: unknown[]; edges: unknown[] } | null
  /** Callback для регистрации API методов */
  onRegisterApi?: (api: { getWorkflow: () => { nodes: unknown[]; edges: unknown[] }; setWorkflow: (w: { nodes: unknown[]; edges: unknown[] }) => void }) => void
}

export function FlowEditor({ initialPrompt, initialPromptRef, onFlowGenerated, workflowUpdate, onRegisterApi }: FlowEditorProps = {}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generatingWorkflow, setGeneratingWorkflow] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [testResult, setTestResult] = useState<{ output?: string; error?: string; steps?: unknown[] } | null>(null)
  const [streaming, setStreaming] = useState(true)
  const [workflows, setWorkflows] = useState<{ id: string; name: string; updated_at: string }[]>([])
  const [workflowName, setWorkflowName] = useState('')
  const { screenToFlowPosition: project, fitView } = useReactFlow()
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges])
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/reactflow') as NodeType | ''
      if (!type) return
      const position = project({ x: e.clientX, y: e.clientY })
      const label = SIDEBAR_NODES.find((n) => n.type === type)?.label ?? type
      setNodes((nds) => nds.concat({ id: `${type}-${Date.now()}`, type, position, data: { label } }))
    },
    [project, setNodes]
  )
  const onDragStart = useCallback((e: React.DragEvent, nodeType: NodeType) => {
    e.dataTransfer.setData('application/reactflow', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const onSave = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'workflow.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [nodes, edges])

  const onLoadFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const { nodes: n, edges: ed } = JSON.parse(reader.result as string)
          if (Array.isArray(n)) setNodes(n)
          if (Array.isArray(ed)) setEdges(ed)
        } catch { console.error('Invalid workflow JSON') }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [setNodes, setEdges]
  )

  // API для внешнего доступа (из чата)
  const getWorkflow = useCallback(() => ({ nodes, edges }), [nodes, edges])
  const setWorkflow = useCallback((w: { nodes: unknown[]; edges: unknown[] }) => {
    if (Array.isArray(w.nodes)) setNodes(w.nodes as Node[])
    if (Array.isArray(w.edges)) setEdges(w.edges as Edge[])
    // Применяем fitView после установки новых нод
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
  }, [setNodes, setEdges, fitView])

  // Регистрируем API при монтировании
  useEffect(() => {
    if (onRegisterApi) {
      onRegisterApi({ getWorkflow, setWorkflow })
    }
  }, [onRegisterApi, getWorkflow, setWorkflow])

  // Применяем внешнее обновление workflow (из чата)
  useEffect(() => {
    if (workflowUpdate) {
      setWorkflow(workflowUpdate)
    }
  }, [workflowUpdate, setWorkflow])

  // Измеряем контейнер и передаём явные width/height в React Flow (иначе граф не рендерится — ошибка 004)
  useEffect(() => {
    const el = canvasWrapRef.current
    if (!el) return
    const update = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) setCanvasSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const fallback = setTimeout(() => {
      setCanvasSize((prev) => (prev.width > 0 && prev.height > 0 ? prev : { width: 800, height: 500 }))
    }, 2500)
    return () => {
      ro.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  // fitView после появления размеров
  useEffect(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 150)
    return () => clearTimeout(t)
  }, [canvasSize.width, canvasSize.height, fitView])

  useEffect(() => {
    const promptFromRef = initialPromptRef?.current?.trim()
    const prompt = promptFromRef || initialPrompt?.trim()
    if (!prompt || !onFlowGenerated) return
    setGenerateError(null)
    setGeneratingWorkflow(true)
    let cancelled = false
    const run = async () => {
      await new Promise((r) => setTimeout(r, 150))
      if (cancelled) return
      try {
        const res = await fetch(`${API_BASE}/api/generate-workflow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && Array.isArray(data.nodes) && data.nodes.length > 0) {
          setNodes(data.nodes)
          setEdges(Array.isArray(data.edges) ? data.edges : [])
          setGenerateError(null)
          const doFitView = () => fitView({ padding: 0.2, duration: 200 })
          requestAnimationFrame(() => setTimeout(doFitView, 100))
          setTimeout(() => doFitView(), 500)
          onFlowGenerated()
        } else {
          const errMsg = (data?.detail && (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))) || (res.status ? `Ошибка ${res.status}` : 'Не удалось сгенерировать граф')
          setGenerateError(errMsg)
          setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 100)
          onFlowGenerated()
        }
      } catch (e) {
        if (!cancelled) {
          setGenerateError(e instanceof Error ? e.message : 'Сеть или сервер недоступны')
          setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 100)
          onFlowGenerated()
        }
      } finally {
        if (!cancelled) setGeneratingWorkflow(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [initialPrompt, initialPromptRef, onFlowGenerated, setNodes, setEdges, fitView])

  const onExportPython = useCallback(async () => {
    setExportStatus('loading')
    try {
      const res = await fetch(`${API_BASE}/api/export-python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'workflow-project.zip'
      a.click()
      URL.revokeObjectURL(a.href)
      setExportStatus('idle')
    } catch {
      setExportStatus('error')
      setTimeout(() => setExportStatus('idle'), 3000)
    }
  }, [nodes, edges])

  const onRunTest = useCallback(async () => {
    setTestStatus('loading')
    setTestResult(null)
    const payload = { nodes, edges, input: testInput }
    try {
      if (streaming) {
        const res = await fetch(`${API_BASE}/api/run-workflow-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText)
        const reader = res.body?.getReader()
        const dec = new TextDecoder()
        let output = ''
        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = dec.decode(value, { stream: true })
            for (const line of chunk.split('\n').filter((l) => l.startsWith('data: '))) {
              try {
                const obj = JSON.parse(line.slice(6).trim())
                if (obj.text) output += obj.text
                if (obj.error) throw new Error(obj.error)
                if (obj.done && obj.output !== undefined) output = obj.output
              } catch (e) { if (!(e instanceof SyntaxError)) throw e }
            }
            setTestResult((prev) => ({ ...prev, output }))
          }
        }
        setTestResult((prev) => ({ ...prev, output: output || prev?.output }))
      } else {
        const res = await fetch(`${API_BASE}/api/run-workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : res.statusText)
        setTestResult({ output: data.output, error: data.error, steps: data.steps })
      }
      setTestStatus('idle')
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : String(err) })
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 2000)
    }
  }, [nodes, edges, testInput, streaming])

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/workflows`)
      if (res.ok) {
        const list = await res.json()
        setWorkflows(Array.isArray(list) ? list : [])
      }
    } catch { setWorkflows([]) }
  }, [])

  const onSaveToApi = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/workflows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: workflowName || 'Без названия', nodes, edges }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText)
      await fetchWorkflows()
    } catch (e) { console.error(e) }
  }, [nodes, edges, workflowName, fetchWorkflows])

  const onLoadWorkflow = useCallback(async (wfId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/workflows/${wfId}`)
      if (!res.ok) throw new Error('Не найден')
      const wf = await res.json()
      if (Array.isArray(wf.nodes)) setNodes(wf.nodes)
      if (Array.isArray(wf.edges)) setEdges(wf.edges)
      if (wf.name) setWorkflowName(wf.name)
    } catch (e) { console.error(e) }
  }, [setNodes, setEdges])

  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])

  const selectedNode = nodes.find((n) => n.selected) ?? null
  const [panelOpenForNode, setPanelOpenForNode] = useState<string | null>(null)
  
  const onUpdateNodeData = useCallback(
    (nodeId: string, dataPatch: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n)))
    },
    [setNodes]
  )
  
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setPanelOpenForNode(node.id)
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })))
  }, [setNodes])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__header">
          <h2 className="sidebar__title">Nodes</h2>
        </div>
        
        <div className="sidebar__nodes">
          {SIDEBAR_NODES.map(({ type, label }) => (
            <div key={type} className="sidebar__node" draggable onDragStart={(e) => onDragStart(e, type)}>
              <NodeIcon type={type} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="sidebar__section sidebar__section--test">
          <div className="sidebar__section-header">
            <svg className="sidebar__section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <h3 className="sidebar__subtitle">Test Agent</h3>
          </div>
          
          <div className="test-panel">
            <textarea 
              className="test-panel__input" 
              placeholder="Enter message to test your agent..." 
              value={testInput} 
              onChange={(e) => setTestInput(e.target.value)}
              rows={3}
            />
            
            <div className="test-panel__controls">
              <label className="test-panel__checkbox">
                <input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} />
                <span>Stream</span>
              </label>
              
              <button 
                type="button" 
                className={`test-panel__btn ${testStatus === 'loading' ? 'test-panel__btn--loading' : ''}`} 
                onClick={onRunTest} 
                disabled={testStatus === 'loading' || nodes.length === 0}
                title={nodes.length === 0 ? 'Add nodes first' : 'Run test'}
              >
                {testStatus === 'loading' ? (
                  <>
                    <span className="test-panel__spinner" />
                    Running...
                  </>
                ) : testStatus === 'error' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Error
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Run
                  </>
                )}
              </button>
            </div>
            
            {testResult && (
              <div className={`test-panel__result ${testResult.error ? 'test-panel__result--error' : ''}`}>
                {testResult.error ? (
                  <div className="test-panel__error">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {testResult.error}
                  </div>
                ) : (
                  <div className="test-panel__output">{testResult.output}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="sidebar__section">
          <div className="sidebar__section-header">
            <svg className="sidebar__section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <h3 className="sidebar__subtitle">Export</h3>
          </div>
          <button type="button" className="btn btn--export" onClick={onExportPython} disabled={exportStatus === 'loading'}>
            {exportStatus === 'loading' ? (
              <><span className="btn__spinner" /> Exporting...</>
            ) : exportStatus === 'error' ? (
              'Not Available'
            ) : (
              'Export to Python'
            )}
          </button>
        </div>
        
        <div className="sidebar__section">
          <div className="sidebar__section-header">
            <svg className="sidebar__section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <h3 className="sidebar__subtitle">Server Workflows</h3>
          </div>
          <input type="text" className="sidebar__input" placeholder="Workflow name" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
          <div className="sidebar__btn-group">
            <button type="button" className="btn btn--secondary" onClick={onSaveToApi}>Save</button>
            <button type="button" className="btn btn--secondary" onClick={fetchWorkflows}>Refresh</button>
          </div>
          {workflows.length > 0 && (
            <ul className="sidebar__workflows">
              {workflows.map((w) => (
                <li key={w.id}>
                  <button type="button" className="sidebar__workflow-item" onClick={() => onLoadWorkflow(w.id)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    {w.name || w.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="sidebar__section sidebar__section--actions">
          <div className="sidebar__section-header">
            <svg className="sidebar__section-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <h3 className="sidebar__subtitle">File</h3>
          </div>
          <div className="sidebar__btn-group sidebar__btn-group--vertical">
            <button type="button" className="btn btn--secondary" onClick={onSave}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save JSON
            </button>
            <label className="btn btn--secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Load JSON
              <input type="file" accept=".json,application/json" onChange={onLoadFile} className="btn__file" />
            </label>
          </div>
        </div>
      </aside>
      <Group orientation="horizontal" className="flow-editor__right">
        <ResizablePanel id="canvas" defaultSize={panelOpenForNode && selectedNode ? 58 : 100} minSize={40}>
          <main
            className="canvas-wrap"
            style={{ width: '100%', height: '100%', minHeight: 300, position: 'relative', display: 'flex', flexDirection: 'column' }}
          >
            <div
              ref={canvasWrapRef}
              style={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%' }}
            >
              {canvasSize.width > 0 && canvasSize.height > 0 ? (
                <ReactFlow
                  width={canvasSize.width}
                  height={canvasSize.height}
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onInit={() => setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 0)}
                  nodeTypes={nodeTypes as NodeTypes}
                  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                  className="react-flow-canvas"
                >
              <Background />
              <Controls />
              <MiniMap />
              <Panel position="top-left" className="panel-title">Workflow Editor</Panel>
              {generateError && (
                <Panel position="top-center" className="flow-editor__generate-error">
                  <span>{generateError}</span>
                  <button type="button" className="flow-editor__generate-error-dismiss" onClick={() => setGenerateError(null)} aria-label="Закрыть">×</button>
                </Panel>
              )}
              {generatingWorkflow && (
                <div className="flow-editor__blur-overlay">
                  <div className="flow-editor__blur-content">
                    <div className="flow-editor__blur-spinner" />
                    <span className="flow-editor__blur-text">Generating workflow...</span>
                  </div>
                </div>
              )}
                </ReactFlow>
              ) : (
                <div className="flow-editor__canvas-placeholder">
                  <span>Канвас загружается…</span>
                  <span style={{ display: 'block', marginTop: 8, fontSize: 12 }}>Если чёрный экран — обновите страницу (Cmd+Shift+R)</span>
                </div>
              )}
            </div>
          </main>
        </ResizablePanel>
        {panelOpenForNode && selectedNode && (
          <>
            <Separator className="workspace__resize-handle workspace__resize-handle--v" />
            <ResizablePanel id="config" defaultSize={42} minSize={30}>
              <div className="flow-editor__config-wrap">
                <div className="config-panel__header">
                  <span className="config-panel__title-text">Node Configuration</span>
                  <button 
                    type="button" 
                    className="config-panel__close"
                    onClick={() => setPanelOpenForNode(null)}
                    title="Close panel"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                <NodeConfigPanel node={selectedNode} onUpdate={onUpdateNodeData} />
              </div>
            </ResizablePanel>
          </>
        )}
      </Group>
    </div>
  )
}
