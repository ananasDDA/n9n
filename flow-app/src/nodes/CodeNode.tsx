import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CodeNode } from '../types'

import './Node.css'

function CodeNode({ data }: NodeProps<CodeNode>) {
  const sub = data.language ? String(data.language) : null
  return (
    <div className="workflow-node workflow-node--code">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">{'</>'}</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'Код'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(CodeNode)
