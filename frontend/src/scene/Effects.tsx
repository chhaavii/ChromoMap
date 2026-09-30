import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import { BRAIN_SCALE } from '../brainLayout'

const COL_AMBER = new THREE.Color('#ff9f43')
const COL_GOLD = new THREE.Color('#ffd9a0')
const COL_RED = new THREE.Color('#ff5b4d')
const TINTS: Record<string, THREE.Color> = {
  full_dump: new THREE.Color('#7fb4ff'),
  flat_rag: new THREE.Color('#b48cff'),
  pagerank: new THREE.Color('#ff9f43'),
}

interface Pulse {
  positions: THREE.Vector3[]   // ordered node positions
  edgeCurves: (THREE.QuadraticBezierCurve3 | null)[]
  color: THREE.Color
  t: number
  hop: number
  nodeFlare: Map<string, number> // nodeId -> flare intensity (from influence)
}

function curveBetween(a: THREE.Vector3, b: THREE.Vector3): QuadraticBezier {
  const va = a.clone().multiplyScalar(BRAIN_SCALE)
  const vb = b.clone().multiplyScalar(BRAIN_SCALE)
  const mid = va.clone().add(vb).multiplyScalar(0.5)
  const dir = vb.clone().sub(va)
  const bow = new THREE.Vector3(-dir.y, dir.x, dir.z * 0.4).normalize().multiplyScalar(Math.max(dir.length(), 0.001) * 0.16)
  return new THREE.QuadraticBezierCurve3(va, mid.add(bow), vb)
}
type QuadraticBezier = THREE.QuadraticBezierCurve3

/**
 * Renders active animations as additive overlays:
 * - one glowing sprite per pulse hop travelling along edges
 * - flare rings on used nodes
 * - red flash + replacement link on supersession
 * - dissolve particles on delete
 */
export function Effects({ positions }: { positions: Map<string, { pos: THREE.Vector3 }> }) {
  const graph = useStore((s) => s.graph)
  const pulseSeq = useStore((s) => s.pulseSeq)
  const lastAsk = useStore((s) => s.lastAsk)
  const compareRun = useStore((s) => s.compareRun)
  const compareSeq = useStore((s) => s.compareSeq)
  const supersedeSeq = useStore((s) => s.supersedeSeq)
  const lastIngest = useStore((s) => s.lastIngest)
  const deleteSeq = useStore((s) => s.deleteSeq)
  const lastDeleted = useStore((s) => s.lastDeleted)
  const bubble = useStore((s) => s.bubble)
  const lowEffects = useStore((s) => s.lowEffects)

  const pulsesRef = useRef<Pulse[]>([])
  const groupRef = useRef<THREE.Group>(null)
  const [dissolve, setDissolve] = useState<{ pos: THREE.Vector3; t: number } | null>(null)
  const [flash, setFlash] = useState<{ curve: QuadraticBezier; t: number } | null>(null)

  // --- build a pulse from an AskResult -------------------------------------
  const buildPulse = (ask: { path?: string[]; nodesUsed?: string[]; influence?: { nodeId: string; score: number }[] }, color: THREE.Color): Pulse | null => {
    const path = (ask.path ?? []).filter((id) => positions.has(id))
    if (path.length === 0) return null
    const pts = path.map((id) => positions.get(id)!.pos)
    const edgeCurves: (QuadraticBezier | null)[] = []
    for (let i = 0; i < path.length - 1; i++) {
      const a = positions.get(path[i])!
      const b = positions.get(path[i + 1])!
      edgeCurves.push(curveBetween(a.pos, b.pos))
    }
    const flare = new Map<string, number>()
    for (const inf of ask.influence ?? []) flare.set(inf.nodeId, inf.score)
    if (flare.size === 0) for (const id of path) flare.set(id, 0.6)
    return { positions: pts, edgeCurves, color, t: 0, hop: 0, nodeFlare: flare }
  }

  // fire single-ask pulse when pulseSeq changes
  useEffect(() => {
    if (!lastAsk) return
    const p = buildPulse(lastAsk, COL_AMBER)
    if (p) pulsesRef.current = [p]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseSeq])

  // fire sequential compare pulses (three tints)
  useEffect(() => {
    if (!compareRun) return
    const seq: Pulse[] = []
    const delays = [0, 1600, 3200]
    compareRun.results.forEach((r, i) => {
      const p = buildPulse(r, TINTS[r.strategy] ?? COL_AMBER)
      if (p) {
        p.t = -delays[i] / 150 // negative t = wait
        seq.push(p)
      }
    })
    pulsesRef.current = seq
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareSeq])

  // supersession flash on the old edge
  useEffect(() => {
    if (!lastIngest || lastIngest.edgesSuperseded.length === 0) return
    const e = graph.edges.find((x) => x.id === lastIngest.edgesSuperseded[0])
    if (!e) return
    const a = positions.get(e.sourceId)
    const b = positions.get(e.targetId)
    if (a && b) setFlash({ curve: curveBetween(a.pos, b.pos), t: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supersedeSeq])

  // delete dissolve
  useEffect(() => {
    if (!lastDeleted) return
    const p = positions.get(lastDeleted)
    if (p) setDissolve({ pos: p.pos.clone().multiplyScalar(BRAIN_SCALE), t: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteSeq])

  const flareRef = useRef<Map<string, number>>(new Map())
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.9, 1.12, 28), [])
  const particleGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = lowEffects ? 30 : 90
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(0.15 + Math.random() * 0.25)
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [lowEffects])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const dt = Math.min(delta, 0.05)

    // advance pulses
    for (const pulse of pulsesRef.current) {
      if (pulse.t < 0) { pulse.t += dt * 1000; continue }
      pulse.t += dt / 0.15 // 150ms per hop
      if (pulse.t >= 1 && pulse.hop < pulse.edgeCurves.length - 1) {
        pulse.t = 0
        pulse.hop++
      }
    }
    pulsesRef.current = pulsesRef.current.filter((p) => p.hop < p.edgeCurves.length || p.t < 1.4)

    // node flares decay
    for (const [k, v] of flareRef.current) {
      const nv = v - dt * 0.5
      if (nv <= 0) flareRef.current.delete(k)
      else flareRef.current.set(k, nv)
    }
    // pulse nodes feed flares
    for (const pulse of pulsesRef.current) {
      if (pulse.t < 0) continue
      const hopNode = pulse.positions[pulse.hop]
      if (!hopNode) continue
      // find node id by position (small graphs; fine for demo scale)
      for (const [id, p] of positions) {
        if (p.pos === hopNode) {
          flareRef.current.set(id, Math.max(flareRef.current.get(id) ?? 0, 0.8))
          break
        }
      }
    }

    // flash decay
    if (flash) {
      const t = flash.t + dt * 1.2
      if (t > 1) setFlash(null)
      else setFlash({ ...flash, t })
    }
    // dissolve decay
    if (dissolve) {
      const t = dissolve.t + dt * 0.9
      if (t > 1) setDissolve(null)
      else setDissolve({ ...dissolve, t })
    }

    // ---- imperative draw ----
    let child = 0

    // pulse sprites: one per active pulse
    for (const pulse of pulsesRef.current) {
      if (pulse.t < 0) continue
      const sprite = group.children[child++] as THREE.Sprite | undefined
      if (!sprite) break
      const curve = pulse.edgeCurves[pulse.hop]
      sprite.visible = !!curve
      if (curve) {
        sprite.position.copy(curve.getPoint(Math.min(pulse.t, 1)))
        const mat = sprite.material as THREE.SpriteMaterial
        mat.color.copy(pulse.color)
        mat.opacity = 0.95
        sprite.scale.setScalar(0.22)
      }
    }
    // hide remaining sprites
    for (; child < group.children.length; child++) {
      const c = group.children[child]
      if (c.userData.role === 'pulse') (c as THREE.Sprite).visible = false
    }
  })

  const bubbleIds = new Set((bubble?.topDominantNodes ?? []).map((d) => d.nodeId))

  return (
    <group ref={groupRef}>
      {/* pulse sprites pool */}
      {Array.from({ length: 4 }, (_, i) => (
        <sprite key={`p${i}`} userData={{ role: 'pulse' }} visible={false}>
          <spriteMaterial color={COL_AMBER} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}

      {/* bubble halos */}
      {[...bubbleIds].slice(0, 5).map((id) => {
        const p = positions.get(id)
        if (!p) return null
        return (
          <mesh
            key={`h${id}`}
            position={p.pos.clone().multiplyScalar(BRAIN_SCALE)}
            rotation-x={-Math.PI / 2}
          >
            <primitive object={ringGeo} attach="geometry" />
            <meshBasicMaterial color={COL_GOLD} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        )
      })}

      {/* supersession flash: red line along the old edge */}
      {flash && (
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(flash.curve.getPoints(20).flatMap((p: THREE.Vector3) => [p.x, p.y, p.z])), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={COL_RED} transparent opacity={1 - flash.t} depthWrite={false} />
        </line>
      )}

      {/* delete dissolve: expanding particle burst */}
      {dissolve && (
        <points position={dissolve.pos} scale={0.3 + dissolve.t * 2.2}>
          <primitive object={particleGeo} attach="geometry" />
          <pointsMaterial color={COL_AMBER} transparent opacity={1 - dissolve.t} size={0.05} depthWrite={false} />
        </points>
      )}
    </group>
  )
}
