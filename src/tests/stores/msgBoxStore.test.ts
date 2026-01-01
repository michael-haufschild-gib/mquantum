/**
 * Tests for msgBoxStore
 * Verifies message box dialog state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMsgBoxStore } from '@/stores/msgBoxStore';

describe('msgBoxStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
    });
  });

  describe('showMsgBox', () => {
    it('should open message box with basic info', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Test Title', 'Test Message');

      const state = useMsgBoxStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.title).toBe('Test Title');
      expect(state.message).toBe('Test Message');
      expect(state.type).toBe('info');
    });

    it('should open message box with specified type', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Error', 'Something went wrong', 'error');

      expect(useMsgBoxStore.getState().type).toBe('error');
    });

    it('should set type to success', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Success', 'Operation completed', 'success');

      expect(useMsgBoxStore.getState().type).toBe('success');
    });

    it('should set type to warning', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Warning', 'Proceed with caution', 'warning');

      expect(useMsgBoxStore.getState().type).toBe('warning');
    });

    it('should provide default OK action when no actions specified', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Title', 'Message');

      const state = useMsgBoxStore.getState();
      expect(state.actions).toHaveLength(1);
      expect(state.actions[0]?.label).toBe('OK');
    });

    it('should use custom actions when provided', () => {
      const { showMsgBox } = useMsgBoxStore.getState();
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      showMsgBox('Confirm', 'Are you sure?', 'warning', [
        { label: 'Confirm', onClick: onConfirm, variant: 'danger' },
        { label: 'Cancel', onClick: onCancel, variant: 'secondary' },
      ]);

      const state = useMsgBoxStore.getState();
      expect(state.actions).toHaveLength(2);
      expect(state.actions[0]?.label).toBe('Confirm');
      expect(state.actions[0]?.variant).toBe('danger');
      expect(state.actions[1]?.label).toBe('Cancel');
      expect(state.actions[1]?.variant).toBe('secondary');
    });

    it('should call action onClick handlers', () => {
      const { showMsgBox } = useMsgBoxStore.getState();
      const onConfirm = vi.fn();

      showMsgBox('Confirm', 'Are you sure?', 'warning', [
        { label: 'Confirm', onClick: onConfirm },
      ]);

      const state = useMsgBoxStore.getState();
      state.actions[0]?.onClick();

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should close dialog when default OK action is clicked', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Info', 'Some information');

      // Click the default OK action
      const actions = useMsgBoxStore.getState().actions;
      actions[0]?.onClick();

      expect(useMsgBoxStore.getState().isOpen).toBe(false);
    });
  });

  describe('closeMsgBox', () => {
    it('should close the message box', () => {
      const { showMsgBox, closeMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Title', 'Message');
      expect(useMsgBoxStore.getState().isOpen).toBe(true);

      closeMsgBox();
      expect(useMsgBoxStore.getState().isOpen).toBe(false);
    });
  });

  describe('action variants', () => {
    it('should support primary variant', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Title', 'Message', 'info', [
        { label: 'Primary', onClick: vi.fn(), variant: 'primary' },
      ]);

      expect(useMsgBoxStore.getState().actions[0]?.variant).toBe('primary');
    });

    it('should support ghost variant', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Title', 'Message', 'info', [
        { label: 'Ghost', onClick: vi.fn(), variant: 'ghost' },
      ]);

      expect(useMsgBoxStore.getState().actions[0]?.variant).toBe('ghost');
    });

    it('should support action without variant (undefined)', () => {
      const { showMsgBox } = useMsgBoxStore.getState();

      showMsgBox('Title', 'Message', 'info', [{ label: 'No Variant', onClick: vi.fn() }]);

      expect(useMsgBoxStore.getState().actions[0]?.variant).toBeUndefined();
    });
  });
});
