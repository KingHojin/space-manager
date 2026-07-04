const TYPE_PRESETS = {
  station: { baseColor: "#94a3b8", emissiveColor: "#38bdf8" },
  nebula: { baseColor: "#818cf8", emissiveColor: "#a78bfa" },
  ruin: { baseColor: "#b45309", emissiveColor: "#f59e0b" },
  anomaly: { baseColor: "#22d3ee", emissiveColor: "#06b6d4" },
  creature: { baseColor: "#4ade80", emissiveColor: "#16a34a" },
  mining: { baseColor: "#a16207", emissiveColor: "#ca8a04" },
  gate: { baseColor: "#e879f9", emissiveColor: "#c026d3" },
  wreck: { baseColor: "#f87171", emissiveColor: "#b91c1c" },
};

const DEFAULT_PRESET = { baseColor: "#64748b", emissiveColor: "#334155" };

const DEFAULT_VISUAL = {
  baseColor: DEFAULT_PRESET.baseColor,
  emissiveColor: DEFAULT_PRESET.emissiveColor,
  size: 1,
  hasRing: false,
  roughness: 0.6,
  metalness: 0.2,
  emissiveIntensity: 0.2,
  seed: 0,
};

function hashSeed(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function shiftHue(hex, degrees) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  h = (h + degrees + 360) % 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r2, g2, b2] = [0, 0, 0];
  if (h < 60) [r2, g2, b2] = [c, x, 0];
  else if (h < 120) [r2, g2, b2] = [x, c, 0];
  else if (h < 180) [r2, g2, b2] = [0, c, x];
  else if (h < 240) [r2, g2, b2] = [0, x, c];
  else if (h < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];

  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

export function getPlanetVisual(zone) {
  if (!zone || !zone.id) return DEFAULT_VISUAL;

  const preset = TYPE_PRESETS[zone.type] ?? DEFAULT_PRESET;
  const seed = hashSeed(zone.id);
  const danger = zone.danger ?? 1;
  const richness = zone.richness ?? 1;

  const hueOffset = (seed % 40) - 20;
  const baseColor = shiftHue(preset.baseColor, hueOffset);
  const emissiveColor = shiftHue(preset.emissiveColor, hueOffset);

  const size = 0.8 + ((seed % 100) / 100) * 0.6;
  const hasRing = seed % 5 === 0;
  const roughness = Math.max(0.15, 0.7 - richness * 0.08);
  const metalness = Math.min(0.8, 0.1 + danger * 0.1);
  const emissiveIntensity = Math.min(1, 0.15 + danger * 0.15);

  return { baseColor, emissiveColor, size, hasRing, roughness, metalness, emissiveIntensity, seed };
}
