import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { computeBrainLayout, hash32, BRAIN_SCALE } from '../brainLayout'
import { Dust } from './Dust'
import { Effects } from './Effects'

const COL_CURRENT = '#f5efe4'
const COL_GOLD = '#ffd9a0'
const COL_AMBER = '#ff9f43'
const COL_SUPERSEDED = '#6b7a90'

type Positioned = { id: string; pos: THREE.Vector3; isNew: boolean }

// ---------------------------------------------------------------- layout hook

function useNodePositions(): Map<string, Positioned> {
  const graph = useStore((s) => s.graph)
  const layoutRef = useRef<Map<string, { pos: { x: number; y: number; z: number }; isNew: boolean }>>(new Map())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const layout = computeBrainLayout(graph.nodes, layoutRef.current as never)
    layoutRef.current = layout as never
    setTick((t) => t + 1)
  }, [graph.nodes])

  return useMemo(() => {
    const map = new Map<string, Positioned>()
    for (const [id, v] of layoutRef.current) {
      map.set(id, { id, pos: new THREE.Vector3(v.pos.x, v.pos.y, v.pos.z), isNew: v.isNew })
    }
    return map
  }, [tick, graph.nodes])
}

// ---------------------------------------------------------------- nodes

function BrainNodes({
  positions,
  onPick,
}: {
  positions: Map<string, Positioned>
  onPick: (id: string | null) => void
}) {
  const graph = useStore((s) => s.graph)
  const selectedId = useStore((s) => s.selectedNodeId)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const count = graph.nodes.length

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    graph.nodes.forEach((n, i) => {
      const p = positions.get(n.id)
      if (!p) return
      const size = 0.06 + Math.min(n.strength, 10) * 0.012
      const pulse = reduced ? 0 : Math.sin(t * 1.4 + hash32(n.id) % 100) * 0.1 + 1
      dummy.position.copy(p.pos).multiplyScalar(BRAIN_SCALE)
      dummy.scale.setScalar(size * pulse * (n.muted ? 0.7 : 1))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // color: gold if pinned, dim if muted, warm white otherwise; recency adds warmth
      if (n.pinned) color.set(COL_GOLD)
      else if (n.muted) color.set('#5a6472')
      else {
        color.set(COL_CURRENT)
        color.lerp(new THREE.Color(COL_GOLD), n.recency * 0.45)
      }
      if (n.id === selectedId) color.set(COL_AMBER)
      mesh.setColorAt(i, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(count, 1)]}
        key={count}
        onPointerDown={(e) => {
          e.stopPropagation()
          const idx = e.instanceId
          if (idx != null && graph.nodes[idx]) onPick(graph.nodes[idx].id)
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial emissive="white" emissiveIntensity={0.55} roughness={0.4} />
      </instancedMesh>
      {/* pinned gold rings */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, Math.max(count, 1)]} key={`r${count}`} visible={false}>
        <torusGeometry args={[1.6, 0.12, 8, 24]} />
        <meshBasicMaterial color={COL_GOLD} transparent opacity={0.85} />
      </instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------- edges

function EdgeLines({ positions }: { positions: Map<string, Positioned> }) {
  const graph = useStore((s) => s.graph)
  const asOf = useStore((s) => s.asOf)

  const segments = useMemo(() => {
    const out: Array<{
      key: string
      points: THREE.Vector3[]
      color: string
      opacity: number
      lineWidth: number
      dashed: boolean
    }> = []
    for (const e of graph.edges) {
      const a = positions.get(e.sourceId)
      const b = positions.get(e.targetId)
      if (!a || !b) continue
      const va = a.pos.clone().multiplyScalar(BRAIN_SCALE)
      const vb = b.pos.clone().multiplyScalar(BRAIN_SCALE)
      const mid = va.clone().add(vb).multiplyScalar(0.5)
      const dir = vb.clone().sub(va)
      const len = Math.max(dir.length(), 0.001)
      const bow = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.4).normalize().multiplyScalar(len * 0.16)
      const curve = new THREE.QuadraticBezierCurve3(va, mid.add(bow), vb)
      const superseded = e.status === 'superseded'
      const active = asOf == null ? true : e.active !== false
      out.push({
        key: e.id,
        points: curve.getPoints(14),
        color: superseded ? COL_SUPERSEDED : COL_CURRENT,
        opacity: superseded ? 0.26 : active ? 0.5 : 0.05,
        lineWidth: superseded ? 0.7 : 0.9 + Math.min(e.weight, 4) * 0.35,
        dashed: superseded,
      })
    }
    return out
  }, [graph.edges, positions, asOf])

  return (
    <group>
      {segments.map((s) => (
        <line key={s.key}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(s.points.flatMap((p) => [p.x, p.y, p.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={s.color}
            transparent
            opacity={s.opacity}
            linewidth={s.lineWidth}
            depthWrite={false}
          />
        </line>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- camera rig

function CameraRig() {
  const { camera } = useThree()
  const progress = useRef(0)
  const target = useRef(0)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const idleT = useRef(0)
  const lastScroll = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      target.current = max > 0 ? window.scrollY / max : 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useFrame((_, delta) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // idle auto-rotate: gently orbits when the user hasn't scrolled for a while
    if (window.scrollY === lastScroll.current) idleT.current += delta
    else { idleT.current = 0; lastScroll.current = window.scrollY }
    const autoSpin = !reduced && idleT.current > 2.5 ? delta * 0.05 : 0

    progress.current += (target.current - progress.current) * 0.12
    const p = progress.current
    // hero = wide; how-it-works = closer; console = comfortable orbit
    const radius = 13 - Math.min(p * 3, 3.4)
    const height = 2.4 - Math.min(p * 1.4, 1.4)
    const angle = 0.6 + p * 1.1 + idleT.current * autoSpin * 20
    const cx = Math.sin(angle) * radius
    const cz = Math.cos(angle) * radius
    camera.position.lerp(new THREE.Vector3(cx, height, cz), 0.06)
    camera.lookAt(0, 0, 0)
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={useStore((s) => s.consoleActive)}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={16}
      enablePan={false}
    />
  )
}

// ---------------------------------------------------------------- spikes

function Spikes({ positions }: { positions: Map<string, Positioned> }) {
  const graph = useStore((s) => s.graph)
  const lowEffects = useStore((s) => s.lowEffects)
  const groupRef = useRef<THREE.Group>(null)
  const sprites = useMemo(
    () =>
      Array.from({ length: lowEffects ? 2 : 6 }, (_, i) => ({
        edgeIdx: i * 7,
        t: Math.random(),
        speed: 0.12 + Math.random() * 0.15,
      })),
    [lowEffects, graph.edges.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const strong = graph.edges.filter((e) => e.status === 'current')
    if (strong.length === 0) {
      group.visible = false
      return
    }
    group.visible = true
    sprites.forEach((sp, i) => {
      sp.t += sp.speed * delta
      if (sp.t > 1) {
        sp.t = 0
        sp.edgeIdx = Math.floor(Math.random() * strong.length)
      }
      const e = strong[sp.edgeIdx % strong.length]
      if (!e) return
      const a = positions.get(e.sourceId)
      const b = positions.get(e.targetId)
      const sprite = group.children[i] as THREE.Sprite | undefined
      if (!a || !b || !sprite) return
      const va = a.pos.clone().multiplyScalar(BRAIN_SCALE)
      const vb = b.pos.clone().multiplyScalar(BRAIN_SCALE)
      const mid = va.clone().add(vb).multiplyScalar(0.5)
      const dir = vb.clone().sub(va)
      const bow = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.4).normalize().multiplyScalar(dir.length() * 0.16)
      const curve = new THREE.QuadraticBezierCurve3(va, mid.add(bow), vb)
      sprite.position.copy(curve.getPoint(sp.t))
      const mat = sprite.material as THREE.SpriteMaterial
      mat.opacity = 0.7 * Math.sin(sp.t * Math.PI)
    })
  })

  return (
    <group ref={groupRef}>
      {sprites.map((_, i) => (
        <sprite key={i} scale={0.14}>
          <spriteMaterial color={COL_AMBER} transparent opacity={0.6} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- root

export default function BrainScene() {
  const select = useStore((s) => s.select)
  const consoleActive = useStore((s) => s.consoleActive)
  const lowEffects = useStore((s) => s.lowEffects)
  const positions = useNodePositions()

  return (
    <Canvas
      camera={{ position: [7, 3, 10], fov: 50 }}
      dpr={[1, 2]}
      style={{ pointerEvents: consoleActive ? 'auto' : 'none' }}
      gl={{ antialias: true, alpha: true }}
    >
      <fog attach="fog" args={['#0a0a0a', 12, 26]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[6, 6, 6]} intensity={40} color="#fff2dd" />
      <pointLight position={[-6, -4, -6]} intensity={22} color="#7f93b3" />

      <BrainNodes positions={positions} onPick={select} />
      <EdgeLines positions={positions} />
      <Spikes positions={positions} />
      <Effects positions={positions} />
      <Dust count={lowEffects ? 120 : 420} />

      <CameraRig />
      <EffectComposer enabled={!lowEffects}>
        <Bloom intensity={0.9} luminanceThreshold={0.32} luminanceSmoothing={0.25} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  )
}
