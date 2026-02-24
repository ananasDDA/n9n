import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { KnowledgeNode as KnowledgeNodeType } from '../types'

import './Node.css'

function KnowledgeNode({ data }: NodeProps<KnowledgeNodeType>) {
  const d = data
  const sub = d.url ? String(d.url).slice(0, 24) + '…' : (d.documents?.length ? `${d.documents.length} док.` : null)
  return (
    <div className="workflow-node workflow-node--knowledge">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">📚</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{d.label || 'База знаний'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(KnowledgeNode)
