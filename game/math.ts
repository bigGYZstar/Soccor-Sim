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
  return dist <= d ? to : vadd(from, vscl(vsub(to, from), d / dist));
};
