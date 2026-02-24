import type { Node } from '@xyflow/react'

export type NodeType =
  | 'trigger'
  | 'action'
  | 'code'
  | 'agent'
  | 'http'
  | 'condition'
  | 'knowledge'

export interface TriggerNodeData extends Record<string, unknown> {
  label: string
  triggerType?: 'webhook' | 'schedule' | 'manual'
}

export interface ActionNodeData extends Record<string, unknown> {
  label: string
  actionType?: 'http' | 'transform' | 'condition'
}

export interface CodeNodeData extends Record<string, unknown> {
  label: string
  language?: 'python'
}

export interface AgentNodeData extends Record<string, unknown> {
  label: string
  model?: string
  systemPrompt?: string
  provider?: string
  baseUrl?: string
  apiKey?: string
  tools?: Array<{ name?: string; description?: string; type?: string; url?: string; method?: string }>
}

export interface HttpNodeData extends Record<string, unknown> {
  label: string
  method?: string
  url?: string
}

export interface ConditionNodeData extends Record<string, unknown> {
  label: string
  condition?: string
}

export interface KnowledgeNodeData extends Record<string, unknown> {
  label: string
  url?: string
  documents?: string[]
}

export type TriggerNode = Node<TriggerNodeData, 'trigger'>
export type ActionNode = Node<ActionNodeData, 'action'>
export type CodeNode = Node<CodeNodeData, 'code'>
export type AgentNode = Node<AgentNodeData, 'agent'>
export type HttpNode = Node<HttpNodeData, 'http'>
export type ConditionNode = Node<ConditionNodeData, 'condition'>
export type KnowledgeNode = Node<KnowledgeNodeData, 'knowledge'>

export type WorkflowNodeData =
  | TriggerNodeData
  | ActionNodeData
  | CodeNodeData
  | AgentNodeData
  | HttpNodeData
  | ConditionNodeData
  | KnowledgeNodeData
