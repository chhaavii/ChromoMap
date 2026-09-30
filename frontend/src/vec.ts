/** Minimal 3D vector helper (avoids importing three outside the canvas). */
export class Vec3 {
  x: number
  y: number
  z: number

  constructor(x = 0, y = 0, z = 0) {
    this.x = x
    this.y = y
    this.z = z
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z)
  }

  add(v: Vec3): this {
    this.x += v.x; this.y += v.y; this.z += v.z
    return this
  }

  sub(v: Vec3): Vec3 {
    return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z)
  }

  multiplyScalar(s: number): this {
    this.x *= s; this.y *= s; this.z *= s
    return this
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
  }

  distanceTo(v: Vec3): number {
    return this.sub(v).length()
  }
}
