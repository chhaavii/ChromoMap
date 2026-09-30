import { lazy, Suspense, useEffect, useRef } from 'react'
import Navbar from './components/Navbar'
import Hero from './sections/Hero'
import HowItWorks from './sections/HowItWorks'
import Console from './sections/Console'
import Benchmark from './sections/Benchmark'
import FooterWidget from './components/FooterWidget'
import { useSceneSync } from './scene/useSceneSync'
import { useStore } from './store'

const BrainScene = lazy(() => import('./scene/BrainScene'))

export default function App() {
  useSceneSync()
  const setConsoleActive = useStore((s) => s.setConsoleActive)
  const consoleRef = useRef<HTMLDivElement>(null)

  // the 3D canvas only captures pointer events while the Console is in view
  useEffect(() => {
    const el = consoleRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setConsoleActive(entry.isIntersecting),
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [setConsoleActive])

  return (
    <div className="relative min-h-screen">
      {/* 3D scene: fixed, behind everything */}
      <div aria-hidden className="fixed inset-0 z-0" id="scene-root">
        <Suspense fallback={null}>
          <BrainScene />
        </Suspense>
      </div>

      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          {/* scroll-scrub spacer: camera flies while this passes */}
          <div aria-hidden className="h-[60vh]" />
          <HowItWorks />
          <div ref={consoleRef}>
            <Console />
          </div>
          <Benchmark />
        </main>
        <FooterWidget />
      </div>
    </div>
  )
}
