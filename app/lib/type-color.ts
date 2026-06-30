// Map an OKF concept `type` (arbitrary string) to a stable color.
// Curated anchors for the common types; everything else hashes to a hue so
// unknown types get a stable, distinct color.
//
// Colors are hex / comma-form hsl() so they parse in BOTH the DOM (CSS) and
// the Cytoscape canvas renderer (which does NOT understand oklch()).

const ANCHORS: ReadonlyArray<readonly [keyword: string, color: string]> = [
  ['table', '#2f5dad'], // blue
  ['dataset', '#2f7d52'], // green
  ['metric', '#9a6a1f'], // amber
  ['index', '#9a3f86'], // magenta
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function typeColor(type: string): string {
  const key = type.toLowerCase();
  for (const [keyword, color] of ANCHORS) {
    if (key.includes(keyword)) return color;
  }
  const hue = Math.round((hashCode(type) * 137.508) % 360);
  return `hsl(${hue}, 48%, 42%)`;
}
