import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { HttpNode as HttpNodeType } from '../types'
import './Node.css'

function HttpNode({ data }: NodeProps<HttpNodeType>) {
  const method = data.method || 'GET'
  const url = data.url ? String(data.url).slice(0, 30) : null
  
  return (
    <div className="workflow-node workflow-node--http">
      <Handle type="target" position={Position.Left} id="input" className="workflow-node__handle" />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'HTTP'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className="workflow-node__sub">{method}</div>
        {url && <div className="workflow-node__sub">{url}...</div>}
      </div>
      
      <Handle type="source" position={Position.Right} id="output" className="workflow-node__handle" />
    </div>
  )
}

export default memo(HttpNode)
