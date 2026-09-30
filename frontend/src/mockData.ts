/**
 * Mock mode: bundled demo graph mirroring POST /seed, plus fake API responses.
 * Enabled via VITE_USE_MOCK=true or automatically when the backend is unreachable.
 */
import type { AskResult, BenchResult, Bubble, GraphData, HashInfo, IngestSummary, Ledger } from './types'

// ---------- deterministic ids ----------
const N = {
  aisha: 'n-aisha', rahul: 'n-rahul', mohan: 'n-mohan', ben: 'n-ben', omar: 'n-omar',
  dubai: 'n-dubai', taipei: 'n-taipei', kyoto: 'n-kyoto', seoul: 'n-seoul',
  acme: 'n-acme', nimbus: 'n-nimbus', databeam: 'n-databeam', freelance: 'n-freelance',
  tuBerlin: 'n-tuberlin', designSchool: 'n-designschool',
  photography: 'n-photography', tennis: 'n-tennis', hiking: 'n-hiking', chess: 'n-chess', bouldering: 'n-bouldering',
  ai: 'n-ai', sustain: 'n-sustain', startups: 'n-startups',
  techconf: 'n-techconf', miso: 'n-miso',
  careerSwitch: 'n-careerswitch', mandarin: 'n-mandarin', freelanceLeap: 'n-freelanceleap',
}

const nodes: GraphData['nodes'] = [
  { id: N.aisha, label: 'Aisha', type: 'person', cluster: 'relationships', createdAt: '2026-01-01T00:00:00Z', pinned: false, muted: false, tokenCost: 320, strength: 12, recency: 0.95 },
  { id: N.rahul, label: 'Rahul', type: 'person', cluster: 'relationships', createdAt: '2026-01-01T00:00:01Z', pinned: false, muted: false, tokenCost: 210, strength: 5, recency: 0.55 },
  { id: N.mohan, label: 'Mohan', type: 'person', cluster: 'relationships', createdAt: '2026-01-01T00:00:02Z', pinned: false, muted: false, tokenCost: 240, strength: 6, recency: 0.9 },
  { id: N.ben, label: 'Ben', type: 'person', cluster: 'work', createdAt: '2026-01-01T00:00:03Z', pinned: false, muted: false, tokenCost: 180, strength: 5, recency: 0.6 },
  { id: N.omar, label: 'Omar', type: 'person', cluster: 'relationships', createdAt: '2026-01-01T00:00:04Z', pinned: false, muted: false, tokenCost: 90, strength: 3, recency: 0.4 },
  { id: N.dubai, label: 'Dubai', type: 'place', cluster: 'places', createdAt: '2026-01-01T00:00:05Z', pinned: false, muted: false, tokenCost: 150, strength: 6, recency: 0.5 },
  { id: N.taipei, label: 'Taipei', type: 'place', cluster: 'places', createdAt: '2026-01-01T00:00:06Z', pinned: false, muted: false, tokenCost: 160, strength: 4, recency: 1 },
  { id: N.kyoto, label: 'Kyoto', type: 'place', cluster: 'places', createdAt: '2026-01-01T00:00:07Z', pinned: false, muted: false, tokenCost: 60, strength: 2, recency: 0.8 },
  { id: N.seoul, label: 'Seoul', type: 'place', cluster: 'places', createdAt: '2026-01-01T00:00:08Z', pinned: false, muted: false, tokenCost: 55, strength: 2, recency: 0.85 },
  { id: N.acme, label: 'Acme', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:09Z', pinned: false, muted: false, tokenCost: 170, strength: 5, recency: 0.45 },
  { id: N.nimbus, label: 'Nimbus Labs', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:10Z', pinned: false, muted: false, tokenCost: 175, strength: 3, recency: 0.98 },
  { id: N.databeam, label: 'DataBeam', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:11Z', pinned: false, muted: false, tokenCost: 100, strength: 2, recency: 0.7 },
  { id: N.freelance, label: 'Freelance', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:12Z', pinned: false, muted: false, tokenCost: 80, strength: 2, recency: 0.5 },
  { id: N.tuBerlin, label: 'TU Berlin', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:13Z', pinned: false, muted: false, tokenCost: 70, strength: 1, recency: 0.2 },
  { id: N.designSchool, label: 'Design School', type: 'place', cluster: 'work', createdAt: '2026-01-01T00:00:14Z', pinned: false, muted: false, tokenCost: 65, strength: 1, recency: 0.15 },
  { id: N.photography, label: 'photography', type: 'topic', cluster: 'hobbies', createdAt: '2026-01-01T00:00:15Z', pinned: false, muted: false, tokenCost: 95, strength: 2, recency: 0.75 },
  { id: N.tennis, label: 'tennis', type: 'topic', cluster: 'hobbies', createdAt: '2026-01-01T00:00:16Z', pinned: false, muted: false, tokenCost: 85, strength: 2, recency: 0.7 },
  { id: N.hiking, label: 'hiking', type: 'topic', cluster: 'hobbies', createdAt: '2026-01-01T00:00:17Z', pinned: false, muted: false, tokenCost: 75, strength: 2, recency: 0.65 },
  { id: N.chess, label: 'chess', type: 'topic', cluster: 'hobbies', createdAt: '2026-01-01T00:00:18Z', pinned: false, muted: false, tokenCost: 60, strength: 1, recency: 0.6 },
  { id: N.bouldering, label: 'bouldering', type: 'topic', cluster: 'hobbies', createdAt: '2026-01-01T00:00:19Z', pinned: false, muted: false, tokenCost: 55, strength: 1, recency: 0.55 },
  { id: N.ai, label: 'AI', type: 'topic', cluster: 'other', createdAt: '2026-01-01T00:00:20Z', pinned: false, muted: false, tokenCost: 110, strength: 2, recency: 0.9 },
  { id: N.sustain, label: 'sustainable design', type: 'topic', cluster: 'other', createdAt: '2026-01-01T00:00:21Z', pinned: false, muted: false, tokenCost: 90, strength: 1, recency: 0.5 },
  { id: N.startups, label: 'startups', type: 'topic', cluster: 'other', createdAt: '2026-01-01T00:00:22Z', pinned: false, muted: false, tokenCost: 85, strength: 1, recency: 0.8 },
  { id: N.techconf, label: 'TechConf 2024', type: 'event', cluster: 'other', createdAt: '2026-01-01T00:00:23Z', pinned: false, muted: false, tokenCost: 70, strength: 1, recency: 0.82 },
  { id: N.miso, label: 'Miso', type: 'topic', cluster: 'other', createdAt: '2026-01-01T00:00:24Z', pinned: false, muted: false, tokenCost: 65, strength: 1, recency: 0.88 },
  { id: N.careerSwitch, label: 'Career Switch 2025', type: 'decision', cluster: 'work', createdAt: '2026-01-01T00:00:25Z', pinned: false, muted: false, tokenCost: 120, strength: 1, recency: 0.97 },
  { id: N.mandarin, label: 'Learn Mandarin', type: 'decision', cluster: 'other', createdAt: '2026-01-01T00:00:26Z', pinned: false, muted: false, tokenCost: 100, strength: 1, recency: 0.96 },
  { id: N.freelanceLeap, label: 'Freelance Leap 2023', type: 'decision', cluster: 'work', createdAt: '2026-01-01T00:00:27Z', pinned: false, muted: false, tokenCost: 80, strength: 1, recency: 0.3 },
]

type E = [keyof typeof N, string, keyof typeof N, string, string | null, 'current' | 'superseded']
const rawEdges: E[] = [
  ['aisha', 'dating', 'rahul', '2023-01-10T00:00:00Z', '2024-06-01T00:00:00Z', 'superseded'],
  ['aisha', 'dating', 'mohan', '2024-06-01T00:00:00Z', null, 'current'],
  ['aisha', 'friend_of', 'ben', '2023-02-01T00:00:00Z', null, 'current'],
  ['aisha', 'sibling_of', 'omar', '1998-05-01T00:00:00Z', null, 'current'],
  ['aisha', 'lives_in', 'dubai', '2023-03-01T00:00:00Z', '2025-02-01T00:00:00Z', 'superseded'],
  ['aisha', 'lives_in', 'taipei', '2025-02-01T00:00:00Z', null, 'current'],
  ['omar', 'lives_in', 'dubai', '2020-01-01T00:00:00Z', null, 'current'],
  ['aisha', 'visited', 'kyoto', '2024-11-01T00:00:00Z', '2024-11-10T00:00:00Z', 'current'],
  ['aisha', 'visited', 'seoul', '2025-05-01T00:00:00Z', '2025-05-10T00:00:00Z', 'current'],
  ['aisha', 'works_at', 'acme', '2023-03-01T00:00:00Z', '2025-03-01T00:00:00Z', 'superseded'],
  ['aisha', 'works_at', 'nimbus', '2025-03-01T00:00:00Z', null, 'current'],
  ['mohan', 'works_at', 'databeam', '2024-01-01T00:00:00Z', null, 'current'],
  ['rahul', 'works_at', 'freelance', '2023-10-01T00:00:00Z', null, 'current'],
  ['rahul', 'studies_at', 'tuBerlin', '2019-09-01T00:00:00Z', '2023-08-31T00:00:00Z', 'current'],
  ['aisha', 'studied_at', 'designSchool', '2019-09-01T00:00:00Z', '2023-01-31T00:00:00Z', 'current'],
  ['aisha', 'enjoys', 'photography', '2022-06-01T00:00:00Z', null, 'current'],
  ['aisha', 'enjoys', 'tennis', '2023-04-01T00:00:00Z', null, 'current'],
  ['aisha', 'enjoys', 'hiking', '2023-08-01T00:00:00Z', null, 'current'],
  ['mohan', 'enjoys', 'chess', '2021-01-01T00:00:00Z', null, 'current'],
  ['rahul', 'enjoys', 'bouldering', '2023-11-01T00:00:00Z', null, 'current'],
  ['aisha', 'interested_in', 'ai', '2024-01-01T00:00:00Z', null, 'current'],
  ['aisha', 'interested_in', 'sustain', '2023-05-01T00:00:00Z', null, 'current'],
  ['mohan', 'interested_in', 'startups', '2024-06-01T00:00:00Z', null, 'current'],
  ['aisha', 'met_at', 'techconf', '2024-09-12T00:00:00Z', '2024-09-14T00:00:00Z', 'current'],
  ['aisha', 'adopted', 'miso', '2024-03-15T00:00:00Z', null, 'current'],
  ['mohan', 'lives_in', 'taipei', '2024-06-01T00:00:00Z', null, 'current'],
  ['ben', 'lives_in', 'dubai', '2022-08-01T00:00:00Z', null, 'current'],
  ['ben', 'works_at', 'acme', '2022-08-01T00:00:00Z', null, 'current'],
  ['aisha', 'collaborates_with', 'ben', '2024-02-01T00:00:00Z', null, 'current'],
  ['aisha', 'planned', 'careerSwitch', '2025-01-01T00:00:00Z', null, 'current'],
  ['aisha', 'planned', 'mandarin', '2025-02-15T00:00:00Z', null, 'current'],
  ['rahul', 'planned', 'freelanceLeap', '2023-10-01T00:00:00Z', null, 'current'],
]

const supersededByMap: Record<string, string> = {
  'e-dating-rahul': 'e-dating-mohan',
  'e-lives-dubai': 'e-lives-taipei',
  'e-works-acme': 'e-works-nimbus',
}

export const MOCK_GRAPH: GraphData = {
  nodes,
  edges: rawEdges.map(([s, rel, o, vf, vt, status], i) => {
    const id = `e-${i}-${rel}`
    return {
      id, sourceId: N[s], targetId: N[o], relation: rel,
      validFrom: vf, validTo: vt, recordedAt: vf,
      status, supersededBy: supersededByMap[id] ?? null,
      weight: 1, useCount: 0, lastUsedAt: null,
      sourceText: `${N[s]} ${rel} ${N[o]}`, active: true,
    }
  }),
}

export const MOCK_LEDGER: Ledger = {
  totalTokensIn: 4820, totalTokensOut: 940, estimatedCostUsd: 0.0286,
  byStrategy: [
    { strategy: 'full_dump', avgTokensIn: 610, avgTokensOut: 45, avgLatencyMs: 2100, queries: 2, accuracy: null },
    { strategy: 'flat_rag', avgTokensIn: 260, avgTokensOut: 40, avgLatencyMs: 1500, queries: 1, accuracy: null },
    { strategy: 'pagerank', avgTokensIn: 180, avgTokensOut: 42, avgLatencyMs: 1400, queries: 3, accuracy: null },
  ],
  byNode: nodes.slice(0, 10).map((n) => ({ nodeId: n.id, label: n.label, tokenCost: n.tokenCost })),
  savingsVsFullDumpPct: 70.5, totalQueries: 6,
}

export const MOCK_BUBBLE: Bubble = {
  entropy: 2.41, maxEntropy: 3.32, bubbleScore: 0.274,
  topDominantNodes: [
    { nodeId: N.aisha, label: 'Aisha', share: 0.42 },
    { nodeId: N.mohan, label: 'Mohan', share: 0.18 },
    { nodeId: N.taipei, label: 'Taipei', share: 0.11 },
  ],
  window: 6,
}

export const MOCK_HASH: HashInfo = { valid: true, length: 4, rootHash: 'mock0chain0root0hash0000000000000000000000000000000000000000' }

export function mockAsk(question: string, strategy: AskResult['strategy']): AskResult {
  const g = MOCK_GRAPH
  const lower = question.toLowerCase()
  const pick = (label: string) => g.nodes.find((n) => n.label.toLowerCase() === label.toLowerCase())!
  // crude demo answers (labelled mock in the UI)
  let focus: string[] = ['Aisha']
  let answer = "I don't know. (mock mode — start the backend for real answers)"
  if (lower.includes('date')) { focus = ['Aisha', 'Mohan']; answer = 'Aisha is dating Mohan. (mock)' }
  else if (lower.includes('used to') || lower.includes('before')) { focus = ['Aisha', 'Rahul']; answer = 'Aisha used to date Rahul before Mohan. (mock)' }
  else if (lower.includes('live')) { focus = ['Aisha', 'Taipei']; answer = 'Aisha lives in Taipei. (mock)' }
  else if (lower.includes('work')) { focus = ['Aisha', 'Nimbus Labs']; answer = 'Aisha works at Nimbus Labs. (mock)' }
  else if (lower.includes('brother')) { focus = ['Aisha', 'Omar']; answer = "Aisha's brother is Omar. (mock)" }
  else if (lower.includes('hobb') || lower.includes('enjoy')) { focus = ['Aisha', 'photography']; answer = 'Aisha enjoys photography among other things. (mock)' }

  const ids = focus.map((l) => pick(l).id)
  const edgesUsed = g.edges
    .filter((e) => ids.includes(e.sourceId) && ids.includes(e.targetId))
    .map((e) => e.id)
  const infl = ids.map((id, i) => ({ nodeId: id, score: (ids.length - i) / ids.length }))
  return {
    answer,
    strategy,
    tokensIn: strategy === 'full_dump' ? 610 : strategy === 'flat_rag' ? 260 : 180,
    tokensOut: 42, latencyMs: 1200 + Math.random() * 400,
    nodesUsed: ids, edgesUsed, path: ids, influence: infl,
  }
}

export function mockCompare(question: string): AskResult[] {
  return (['full_dump', 'flat_rag', 'pagerank'] as const).map((s) => mockAsk(question, s))
}

export const MOCK_BENCH: BenchResult = {
  questionsRun: 15,
  strategies: [
    { strategy: 'full_dump', accuracy: 0.73, avgTokensIn: 640, avgLatencyMs: 2300 },
    { strategy: 'flat_rag', accuracy: 0.6, avgTokensIn: 275, avgLatencyMs: 1600 },
    { strategy: 'pagerank', accuracy: 0.87, avgTokensIn: 190, avgLatencyMs: 1450 },
  ],
  retrievalDiversity: { entropy: 3.1, maxEntropy: 3.61, distinctNodes: 12 },
  results: [],
}

export const MOCK_INGEST: IngestSummary = { nodesCreated: 2, edgesCreated: 1, edgesSuperseded: 1, tokensUsed: 150 }
