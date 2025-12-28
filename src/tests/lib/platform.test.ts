/**
 * Tests for platform detection utilities
 */

import { describe, expect, it } from 'vitest';
import { getModifierKey, getModifierSymbols, getPlatformKeyLabel, isMac } from '@/lib/platform';

describe('platform detection', () => {
  // Note: In Node.js test environment, navigator is undefined so isMac = false
  it('should detect non-Mac platform in test environment', () => {
    expect(isMac).toBe(false);
  });
});

describe('getModifierKey', () => {
  it('should return Ctrl for non-Mac platforms', () => {
    // In test environment (Node.js), navigator is undefined so we get Windows/Linux symbols
    expect(getModifierKey()).toBe('Ctrl');
  });
});

describe('getModifierSymbols', () => {
  it('should return Windows/Linux symbols in test environment', () => {
    const symbols = getModifierSymbols();
    expect(symbols.ctrl).toBe('Ctrl');
    expect(symbols.shift).toBe('Shift');
    expect(symbols.alt).toBe('Alt');
  });
});

describe('getPlatformKeyLabel', () => {
  it('should convert Delete to Del on non-Mac', () => {
    expect(getPlatformKeyLabel('Delete')).toBe('Del');
  });

  it('should convert Escape to Esc', () => {
    expect(getPlatformKeyLabel('Escape')).toBe('Esc');
  });

  it('should convert arrow keys to symbols', () => {
    expect(getPlatformKeyLabel('ArrowUp')).toBe('↑');
    expect(getPlatformKeyLabel('ArrowDown')).toBe('↓');
    expect(getPlatformKeyLabel('ArrowLeft')).toBe('←');
    expect(getPlatformKeyLabel('ArrowRight')).toBe('→');
  });

  it('should convert space to Space', () => {
    expect(getPlatformKeyLabel(' ')).toBe('Space');
  });

  it('should return unknown keys as-is', () => {
    expect(getPlatformKeyLabel('a')).toBe('a');
    expect(getPlatformKeyLabel('F1')).toBe('F1');
    expect(getPlatformKeyLabel('\\')).toBe('\\');
  });
});
