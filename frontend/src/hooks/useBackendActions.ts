import { useCallback } from 'react'
import { api2 } from '../apiWithFallback'
import { refreshGraph, refreshStats } from '../scene/useSceneSync'
import { useStore } from '../store'
import type { AskResult } from '../types'

/** POST /memory/ingest then refresh graph + stats; fires supersede animation. */
export function useIngest() {
  return useCallback(async (text: string) => {
    const s = useStore.getState()
    try {
      const summary = await api2.ingest(text)
      // refetch to learn which ids are new/superseded (compare by diff)
      const before = new Set(s.graph.nodes.map((n) => n.id))
      const beforeEdges = new Map(s.graph.edges.map((e) => [e.id, e.status]))
      const g = await api2.graph(s.asOf)
      s.setGraph(g)
      const newNodes = g.nodes.filter((n) => !before.has(n.id)).map((n) => n.id)
      const newEdges = g.edges.filter((e) => !beforeEdges.has(e.id)).map((e) => e.id)
      const supersededEdges = g.edges.filter(
        (e) => beforeEdges.get(e.id) === 'current' && e.status === 'superseded',
      ).map((e) => e.id)
      s.setLastIngest({
        nodesCreated: newNodes,
        edgesCreated: newEdges,
        edgesSuperseded: supersededEdges,
      })
      if (supersededEdges.length > 0) s.fireSupersede()
      s.pushChat({
        kind: 'ingest',
        text: `Added ${summary.nodesCreated} node${summary.nodesCreated === 1 ? '' : 's'}, ${summary.edgesCreated} connection${summary.edgesCreated === 1 ? '' : 's'}` +
          (summary.edgesSuperseded > 0 ? `, superseded ${summary.edgesSuperseded}` : '') +
          ` — ${summary.tokensUsed} tokens.`,
        ingest: { ...summary, supersededEdges, newEdges },
      })
      void refreshStats()
      return summary
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ingest failed'
      s.pushChat({ kind: 'error', text: msg })
      throw err
    }
  }, [])
}

/** POST /ask then play the path animation; Hebbian refresh when pagerank. */
export function useAsk() {
  return useCallback(async (question: string, strategy: AskResult['strategy'], bubble: number) => {
    const s = useStore.getState()
    try {
      const result = await api2.ask(question, strategy, bubble)
      s.pushChat({ kind: 'ask', text: question, ask: result })
      s.setCompareRun(null)
      s.setLastAsk(result)
      void refreshStats()
      if (strategy === 'pagerank') {
        // weights may have changed -> refetch and tween edge thickness
        const g = await api2.graph(s.asOf)
        s.setGraph(g)
        s.fireHebbian()
      }
      s.firePulse()
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ask failed'
      s.pushChat({ kind: 'error', text: msg })
      throw err
    }
  }, [])
}

/** POST /ask/compare — sequential three-tint animation handled by the scene. */
export function useCompare() {
  return useCallback(async (question: string, expected: string | null) => {
    const s = useStore.getState()
    try {
      const results = await api2.compare(question, expected)
      s.setCompareRun({ id: Date.now(), question, results })
      s.fireCompare()
      void refreshStats()
      return results
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Compare failed'
      s.pushChat({ kind: 'error', text: msg })
      throw err
    }
  }, [])
}

/** POST /seed then full refresh. */
export function useSeed() {
  return useCallback(async () => {
    const s = useStore.getState()
    await api2.seed()
    await refreshGraph(s.asOf)
    await refreshStats()
    s.pushChat({ kind: 'system', text: 'Demo data loaded.' })
  }, [])
}

/** POST /reset then full refresh. */
export function useReset() {
  return useCallback(async () => {
    const s = useStore.getState()
    await api2.reset()
    await refreshGraph(null)
    await refreshStats()
    s.pushChat({ kind: 'system', text: 'Memory wiped.' })
  }, [])
}

/** POST /decay/tick then refetch graph to tween weights down. */
export function useDecayTick() {
  return useCallback(async () => {
    const s = useStore.getState()
    const r = await api2.decayTick()
    const g = await api2.graph(s.asOf)
    s.setGraph(g)
    s.fireHebbian()
    s.pushChat({ kind: 'system', text: `Decay tick: ${r.edgesDecayed}/${r.totalEdges} connections weakened.` })
    return r
  }, [])
}

/** Node ops: pin/mute/unmute/delete with graph refresh. */
export function useNodeOps() {
  return useCallback(async (op: 'pin' | 'mute' | 'unmute' | 'delete', id: string) => {
    const s = useStore.getState()
    if (op === 'pin') await api2.pin(id)
    else if (op === 'mute') await api2.mute(id)
    else if (op === 'unmute') await api2.unmute(id)
    else if (op === 'delete') {
      s.setLastDeleted(id)
      s.fireDelete()
      await api2.deleteNode(id)
      s.select(null)
    }
    await refreshGraph(s.asOf)
    await refreshStats()
  }, [])
}
