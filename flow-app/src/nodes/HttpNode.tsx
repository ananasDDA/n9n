import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { HttpNode } from '../types'

import './Node.css'

function HttpNode({ data }: NodeProps<HttpNode>) {
  const method = (data.method as string) || 'GET'
  const url = data.url ? String(data.url).replace(/^https?:\/\//, '').slice(0, 24) : null
  const sub = url ? `${method} ${url}${(data.url as string)?.length > 24 ? '…' : ''}` : method
  return (
    <div className="workflow-node workflow-node--http">
      <Handle type="target" position={Position.Left} className="workflow-node__handle" />
      <div className="workflow-node__icon">🌐</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'HTTP'}</div>
        <div className="workflow-node__sub">{sub}</div>
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(HttpNode)
