import TriggerNode from './TriggerNode'
import ActionNode from './ActionNode'
import CodeNode from './CodeNode'
import AgentNode from './AgentNode'
import HttpNode from './HttpNode'
import ConditionNode from './ConditionNode'
import KnowledgeNode from './KnowledgeNode'

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  code: CodeNode,
  agent: AgentNode,
  http: HttpNode,
  condition: ConditionNode,
  knowledge: KnowledgeNode,
}

export { TriggerNode, ActionNode, CodeNode, AgentNode, HttpNode, ConditionNode, KnowledgeNode }
