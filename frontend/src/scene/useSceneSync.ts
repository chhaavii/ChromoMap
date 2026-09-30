import { useEffect } from 'react'
import { api2 as client, onMockModeChange } from '../apiWithFallback'
import { useStore } from '../store'

/** Loads the graph (as_of aware) into the store. */
export async function refreshGraph(asOf?: string | null) {
  const s = useStore.getState()
  s.setLoadingGraph(true)
  try {
    const g = await client.graph(asOf)
    s.setGraph(g)
    s.setGraphError(null)
  } catch (err) {
    s.setGraphError(err instanceof Error ? err.message : 'Failed to load graph')
  } finally {
    s.setLoadingGraph(false)
  }
}

/** Refresh ledger + bubble; called after every ask and ingest. */
export async function refreshStats() {
  const s = useStore.getState()
  try {
    s.setLedger(await client.ledger())
  } catch {
    /* panel shows its own error state */
  }
  try {
    s.setBubble(await client.bubble())
  } catch {
    /* ignore */
  }
}

/** Mount-once hook: initial load + mock-mode subscription. */
export function useSceneSync() {
  useEffect(() => {
    void refreshGraph(useStore.getState().asOf)
    void refreshStats()
    return onMockModeChange((m) => {
      useStore.getState().setMockMode(m)
    })
  }, [])
}
