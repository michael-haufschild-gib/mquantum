import { describe, expect, it } from 'vitest'

import {
  splitSrmtSweepCsv,
  SRMT_SWEEP_SPECTRA_TAIL_HEADER,
  SRMT_SWEEP_SPECTRA_TAIL_MARKER,
} from '../../../scripts/playwright/helpers/srmt-csv'

describe('splitSrmtSweepCsv', () => {
  it('splits only on a full-line tail marker and strips the blank separator', () => {
    const main = '# SRMT sweep, kind=cut\nindex,sweepValue\n0,0.5\n'
    const csv = `${main}\n${SRMT_SWEEP_SPECTRA_TAIL_MARKER}\n${SRMT_SWEEP_SPECTRA_TAIL_HEADER}\n`

    expect(splitSrmtSweepCsv(csv)).toEqual({
      main,
      tail: `${SRMT_SWEEP_SPECTRA_TAIL_MARKER}\n${SRMT_SWEEP_SPECTRA_TAIL_HEADER}\n`,
    })
  })

  it('does not split on marker text embedded in comments or quoted cells', () => {
    const csv = [
      '# SRMT sweep, kind=cut',
      `# note: embedded ${SRMT_SWEEP_SPECTRA_TAIL_MARKER}`,
      'index,sweepValue,sweepValueBc',
      `0,0.5,"quoted ${SRMT_SWEEP_SPECTRA_TAIL_MARKER} marker"`,
      '',
    ].join('\n')

    expect(splitSrmtSweepCsv(csv)).toEqual({ main: csv, tail: null })
  })

  it('does not split on a marker-looking line inside a quoted multiline cell', () => {
    const csv = [
      '# SRMT sweep, kind=cut',
      'index,sweepValue,sweepValueBc',
      `0,0.5,"before`,
      SRMT_SWEEP_SPECTRA_TAIL_MARKER,
      `after"`,
      '',
    ].join('\n')

    expect(splitSrmtSweepCsv(csv)).toEqual({ main: csv, tail: null })
  })

  it('preserves the required row-to-marker newline when no blank separator exists', () => {
    const main = '# SRMT sweep, kind=cut\nindex,sweepValue\n0,0.5\n'
    const csv = `${main}${SRMT_SWEEP_SPECTRA_TAIL_MARKER}\n${SRMT_SWEEP_SPECTRA_TAIL_HEADER}\n`

    expect(splitSrmtSweepCsv(csv).main).toBe(main)
  })

  it('handles CRLF exports without leaving a dangling carriage return', () => {
    const main = '# SRMT sweep, kind=cut\r\nindex,sweepValue\r\n0,0.5\r\n'
    const csv = `${main}\r\n${SRMT_SWEEP_SPECTRA_TAIL_MARKER}\r\n${SRMT_SWEEP_SPECTRA_TAIL_HEADER}\r\n`

    expect(splitSrmtSweepCsv(csv)).toEqual({
      main,
      tail: `${SRMT_SWEEP_SPECTRA_TAIL_MARKER}\r\n${SRMT_SWEEP_SPECTRA_TAIL_HEADER}\r\n`,
    })
  })
})
