import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { CodeNode as CodeNodeType } from '../types'
import './Node.css'

function CodeNode({ data }: NodeProps<CodeNodeType>) {
  return (
    <div className="workflow-node workflow-node--code">
      <Handle type="target" position={Position.Left} id="input" className="workflow-node__handle" />
      
      <div className="workflow-node__header">
        <div className="workflow-node__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
        </div>
        <div className="workflow-node__label">{data.label || 'Code'}</div>
      </div>
      
      <div className="workflow-node__body">
        <div className="workflow-node__sub">{data.language || 'python'}</div>
      </div>
      
      <Handle type="source" position={Position.Right} id="output" className="workflow-node__handle" />
    </div>
  )
}

export default memo(CodeNode)
