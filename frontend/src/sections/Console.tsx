import Reveal from '../components/Reveal'
import MemoryChat from '../panels/MemoryChat'
import LedgerPanel from '../panels/LedgerPanel'
import NodeInspector from '../panels/NodeInspector'
import Timeline from '../panels/Timeline'

export default function Console() {
  return (
    <section id="console" className="pointer-events-none relative min-h-screen px-4 py-24 sm:px-6">
      {/* click-through so the 3D brain behind stays draggable/clickable;
          individual panels re-enable pointer events */}
      <div className="pointer-events-none mx-auto max-w-7xl">
        <Reveal>
          <span className="inline-block rounded-lg border-l-2 border-white bg-white/15 px-3 py-1.5 text-xs uppercase tracking-[0.15em] text-white/90 backdrop-blur-md">
            Console
          </span>
        </Reveal>
        <Reveal delay={150}>
          <h2 className="mt-6 text-4xl font-bold tracking-tight drop-shadow-lg sm:text-5xl">
            Talk to the memory.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-[340px_1fr_340px]">
          <Reveal delay={250} className="pointer-events-auto">
            <MemoryChat />
          </Reveal>

          {/* center: the brain shows through; on small screens this collapses */}
          <div aria-hidden className="hidden min-h-[400px] lg:block" />

          <Reveal delay={350} className="pointer-events-auto">
            <LedgerPanel />
          </Reveal>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4">
        <div className="w-full max-w-3xl">
          <Timeline />
        </div>
      </div>

      <NodeInspector />
    </section>
  )
}
