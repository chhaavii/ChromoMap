import Reveal from '../components/Reveal'

const ROWS = [
  {
    index: '01',
    title: 'Superseded, not overwritten.',
    body: 'When a fact changes, the old connection closes and dims. History stays queryable.',
  },
  {
    index: '02',
    title: 'Connections learn.',
    body: 'Paths you use get stronger and cheaper. Idle ones fade, but never below a floor.',
  },
  {
    index: '03',
    title: 'Only the relevant path is read.',
    body: 'PageRank walks the connected memories instead of sending your whole history.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative flex h-[100svh] items-center px-4 py-24 sm:px-6">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-2">
        <div>
          <Reveal>
            <span className="inline-block rounded-lg border-l-2 border-white bg-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white/90 backdrop-blur-md">
              How it works
            </span>
          </Reveal>
          <Reveal delay={150}>
            <h2 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight drop-shadow-lg sm:text-5xl lg:text-6xl">
              Facts are superseded,
              <br />
              never deleted.
            </h2>
          </Reveal>
        </div>

        <Reveal delay={250}>
          <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md">
            {ROWS.map((row, i) => (
              <div
                key={row.index}
                className={`flex gap-5 p-6 ${i > 0 ? 'border-t border-white/10' : ''}`}
              >
                <span className="font-mono text-sm text-white/50">{row.index}</span>
                <div>
                  <h3 className="font-semibold text-white drop-shadow">{row.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/70">{row.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
