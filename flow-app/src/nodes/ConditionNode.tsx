import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ConditionNode as ConditionNodeType } from '../types'
import './Node.css'

function ConditionNode({ data }: NodeProps<ConditionNodeType>) {
  return (
    <div className="workflow-node workflow-node--condition">
      <Handle type="target" position={Position.Left} id="input" className="workflow-node__handle" />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Condition'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className="workflow-node__sub">{data.condition || 'not_empty'}</div>
      </div>
      
      <Handle type="source" position={Position.Right} id="true" className="workflow-node__handle" />
      <Handle type="source" position={Position.Bottom} id="false" className="workflow-node__handle" />
    </div>
  )
}

export default memo(ConditionNode)
