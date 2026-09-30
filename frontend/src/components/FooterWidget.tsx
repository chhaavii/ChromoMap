import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react'
import { api2 } from '../apiWithFallback'
import { useStore } from '../store'
import type { HashInfo } from '../types'

export default function FooterWidget() {
  const [info, setInfo] = useState<HashInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const lowEffects = useStore((s) => s.lowEffects)
  const toggleLowEffects = useStore((s) => s.toggleLowEffects)

  useEffect(() => {
    let alive = true
    api2
      .hashlogVerify()
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  return (
    <footer className="relative z-10 border-t border-white/10 px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-white/50">
        <div className="flex items-center gap-2">
          {failed ? (
            <span className="flex items-center gap-1.5">
              <ShieldAlert size={14} /> Memory log unavailable
            </span>
          ) : info?.valid ? (
            <span
              className="flex items-center gap-1.5"
              title={`Root hash: ${info.rootHash}`}
            >
              <ShieldCheck size={14} className="text-emerald-300" />
              Memory log verified: {info.length} {info.length === 1 ? 'entry' : 'entries'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-300">
              <ShieldAlert size={14} /> Memory log FAILED verification
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={toggleLowEffects}
          aria-pressed={lowEffects}
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <Sparkles size={13} />
          {lowEffects ? 'Low effects: on' : 'Low effects: off'}
        </button>
      </div>
    </footer>
  )
}
