import { memo, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { KnowledgeNode as KnowledgeNodeType } from '../types'
import './Node.css'

function KnowledgeNode({ data }: NodeProps<KnowledgeNodeType>) {
  const preview = useMemo(() => {
    if (data.url) {
      return { type: 'url', text: String(data.url).slice(0, 25) + (data.url.length > 25 ? '…' : '') }
    }
    if (data.documents?.length) {
      const count = data.documents.length
      return { type: 'docs', text: `${count} doc${count > 1 ? 's' : ''}` }
    }
    return { type: 'empty', text: 'Empty' }
  }, [data.url, data.documents])

  const tooltipContent = useMemo(() => {
    if (data.url) return `URL: ${data.url}`
    if (data.documents?.length) {
      return data.documents.map((doc, i) => `Doc ${i + 1}: ${String(doc).slice(0, 100)}...`).join('\n\n')
    }
    return 'Add URL or documents in settings'
  }, [data.url, data.documents])

  return (
    <div className="workflow-node workflow-node--knowledge" title={tooltipContent}>
      <Handle type="target" position={Position.Left} id="input" className="workflow-node__handle" />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Knowledge'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className={`workflow-node__sub workflow-node__sub--${preview.type}`}>
          {preview.text}
        </div>
      </div>
      
      <Handle 
        type="source" 
        position={Position.Right} 
        id="output"
        className="workflow-node__handle workflow-node__handle--knowledge" 
      />
    </div>
  )
}

export default memo(KnowledgeNode)
