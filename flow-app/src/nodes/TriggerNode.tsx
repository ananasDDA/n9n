import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TriggerNode as TriggerNodeType } from '../types'
import './Node.css'

function TriggerNode({ data }: NodeProps<TriggerNodeType>) {
  return (
    <div className="workflow-node workflow-node--trigger">
      {/* No input handle - trigger is the start */}
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Trigger'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className="workflow-node__sub">{data.triggerType || 'manual'}</div>
      </div>
      
      {/* Only output handle on the right */}
      <Handle type="source" position={Position.Right} id="output" className="workflow-node__handle" />
    </div>
  )
}

export default memo(TriggerNode)
