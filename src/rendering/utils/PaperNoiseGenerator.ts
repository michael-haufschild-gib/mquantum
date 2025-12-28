/**
 * Paper Noise Generator
 *
 * Generates a 2D noise texture for the paper texture post-processing effect.
 * Uses lazy initialization singleton pattern - texture is only created on first use.
 *
 * The texture stores multiple noise channels:
 * - R: Random noise (for roughness, crumples)
 * - G: Random noise 2 (for drops, folds)
 * - B: Fiber noise (for fiber pattern)
 * - A: 1.0 (unused, but required for RGBA format)
 *
 * @module rendering/utils/PaperNoiseGenerator
 */

import * as THREE from 'three';

/**
 * Self-contained noise implementation for paper texture generation.
 * Based on standard Perlin noise with LCG-based random number generation.
 */
class PaperNoise {
  private perm: Uint8Array;

  constructor(seed: number = 42) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Shuffle using LCG
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

  /**
   * Simple hash function for 2D coordinates.
   * Returns value in [0, 1].
   */
  hash(x: number, y: number): number {
    const ix = Math.floor(x) & 255;
    const iy = Math.floor(y) & 255;
    return this.perm[(this.perm[ix]! + iy) & 511]! / 255;
  }

  /**
   * Value noise for 2D coordinates.
   * Returns value in [0, 1].
   */
  noise2D(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Smooth interpolation
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);

    const a = this.hash(ix, iy);
    const b = this.hash(ix + 1, iy);
    const c = this.hash(ix, iy + 1);
    const d = this.hash(ix + 1, iy + 1);

    return a + u * (b - a) + v * (c - a) + u * v * (a - b - c + d);
  }

  /**
   * Fractal Brownian Motion for fiber-like noise.
   * Returns value in [0, 1].
   */
  fbm(x: number, y: number, octaves: number = 4): number {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return total / maxValue;
  }
}

/** Cached paper noise texture singleton */
let cachedTexture: THREE.DataTexture | null = null;
/** Reference count for shared texture disposal */
let textureRefCount = 0;

/**
 * Generates a 2D paper noise texture.
 *
 * The texture contains multiple noise layers in RGBA channels:
 * - R: Random noise (value noise, for general use)
 * - G: Random noise 2 (offset value noise, for secondary patterns)
 * - B: Fiber noise (FBM-based, for fiber/grain patterns)
 * - A: 1.0 (opaque)
 *
 * @param size - Resolution of the texture (default: 64, gives 64x64 = 16KB)
 * @returns DataTexture with paper noise values
 */
export function generatePaperNoiseTexture(size: number = 64): THREE.DataTexture {
  const totalSize = size * size;
  const data = new Uint8Array(totalSize * 4); // RGBA

  // Create noise generators with different seeds
  const noise1 = new PaperNoise(42);
  const noise2 = new PaperNoise(123);
  const noise3 = new PaperNoise(7919); // Prime for fiber

  let idx = 0;
  const scale = 1.0 / size;

  for (let y = 0; y < size; y++) {
    const ny = y * scale;
    for (let x = 0; x < size; x++) {
      const nx = x * scale;

      // R: Random noise (scaled for crumple/roughness patterns)
      const r = noise1.noise2D(nx * 8, ny * 8);

      // G: Random noise 2 (offset, for drops/folds)
      const g = noise2.noise2D(nx * 8 + 100, ny * 8 + 100);

      // B: Fiber noise (FBM for curly fiber patterns)
      const b = noise3.fbm(nx * 4, ny * 4, 4);

      // Store as bytes [0-255]
      data[idx++] = Math.floor(r * 255);
      data[idx++] = Math.floor(g * 255);
      data[idx++] = Math.floor(b * 255);
      data[idx++] = 255; // Alpha = 1.0
    }
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Gets the cached paper noise texture, creating it on first use.
 * Uses lazy initialization singleton pattern with reference counting.
 * Each call increments the reference count - call disposePaperNoiseTexture()
 * when done to decrement.
 *
 * @returns The cached paper noise texture
 */
export function getPaperNoiseTexture(): THREE.DataTexture {
  if (!cachedTexture) {
    cachedTexture = generatePaperNoiseTexture(64);
  }
  textureRefCount++;
  return cachedTexture;
}

/**
 * Decrements the reference count and disposes the cached paper noise texture
 * when no more references exist. Safe to call multiple times.
 */
export function disposePaperNoiseTexture(): void {
  textureRefCount = Math.max(0, textureRefCount - 1);
  if (textureRefCount === 0 && cachedTexture) {
    cachedTexture.dispose();
    cachedTexture = null;
  }
}

/**
 * Checks if the paper noise texture is currently allocated.
 *
 * @returns True if texture exists, false otherwise
 */
export function isPaperNoiseTextureAllocated(): boolean {
  return cachedTexture !== null;
}
