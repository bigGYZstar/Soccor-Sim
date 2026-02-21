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
      pos: { ...home }, team: -1, num: i + 1, home, face: v(1, 0),
      act: "idle", tgt: { ...home }, dt: 0, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
    });
  }
  for (let i = 0; i < 11; i++) {
    const home = FORM_442_RED[i];
    pl.push({
      pos: { ...home }, team: 1, num: i + 1, home, face: v(-1, 0),
      act: "idle", tgt: { ...home }, dt: 0, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
    });
  }
  return pl;
}

export function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: true, shot: false, dead: 0, cooldown: 0, lob: 0, lastTouchTeam: 0 },
    sL: 0, sR: 0, time: 0, over: false, paused: false, pauseT: 0, koSide: -1,
    trail: null, flash: 0, flashTxt: "", restartT: 0,
    speed: "MID",
    setPiece: null,
    atkLevelBlue: 5,
    atkLevelRed: 5,
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

export function give(ball: Ball, idx: number, pl: Player[]) {
  ball.owner = idx; ball.free = false; ball.shot = false;
  ball.pos = { ...pl[idx].pos }; ball.vel = v(0, 0);
  ball.lastTouchTeam = pl[idx].team;
  ball.lob = 0;
}

export function kick(st: State, dir: V, spd: number, shot: boolean, tgt: V, isLong: boolean = false, customErr?: number) {
  const b = st.ball;
  const kicker = b.owner !== null ? st.pl[b.owner] : null;
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
  
  st.trail = { start: { ...b.pos }, end: finalTarget, shot, longPass: isLong, t: PExt.trailDuration };
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(vnorm(vsub(finalTarget, b.pos)), spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0;
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
    if (vdist(closest, opp.pos) < 0.8) return true;
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
    if (laneBlocked(st, me.pos, tm.pos, me.team)) score -= 4.0;
    if (isOffside(st, tm, me.pos)) score -= 100;
    
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
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, PExt.passSpeed, false, tp, false, baseErr);
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
  const err = (1 - PExt.longPassAccuracy) * 2.5;
  // v7.2: Remove pre-kick error - let kick() handle all error calculation
  me.face = vnorm(vsub(tp, me.pos));
  kick(st, me.face, PExt.longPassSpeed, false, tp, true, err);
}

export function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  if (Math.random() > PExt.dribbleControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, fd, 3, false, vadd(me.pos, vscl(fd, 2)));
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
    me.face = vnorm(vsub(tp, me.pos));
    kick(st, me.face, PExt.longPassSpeed * 1.1, false, tp, true, err);
  }
}

export function decideHasBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * PExt.pitchHalfW, 0);
  
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
  
  // ★ v7.0: CB baiting - stand still in own half to draw press
  if (me.role === "DEF" && me.team * me.pos.x > 0) {
    let closestEnemy = Infinity;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const d = vdist(me.pos, p.pos);
      if (d < closestEnemy) closestEnemy = d;
    }
    
    if (closestEnemy > 4.5) {
      me.act = "idle";
      me.tgt = { ...me.pos };
      return; // Stand still to bait press
    }
  }
  
  // Progressive carry check
  const distToGoal = vdist(me.pos, gc);
  if (distToGoal > 3.0 && !me.isGK) {
    const toGoalDir = vnorm(vsub(gc, me.pos));
    const searchDist = 4.0;
    const coneAngle = 60;
    
    let pathClear = true;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const toOpp = vsub(p.pos, me.pos);
      const dist = vlen(toOpp);
      if (dist > searchDist) continue;
      const angle = vang(toGoalDir, toOpp);
      if (angle < coneAngle / 2) {
        pathClear = false;
        break;
      }
    }
    
    if (pathClear) {
      me.act = "carry" as any; // ★ Use "carry" state instead of "dribble" to enable lock
      me.face = toGoalDir;
      kick(st, toGoalDir, PExt.dribbleSpeed * 1.2, false, me.tgt);
      return;
    }
  }
  
  // Try pass first
  const tgt = bestPass(st, idx);
  if (tgt !== null) {
    doPassTo(st, idx, tgt);
    return;
  }
  
  // Try long pass
  const ltgt = bestLongPass(st, idx);
  if (ltgt !== null) {
    doLongPassTo(st, idx, ltgt);
    return;
  }
  
  // Try shot
  if (distToGoal < PExt.shotRange) {
    const toGoal = vsub(gc, me.pos);
    const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
    if (angle < PExt.shotAngle) {
      const err = (1 - PExt.shotAccuracy) * 2.5;
      const t = v(gc.x, gc.y + rng(-err, err));
      me.face = vnorm(vsub(t, me.pos));
      kick(st, me.face, PExt.shotSpeed, true, t);
      return;
    }
  }
  
  // Cross if near sideline
  if (Math.abs(me.pos.y) > 4.5 && me.team * me.pos.x < -2.0) {
    doCross(st, idx);
    return;
  }
  
  // Fallback: dribble
  doDribble(st, idx);
}

export function decideNoBall(st: State, idx: number) {
  const me = st.pl[idx];
  const gc = v(-me.team * PExt.pitchHalfW, 0);
  
  const b = st.ball;
  const ballOwner = b.owner !== null ? st.pl[b.owner] : null;
  const myTeamHasBall = ballOwner && ballOwner.team === me.team;
  
  if (myTeamHasBall) {
    // ★ v7.0: Asymmetric 3-2-5 tactical positioning
    const carrier = ballOwner;
    const isCarrying = carrier && (carrier.act === "dribble" || (carrier.act as any) === "carry");
    
    if (me.role === "FWD") {
      if (me.slot === 9) {
        // Left FW: Drop down (False 9)
        const dropTarget = v(me.home.x + 2.0, me.home.y);
        me.act = "move";
        me.tgt = dropTarget;
      } else {
        // Right FW: Pin high
        me.act = "move";
        me.tgt = v(me.home.x - 3.0, me.home.y);
      }
      
      // Diagonal runs when carrier is dribbling
      if (isCarrying) {
        const penaltyBoxX = -me.team * (PExt.pitchHalfW - PExt.penAreaW);
        const diagonalTarget = v(penaltyBoxX, me.pos.y * 0.85);
        me.tgt = diagonalTarget;
      }
    } else if (me.role === "MID") {
      // Squeeze into half-space (±2.5)
      const halfSpaceY = me.home.y > 0 ? 2.5 : -2.5;
      me.act = "move";
      me.tgt = v(me.home.x, halfSpaceY);
      
      // Show for pass if ahead of ball
      if ((me.pos.x - carrier.pos.x) * -me.team > 0) {
        me.tgt = vadd(me.pos, v(-me.team * 5.0, halfSpaceY > 0 ? 4.0 : -4.0));
      }
    } else if (me.role === "DEF") {
      if (me.slot === 3) {
        // Left SB: High position (winger)
        me.act = "move";
        me.tgt = v(me.home.x - 6.0, me.home.y);
      } else if (me.slot === 4) {
        // Right SB: Low position (3-back)
        me.act = "move";
        me.tgt = v(me.home.x + 3.0, me.home.y);
      } else {
        // CBs: Stagger
        const stagger = me.slot === 1 ? -1.0 : 1.0;
        me.act = "move";
        me.tgt = v(me.home.x + stagger, me.home.y);
      }
    } else {
      // GK: Stay home
      me.act = "move";
      me.tgt = { ...me.home };
    }
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

export function doKickOff(st: State) {
  for (let i = 0; i < st.pl.length; i++) {
    st.pl[i].pos = { ...st.pl[i].home };
    st.pl[i].act = "idle";
    st.pl[i].tgt = { ...st.pl[i].home };
    st.pl[i].face = v(-st.pl[i].team, 0);
    // ★ Fix: Randomize decision timers to prevent simultaneous AI decisions
    st.pl[i].dt = Math.random() * PExt.decisionInterval;
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

export function startThrowIn(st: State, throwerIdx: number, targetPos: V) {
  // Throw-in logic - simplified
  st.paused = true;
  st.pauseT = PExt.throwInAnimDur;
}

export function startCornerKick(st: State, kickerIdx: number, targetPos: V) {
  // Corner kick logic - simplified
  st.paused = true;
  st.pauseT = PExt.cornerAnimDur;
}

export function updateSetPiece(st: State, dtSim: number) {
  // Set piece animation logic - simplified
}

export const update = (st: State, dt: number) => {
  // --- 1. 演出とマッチコントロール ---
  if (st.flash > 0) st.flash -= dt;

  if (st.over) {
    st.restartT -= dt;
    if (st.restartT <= 0) {
       Object.assign(st, mkState());
       doKickOff(st);
    }
    return;
  }

  if (st.paused) {
    st.pauseT -= dt;
    if (st.pauseT <= 0) {
      st.paused = false;
      doKickOff(st);
    }
    return;
  }

  st.time += dt;
  if (st.time >= P.matchDuration) {
    st.over = true;
    st.flash = 2.5;
    st.flashTxt = "FULL TIME";
  }

  st.ball.cooldown = Math.max(0, st.ball.cooldown - dt);
  if (st.trail) {
    st.trail.t -= dt;
    if (st.trail.t <= 0) st.trail = null;
  }

  // --- 2. デッドボールの自動回収 ---
  if (st.ball.owner === null && !st.ball.free) st.ball.free = true;
  if (st.ball.free && vlen(st.ball.vel) < 0.5) {
    st.ball.dead += dt;
    if (st.ball.dead > P.deadBallTime) {
      const idx = nearest(st, st.ball.pos);
      st.ball.owner = idx;
      st.ball.free = false;
      st.ball.dead = 0;
    }
  } else {
    st.ball.dead = 0;
  }

  // --- 3. ボールの物理演算 ---
  if (st.ball.free) {
    st.ball.pos = vadd(st.ball.pos, vscl(st.ball.vel, dt));
    const spd = vlen(st.ball.vel);
    if (spd > 0) {
      const newSpd = Math.max(0, spd - P.looseBallDrag * dt);
      st.ball.vel = vscl(st.ball.vel, newSpd / spd);
    }
    
    // 壁反射とゴール判定
    const b = st.ball;
    if (Math.abs(b.pos.y) > P.pitchHalfH) {
      b.pos.y = Math.sign(b.pos.y) * P.pitchHalfH;
      b.vel.y *= -0.4;
    }
    if (Math.abs(b.pos.x) > P.pitchHalfW) {
      if (Math.abs(b.pos.y) <= P.goalHalfH) {
         if (b.pos.x > 0) { st.sL++; st.flashTxt="GOAL!"; st.koSide = -1; }
         else { st.sR++; st.flashTxt="GOAL!"; st.koSide = 1; }
         st.paused = true;
         st.pauseT = P.goalResetDelay;
         st.flash = 1.8;
      } else {
        b.pos.x = Math.sign(b.pos.x) * P.pitchHalfW;
        b.vel.x *= -0.4;
      }
    }
  } else if (st.ball.owner !== null) {
    // 保持中は選手の足元に追従
    const p = st.pl[st.ball.owner];
    st.ball.pos = vadd(p.pos, vscl(p.face, 0.22));
    st.ball.vel = v(0,0);
  }

  // --- 4. プレイヤーループ (★これが抜けていました！) ---
  st.pl.forEach((p, idx) => {
    // A. インターセプト・タックル判定
    if (st.ball.cooldown <= 0) {
      if (st.ball.free) {
         if (vdist(p.pos, st.ball.pos) < P.interceptRadius) {
           st.ball.owner = idx;
           st.ball.free = false;
           st.ball.cooldown = 0.1;
         }
      } else if (st.ball.owner !== null && st.ball.owner !== idx) {
        if (st.pl[st.ball.owner].team !== p.team) {
           if (vdist(p.pos, st.ball.pos) < P.interceptRadius * 0.65) {
             st.ball.owner = idx; // ボール奪取
             st.ball.cooldown = 0.35;
           }
        }
      }
    }

    // B. AIの意思決定 (0.2秒に1回発火)
    p.dt -= dt;
    if (p.dt <= 0) {
      p.dt = P.decisionInterval;
      if (st.ball.owner === idx) decideHasBall(st, idx);
      else decideNoBall(st, idx);
    }

    // C. 移動処理
    let speed = P.moveSpeed;
    if (p.act === "dribble") speed = P.dribbleSpeed;
    if (p.act === "carry") speed = P.dribbleSpeed * 1.2;

    const oldPos = p.pos;
    if (p.act !== "idle") {
      p.pos = vmove(p.pos, p.tgt, speed * dt);
    }
    
    // D. 向き(Face)の更新
    if (vdist(oldPos, p.pos) > 0.001) {
      p.face = vnorm(vsub(p.pos, oldPos));
    } else if (st.ball.free) {
      p.face = vnorm(vsub(st.ball.pos, p.pos));
    }

    // E. ピッチ外に出ないようクランプ
    p.pos = pitchClamp(p.pos);
  });
};
