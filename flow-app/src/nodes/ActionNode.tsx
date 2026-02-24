import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ActionNode } from '../types'

import './Node.css'

const ACTION_LABELS: Record<string, string> = {
  http: 'HTTP',
  transform: 'Преобразование',
  condition: 'Условие',
}

function ActionNode({ data }: NodeProps<ActionNode>) {
  const sub = data.actionType ? ACTION_LABELS[data.actionType] ?? data.actionType : null
  return (
    <div className="workflow-node workflow-node--action">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">⚡</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'Действие'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(ActionNode)
