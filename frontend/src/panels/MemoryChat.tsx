import { useState } from 'react'
import { GlassPanel, PillButton } from '../components/GlassPanel'
import { useStore } from '../store'
import { useAsk, useCompare, useIngest, useReset, useSeed } from '../hooks/useBackendActions'
import type { AskResult, InfluenceEntry } from '../types'

const STRATEGIES = [
  { value: 'full_dump', label: 'Full dump' },
  { value: 'flat_rag', label: 'Flat search' },
  { value: 'pagerank', label: 'Graph walk' },
] as const

function InfluenceView({ influence }: { influence: InfluenceEntry[] }) {
  const graph = useStore((s) => s.graph)
  const labels = new Map(graph.nodes.map((n) => [n.id, n]))
  const max = Math.max(...influence.map((i) => i.score), 0.0001)
  return (
    <div className="mt-2 space-y-1.5">
      {influence.slice(0, 8).map((i) => {
        const node = labels.get(i.nodeId)
        return (
          <div key={i.nodeId} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-white/70">{node?.label ?? i.nodeId.slice(0, 8)}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${(i.score / max) * 100}%` }}
              />
            </div>
            <span className="w-14 text-right font-mono text-white/50">{i.score.toFixed(3)}</span>
          </div>
        )
      })}
    </div>
  )
}

function AskBubble({ ask }: { ask: AskResult }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">{ask.answer}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
        <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 font-mono">
          {ask.strategy}
        </span>
        <span>{ask.tokensIn} in / {ask.tokensOut} out</span>
        <span>{Math.round(ask.latencyMs)} ms</span>
        {ask.correct != null && (
          <span className={ask.correct ? 'text-emerald-300' : 'text-red-300'}>
            {ask.correct ? 'correct' : 'wrong'}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-white/60 underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {open ? 'Hide' : 'Why this answer'}
        </button>
      </div>
      {open && <InfluenceView influence={ask.influence} />}
    </div>
  )
}

export default function MemoryChat() {
  const [tab, setTab] = useState<'add' | 'ask'>('add')
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('')
  const [strategy, setStrategy] = useState<AskResult['strategy']>('pagerank')
  const [bubble, setBubble] = useState(0.15)
  const [expected, setExpected] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const chat = useStore((s) => s.chat)
  const graph = useStore((s) => s.graph)
  const mockMode = useStore((s) => s.mockMode)
  const doIngest = useIngest()
  const doAsk = useAsk()
  const doCompare = useCompare()
  const doSeed = useSeed()
  const doReset = useReset()

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch {
      /* chat already shows the error */
    } finally {
      setBusy(false)
    }
  }

  const empty = graph.nodes.length === 0

  return (
    <GlassPanel className="flex h-[560px] flex-col">
      {/* tabs */}
      <div className="flex border-b border-white/10">
        {(['add', 'ask'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white ${
              tab === t ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {t === 'add' ? 'Add memory' : 'Ask'}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {tab === 'add' ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Aisha started dating Rahul in January 2023. She moved to Dubai in March."
              rows={4}
              aria-label="Memory text"
              className="w-full resize-none rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
            />
            <PillButton
              variant="primary"
              disabled={busy || !text.trim()}
              onClick={() =>
                run(async () => {
                  await doIngest(text.trim())
                  setText('')
                })
              }
            >
              {busy ? 'Remembering…' : 'Remember this'}
            </PillButton>
          </>
        ) : (
          <>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Who did Aisha use to date?"
              rows={2}
              aria-label="Question"
              className="w-full resize-none rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              {STRATEGIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStrategy(s.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                    strategy === s.value
                      ? 'border-white bg-white/20 text-white'
                      : 'border-white/15 bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <label className="block text-xs text-white/60">
              Break the bubble: <span className="font-mono text-white">{bubble.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={bubble}
                onChange={(e) => setBubble(parseFloat(e.target.value))}
                className="mt-1 w-full accent-amber-400"
                aria-label="Break the bubble"
              />
            </label>
            <div className="flex gap-2">
              <PillButton variant="primary" disabled={busy || !question.trim()} onClick={() => run(async () => { await doAsk(question.trim(), strategy, bubble) })}>
                {busy ? 'Thinking…' : 'Ask'}
              </PillButton>
            </div>
            <details className="rounded-xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-xs text-white/60 hover:text-white">
                Compare all 3 strategies
              </summary>
              <input
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="Expected answer (optional)"
                aria-label="Expected answer"
                className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-xs text-white placeholder:text-white/35 focus:outline-none"
              />
              <div className="mt-2">
                <PillButton disabled={busy || !question.trim()} onClick={() => run(async () => { await doCompare(question.trim(), expected.trim() || null) })}>
                  {busy ? 'Comparing…' : 'Compare all 3'}
                </PillButton>
              </div>
            </details>
          </>
        )}

        {/* chat log */}
        {chat.length > 0 && (
          <div className="space-y-3 border-t border-white/10 pt-3">
            {chat.slice().reverse().map((entry) => (
              <div key={entry.id} className="rounded-xl bg-white/5 p-3">
                {entry.kind === 'ask' && entry.ask && <AskBubble ask={entry.ask} />}
                {entry.kind === 'ingest' && <p className="text-sm text-emerald-200/90">{entry.text}</p>}
                {entry.kind === 'system' && <p className="text-sm text-white/70">{entry.text}</p>}
                {entry.kind === 'error' && (
                  <p className="text-sm text-red-300">
                    {entry.text}
                    {mockMode && <span className="text-white/40"> (mock mode)</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {empty && (
          <div className="rounded-xl border border-dashed border-white/20 p-4 text-center">
            <p className="text-sm text-white/70">No memories yet. Add one or load the demo data.</p>
            <div className="mt-3">
              <PillButton variant="primary" onClick={() => run(doSeed)}>
                Seed demo data
              </PillButton>
            </div>
          </div>
        )}
      </div>

      {/* footer actions */}
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <PillButton onClick={() => run(doSeed)} disabled={busy}>
          Seed demo data
        </PillButton>
        {confirmReset ? (
          <>
            <PillButton
              variant="danger"
              onClick={() => {
                setConfirmReset(false)
                void run(doReset)
              }}
            >
              Confirm wipe
            </PillButton>
            <PillButton onClick={() => setConfirmReset(false)}>Cancel</PillButton>
          </>
        ) : (
          <PillButton onClick={() => setConfirmReset(true)}>Reset</PillButton>
        )}
        <span className="ml-auto text-[11px] text-white/40">
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
      </div>
    </GlassPanel>
  )
}
