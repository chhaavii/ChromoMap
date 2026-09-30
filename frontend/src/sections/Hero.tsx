import Reveal from '../components/Reveal'

export default function Hero() {
  return (
    <section id="hero" className="relative flex h-[100svh] flex-col justify-between px-4 pb-10 pt-24 sm:px-6">
      {/* top row */}
      <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-8">
        <Reveal>
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-white/60 sm:text-sm">
            <p>/ keeps history</p>
            <p>/ shows the cost</p>
            <p>/ fights the bubble</p>
          </div>
        </Reveal>
        <Reveal delay={150} className="hidden max-w-xs md:block">
          <p className="text-sm leading-relaxed text-white/80 drop-shadow">
            AI memory that never overwrites. Every fact keeps its time range, every answer
            shows its token cost.
          </p>
        </Reveal>
      </div>

      {/* bottom row */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Reveal delay={100}>
            <span className="inline-block rounded-lg border-l-2 border-white bg-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white/90 backdrop-blur-md">
              Temporal memory graph
            </span>
          </Reveal>
          <Reveal delay={250}>
            <h1 className="mt-6 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight drop-shadow-lg sm:text-6xl lg:text-7xl">
              Remembers everything.
              <br />
              Shows what it costs.
            </h1>
          </Reveal>
        </div>

        <Reveal delay={400} className="lg:pb-2">
          <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
            <p className="text-sm text-white/80">
              A living map of what your AI remembers, what it forgot on purpose, and what
              each answer costs.
            </p>
            <a
              href="#console"
              className="mt-4 inline-block w-full rounded-full bg-white px-4 py-2 text-center text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              Open console
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
