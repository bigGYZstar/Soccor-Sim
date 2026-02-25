// Pure mathematical utility functions for vector operations
// No UI dependencies - testable in isolation

import { V } from './types';
import { P } from './constants';

export const v = (x: number, y: number): V => ({ x, y });

export const vadd = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });

export const vsub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });

export const vscl = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });

export const vlen = (a: V): number => Math.sqrt(a.x * a.x + a.y * a.y);

export const vnorm = (a: V): V => {
  const l = vlen(a);
  return l > 0 ? vscl(a, 1 / l) : { x: 1, y: 0 };
};

export const vdist = (a: V, b: V): number => vlen(vsub(a, b));

export const vdot = (a: V, b: V): number => a.x * b.x + a.y * b.y;

export const vlerp = (a: V, b: V, t: number): V => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const vang = (a: V, b: V): number => {
  const dot = vdot(vnorm(a), vnorm(b));
  return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
};

export const clamp = (val: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, val));

export const rng = (a: number, b: number): number =>
  a + Math.random() * (b - a);

export const pitchClamp = (p: V): V => ({
  x: clamp(p.x, -P.pitchHalfW, P.pitchHalfW),
  y: clamp(p.y, -P.pitchHalfH, P.pitchHalfH),
});

export const vmove = (from: V, to: V, d: number): V => {
  const dist = vdist(from, to);
  // ★ Fix: Prevent zero-division and NaN when already at target
  if (dist <= 0.001 || dist <= d) return v(to.x, to.y);
  return vadd(from, vscl(vsub(to, from), d / dist));
};

// v8.8.3: Distance from line segment (p1 -> p2) to point
export const distSegmentToPoint = (p1: V, p2: V, point: V): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    // Segment is a point
    return vdist(p1, point);
  }
  
  // Project point onto line segment
  // t = ((point - p1) · (p2 - p1)) / |p2 - p1|²
  const t = Math.max(0, Math.min(1, 
    ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared
  ));
  
  // Closest point on segment
  const closest = v(p1.x + t * dx, p1.y + t * dy);
  return vdist(closest, point);
};
