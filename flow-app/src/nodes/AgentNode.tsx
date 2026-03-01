import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { AgentNode as AgentNodeType } from '../types'
import './Node.css'

function AgentNode({ data }: NodeProps<AgentNodeType>) {
  const sub = data.model ? String(data.model) : null
  
  return (
    <div className="workflow-node workflow-node--agent">
      {/* Main input */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="workflow-node__handle" 
      />
      
      {/* Context input for knowledge */}
      <Handle 
        type="target" 
        position={Position.Top} 
        id="context"
        className="workflow-node__handle workflow-node__handle--context"
      />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="9" cy="9" r="2"/>
            <path d="M15 8h2"/>
            <path d="M15 12h2"/>
            <path d="M9 16h6"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Agent'}</div>
      </div>
      
      <div className="workflow-node__body">
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      
      <Handle type="source" position={Position.Right} id="output" className="workflow-node__handle" />
    </div>
  )
}

export default memo(AgentNode)
