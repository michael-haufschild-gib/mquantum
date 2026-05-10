/**
 * SoundManager - Premium Audio Feedback System
 *
 * Uses Web Audio API to generate synthesized UI sounds (no external assets needed).
 * Features:
 * - Spatial clicks
 * - Sci-fi bleeps for interactions
 * - Ambient hum (optional)
 * - Throttling to prevent spam
 */

class SoundManager {
  private ctx: AudioContext | null = null
  private enabled: boolean = true
  private masterGain: GainNode | null = null
  private initialized: boolean = false
  private listeners: Set<() => void> = new Set()
  private lastPlayTime: Record<string, number> = {}

  /**
   * Returns true if enough time has elapsed since the last play of this sound type.
   * Prevents audio spam when rapidly hovering across many controls.
   */
  private throttle(key: string, minIntervalMs: number): boolean {
    const now = performance.now()
    const last = this.lastPlayTime[key]
    if (last !== undefined && now - last < minIntervalMs) return false
    this.lastPlayTime[key] = now
    return true
  }

  constructor() {
    // Lazy init on first interaction
    if (typeof window !== 'undefined') {
      this.attachInitListeners()
    }
  }

  private attachInitListeners(): void {
    window.addEventListener('click', this.init)
    window.addEventListener('keydown', this.init)
  }

  private detachInitListeners(): void {
    window.removeEventListener('click', this.init)
    window.removeEventListener('keydown', this.init)
  }

  private init = (): boolean => {
    if (this.initialized) return true
    if (typeof window === 'undefined') return false

    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      // Browser does not support Web Audio; stop trying to initialize.
      this.detachInitListeners()
      return false
    }

    try {
      const ctx = new AudioContextCtor()
      const masterGain = ctx.createGain()
      masterGain.gain.value = 0.15 // Low volume by default
      masterGain.connect(ctx.destination)

      this.ctx = ctx
      this.masterGain = masterGain
      this.initialized = true
      this.detachInitListeners()
      return true
    } catch {
      // Keep listeners attached so we can retry on a later user gesture.
      return false
    }
  }

  private resetClosedContext(ctx: AudioContext): void {
    if (this.ctx !== ctx) return
    this.ctx = null
    this.masterGain = null
    this.initialized = false
    if (typeof window !== 'undefined') this.attachInitListeners()
  }

  private resumePausedContext(ctx: AudioContext): void {
    const state = ctx.state as AudioContext['state'] | 'interrupted'
    if (state !== 'suspended' && state !== 'interrupted') return

    void ctx.resume().catch(() => {
      const currentState = ctx.state as AudioContext['state'] | 'interrupted'
      if (currentState === 'closed') this.resetClosedContext(ctx)
    })
  }

  private handlePlaybackError(ctx: AudioContext): void {
    const state = ctx.state as AudioContext['state'] | 'interrupted'
    if (state === 'closed') this.resetClosedContext(ctx)
  }

  private disconnectNode(node: AudioNode): void {
    try {
      node.disconnect()
    } catch {
      // Cleanup failures should never break the next UI interaction.
    }
  }

  private preparePlayback(): { ctx: AudioContext; masterGain: GainNode } | null {
    if (!this.enabled) return null
    if (!this.initialized) this.init()

    const ctx = this.ctx
    const masterGain = this.masterGain
    if (!ctx || !masterGain) return null

    const state = ctx.state as AudioContext['state'] | 'interrupted'
    if (state === 'closed') {
      this.resetClosedContext(ctx)
      return null
    }

    this.resumePausedContext(ctx)
    return { ctx, masterGain }
  }

  public playClick(): void {
    const playback = this.preparePlayback()
    if (!playback) return
    if (!this.throttle('click', 50)) return
    const { ctx, masterGain } = playback

    try {
      const now = ctx.currentTime
      const duration = 0.02
      const sampleRate = ctx.sampleRate
      const bufferSize = Math.floor(sampleRate * duration)

      // Create short noise burst
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)

      // Sharp attack, fast decay - like a soft tap
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize
        const envelope = Math.pow(1 - t, 3)
        data[i] = (Math.random() * 2 - 1) * envelope
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      // Bandpass to give it body without being harsh
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1000
      filter.Q.value = 0.5

      const gain = ctx.createGain()
      gain.gain.value = 0.15

      source.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain)

      source.start(now)
      source.stop(now + duration)
      source.onended = () => {
        this.disconnectNode(source)
        this.disconnectNode(filter)
        this.disconnectNode(gain)
      }
    } catch {
      this.handlePlaybackError(ctx)
    }
  }

  public playHover(): void {
    const playback = this.preparePlayback()
    if (!playback) return
    if (!this.throttle('hover', 100)) return
    const { ctx, masterGain } = playback

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(200, ctx.currentTime)

      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 400

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain)

      osc.start()
      osc.stop(ctx.currentTime + 0.05)
      osc.onended = () => {
        this.disconnectNode(osc)
        this.disconnectNode(filter)
        this.disconnectNode(gain)
      }
    } catch {
      this.handlePlaybackError(ctx)
    }
  }

  public playSnap(): void {
    const playback = this.preparePlayback()
    if (!playback) return
    if (!this.throttle('snap', 50)) return
    const { ctx, masterGain } = playback

    try {
      const now = ctx.currentTime
      const duration = 0.025
      const sampleRate = ctx.sampleRate
      const bufferSize = Math.floor(sampleRate * duration)

      // Short low-frequency thud
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)

      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize
        const envelope = Math.pow(1 - t, 4)
        data[i] = (Math.random() * 2 - 1) * envelope
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      // Low bandpass for soft thud
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 400

      const gain = ctx.createGain()
      gain.gain.value = 0.1

      source.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain)

      source.start(now)
      source.stop(now + duration)
      source.onended = () => {
        this.disconnectNode(source)
        this.disconnectNode(filter)
        this.disconnectNode(gain)
      }
    } catch {
      this.handlePlaybackError(ctx)
    }
  }

  public playSuccess(): void {
    const playback = this.preparePlayback()
    if (!playback) return
    if (!this.throttle('success', 200)) return
    const { ctx, masterGain } = playback

    const now = ctx.currentTime

    try {
      // Arpeggio
      ;[440, 554, 659].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.value = freq

        gain.gain.setValueAtTime(0, now + i * 0.05)
        gain.gain.linearRampToValueAtTime(0.1, now + i * 0.05 + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.4)

        osc.connect(gain)
        gain.connect(masterGain)

        osc.start(now + i * 0.05)
        osc.stop(now + i * 0.05 + 0.4)
        osc.onended = () => {
          this.disconnectNode(osc)
          this.disconnectNode(gain)
        }
      })
    } catch {
      this.handlePlaybackError(ctx)
    }
  }

  /**
   * Plays a soft "reverse hihat/cymbal tail" sound for opening UI elements.
   * Very subtle - like a whisper of air.
   */
  public playSwish(): void {
    const playback = this.preparePlayback()
    if (!playback) return
    if (!this.throttle('swish', 100)) return
    const { ctx, masterGain } = playback

    try {
      const now = ctx.currentTime
      const duration = 0.08
      const sampleRate = ctx.sampleRate
      const bufferSize = Math.floor(sampleRate * duration)

      // Create noise buffer
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate)
      const data = buffer.getChannelData(0)

      // Very gentle rise and fall
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize
        // Sine-shaped envelope for smoothness
        const envelope = Math.sin(t * Math.PI) * 0.5
        data[i] = (Math.random() * 2 - 1) * envelope
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer

      // Soft bandpass - lower frequency, wider Q
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1500
      filter.Q.value = 0.3

      const gain = ctx.createGain()
      gain.gain.value = 0.06

      source.connect(filter)
      filter.connect(gain)
      gain.connect(masterGain)

      source.start(now)
      source.stop(now + duration)
      source.onended = () => {
        this.disconnectNode(source)
        this.disconnectNode(filter)
        this.disconnectNode(gain)
      }
    } catch {
      this.handlePlaybackError(ctx)
    }
  }

  public toggle(enabled: boolean): void {
    this.enabled = enabled
    this.listeners.forEach((l) => l())
  }

  public get isEnabled(): boolean {
    return this.enabled
  }

  /** Subscribe to enabled state changes (for useSyncExternalStore). */
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Get current enabled snapshot (for useSyncExternalStore). */
  public getSnapshot = (): boolean => {
    return this.enabled
  }
}

export const soundManager = new SoundManager()
