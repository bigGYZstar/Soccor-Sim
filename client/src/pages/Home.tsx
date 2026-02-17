import { useEffect, useRef } from "react";

/*
 * ============================================================
 *  2D Futsal Autoplay Mockup — Clean Broadcast / Sports TV
 *  Design: ESPN/DAZN-style sports broadcast with deep green
 *  court, royal blue vs crimson red teams, broadcast HUD.
 * ============================================================
 */

// ── Tunable Parameters ──────────────────────────────────────
const PARAMS = {
  // Match
  matchDuration: 90,        // seconds
  goalResetDelay: 1.5,      // seconds pause after goal

  // Court (world units)
  courtHalfW: 8.0,
  courtHalfH: 5.0,
  goalHalfH: 1.5,
  goalDepth: 0.4,

  // Player
  moveSpeed: 4.0,
  dribbleSpeed: 3.2,
  passSpeed: 12,
  shotSpeed: 18,
  passAccuracy: 0.85,
  shotAccuracy: 0.70,
  dribbleControl: 0.90,
  interceptRadius: 0.7,
  decisionInterval: 0.20,
  shotRange: 4.0,
  shotAngle: 40,            // degrees

  // Ball
  looseBallDrag: 3.0,

  // Visual
  trailDuration: 0.3,
  playerRadius: 0.35,
  ballRadius: 0.15,
};

// ── Types ───────────────────────────────────────────────────
interface Vec2 { x: number; y: number; }

function v2(x: number, y: number): Vec2 { return { x, y }; }
function v2add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function v2sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function v2scale(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
function v2len(a: Vec2): number { return Math.sqrt(a.x * a.x + a.y * a.y); }
function v2norm(a: Vec2): Vec2 { const l = v2len(a); return l < 0.0001 ? v2(0, 0) : v2(a.x / l, a.y / l); }
function v2dist(a: Vec2, b: Vec2): number { return v2len(v2sub(a, b)); }
function v2dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
function v2lerp(a: Vec2, b: Vec2, t: number): Vec2 { return v2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
function v2angle(a: Vec2, b: Vec2): number {
  const d = v2dot(a, b) / (v2len(a) * v2len(b) + 0.0001);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}
function v2moveToward(from: Vec2, to: Vec2, maxDist: number): Vec2 {
  const d = v2sub(to, from);
  const l = v2len(d);
  if (l <= maxDist) return { ...to };
  return v2add(from, v2scale(v2norm(d), maxDist));
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function randRange(a: number, b: number) { return a + Math.random() * (b - a); }

type ActionType = "idle" | "dribble" | "moveTo";

interface Trail {
  start: Vec2;
  end: Vec2;
  isShot: boolean;
  timer: number;
}

interface Player {
  pos: Vec2;
  teamSide: number;        // -1 left, +1 right
  number: number;
  formationPos: Vec2;
  facingDir: Vec2;
  action: ActionType;
  moveTarget: Vec2;
  decisionTimer: number;
}

interface Ball {
  pos: Vec2;
  velocity: Vec2;
  possessorIdx: number | null;  // index into players[]
  isFree: boolean;
  isShot: boolean;
}

interface GameState {
  players: Player[];
  ball: Ball;
  scoreLeft: number;
  scoreRight: number;
  elapsed: number;
  matchOver: boolean;
  resetting: boolean;
  resetTimer: number;
  kickOffSide: number;
  trail: Trail | null;
  goalFlash: number;       // >0 means flash active
  goalText: string;
  restartTimer: number;
}

// ── Formation (from centre, for left team side=-1) ──────────
const FORMATION: Vec2[] = [
  v2(-7.2, 0),      // GK
  v2(-5.0, -1.8),   // DEF left
  v2(-5.0, 1.8),    // DEF right
  v2(-2.0, 0),      // MID
  v2(-0.5, 0),      // FWD
];
const SHIRT_NUMBERS = [1, 2, 3, 5, 9];

// ── Colours ─────────────────────────────────────────────────
const COL = {
  bg: "#0a0a10",
  court: "#1a6b3a",
  courtDark: "#145e30",
  line: "rgba(255,255,255,0.75)",
  teamA: "#2563eb",       // royal blue
  teamALight: "#60a5fa",
  teamB: "#dc2626",       // crimson red
  teamBLight: "#f87171",
  ball: "#ffffff",
  ballOutline: "#cccccc",
  passTrail: "rgba(255,255,255,0.45)",
  shotTrail: "rgba(255,100,30,0.65)",
  hudBg: "rgba(10,10,20,0.85)",
  hudText: "#ffffff",
  hudTime: "#aabbcc",
  goalFlash: "rgba(255,255,200,0.25)",
  numberText: "#ffffff",
  ringA: "rgba(37,99,235,0.5)",
  ringB: "rgba(220,38,38,0.5)",
};

// ── Init State ──────────────────────────────────────────────
function createPlayers(): Player[] {
  const players: Player[] = [];
  for (let t = 0; t < 2; t++) {
    const side = t === 0 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      let fpos = { ...FORMATION[i] };
      if (side === 1) { fpos.x = -fpos.x; fpos.y = -fpos.y; }
      players.push({
        pos: { ...fpos },
        teamSide: side,
        number: SHIRT_NUMBERS[i],
        formationPos: { ...fpos },
        facingDir: v2(-side, 0),
        action: "idle",
        moveTarget: { ...fpos },
        decisionTimer: Math.random() * PARAMS.decisionInterval,
      });
    }
  }
  return players;
}

function initState(): GameState {
  return {
    players: createPlayers(),
    ball: { pos: v2(0, 0), velocity: v2(0, 0), possessorIdx: null, isFree: false, isShot: false },
    scoreLeft: 0,
    scoreRight: 0,
    elapsed: 0,
    matchOver: false,
    resetting: false,
    resetTimer: 0,
    kickOffSide: 1,
    trail: null,
    goalFlash: 0,
    goalText: "",
    restartTimer: 0,
  };
}

// ── Game Logic ──────────────────────────────────────────────

function clampToCourt(pos: Vec2): Vec2 {
  return v2(clamp(pos.x, -PARAMS.courtHalfW, PARAMS.courtHalfW),
            clamp(pos.y, -PARAMS.courtHalfH, PARAMS.courtHalfH));
}

function checkGoal(pos: Vec2): number {
  if (pos.x >= PARAMS.courtHalfW - 0.05 && Math.abs(pos.y) <= PARAMS.goalHalfH) return 1;
  if (pos.x <= -PARAMS.courtHalfW + 0.05 && Math.abs(pos.y) <= PARAMS.goalHalfH) return -1;
  return 0;
}

function kickBall(state: GameState, dir: Vec2, speed: number, isShot: boolean, target: Vec2) {
  const ball = state.ball;
  state.trail = {
    start: { ...ball.pos },
    end: { ...target },
    isShot,
    timer: PARAMS.trailDuration,
  };
  ball.possessorIdx = null;
  ball.isFree = true;
  ball.isShot = isShot;
  ball.velocity = v2scale(v2norm(dir), speed);
}

function getOpenness(state: GameState, teammate: Player): number {
  let minDist = Infinity;
  for (const p of state.players) {
    if (p.teamSide === teammate.teamSide) continue;
    const d = v2dist(teammate.pos, p.pos);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function isPassLaneBlocked(state: GameState, from: Vec2, to: Vec2, teamSide: number): boolean {
  const dir = v2norm(v2sub(to, from));
  const dist = v2dist(from, to);
  for (const p of state.players) {
    if (p.teamSide === teamSide) continue;
    const toP = v2sub(p.pos, from);
    const proj = v2dot(toP, dir);
    if (proj < 0.5 || proj > dist - 0.5) continue;
    const closest = v2add(from, v2scale(dir, proj));
    if (v2dist(closest, p.pos) < 0.8) return true;
  }
  return false;
}

function findBestPassTarget(state: GameState, playerIdx: number): number | null {
  const me = state.players[playerIdx];
  let bestIdx: number | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (p.teamSide !== me.teamSide || i === playerIdx) continue;
    const dist = v2dist(me.pos, p.pos);
    if (dist < 1 || dist > 14) continue;
    const openness = getOpenness(state, p);
    const goalProgress = -me.teamSide * p.pos.x;
    let score = openness * 2 + goalProgress * 0.5 - dist * 0.1;
    if (isPassLaneBlocked(state, me.pos, p.pos, me.teamSide)) score -= 5;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

function decideWithBall(state: GameState, idx: number, dt: number) {
  const me = state.players[idx];
  const goalCenter = v2(-me.teamSide * PARAMS.courtHalfW, 0);
  const distToGoal = v2dist(me.pos, goalCenter);
  const toGoal = v2norm(v2sub(goalCenter, me.pos));
  const angleToGoal = v2angle(me.facingDir, toGoal);

  // 1) SHOT
  if (distToGoal < PARAMS.shotRange && angleToGoal < PARAMS.shotAngle) {
    const err = (1 - PARAMS.shotAccuracy) * 2;
    const target = v2(goalCenter.x, goalCenter.y + randRange(-err, err));
    const dir = v2norm(v2sub(target, me.pos));
    me.facingDir = dir;
    kickBall(state, dir, PARAMS.shotSpeed, true, target);
    return;
  }

  // 2) PASS
  const bestTarget = findBestPassTarget(state, idx);
  if (bestTarget !== null) {
    const teammate = state.players[bestTarget];
    const passDist = v2dist(me.pos, teammate.pos);
    if (passDist > 1.5) {
      let targetPos = { ...teammate.pos };
      const tmDir = v2norm(v2sub(teammate.moveTarget, teammate.pos));
      targetPos = v2add(targetPos, v2scale(tmDir, 0.3));
      const err = (1 - PARAMS.passAccuracy) * 1.5;
      targetPos.x += randRange(-err, err);
      targetPos.y += randRange(-err, err);
      const dir = v2norm(v2sub(targetPos, me.pos));
      me.facingDir = dir;
      kickBall(state, dir, PARAMS.passSpeed, false, targetPos);
      return;
    }
  }

  // 3) DRIBBLE
  if (Math.random() > PARAMS.dribbleControl) {
    const fumbleDir = v2norm(v2(randRange(-1, 1), randRange(-1, 1)));
    kickBall(state, fumbleDir, 3, false, v2add(me.pos, v2scale(fumbleDir, 2)));
    return;
  }
  const goalDir = v2norm(v2(-me.teamSide, 0));
  let avoidDir = v2(0, 0);
  let closestOpp = Infinity;
  for (const p of state.players) {
    if (p.teamSide === me.teamSide) continue;
    const d = v2dist(me.pos, p.pos);
    if (d < closestOpp && d < 3) {
      closestOpp = d;
      avoidDir = v2norm(v2sub(me.pos, p.pos));
    }
  }
  const desired = v2norm(v2add(v2scale(goalDir, 0.7), v2scale(avoidDir, 0.3)));
  me.moveTarget = clampToCourt(v2add(me.pos, v2scale(desired, 2)));
  me.action = "dribble";
  me.facingDir = desired;
}

function decideWithoutBall(state: GameState, idx: number) {
  const me = state.players[idx];
  const ball = state.ball;

  if (ball.isFree) {
    const d = v2dist(me.pos, ball.pos);
    if (d < 5) {
      me.moveTarget = { ...ball.pos };
      me.action = "moveTo";
      return;
    }
  }

  const home = me.formationPos;
  const xShift = clamp((ball.pos.x - home.x) * 0.25, -2, 2);
  const yShift = clamp((ball.pos.y - home.y) * 0.35, -1.5, 1.5);
  me.moveTarget = clampToCourt(v2add(home, v2(xShift, yShift)));
  me.action = "moveTo";
}

function doKickOff(state: GameState) {
  state.resetting = false;
  state.ball.pos = v2(0, 0);
  state.ball.velocity = v2(0, 0);
  state.ball.possessorIdx = null;
  state.ball.isFree = false;
  state.ball.isShot = false;
  state.trail = null;

  for (const p of state.players) {
    p.pos = { ...p.formationPos };
    p.action = "idle";
    p.moveTarget = { ...p.formationPos };
    p.facingDir = v2(-p.teamSide, 0);
  }

  // Give ball to kick-off team's centre player (closest to centre)
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (p.teamSide !== state.kickOffSide) continue;
    const d = v2dist(p.pos, v2(0, 0));
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  state.ball.possessorIdx = bestIdx;
  state.ball.isFree = false;
}

function update(state: GameState, dt: number) {
  // Goal flash decay
  if (state.goalFlash > 0) state.goalFlash -= dt;

  // Match restart after game over
  if (state.matchOver) {
    state.restartTimer -= dt;
    if (state.restartTimer <= 0) {
      Object.assign(state, initState());
      doKickOff(state);
    }
    return;
  }

  // Goal reset pause
  if (state.resetting) {
    state.resetTimer -= dt;
    if (state.resetTimer <= 0) doKickOff(state);
    return;
  }

  // Timer
  state.elapsed += dt;
  if (state.elapsed >= PARAMS.matchDuration) {
    state.matchOver = true;
    state.restartTimer = 4;
    state.goalText = "FULL TIME";
    state.goalFlash = 2;
    return;
  }

  const ball = state.ball;

  // ── Ball update ───────────────────────────────────────
  if (ball.possessorIdx !== null && !ball.isFree) {
    const owner = state.players[ball.possessorIdx];
    const offset = v2scale(owner.facingDir, 0.25);
    ball.pos = v2add(owner.pos, offset);
  } else if (ball.isFree) {
    ball.pos = v2add(ball.pos, v2scale(ball.velocity, dt));

    // Bounce top/bottom
    if (Math.abs(ball.pos.y) > PARAMS.courtHalfH) {
      ball.pos.y = clamp(ball.pos.y, -PARAMS.courtHalfH, PARAMS.courtHalfH);
      ball.velocity.y = -ball.velocity.y * 0.5;
    }

    // Goal check
    const goalSide = checkGoal(ball.pos);
    if (goalSide !== 0) {
      if (goalSide > 0) state.scoreLeft++;
      else state.scoreRight++;
      state.kickOffSide = -goalSide;
      state.resetting = true;
      state.resetTimer = PARAMS.goalResetDelay;
      state.goalFlash = 1.5;
      state.goalText = "GOAL!";
      return;
    }

    // Side walls (not goal mouth)
    if (Math.abs(ball.pos.x) > PARAMS.courtHalfW) {
      ball.pos.x = clamp(ball.pos.x, -PARAMS.courtHalfW, PARAMS.courtHalfW);
      ball.velocity.x = -ball.velocity.x * 0.5;
    }

    // Drag
    const speed = v2len(ball.velocity);
    if (speed > 0.3) {
      const newSpeed = Math.max(0, speed - PARAMS.looseBallDrag * dt);
      ball.velocity = v2scale(v2norm(ball.velocity), newSpeed);
    } else {
      ball.velocity = v2(0, 0);
      ball.isShot = false;
    }
  }

  // ── Trail decay ───────────────────────────────────────
  if (state.trail) {
    state.trail.timer -= dt;
    if (state.trail.timer <= 0) state.trail = null;
  }

  // ── Player update ─────────────────────────────────────
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const hasBall = ball.possessorIdx === i;

    // Interception
    if (!hasBall && ball.isFree) {
      if (v2dist(p.pos, ball.pos) < PARAMS.interceptRadius) {
        ball.possessorIdx = i;
        ball.isFree = false;
        ball.isShot = false;
        ball.velocity = v2(0, 0);
      }
    }

    // Decision tick
    p.decisionTimer -= dt;
    if (p.decisionTimer <= 0) {
      p.decisionTimer = PARAMS.decisionInterval;
      if (ball.possessorIdx === i) {
        decideWithBall(state, i, dt);
      } else {
        decideWithoutBall(state, i);
      }
    }

    // Movement
    if (p.action !== "idle") {
      const speed = p.action === "dribble" ? PARAMS.dribbleSpeed : PARAMS.moveSpeed;
      const dir = v2sub(p.moveTarget, p.pos);
      if (v2len(dir) < 0.1) {
        p.action = "idle";
      } else {
        p.facingDir = v2norm(dir);
        p.pos = clampToCourt(v2moveToward(p.pos, p.moveTarget, speed * dt));
      }
    }
  }
}

// ── Rendering ───────────────────────────────────────────────

function worldToScreen(pos: Vec2, canvas: HTMLCanvasElement, scale: number, offsetX: number, offsetY: number): Vec2 {
  return v2(offsetX + pos.x * scale, offsetY - pos.y * scale);
}

function render(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: GameState) {
  const W = canvas.width;
  const H = canvas.height;

  // Calculate scale to fit court
  const courtW = PARAMS.courtHalfW * 2 + 2;
  const courtH = PARAMS.courtHalfH * 2 + 3.5; // extra for HUD
  const scaleX = W / courtW;
  const scaleY = H / courtH;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = W / 2;
  const offsetY = H / 2 + 0.75 * scale; // shift down slightly for HUD

  const w2s = (p: Vec2) => worldToScreen(p, canvas, scale, offsetX, offsetY);
  const s = (v: number) => v * scale;

  // ── Background ────────────────────────────────────────
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Court ─────────────────────────────────────────────
  const courtTL = w2s(v2(-PARAMS.courtHalfW, PARAMS.courtHalfH));
  const courtSize = v2(s(PARAMS.courtHalfW * 2), s(PARAMS.courtHalfH * 2));

  // Court gradient
  const grd = ctx.createLinearGradient(courtTL.x, courtTL.y, courtTL.x, courtTL.y + courtSize.y);
  grd.addColorStop(0, COL.court);
  grd.addColorStop(0.5, COL.courtDark);
  grd.addColorStop(1, COL.court);
  ctx.fillStyle = grd;
  ctx.fillRect(courtTL.x, courtTL.y, courtSize.x, courtSize.y);

  // Pitch stripes (subtle)
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  const stripeW = s(PARAMS.courtHalfW * 2) / 8;
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(courtTL.x + i * stripeW, courtTL.y, stripeW, courtSize.y);
  }

  // ── Court Lines ───────────────────────────────────────
  ctx.strokeStyle = COL.line;
  ctx.lineWidth = Math.max(1, s(0.04));

  // Outline
  ctx.strokeRect(courtTL.x, courtTL.y, courtSize.x, courtSize.y);

  // Centre line
  const centreTop = w2s(v2(0, PARAMS.courtHalfH));
  const centreBot = w2s(v2(0, -PARAMS.courtHalfH));
  ctx.beginPath();
  ctx.moveTo(centreTop.x, centreTop.y);
  ctx.lineTo(centreBot.x, centreBot.y);
  ctx.stroke();

  // Centre circle
  const centreS = w2s(v2(0, 0));
  ctx.beginPath();
  ctx.arc(centreS.x, centreS.y, s(1.5), 0, Math.PI * 2);
  ctx.stroke();

  // Centre dot
  ctx.fillStyle = COL.line;
  ctx.beginPath();
  ctx.arc(centreS.x, centreS.y, s(0.08), 0, Math.PI * 2);
  ctx.fill();

  // Penalty areas
  const paW = 2.0, paH = 2.5;
  // Left
  const paLTL = w2s(v2(-PARAMS.courtHalfW, paH));
  ctx.strokeRect(paLTL.x, paLTL.y, s(paW), s(paH * 2));
  // Right
  const paRTL = w2s(v2(PARAMS.courtHalfW - paW, paH));
  ctx.strokeRect(paRTL.x, paRTL.y, s(paW), s(paH * 2));

  // ── Goals ─────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  // Left goal
  const glTL = w2s(v2(-PARAMS.courtHalfW - PARAMS.goalDepth, PARAMS.goalHalfH));
  ctx.fillRect(glTL.x, glTL.y, s(PARAMS.goalDepth), s(PARAMS.goalHalfH * 2));
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.strokeRect(glTL.x, glTL.y, s(PARAMS.goalDepth), s(PARAMS.goalHalfH * 2));
  // Right goal
  const grTL = w2s(v2(PARAMS.courtHalfW, PARAMS.goalHalfH));
  ctx.fillRect(grTL.x, grTL.y, s(PARAMS.goalDepth), s(PARAMS.goalHalfH * 2));
  ctx.strokeRect(grTL.x, grTL.y, s(PARAMS.goalDepth), s(PARAMS.goalHalfH * 2));

  // Goal posts
  ctx.fillStyle = "#ffffff";
  const posts = [
    v2(-PARAMS.courtHalfW, PARAMS.goalHalfH),
    v2(-PARAMS.courtHalfW, -PARAMS.goalHalfH),
    v2(PARAMS.courtHalfW, PARAMS.goalHalfH),
    v2(PARAMS.courtHalfW, -PARAMS.goalHalfH),
  ];
  for (const post of posts) {
    const ps = w2s(post);
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, s(0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Trail ─────────────────────────────────────────────
  if (state.trail) {
    const t = state.trail;
    const alpha = t.timer / PARAMS.trailDuration;
    const startS = w2s(t.start);
    const endS = w2s(t.end);

    if (t.isShot) {
      ctx.strokeStyle = `rgba(255,100,30,${0.65 * alpha})`;
      ctx.lineWidth = Math.max(2, s(0.1));
      ctx.beginPath();
      ctx.moveTo(startS.x, startS.y);
      ctx.lineTo(endS.x, endS.y);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * alpha})`;
      ctx.lineWidth = Math.max(1, s(0.04));
      ctx.setLineDash([s(0.15), s(0.15)]);
      ctx.beginPath();
      ctx.moveTo(startS.x, startS.y);
      ctx.lineTo(endS.x, endS.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 1;
  }

  // ── Players ───────────────────────────────────────────
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const ps = w2s(p.pos);
    const r = s(PARAMS.playerRadius);
    const isA = p.teamSide < 0;
    const col = isA ? COL.teamA : COL.teamB;
    const colLight = isA ? COL.teamALight : COL.teamBLight;

    // Possession ring
    if (state.ball.possessorIdx === i) {
      ctx.strokeStyle = isA ? COL.ringA : COL.ringB;
      ctx.lineWidth = Math.max(2, s(0.06));
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, r * 1.6, 0, Math.PI * 2);
      ctx.stroke();

      // Glow
      ctx.shadowColor = col;
      ctx.shadowBlur = s(0.3);
    }

    // Player circle
    const grad = ctx.createRadialGradient(ps.x - r * 0.3, ps.y - r * 0.3, r * 0.1, ps.x, ps.y, r);
    grad.addColorStop(0, colLight);
    grad.addColorStop(1, col);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = Math.max(1, s(0.03));
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Number
    ctx.fillStyle = COL.numberText;
    ctx.font = `bold ${Math.max(10, r * 1.1 | 0)}px "Roboto Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.number), ps.x, ps.y + 1);
  }

  // ── Ball ──────────────────────────────────────────────
  {
    const bs = w2s(state.ball.pos);
    const br = s(PARAMS.ballRadius);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(bs.x + s(0.05), bs.y + s(0.05), br, br * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    const bGrad = ctx.createRadialGradient(bs.x - br * 0.3, bs.y - br * 0.3, br * 0.1, bs.x, bs.y, br);
    bGrad.addColorStop(0, "#ffffff");
    bGrad.addColorStop(1, "#cccccc");
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(bs.x, bs.y, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = Math.max(1, s(0.02));
    ctx.stroke();
  }

  // ── Goal Flash ────────────────────────────────────────
  if (state.goalFlash > 0) {
    const alpha = Math.min(1, state.goalFlash) * 0.25;
    ctx.fillStyle = `rgba(255,255,200,${alpha})`;
    ctx.fillRect(0, 0, W, H);

    // Goal text
    if (state.goalText) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, state.goalFlash)})`;
      ctx.font = `bold ${s(1.2)}px "Roboto Condensed", "Arial Narrow", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = s(0.3);
      ctx.fillText(state.goalText, W / 2, H / 2);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
  }

  // ── HUD (Broadcast bar) ───────────────────────────────
  const hudH = s(1.0);
  const hudY = s(0.3);
  const hudW = Math.min(W * 0.6, s(10));
  const hudX = (W - hudW) / 2;

  // Background
  ctx.fillStyle = COL.hudBg;
  const hudR = s(0.15);
  ctx.beginPath();
  ctx.moveTo(hudX + hudR, hudY);
  ctx.lineTo(hudX + hudW - hudR, hudY);
  ctx.quadraticCurveTo(hudX + hudW, hudY, hudX + hudW, hudY + hudR);
  ctx.lineTo(hudX + hudW, hudY + hudH - hudR);
  ctx.quadraticCurveTo(hudX + hudW, hudY + hudH, hudX + hudW - hudR, hudY + hudH);
  ctx.lineTo(hudX + hudR, hudY + hudH);
  ctx.quadraticCurveTo(hudX, hudY + hudH, hudX, hudY + hudH - hudR);
  ctx.lineTo(hudX, hudY + hudR);
  ctx.quadraticCurveTo(hudX, hudY, hudX + hudR, hudY);
  ctx.closePath();
  ctx.fill();

  // Bottom border accent
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hudX, hudY + hudH);
  ctx.lineTo(hudX + hudW, hudY + hudH);
  ctx.stroke();

  const hudCY = hudY + hudH / 2;

  // Team A colour bar
  ctx.fillStyle = COL.teamA;
  ctx.fillRect(hudX, hudY, s(0.15), hudH);

  // Team B colour bar
  ctx.fillStyle = COL.teamB;
  ctx.fillRect(hudX + hudW - s(0.15), hudY, s(0.15), hudH);

  // Team names
  ctx.fillStyle = COL.teamALight;
  ctx.font = `bold ${Math.max(11, s(0.32))}px "Roboto Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("BLUE", hudX + s(0.4), hudCY);

  ctx.fillStyle = COL.teamBLight;
  ctx.textAlign = "right";
  ctx.fillText("RED", hudX + hudW - s(0.4), hudCY);

  // Score
  ctx.fillStyle = COL.hudText;
  ctx.font = `bold ${Math.max(14, s(0.45))}px "Roboto Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`${state.scoreLeft}  -  ${state.scoreRight}`, W / 2, hudCY);

  // Time (below main bar)
  const remaining = Math.max(0, PARAMS.matchDuration - state.elapsed);
  const min = Math.floor(remaining / 60);
  const sec = Math.floor(remaining % 60);
  const timeStr = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;

  const timeBgH = s(0.45);
  const timeBgW = s(1.6);
  const timeBgX = (W - timeBgW) / 2;
  const timeBgY = hudY + hudH;
  ctx.fillStyle = "rgba(10,10,20,0.75)";
  ctx.beginPath();
  ctx.moveTo(timeBgX, timeBgY);
  ctx.lineTo(timeBgX + timeBgW, timeBgY);
  ctx.lineTo(timeBgX + timeBgW - s(0.1), timeBgY + timeBgH);
  ctx.lineTo(timeBgX + s(0.1), timeBgY + timeBgH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COL.hudTime;
  ctx.font = `bold ${Math.max(10, s(0.28))}px "Roboto Mono", "Courier New", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(timeStr, W / 2, timeBgY + timeBgH / 2);
}

// ── React Component ─────────────────────────────────────────

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initState());
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Init
    doKickOff(stateRef.current);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = window.innerWidth + "px";
      canvas!.style.height = window.innerHeight + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    let animId: number;
    function loop(timestamp: number) {
      const dt = Math.min(0.05, (timestamp - lastTimeRef.current) / 1000);
      lastTimeRef.current = timestamp;

      update(stateRef.current, dt);
      render(ctx!, canvas!, stateRef.current);

      animId = requestAnimationFrame(loop);
    }
    lastTimeRef.current = performance.now();
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
        background: "#0a0a10",
        touchAction: "none",
      }}
    />
  );
}
