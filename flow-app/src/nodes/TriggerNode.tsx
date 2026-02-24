import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TriggerNode } from '../types'

import './Node.css'

const TRIGGER_LABELS: Record<string, string> = {
  webhook: 'Webhook',
  schedule: 'По расписанию',
  manual: 'Вручную',
}

function TriggerNode({ data }: NodeProps<TriggerNode>) {
  const sub = data.triggerType ? TRIGGER_LABELS[data.triggerType] ?? data.triggerType : null
  return (
    <div className="workflow-node workflow-node--trigger">
      <div className="workflow-node__icon">▶</div>
      <div className="workflow-node__body">
        <div className="workflow-node__label">{data.label || 'Триггер'}</div>
        {sub && <div className="workflow-node__sub">{sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} className="workflow-node__handle" />
    </div>
  )
}

export default memo(TriggerNode)
