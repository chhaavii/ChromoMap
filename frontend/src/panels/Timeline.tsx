import { useEffect, useState } from 'react'
import { GlassPanel } from '../components/GlassPanel'
import { timelineBounds, useStore } from '../store'
import { refreshGraph } from '../scene/useSceneSync'

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export default function Timeline() {
  const graph = useStore((s) => s.graph)
  const asOf = useStore((s) => s.asOf)
  const setAsOf = useStore((s) => s.setAsOf)
  const bounds = timelineBounds(graph)
  const [value, setValue] = useState<number | null>(null)
  const [debounce, setDebounce] = useState<ReturnType<typeof setTimeout> | null>(null)

  // keep internal slider in sync when bounds change (new data)
  useEffect(() => {
    if (bounds && value == null) setValue(bounds[1])
  }, [bounds, value])

  function onChange(ms: number) {
    setValue(ms)
    if (debounce) clearTimeout(debounce)
    const iso = fmt(ms)
    // debounce the refetch while scrubbing
    setDebounce(
      setTimeout(async () => {
        setAsOf(asOf === null && ms === bounds![1] ? null : iso)
        await refreshGraph(ms === bounds![1] ? null : iso)
      }, 180),
    )
  }

  function reset() {
    if (debounce) clearTimeout(debounce)
    setValue(bounds ? bounds[1] : null)
    setAsOf(null)
    void refreshGraph(null)
  }

  if (!bounds) return null
  const atNow = asOf == null

  return (
    <GlassPanel className="pointer-events-auto p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-28">
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/50">Timeline</p>
          <p className="font-mono text-sm text-white">{atNow ? 'now' : fmt(value ?? bounds[1])}</p>
        </div>
        <input
          type="range"
          min={bounds[0]}
          max={bounds[1]}
          step={(bounds[1] - bounds[0]) / 400}
          value={value ?? bounds[1]}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label="Time travel: view the graph as of a date"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-amber-400"
        />
        <button
          type="button"
          onClick={reset}
          disabled={atNow}
          className="rounded-full border border-white/25 bg-white/5 px-3 py-1 text-xs text-white transition-colors hover:bg-white/15 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Now
        </button>
      </div>
    </GlassPanel>
  )
}
