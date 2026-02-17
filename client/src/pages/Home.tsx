import { useEffect, useRef, useCallback } from "react";

/*
 * ============================================================
 *  2D 11v11 Soccer Autoplay — Clean Broadcast / Sports TV
 *  Formation: 4-4-2 for both teams
 *  Features: Offside, Out-of-play restarts (throw-in anim,
 *            corner + heading contest), GK saves, Speed toggle,
 *            Long pass AI
 * ============================================================
 */

// ── Tunable Parameters ──────────────────────────────────────
const P = {
  matchDuration: 120,
  goalResetDelay: 2.0,

  pitchHalfW: 10.5,
  pitchHalfH: 6.8,
  goalHalfH: 1.22,
  goalDepth: 0.4,
  penAreaW: 2.75,
  penAreaH: 3.35,
  goalAreaW: 0.92,
  goalAreaH: 1.55,
  centreCircleR: 1.53,
  penSpotDist: 1.83,
  cornerArcR: 0.17,

  moveSpeed: 4.8,
  dribbleSpeed: 3.8,
  passSpeed: 12,
  shotSpeed: 18,
  longPassSpeed: 10,       // slower arc feel
  passAccuracy: 0.88,
  shotAccuracy: 0.60,
  longPassAccuracy: 0.65,
  dribbleControl: 0.90,
  interceptRadius: 0.75,
  decisionInterval: 0.20,
  shotRange: 5.5,
  shotAngle: 55,

  looseBallDrag: 3.5,
  deadBallTime: 0.7,

  trailDuration: 0.35,
  playerRadius: 0.30,
  ballRadius: 0.13,

  // Offside
  offsideEnabled: true,
  offsideMargin: 0.25,
  offsidePause: 1.2,
  restartNoIntercept: 0.5,

  // Out-of-play
  outEnabled: true,
  outMargin: 0.02,
  restartPause: 1.0,
  throwInInset: 0.35,
  cornerInset: 0.25,
  goalKickX: 10.5 - 0.92 + 0.2,

  // GK saves
  gkSaveEnabled: true,
  gkSaveRadius: 0.9,
  gkSaveBase: 0.55,
  gkSaveAngleBonus: 0.20,
  gkParryChance: 0.25,
  gkHoldCooldown: 0.6,

  // Speed toggle
  speedMult: { LOW: 0.75, MID: 1.0, FAST: 1.35 } as Record<string, number>,

  // Long pass
  longPassMinDist: 8,      // minimum distance to consider long pass
  longPassMaxDist: 22,

  // Throw-in / Corner animation
  throwInMaxDist: 12,      // max throw-in distance (~half pitch width + a bit)
  throwInAnimDur: 0.5,     // seconds for throw-in animation
  cornerAnimDur: 0.4,      // seconds for corner kick wind-up
  headingContestRadius: 2.5, // players within this radius contest headers
  headingContestDur: 0.35,
};

// ── Vec2 ────────────────────────────────────────────────────
interface V { x: number; y: number }
const v = (x: number, y: number): V => ({ x, y });
const vadd = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const vsub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const vscl = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const vlen = (a: V): number => Math.sqrt(a.x * a.x + a.y * a.y);
const vnorm = (a: V): V => { const l = vlen(a); return l < 1e-4 ? v(1, 0) : v(a.x / l, a.y / l); };
const vdist = (a: V, b: V): number => vlen(vsub(a, b));
const vdot = (a: V, b: V): number => a.x * b.x + a.y * b.y;
const vlerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const vang = (a: V, b: V): number => {
  const la = vlen(a), lb = vlen(b);
  if (la < 0.001 || lb < 0.001) return 0;
  return Math.acos(Math.max(-1, Math.min(1, vdot(a, b) / (la * lb)))) * 180 / Math.PI;
};
const vmove = (from: V, to: V, d: number): V => {
  const diff = vsub(to, from); const l = vlen(diff);
  return l <= d ? { ...to } : vadd(from, vscl(vnorm(diff), d));
};
const clamp = (val: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, val));
const clamp01 = (val: number) => Math.max(0, Math.min(1, val));
const rng = (a: number, b: number) => a + Math.random() * (b - a);
const pitchClamp = (p: V): V => v(
  clamp(p.x, -P.pitchHalfW, P.pitchHalfW),
  clamp(p.y, -P.pitchHalfH, P.pitchHalfH)
);

// ── Types ───────────────────────────────────────────────────
interface Trail { start: V; end: V; shot: boolean; longPass: boolean; t: number }

type Role = "GK" | "DEF" | "MID" | "FWD";
function slotRole(slot: number): Role {
  if (slot === 0) return "GK";
  if (slot <= 4) return "DEF";
  if (slot <= 8) return "MID";
  return "FWD";
}

type SpeedMode = "LOW" | "MID" | "FAST";

// Set-piece animation types
type SetPieceType = "throw-in" | "corner" | null;

interface SetPieceAnim {
  type: SetPieceType;
  timer: number;       // countdown
  duration: number;
  throwerIdx: number;
  ballTarget: V;       // where ball will go
  phase: "windup" | "release" | "heading"; // animation phase
  headingTimer: number;
  headingPlayers: number[]; // indices of players contesting header
  headingWinner: number;    // index of winner
}

interface Player {
  pos: V; team: number; num: number; home: V;
  face: V; act: "idle" | "dribble" | "move"; tgt: V;
  dt: number;
  isGK: boolean;
  slot: number;
  role: Role;
  jumpY: number; // visual jump offset for heading animation
}

interface Ball {
  pos: V; vel: V; owner: number | null;
  free: boolean; shot: boolean; dead: number;
  cooldown: number;
  lastTouchTeam: number;
  lob: number; // > 0 means ball is in the air (visual height for lob passes)
}

interface State {
  pl: Player[]; ball: Ball;
  sL: number; sR: number; time: number;
  over: boolean; paused: boolean; pauseT: number;
  koSide: number; trail: Trail | null;
  flash: number; flashTxt: string; restartT: number;
  speed: SpeedMode;
  setPiece: SetPieceAnim | null;
}

// ── 4-4-2 Formation ─────────────────────────────────────────
const FORM_442: V[] = [
  v(-9.8, 0),       // 0  GK
  v(-7.5, -4.5),    // 1  LB
  v(-7.5, -1.5),    // 2  CB
  v(-7.5, 1.5),     // 3  CB
  v(-7.5, 4.5),     // 4  RB
  v(-4.5, -5.0),    // 5  LM
  v(-4.5, -1.5),    // 6  CM
  v(-4.5, 1.5),     // 7  CM
  v(-4.5, 5.0),     // 8  RM
  v(-1.5, -1.8),    // 9  ST
  v(-1.5, 1.8),     // 10 ST
];

const NUMS_11 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// ── Init ────────────────────────────────────────────────────
function mkPlayers(): Player[] {
  const out: Player[] = [];
  for (let t = 0; t < 2; t++) {
    const s = t === 0 ? -1 : 1;
    for (let i = 0; i < 11; i++) {
      const f = { ...FORM_442[i] };
      if (s === 1) { f.x = -f.x; f.y = -f.y; }
      out.push({
        pos: { ...f }, team: s, num: NUMS_11[i], home: { ...f },
        face: v(-s, 0), act: "idle", tgt: { ...f },
        dt: Math.random() * P.decisionInterval,
        isGK: i === 0, slot: i, role: slotRole(i),
        jumpY: 0,
      });
    }
  }
  return out;
}

function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0, lastTouchTeam: -1, lob: 0 },
    sL: 0, sR: 0, time: 0,
    over: false, paused: false, pauseT: 0,
    koSide: 1, trail: null,
    flash: 0, flashTxt: "", restartT: 0,
    speed: "MID",
    setPiece: null,
  };
}

// ── Helpers ─────────────────────────────────────────────────
function checkGoal(pos: V): number {
  if (pos.x >= P.pitchHalfW - 0.05 && Math.abs(pos.y) <= P.goalHalfH) return 1;
  if (pos.x <= -P.pitchHalfW + 0.05 && Math.abs(pos.y) <= P.goalHalfH) return -1;
  return 0;
}

function give(ball: Ball, idx: number, pl: Player[]) {
  ball.owner = idx; ball.free = false; ball.shot = false;
  ball.vel = v(0, 0); ball.dead = 0; ball.cooldown = 0.35;
  ball.lastTouchTeam = pl[idx].team;
  ball.lob = 0;
}

function kick(st: State, dir: V, spd: number, shot: boolean, tgt: V, isLong: boolean = false) {
  const b = st.ball;
  if (b.owner !== null) b.lastTouchTeam = st.pl[b.owner].team;
  st.trail = { start: { ...b.pos }, end: { ...tgt }, shot, longPass: isLong, t: P.trailDuration };
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(vnorm(dir), spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0; // lob for long passes
}

function nearest(st: State, pos: V, teamFilter?: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (teamFilter !== undefined && st.pl[i].team !== teamFilter) continue;
    const d = vdist(st.pl[i].pos, pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function nearestOutfield(st: State, pos: V, team: number): number {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== team || st.pl[i].isGK) continue;
    const d = vdist(st.pl[i].pos, pos);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi === -1) return nearest(st, pos, team);
  return bi;
}

function findGK(st: State, team: number): number {
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team === team && st.pl[i].isGK) return i;
  }
  return nearest(st, v(team * P.pitchHalfW, 0), team);
}

// ── Offside ─────────────────────────────────────────────────
function isOffside(st: State, receiver: Player, ballPosAtKick: V): boolean {
  if (!P.offsideEnabled) return false;
  const rTeam = receiver.team;
  const oppTeam = -rTeam;
  if (rTeam * receiver.pos.x >= 0) return false;
  if (rTeam * receiver.pos.x >= rTeam * ballPosAtKick.x) return false;
  const oppXvals: number[] = [];
  for (const p of st.pl) {
    if (p.team !== oppTeam || p.isGK) continue;
    oppXvals.push(p.pos.x);
  }
  if (oppXvals.length < 1) return false;
  oppXvals.sort((a, b) => (rTeam * a) - (rTeam * b));
  const lastDefX = oppXvals.length >= 2 ? oppXvals[1] : oppXvals[0];
  if (rTeam * receiver.pos.x < rTeam * lastDefX - P.offsideMargin) return true;
  return false;
}

// ── AI ──────────────────────────────────────────────────────
function openness(st: State, p: Player): number {
  let mn = Infinity;
  for (const q of st.pl) {
    if (q.team === p.team) continue;
    mn = Math.min(mn, vdist(p.pos, q.pos));
  }
  return mn;
}

function laneBlocked(st: State, from: V, to: V, team: number): boolean {
  const d = vnorm(vsub(to, from));
  const dist = vdist(from, to);
  for (const p of st.pl) {
    if (p.team === team) continue;
    const tp = vsub(p.pos, from);
    const proj = vdot(tp, d);
    if (proj < 0.5 || proj > dist - 0.5) continue;
    const cl = vadd(from, vscl(d, proj));
    if (vdist(cl, p.pos) < 1.0) return true;
  }
  return false;
}

// Best short pass
function bestPass(st: State, idx: number, relaxed: boolean = false): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx) continue;
    const d = vdist(me.pos, p.pos);
    if (d < 1.0 || d > 18) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x;
    let sc = op * 2 + gp * 0.5 - d * 0.12;
    if (!relaxed && laneBlocked(st, me.pos, p.pos, me.team)) sc -= 4;
    else if (relaxed && laneBlocked(st, me.pos, p.pos, me.team)) sc -= 1.5;
    if (P.offsideEnabled && isOffside(st, p, st.ball.pos)) sc -= 10;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return bi;
}

// Best long pass — targets far teammates, especially FWD/MID making runs
function bestLongPass(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx || p.isGK) continue;
    const d = vdist(me.pos, p.pos);
    if (d < P.longPassMinDist || d > P.longPassMaxDist) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x; // progress toward opponent goal
    // Prefer FWDs and wide MIDs for long passes
    let bonus = 0;
    if (p.role === "FWD") bonus = 2.5;
    else if (p.role === "MID" && (p.slot === 5 || p.slot === 8)) bonus = 1.5;
    let sc = op * 1.5 + gp * 0.8 + bonus - d * 0.05;
    // Long passes fly over defenders, so lane blocking matters less
    if (laneBlocked(st, me.pos, p.pos, me.team)) sc -= 1.0;
    if (P.offsideEnabled && isOffside(st, p, st.ball.pos)) sc -= 10;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return (bi !== null && bs > 2) ? bi : null; // threshold to avoid bad long passes
}

function doPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];

  if (P.offsideEnabled && isOffside(st, tm, st.ball.pos)) {
    const oppTeam = -me.team;
    st.paused = true; st.pauseT = P.offsidePause;
    st.flash = 1.2; st.flashTxt = "OFFSIDE";
    st.ball.pos = pitchClamp({ ...tm.pos });
    st.ball.vel = v(0, 0); st.ball.free = false; st.ball.shot = false; st.ball.owner = null;
    const defIdx = nearestOutfield(st, tm.pos, oppTeam);
    give(st.ball, defIdx, st.pl);
    st.ball.cooldown = P.restartNoIntercept;
    return;
  }

  let tp = { ...tm.pos };
  if (tm.act !== "idle") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.1, 1.2)));
  }

  // ── Context-aware pass accuracy ──
  // Base error from passAccuracy parameter
  let baseErr = (1 - P.passAccuracy) * 1.5;

  // Bonus 1: Nearest opponent distance — less pressure = more accurate
  let nearestOppDist = Infinity;
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < nearestOppDist) nearestOppDist = d;
  }
  if (nearestOppDist > 5.0) baseErr *= 0.25;       // very open: almost no error
  else if (nearestOppDist > 3.0) baseErr *= 0.45;   // comfortable space
  else if (nearestOppDist > 2.0) baseErr *= 0.70;   // some pressure
  // else: full error under tight pressure

  // Bonus 2: Short pass distance — shorter = more accurate
  const passDist = vdist(me.pos, tm.pos);
  if (passDist < 4.0) baseErr *= 0.5;              // very short pass
  else if (passDist < 7.0) baseErr *= 0.7;          // medium-short
  // else: full distance penalty

  // Bonus 3: Own half — safer build-up play
  const inOwnHalf = me.team * me.pos.x > 0;
  if (inOwnHalf) baseErr *= 0.6;

  tp.x += rng(-baseErr, baseErr); tp.y += rng(-baseErr, baseErr);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.passSpeed, false, tp);
}

function doLongPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];

  if (P.offsideEnabled && isOffside(st, tm, st.ball.pos)) {
    const oppTeam = -me.team;
    st.paused = true; st.pauseT = P.offsidePause;
    st.flash = 1.2; st.flashTxt = "OFFSIDE";
    st.ball.pos = pitchClamp({ ...tm.pos });
    st.ball.vel = v(0, 0); st.ball.free = false; st.ball.shot = false; st.ball.owner = null;
    const defIdx = nearestOutfield(st, tm.pos, oppTeam);
    give(st.ball, defIdx, st.pl);
    st.ball.cooldown = P.restartNoIntercept;
    return;
  }

  let tp = { ...tm.pos };
  // Lead the target more for long passes
  if (tm.act !== "idle") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.15, 2.0)));
  }
  const err = (1 - P.longPassAccuracy) * 2.5;
  tp.x += rng(-err, err); tp.y += rng(-err, err);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.longPassSpeed, false, tp, true); // isLong = true
}

function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  if (Math.random() > P.dribbleControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, fd, 3, false, vadd(me.pos, vscl(fd, 2)));
    return;
  }
  const gd = vnorm(v(-me.team, 0));
  let avoid = v(0, 0);
  let cd = Infinity;
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < cd && d < 3.5) { cd = d; avoid = vnorm(vsub(me.pos, p.pos)); }
  }
  let wa = v(0, 0);
  const edgeY = P.pitchHalfH - 0.8;
  const edgeX = P.pitchHalfW - 1.0;
  if (me.pos.y > edgeY) wa.y = -(me.pos.y - edgeY) * 1.5;
  if (me.pos.y < -edgeY) wa.y = (-edgeY - me.pos.y) * 1.5;
  if (me.pos.x > edgeX) wa.x = -(me.pos.x - edgeX) * 1.2;
  if (me.pos.x < -edgeX) wa.x = (-edgeX - me.pos.x) * 1.2;
  const jink = v(0, rng(-0.4, 0.4));
  const desired = vnorm(vadd(vadd(vadd(vscl(gd, 0.55), vscl(avoid, 0.3)), wa), jink));
  me.tgt = pitchClamp(vadd(me.pos, vscl(desired, 4.0)));
  me.act = "dribble";
  me.face = desired;
}

// ── Cross into the box (winger special) ─────────────────────
function doCross(st: State, idx: number) {
  const me = st.pl[idx];
  const oppGoalX = -me.team * P.pitchHalfW;
  // Target: near post or far post area in the box
  const nearPost = v(oppGoalX * 0.88, -P.goalHalfH * rng(0.3, 1.2));
  const farPost = v(oppGoalX * 0.88, P.goalHalfH * rng(0.3, 1.2));
  // Choose near or far post based on winger side
  const isTopWinger = me.home.y < 0; // LM is top (negative y)
  const crossTarget = isTopWinger ? farPost : nearPost;
  // Find best teammate near the cross target
  let bestIdx: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx || p.isGK) continue;
    if (p.role !== "FWD" && p.role !== "MID") continue;
    const d = vdist(p.pos, crossTarget);
    if (d < bestDist && d < 6) { bestDist = d; bestIdx = i; }
  }
  let tp = bestIdx !== null ? { ...st.pl[bestIdx].pos } : crossTarget;
  // Lead the target slightly
  if (bestIdx !== null && st.pl[bestIdx].act !== "idle") {
    const lead = vnorm(vsub(st.pl[bestIdx].tgt, st.pl[bestIdx].pos));
    tp = vadd(tp, vscl(lead, 1.0));
  }
  const err = 1.2;
  tp.x += rng(-err * 0.5, err * 0.5); tp.y += rng(-err, err);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.longPassSpeed * 1.1, false, tp, true); // lob cross
}

function decideHasBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * P.pitchHalfW, 0);
  const dg = vdist(me.pos, gc);
  const tg = vnorm(vsub(gc, me.pos));
  const ag = vang(me.face, tg);

  const inOwnThird = me.team * me.pos.x > P.pitchHalfW * 0.33;
  const inAttackingThird = -me.team * me.pos.x > P.pitchHalfW * 0.33;
  const isWinger = me.slot === 5 || me.slot === 8;
  const isWide = Math.abs(me.pos.y) > P.pitchHalfH * 0.45;

  // GK or deep defender: try pass first, consider long pass
  if (me.isGK || inOwnThird) {
    // Try long pass first when under pressure or from deep
    const lp = bestLongPass(st, idx);
    if (lp !== null && Math.random() < 0.45) {
      doLongPassTo(st, idx, lp); return;
    }
    const bp = bestPass(st, idx, true);
    if (bp !== null) { doPassTo(st, idx, bp); return; }
    if (lp !== null) { doLongPassTo(st, idx, lp); return; }
    const fwd = vnorm(v(-me.team + rng(-0.3, 0.3), rng(-0.5, 0.5)));
    me.face = fwd;
    kick(st, fwd, P.passSpeed * 0.8, false, vadd(me.pos, vscl(fwd, 8)));
    return;
  }

  // ── Winger in attacking third: dribble toward byline or cross ──
  if (isWinger && inAttackingThird) {
    // If near the byline and wide, cross into the box
    const nearByline = Math.abs(me.pos.x) > P.pitchHalfW * 0.75;
    if (nearByline && isWide) {
      // 70% cross, 30% cut inside and shoot/pass
      if (Math.random() < 0.70) {
        doCross(st, idx); return;
      }
    }
    // If wide but not at byline yet, dribble toward byline
    if (isWide && !nearByline) {
      // Dribble forward along the wing
      const bylineDir = vnorm(v(-me.team, 0));
      const wideKeep = v(0, me.pos.y > 0 ? 0.15 : -0.15); // stay wide
      const desired = vnorm(vadd(bylineDir, wideKeep));
      me.tgt = pitchClamp(vadd(me.pos, vscl(desired, 4.0)));
      me.act = "dribble";
      me.face = desired;
      return;
    }
    // Winger cut inside: try shot or pass
    if (dg < P.shotRange * 1.1 && ag < P.shotAngle * 1.2) {
      const err = (1 - P.shotAccuracy) * 3.0;
      const t = v(gc.x, gc.y + rng(-err, err));
      me.face = vnorm(vsub(t, me.pos));
      kick(st, me.face, P.shotSpeed, true, t);
      return;
    }
    // Cross even if not super wide, if in attacking third
    if (Math.random() < 0.40) {
      doCross(st, idx); return;
    }
  }

  // 1) SHOT
  if (dg < P.shotRange && ag < P.shotAngle) {
    const err = (1 - P.shotAccuracy) * 3.0;
    const t = v(gc.x, gc.y + rng(-err, err));
    me.face = vnorm(vsub(t, me.pos));
    kick(st, me.face, P.shotSpeed, true, t);
    return;
  }

  // 2) SHORT PASS
  const bp = bestPass(st, idx);
  if (bp !== null) {
    // Consider long pass instead if under pressure and teammate is far forward
    const lp = bestLongPass(st, idx);
    if (lp !== null && Math.random() < 0.3) {
      doLongPassTo(st, idx, lp); return;
    }
    doPassTo(st, idx, bp); return;
  }

  // 2.5) LONG PASS if no short pass available
  const lp = bestLongPass(st, idx);
  if (lp !== null) { doLongPassTo(st, idx, lp); return; }

  // 3) DRIBBLE
  doDribble(st, idx);
}

function decideNoBall(st: State, idx: number) {
  const me = st.pl[idx];
  const b = st.ball;
  const ballPos = b.pos;

  if (me.isGK) {
    const gx = me.team * (P.pitchHalfW - 0.6);
    const gy = clamp(ballPos.y * 0.5, -P.goalHalfH + 0.2, P.goalHalfH - 0.2);
    me.tgt = v(gx, gy);
    me.act = "move";
    if (b.free && vdist(me.pos, ballPos) < 2.5) {
      me.tgt = { ...ballPos };
    }
    return;
  }

  if (b.free || (b.owner === null && !b.free)) {
    const d = vdist(me.pos, ballPos);
    let rank = 0;
    for (let i = 0; i < st.pl.length; i++) {
      if (i === idx || st.pl[i].team !== me.team || st.pl[i].isGK) continue;
      if (vdist(st.pl[i].pos, ballPos) < d) rank++;
    }
    if (rank < 2 && d < 12) {
      me.tgt = { ...ballPos };
      me.act = "move";
      return;
    }
  }

  const teamHasBall = b.owner !== null && st.pl[b.owner].team === me.team;
  if (teamHasBall) {
    const oppGoalX = -me.team * P.pitchHalfW;
    const carrier = st.pl[b.owner!];
    const role = me.role;
    let targetX: number, targetY: number;

    if (role === "DEF") {
      targetX = carrier.pos.x + me.team * 3;
      targetX = clamp(targetX, me.team < 0 ? -P.pitchHalfW : -P.pitchHalfW * 0.3,
                                me.team < 0 ? P.pitchHalfW * 0.3 : P.pitchHalfW);
      targetY = me.home.y + clamp(ballPos.y * 0.25, -2.0, 2.0);
    } else if (role === "MID") {
      const isWide = me.slot === 5 || me.slot === 8;
      if (isWide) {
        // Wingers: push wide and forward in attacking third
        const teamAttacking = -me.team * carrier.pos.x > P.pitchHalfW * 0.15;
        if (teamAttacking) {
          // Run wide toward the byline for crossing opportunities
          targetX = oppGoalX * rng(0.55, 0.75);
          targetY = me.home.y > 0
            ? P.pitchHalfH * rng(0.6, 0.85)   // stay wide on their side
            : -P.pitchHalfH * rng(0.6, 0.85);
        } else {
          targetX = (carrier.pos.x + oppGoalX) * 0.35;
          targetY = me.home.y * 0.8 + ballPos.y * 0.2;
        }
      } else {
        targetX = (carrier.pos.x + oppGoalX) * 0.4;
        targetY = ballPos.y + (me.home.y > 0 ? rng(1.5, 3.5) : rng(-3.5, -1.5));
      }
    } else {
      targetX = oppGoalX * 0.65 + rng(-1, 1);
      targetY = me.home.y + rng(-2, 2);
    }

    me.tgt = pitchClamp(v(targetX, targetY));
    me.act = "move";
    return;
  }

  if (b.owner !== null && st.pl[b.owner].team !== me.team) {
    const carrier = st.pl[b.owner];
    const myGoal = v(me.team * P.pitchHalfW, 0);
    const dc = vdist(me.pos, carrier.pos);
    const role = me.role;

    if (role === "FWD") {
      if (dc < 5) {
        me.tgt = pitchClamp(vlerp(carrier.pos, myGoal, 0.1));
      } else {
        me.tgt = pitchClamp(v(me.home.x + (ballPos.x - me.home.x) * 0.3, me.home.y));
      }
    } else if (role === "MID") {
      if (dc < 4.5) {
        me.tgt = pitchClamp(vlerp(carrier.pos, myGoal, 0.15));
      } else {
        const shift = v(
          clamp((ballPos.x - me.home.x) * 0.4, -3.5, 3.5),
          clamp((ballPos.y - me.home.y) * 0.45, -3, 3)
        );
        me.tgt = pitchClamp(vadd(me.home, shift));
      }
    } else {
      const shift = v(
        clamp((ballPos.x - me.home.x) * 0.25, -2.5, 2.5),
        clamp((ballPos.y - me.home.y) * 0.5, -3, 3)
      );
      me.tgt = pitchClamp(vadd(me.home, shift));
    }
    me.act = "move";
    return;
  }

  const shift = v(
    clamp((ballPos.x - me.home.x) * 0.25, -2.5, 2.5),
    clamp((ballPos.y - me.home.y) * 0.35, -2, 2)
  );
  me.tgt = pitchClamp(vadd(me.home, shift));
  me.act = "move";
}

// ── Kick-off ────────────────────────────────────────────────
function doKickOff(st: State) {
  st.paused = false;
  st.setPiece = null;
  st.ball = { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0, lastTouchTeam: st.koSide, lob: 0 };
  st.trail = null;
  for (const p of st.pl) {
    p.pos = { ...p.home }; p.act = "idle"; p.tgt = { ...p.home };
    p.face = v(-p.team, 0); p.dt = Math.random() * P.decisionInterval;
    p.jumpY = 0;
  }
  // FIX: koSide is the team that kicks off (the team that conceded)
  const ki = nearest(st, v(0, 0), st.koSide);
  give(st.ball, ki, st.pl);
}

// ── Set-piece animations ────────────────────────────────────
function startThrowIn(st: State, throwerIdx: number, targetPos: V) {
  const thrower = st.pl[throwerIdx];
  // Move thrower to the sideline
  thrower.face = vnorm(vsub(targetPos, thrower.pos));
  st.setPiece = {
    type: "throw-in",
    timer: P.throwInAnimDur,
    duration: P.throwInAnimDur,
    throwerIdx,
    ballTarget: targetPos,
    phase: "windup",
    headingTimer: 0,
    headingPlayers: [],
    headingWinner: -1,
  };
}

function startCornerKick(st: State, kickerIdx: number, targetPos: V) {
  st.setPiece = {
    type: "corner",
    timer: P.cornerAnimDur,
    duration: P.cornerAnimDur,
    throwerIdx: kickerIdx,
    ballTarget: targetPos,
    phase: "windup",
    headingTimer: P.headingContestDur,
    headingPlayers: [],
    headingWinner: -1,
  };
}

function updateSetPiece(st: State, dtSim: number) {
  const sp = st.setPiece;
  if (!sp) return;

  sp.timer -= dtSim;

  if (sp.phase === "windup") {
    // Thrower/kicker raises arms (visual only via jumpY)
    const thrower = st.pl[sp.throwerIdx];
    const progress = 1 - (sp.timer / sp.duration);
    thrower.jumpY = Math.sin(progress * Math.PI) * 0.4; // bob up

    if (sp.timer <= 0) {
      // Release the ball
      sp.phase = "release";
      thrower.jumpY = 0;
      const b = st.ball;
      b.owner = null;
      b.free = true;
      b.shot = false;

      if (sp.type === "throw-in") {
        // Throw-in: ball goes to target, moderate speed
        const dir = vnorm(vsub(sp.ballTarget, b.pos));
        const err = 0.4;
        const tgt = v(sp.ballTarget.x + rng(-err, err), sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.passSpeed * 0.7);
        b.lob = 0.5; // slight lob
        st.trail = { start: { ...b.pos }, end: tgt, shot: false, longPass: false, t: P.trailDuration };
        b.cooldown = 0.3;
      } else if (sp.type === "corner") {
        // Corner kick: lob into the box
        const dir = vnorm(vsub(sp.ballTarget, b.pos));
        const err = 1.0;
        const tgt = v(sp.ballTarget.x + rng(-err, err), sp.ballTarget.y + rng(-err, err));
        b.vel = vscl(vnorm(vsub(tgt, b.pos)), P.longPassSpeed * 1.1);
        b.lob = 1.0; // high lob
        st.trail = { start: { ...b.pos }, end: tgt, shot: false, longPass: true, t: P.trailDuration * 1.5 };
        b.cooldown = 0.2;

        // Gather players for heading contest near target
        sp.headingPlayers = [];
        for (let i = 0; i < st.pl.length; i++) {
          if (st.pl[i].isGK) continue;
          if (vdist(st.pl[i].pos, sp.ballTarget) < P.headingContestRadius) {
            sp.headingPlayers.push(i);
            // Move them toward the target
            st.pl[i].tgt = vadd(sp.ballTarget, v(rng(-0.5, 0.5), rng(-0.5, 0.5)));
            st.pl[i].act = "move";
          }
        }
        // Also send some attackers and defenders toward the target
        const kickerTeam = st.pl[sp.throwerIdx].team;
        for (let i = 0; i < st.pl.length; i++) {
          const p = st.pl[i];
          if (p.isGK || sp.headingPlayers.includes(i)) continue;
          if ((p.role === "FWD" || p.role === "DEF") && vdist(p.pos, sp.ballTarget) < 6) {
            sp.headingPlayers.push(i);
            const offset = p.team === kickerTeam ? v(rng(-0.8, 0.8), rng(-0.8, 0.8)) : v(rng(-0.5, 0.5), rng(-0.5, 0.5));
            p.tgt = pitchClamp(vadd(sp.ballTarget, offset));
            p.act = "move";
          }
        }

        sp.headingTimer = P.headingContestDur;
      }
    }
  } else if (sp.phase === "release") {
    // Ball is in flight. For corners, wait for ball to arrive near target then do heading
    if (sp.type === "corner") {
      const distToTarget = vdist(st.ball.pos, sp.ballTarget);
      if (distToTarget < 1.5 || vlen(st.ball.vel) < 2) {
        // Ball arrived — heading contest!
        sp.phase = "heading";
        sp.headingTimer = P.headingContestDur;

        // Find contestants near the ball
        const contestants: number[] = [];
        for (let i = 0; i < st.pl.length; i++) {
          if (st.pl[i].isGK && vdist(st.pl[i].pos, st.ball.pos) > 2) continue;
          if (vdist(st.pl[i].pos, st.ball.pos) < P.headingContestRadius) {
            contestants.push(i);
          }
        }

        if (contestants.length > 0) {
          // Pick winner: closest player with some randomness
          let bestIdx = contestants[0];
          let bestScore = -Infinity;
          for (const ci of contestants) {
            const p = st.pl[ci];
            const dist = vdist(p.pos, st.ball.pos);
            const score = -dist + rng(0, 1.5); // randomness for contest
            if (score > bestScore) { bestScore = score; bestIdx = ci; }
          }
          sp.headingWinner = bestIdx;
          sp.headingPlayers = contestants;

          // All contestants jump
          for (const ci of contestants) {
            st.pl[ci].jumpY = 0.5 + rng(0, 0.3);
          }
        } else {
          // No one near — ball just lands
          st.setPiece = null;
        }
      }
    } else {
      // Throw-in: just let ball physics handle it
      if (vlen(st.ball.vel) < 1 || st.ball.owner !== null) {
        st.setPiece = null;
      }
    }
  } else if (sp.phase === "heading") {
    sp.headingTimer -= dtSim;

    // Animate jumps
    for (const ci of sp.headingPlayers) {
      const progress = 1 - (sp.headingTimer / P.headingContestDur);
      st.pl[ci].jumpY = Math.max(0, Math.sin(progress * Math.PI) * 0.6);
    }

    if (sp.headingTimer <= 0) {
      // Heading resolves
      for (const ci of sp.headingPlayers) {
        st.pl[ci].jumpY = 0;
      }

      if (sp.headingWinner >= 0) {
        const winner = st.pl[sp.headingWinner];
        const b = st.ball;
        b.lob = 0;

        // Winner heads the ball
        const oppGoal = v(-winner.team * P.pitchHalfW, 0);
        const distToGoal = vdist(winner.pos, oppGoal);

        if (distToGoal < P.shotRange * 1.2) {
          // Header on goal!
          const err = 2.0;
          const tgt = v(oppGoal.x, rng(-P.goalHalfH + 0.2, P.goalHalfH - 0.2));
          b.pos = { ...winner.pos };
          b.vel = vscl(vnorm(vsub(tgt, winner.pos)), P.shotSpeed * 0.7);
          b.free = true; b.shot = true; b.owner = null;
          b.lastTouchTeam = winner.team;
          st.trail = { start: { ...winner.pos }, end: tgt, shot: true, longPass: false, t: P.trailDuration };
        } else {
          // Header clearance/pass
          give(b, sp.headingWinner, st.pl);
          b.cooldown = 0.4;
        }
      }
      st.setPiece = null;
    }
  }
}

// ── Update ──────────────────────────────────────────────────
function update(st: State, dt: number) {
  const dtSim = dt * P.speedMult[st.speed];

  if (st.flash > 0) st.flash -= dtSim;

  if (st.over) {
    st.restartT -= dtSim;
    if (st.restartT <= 0) { Object.assign(st, mkState()); doKickOff(st); }
    return;
  }

  // Set-piece animation runs even during pause
  if (st.setPiece) {
    updateSetPiece(st, dtSim);
    // During set-piece, still update ball physics and player movement
    if (st.setPiece && st.setPiece.phase !== "windup") {
      // Ball physics during set piece flight
      const b = st.ball;
      if (b.free) {
        b.pos = vadd(b.pos, vscl(b.vel, dtSim));
        if (b.lob > 0) b.lob = Math.max(0, b.lob - dtSim * 1.5);
        const spd = vlen(b.vel);
        if (spd > 0.1) {
          b.vel = vscl(vnorm(b.vel), Math.max(0, spd - P.looseBallDrag * 0.5 * dtSim));
        }
        if (b.cooldown > 0) b.cooldown -= dtSim;

        // Check goal during set piece
        const gs = checkGoal(b.pos);
        if (gs !== 0) {
          if (gs > 0) st.sL++; else st.sR++;
          // FIX: conceding team kicks off
          st.koSide = (gs > 0) ? 1 : -1; // team=1 (RED) conceded if gs>0 (ball in right goal), so RED kicks off
          st.paused = true; st.pauseT = P.goalResetDelay;
          st.flash = 1.8; st.flashTxt = "GOAL!";
          st.setPiece = null;
          return;
        }

        // Intercept during set piece (after cooldown)
        if (b.cooldown <= 0) {
          for (let i = 0; i < st.pl.length; i++) {
            if (b.owner !== null) break;
            if (b.free && vdist(st.pl[i].pos, b.pos) < P.interceptRadius) {
              give(b, i, st.pl);
              st.setPiece = null;
              break;
            }
          }
        }
      }

      // Player movement during set piece
      for (const p of st.pl) {
        if (p.act !== "idle") {
          const spd = P.moveSpeed;
          const d = vsub(p.tgt, p.pos);
          if (vlen(d) < 0.08) { p.act = "idle"; }
          else {
            p.face = vnorm(d);
            p.pos = pitchClamp(vmove(p.pos, p.tgt, spd * dtSim));
          }
        }
      }
    }
    if (st.setPiece) return; // still in set piece
  }

  if (st.paused) {
    st.pauseT -= dtSim;
    if (st.pauseT <= 0) {
      if (st.flashTxt === "GOAL!") {
        doKickOff(st);
      } else {
        st.paused = false;
      }
    }
    return;
  }

  st.time += dtSim;
  if (st.time >= P.matchDuration) {
    st.over = true; st.restartT = 5; st.flashTxt = "FULL TIME"; st.flash = 2.5;
    return;
  }

  const b = st.ball;

  if (b.cooldown > 0) b.cooldown -= dtSim;
  if (b.lob > 0) b.lob = Math.max(0, b.lob - dtSim * 2);

  // Dead ball recovery
  if (b.owner === null && !b.free) { b.free = true; b.dead = 0; }
  if (b.free && vlen(b.vel) < 0.5) {
    b.dead += dtSim;
    if (b.dead > P.deadBallTime) {
      give(b, nearest(st, b.pos), st.pl);
    }
  } else if (!b.free) {
    b.dead = 0;
  }

  // Ball physics
  if (b.owner !== null && !b.free) {
    const o = st.pl[b.owner];
    b.pos = vadd(o.pos, vscl(o.face, 0.22));
  } else if (b.free) {
    b.pos = vadd(b.pos, vscl(b.vel, dtSim));

    // GK save check
    if (P.gkSaveEnabled && b.shot) {
      for (let ti = 0; ti < 2; ti++) {
        const gkTeam = ti === 0 ? -1 : 1;
        const shotHeadingToGoal = (gkTeam === -1 && b.vel.x < -1) || (gkTeam === 1 && b.vel.x > 1);
        if (!shotHeadingToGoal) continue;
        const gkIdx = findGK(st, gkTeam);
        const gk = st.pl[gkIdx];
        const dist = vdist(gk.pos, b.pos);
        if (dist < P.gkSaveRadius) {
          const velDir = vnorm(b.vel);
          const toGK = vnorm(vsub(gk.pos, b.pos));
          const shotAngleToGK = vang(velDir, toGK);
          const saveP = P.gkSaveBase + P.gkSaveAngleBonus * clamp01(1 - shotAngleToGK / 90);
          if (Math.random() < saveP) {
            if (Math.random() > P.gkParryChance) {
              give(b, gkIdx, st.pl);
              b.cooldown = P.gkHoldCooldown;
              st.flash = 0.6; st.flashTxt = "SAVE!";
            } else {
              const goalCenter = v(gkTeam * P.pitchHalfW, 0);
              const parryDir = vnorm(vsub(b.pos, goalCenter));
              b.vel = vscl(parryDir, 5 + Math.random() * 3);
              b.shot = false;
              b.cooldown = P.restartNoIntercept;
              st.flash = 0.6; st.flashTxt = "SAVE!";
            }
            break;
          }
        }
      }
    }

    // Out-of-play detection
    const outY = Math.abs(b.pos.y) > P.pitchHalfH + P.outMargin;
    const outX = Math.abs(b.pos.x) > P.pitchHalfW + P.outMargin;

    if (P.outEnabled && (outY || outX)) {
      // Check goal first
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        // FIX: conceding team kicks off from centre
        // gs > 0 means ball entered right goal → BLUE scored → RED kicks off
        // gs < 0 means ball entered left goal → RED scored → BLUE kicks off
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }

      // Out of play
      b.vel = v(0, 0); b.free = false; b.shot = false; b.owner = null; b.lob = 0;

      if (outY && !outX) {
        // THROW-IN
        st.flashTxt = "THROW IN"; st.flash = 1.0;
        const restartTeam = -b.lastTouchTeam; // opposite of last touch
        const outSign = b.pos.y > 0 ? 1 : -1;
        const restartY = outSign * (P.pitchHalfH - P.throwInInset);
        const restartX = clamp(b.pos.x, -P.pitchHalfW + 0.5, P.pitchHalfW - 0.5);
        b.pos = v(restartX, restartY);
        const ri = nearestOutfield(st, b.pos, restartTeam);
        give(b, ri, st.pl);
        b.cooldown = P.restartNoIntercept;

        // Move thrower to ball position and start animation
        st.pl[ri].pos = { ...b.pos };
        st.pl[ri].face = v(0, -outSign); // face infield

        // Find a nearby teammate as throw target (capped by throwInMaxDist)
        let throwTarget = vadd(b.pos, v(-restartTeam * 3, -outSign * 2));
        let bestScore = -Infinity;
        for (let i = 0; i < st.pl.length; i++) {
          if (i === ri || st.pl[i].team !== restartTeam || st.pl[i].isGK) continue;
          const d = vdist(st.pl[i].pos, b.pos);
          if (d > P.throwInMaxDist || d < 1.0) continue; // enforce max throw distance
          const op = openness(st, st.pl[i]);
          const sc = op * 2 - d * 0.3;
          if (sc > bestScore) { bestScore = sc; throwTarget = { ...st.pl[i].pos }; }
        }
        // Final safety: clamp target distance to throwInMaxDist
        const throwDist = vdist(b.pos, throwTarget);
        if (throwDist > P.throwInMaxDist) {
          const dir = vnorm(vsub(throwTarget, b.pos));
          throwTarget = vadd(b.pos, vscl(dir, P.throwInMaxDist));
        }

        startThrowIn(st, ri, throwTarget);
        return;
      } else if (outX) {
        const goalSide = b.pos.x > 0 ? 1 : -1;
        // BLUE (team=-1) defends left goal (goalSide=-1), RED (team=+1) defends right goal (goalSide=+1)
        const defendingTeam = goalSide;
        const attackingTeam = -defendingTeam;

        if (b.lastTouchTeam === defendingTeam) {
          // CORNER
          st.flashTxt = "CORNER"; st.flash = 1.0;
          const cornerX = goalSide * (P.pitchHalfW - P.cornerInset);
          const cornerY = (b.pos.y > 0 ? 1 : -1) * (P.pitchHalfH - P.cornerInset);
          b.pos = v(cornerX, cornerY);
          const ri = nearestOutfield(st, b.pos, attackingTeam);
          give(b, ri, st.pl);
          b.cooldown = P.restartNoIntercept;

          // Move kicker to corner
          st.pl[ri].pos = { ...b.pos };

          // Target: near post / centre of penalty area
          const targetX = goalSide * (P.pitchHalfW - P.penAreaW * 0.6);
          const targetY = rng(-P.penAreaH * 0.5, P.penAreaH * 0.5);

          // Move attackers and defenders toward the box
          for (let i = 0; i < st.pl.length; i++) {
            const p = st.pl[i];
            if (p.isGK || i === ri) continue;
            if (p.team === attackingTeam && (p.role === "FWD" || p.role === "MID")) {
              p.tgt = pitchClamp(v(targetX + rng(-1.5, 1.5), targetY + rng(-2, 2)));
              p.act = "move";
            } else if (p.team === defendingTeam && (p.role === "DEF" || p.role === "MID")) {
              p.tgt = pitchClamp(v(targetX + rng(-1, 1), targetY + rng(-1.5, 1.5)));
              p.act = "move";
            }
          }

          startCornerKick(st, ri, v(targetX, targetY));
          return;
        } else {
          // GOAL KICK
          st.flashTxt = "GOAL KICK"; st.flash = 1.0;
          st.paused = true; st.pauseT = P.restartPause;
          const gkX = goalSide * P.goalKickX;
          b.pos = v(gkX, 0);
          const gkIdx = findGK(st, defendingTeam);
          give(b, gkIdx, st.pl);
          b.cooldown = P.restartNoIntercept;
          return;
        }
      }
      return;
    }

    // In-bounds goal check
    if (P.outEnabled) {
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }
    }

    if (!P.outEnabled) {
      if (Math.abs(b.pos.y) > P.pitchHalfH) {
        b.pos.y = clamp(b.pos.y, -P.pitchHalfH, P.pitchHalfH);
        b.vel.y *= -0.4;
      }
      const gs = checkGoal(b.pos);
      if (gs !== 0) {
        if (gs > 0) st.sL++; else st.sR++;
        st.koSide = (gs > 0) ? 1 : -1;
        st.paused = true; st.pauseT = P.goalResetDelay;
        st.flash = 1.8; st.flashTxt = "GOAL!";
        return;
      }
      if (Math.abs(b.pos.x) > P.pitchHalfW) {
        b.pos.x = clamp(b.pos.x, -P.pitchHalfW, P.pitchHalfW);
        b.vel.x *= -0.4;
      }
    }

    // Drag
    const spd = vlen(b.vel);
    if (spd > 0.1) {
      b.vel = vscl(vnorm(b.vel), Math.max(0, spd - P.looseBallDrag * dtSim));
    } else {
      b.vel = v(0, 0); b.shot = false;
    }
  }

  // Trail
  if (st.trail) { st.trail.t -= dtSim; if (st.trail.t <= 0) st.trail = null; }

  // Players
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];

    if (b.cooldown > 0) { /* skip intercept */ }
    else if (b.owner !== i && b.free && vdist(p.pos, b.pos) < P.interceptRadius) {
      // Don't intercept lobbed balls easily
      if (b.lob < 0.3) give(b, i, st.pl);
    }
    else if (b.owner !== null && b.owner !== i && !b.free && b.cooldown <= 0
      && st.pl[b.owner].team !== p.team && vdist(p.pos, b.pos) < P.interceptRadius * 0.65) {
      give(b, i, st.pl);
    }

    p.dt -= dtSim;
    if (p.dt <= 0) {
      p.dt = P.decisionInterval;
      if (b.owner === i) decideHasBall(st, i);
      else decideNoBall(st, i);
    }

    if (p.act !== "idle") {
      const spd = p.act === "dribble" ? P.dribbleSpeed : P.moveSpeed;
      const d = vsub(p.tgt, p.pos);
      if (vlen(d) < 0.08) { p.act = "idle"; }
      else {
        p.face = vnorm(d);
        p.pos = pitchClamp(vmove(p.pos, p.tgt, spd * dtSim));
      }
    }

    // Decay jump
    if (p.jumpY > 0) p.jumpY = Math.max(0, p.jumpY - dtSim * 3);
  }
}

// ── Render ──────────────────────────────────────────────────
const COL = {
  bg: "#0a0a10",
  pitch: "#1a6b3a", pitchDk: "#145e30",
  line: "rgba(255,255,255,0.75)",
  tA: "#2563eb", tAL: "#60a5fa",
  tB: "#dc2626", tBL: "#f87171",
  hBg: "rgba(10,10,20,0.88)", hTxt: "#fff", hTime: "#aabbcc",
  rA: "rgba(37,99,235,0.5)", rB: "rgba(220,38,38,0.5)",
};

function render(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, st: State, speedBtnBounds: { x: number; y: number; w: number; h: number }) {
  const W = c.width, H = c.height;
  const cW = P.pitchHalfW * 2 + 2.5, cH = P.pitchHalfH * 2 + 3.5;
  const sc = Math.min(W / cW, H / cH);
  const ox = W / 2, oy = H / 2 + 0.75 * sc;
  const w2s = (p: V): V => v(ox + p.x * sc, oy - p.y * sc);
  const s = (n: number) => n * sc;

  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

  // Pitch
  const tl = w2s(v(-P.pitchHalfW, P.pitchHalfH));
  const pSz = v(s(P.pitchHalfW * 2), s(P.pitchHalfH * 2));
  const grd = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + pSz.y);
  grd.addColorStop(0, COL.pitch); grd.addColorStop(0.5, COL.pitchDk); grd.addColorStop(1, COL.pitch);
  ctx.fillStyle = grd; ctx.fillRect(tl.x, tl.y, pSz.x, pSz.y);

  ctx.fillStyle = "rgba(255,255,255,0.025)";
  const sw = pSz.x / 12;
  for (let i = 0; i < 12; i += 2) ctx.fillRect(tl.x + i * sw, tl.y, sw, pSz.y);

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  ctx.strokeRect(tl.x, tl.y, pSz.x, pSz.y);

  const ct = w2s(v(0, P.pitchHalfH)), cb = w2s(v(0, -P.pitchHalfH));
  ctx.beginPath(); ctx.moveTo(ct.x, ct.y); ctx.lineTo(cb.x, cb.y); ctx.stroke();

  const cc = w2s(v(0, 0));
  ctx.beginPath(); ctx.arc(cc.x, cc.y, s(P.centreCircleR), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COL.line;
  ctx.beginPath(); ctx.arc(cc.x, cc.y, s(0.06), 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  const paL = w2s(v(-P.pitchHalfW, P.penAreaH));
  ctx.strokeRect(paL.x, paL.y, s(P.penAreaW), s(P.penAreaH * 2));
  const paR = w2s(v(P.pitchHalfW - P.penAreaW, P.penAreaH));
  ctx.strokeRect(paR.x, paR.y, s(P.penAreaW), s(P.penAreaH * 2));

  const gaL = w2s(v(-P.pitchHalfW, P.goalAreaH));
  ctx.strokeRect(gaL.x, gaL.y, s(P.goalAreaW), s(P.goalAreaH * 2));
  const gaR = w2s(v(P.pitchHalfW - P.goalAreaW, P.goalAreaH));
  ctx.strokeRect(gaR.x, gaR.y, s(P.goalAreaW), s(P.goalAreaH * 2));

  ctx.fillStyle = COL.line;
  const psL = w2s(v(-P.pitchHalfW + P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(psL.x, psL.y, s(0.06), 0, Math.PI * 2); ctx.fill();
  const psR = w2s(v(P.pitchHalfW - P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(psR.x, psR.y, s(0.06), 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.035));
  const dL = w2s(v(-P.pitchHalfW + P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(dL.x, dL.y, s(P.centreCircleR), -0.85, 0.85); ctx.stroke();
  const dR = w2s(v(P.pitchHalfW - P.penSpotDist, 0));
  ctx.beginPath(); ctx.arc(dR.x, dR.y, s(P.centreCircleR), Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();

  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.03));
  const corners = [
    { pos: v(-P.pitchHalfW, P.pitchHalfH), sa: -Math.PI / 2, ea: 0 },
    { pos: v(P.pitchHalfW, P.pitchHalfH), sa: Math.PI, ea: Math.PI * 1.5 },
    { pos: v(-P.pitchHalfW, -P.pitchHalfH), sa: 0, ea: Math.PI / 2 },
    { pos: v(P.pitchHalfW, -P.pitchHalfH), sa: Math.PI / 2, ea: Math.PI },
  ];
  for (const cn of corners) {
    const cp = w2s(cn.pos);
    ctx.beginPath(); ctx.arc(cp.x, cp.y, s(P.cornerArcR), cn.sa, cn.ea); ctx.stroke();
  }

  // Goals
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  const gl = w2s(v(-P.pitchHalfW - P.goalDepth, P.goalHalfH));
  ctx.fillRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = Math.max(1, s(0.03));
  ctx.strokeRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  const gr = w2s(v(P.pitchHalfW, P.goalHalfH));
  ctx.fillRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));

  ctx.fillStyle = "#fff";
  for (const pp of [
    v(-P.pitchHalfW, P.goalHalfH), v(-P.pitchHalfW, -P.goalHalfH),
    v(P.pitchHalfW, P.goalHalfH), v(P.pitchHalfW, -P.goalHalfH)
  ]) {
    const ps = w2s(pp);
    ctx.beginPath(); ctx.arc(ps.x, ps.y, s(0.06), 0, Math.PI * 2); ctx.fill();
  }

  // Trail
  if (st.trail) {
    const tr = st.trail, a = tr.t / P.trailDuration;
    const ts = w2s(tr.start), te = w2s(tr.end);
    if (tr.shot) {
      ctx.strokeStyle = `rgba(255,100,30,${(0.65 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, s(0.08));
    } else if (tr.longPass) {
      // Long pass: dashed arc-like trail in yellow
      ctx.strokeStyle = `rgba(255,220,80,${(0.5 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, s(0.05));
      ctx.setLineDash([s(0.18), s(0.1)]);
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, s(0.035));
      ctx.setLineDash([s(0.12), s(0.12)]);
    }
    if (tr.longPass) {
      // Draw curved trail for long pass
      const mx = (ts.x + te.x) / 2;
      const my = Math.min(ts.y, te.y) - s(1.5); // arc upward
      ctx.beginPath(); ctx.moveTo(ts.x, ts.y);
      ctx.quadraticCurveTo(mx, my, te.x, te.y); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(ts.x, ts.y); ctx.lineTo(te.x, te.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }

  // Players
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    const jumpOffset = p.jumpY * sc; // visual jump
    const ps = w2s(p.pos);
    ps.y -= jumpOffset; // move up when jumping
    const r = s(P.playerRadius);
    const isA = p.team < 0, col = isA ? COL.tA : COL.tB, colL = isA ? COL.tAL : COL.tBL;

    // Jump shadow
    if (p.jumpY > 0.05) {
      const shadowPs = w2s(p.pos);
      ctx.fillStyle = `rgba(0,0,0,${0.2 * p.jumpY})`;
      ctx.beginPath();
      ctx.ellipse(shadowPs.x, shadowPs.y + r * 0.3, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Possession ring
    if (st.ball.owner === i) {
      ctx.strokeStyle = isA ? COL.rA : COL.rB;
      ctx.lineWidth = Math.max(2, s(0.05));
      ctx.beginPath(); ctx.arc(ps.x, ps.y, r * 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = col; ctx.shadowBlur = s(0.25);
    }

    // Throw-in arm animation
    if (st.setPiece && st.setPiece.type === "throw-in" && st.setPiece.throwerIdx === i && st.setPiece.phase === "windup") {
      const progress = 1 - (st.setPiece.timer / st.setPiece.duration);
      // Draw arms above head
      ctx.strokeStyle = colL;
      ctx.lineWidth = Math.max(2, s(0.04));
      const armAngle = -Math.PI / 2 + Math.sin(progress * Math.PI) * 0.8;
      const armLen = r * 1.2;
      ctx.beginPath();
      ctx.moveTo(ps.x - r * 0.3, ps.y - r * 0.5);
      ctx.lineTo(ps.x - r * 0.3 + Math.cos(armAngle) * armLen, ps.y - r * 0.5 + Math.sin(armAngle) * armLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ps.x + r * 0.3, ps.y - r * 0.5);
      ctx.lineTo(ps.x + r * 0.3 + Math.cos(armAngle) * armLen, ps.y - r * 0.5 + Math.sin(armAngle) * armLen);
      ctx.stroke();
    }

    const pg = ctx.createRadialGradient(ps.x - r * 0.3, ps.y - r * 0.3, r * 0.1, ps.x, ps.y, r);
    pg.addColorStop(0, colL); pg.addColorStop(1, col);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(8, r * 1.0 | 0)}px "Roboto Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.num), ps.x, ps.y + 1);
  }

  // Ball
  {
    const b = st.ball;
    const lobOffset = b.lob * sc * 1.2; // visual height
    const bs = w2s(b.pos);
    bs.y -= lobOffset;
    const br = s(P.ballRadius + b.lob * 0.05); // slightly bigger when in air

    // Shadow (on ground)
    if (b.lob > 0.05) {
      const groundBs = w2s(b.pos);
      ctx.fillStyle = `rgba(0,0,0,${0.15 * (1 - b.lob * 0.5)})`;
      ctx.beginPath();
      ctx.ellipse(groundBs.x + s(0.02), groundBs.y + s(0.02), br * 0.7, br * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(bs.x + s(0.04), bs.y + s(0.04), br, br * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(bs.x - br * 0.3, bs.y - br * 0.3, br * 0.1, bs.x, bs.y, br);
    bg.addColorStop(0, "#fff"); bg.addColorStop(1, "#ccc");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bs.x, bs.y, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(1, s(0.015)); ctx.stroke();
  }

  // Flash
  if (st.flash > 0) {
    const a = Math.min(1, st.flash) * 0.22;
    ctx.fillStyle = `rgba(255,255,200,${a.toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    if (st.flashTxt) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, st.flash).toFixed(2)})`;
      ctx.font = `bold ${s(1.1)}px "Roboto Condensed","Arial Narrow",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = s(0.3);
      ctx.fillText(st.flashTxt, W / 2, H / 2);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    }
  }

  // HUD
  const hH = s(0.9), hY = s(0.25), hW = Math.min(W * 0.55, s(9)), hX = (W - hW) / 2;
  ctx.fillStyle = COL.hBg;
  const hR = s(0.12);
  ctx.beginPath();
  ctx.moveTo(hX + hR, hY); ctx.lineTo(hX + hW - hR, hY);
  ctx.quadraticCurveTo(hX + hW, hY, hX + hW, hY + hR);
  ctx.lineTo(hX + hW, hY + hH - hR);
  ctx.quadraticCurveTo(hX + hW, hY + hH, hX + hW - hR, hY + hH);
  ctx.lineTo(hX + hR, hY + hH);
  ctx.quadraticCurveTo(hX, hY + hH, hX, hY + hH - hR);
  ctx.lineTo(hX, hY + hR);
  ctx.quadraticCurveTo(hX, hY, hX + hR, hY);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hX, hY + hH); ctx.lineTo(hX + hW, hY + hH); ctx.stroke();

  const hCY = hY + hH / 2;
  ctx.fillStyle = COL.tA; ctx.fillRect(hX, hY, s(0.12), hH);
  ctx.fillStyle = COL.tB; ctx.fillRect(hX + hW - s(0.12), hY, s(0.12), hH);

  ctx.fillStyle = COL.tAL;
  ctx.font = `bold ${Math.max(10, s(0.28))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("BLUE", hX + s(0.35), hCY);

  ctx.fillStyle = COL.tBL; ctx.textAlign = "right";
  ctx.fillText("RED", hX + hW - s(0.35), hCY);

  ctx.fillStyle = COL.hTxt;
  ctx.font = `bold ${Math.max(13, s(0.4))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL}  -  ${st.sR}`, W / 2, hCY);

  const rem = Math.max(0, P.matchDuration - st.time);
  const mn = Math.floor(rem / 60), sc2 = Math.floor(rem % 60);
  const ts = `${String(mn).padStart(2, "0")}:${String(sc2).padStart(2, "0")}`;
  const tbH = s(0.38), tbW = s(1.4), tbX = (W - tbW) / 2, tbY = hY + hH;
  ctx.fillStyle = "rgba(10,10,20,0.72)";
  ctx.beginPath();
  ctx.moveTo(tbX, tbY); ctx.lineTo(tbX + tbW, tbY);
  ctx.lineTo(tbX + tbW - s(0.08), tbY + tbH); ctx.lineTo(tbX + s(0.08), tbY + tbH);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = COL.hTime;
  ctx.font = `bold ${Math.max(9, s(0.24))}px "Roboto Mono","Courier New",monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ts, W / 2, tbY + tbH / 2);

  // Speed toggle
  const speedLabel = `SPEED: ${st.speed}`;
  const spFontSize = Math.max(9, s(0.22));
  ctx.font = `bold ${spFontSize}px "Roboto Condensed","Arial Narrow",sans-serif`;
  const spMetrics = ctx.measureText(speedLabel);
  const spPadX = s(0.2), spPadY = s(0.1);
  const spW = spMetrics.width + spPadX * 2;
  const spH = spFontSize + spPadY * 2;
  const spX = W - spW - s(0.3);
  const spY = s(0.3);

  const dpr = window.devicePixelRatio || 1;
  speedBtnBounds.x = spX / dpr;
  speedBtnBounds.y = spY / dpr;
  speedBtnBounds.w = spW / dpr;
  speedBtnBounds.h = spH / dpr;

  ctx.fillStyle = "rgba(10,10,20,0.75)";
  ctx.beginPath();
  const spR = s(0.08);
  ctx.moveTo(spX + spR, spY); ctx.lineTo(spX + spW - spR, spY);
  ctx.quadraticCurveTo(spX + spW, spY, spX + spW, spY + spR);
  ctx.lineTo(spX + spW, spY + spH - spR);
  ctx.quadraticCurveTo(spX + spW, spY + spH, spX + spW - spR, spY + spH);
  ctx.lineTo(spX + spR, spY + spH);
  ctx.quadraticCurveTo(spX, spY + spH, spX, spY + spH - spR);
  ctx.lineTo(spX, spY + spR);
  ctx.quadraticCurveTo(spX, spY, spX + spR, spY);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1; ctx.stroke();

  const speedColors: Record<string, string> = { LOW: "#60a5fa", MID: "#fbbf24", FAST: "#f87171" };
  ctx.fillStyle = speedColors[st.speed] || "#fff";
  ctx.font = `bold ${spFontSize}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(speedLabel, spX + spW / 2, spY + spH / 2);
}

// ── Component ───────────────────────────────────────────────
export default function Home() {
  const ref = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(mkState());
  const ltRef = useRef(0);
  const speedBtnRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleClick = useCallback((e: MouseEvent | TouchEvent) => {
    const bounds = speedBtnRef.current;
    let cx: number, cy: number;
    if ("touches" in e) {
      cx = e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches[0]?.clientX ?? 0;
      cy = e.touches[0]?.clientY ?? (e as TouchEvent).changedTouches[0]?.clientY ?? 0;
    } else {
      cx = e.clientX;
      cy = e.clientY;
    }
    if (cx >= bounds.x && cx <= bounds.x + bounds.w && cy >= bounds.y && cy <= bounds.y + bounds.h) {
      const st = stRef.current;
      const cycle: SpeedMode[] = ["LOW", "MID", "FAST"];
      const idx = cycle.indexOf(st.speed);
      st.speed = cycle[(idx + 1) % 3];
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;

    doKickOff(stRef.current);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + "px";
      cv.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);
    cv.addEventListener("click", handleClick);
    cv.addEventListener("touchstart", handleClick, { passive: false });

    let id: number;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - ltRef.current) / 1000);
      ltRef.current = t;
      if (dt > 0.001 && dt < 0.1) update(stRef.current, dt);
      render(ctx, cv, stRef.current, speedBtnRef.current);
      id = requestAnimationFrame(loop);
    };
    ltRef.current = performance.now();
    id = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("click", handleClick);
      cv.removeEventListener("touchstart", handleClick);
    };
  }, [handleClick]);

  return (
    <canvas ref={ref} style={{ display: "block", width: "100vw", height: "100vh", background: "#0a0a10", touchAction: "none" }} />
  );
}
