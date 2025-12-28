import { Color } from 'three';

// Types
export interface HSVA {
  h: number; // 0-1
  s: number; // 0-1
  v: number; // 0-1
  a: number; // 0-1
}

export interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

/**
 * Parses any valid color string into HSVA.
 * Supports: Hex, Hex8, RGB, RGBA.
 * Falls back to black if invalid.
 * @param input - The color string to parse.
 * @returns The parsed HSVA color object.
 */
export const parseColorToHsv = (input: string): HSVA => {
  // 1. Try Hex/Hex8
  if (input.startsWith('#')) {
    const hex = input.substring(1);
    if (hex.length === 3 || hex.length === 6) {
      return hexToHsv(input);
    }
    if (hex.length === 4 || hex.length === 8) {
      return hex8ToHsv(input);
    }
  }

  // 2. Try RGB/RGBA regex (basic)
  const rgbaMatch = input.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1] ?? '0', 10);
    const g = parseInt(rgbaMatch[2] ?? '0', 10);
    const b = parseInt(rgbaMatch[3] ?? '0', 10);
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    return rgbToHsv(r, g, b, a);
  }

  // Fallback using Three.js (ignores alpha)
  try {
    const color = new Color(input);
    const { h, s, v } = rgbToHsvStruct(color.r * 255, color.g * 255, color.b * 255);
    return { h, s, v, a: 1 };
  } catch {
    return { h: 0, s: 0, v: 0, a: 1 };
  }
};

/**
 * Converts Hex (6 char) to HSVA (Alpha=1).
 * @param hex - The hex string.
 * @returns The HSVA color object.
 */
export const hexToHsv = (hex: string): HSVA => {
  try {
    const color = new Color(hex);
    const { h, s, v } = rgbToHsvStruct(color.r * 255, color.g * 255, color.b * 255);
    return { h, s, v, a: 1 };
  } catch {
    return { h: 0, s: 0, v: 0, a: 1 };
  }
};

/**
 * Converts Hex8 (#RRGGBBAA) to HSVA.
 * @param hex8 - The hex8 string.
 * @returns The HSVA color object.
 */
export const hex8ToHsv = (hex8: string): HSVA => {
  // normalize
  let hex = hex8.replace('#', '');
  if (hex.length === 4) {
    hex = hex.split('').map(c => c + c).join('');
  }
  
  if (hex.length !== 8) return { h: 0, s: 0, v: 0, a: 1 };

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = parseInt(hex.substring(6, 8), 16) / 255;

  return rgbToHsv(r, g, b, a);
};

/**
 * Helper: RGB to HSV structure.
 * @param r - Red (0-255).
 * @param g - Green (0-255).
 * @param b - Blue (0-255).
 * @returns HSV object { h, s, v }.
 */
const rgbToHsvStruct = (r: number, g: number, b: number) => {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const d = max - min;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  let h = 0;

  if (max !== min) {
    switch (max) {
      case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
      case gN: h = (bN - rN) / d + 2; break;
      case bN: h = (rN - gN) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, v };
};

/**
 * Converts RGB(A) to HSVA.
 * @param r - Red (0-255).
 * @param g - Green (0-255).
 * @param b - Blue (0-255).
 * @param a - Alpha (0-1).
 * @returns The HSVA color object.
 */
export const rgbToHsv = (r: number, g: number, b: number, a: number = 1): HSVA => {
  const { h, s, v } = rgbToHsvStruct(r, g, b);
  return { h, s, v, a };
};

/**
 * Converts HSVA to Hex (6 char) - Ignors Alpha.
 * @param h - Hue (0-1).
 * @param s - Saturation (0-1).
 * @param v - Value (0-1).
 * @returns The hex string.
 */
export const hsvToHex = (h: number, s: number, v: number): string => {
  const { r, g, b } = hsvToRgbStruct(h, s, v);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

/**
 * Converts HSVA to Hex8 (#RRGGBBAA).
 * @param h - Hue (0-1).
 * @param s - Saturation (0-1).
 * @param v - Value (0-1).
 * @param a - Alpha (0-1).
 * @returns The hex8 string.
 */
export const hsvToHex8 = (h: number, s: number, v: number, a: number): string => {
  const hex = hsvToHex(h, s, v);
  const alpha = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex}${alpha}`;
};

/**
 * Converts HSVA to RGB object.
 * @param h - Hue (0-1).
 * @param s - Saturation (0-1).
 * @param v - Value (0-1).
 * @param a - Alpha (0-1).
 * @returns The RGBA color object.
 */
export const hsvToRgb = (h: number, s: number, v: number, a: number = 1): RGBA => {
  const { r, g, b } = hsvToRgbStruct(h, s, v);
  return { r, g, b, a };
};

/** Converts RGB (0-255) to Hex string.
 * @param r - Red.
 * @param g - Green.
 * @param b - Blue.
 * @returns Hex string.
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
  const color = new Color();
  color.setRGB(r / 255, g / 255, b / 255);
  return '#' + color.getHexString();
};

/**
 * Helper: HSV to RGB struct.
 * @param h - Hue.
 * @param s - Saturation.
 * @param v - Value.
 * @returns RGB struct.
 */
const hsvToRgbStruct = (h: number, s: number, v: number) => {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

/**
 * Validates Hex (6 or 8).
 * @param hex - The hex string.
 * @returns True if valid.
 */
export const isValidHex = (hex: string): boolean => {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
};

/**
 * Generates Tints and Shades.
 * @param h - Hue.
 * @param s - Saturation.
 * @param v - Value.
 * @param count - Number of tints/shades.
 * @returns Array of hex strings.
 */
export const generatePalette = (h: number, s: number, v: number, count: number = 4): string[] => {
  const palette: string[] = [];
  
  // Tints (lighter)
  for (let i = count; i > 0; i--) {
    const factor = i / (count + 1);
    // reduce saturation, increase value
    palette.push(hsvToHex(h, s * (1 - factor), Math.min(1, v + (1 - v) * factor)));
  }
  
  // Current
  // palette.push(hsvToHex(h, s, v)); // Optional: Include current? Usually sidebar

  // Shades (darker)
  for (let i = 1; i <= count; i++) {
    const factor = i / (count + 1);
    // keep saturation, reduce value
    palette.push(hsvToHex(h, s, Math.max(0, v * (1 - factor))));
  }

  return palette;
};

/**
 * Get contrasting text color (black/white).
 * @param h - Hue.
 * @param s - Saturation.
 * @param v - Value.
 * @returns 'black' or 'white'.
 */
export const getContrastColor = (h: number, s: number, v: number): string => {
  // Simple luminance approximation
  // Alternatively use YIQ equation
  // (0.299*R + 0.587*G + 0.114*B)
  const { r, g, b } = hsvToRgbStruct(h, s, v);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? 'black' : 'white';
};
