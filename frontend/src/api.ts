/**
 * Backend adapter — ALL field-name mapping lives here.
 * If the backend renames a field, this is the one file to touch.
 */
import type {
  AskResult,
  BenchResult,
  Bubble,
  GraphData,
  HashInfo,
  IngestSummary,
  Ledger,
  UiEdge,
  UiNode,
} from './types'

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export const FORCE_MOCK: boolean =
  (import.meta.env.VITE_USE_MOCK as string | undefined) === 'true'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* keep status text */
    }
    throw new Error(`${path} failed: ${detail}`)
  }
  return res.json() as Promise<T>
}

// ---------- raw backend shapes (snake_case) ----------

interface RawNode {
  id: string
  label: string
  type: string
  cluster: string
  created_at: string
  pinned: boolean
  muted: boolean
  token_cost: number
  strength: number
  recency: number
}

interface RawEdge {
  id: string
  source_id: string
  target_id: string
  relation: string
  valid_from: string | null
  valid_to: string | null
  recorded_at: string | null
  status: 'current' | 'superseded'
  superseded_by: string | null
  weight: number
  use_count: number
  last_used_at: string | null
  source_text: string
  active: boolean | null
}

const mapNode = (n: RawNode): UiNode => ({
  id: n.id,
  label: n.label,
  type: n.type,
  cluster: n.cluster,
  createdAt: n.created_at,
  pinned: n.pinned,
  muted: n.muted,
  tokenCost: n.token_cost,
  strength: n.strength,
  recency: n.recency,
})

const mapEdge = (e: RawEdge): UiEdge => ({
  id: e.id,
  sourceId: e.source_id,
  targetId: e.target_id,
  relation: e.relation,
  validFrom: e.valid_from,
  validTo: e.valid_to,
  recordedAt: e.recorded_at,
  status: e.status,
  supersededBy: e.superseded_by,
  weight: e.weight,
  useCount: e.use_count,
  lastUsedAt: e.last_used_at,
  sourceText: e.source_text,
  active: e.active,
})

// ---------- typed API functions ----------

export async function apiGraph(asOf?: string | null): Promise<GraphData> {
  const raw = await req<{ nodes: RawNode[]; edges: RawEdge[] }>(
    `/graph${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`,
  )
  return { nodes: raw.nodes.map(mapNode), edges: raw.edges.map(mapEdge) }
}

export async function apiIngest(
  text: string,
): Promise<IngestSummary> {
  const raw = await req<{
    nodes_created: number
    edges_created: number
    edges_superseded: number
    tokens_used: number
  }>('/memory/ingest', { method: 'POST', body: JSON.stringify({ text }) })
  return {
    nodesCreated: raw.nodes_created,
    edgesCreated: raw.edges_created,
    edgesSuperseded: raw.edges_superseded,
    tokensUsed: raw.tokens_used,
  }
}

export async function apiAsk(
  question: string,
  strategy: 'full_dump' | 'flat_rag' | 'pagerank',
  bubble: number,
): Promise<AskResult> {
  const raw = await req<Record<string, unknown>>('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, strategy, bubble }),
  })
  return {
    answer: raw.answer as string,
    strategy: raw.strategy as AskResult['strategy'],
    tokensIn: raw.tokens_in as number,
    tokensOut: raw.tokens_out as number,
    latencyMs: raw.latency_ms as number,
    nodesUsed: raw.nodes_used as string[],
    edgesUsed: raw.edges_used as string[],
    path: raw.path as string[],
    influence: (raw.influence as Array<{ node_id: string; score: number }>).map((i) => ({
      nodeId: i.node_id,
      score: i.score,
    })),
  }
}

export async function apiCompare(
  question: string,
  expectedAnswer: string | null,
): Promise<AskResult[]> {
  const raw = await req<{ results: Array<Record<string, unknown>> }>('/ask/compare', {
    method: 'POST',
    body: JSON.stringify({ question, expected_answer: expectedAnswer }),
  })
  return raw.results.map((raw) => ({
    answer: (raw.answer as string) ?? '',
    strategy: raw.strategy as AskResult['strategy'],
    tokensIn: (raw.tokens_in as number) ?? 0,
    tokensOut: (raw.tokens_out as number) ?? 0,
    latencyMs: (raw.latency_ms as number) ?? 0,
    nodesUsed: (raw.nodes_used as string[]) ?? [],
    edgesUsed: (raw.edges_used as string[]) ?? [],
    path: (raw.path as string[]) ?? [],
    influence: ((raw.influence as Array<{ node_id: string; score: number }>) ?? []).map((i) => ({
      nodeId: i.node_id,
      score: i.score,
    })),
    correct: (raw.correct as boolean | null) ?? null,
    error: raw.error as string | undefined,
  }))
}

export async function apiLedger(): Promise<Ledger> {
  const raw = await req<Record<string, unknown>>('/ledger')
  return {
    totalTokensIn: raw.total_tokens_in as number,
    totalTokensOut: raw.total_tokens_out as number,
    estimatedCostUsd: raw.estimated_cost_usd as number,
    byStrategy: (raw.by_strategy as Array<Record<string, unknown>>).map((s) => ({
      strategy: s.strategy as string,
      avgTokensIn: s.avg_tokens_in as number,
      avgTokensOut: (s.avg_tokens_out as number) ?? 0,
      avgLatencyMs: s.avg_latency_ms as number,
      queries: (s.queries as number) ?? 0,
      accuracy: (s.accuracy as number | null) ?? null,
    })),
    byNode: (raw.by_node as Array<Record<string, unknown>>).map((n) => ({
      nodeId: n.node_id as string,
      label: n.label as string,
      tokenCost: n.token_cost as number,
    })),
    savingsVsFullDumpPct: raw.savings_vs_full_dump_pct as number,
    totalQueries: raw.total_queries as number,
  }
}

export async function apiBubble(): Promise<Bubble> {
  const raw = await req<Record<string, unknown>>('/bubble')
  return {
    entropy: raw.entropy as number,
    maxEntropy: raw.max_entropy as number,
    bubbleScore: raw.bubble_score as number,
    topDominantNodes: (raw.top_dominant_nodes as Array<Record<string, unknown>>).map((d) => ({
      nodeId: d.node_id as string,
      label: d.label as string,
      share: d.share as number,
    })),
    window: raw.window as number,
  }
}

export async function apiHashlogVerify(): Promise<HashInfo> {
  const raw = await req<Record<string, unknown>>('/hashlog/verify')
  return {
    valid: raw.valid as boolean,
    length: raw.length as number,
    rootHash: raw.root_hash as string,
  }
}

export async function apiPin(id: string): Promise<void> {
  await req(`/node/${id}/pin`, { method: 'POST' })
}

export async function apiMute(id: string): Promise<void> {
  await req(`/node/${id}/mute`, { method: 'POST' })
}

export async function apiUnmute(id: string): Promise<void> {
  await req(`/node/${id}/unmute`, { method: 'POST' })
}

export async function apiDeleteNode(id: string): Promise<void> {
  await req(`/node/${id}`, { method: 'DELETE' })
}

export async function apiDecayTick(): Promise<{ edgesDecayed: number; totalEdges: number }> {
  const raw = await req<{ edges_decayed: number; total_edges: number }>('/decay/tick', {
    method: 'POST',
  })
  return { edgesDecayed: raw.edges_decayed, totalEdges: raw.total_edges }
}

export async function apiSeed(): Promise<void> {
  await req('/seed', { method: 'POST' })
}

export async function apiReset(): Promise<void> {
  await req('/reset', { method: 'POST' })
}

export async function apiBenchmarkRun(): Promise<BenchResult> {
  const raw = await req<Record<string, unknown>>('/benchmark/run')
  return {
    error: raw.error as string | undefined,
    questionsRun: raw.questions_run as number | undefined,
    strategies: (raw.strategies as Array<Record<string, unknown>> | undefined)?.map((s) => ({
      strategy: s.strategy as string,
      accuracy: (s.accuracy as number | null) ?? null,
      avgTokensIn: s.avg_tokens_in as number,
      avgLatencyMs: s.avg_latency_ms as number,
    })),
    retrievalDiversity: raw.retrieval_diversity as BenchResult['retrievalDiversity'],
    results: raw.results as BenchResult['results'],
  }
}
