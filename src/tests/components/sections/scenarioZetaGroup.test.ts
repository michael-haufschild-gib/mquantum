import { describe, expect, it } from 'vitest'

import {
  parseZetaGroupValue,
  zetaGroupActiveValue,
  zetaGroupScenarioOptions,
} from '@/components/sections/Geometry/ScenarioSelector.zetaGroup'
import { ZETA_PRIME_GROUP } from '@/lib/geometry/registry'

describe('Zeta / Prime group scenario options', () => {
  const options = zetaGroupScenarioOptions(ZETA_PRIME_GROUP)
  const presetRows = options.filter((o) => !o.disabled)

  it('lists scenarios from EVERY member mode (not just the active one)', () => {
    for (const member of ZETA_PRIME_GROUP.members) {
      const has = presetRows.some((o) => o.value.startsWith(`${member}::`))
      expect(has, `no scenarios listed for member ${member}`).toBe(true)
    }
  })

  it('includes presets from distinct families together (spectral + WDW suite)', () => {
    // a spectral member and a suite member both appear in the one stable list
    expect(presetRows.some((o) => o.value.startsWith('riemannZeta::'))).toBe(true)
    expect(presetRows.some((o) => o.value.startsWith('constraintSeam::'))).toBe(true)
    expect(presetRows.some((o) => o.value.startsWith('weilPositivity::'))).toBe(true)
    // total is the sum across members, so comfortably more than any one mode's
    expect(presetRows.length).toBeGreaterThan(20)
  })

  it('renders a disabled section header per member', () => {
    const headers = options.filter((o) => o.disabled)
    expect(headers.length).toBe(ZETA_PRIME_GROUP.members.length)
  })

  it('round-trips encode → parse to (subMode, presetId)', () => {
    const parsed = parseZetaGroupValue(zetaGroupActiveValue('constraintSeam', 'completedState'))
    expect(parsed).toEqual({ memberKey: 'constraintSeam', presetId: 'completedState' })
  })

  it('parses every real option value to a member of the group', () => {
    for (const row of presetRows) {
      const parsed = parseZetaGroupValue(row.value)
      // null → memberKey undefined → toContain fails (catches a parse regression)
      expect(ZETA_PRIME_GROUP.members).toContain(parsed?.memberKey)
    }
  })

  it('rejects header rows and an empty active value', () => {
    const header = zetaGroupScenarioOptions(ZETA_PRIME_GROUP).find((o) => o.disabled)!
    expect(parseZetaGroupValue(header.value)).toBeNull()
    expect(zetaGroupActiveValue('constraintSeam', '')).toBe('')
  })
})
