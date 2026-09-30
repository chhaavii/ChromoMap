import Wordmark from './Wordmark'
import { useStore } from '../store'

const LINKS = [
  { href: '#hero', label: 'Home' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#console', label: 'Console' },
  { href: '#benchmark', label: 'Benchmark' },
  { href: 'https://chronomem.vercel.app/', label: 'See how it works', external: true },
]

export default function Navbar() {
  const mockMode = useStore((s) => s.mockMode)

  const onClick = (href: string, ev: React.MouseEvent<HTMLAnchorElement>, external = false) => {
    if (external) {
      // Let the default behavior handle external links
      return
    }
    ev.preventDefault()
    const element = document.getElementById(href.replace('#', ''))
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/15 bg-black/30 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <div className="flex items-center gap-3">
          <a
            href="#hero"
            onClick={(e) => onClick('#hero', e)}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Wordmark />
          </a>
          {mockMode && (
            <span
              className="rounded-lg border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/70"
              title="Start the backend on :8000 for live data"
            >
              Demo data (backend offline)
            </span>
          )}
        </div>
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => onClick(l.href, e, (l as any).external)}
              target={(l as any).external ? '_blank' : undefined}
              rel={(l as any).external ? 'noopener noreferrer' : undefined}
              className="text-sm text-white/70 transition-colors hover:text-white focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            >
              {l.label}
            </a>
          ))}
        </div>
        <a
          href="#console"
          onClick={(e) => onClick('#console', e)}
          className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          Open Console
        </a>
      </nav>
    </header>
  )
}
