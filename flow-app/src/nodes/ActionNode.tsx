import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ActionNode as ActionNodeType } from '../types'
import './Node.css'

function ActionNode({ data }: NodeProps<ActionNodeType>) {
  return (
    <div className="workflow-node workflow-node--action">
      <Handle type="target" position={Position.Left} id="input" className="workflow-node__handle" />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v8"/>
            <path d="M8 12h8"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Action'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className="workflow-node__sub">{data.actionType || 'transform'}</div>
      </div>
      
      <Handle type="source" position={Position.Right} id="output" className="workflow-node__handle" />
    </div>
  )
}

export default memo(ActionNode)
