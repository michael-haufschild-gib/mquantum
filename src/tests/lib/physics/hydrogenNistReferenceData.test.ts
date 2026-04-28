/**
 * Reference-data oracle: hydrogen non-relativistic energy eigenvalues.
 *
 * This test demonstrates the validation-data pattern documented in
 * `docs/physics/validation/README.md`:
 *  - Reference values + citation + tolerance live in a JSON file.
 *  - The test loads the data and asserts. Updating the dataset is a data
 *    change, not a test-code change.
 *
 * The reference dataset is the closed-form Schrödinger formula
 * E_n = −1/(2 n²) Hartree (citation in the JSON). Tolerance is
 * double-precision round-off — this test verifies the implementation
 * reproduces the formula, not the experimental value (which differs by
 * < 1.4×10⁻⁵ Ha due to relativistic + QED corrections).
 *
 * @module tests/lib/physics/hydrogenNistReferenceData
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { hydrogenEnergy } from '@/lib/physics/openQuantum/hydrogenBasis'

interface HydrogenReferenceEntry {
  n: number
  energy_hartree: number
}

interface HydrogenReferenceFile {
  _meta: {
    tolerance: { value: number; rationale: string }
    source: { name: string; url: string }
  }
  values: HydrogenReferenceEntry[]
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REFERENCE_PATH = path.resolve(
  HERE,
  '../../../../docs/physics/validation/reference-data/hydrogen-nist-energies.json'
)

function loadReference(): HydrogenReferenceFile {
  const raw = fs.readFileSync(REFERENCE_PATH, 'utf-8')
  return JSON.parse(raw) as HydrogenReferenceFile
}

describe('hydrogen energy oracle (reference-data pattern)', () => {
  const reference = loadReference()

  it('reference dataset is non-empty and well-formed', () => {
    // If the dataset itself is broken, every downstream check would silently
    // pass (forEach over empty list). Catch that here so a bad commit to the
    // JSON produces an explicit failure instead of a green-but-vacuous run.
    expect(reference.values.length).toBeGreaterThan(0)
    expect(reference._meta.tolerance['value']).toBeGreaterThan(0)
    expect(reference._meta.source.url).toMatch(/^https?:\/\//)
  })

  const tolerance = reference._meta.tolerance['value']

  it.each(loadReference().values)(
    'E(n=$n) matches reference within tolerance',
    ({ n, energy_hartree: expected }) => {
      const computed = hydrogenEnergy(n)
      expect(
        Math.abs(computed - expected),
        `hydrogenEnergy(${n}) = ${computed}, reference = ${expected}, diff = ${computed - expected}, tolerance = ${tolerance}`
      ).toBeLessThan(tolerance)
    }
  )
})
