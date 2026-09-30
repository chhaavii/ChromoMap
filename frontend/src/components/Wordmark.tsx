import { Hexagon } from 'lucide-react'

export default function Wordmark() {
  return (
    <a href="#hero" className="flex items-center gap-2 text-white" aria-label="chronomem home">
      <Hexagon size={24} strokeWidth={1.5} />
      <span className="text-lg font-semibold lowercase tracking-tight drop-shadow">
        chronomem
      </span>
    </a>
  )
}
