import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ConditionNode } from '../types'

import './Node.css'

function ConditionNode({ data }: NodeProps<ConditionNode>) {
  const sub = data.condition ? String(data.condition).slice(0, 20) : null
  return (
    <div className="workflow-node workflow-node--condition">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">◇</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'Условие'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} id="true" className="workflow-node__handle" />
      <Handle type="source" position={Position.Bottom} id="false" className="workflow-node__handle" />
    </div>
  )
}

export default memo(ConditionNode)
