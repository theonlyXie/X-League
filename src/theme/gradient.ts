/**
 * `expo-linear-gradient` takes unit-square start/end points; the design writes
 * CSS angles. CSS measures clockwise from "to top", so this converts one to the
 * other rather than eyeballing each gradient.
 */
export function cssAngle(deg: number) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return {
    start: { x: 0.5 - dx / 2, y: 0.5 - dy / 2 },
    end: { x: 0.5 + dx / 2, y: 0.5 + dy / 2 },
  };
}
