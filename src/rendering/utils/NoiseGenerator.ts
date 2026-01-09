import * as THREE from 'three';

/**
 * Self-contained 3D Noise implementation since we can't add dependencies.
 * Based on standard Perlin noise.
 */
class FastNoise {
    private perm: Uint8Array;

    constructor(seed: number = 123) {
        this.perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        
        // Shuffle
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807) % 2147483647;
            const j = s % (i + 1);
            const temp = p[i]!;
            p[i] = p[j]!;
            p[j] = temp;
        }
        
        for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    }

    private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
    private lerp(t: number, a: number, b: number): number { return a + t * (b - a); }
    private grad(hash: number, x: number, y: number, z: number): number {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    public noise(x: number, y: number, z: number): number {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const A = this.perm[X]! + Y, AA = this.perm[A]! + Z, AB = this.perm[A + 1]! + Z;
        const B = this.perm[X + 1]! + Y, BA = this.perm[B]! + Z, BB = this.perm[B + 1]! + Z;

        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.perm[AA]!, x, y, z),
            this.grad(this.perm[BA]!, x - 1, y, z)),
            this.lerp(u, this.grad(this.perm[AB]!, x, y - 1, z),
                this.grad(this.perm[BB]!, x - 1, y - 1, z))),
            this.lerp(v, this.lerp(u, this.grad(this.perm[AA + 1]!, x, y, z - 1),
                this.grad(this.perm[BA + 1]!, x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.perm[AB + 1]!, x, y - 1, z - 1),
                    this.grad(this.perm[BB + 1]!, x - 1, y - 1, z - 1))));
    }
}

/**
 * PERF (OPT-BH-1): Generates a 3D texture containing ridged multifractal noise
 * for the black hole accretion disk.
 *
 * This pre-bakes the expensive ridged noise computation that normally happens
 * per-pixel in the shader, replacing ~50+ ALU ops with a single texture fetch.
 *
 * The texture stores ridged noise: n = (1 - |noise|)² which gives the
 * characteristic "electric/plasma" look of the accretion disk.
 *
 * Uses a fixed seed for consistency across renders - the disk should look
 * the same every time.
 *
 * @param size Resolution of the 3D texture (default: 64, gives 256KB with RedFormat)
 * @returns Data3DTexture with ridged noise values in [0, 1]
 */
export function generateRidgedNoiseTexture3D(size: number = 64): THREE.Data3DTexture {
  const totalSize = size * size * size
  const data = new Uint8Array(totalSize)

  // Fixed seed for consistent noise across sessions
  const noiseGen = new FastNoise(42)

  let idx = 0
  const scale = 1.0 / size
  // Frequency multiplier to match shader's noise coordinate space
  const freqMul = 4.0

  for (let z = 0; z < size; z++) {
    const nz = z * scale * freqMul
    for (let y = 0; y < size; y++) {
      const ny = y * scale * freqMul
      for (let x = 0; x < size; x++) {
        const nx = x * scale * freqMul

        // Sample Perlin noise (returns -1 to 1)
        let n = noiseGen.noise(nx, ny, nz)

        // Apply ridged multifractal transformation: (1 - |n|)²
        // This gives the characteristic sharp ridges
        n = 1.0 - Math.abs(n)
        n = n * n

        // Map from [0, 1] to [0, 255]
        data[idx] = Math.floor(n * 255)
        idx++
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size)
  texture.format = THREE.RedFormat
  texture.type = THREE.UnsignedByteType
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.wrapR = THREE.RepeatWrapping
  texture.needsUpdate = true

  return texture
}

/**
 * PERF (OPT-BH-17): Generates a 1D texture containing pre-computed blackbody colors.
 *
 * This replaces the expensive blackbodyColor() function which uses pow() and log()
 * operations (20+ cycles each) with a single texture lookup (~4 cycles).
 *
 * The texture maps normalized temperature [0, 1] to RGB color, where:
 * - 0.0 = 1000K (deep red)
 * - 1.0 = 40000K (blue-white)
 *
 * Uses the Tanner Helland algorithm for Planckian locus approximation.
 *
 * @param size Resolution of the 1D texture (default: 256, gives 768 bytes for RGB)
 * @returns DataTexture with blackbody RGB values
 */
export function generateBlackbodyLUT(size: number = 256): THREE.DataTexture {
  // Use RGBA format - RGB is deprecated in WebGL2 and causes GL_INVALID_ENUM
  const data = new Uint8Array(size * 4) // RGBA format

  for (let i = 0; i < size; i++) {
    // Map [0, size-1] to temperature [1000K, 40000K]
    const t = i / (size - 1)
    const temperature = 1000 + t * 39000 // 1000K to 40000K

    // Tanner Helland algorithm
    const temp = temperature / 100.0

    let r: number, g: number, b: number

    // Red channel
    if (temp <= 66) {
      r = 1.0
    } else {
      r = 329.698727446 * Math.pow(temp - 60, -0.1332047592) / 255.0
    }

    // Green channel
    if (temp <= 66) {
      g = (99.4708025861 * Math.log(Math.max(temp, 1)) - 161.1195681661) / 255.0
    } else {
      g = 288.1221695283 * Math.pow(Math.max(temp - 60, 0.01), -0.0755148492) / 255.0
    }

    // Blue channel
    if (temp >= 66) {
      b = 1.0
    } else if (temp <= 19) {
      b = 0.0
    } else {
      b = (138.5177312231 * Math.log(Math.max(temp - 10, 0.01)) - 305.0447927307) / 255.0
    }

    // Clamp and store as bytes (RGBA)
    const idx = i * 4
    data[idx] = Math.floor(Math.max(0, Math.min(1, r)) * 255)
    data[idx + 1] = Math.floor(Math.max(0, Math.min(1, g)) * 255)
    data[idx + 2] = Math.floor(Math.max(0, Math.min(1, b)) * 255)
    data[idx + 3] = 255 // Alpha = 1.0
  }

  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}
