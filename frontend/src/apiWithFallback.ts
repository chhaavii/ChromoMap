/**
 * API calls with automatic mock fallback.
 * If FORCE_MOCK or the first real call fails with a network error, mock data is
 * served and `mockMode` flips on so the UI can show the offline chip.
 */
import * as api from './api'
import { FORCE_MOCK } from './api'
import {
  MOCK_BENCH, MOCK_BUBBLE, MOCK_GRAPH, MOCK_HASH, MOCK_INGEST, MOCK_LEDGER,
  mockAsk, mockCompare,
} from './mockData'
import type {
  AskResult, BenchResult, Bubble, GraphData, HashInfo, IngestSummary, Ledger,
} from './types'

export let mockMode = FORCE_MOCK
const listeners = new Set<(m: boolean) => void>()

export function onMockModeChange(fn: (m: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setMock(m: boolean) {
  if (mockMode !== m) {
    mockMode = m
    listeners.forEach((fn) => fn(m))
  }
}

/** Network-level failure (backend down) -> mock. HTTP errors (4xx/5xx) -> throw. */
async function withFallback<T>(real: () => Promise<T>, mock: () => T): Promise<T> {
  if (FORCE_MOCK) return mock()
  try {
    const out = await real()
    setMock(false)
    return out
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      setMock(true)
      return mock()
    }
    throw err
  }
}

export const api2 = {
  graph: (asOf?: string | null): Promise<GraphData> =>
    withFallback(() => api.apiGraph(asOf), () => filterMockGraph(asOf)),
  ingest: (text: string): Promise<IngestSummary> =>
    withFallback(() => api.apiIngest(text), () => MOCK_INGEST),
  ask: (q: string, strategy: AskResult['strategy'], bubble: number): Promise<AskResult> =>
    withFallback(() => api.apiAsk(q, strategy, bubble), () => mockAsk(q, strategy)),
  compare: (q: string, expected: string | null): Promise<AskResult[]> =>
    withFallback(() => api.apiCompare(q, expected), () => mockCompare(q)),
  ledger: (): Promise<Ledger> => withFallback(() => api.apiLedger(), () => MOCK_LEDGER),
  bubble: (): Promise<Bubble> => withFallback(() => api.apiBubble(), () => MOCK_BUBBLE),
  hashlogVerify: (): Promise<HashInfo> =>
    withFallback(() => api.apiHashlogVerify(), () => MOCK_HASH),
  pin: (id: string) => withFallback(() => api.apiPin(id), () => undefined),
  mute: (id: string) => withFallback(() => api.apiMute(id), () => undefined),
  unmute: (id: string) => withFallback(() => api.apiUnmute(id), () => undefined),
  deleteNode: (id: string) => withFallback(() => api.apiDeleteNode(id), () => undefined),
  decayTick: () => withFallback(() => api.apiDecayTick(), () => ({ edgesDecayed: 4, totalEdges: 32 })),
  seed: () => withFallback(() => api.apiSeed(), () => undefined),
  reset: () => withFallback(() => api.apiReset(), () => undefined),
  benchmarkRun: (): Promise<BenchResult> =>
    withFallback(() => api.apiBenchmarkRun(), () => MOCK_BENCH),
}

/** Mock /graph?as_of= support: fade edges not yet started or already closed. */
function filterMockGraph(asOf?: string | null): GraphData {
  if (!asOf) {
    return { ...MOCK_GRAPH, edges: MOCK_GRAPH.edges.map((e) => ({ ...e, active: true })) }
  }
  const ref = new Date(asOf).getTime()
  return {
    ...MOCK_GRAPH,
    edges: MOCK_GRAPH.edges.map((e) => {
      const from = e.validFrom ? new Date(e.validFrom).getTime() : -Infinity
      const to = e.validTo ? new Date(e.validTo).getTime() : Infinity
      return { ...e, active: from <= ref && ref < to }
    }),
  }
}
