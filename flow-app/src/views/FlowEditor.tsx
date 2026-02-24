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
}

export function FlowEditor({ initialPrompt, initialPromptRef, onFlowGenerated }: FlowEditorProps = {}) {
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
  const onUpdateNodeData = useCallback(
    (nodeId: string, dataPatch: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n)))
    },
    [setNodes]
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="sidebar__title">Узлы</h2>
        {SIDEBAR_NODES.map(({ type, label }) => (
          <div key={type} className="sidebar__item" draggable onDragStart={(e) => onDragStart(e, type)}>{label}</div>
        ))}
        <div className="sidebar__section">
          <h3 className="sidebar__subtitle">Протестировать агента</h3>
          <input type="text" className="sidebar__input" placeholder="Введите запрос для агента..." value={testInput} onChange={(e) => setTestInput(e.target.value)} />
          <label className="sidebar__checkbox">
            <input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} /> Стриминг ответа
          </label>
          <button type="button" className="btn btn--run" onClick={onRunTest} disabled={testStatus === 'loading' || nodes.length === 0}>
            {testStatus === 'loading' ? '…' : testStatus === 'error' ? 'Ошибка' : 'Запустить'}
          </button>
          {testResult && (
            <div className="test-result">
              {testResult.error && <div className="test-result__error">{testResult.error}</div>}
              {testResult.output !== undefined && testResult.output !== '' && <div className="test-result__output">{testResult.output}</div>}
            </div>
          )}
        </div>
        <div className="sidebar__section">
          <button type="button" className="btn btn--export" onClick={onExportPython} disabled={exportStatus === 'loading'}>
            {exportStatus === 'loading' ? '…' : exportStatus === 'error' ? '501 — скоро' : 'Экспорт в Python'}
          </button>
        </div>
        <div className="sidebar__section">
          <h3 className="sidebar__subtitle">Workflow на сервере</h3>
          <input type="text" className="sidebar__input" placeholder="Название workflow" value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} />
          <button type="button" className="btn btn--secondary" onClick={onSaveToApi}>Сохранить на сервер</button>
          <button type="button" className="btn btn--secondary" onClick={fetchWorkflows}>Обновить список</button>
          {workflows.length > 0 && (
            <ul className="sidebar__workflows">
              {workflows.map((w) => (
                <li key={w.id}><button type="button" className="sidebar__workflow-item" onClick={() => onLoadWorkflow(w.id)}>{w.name || w.id}</button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="sidebar__actions">
          <button type="button" className="btn btn--secondary" onClick={onSave}>Сохранить JSON</button>
          <label className="btn btn--secondary">Загрузить из файла
            <input type="file" accept=".json,application/json" onChange={onLoadFile} className="btn__file" />
          </label>
        </div>
      </aside>
      <Group orientation="horizontal" className="flow-editor__right">
        <ResizablePanel id="canvas" defaultSize={65} minSize={40}>
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
                <Panel position="top-center" className="flow-editor__generating-overlay">
                  Загрузка графа…
                </Panel>
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
        <Separator className="workspace__resize-handle workspace__resize-handle--v" />
        <ResizablePanel id="config" defaultSize={35} minSize={25}>
          <div className="flow-editor__config-wrap">
            <NodeConfigPanel node={selectedNode} onUpdate={onUpdateNodeData} />
          </div>
        </ResizablePanel>
      </Group>
    </div>
  )
}
