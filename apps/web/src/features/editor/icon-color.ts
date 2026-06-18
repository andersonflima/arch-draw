// Resolves the accent colour used by node/palette icons from a node's base colour.
// Pure and memoized so it can be shared by the canvas and the (OnPush) palette
// without re-running the HSL maths on every change-detection pass.
const DEFAULT_ICON_COLOR = "#2563eb";
const iconColorCache = new Map<string, string>();

const normalizeHexColor = (value: string): string | null => {
  const trimmed = value.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed)) return null;
  if (trimmed.length === 4) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
};

const hexToRgb = (hex: string): Readonly<{ r: number; g: number; b: number }> | null => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized.slice(1), 16);
  if (Number.isNaN(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
};

const rgbToHsl = (r: number, g: number, b: number): Readonly<{ h: number; s: number; l: number }> => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / delta + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h /= 6;
  }
  return { h, s: s * 100, l: l * 100 };
};

const hslToHex = (h: number, s: number, l: number): string => {
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const hueToRgb = (p: number, q: number, t: number): number => {
    let adjusted = t;
    if (adjusted < 0) adjusted += 1;
    if (adjusted > 1) adjusted -= 1;
    if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
    if (adjusted < 1 / 2) return q;
    if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (saturation === 0) {
    r = lightness;
    g = lightness;
    b = lightness;
  } else {
    const q = lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  const toHex = (channel: number): string =>
    Math.round(channel * 255).toString(16).padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const resolveIconColor = (baseColor: string | undefined): string => {
  const normalized = normalizeHexColor(baseColor ?? "");
  if (!normalized) return DEFAULT_ICON_COLOR;
  const cached = iconColorCache.get(normalized);
  if (cached) return cached;

  const rgb = hexToRgb(normalized);
  if (!rgb) return DEFAULT_ICON_COLOR;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const strong = hslToHex(
    hsl.h,
    Math.max(60, hsl.s),
    Math.min(42, Math.max(30, hsl.l * 0.52))
  );
  iconColorCache.set(normalized, strong);
  return strong;
};
