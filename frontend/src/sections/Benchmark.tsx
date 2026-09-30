import { useState } from 'react'
import Reveal from '../components/Reveal'
import { PillButton } from '../components/GlassPanel'
import { api2 } from '../apiWithFallback'
import type { BenchResult } from '../types'

const STRAT_LABEL: Record<string, string> = {
  full_dump: 'Full dump',
  flat_rag: 'Flat search',
  pagerank: 'Graph walk',
}

export default function Benchmark() {
  const [result, setResult] = useState<BenchResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api2.benchmarkRun())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(
        msg === 'Failed to fetch' || msg.includes('fetch')
          ? 'Could not reach the API. Start the backend: uvicorn app.main:app --reload --port 8000'
          : `Benchmark failed: ${msg}`,
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <section id="benchmark" className="relative px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <span className="inline-block rounded-lg border-l-2 border-white bg-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white/90 backdrop-blur-md">
            Benchmark
          </span>
        </Reveal>
        <Reveal delay={150}>
          <h2 className="mt-6 max-w-2xl text-4xl font-bold tracking-tight drop-shadow-lg sm:text-5xl">
            Three retrieval strategies, measured honestly.
          </h2>
          <p className="mt-4 max-w-xl text-white/70">
            Runs all 15 seeded temporal questions through full dump, flat search and graph
            walk. Accuracy, tokens and latency come straight from the API — nothing here is
            faked. It calls the LLM once per question per strategy, so it takes a while.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <div className="mt-8">
            <PillButton variant="primary" onClick={run} disabled={running} ariaLabel="Run benchmark">
              {running ? 'Running… (this can take a minute)' : 'Run benchmark'}
            </PillButton>
          </div>
        </Reveal>

        {running && (
          <div className="mt-6 max-w-xl animate-pulse rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-white/70 backdrop-blur-md">
            Asking the LLM 45 questions (15 × 3 strategies) and scoring the answers…
          </div>
        )}

        {error && (
          <div className="mt-6 max-w-xl rounded-2xl border border-red-400/40 bg-red-500/15 p-5 text-sm text-red-200 backdrop-blur-md">
            {error}
          </div>
        )}

        {result?.error && (
          <div className="mt-6 max-w-xl rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-white/70 backdrop-blur-md">
            {result.error}
          </div>
        )}

        {result?.strategies && (
          <Reveal>
            <div className="mt-8 overflow-x-auto rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-white/50">
                    <th className="px-5 py-3 font-medium">Strategy</th>
                    <th className="px-5 py-3 font-medium">Accuracy</th>
                    <th className="px-5 py-3 font-medium">Avg tokens in</th>
                    <th className="px-5 py-3 font-medium">Avg latency</th>
                    {result.retrievalDiversity && <th className="px-5 py-3 font-medium">Diversity</th>}
                  </tr>
                </thead>
                <tbody>
                  {result.strategies.map((s) => (
                    <tr key={s.strategy} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-3 font-medium text-white">{STRAT_LABEL[s.strategy] ?? s.strategy}</td>
                      <td className="px-5 py-3 font-mono text-white/80">
                        {s.accuracy == null ? '—' : `${Math.round(s.accuracy * 100)}%`}
                      </td>
                      <td className="px-5 py-3 font-mono text-white/80">{s.avgTokensIn}</td>
                      <td className="px-5 py-3 font-mono text-white/80">{Math.round(s.avgLatencyMs)} ms</td>
                      {result.retrievalDiversity && (
                        <td className="px-5 py-3 font-mono text-white/60">
                          {s.strategy === 'pagerank'
                            ? `${result.retrievalDiversity.entropy} / ${result.retrievalDiversity.maxEntropy}`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-white/45">
              {result.questionsRun} questions · diversity = Shannon entropy of nodes used by
              the graph walk · {result.retrievalDiversity?.distinctNodes ?? 0} distinct nodes hit
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}
