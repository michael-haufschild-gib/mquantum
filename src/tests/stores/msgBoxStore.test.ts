/**
 * Tests for msgBoxStore — dialog lifecycle and action dispatch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMsgBoxStore } from '@/stores/msgBoxStore'

describe('msgBoxStore', () => {
  beforeEach(() => {
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
    })
  })

  it('opens with title, message, and specified type', () => {
    useMsgBoxStore.getState().showMsgBox('Error', 'Something went wrong', 'error')

    const state = useMsgBoxStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.title).toBe('Error')
    expect(state.message).toBe('Something went wrong')
    expect(state.type).toBe('error')
  })

  it('defaults to info type and provides OK action when no args given', () => {
    useMsgBoxStore.getState().showMsgBox('Title', 'Message')

    const state = useMsgBoxStore.getState()
    expect(state.type).toBe('info')
    expect(state.actions).toHaveLength(1)
    expect(state.actions[0]?.label).toBe('OK')
  })

  it('default OK action closes the dialog', () => {
    useMsgBoxStore.getState().showMsgBox('Info', 'Done')
    useMsgBoxStore.getState().actions[0]?.onClick()

    expect(useMsgBoxStore.getState().isOpen).toBe(false)
  })

  it('custom actions preserve labels, variants, and invoke callbacks', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    useMsgBoxStore.getState().showMsgBox('Confirm', 'Sure?', 'warning', [
      { label: 'Confirm', onClick: onConfirm, variant: 'danger' },
      { label: 'Cancel', onClick: onCancel, variant: 'ghost' },
    ])

    const { actions } = useMsgBoxStore.getState()
    expect(actions).toHaveLength(2)
    expect(actions[0]?.variant).toBe('danger')
    expect(actions[1]?.variant).toBe('ghost')

    actions[0]?.onClick()
    expect(onConfirm).toHaveBeenCalledTimes(1)

    actions[1]?.onClick()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('actions without variant default to undefined', () => {
    useMsgBoxStore.getState().showMsgBox('T', 'M', 'info', [{ label: 'Plain', onClick: vi.fn() }])
    expect(useMsgBoxStore.getState().actions[0]?.variant).toBeUndefined()
  })

  it('closeMsgBox closes an open dialog', () => {
    useMsgBoxStore.getState().showMsgBox('Title', 'Message')
    useMsgBoxStore.getState().closeMsgBox()

    expect(useMsgBoxStore.getState().isOpen).toBe(false)
  })

  it('supports all message types', () => {
    for (const type of ['info', 'error', 'success', 'warning'] as const) {
      useMsgBoxStore.getState().showMsgBox('T', 'M', type)
      expect(useMsgBoxStore.getState().type).toBe(type)
    }
  })
})
