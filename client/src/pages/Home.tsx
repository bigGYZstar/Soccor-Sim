import { useEffect, useRef } from "react";

/*
 * ============================================================
 *  2D Futsal Autoplay Mockup — Clean Broadcast / Sports TV
 * ============================================================
 */

// ── Tunable Parameters ──────────────────────────────────────
const P = {
  matchDuration: 90,
  goalResetDelay: 1.5,

  courtHalfW: 8.0,
  courtHalfH: 5.0,
  goalHalfH: 1.5,
  goalDepth: 0.4,

  moveSpeed: 4.5,
  dribbleSpeed: 3.5,
  passSpeed: 11,
  shotSpeed: 16,
  passAccuracy: 0.82,
  shotAccuracy: 0.65,
  dribbleControl: 0.93,
  interceptRadius: 0.9,
  decisionInterval: 0.18,
  shotRange: 5.0,
  shotAngle: 50,

  looseBallDrag: 4.0,
  deadBallTime: 0.8,

  trailDuration: 0.3,
  playerRadius: 0.35,
  ballRadius: 0.15,
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
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rng = (a: number, b: number) => a + Math.random() * (b - a);
const courtClamp = (p: V): V => v(clamp(p.x, -P.courtHalfW, P.courtHalfW), clamp(p.y, -P.courtHalfH, P.courtHalfH));

// ── Types ───────────────────────────────────────────────────
interface Trail { start: V; end: V; shot: boolean; t: number }

interface Player {
  pos: V; team: number; num: number; home: V;
  face: V; act: "idle" | "dribble" | "move"; tgt: V;
  dt: number; // decision timer
  isGK: boolean;
  slot: number; // 0=GK,1=DEF,2=DEF,3=MID,4=FWD
}

interface Ball {
  pos: V; vel: V; owner: number | null;
  free: boolean; shot: boolean; dead: number;
  cooldown: number; // time before ball can be intercepted after possession change
}

interface State {
  pl: Player[]; ball: Ball;
  sL: number; sR: number; time: number;
  over: boolean; paused: boolean; pauseT: number;
  koSide: number; trail: Trail | null;
  flash: number; flashTxt: string; restartT: number;
}

// ── Formation ───────────────────────────────────────────────
// Left team (team=-1): GK far left, FWD near centre
const FORM: V[] = [
  v(-7.2, 0),     // GK
  v(-5.0, -2.0),  // DEF
  v(-5.0, 2.0),   // DEF
  v(-2.5, 0),     // MID
  v(-0.8, 0),     // FWD
];
const NUMS = [1, 2, 3, 5, 9];

// ── Init ────────────────────────────────────────────────────
function mkPlayers(): Player[] {
  const out: Player[] = [];
  for (let t = 0; t < 2; t++) {
    const s = t === 0 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      const f = { ...FORM[i] };
      if (s === 1) { f.x = -f.x; f.y = -f.y; }
      out.push({
        pos: { ...f }, team: s, num: NUMS[i], home: { ...f },
        face: v(-s, 0), act: "idle", tgt: { ...f },
        dt: Math.random() * P.decisionInterval,
        isGK: i === 0,
        slot: i,
      });
    }
  }
  return out;
}

function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0 },
    sL: 0, sR: 0, time: 0,
    over: false, paused: false, pauseT: 0,
    koSide: 1, trail: null,
    flash: 0, flashTxt: "", restartT: 0,
  };
}

// ── Helpers ─────────────────────────────────────────────────
function checkGoal(pos: V): number {
  if (pos.x >= P.courtHalfW - 0.05 && Math.abs(pos.y) <= P.goalHalfH) return 1;
  if (pos.x <= -P.courtHalfW + 0.05 && Math.abs(pos.y) <= P.goalHalfH) return -1;
  return 0;
}

function give(ball: Ball, idx: number) {
  ball.owner = idx; ball.free = false; ball.shot = false;
  ball.vel = v(0, 0); ball.dead = 0; ball.cooldown = 0.4;
}

function kick(st: State, dir: V, spd: number, shot: boolean, tgt: V) {
  const b = st.ball;
  st.trail = { start: { ...b.pos }, end: { ...tgt }, shot, t: P.trailDuration };
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(vnorm(dir), spd); b.dead = 0;
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
    if (vdist(cl, p.pos) < 0.9) return true;
  }
  return false;
}

function bestPass(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx) continue;
    const d = vdist(me.pos, p.pos);
    if (d < 1.0 || d > 14) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x;
    let sc = op * 2 + gp * 0.5 - d * 0.15;
    if (laneBlocked(st, me.pos, p.pos, me.team)) sc -= 4;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return bi;
}

function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  if (Math.random() > P.dribbleControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, fd, 3, false, vadd(me.pos, vscl(fd, 2)));
    return;
  }
  // Goal direction + avoid nearest opponent + avoid walls
  const gd = vnorm(v(-me.team, 0));
  let avoid = v(0, 0);
  let cd = Infinity;
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < cd && d < 3) { cd = d; avoid = vnorm(vsub(me.pos, p.pos)); }
  }
  // Wall avoidance — stronger when near edges
  let wa = v(0, 0);
  const edgeY = P.courtHalfH - 0.8;
  const edgeX = P.courtHalfW - 1.0;
  if (me.pos.y > edgeY) wa.y = -(me.pos.y - edgeY) * 1.5;
  if (me.pos.y < -edgeY) wa.y = -(-edgeY - me.pos.y) * -1.5;
  if (me.pos.x > edgeX) wa.x = -(me.pos.x - edgeX) * 1.2;
  if (me.pos.x < -edgeX) wa.x = -(-edgeX - me.pos.x) * -1.2;

  // Add lateral jink to avoid being predictable
  const jink = v(0, rng(-0.3, 0.3));

  const desired = vnorm(vadd(vadd(vadd(vscl(gd, 0.55), vscl(avoid, 0.3)), wa), jink));
  me.tgt = courtClamp(vadd(me.pos, vscl(desired, 3.5)));
  me.act = "dribble";
  me.face = desired;
}

function decideHasBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * P.courtHalfW, 0);
  const dg = vdist(me.pos, gc);
  const tg = vnorm(vsub(gc, me.pos));
  const ag = vang(me.face, tg);

  // Is player in own defensive third?
  const inOwnThird = me.team * me.pos.x > P.courtHalfW * 0.33;

  // GK or deep defender: ALWAYS try to pass first
  if (me.isGK || inOwnThird) {
    const bp = bestPassRelaxed(st, idx);
    if (bp !== null) {
      doPassTo(st, idx, bp);
      return;
    }
    // Safety clearance: kick forward
    const fwd = vnorm(v(-me.team + rng(-0.3, 0.3), rng(-0.5, 0.5)));
    me.face = fwd;
    kick(st, fwd, P.passSpeed * 0.8, false, vadd(me.pos, vscl(fwd, 6)));
    return;
  }

  // 1) SHOT
  if (dg < P.shotRange && ag < P.shotAngle) {
    const err = (1 - P.shotAccuracy) * 2.5;
    const t = v(gc.x, gc.y + rng(-err, err));
    me.face = vnorm(vsub(t, me.pos));
    kick(st, me.face, P.shotSpeed, true, t);
    return;
  }

  // 2) PASS
  const bp = bestPass(st, idx);
  if (bp !== null) {
    doPassTo(st, idx, bp);
    return;
  }

  // 3) DRIBBLE
  doDribble(st, idx);
}

// Relaxed pass finder — ignores lane blocking in own half
function bestPassRelaxed(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bi: number | null = null, bs = -Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== me.team || i === idx) continue;
    const d = vdist(me.pos, p.pos);
    if (d < 0.8 || d > 14) continue;
    const op = openness(st, p);
    const gp = -me.team * p.pos.x; // progress toward opponent goal
    let sc = op * 1.5 + gp * 0.8 - d * 0.1;
    // Slight penalty for blocked lanes but don't eliminate
    if (laneBlocked(st, me.pos, p.pos, me.team)) sc -= 1.5;
    if (sc > bs) { bs = sc; bi = i; }
  }
  return bi;
}

function doPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];
  let tp = { ...tm.pos };
  if (tm.act !== "idle") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.1, 1.0)));
  }
  const err = (1 - P.passAccuracy) * 1.5;
  tp.x += rng(-err, err); tp.y += rng(-err, err);
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, P.passSpeed, false, tp);
}

function decideNoBall(st: State, idx: number) {
  const me = st.pl[idx];
  const b = st.ball;
  const ballPos = b.pos;

  // GK: stay near goal, track ball Y
  if (me.isGK) {
    const gx = me.team * (P.courtHalfW - 0.8);
    const gy = clamp(ballPos.y * 0.6, -P.goalHalfH + 0.3, P.goalHalfH - 0.3);
    me.tgt = v(gx, gy);
    me.act = "move";
    // Chase ball if very close
    if (b.free && vdist(me.pos, ballPos) < 2.5) {
      me.tgt = { ...ballPos };
    }
    return;
  }

  // Chase loose ball — nearest 2 players on team should chase
  if (b.free || (b.owner === null && !b.free)) {
    const d = vdist(me.pos, ballPos);
    // Check if I'm one of the 2 nearest on my team
    let rank = 0;
    for (let i = 0; i < st.pl.length; i++) {
      if (i === idx || st.pl[i].team !== me.team || st.pl[i].isGK) continue;
      if (vdist(st.pl[i].pos, ballPos) < d) rank++;
    }
    if (rank < 2 && d < 10) {
      me.tgt = { ...ballPos };
      me.act = "move";
      return;
    }
  }

  // Team has ball — make attacking runs
  const teamHasBall = b.owner !== null && st.pl[b.owner].team === me.team;
  if (teamHasBall) {
    // Run toward opponent half, spread out
    const oppGoalX = -me.team * P.courtHalfW;
    const carrier = st.pl[b.owner!];

    // Calculate a good support position
    const teamIdx = me.slot; // 0=GK,1=DEF,2=DEF,3=MID,4=FWD

    let targetX: number, targetY: number;

    if (teamIdx <= 2) {
      // Defenders: push up but stay behind ball
      targetX = carrier.pos.x + me.team * 2; // stay behind carrier
      targetY = me.home.y + clamp(ballPos.y * 0.3, -1.5, 1.5);
    } else if (teamIdx === 3) {
      // MID: support carrier, move to open space
      targetX = (carrier.pos.x + oppGoalX) * 0.4;
      targetY = ballPos.y + (me.pos.y > ballPos.y ? 2.5 : -2.5);
    } else {
      // FWD: make runs toward goal
      targetX = oppGoalX * 0.6;
      targetY = rng(-2, 2);
    }

    me.tgt = courtClamp(v(targetX, targetY));
    me.act = "move";
    return;
  }

  // Opponent has ball — defend
  if (b.owner !== null && st.pl[b.owner].team !== me.team) {
    const carrier = st.pl[b.owner];
    const myGoal = v(me.team * P.courtHalfW, 0);
    const dc = vdist(me.pos, carrier.pos);

    if (dc < 4) {
      // Press the carrier
      me.tgt = courtClamp(vlerp(carrier.pos, myGoal, 0.15));
    } else {
      // Fall back toward formation, shifted toward ball
      const shift = v(
        clamp((ballPos.x - me.home.x) * 0.35, -3, 3),
        clamp((ballPos.y - me.home.y) * 0.45, -2.5, 2.5)
      );
      me.tgt = courtClamp(vadd(me.home, shift));
    }
    me.act = "move";
    return;
  }

  // Default: drift toward shifted formation
  const shift = v(
    clamp((ballPos.x - me.home.x) * 0.3, -2.5, 2.5),
    clamp((ballPos.y - me.home.y) * 0.4, -2, 2)
  );
  me.tgt = courtClamp(vadd(me.home, shift));
  me.act = "move";
}

// ── Kick-off ────────────────────────────────────────────────
function doKickOff(st: State) {
  st.paused = false;
  st.ball = { pos: v(0, 0), vel: v(0, 0), owner: null, free: false, shot: false, dead: 0, cooldown: 0 };
  st.trail = null;
  for (const p of st.pl) {
    p.pos = { ...p.home }; p.act = "idle"; p.tgt = { ...p.home };
    p.face = v(-p.team, 0); p.dt = Math.random() * P.decisionInterval;
  }
  const ki = nearest(st, v(0, 0), st.koSide);
  give(st.ball, ki);
}

// ── Update ──────────────────────────────────────────────────
function update(st: State, dt: number) {
  if (st.flash > 0) st.flash -= dt;

  if (st.over) {
    st.restartT -= dt;
    if (st.restartT <= 0) { Object.assign(st, mkState()); doKickOff(st); }
    return;
  }
  if (st.paused) {
    st.pauseT -= dt;
    if (st.pauseT <= 0) doKickOff(st);
    return;
  }

  st.time += dt;
  if (st.time >= P.matchDuration) {
    st.over = true; st.restartT = 4; st.flashTxt = "FULL TIME"; st.flash = 2;
    return;
  }

  const b = st.ball;

  // ── Cooldown tick ─────────────────────────────────────
  if (b.cooldown > 0) b.cooldown -= dt;

  // ── Dead ball recovery ────────────────────────────────
  if (b.owner === null && !b.free) { b.free = true; b.dead = 0; }
  if (b.free && vlen(b.vel) < 0.5) {
    b.dead += dt;
    if (b.dead > P.deadBallTime) {
      give(b, nearest(st, b.pos));
    }
  } else if (!b.free) {
    b.dead = 0;
  }

  // ── Ball physics ──────────────────────────────────────
  if (b.owner !== null && !b.free) {
    const o = st.pl[b.owner];
    b.pos = vadd(o.pos, vscl(o.face, 0.25));
  } else if (b.free) {
    b.pos = vadd(b.pos, vscl(b.vel, dt));

    if (Math.abs(b.pos.y) > P.courtHalfH) {
      b.pos.y = clamp(b.pos.y, -P.courtHalfH, P.courtHalfH);
      b.vel.y *= -0.5;
    }

    const gs = checkGoal(b.pos);
    if (gs !== 0) {
      if (gs > 0) st.sL++; else st.sR++;
      st.koSide = -gs; st.paused = true; st.pauseT = P.goalResetDelay;
      st.flash = 1.5; st.flashTxt = "GOAL!";
      return;
    }

    if (Math.abs(b.pos.x) > P.courtHalfW) {
      b.pos.x = clamp(b.pos.x, -P.courtHalfW, P.courtHalfW);
      b.vel.x *= -0.5;
    }

    const spd = vlen(b.vel);
    if (spd > 0.1) {
      b.vel = vscl(vnorm(b.vel), Math.max(0, spd - P.looseBallDrag * dt));
    } else {
      b.vel = v(0, 0); b.shot = false;
    }
  }

  // ── Trail ─────────────────────────────────────────────
  if (st.trail) { st.trail.t -= dt; if (st.trail.t <= 0) st.trail = null; }

  // ── Players ───────────────────────────────────────────
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];

    // Intercept (only if no cooldown)
    if (b.cooldown > 0) { /* skip intercept during cooldown */ }
    else if (b.owner !== i && b.free && vdist(p.pos, b.pos) < P.interceptRadius) {
      give(b, i);
    }
    // Also allow stealing from dribbler if very close
    else if (b.owner !== null && b.owner !== i && !b.free && b.cooldown <= 0
      && st.pl[b.owner].team !== p.team && vdist(p.pos, b.pos) < P.interceptRadius * 0.7) {
      give(b, i);
    }

    // Decision
    p.dt -= dt;
    if (p.dt <= 0) {
      p.dt = P.decisionInterval;
      if (b.owner === i) decideHasBall(st, i);
      else decideNoBall(st, i);
    }

    // Move
    if (p.act !== "idle") {
      const spd = p.act === "dribble" ? P.dribbleSpeed : P.moveSpeed;
      const d = vsub(p.tgt, p.pos);
      if (vlen(d) < 0.1) { p.act = "idle"; }
      else {
        p.face = vnorm(d);
        p.pos = courtClamp(vmove(p.pos, p.tgt, spd * dt));
      }
    }
  }
}

// ── Render ──────────────────────────────────────────────────
const COL = {
  bg: "#0a0a10", court: "#1a6b3a", courtDk: "#145e30", line: "rgba(255,255,255,0.75)",
  tA: "#2563eb", tAL: "#60a5fa", tB: "#dc2626", tBL: "#f87171",
  hBg: "rgba(10,10,20,0.85)", hTxt: "#fff", hTime: "#aabbcc",
  rA: "rgba(37,99,235,0.5)", rB: "rgba(220,38,38,0.5)",
};

function render(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, st: State) {
  const W = c.width, H = c.height;
  const cW = P.courtHalfW * 2 + 2, cH = P.courtHalfH * 2 + 3.5;
  const sc = Math.min(W / cW, H / cH);
  const ox = W / 2, oy = H / 2 + 0.75 * sc;
  const w2s = (p: V): V => v(ox + p.x * sc, oy - p.y * sc);
  const s = (n: number) => n * sc;

  // BG
  ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

  // Court
  const tl = w2s(v(-P.courtHalfW, P.courtHalfH));
  const cSz = v(s(P.courtHalfW * 2), s(P.courtHalfH * 2));
  const grd = ctx.createLinearGradient(tl.x, tl.y, tl.x, tl.y + cSz.y);
  grd.addColorStop(0, COL.court); grd.addColorStop(0.5, COL.courtDk); grd.addColorStop(1, COL.court);
  ctx.fillStyle = grd; ctx.fillRect(tl.x, tl.y, cSz.x, cSz.y);

  // Stripes
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  const sw = s(P.courtHalfW * 2) / 8;
  for (let i = 0; i < 8; i += 2) ctx.fillRect(tl.x + i * sw, tl.y, sw, cSz.y);

  // Lines
  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.04));
  ctx.strokeRect(tl.x, tl.y, cSz.x, cSz.y);

  // Centre
  const ct = w2s(v(0, P.courtHalfH)), cb = w2s(v(0, -P.courtHalfH)), cc = w2s(v(0, 0));
  ctx.beginPath(); ctx.moveTo(ct.x, ct.y); ctx.lineTo(cb.x, cb.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(cc.x, cc.y, s(1.5), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COL.line; ctx.beginPath(); ctx.arc(cc.x, cc.y, s(0.08), 0, Math.PI * 2); ctx.fill();

  // Penalty areas
  const paW = 2, paH = 2.5;
  ctx.strokeStyle = COL.line; ctx.lineWidth = Math.max(1, s(0.04));
  const pl = w2s(v(-P.courtHalfW, paH)); ctx.strokeRect(pl.x, pl.y, s(paW), s(paH * 2));
  const pr = w2s(v(P.courtHalfW - paW, paH)); ctx.strokeRect(pr.x, pr.y, s(paW), s(paH * 2));

  // Goals
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  const gl = w2s(v(-P.courtHalfW - P.goalDepth, P.goalHalfH));
  ctx.fillRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.strokeRect(gl.x, gl.y, s(P.goalDepth), s(P.goalHalfH * 2));
  const gr = w2s(v(P.courtHalfW, P.goalHalfH));
  ctx.fillRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));
  ctx.strokeRect(gr.x, gr.y, s(P.goalDepth), s(P.goalHalfH * 2));

  // Posts
  ctx.fillStyle = "#fff";
  for (const pp of [v(-P.courtHalfW, P.goalHalfH), v(-P.courtHalfW, -P.goalHalfH), v(P.courtHalfW, P.goalHalfH), v(P.courtHalfW, -P.goalHalfH)]) {
    const ps = w2s(pp); ctx.beginPath(); ctx.arc(ps.x, ps.y, s(0.08), 0, Math.PI * 2); ctx.fill();
  }

  // Trail
  if (st.trail) {
    const tr = st.trail, a = tr.t / P.trailDuration;
    const ts = w2s(tr.start), te = w2s(tr.end);
    if (tr.shot) {
      ctx.strokeStyle = `rgba(255,100,30,${(0.65 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(2, s(0.1));
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 * a).toFixed(2)})`;
      ctx.lineWidth = Math.max(1, s(0.04));
      ctx.setLineDash([s(0.15), s(0.15)]);
    }
    ctx.beginPath(); ctx.moveTo(ts.x, ts.y); ctx.lineTo(te.x, te.y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }

  // Players
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i], ps = w2s(p.pos), r = s(P.playerRadius);
    const isA = p.team < 0, col = isA ? COL.tA : COL.tB, colL = isA ? COL.tAL : COL.tBL;

    if (st.ball.owner === i) {
      ctx.strokeStyle = isA ? COL.rA : COL.rB;
      ctx.lineWidth = Math.max(2, s(0.06));
      ctx.beginPath(); ctx.arc(ps.x, ps.y, r * 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = col; ctx.shadowBlur = s(0.3);
    }

    const pg = ctx.createRadialGradient(ps.x - r * 0.3, ps.y - r * 0.3, r * 0.1, ps.x, ps.y, r);
    pg.addColorStop(0, colL); pg.addColorStop(1, col);
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = Math.max(1, s(0.03)); ctx.stroke();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, r * 1.1 | 0)}px "Roboto Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(p.num), ps.x, ps.y + 1);
  }

  // Ball
  {
    const bs = w2s(st.ball.pos), br = s(P.ballRadius);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(bs.x + s(0.05), bs.y + s(0.05), br, br * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(bs.x - br * 0.3, bs.y - br * 0.3, br * 0.1, bs.x, bs.y, br);
    bg.addColorStop(0, "#fff"); bg.addColorStop(1, "#ccc");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bs.x, bs.y, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(1, s(0.02)); ctx.stroke();
  }

  // Flash
  if (st.flash > 0) {
    const a = Math.min(1, st.flash) * 0.25;
    ctx.fillStyle = `rgba(255,255,200,${a.toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    if (st.flashTxt) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, st.flash).toFixed(2)})`;
      ctx.font = `bold ${s(1.2)}px "Roboto Condensed","Arial Narrow",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = s(0.3);
      ctx.fillText(st.flashTxt, W / 2, H / 2);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    }
  }

  // HUD
  const hH = s(1.0), hY = s(0.3), hW = Math.min(W * 0.6, s(10)), hX = (W - hW) / 2;
  ctx.fillStyle = COL.hBg;
  const hR = s(0.15);
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

  ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hX, hY + hH); ctx.lineTo(hX + hW, hY + hH); ctx.stroke();

  const hCY = hY + hH / 2;
  ctx.fillStyle = COL.tA; ctx.fillRect(hX, hY, s(0.15), hH);
  ctx.fillStyle = COL.tB; ctx.fillRect(hX + hW - s(0.15), hY, s(0.15), hH);

  ctx.fillStyle = COL.tAL;
  ctx.font = `bold ${Math.max(11, s(0.32))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("BLUE", hX + s(0.4), hCY);

  ctx.fillStyle = COL.tBL; ctx.textAlign = "right";
  ctx.fillText("RED", hX + hW - s(0.4), hCY);

  ctx.fillStyle = COL.hTxt;
  ctx.font = `bold ${Math.max(14, s(0.45))}px "Roboto Condensed","Arial Narrow",sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${st.sL}  -  ${st.sR}`, W / 2, hCY);

  // Time
  const rem = Math.max(0, P.matchDuration - st.time);
  const mn = Math.floor(rem / 60), sc2 = Math.floor(rem % 60);
  const ts = `${String(mn).padStart(2, "0")}:${String(sc2).padStart(2, "0")}`;
  const tbH = s(0.45), tbW = s(1.6), tbX = (W - tbW) / 2, tbY = hY + hH;
  ctx.fillStyle = "rgba(10,10,20,0.75)";
  ctx.beginPath();
  ctx.moveTo(tbX, tbY); ctx.lineTo(tbX + tbW, tbY);
  ctx.lineTo(tbX + tbW - s(0.1), tbY + tbH); ctx.lineTo(tbX + s(0.1), tbY + tbH);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = COL.hTime;
  ctx.font = `bold ${Math.max(10, s(0.28))}px "Roboto Mono","Courier New",monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ts, W / 2, tbY + tbH / 2);
}

// ── Component ───────────────────────────────────────────────
export default function Home() {
  const ref = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<State>(mkState());
  const ltRef = useRef(0);

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

    let id: number;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - ltRef.current) / 1000);
      ltRef.current = t;
      if (dt > 0.001 && dt < 0.1) update(stRef.current, dt);
      render(ctx, cv, stRef.current);
      id = requestAnimationFrame(loop);
    };
    ltRef.current = performance.now();
    id = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={ref} style={{ display: "block", width: "100vw", height: "100vh", background: "#0a0a10", touchAction: "none" }} />
  );
}
