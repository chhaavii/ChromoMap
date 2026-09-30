import { useEffect, useState } from 'react'
import { GlassPanel, PillButton } from '../components/GlassPanel'
import { useStore } from '../store'
import { useDecayTick } from '../hooks/useBackendActions'

const STRAT_LABEL: Record<string, string> = {
  full_dump: 'Full dump',
  flat_rag: 'Flat search',
  pagerank: 'Graph walk',
}

function StrategyBars() {
  const ledger = useStore((s) => s.ledger)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    // re-trigger bar animation when data changes
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [ledger])

  if (!ledger || ledger.byStrategy.length === 0) {
    return <p className="text-xs text-white/50">No queries yet — ask something first.</p>
  }

  const maxTokens = Math.max(...ledger.byStrategy.map((s) => s.avgTokensIn), 1)
  const maxLatency = Math.max(...ledger.byStrategy.map((s) => s.avgLatencyMs), 1)

  return (
    <div className="space-y-3">
      {ledger.byStrategy.map((s) => (
        <div key={s.strategy}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-white">{STRAT_LABEL[s.strategy] ?? s.strategy}</span>
            <span className="font-mono text-white/60">
              {s.avgTokensIn} tok · {Math.round(s.avgLatencyMs)} ms
              {s.accuracy != null && ` · ${Math.round(s.accuracy * 100)}%`}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-700"
              style={{ width: visible ? `${(s.avgTokensIn / maxTokens) * 100}%` : '0%' }}
            />
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-white/30 transition-all duration-700"
              style={{ width: visible ? `${(s.avgLatencyMs / maxLatency) * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function BubbleGauge() {
  const bubble = useStore((s) => s.bubble)
  if (!bubble) return <p className="text-xs text-white/50">Waiting for queries…</p>

  const score = Math.min(Math.max(bubble.bubbleScore, 0), 1)
  // semicircle gauge geometry
  const angle = Math.PI * (1 - score)
  const cx = 70, cy = 62, r = 52
  const nx = cx + r * Math.cos(angle)
  const ny = cy - r * Math.sin(angle)
  const largeArc = 0
  const color = score > 0.6 ? '#ff7b72' : score > 0.35 ? '#ffd9a0' : '#9be29b'

  return (
    <div>
      <div className="flex items-center gap-4">
        <svg width="140" height="76" viewBox="0 0 140 76" role="img" aria-label={`Bubble score ${score.toFixed(2)} of 1`}>
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" strokeLinecap="round" />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${nx} ${ny}`}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            className="transition-all duration-700"
          />
          <text x={cx} y={cy - 8} textAnchor="middle" className="fill-white font-mono" fontSize="20">
            {score.toFixed(2)}
          </text>
        </svg>
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/60">Bubble meter</p>
          {score > 0.6 && (
            <span className="mt-1 inline-block rounded-lg border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-xs text-red-200">
              Your memory is narrowing.
            </span>
          )}
          {bubble.window === 0 && <p className="text-xs text-white/50">No queries in window yet.</p>}
        </div>
      </div>
      {bubble.topDominantNodes.length > 0 && (
        <div className="mt-2 space-y-1">
          {bubble.topDominantNodes.slice(0, 4).map((d) => (
            <div key={d.nodeId} className="flex items-center justify-between text-xs text-white/70">
              <span className="truncate">{d.label}</span>
              <span className="font-mono text-white/50">{Math.round(d.share * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LedgerPanel() {
  const ledger = useStore((s) => s.ledger)
  const doDecay = useDecayTick()
  const [busy, setBusy] = useState(false)

  return (
    <GlassPanel className="flex h-[560px] flex-col overflow-y-auto">
      <div className="border-b border-white/10 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/70">Ledger</h3>
        {!ledger ? (
          <p className="mt-2 text-xs text-white/50">Loading…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="font-mono text-lg text-white">{ledger.totalTokensIn.toLocaleString()}</p>
              <p className="text-[11px] text-white/50">tokens in</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="font-mono text-lg text-white">{ledger.totalTokensOut.toLocaleString()}</p>
              <p className="text-[11px] text-white/50">tokens out</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="font-mono text-lg text-amber-300">${ledger.estimatedCostUsd.toFixed(4)}</p>
              <p className="text-[11px] text-white/50">est. cost</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2.5">
              <p className="font-mono text-lg text-emerald-300">{ledger.savingsVsFullDumpPct.toFixed(0)}%</p>
              <p className="text-[11px] text-white/50">saved vs full dump</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-white/10 p-4">
        <StrategyBars />
      </div>

      <div className="p-4">
        <BubbleGauge />
      </div>

      <div className="mt-auto border-t border-white/10 p-3">
        <PillButton
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await doDecay() } catch { /* specific error shown in chat */ } finally { setBusy(false) }
          }}
          ariaLabel="Apply decay tick"
        >
          {busy ? 'Decaying…' : 'Decay tick'}
        </PillButton>
      </div>
    </GlassPanel>
  )
}
