/**
 * Deterministic brain-shaped layout.
 * Nodes are placed on/in two hemisphere ellipsoids by cluster region, using a
 * stable hash of node.id so positions never jump when new data arrives.
 * A short relaxation pass reduces overlaps among existing nodes only.
 */
import type { UiNode } from './types'
import { Vec3 } from './vec'

export const BRAIN_SCALE = 3.2

// cluster -> region center (x symmetric: left/right hemisphere by hash)
const REGIONS: Record<string, Vec3> = {
  relationships: new Vec3(-0.9, 0.35, 0.75),  // frontal-left
  work: new Vec3(0.9, 0.35, 0.75),            // frontal-right
  places: new Vec3(0.0, -0.1, -0.2),          // temporal (center-low)
  hobbies: new Vec3(0.0, 0.75, -0.55),        // parietal (top-back)
  other: new Vec3(0.0, 0.0, -0.95),           // occipital (back)
}

/** Stable 32-bit string hash (FNV-1a style). */
export function hash32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded pseudo-random in [0,1) from a hash value. */
export function rand01(hash: number, salt: number): number {
  let x = (hash ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  x ^= x << 13; x >>>= 0
  x ^= x >> 17
  x ^= x << 5; x >>>= 0
  return x / 4294967296
}

/** Layered pseudo-noise for cortical folds. */
function foldNoise(h: number, x: number, y: number, z: number): number {
  let n = 0
  let amp = 0.5
  let freq = 2.1
  for (let o = 0; o < 3; o++) {
    n += amp * (rand01(h + o * 7919, Math.floor((x + y + z) * freq * 31)) - 0.5)
    amp *= 0.5
    freq *= 2.3
  }
  return n
}

/**
 * Assign positions to NEW nodes only; existing positions are preserved.
 * Returns { positions, isNew } keyed by node id.
 */
export function computeBrainLayout(
  nodes: UiNode[],
  existing: Map<string, { pos: Vec3; isNew: boolean }> = new Map(),
): Map<string, { pos: Vec3; isNew: boolean }> {
  const out = new Map(existing)

  // hemisphere assignment: hash parity, but keep temporal/occipital central
  for (const node of nodes) {
    if (out.has(node.id)) continue
    const h = hash32(node.id)
    const region = REGIONS[node.cluster] ?? REGIONS.other
    const side = node.cluster === 'places' || node.cluster === 'other' || node.cluster === 'hobbies'
      ? 1
      : h % 2 === 0 ? 1 : -1

    // random point in upper hemisphere ellipsoid
    const u = rand01(h, 1) * 2 - 1
    const theta = rand01(h, 2) * Math.PI * 2
    const r = 0.55 + 0.45 * Math.cbrt(rand01(h, 3))
    const sq = Math.sqrt(1 - u * u)
    let x = region.x * side + r * sq * Math.cos(theta)
    let y = region.y + r * u
    let z = region.z + r * sq * Math.sin(theta)
    // flatten the bottom slightly (brain-ish)
    if (y < -0.4) y = -0.4 + (y + 0.4) * 0.4

    // cortical fold displacement (subtle)
    const fold = foldNoise(h, x, y, z)
    x += fold * 0.12
    y += fold * 0.1
    z += fold * 0.12

    out.set(node.id, { pos: new Vec3(x, y, z), isNew: true })
  }

  // short force relaxation: only moves NEW nodes, keeps old ones stable
  const all = [...out.entries()]
  const newIds = new Set(all.filter(([, v]) => v.isNew).map(([k]) => k))
  for (let iter = 0; iter < 24; iter++) {
    for (const [idA, a] of all) {
      if (!newIds.has(idA)) continue
      const force = new Vec3()
      for (const [idB, b] of all) {
        if (idA === idB) continue
        const d = a.pos.distanceTo(b.pos)
        if (d < 0.34 && d > 1e-4) {
          force.add(a.pos.clone().sub(b.pos).multiplyScalar((0.34 - d) / 0.34 / d))
        }
        if (d > 2.6) force.add(b.pos.clone().sub(a.pos).multiplyScalar(0.0004 / d))
      }
      // gentle pull back toward brain bounds
      const len = a.pos.length()
      if (len > 1.75) force.add(a.pos.clone().multiplyScalar(-(len - 1.75) / len))
      a.pos.add(force.multiplyScalar(0.12))
    }
  }
  // mark everything settled
  for (const v of out.values()) v.isNew = false
  return out
}
