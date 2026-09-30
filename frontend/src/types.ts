/** Internal UI types (camelCase) — mapped from the backend in api.ts. */

export interface UiNode {
  id: string
  label: string
  type: string
  cluster: string
  createdAt: string
  pinned: boolean
  muted: boolean
  tokenCost: number
  strength: number
  recency: number
}

export interface UiEdge {
  id: string
  sourceId: string
  targetId: string
  relation: string
  validFrom: string | null
  validTo: string | null
  recordedAt: string | null
  status: 'current' | 'superseded'
  supersededBy: string | null
  weight: number
  useCount: number
  lastUsedAt: string | null
  sourceText: string
  active: boolean | null
}

export interface GraphData {
  nodes: UiNode[]
  edges: UiEdge[]
}

export interface InfluenceEntry {
  nodeId: string
  score: number
}

export interface AskResult {
  answer: string
  strategy: 'full_dump' | 'flat_rag' | 'pagerank'
  tokensIn: number
  tokensOut: number
  latencyMs: number
  nodesUsed: string[]
  edgesUsed: string[]
  path: string[]
  influence: InfluenceEntry[]
  correct?: boolean | null
  error?: string
}

export interface StrategyStat {
  strategy: string
  avgTokensIn: number
  avgTokensOut: number
  avgLatencyMs: number
  queries: number
  accuracy: number | null
}

export interface NodeCost {
  nodeId: string
  label: string
  tokenCost: number
}

export interface Ledger {
  totalTokensIn: number
  totalTokensOut: number
  estimatedCostUsd: number
  byStrategy: StrategyStat[]
  byNode: NodeCost[]
  savingsVsFullDumpPct: number
  totalQueries: number
}

export interface DominantNode {
  nodeId: string
  label: string
  share: number
}

export interface Bubble {
  entropy: number
  maxEntropy: number
  bubbleScore: number
  topDominantNodes: DominantNode[]
  window: number
}

export interface HashInfo {
  valid: boolean
  length: number
  rootHash: string
}

export interface IngestSummary {
  nodesCreated: number
  edgesCreated: number
  edgesSuperseded: number
  tokensUsed: number
}

export interface BenchmarkRow {
  question: string
  expected: string
  answers: Record<string, { answer: string; correct: boolean | null }>
}

export interface BenchResult {
  error?: string
  questionsRun?: number
  strategies?: Array<{
    strategy: string
    accuracy: number | null
    avgTokensIn: number
    avgLatencyMs: number
  }>
  retrievalDiversity?: {
    entropy: number
    maxEntropy: number
    distinctNodes: number
  }
  results?: BenchmarkRow[]
}

export interface IngestEvent {
  nodesCreated: string[]
  edgesCreated: string[]
  edgesSuperseded: string[]
}

export type CompareTint = 'full_dump' | 'flat_rag' | 'pagerank'
