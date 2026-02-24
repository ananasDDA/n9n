import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentNode } from '../types'

import './Node.css'

function AgentNode({ data }: NodeProps<AgentNode>) {
  const sub = data.model ? String(data.model) : null
  return (
    <div className="workflow-node workflow-node--agent">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">🤖</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'Агент'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(AgentNode)
