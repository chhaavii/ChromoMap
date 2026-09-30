import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Small particle field drifting around the brain (ambient life). */
export function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null)

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [count])

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.008
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.18
    }
  })

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        color="#8fa3bd"
        transparent
        opacity={0.32}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
