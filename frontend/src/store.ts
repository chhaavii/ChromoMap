import { create } from 'zustand'
import type {
  AskResult, Bubble, GraphData, IngestEvent, IngestSummary, Ledger,
} from './types'

export interface ChatEntry {
  id: number
  kind: 'ask' | 'ingest' | 'system' | 'error'
  text: string
  detail?: string
  ask?: AskResult
  ingest?: IngestSummary & { supersededEdges: string[]; newEdges: string[] }
  timestamp: number
}

export interface CompareRun {
  id: number
  question: string
  results: AskResult[]
}

interface StoreState {
  graph: GraphData
  mockMode: boolean
  loadingGraph: boolean
  graphError: string | null

  selectedNodeId: string | null
  asOf: string | null            // ISO string or null = now
  timelineRange: [number, number] | null  // [earliestMs, latestMs]

  lastAsk: AskResult | null
  chat: ChatEntry[]
  compareRun: CompareRun | null
  // animation triggers consumed by the 3D scene
  pulseSeq: number               // increments each time a path should play
  hebbianSeq: number             // increments after pagerank ask (weights changed)
  supersedeSeq: number           // increments after ingest with supersessions
  deleteSeq: number              // increments on delete (node dissolve)
  compareSeq: number             // increments on compare run
  lastIngest: IngestEvent | null // new/superseded ids for scene animation
  lastDeleted: string | null     // node id for dissolve animation
  consoleActive: boolean         // console section in view -> canvas interactive

  ledger: Ledger | null
  bubble: Bubble | null

  lowEffects: boolean

  setGraph: (g: GraphData) => void
  setLoadingGraph: (b: boolean) => void
  setGraphError: (e: string | null) => void
  setMockMode: (b: boolean) => void
  select: (id: string | null) => void
  setAsOf: (iso: string | null) => void
  setTimelineRange: (r: [number, number] | null) => void
  pushChat: (entry: Omit<ChatEntry, 'id' | 'timestamp'>) => void
  setCompareRun: (r: CompareRun | null) => void
  setLastAsk: (a: AskResult | null) => void
  setLedger: (l: Ledger) => void
  setBubble: (b: Bubble) => void
  toggleLowEffects: () => void
  firePulse: () => void
  fireHebbian: () => void
  fireSupersede: () => void
  fireDelete: () => void
  fireCompare: () => void
  setLastIngest: (e: IngestEvent | null) => void
  setLastDeleted: (id: string | null) => void
  setConsoleActive: (b: boolean) => void
}

let chatId = 1

export const useStore = create<StoreState>((set) => ({
  graph: { nodes: [], edges: [] },
  mockMode: false,
  loadingGraph: true,
  graphError: null,

  selectedNodeId: null,
  asOf: null,
  timelineRange: null,

  lastAsk: null,
  chat: [],
  compareRun: null,
  pulseSeq: 0,
  hebbianSeq: 0,
  supersedeSeq: 0,
  deleteSeq: 0,
  compareSeq: 0,
  lastIngest: null,
  lastDeleted: null,
  consoleActive: false,

  ledger: null,
  bubble: null,

  lowEffects: false,

  setGraph: (graph) => set({ graph }),
  setLoadingGraph: (loadingGraph) => set({ loadingGraph }),
  setGraphError: (graphError) => set({ graphError }),
  setMockMode: (mockMode) => set({ mockMode }),
  select: (selectedNodeId) => set({ selectedNodeId }),
  setAsOf: (asOf) => set({ asOf }),
  setTimelineRange: (timelineRange) => set({ timelineRange }),
  pushChat: (entry) =>
    set((s) => ({
      chat: [...s.chat, { ...entry, id: chatId++, timestamp: Date.now() }],
    })),
  setCompareRun: (compareRun) => set({ compareRun }),
  setLastAsk: (lastAsk) => set({ lastAsk }),
  setLedger: (ledger) => set({ ledger }),
  setBubble: (bubble) => set({ bubble }),
  toggleLowEffects: () => set((s) => ({ lowEffects: !s.lowEffects })),
  firePulse: () => set((s) => ({ pulseSeq: s.pulseSeq + 1 })),
  fireHebbian: () => set((s) => ({ hebbianSeq: s.hebbianSeq + 1 })),
  fireSupersede: () => set((s) => ({ supersedeSeq: s.supersedeSeq + 1 })),
  fireDelete: () => set((s) => ({ deleteSeq: s.deleteSeq + 1 })),
  fireCompare: () => set((s) => ({ compareSeq: s.compareSeq + 1 })),
  setLastIngest: (lastIngest) => set({ lastIngest }),
  setLastDeleted: (lastDeleted) => set({ lastDeleted }),
  setConsoleActive: (consoleActive) => set({ consoleActive }),
}))

/** Compute the timeline bounds from the graph's edge dates. */
export function timelineBounds(g: GraphData): [number, number] | null {
  const times: number[] = []
  for (const e of g.edges) {
    if (e.validFrom) times.push(new Date(e.validFrom).getTime())
    if (e.validTo) times.push(new Date(e.validTo).getTime())
  }
  if (times.length === 0) return null
  return [Math.min(...times), Math.max(...times)]
}
