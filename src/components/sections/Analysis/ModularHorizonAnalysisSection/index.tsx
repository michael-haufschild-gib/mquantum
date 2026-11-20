import { useEffect, useMemo, useRef } from 'react'

import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { detectorBasis, fidelity, horizonPhases, populations } from '@/lib/physics/modularHorizon'
import {
  INNER_RADIUS,
  OUTER_RADIUS,
  radialProfile,
  REFERENCE_RADIUS,
} from '@/lib/physics/modularHorizon/exterior'
import { useAnimationStore } from '@/stores/scene/animationStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

/** Normalized return, relative phases, and signed detector amplitude on the evolution clock. */
export function ModularHorizonAnalysis() {
  const c = useExtendedObjectStore((s) => s.schroedinger.modularHorizon)
  const bulk = useGeometryStore((s) => s.dimension === 3)
  const radius = bulk ? c.probeRadius : REFERENCE_RADIUS
  const timeScale = useExtendedObjectStore((s) => s.schroedinger.timeScale)
  const edit = useExtendedObjectStore((s) => s.setModularHorizonConfig)
  const readout = useRef<HTMLOutputElement>(null)
  const plot = useRef<HTMLCanvasElement>(null)
  const probe = useMemo(() => detectorBasis(c.pin, c.width), [c.pin, c.width])
  useEffect(() => {
    const radial = radialProfile(radius)
    const p = populations(c.weights)
    const canvas = plot.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    const style = getComputedStyle(canvas)
    const warm = style.getPropertyValue('--chart-cost-warm').trim()
    const accent = style.getPropertyValue('--chart-pass-1').trim()
    const text = style.getPropertyValue('--text-secondary').trim()
    const muted = style.getPropertyValue('--text-tertiary').trim()
    let chartStart = -Infinity
    let curve = new Path2D()
    let last = -Infinity
    function paint() {
      if (!g || !canvas || !readout.current) return
      const t = Math.max(0, useAnimationStore.getState().accumulatedTime * timeScale)
      if (t === last) return
      last = t
      const phases = horizonPhases(c.weights, t, radial.delay),
        envelope = Math.exp(-t / 2)
      let re = 0,
        im = 0
      phases.forEach((v, i) => {
        const a = radial.gain * probe[i]! * Math.sqrt(p[i]!) * (c.raw ? envelope : 1)
        re += a * Math.cos(v)
        im += a * Math.sin(v)
      })
      readout.current.textContent = `τ  ${t.toFixed(3)}\nReturn fidelity  ${(100 * fidelity(c.weights, t)).toFixed(2)}%\nRingdown amplitude  ${(100 * envelope).toPrecision(3)}%\nDetector  ${re.toFixed(4)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(4)}i`
      const start = 12 * Math.floor(t / 12)
      g.clearRect(0, 0, canvas.width, canvas.height)
      g.strokeStyle = warm
      if (start !== chartStart) {
        chartStart = start
        curve = new Path2D()
        for (let x = 0; x <= 280; x++) {
          const y = 8 + 65 * (1 - fidelity(c.weights, start + (12 * x) / 280))
          if (x === 0) curve.moveTo(x, y)
          else curve.lineTo(x, y)
        }
      }
      g.stroke(curve)
      const cursor = (280 * (t - start)) / 12
      g.strokeStyle = accent
      g.beginPath()
      g.moveTo(cursor, 5)
      g.lineTo(cursor, 75)
      g.stroke()
      g.fillStyle = text
      g.font = '11px monospace'
      g.fillText(`${start} τ`, 1, 90)
      g.fillText(`${start + 12} τ`, 235, 90)
      phases.forEach((v, i) => {
        const x = 42 + 95 * i,
          y = 116
        g.strokeStyle = p[i] ? accent : muted
        g.beginPath()
        g.arc(x, y, 16, 0, 2 * Math.PI)
        g.stroke()
        if (p[i]) {
          g.beginPath()
          g.moveTo(x, y)
          g.lineTo(x + 14 * Math.sin(v), y - 14 * Math.cos(v))
          g.stroke()
        }
      })
    }
    paint()
    const timer = window.setInterval(paint, 100)
    return () => window.clearInterval(timer)
  }, [c.weights, c.raw, probe, radius, timeScale])
  function seek(fraction: number) {
    const clock = useAnimationStore.getState().accumulatedTime * timeScale
    const start = 12 * Math.floor(Math.max(0, clock) / 12)
    useAnimationStore.setState({
      accumulatedTime: (start + 12 * Math.max(0, Math.min(0.999999, fraction))) / timeScale,
    })
  }
  return (
    <Section title="Horizon Recurrence" defaultOpen>
      <canvas
        data-testid="horizon-fidelity-chart"
        title="Click the fidelity curve to seek within this interval."
        ref={plot}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          if ((event.clientY - box.top) / box.height < 0.55)
            seek((event.clientX - box.left) / box.width)
        }}
        width={280}
        height={138}
        className="w-full"
        aria-label="Return fidelity over 12 time units and three relative phase indicators"
      />
      <Button
        data-testid="horizon-reset-time"
        tooltip="Reset the evolution clock to the launch state."
        className="text-xs text-text-secondary"
        onClick={() => useAnimationStore.setState({ accumulatedTime: 0 })}
      >
        Return to launch
      </Button>
      <output ref={readout} className="block whitespace-pre font-mono text-xs" />
      {bulk && (
        <Slider
          data-testid="horizon-detector-radius"
          tooltip="Sample the complex master field at this exterior radius in AdS units."
          label="Detector radius"
          value={radius}
          min={INNER_RADIUS}
          max={OUTER_RADIUS}
          step={0.01}
          onChange={(probeRadius) => edit({ probeRadius })}
        />
      )}
      <Slider
        data-testid="horizon-detector-width"
        tooltip="Average the complex field along a fraction of one horocycle period."
        label="Detector width (horocycle periods)"
        min={0}
        max={1}
        step={0.01}
        value={c.width}
        onChange={(width) => edit({ width })}
      />
      <p className="text-xs text-text-secondary">
        {bulk
          ? 'Click the volume to pin the detector on its selected shell. Fidelity compares the normalized angular state to its launch on that shell.'
          : 'Click the disk to pin the detector.'}{' '}
        Detector phase is relative to the first occupied mode. A full horocycle period averages to
        zero.
      </p>
    </Section>
  )
}
