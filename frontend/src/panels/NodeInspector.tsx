import { useState } from 'react'
import { GlassPanel, PillButton } from '../components/GlassPanel'
import { useStore } from '../store'
import { useNodeOps } from '../hooks/useBackendActions'

export default function NodeInspector() {
  const selectedId = useStore((s) => s.selectedNodeId)
  const graph = useStore((s) => s.graph)
  const select = useStore((s) => s.select)
  const doOp = useNodeOps()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const node = graph.nodes.find((n) => n.id === selectedId)
  if (!node) return null

  const connected = graph.edges.filter((e) => e.sourceId === node.id || e.targetId === node.id)
  const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id.slice(0, 8)

  async function run(op: 'pin' | 'mute' | 'unmute' | 'delete') {
    setBusy(true)
    try {
      await doOp(op, node!.id)
      if (op === 'delete') setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-30 w-[min(420px,92vw)] -translate-x-1/2">
      <GlassPanel className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white drop-shadow">{node.label}</h3>
              {node.pinned && (
                <span className="rounded-lg border border-amber-300/40 bg-amber-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-200">
                  pinned
                </span>
              )}
              {node.muted && (
                <span className="rounded-lg border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                  muted
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-white/60">
              {node.type} · {node.cluster} · cost {node.tokenCost} tok · strength {node.strength.toFixed(1)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => select(null)}
            aria-label="Close node details"
            className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1">
          {connected.length === 0 && <p className="text-xs text-white/50">No connections.</p>}
          {connected.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-white/75">
                <span className={e.status === 'superseded' ? 'text-[#8fa0b8] line-through decoration-[#6b7a90]/60' : ''}>
                  {labelOf(e.sourceId)} —{e.relation}→ {labelOf(e.targetId)}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-white/45">
                {(e.validFrom ?? '?').slice(0, 10)} → {(e.validTo ?? 'now').slice(0, 10)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <PillButton disabled={busy} onClick={() => run('pin')}>
            {node.pinned ? 'Unpin' : 'Pin'}
          </PillButton>
          {node.muted ? (
            <PillButton disabled={busy} onClick={() => run('unmute')}>
              Unmute
            </PillButton>
          ) : (
            <PillButton disabled={busy} onClick={() => run('mute')}>
              Mute
            </PillButton>
          )}
          {confirmDelete ? (
            <>
              <PillButton variant="danger" disabled={busy} onClick={() => run('delete')}>
                Confirm delete
              </PillButton>
              <PillButton onClick={() => setConfirmDelete(false)}>Cancel</PillButton>
            </>
          ) : (
            <PillButton variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </PillButton>
          )}
        </div>
      </GlassPanel>
    </div>
  )
}
