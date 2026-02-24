// Game engine - all logic extracted from Home.tsx
// UI-independent, testable simulation core

import { State, Player, Ball, Role, V, Trail } from './types';
import { P } from './constants';
import {
  v, vadd, vsub, vscl, vlen, vnorm, vdist, vdot, vlerp, vang,
  clamp, rng, pitchClamp, vmove
} from './math';

// Additional math utilities
const vperp = (a: V): V => v(-a.y, a.x);
const clamp01 = (val: number) => Math.max(0, Math.min(1, val));

// Extended parameters (offside, fouls, etc.)
const PExt = {
  ...P,
  offsideEnabled: true,
  offsideMargin: 0.25,
  offsidePause: 1.2,
  restartNoIntercept: 0.5,
  outEnabled: true,
  outMargin: 0.02,
  restartPause: 1.0,
  throwInInset: 0.35,
  cornerInset: 0.25,
  goalKickX: 10.5 - 0.92 + 0.2,
  gkSaveEnabled: true,
  gkSaveRadius: 0.9,
  gkSaveBase: 0.55,
  gkSaveAngleBonus: 0.20,
  gkParryChance: 0.25,
  gkHoldCooldown: 0.6,
  longPassMinDist: 8,
  longPassMaxDist: 22,
  throwInMaxDist: 12,
  throwInAnimDur: 0.5,
  cornerAnimDur: 0.4,
  headingContestRadius: 2.5,
  headingContestDur: 0.35,
  foulChanceOnTackle: 0.18,
  foulChanceOnDribble: 0.10,
  foulPause: 1.5,
  freeKickNoIntercept: 0.8,
  wallDistance: 1.83,
  wallPlayerCount: 3,
  directFKShotRange: 7.0,
  directFKShotChance: 0.65,
};

// Role type imported from types.ts

function slotRole(slot: number): Role {
  if (slot === 0) return "GK";
  if (slot <= 4) return "DEF";
  if (slot <= 8) return "MID";
  return "FWD";
}

// Formation definitions
const FORM_442_BLUE = [
  v(-9.7, 0),    // GK
  v(-7.5, -4.0), v(-7.5, -1.3), v(-7.5, 1.3), v(-7.5, 4.0), // DEF
  v(-3.5, -4.5), v(-3.5, -1.5), v(-3.5, 1.5), v(-3.5, 4.5), // MID
  v(-0.5, -2.0), v(-0.5, 2.0),  // FWD
];
const FORM_442_RED = FORM_442_BLUE.map((p) => v(-p.x, -p.y));

export function mkPlayers(): Player[] {
  const pl: Player[] = [];
  for (let i = 0; i < 11; i++) {
    const home = FORM_442_BLUE[i];
    pl.push({
      idx: pl.length,  // Bug fix A: Add idx (0-21)
      pos: { ...home },
      vel: v(0, 0),  // Phase 5: velocity for inertia
      team: -1, num: i + 1, home, face: v(1, 0),
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
      turnDebt: 0,  // Phase 5: turning inertia
      staminaShort: 1,  // Phase 5: short-term stamina (full)
      burstT: 0,  // Phase 5: off-the-ball burst timer
      burstCD: 0,  // Phase 5: burst cooldown
    });
  }
  for (let i = 0; i < 11; i++) {
    const home = FORM_442_RED[i];
    pl.push({
      idx: pl.length,  // Bug fix A: Add idx (0-21)
      pos: { ...home },
      vel: v(0, 0),  // Phase 5: velocity for inertia
      team: 1, num: i + 1, home, face: v(-1, 0),
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
      turnDebt: 0,  // Phase 5: turning inertia
      staminaShort: 1,  // Phase 5: short-term stamina (full)
      burstT: 0,  // Phase 5: off-the-ball burst timer
      burstCD: 0,  // Phase 5: burst cooldown
    });
  }
  return pl;
}

export function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: true, shot: false, dead: 0, cooldown: 0, lob: 0, lastTouchTeam: 0, holdT: 0, holdAX0: 0, holdT0: 0, phaseBBlockedPassStreak: 0 },
    sL: 0, sR: 0, time: 0, over: false, paused: false, pauseT: 0, koSide: Math.random() < 0.5 ? -1 : 1,  // Randomize initial kickoff
    trail: null, flash: 0, flashTxt: "", restartT: 0,
    speed: "MID",
    setPiece: null,
    setPieceRestart: null,
    stats: { 
      ownGoals: 0, 
      throwIns: 0, 
      throwInsFromPassMiss: 0, 
      corners: 0,
      turnoverPressHits: { blue: 0, red: 0 },
      attPossStreakFrames: { blue: 0, red: 0 },
      attPossStreakCount: { blue: 0, red: 0 },
      phaseBEligibleFrames: { blue: 0, red: 0 },
      phaseBShots: { blue: 0, red: 0 },
      phaseBBlockedPassCount: { blue: 0, red: 0 },
      forcedShotsFromBlocked: { blue: 0, red: 0 }
    },
    atkLevelBlue: 5,
    atkLevelRed: 5,
    turnoverT: 0,  // v8.7.4: Counter-press timer
    turnoverTeam: 0,  // v8.7.4: Team that lost possession
    stackDetection: {
      lastBallPos: v(0, 0),
      stableTime: 0,
      isStacked: false
    }
  };
}

export function getAtkLevel(st: State, team: number): number {
  return 5; // Default attack level
}

export function atkFactor(st: State, team: number): number {
  return 0.5 + getAtkLevel(st, team) * 0.05;
}

export function checkGoal(pos: V): number {
  if (Math.abs(pos.y) > PExt.goalHalfH) return 0;
  if (pos.x < -PExt.pitchHalfW - PExt.goalDepth) return -1;
  if (pos.x > PExt.pitchHalfW + PExt.goalDepth) return 1;
  return 0;
}

export function give(ball: Ball, idx: number, pl: Player[], st: State) {
  // v8.7.4: Detect turnover and activate counter-press
  const prevOwnerTeam = ball.lastTouchTeam;
  const newOwnerTeam = pl[idx].team;
  
  // Track successful counter-press recovery BEFORE updating turnover state
  if (st.turnoverT > 0 && prevOwnerTeam !== 0 && prevOwnerTeam !== newOwnerTeam) {
    // Ball changed hands during counter-press window
    // Check if the team that lost possession (turnoverTeam) is winning it back
    if (st.turnoverTeam === newOwnerTeam) {
      // Counter-press success! The team that lost possession won it back
      if (newOwnerTeam === -1) {
        st.stats.turnoverPressHits.blue++;
      } else {
        st.stats.turnoverPressHits.red++;
      }
    }
  }
  
  if (prevOwnerTeam !== 0 && prevOwnerTeam !== newOwnerTeam) {
    // Turnover detected - activate counter-press for losing team
    st.turnoverT = 1.2;  // 1.2s counter-press window
    st.turnoverTeam = prevOwnerTeam;  // Team that lost possession
  }
  
  ball.owner = idx; ball.free = false; ball.shot = false;
  ball.pos = { ...pl[idx].pos }; ball.vel = v(0, 0);
  ball.lastTouchTeam = pl[idx].team;
  ball.holdT = 0;  // v8.7.1: Reset hold timer when new owner acquired
  // v8.7.4: Record ax and time for progress check
  const ax = ball.pos.x * (-pl[idx].team);
  ball.holdAX0 = ax;
  ball.holdT0 = st.time;
}

export function kick(st: State, kickerIdx: number, spd: number, shot: boolean, tgt: V, isLong: boolean = false, customErr?: number) {
  const b = st.ball;
  const kicker = st.pl[kickerIdx];
  if (b.owner !== null) b.lastTouchTeam = st.pl[b.owner].team;
  
  // ★ v7.2: Unified error handling with GK-specific safety
  let finalTarget = { ...tgt };
  let errRange = customErr !== undefined ? customErr : 
                 (shot ? (1 - PExt.shotAccuracy) * 3.0 : 
                  isLong ? (1 - PExt.longPassAccuracy) * 1.5 : 
                  (1 - PExt.passAccuracy) * 1.5);
  
  if (!shot && kicker) {
    // Improvement 1: Detect back/lateral passes (gp <= 0)
    const isForward = (tgt.x - kicker.pos.x) * -kicker.team > 0.5;
    
    if (!isForward) {
      // Back/lateral passes are extremely safe (95% error reduction)
      errRange *= 0.05;
    }
    
    // Improvement 2: GK-specific own goal prevention
    const ownGoalX = kicker.team * PExt.pitchHalfW;
    const ownGoalY = 0;
    const distToOwnGoal = Math.sqrt(Math.pow(tgt.x - ownGoalX, 2) + Math.pow(tgt.y - ownGoalY, 2));
    
    // Check if target is GK (within 2.0 units of own goal)
    const targetIsGK = distToOwnGoal < 2.0;
    
    if (targetIsGK) {
      // CRITICAL: Force GK pass target outside goal posts
      errRange = 0; // Zero error
      
      // Move target to safe zone (outside goal posts)
      const safeOffsetY = PExt.goalHalfH + 1.0; // 1.0 unit outside posts
      if (Math.abs(finalTarget.y) < safeOffsetY) {
        // Choose side based on current Y or default to positive
        finalTarget.y = (finalTarget.y >= 0 ? 1 : -1) * safeOffsetY;
      }
      // Ensure X is slightly in front of goal line
      const safeOffsetX = 0.5;
      if (Math.abs(finalTarget.x - ownGoalX) < safeOffsetX) {
        finalTarget.x = ownGoalX - kicker.team * safeOffsetX;
      }
    }
  }
  
  // Apply error to final target
  const err = v(rng(-errRange, errRange), rng(-errRange, errRange));
  finalTarget = vadd(finalTarget, err);
  
  // v8.2 Fix: Calculate direction from kicker position (not ball position)
  const dir = vnorm(vsub(finalTarget, kicker.pos));
  
  // v8.2 Fix: Reset ball position to kicker's foot (prevent dribble drift)
  b.pos = vadd(kicker.pos, vscl(dir, 0.5));
  
  st.trail = { start: kicker.pos, end: finalTarget, shot, longPass: isLong, t: PExt.trailDuration };
  
  // Track kick type for statistics
  b.lastKickTeam = kicker.team;
  b.lastTouchTeam = kicker.team; // Ensure lastTouchTeam is set on every kick
  if (shot) b.lastKickType = "SHOT";
  else if (isLong) b.lastKickType = "LONG";
  else b.lastKickType = "PASS";
  
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(dir, spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0;
  
  // Update kicker's face direction
  kicker.face = dir;
  
  // ★ v8.7.1: Kick logging (1% sample)
  if (Math.random() < 0.01) {
    const dirLen = vlen(dir);
    const ballVelLen = vlen(b.vel);
    const type = shot ? "SHOT" : isLong ? "LONG" : "PASS";
    console.log(`[KICK] t=${st.time.toFixed(1)} P${kickerIdx}(${kicker.team === -1 ? 'B' : 'R'}) ${type} from(${kicker.pos.x.toFixed(1)},${kicker.pos.y.toFixed(1)}) to(${finalTarget.x.toFixed(1)},${finalTarget.y.toFixed(1)}) spd=${spd.toFixed(1)} dirLen=${dirLen.toFixed(3)} ballVelLen=${ballVelLen.toFixed(1)}`);
  }
}

export function nearest(st: State, pos: V, teamFilter?: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (teamFilter !== undefined && st.pl[i].team !== teamFilter) continue;
    const d = vdist(pos, st.pl[i].pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Bug fix B: Add nearestEx with excludeIdx parameter
export function nearestEx(st: State, pos: V, teamFilter?: number, excludeIdx?: number): number {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (excludeIdx !== undefined && i === excludeIdx) continue;
    if (teamFilter !== undefined && st.pl[i].team !== teamFilter) continue;
    const d = vdist(pos, st.pl[i].pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

export function nearestOutfield(st: State, pos: V, team: number): number {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== team || st.pl[i].isGK) continue;
    const d = vdist(pos, st.pl[i].pos);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

export function findGK(st: State, team: number): number {
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team === team && st.pl[i].isGK) return i;
  }
  return -1;
}

export function isOffside(st: State, receiver: Player, ballPosAtKick: V): boolean {
  if (!PExt.offsideEnabled) return false;
  if (receiver.isGK) return false;
  const attackDir = -receiver.team;
  if ((receiver.pos.x - ballPosAtKick.x) * attackDir <= 0) return false;
  let secondLast = -Infinity;
  for (const p of st.pl) {
    if (p.team === receiver.team) continue;
    const px = p.pos.x * attackDir;
    if (px > secondLast) secondLast = px;
  }
  return (receiver.pos.x * attackDir > secondLast + PExt.offsideMargin);
}

export function openness(st: State, p: Player): number {
  let minDist = Infinity;
  for (const opp of st.pl) {
    if (opp.team === p.team) continue;
    const d = vdist(p.pos, opp.pos);
    if (d < minDist) minDist = d;
  }
  return Math.min(minDist / 3.0, 1.0);
}

export function laneBlocked(st: State, from: V, to: V, team: number): boolean {
  const dir = vsub(to, from);
  const dist = vlen(dir);
  if (dist < 0.1) return false;
  const norm = vscl(dir, 1 / dist);
  for (const opp of st.pl) {
    if (opp.team === team) continue;
    const toOpp = vsub(opp.pos, from);
    const proj = vdot(toOpp, norm);
    if (proj < 0 || proj > dist) continue;
    const closest = vadd(from, vscl(norm, proj));
    // v8.3: Relax blocking radius from 0.8 to 0.4 to allow more passes through
    if (vdist(closest, opp.pos) < 0.4) return true;
  }
  return false;
}

export function bestPass(st: State, idx: number, relaxed: boolean = false): number | null {
  const me = st.pl[idx];
  let bestIdx = -1, bestScore = -999;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || i === idx) continue;
    const tm = st.pl[i];
    const dist = vdist(me.pos, tm.pos);
    if (dist < 2.0 || dist > 20.0) continue;
    
    let score = 0;
    const gp = (tm.pos.x - me.pos.x) * -me.team;
    score += gp * 2.0;
    score += openness(st, tm) * 3.0;
    
    const isBlocked = laneBlocked(st, me.pos, tm.pos, me.team);
    // v8.7.2: Phase-based blocking penalty (Phase A: -2.0, Phase B: -4.0)
    const ax = me.pos.x * (-me.team);
    const w = PExt.pitchHalfW;
    const isPhaseA = ax < (2 * w / 3); // Phase A: ax < 6.66
    // v8.7.4: Phase A completely ignores laneBlocked (0 penalty), Phase B uses -2.0
    if (isBlocked && !isPhaseA) score -= 2.0;
    if (isOffside(st, tm, me.pos)) score -= 100;
    
    // ★ v8.3: GK diagonal switch (side change) evaluation
    if (me.isGK && Math.abs(tm.pos.y) > 3.0) {
      // Pass from GK to wide SB/WM is effective press evasion
      score += 6.0;
    }
    
    // ★ v8.3: Attacking third penetration pass (line break) is top priority
    const isIntoAttackingThird = (tm.pos.x * -me.team) > (PExt.pitchHalfW / 3);
    const amINotInAttackingThird = (me.pos.x * -me.team) <= (PExt.pitchHalfW / 3);
    if (isIntoAttackingThird && amINotInAttackingThird && gp > 0) {
      if (!isBlocked) {
        score += 15.0; // Unblocked pass into opponent deep territory is "must play"
        if (Math.random() < 0.01) { // Log 1% of attempts
          console.log(`[ATT 3RD PASS] P${me.idx}(${me.pos.x.toFixed(1)}) -> P${i}(${tm.pos.x.toFixed(1)}), score: ${score.toFixed(1)}`);
        }
      } else {
        // v8.7.5: Track blocked passes in Phase B for safety valve
        if (!isPhaseA) {
          // This is Phase B and pass is blocked - will count if this pass is chosen
          // (actual counting happens in decideHasBall when bestPass returns blocked target)
        }
        if (Math.random() < 0.01) {
          console.log(`[ATT 3RD BLOCKED] P${me.idx} -> P${i}, blocked`);
        }
      }
    }
    
    // v7.0: Up-Back-Through bonuses
    if (me.role === "FWD" && tm.role === "MID") score += 8.0;
    if (me.role === "MID" && (tm.role === "MID" || tm.role === "FWD" || tm.slot === 3)) score += 5.0;
    
    // v7.1: Press-escape logic
    let closestEnemy = Infinity;
    for (const opp of st.pl) {
      if (opp.team === me.team) continue;
      const d = vdist(me.pos, opp.pos);
      if (d < closestEnemy) closestEnemy = d;
    }
    const underPress = closestEnemy < 2.5;
    
    if (gp <= 0) {
      if (underPress && openness(st, tm) > 0.5) {
        score += openness(st, tm) * 2.5;
      } else {
        score -= 10.0;
      }
    }
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  // v7.1: Pass rejection if only bad back-passes available
  if (bestScore < -5.0) return null;
  
  return bestIdx === -1 ? null : bestIdx;
}

export function bestLongPass(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bestIdx = -1, bestScore = -999;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || i === idx) continue;
    const tm = st.pl[i];
    const dist = vdist(me.pos, tm.pos);
    if (dist < PExt.longPassMinDist || dist > PExt.longPassMaxDist) continue;
    
    let score = 0;
    const gp = (tm.pos.x - me.pos.x) * -me.team;
    score += gp * 1.5;
    score += openness(st, tm) * 2.0;
    if (isOffside(st, tm, me.pos)) score -= 100;
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  return bestIdx === -1 ? null : bestIdx;
}

export function doPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];
  let tp = { ...tm.pos };
  
  let baseErr = (1 - PExt.passAccuracy) * 1.5;
  const passDist = vdist(me.pos, tm.pos);
  if (passDist < 4.0) baseErr *= 0.5;
  else if (passDist < 7.0) baseErr *= 0.7;
  const inOwnHalf = me.team * me.pos.x > 0;
  if (inOwnHalf) baseErr *= 0.6;
  
  // v7.2: Remove pre-kick error - let kick() handle all error calculation
  kick(st, idx, PExt.passSpeed, false, tp, false, baseErr);
}

export function doLongPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];
  let tp = { ...tm.pos };
  
  if (tm.act === "move") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const pd = vdist(me.pos, tm.pos);
    tp = vadd(tp, vscl(lead, Math.min(pd * 0.15, 2.0)));
  }
  
  const err = (1 - PExt.longPassAccuracy) * 2.0;
  kick(st, idx, PExt.longPassSpeed, false, tp, true, err);
}

export function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  if (Math.random() > PExt.dribbleControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, idx, 3, false, vadd(me.pos, vscl(fd, 2)));
    return;
  }
  const fwd = vnorm(v(-me.team + rng(-0.4, 0.4), rng(-0.6, 0.6)));
  me.act = "dribble"; me.tgt = vadd(me.pos, vscl(fwd, 5));
  me.face = fwd; me.dt = 0;
}

export function doCross(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * PExt.pitchHalfW, 0);
  let bestIdx = -1, bestScore = -999;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || st.pl[i].isGK) continue;
    const tm = st.pl[i];
    const distToGoal = vdist(tm.pos, gc);
    if (distToGoal > 8.0) continue;
    let score = (8.0 - distToGoal) * 2.0;
    score += openness(st, tm) * 1.5;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  if (bestIdx !== -1) {
    const tm = st.pl[bestIdx];
    let tp = { ...tm.pos };
    if (tm.act === "move") {
      const lead = vnorm(vsub(st.pl[bestIdx].tgt, st.pl[bestIdx].pos));
      tp = vadd(tp, vscl(lead, 1.0));
    }
    const err = 1.2;
    // v7.2: Remove pre-kick error - let kick() handle all error calculation
    kick(st, idx, PExt.longPassSpeed * 1.1, false, tp, true, err);
  }
}

export function decideHasBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * PExt.pitchHalfW, 0);
  
  // ★ v8.7.1: Decision logging (1% sample) - will be updated at the end
  let chosenAction = "unknown";
  let targetIdx = -1;
  const shouldLog = Math.random() < 0.01;
  
  // ★ v8.7.3: GK bait COMPLETELY DISABLED for testing
  // if (me.isGK && st.ball.holdT < 0.5) {
  //   let minEnemyDist = Infinity;
  //   for (const e of st.pl) {
  //     if (e.team === me.team) continue;
  //     const d = vdist(me.pos, e.pos);
  //     if (d < minEnemyDist) minEnemyDist = d;
  //   }
  //   // If enemy is far, wait to draw opponent FW (max 0.5s)
  //   if (minEnemyDist > 8.0) {
  //     me.act = "idle";
  //     chosenAction = "idle-GKbait";
  //     return;
  //   }
  // }
  
  // ★ v6.1: Carry state lock - continue forward movement if no enemy nearby
  if (me.act === "carry") {
    let closestEnemy = Infinity;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const d = vdist(me.pos, p.pos);
      if (d < closestEnemy) closestEnemy = d;
    }
    
    if (closestEnemy > 1.5) {
      // Continue carrying forward - update target continuously
      const toGoalDir = vnorm(vsub(gc, me.pos));
      me.tgt = vadd(me.pos, vscl(toGoalDir, 8.0));
      return; // Skip 0.2s decision - keep carrying
    }
  }
  
  // ★ v8.7.3: CB baiting COMPLETELY DISABLED for testing
  // if (me.role === "DEF" && me.team * me.pos.x > 0 && st.ball.holdT < 0.5) {
  //   let closestEnemy = Infinity;
  //   for (const p of st.pl) {
  //     if (p.team === me.team) continue;
  //     const d = vdist(me.pos, p.pos);
  //     if (d < closestEnemy) closestEnemy = d;
  //   }
  //   
  //   if (closestEnemy > 6.0) {
  //     me.act = "idle";
  //     me.tgt = { ...me.pos };
  //     chosenAction = "idle-CBbait";
  //     return; // Stand still to bait press (max 0.5s)
  //   }
  // }
  
  // ★ v8.7.1: Redesigned Progressive carry with minConeDist
  const distToGoal = vdist(me.pos, gc);
  if (distToGoal > 3.0 && !me.isGK) {
    const toGoalDir = vnorm(vsub(gc, me.pos));
    const ax = me.pos.x * (-me.team);
    const w = PExt.pitchHalfW;
    const isPhaseA = ax < (2 * w / 3);
    
    // v8.7.4: Further relaxed carry success rate
    const coneAngle = isPhaseA ? 150 : 160; // Phase A: 150°, Phase B: 160°
    const searchDist = 10.0; // Fixed
    const minConeDist = isPhaseA ? 1.5 : 1.1; // Phase A: 1.5, Phase B: 1.1
    
    let closestInCone = Infinity;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const toOpp = vsub(p.pos, me.pos);
      const dist = vlen(toOpp);
      if (dist > searchDist) continue;
      const angle = vang(toGoalDir, toOpp);
      if (angle < coneAngle / 2) {
        if (dist < closestInCone) closestInCone = dist;
      }
    }
    
    const pathClear = closestInCone >= minConeDist;
    
    if (pathClear) {
      me.act = "carry";
      // v8.7.4: Normal carry distance reduced to 6.5 for stability
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 6.5)));
      me.face = toGoalDir;
      chosenAction = "carry";
      return;
    }
  }
  
  // ★ v8.7.4: Forward progress guarantee - strengthened (0.5s threshold + progress check)
  const ax = me.pos.x * (-me.team); // Attack direction normalized (0 → pitchHalfW)
  const w = PExt.pitchHalfW; // 10.0
  const isPhaseA = ax < (2 * w / 3); // Phase A: advance (ax < 6.66)
  const isPhaseB = ax >= (2 * w / 3); // Phase B: finish (ax >= 6.66)
  
  // ★ Stack resolution: Force long kick when stack detected (HIGHEST PRIORITY)
  if (st.stackDetection.isStacked) {
    const forwardDir = v(-me.team + rng(-0.3, 0.3), rng(-0.5, 0.5));
    const kickTarget = vadd(me.pos, vscl(vnorm(forwardDir), 8.0));
    kick(st, idx, PExt.longPassSpeed, false, pitchClamp(kickTarget), true);
    st.stackDetection.isStacked = false;  // Reset stack after resolution
    st.stackDetection.stableTime = 0;
    if (Math.random() < 0.05) {
      console.log(`[STACK RESOLVED] P${idx} forced long kick to break cluster`);
    }
    return;
  }
  
  // Check if stuck: holdT >= 0.5s AND no progress (ax advance < 0.25)
  const axAdvance = ax - st.ball.holdAX0;
  const isStuck = st.ball.holdT >= 0.5 && axAdvance < 0.25;
  
  if (isStuck) {
    // Stuck for 0.5s with no progress - force forward movement
    const toGoalDir = vnorm(vsub(gc, me.pos));
    
    // Try forced carry with very relaxed minConeDist
    const relaxedMinConeDist = 0.9;
    let closestInCone = Infinity;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const toOpp = vsub(p.pos, me.pos);
      const dist = vlen(toOpp);
      if (dist > 10.0) continue;
      const angle = vang(toGoalDir, toOpp);
      if (angle < 60) { // 120° cone
        if (dist < closestInCone) closestInCone = dist;
      }
    }
    
    if (closestInCone >= relaxedMinConeDist) {
      // Forced carry with extended distance
      me.act = "carry";
      // v8.7.4: Stuck carry distance increased to 8.0
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 8.0)));
      me.face = toGoalDir;
      chosenAction = "carry-forced";
      return;
    } else {
      // Forced forward pass (even if blocked)
      const tgt = bestPass(st, idx);
      if (tgt !== null) {
        doPassTo(st, idx, tgt);
        chosenAction = "pass-forced";
        return;
      }
    }
  }
  
  // ★ v8.7: Phase separation - divide decision-making into Phase A (advance) and Phase B (finish)
  
  // Phase B (finish): Shot-first evaluation
  if (isPhaseB) {
    // ★ v8.7.5: Safety valve - force shot when blocked pass streak >= 3
    if (st.ball.phaseBBlockedPassStreak >= 3 && distToGoal < 8.2) {
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      
      if (angle < 60) {  // Relaxed angle for safety valve
        const err = (1 - PExt.shotAccuracy) * 2.5;
        const t = v(gc.x, gc.y + rng(-err, err));
        kick(st, idx, PExt.shotSpeed, true, t);
        
        // Track forced shot and reset streak
        if (me.team === -1) {
          st.stats.forcedShotsFromBlocked.blue++;
        } else {
          st.stats.forcedShotsFromBlocked.red++;
        }
        st.ball.phaseBBlockedPassStreak = 0;
        
        if (Math.random() < 0.01) {
          console.log(`[FORCED SHOT] P${idx} streak=${st.ball.phaseBBlockedPassStreak} dist=${distToGoal.toFixed(1)}`);
        }
        chosenAction = "shot-forced";
        return;
      }
    }
    
    // v8.7.5: Reverted from 7.0 to 7.5 to fix shot deficiency
    const shouldPrioritizeShot = distToGoal < 7.5;
    
    if (shouldPrioritizeShot) {
      // D-2: Graduated shot conditions based on distance
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      
      let allowedAngle = 45; // default
      if (distToGoal <= 5.0) {
        allowedAngle = 80; // Very close: wide angle
      } else if (distToGoal <= 7.0) {
        allowedAngle = 60; // Close: medium angle
      } else if (distToGoal <= 7.5) {
        allowedAngle = 45; // Medium: narrow angle
      }
      
      if (angle < allowedAngle) {
        const err = (1 - PExt.shotAccuracy) * 2.5;
        const t = v(gc.x, gc.y + rng(-err, err));
        kick(st, idx, PExt.shotSpeed, true, t);
        // v8.7.5: Reset blocked pass streak and track Phase B shot
        st.ball.phaseBBlockedPassStreak = 0;
        if (me.team === -1) {
          st.stats.phaseBShots.blue++;
        } else {
          st.stats.phaseBShots.red++;
        }
        chosenAction = "shot";
        return;
      }
    }
  }
  
  // Phase A (advance): Shot-first is DISABLED - prioritize pass and carry
  
  // Try pass
  const tgt = bestPass(st, idx);
  if (tgt !== null) {
    // v8.7.5: Track blocked passes in Phase B
    if (isPhaseB) {
      const tm = st.pl[tgt];
      const isBlocked = laneBlocked(st, me.pos, tm.pos, me.team);
      if (isBlocked) {
        st.ball.phaseBBlockedPassStreak++;
        if (me.team === -1) {
          st.stats.phaseBBlockedPassCount.blue++;
        } else {
          st.stats.phaseBBlockedPassCount.red++;
        }
      } else {
        // Successful unblocked pass - reset streak
        st.ball.phaseBBlockedPassStreak = 0;
      }
    } else {
      // Phase A - reset streak
      st.ball.phaseBBlockedPassStreak = 0;
    }
    
    doPassTo(st, idx, tgt);
    return;
  }
  
  // Try long pass
  const ltgt = bestLongPass(st, idx);
  if (ltgt !== null) {
    // v8.7.5: Reset blocked pass streak on long pass
    st.ball.phaseBBlockedPassStreak = 0;
    doLongPassTo(st, idx, ltgt);
    return;
  }
  
  // Fallback shot: only in Phase A with extreme conditions (accidental breakaway)
  if (isPhaseA && distToGoal < 5.0) {
    const toGoal = vsub(gc, me.pos);
    const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
    if (angle < 80) {
      const err = (1 - PExt.shotAccuracy) * 2.5;
      const t = v(gc.x, gc.y + rng(-err, err));
      kick(st, idx, PExt.shotSpeed, true, t);
      // v8.7.5: Reset blocked pass streak on shot
      st.ball.phaseBBlockedPassStreak = 0;
      // Track Phase B shot
      if (isPhaseB) {
        if (me.team === -1) {
          st.stats.phaseBShots.blue++;
        } else {
          st.stats.phaseBShots.red++;
        }
      }
      return;
    }
  }
  
  // Cross if near sideline
  if (Math.abs(me.pos.y) > 4.5 && me.team * me.pos.x < -2.0) {
    doCross(st, idx);
    return;
  }
  
  // Fallback: dribble
  chosenAction = "dribble";
  doDribble(st, idx);
  
  // ★ v8.7.1: Log decision result
  if (shouldLog) {
    const ax = me.pos.x * (-me.team);
    const w = PExt.pitchHalfW;
    const phase = ax < (2 * w / 3) ? "A" : "B";
    console.log(`[DECIDE] t=${st.time.toFixed(1)} P${idx}(${me.team === -1 ? 'B' : 'R'}) ${me.role}${me.isGK ? '-GK' : ''} ax=${ax.toFixed(1)} phase=${phase} action=${chosenAction} tgt=${targetIdx}`);
  }
}

export function decideNoBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * PExt.pitchHalfW, 0);
  
  const b = st.ball;
  const ballOwner = b.owner !== null ? st.pl[b.owner] : null;
  const myTeamHasBall = ballOwner && ballOwner.team === me.team;
  
  // ★ Stack dispersion: Force players away from clustered ball area (HIGHEST PRIORITY)
  if (st.stackDetection.isStacked && !me.isGK) {
    const distToBall = vlen(vsub(b.pos, me.pos));
    if (distToBall < 3.0) {
      // Player is in clustered area - move away radially
      const awayDir = vnorm(vsub(me.pos, b.pos));
      const disperseTarget = vadd(b.pos, vscl(awayDir, 4.0 + Math.random() * 2.0));
      me.tgt = pitchClamp(disperseTarget);
      me.face = awayDir;
      return;
    }
  }
  
  // ★ v8.7.4: Counter-press - immediate ball recovery after turnover (HIGHEST PRIORITY)
  if (st.turnoverT > 0 && me.team === st.turnoverTeam && !me.isGK) {
    // Team just lost possession - all outfield players press ball immediately
    const distToBall = vlen(vsub(b.pos, me.pos));
    if (distToBall > 0.8) {
      // Move towards ball (avoid clustering)
      me.tgt = pitchClamp(b.pos);
      me.face = vnorm(vsub(b.pos, me.pos));
      return;
    } else {
      // Too close - stop to avoid collision
      me.tgt = me.pos;
      return;
    }
  }
  
  if (myTeamHasBall) {
    // ★ v8.3: GK+1 buildup, dynamic stagger (3-1/3-2), Rest Defence
    const carrier = ballOwner;
    const targetGoalX = -me.team * PExt.pitchHalfW;
    const isOwnHalf = (carrier.pos.x * me.team) > 0;
    let baseTgt = v(me.home.x, me.home.y);

    // ① GK's +1 buildup participation
    if (me.isGK) {
      if (isOwnHalf) {
        // During own-half buildup, position in penalty area between CBs as "back +1"
        baseTgt = v(me.team * (PExt.pitchHalfW - 3.5), carrier.pos.y * 0.3);
      } else {
        // When pushed into opponent half, maintain high line (sweeper keeper)
        baseTgt = v(me.team * (PExt.pitchHalfW - 6.0), 0);
      }
    }
    // ② FWD role division (pin and drop)
    else if (me.role === "FWD") {
      if (me.idx % 2 === 0) {
        // Dropping FW (False 9): Pull ball between opponent lines
        baseTgt = vlerp(me.pos, carrier.pos, 0.45);
      } else {
        // Pinning FW: Pin opponent CBs, always target depth (behind)
        baseTgt = v(targetGoalX * 0.85, me.home.y * 0.5);
      }
    }
    // ③ CM's dynamic stagger (段差) and 3-1/3-2 formation
    else if (me.role === "MID" && Math.abs(me.home.y) <= 3.0) {
      // Bug fix B: Use nearestEx instead of nearest with 4 args
      const isClosestCM = nearestEx(st, carrier.pos, me.team, carrier.idx) === me.idx;
      if (isOwnHalf && isClosestCM) {
        // During own-half buildup, CM closest to ball drops to CB line to form "3-1" pivot
        baseTgt = v(carrier.pos.x + me.team * 2.0, carrier.pos.y > 0 ? 2.0 : -2.0);
      } else {
        // Other CM takes high position as link man (vertical pass outlet)
        baseTgt = v(carrier.pos.x - me.team * 5.0, me.home.y);
      }
    }
    // ④ Wide MF (WM) half-space invasion
    else if (me.role === "MID" && Math.abs(me.home.y) > 3.0) {
      // Always tuck inside, occupy opponent's half-space
      baseTgt = v(carrier.pos.x - me.team * 3.0, Math.sign(me.home.y) * 2.5);
    }
    // ⑤ SB and CB's Rest Defence (2-3/3-2 remaining defense)
    else if (me.role === "DEF") {
      if (Math.abs(me.home.y) > 3.0) {
        const isBallSide = (carrier.pos.y * me.home.y) > 0;
        if (isBallSide) {
          // Ball-side SB provides width, outlet for progression
          baseTgt = v(carrier.pos.x - me.team * 3.0, Math.sign(me.home.y) * 5.5);
        } else {
          // ★ Far-side SB doesn't push up, tucks inside to form "3-back" against counters (Rest Defence)
          baseTgt = v(carrier.pos.x + me.team * 4.0, Math.sign(me.home.y) * 2.0);
        }
      } else {
        // CB: Always support below (diagonally behind) ball while managing risk
        baseTgt = v(carrier.pos.x + me.team * 5.0, me.home.y * 0.5);
      }
    }

    // --- Dynamic pass lane creation (Hide & Show) ---
    const carrierFacingBack = (carrier.face.x * me.team) > 0;
    if (!carrierFacingBack && !me.isGK && (me.pos.x * -me.team) > (carrier.pos.x * -me.team)) {
      const dirToMe = vnorm(vsub(baseTgt, carrier.pos));
      let isShadowed = false;
      const enemies = st.pl.filter(e => e.team !== me.team);
      
      for (const e of enemies) {
        const toEnemy = vsub(e.pos, carrier.pos);
        const dot = toEnemy.x * dirToMe.x + toEnemy.y * dirToMe.y;
        if (dot > 0 && dot < vlen(vsub(baseTgt, carrier.pos))) {
          const proj = vadd(carrier.pos, vscl(dirToMe, dot));
          if (vdist(e.pos, proj) < 1.5) {
            isShadowed = true;
            break;
          }
        }
      }
      if (isShadowed) {
        const perpDir = v(-dirToMe.y, dirToMe.x);
        const shiftAmount = me.pos.y > 0 ? -2.0 : 2.0;
        baseTgt = vadd(baseTgt, vscl(perpDir, shiftAmount));
      }
    }

    // --- Phase 5.5: Off-the-Ball Movement (minimal, safe) ---
    if (!me.isGK && (me.role === "MID" || me.role === "FWD")) {
      me.burstCD = Math.max(0, (me.burstCD ?? 0) - P.decisionInterval);

      const carrier = ballOwner!;
      const attackDir = -me.team;

      const iAmAhead = (me.pos.x - carrier.pos.x) * attackDir > 0.6;
      const dToCarrier = vdist(me.pos, carrier.pos);
      const inRange = dToCarrier >= 3.0 && dToCarrier <= 14.0;

      if (iAmAhead && inRange && me.burstCD <= 0) {
        const blocked = laneBlocked(st, carrier.pos, me.pos, me.team);
        if (blocked) {
          // shift along perpendicular direction to open a new lane
          const dir = vnorm(vsub(me.pos, carrier.pos));
          const perp = v(-dir.y, dir.x);

          // E-1: Increase shift to 2.2 for stronger lateral movement
          const shift = 2.2; // Increased from 1.9 to create more space
          const cand1 = pitchClamp(vadd(baseTgt, vscl(perp,  shift)));
          const cand2 = pitchClamp(vadd(baseTgt, vscl(perp, -shift)));

          const ok1 = !laneBlocked(st, carrier.pos, cand1, me.team);
          const ok2 = !laneBlocked(st, carrier.pos, cand2, me.team);

          if (ok1 || ok2) {
            // choose better one: prefer more open + more forward
            const score = (tp: V) => {
              const gp = (tp.x - carrier.pos.x) * attackDir;
              // reuse "openness" by creating a temporary player-like evaluation:
              // simplest: use nearest opponent distance to the point
              let minD = Infinity;
              for (const opp of st.pl) if (opp.team !== me.team) minD = Math.min(minD, vdist(tp, opp.pos));
              const open = Math.min(minD / 3.0, 1.0);
              return gp * 1.5 + open * 2.5;
            };
            const pick = (ok1 && ok2) ? (score(cand1) >= score(cand2) ? cand1 : cand2) : (ok1 ? cand1 : cand2);

            baseTgt = pick;
            // E-2: Reduce cooldown from 1.0 to 0.8 for more frequent movement
            me.burstCD = 0.8;
          } else {
            // E-2: Reduce failure cooldown from 0.6 to 0.5
            me.burstCD = 0.5;
          }
        }
      }
    }
    // --- end Phase 5.5 ---

    me.tgt = pitchClamp(baseTgt);
    me.act = "move";
    return;
  } else {
    // ★ Fix: Prevent ball-swarming behavior
    const ballPos = b.free ? b.pos : (ballOwner ? ballOwner.pos : b.pos);
    const distToBall = vdist(me.pos, ballPos);
    
    // GK: Stay home
    if (me.isGK) {
      me.act = "move";
      me.tgt = { ...me.home };
      return;
    }
    
    // Free ball: Only closest player chases
    if (b.free) {
      if (distToBall < 12.0) {
        const myTeamClosest = nearest(st, b.pos, me.team);
        if (myTeamClosest === idx) {
          me.act = "move";
          me.tgt = ballPos;
          return;
        }
      }
      // Others: Shift home position slightly toward ball
      me.act = "move";
      me.tgt = vlerp(me.home, ballPos, 0.15);
      return;
    }
    
    // Enemy has ball: Press or block
    if (ballOwner && ballOwner.team !== me.team) {
      if (me.role === "FWD" && distToBall < 5.0) {
        // FWD: Press aggressively
        me.act = "move";
        me.tgt = vlerp(ballPos, v(me.team * PExt.pitchHalfW, 0), 0.1);
      } else if (me.role === "MID" && distToBall < 4.5) {
        // MID: Press moderately
        me.act = "move";
        me.tgt = vlerp(ballPos, v(me.team * PExt.pitchHalfW, 0), 0.15);
      } else {
        // Others: Maintain formation with slight shift
        const shiftX = clamp((ballPos.x - me.home.x) * 0.5, -2.5, 2.5);
        const shiftY = clamp((ballPos.y - me.home.y) * 0.5, -3.0, 3.0);
        me.act = "move";
        me.tgt = v(me.home.x + shiftX, me.home.y + shiftY);
      }
      return;
    }
    
    // Default: Return to home
    me.act = "move";
    me.tgt = { ...me.home };
  }
}

export function triggerFoul(st: State, fouledIdx: number, foulerIdx: number) {
  // Foul logic - simplified for now
  st.paused = true;
  st.pauseT = PExt.foulPause;
  st.flash = 0.8;
  st.flashTxt = "FOUL";
}

export function doKickOff(st: State, side?: number) {
  if (side !== undefined) st.koSide = side;
  for (let i = 0; i < st.pl.length; i++) {
    st.pl[i].pos = { ...st.pl[i].home };
    st.pl[i].vel = v(0, 0);  // Phase 5: Reset velocity
    st.pl[i].act = "idle";
    st.pl[i].tgt = { ...st.pl[i].home };
    st.pl[i].face = v(-st.pl[i].team, 0);
    // ★ Fix: Randomize decision timers to prevent simultaneous AI decisions
    st.pl[i].dt = Math.random() * PExt.decisionInterval;
    st.pl[i].turnDebt = 0;  // Phase 5: Reset turn debt
    st.pl[i].staminaShort = 1;  // Phase 5: Reset stamina
  }
  st.ball.pos = v(0, 0);
  st.ball.vel = v(0, 0);
  st.ball.free = true;
  st.ball.owner = null;
  st.ball.cooldown = PExt.restartNoIntercept;
  st.ball.dead = 0;
  st.trail = null;
  
  // Give ball to nearest player on kickoff side
  const takerIdx = nearest(st, v(0, 0), st.koSide);
  if (takerIdx !== -1) {
    st.ball.owner = takerIdx;
    st.ball.free = false;
    st.pl[takerIdx].pos = v(-st.koSide * 0.2, 0);
  }
}

function stopForSetPiece(st: State, kind: "THROWIN" | "CORNER" | "GOALKICK", team: number, pos: V) {
  // Debug logging for statistics verification
  if (typeof console !== 'undefined' && console.log) {
    console.log(`[SETPIECE] ${kind} team=${team} pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)}) lastTouch=${st.ball.lastTouchTeam} lastKick=${st.ball.lastKickType}`);
  }
  
  st.paused = true;
  st.pauseT = PExt.restartPause;
  st.setPieceRestart = { kind, team, pos };
  st.ball.free = false;
  st.ball.vel = v(0, 0);
  st.ball.owner = null;
  st.ball.cooldown = PExt.restartNoIntercept;
}

function runSetPiece(st: State) {
  const sp = st.setPieceRestart!;
  const taker = nearestOutfield(st, sp.pos, sp.team);
  if (taker === -1) return;

  st.pl[taker].pos = pitchClamp(sp.pos);
  st.pl[taker].tgt = { ...st.pl[taker].pos };
  st.pl[taker].act = "idle";
  st.pl[taker].face = v(-sp.team, 0);

  give(st.ball, taker, st.pl, st);
  st.ball.cooldown = PExt.restartNoIntercept;
}

export function startThrowIn(st: State, throwerIdx: number, targetPos: V) {
  // Throw-in logic - simplified
  st.paused = true;
  st.pauseT = PExt.restartPause;
}

export function update(st: State, dt: number) {
  if (st.over) return;
  
  // Time
  st.time += dt;
  if (st.time >= P.matchDuration) {
    st.over = true;
    return;
  }
  
  // Speed multiplier
  const speedMul = st.speed === "LOW" ? 0.5 : st.speed === "FAST" ? 2.0 : 1.0;
  dt *= speedMul;
  
  // Flash
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 2);
  
  // Pause
  if (st.paused) {
    st.pauseT -= dt;
    if (st.pauseT <= 0) {
      st.paused = false;

      if (st.setPieceRestart) {
        runSetPiece(st);
        st.setPieceRestart = null;
      } else {
        doKickOff(st);
      }
    }
    return;
  }
  
  // Trail
  if (st.trail) {
    st.trail.t -= dt;
    if (st.trail.t <= 0) st.trail = null;
  }
  
  // ★ v8.7.4: Counter-press timer decrement
  if (st.turnoverT > 0) {
    st.turnoverT = Math.max(0, st.turnoverT - dt);
  }
  
  // ★ Stack detection: Check if ball is stuck in same position
  const ballMoveDist = vdist(st.ball.pos, st.stackDetection.lastBallPos);
  if (ballMoveDist < 0.5) {
    // Ball hasn't moved much
    st.stackDetection.stableTime += dt;
    if (st.stackDetection.stableTime > 2.0) {
      // Ball stuck for 2+ seconds - stack detected
      st.stackDetection.isStacked = true;
    }
  } else {
    // Ball moved - reset
    st.stackDetection.stableTime = 0;
    st.stackDetection.isStacked = false;
    st.stackDetection.lastBallPos = { ...st.ball.pos };
  }
  
  // ★ v8.7.4: Track attacking third possession streaks
  let b = st.ball;
  if (b.owner !== null) {
    const owner = st.pl[b.owner];
    const ax = b.pos.x * (-owner.team);
    const w = PExt.pitchHalfW;
    const isAttThird = ax >= (2 * w / 3);  // ax >= 6.66
    const isPhaseB = ax >= (2 * w / 3);  // Phase B: ax >= 6.66
    
    if (isAttThird) {
      // In attacking third - accumulate frames
      if (owner.team === -1) {
        st.stats.attPossStreakFrames.blue++;
      } else {
        st.stats.attPossStreakFrames.red++;
      }
    }
    
    // ★ v8.7.5: Track Phase B eligible frames (distToGoal < 7.5)
    if (isPhaseB) {
      const gc = v(-owner.team * PExt.pitchHalfW, 0);
      const distToGoal = vdist(owner.pos, gc);
      if (distToGoal < 7.5) {
        if (owner.team === -1) {
          st.stats.phaseBEligibleFrames.blue++;
        } else {
          st.stats.phaseBEligibleFrames.red++;
        }
      }
    }
  }
  
  // Set piece animation
  if (st.setPiece) {
    st.setPiece.timer += dt;
    // Set piece logic omitted for brevity
    return;
  }
  
  b = st.ball;  // Re-assign for clarity
  
  // A. AI decisions
  // ★ v8.7.7 Patch 1: Randomize evaluation order to eliminate index bias
  const evalOrder = Array.from({length: st.pl.length}, (_, i) => i);
  for (let i = evalOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [evalOrder[i], evalOrder[j]] = [evalOrder[j], evalOrder[i]];
  }
  
  for (const i of evalOrder) {
    const p = st.pl[i];
    p.dt -= dt;
    if (p.dt <= 0) {
      p.dt = PExt.decisionInterval;
      if (b.owner === i) {
        decideHasBall(st, i);
      } else {
        decideNoBall(st, i);
      }
    }
  }
  
  // B. Ball physics
  if (b.free) {
    // Free ball movement
    b.pos = vadd(b.pos, vscl(b.vel, dt));
    
    // Friction
    const fric = b.lob > 0 ? 0.98 : 0.92;
    b.vel = vscl(b.vel, Math.pow(fric, dt * 60));
    
    // Lob decay
    if (b.lob > 0) {
      b.lob = Math.max(0, b.lob - dt * 1.5);
    }
    
    // Dead ball
    if (vlen(b.vel) < 0.1) {
      b.dead += dt;
      if (b.dead > 0.5) {
        b.vel = v(0, 0);
      }
    } else {
      b.dead = 0;
    }
    
    // Cooldown
    if (b.cooldown > 0) {
      b.cooldown -= dt;
    }
    
    // Interception - find closest player within radius
    // ★ v8.7.7 Patch 2: Add coin-flip tie-breaking for same-distance players
    if (b.cooldown <= 0) {
      let closestIdx = -1;
      let minD = PExt.interceptRadius;
      
      for (let i = 0; i < st.pl.length; i++) {
        const p = st.pl[i];
        const d = vdist(p.pos, b.pos);
        
        // Update if this player is closer
        if (d < minD) {
          minD = d;
          closestIdx = i;
        }
        // Tie-breaking: if same distance (within 0.1mm), coin flip
        else if (Math.abs(d - minD) < 0.0001) {
          if (Math.random() < 0.5) {
            closestIdx = i;
          }
        }
      }
      
      // Give ball to the closest player found
      if (closestIdx !== -1) {
        give(b, closestIdx, st.pl, st);
      }
    }
    
    // GK save
    if (PExt.gkSaveEnabled && b.shot) {
      const defTeam = b.lastTouchTeam === -1 ? 1 : -1;
      const gkIdx = findGK(st, defTeam);
      if (gkIdx !== -1) {
        const gk = st.pl[gkIdx];
        const distToGK = vdist(b.pos, gk.pos);
        if (distToGK < PExt.gkSaveRadius) {
          const gc = v(defTeam * PExt.pitchHalfW, 0);
          const toGoal = vsub(gc, b.pos);
          const toBall = vsub(b.pos, gk.pos);
          const angle = vang(toGoal, toBall);
          const angleBonus = (1 - angle / 180) * PExt.gkSaveAngleBonus;
          const saveChance = PExt.gkSaveBase + angleBonus;
          
          if (Math.random() < saveChance) {
            if (Math.random() < PExt.gkParryChance) {
              // Parry
              const parryDir = vnorm(vsub(b.pos, gk.pos));
              b.vel = vscl(parryDir, PExt.shotSpeed * 0.4);
              b.shot = false;
              b.cooldown = PExt.gkHoldCooldown;
            } else {
              // Catch
              give(b, gkIdx, st.pl, st);
              b.cooldown = PExt.gkHoldCooldown;
            }
          }
        }
      }
    }
    
    // 1) Touchline out => throw-in
    if (PExt.outEnabled && Math.abs(b.pos.y) >= PExt.pitchHalfH) {
      const outY = Math.sign(b.pos.y) * PExt.pitchHalfH;
      const outX = clamp(b.pos.x, -PExt.pitchHalfW, PExt.pitchHalfW);
      const restartTeam = -b.lastTouchTeam;

      st.stats.throwIns += 1;

      // Pass miss detection
      const byPassMiss =
        (b.lastKickTeam === b.lastTouchTeam) &&
        (b.lastKickType === "PASS" || b.lastKickType === "LONG");
      if (byPassMiss) st.stats.throwInsFromPassMiss += 1;

      stopForSetPiece(st, "THROWIN", restartTeam, v(outX, outY));
      return;
    }

    // 2) Goal-line out (not a goal) => corner or goal kick
    if (PExt.outEnabled && Math.abs(b.pos.x) >= PExt.pitchHalfW && Math.abs(b.pos.y) > PExt.goalHalfH) {
      const outX = Math.sign(b.pos.x) * PExt.pitchHalfW;
      const outY = clamp(b.pos.y, -PExt.pitchHalfH, PExt.pitchHalfH);

      const goalSide = Math.sign(b.pos.x);
      const defendingTeam = goalSide;
      const last = b.lastTouchTeam;

      if (last === defendingTeam) {
        // defender touched last => corner for attackers
        st.stats.corners += 1;
        const restartTeam = -defendingTeam;

        const cornerY = Math.sign(outY) * (PExt.pitchHalfH - 0.5);
        const cornerX = outX - goalSide * 0.5;
        stopForSetPiece(st, "CORNER", restartTeam, v(cornerX, cornerY));
        return;
      } else {
        // attacker touched last => goal kick for defenders
        const restartTeam = defendingTeam;
        const gkX = goalSide * (PExt.pitchHalfW - 3.0);
        stopForSetPiece(st, "GOALKICK", restartTeam, v(gkX, 0));
        return;
      }
    }
    
    // 3) Goal check
    const g = checkGoal(b.pos);
    if (g !== 0) {
      // Own goal detection
      const goalSide = Math.sign(b.pos.x);
      const concedingTeam = goalSide;
      if (b.lastTouchTeam === concedingTeam) {
        st.stats.ownGoals += 1;
      }
      
      if (g === -1) st.sR++;
      else st.sL++;
      st.flash = 1.0;
      st.flashTxt = "GOAL!";
      st.koSide = g;  // Fixed: scoring team's opponent gets kickoff
      doKickOff(st);
      return;
    }
  } else {
    // Ball follows owner
    if (b.owner !== null) {
      b.pos = { ...st.pl[b.owner].pos };
      // ★ v8.7.1: Track hold time for safety valve
      b.holdT += dt;
      
      // ★ v8.7.4: Turnover detection (owner team changed)
      const currentOwnerTeam = st.pl[b.owner].team;
      if (b.lastTouchTeam !== 0 && b.lastTouchTeam !== currentOwnerTeam) {
        // Turnover detected: ball changed teams
        st.turnoverT = 1.2;  // 1.2s counter-press window
        st.turnoverTeam = b.lastTouchTeam;  // Team that lost possession
      }
      b.lastTouchTeam = currentOwnerTeam;
    } else {
      b.holdT = 0;
    }
  }
  
  // ★ v8.7.4: Decrement turnover timer
  if (st.turnoverT > 0) {
    st.turnoverT -= dt;
    if (st.turnoverT < 0) {
      st.turnoverT = 0;
      st.turnoverTeam = 0;
    }
  }
  
  // C. Player movement (Phase 5: Replace with inertia + stamina)
  for (const p of st.pl) {
    const desired = vsub(p.tgt, p.pos);
    const dist = vlen(desired);
    
    let maxSpeed = P.moveSpeed;
    if (p.act === "dribble") maxSpeed = P.dribbleSpeed;
    if (p.act === "carry") maxSpeed = P.dribbleSpeed * 1.2;
    
    // 1) Short-term stamina update
    const sprintThreshold = maxSpeed * 0.85;
    const curSpeed = vlen(p.vel);
    const isSprinting = curSpeed > sprintThreshold;
    
    const shortDrain = 0.35;
    const shortRecover = 0.55;
    p.staminaShort = clamp01(p.staminaShort + (isSprinting ? -shortDrain : shortRecover) * dt);
    
    // 2) Stamina effects
    const minAccFactor = 0.65;
    const minSpeedFactor = 0.85;
    const accFactor = vlerp(v(minAccFactor, 0), v(1, 0), p.staminaShort).x;
    const spdFactor = vlerp(v(minSpeedFactor, 0), v(1, 0), p.staminaShort).x;
    
    let maxSpeedEff = maxSpeed * spdFactor;
    
    // 3) Turn inertia (turnDebt)
    const turnAdd = 1.2;
    const turnRecover = 1.5;
    const turnMaxPenalty = 0.6;
    
    if (dist > 0.01) {
      const desiredDir = vnorm(desired);
      const moveDir = (curSpeed > 0.01) ? vnorm(p.vel) : desiredDir;
      const dot = clamp(vdot(moveDir, desiredDir), -1, 1);
      const angle = Math.acos(dot); // 0..PI
      
      p.turnDebt = clamp01(p.turnDebt + (angle / Math.PI) * turnAdd * dt);
      p.turnDebt = clamp01(p.turnDebt - (turnRecover * p.staminaShort) * dt);
    }
    maxSpeedEff *= (1 - p.turnDebt * turnMaxPenalty);
    
    // 4) Acceleration and velocity update
    const acc = 8.0 * accFactor;
    
    let desiredVel = v(0, 0);
    if (dist > 0.01) {
      desiredVel = vscl(vnorm(desired), maxSpeedEff);
    }
    
    const dv = vsub(desiredVel, p.vel);
    const dvLen = vlen(dv);
    if (dvLen > 0.0001) {
      const dvStep = Math.min(dvLen, acc * dt);
      p.vel = vadd(p.vel, vscl(vnorm(dv), dvStep));
    }
    
    // 5) Position update
    p.pos = vadd(p.pos, vscl(p.vel, dt));
    
    // Target proximity: decelerate to prevent oscillation
    if (dist < 0.2) {
      p.vel = vscl(p.vel, 0.5);
    }
    
    // Update face direction
    if (vlen(p.vel) > 0.1) {
      p.face = vnorm(p.vel);
    }
  }
}
