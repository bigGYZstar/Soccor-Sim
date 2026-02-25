// Game engine - all logic extracted from Home.tsx
// UI-independent, testable simulation core

import { State, Player, Ball, Role, V, Trail, Foot, FootSide, FootParams } from './types';
import { P } from './constants';
import {
  v, vadd, vsub, vscl, vlen, vnorm, vdist, vdot, vlerp, vang,
  clamp, rng, pitchClamp, vmove, distSegmentToPoint
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

// ★ v8.9.0: Foot system helpers

/**
 * Calculate world-space foot positions based on player facing direction.
 * Left foot is to the left of the facing direction, right foot to the right.
 * Both feet are slightly forward of the body center.
 * 
 * KEY INVARIANT: Feet must never exceed footMaxReach from body center.
 */
function calcFootPositions(playerPos: V, face: V): { left: V; right: V } {
  const fwd = vnorm(face);
  const right = v(fwd.y, -fwd.x); // Perpendicular to facing (right side)
  
  // Left foot: forward + left offset
  const leftOffset = vadd(
    vscl(fwd, PExt.footOffsetForward),
    vscl(right, -PExt.footOffsetLateral)
  );
  // Right foot: forward + right offset
  const rightOffset = vadd(
    vscl(fwd, PExt.footOffsetForward),
    vscl(right, PExt.footOffsetLateral)
  );
  
  return {
    left: vadd(playerPos, leftOffset),
    right: vadd(playerPos, rightOffset),
  };
}

/**
 * Determine which foot to use for an action based on ball position relative to player.
 * Returns the foot closer to the ball, respecting dominant foot preference.
 * 
 * If weakFootFreq is 0, always returns dominant foot.
 * Otherwise, uses the closer foot with probability based on weakFootFreq.
 */
export function chooseFootForAction(player: Player, ballPos: V): FootSide {
  const params = player.footParams;
  
  // If weakFootFreq is 0, always use dominant foot
  if (params.weakFootFreq === 0) {
    return params.dominantFoot;
  }
  
  // Calculate distance from each foot to ball
  const distLeft = vdist(player.leftFoot.pos, ballPos);
  const distRight = vdist(player.rightFoot.pos, ballPos);
  
  // Determine which foot is closer to ball
  const closerFoot: FootSide = distLeft < distRight ? "L" : "R";
  const closerIsDominant = closerFoot === params.dominantFoot;
  
  if (closerIsDominant) {
    // Closer foot is dominant - always use it
    return params.dominantFoot;
  } else {
    // Closer foot is weak foot - use it based on weakFootFreq
    // weakFootFreq 10 = 100% chance to use weak foot when it's closer
    const useWeakChance = params.weakFootFreq / 10;
    if (Math.random() < useWeakChance) {
      return closerFoot; // Use weak foot
    } else {
      return params.dominantFoot; // Override to dominant
    }
  }
}

/**
 * Calculate accuracy modifier based on which foot is used and its distance from ball.
 * 
 * KEY INVARIANT: Accuracy decreases as foot-to-ball distance increases.
 * Dominant foot: base accuracy = 1.0
 * Weak foot: base accuracy = weakFootAccuracy / 10
 * Distance penalty: -footAccuracyDecay per meter beyond rest position
 */
export function footAccuracyModifier(player: Player, usedFoot: FootSide, ballPos: V): number {
  const params = player.footParams;
  const foot = usedFoot === "L" ? player.leftFoot : player.rightFoot;
  
  // Base accuracy: 1.0 for dominant, weakFootAccuracy/10 for weak
  let accuracy = usedFoot === params.dominantFoot ? 1.0 : params.weakFootAccuracy / 10;
  
  // Distance penalty: how far is the foot from the ball?
  const footToBall = vdist(foot.pos, ballPos);
  const restDist = Math.sqrt(
    PExt.footOffsetForward * PExt.footOffsetForward +
    PExt.footOffsetLateral * PExt.footOffsetLateral
  );
  const extraReach = Math.max(0, footToBall - restDist);
  accuracy -= extraReach * PExt.footAccuracyDecay;
  
  return Math.max(0.1, Math.min(1.0, accuracy)); // Clamp to [0.1, 1.0]
}

/**
 * Update foot positions for a player based on current pos and face.
 * Called every frame in update().
 */
function updatePlayerFeet(player: Player, dt?: number): void {
  const feet = calcFootPositions(player.pos, player.face);
  
  // Base foot positions
  player.leftFoot.pos = feet.left;
  player.rightFoot.pos = feet.right;
  
  // ★ v8.9.1: Apply animation offsets and decay timers
  if (dt !== undefined) {
    for (const foot of [player.leftFoot, player.rightFoot]) {
      if (foot.animTimer > 0) {
        foot.animTimer -= dt;
        if (foot.animTimer <= 0) {
          // Animation finished: reset
          foot.animTimer = 0;
          foot.animOffset = v(0, 0);
          foot.animType = "none";
        } else if (foot.animType === "kick" || foot.animType === "tackle") {
          // Kick/tackle: swing out then retract (triangle wave)
          const duration = foot.animType === "kick" ? PExt.footKickSwingDuration : PExt.footTackleLungeDuration;
          const progress = 1 - (foot.animTimer / duration); // 0..1
          // Triangle: 0→1→0 over duration (peak at 0.3 for quick snap)
          const peakT = 0.3;
          const swingFactor = progress < peakT 
            ? progress / peakT 
            : 1 - (progress - peakT) / (1 - peakT);
          const maxDist = foot.animType === "kick" ? PExt.footKickSwingDist : PExt.footTackleLungeDist;
          const animDir = vlen(foot.animOffset) > 0.001 ? vnorm(foot.animOffset) : vnorm(player.face);
          foot.animOffset = vscl(animDir, maxDist * swingFactor);
        }
        // dribbleTouch animation is handled in ball-follows-owner section
      }
      // Apply animation offset to final foot position
      foot.pos = vadd(foot.pos, foot.animOffset);
    }
  }
  
  // Update offsets (for reference)
  player.leftFoot.offset = vsub(player.leftFoot.pos, player.pos);
  player.rightFoot.offset = vsub(player.rightFoot.pos, player.pos);
}

/** Create default foot params for a player */
function mkFootParams(): FootParams {
  return {
    dominantFoot: PExt.defaultDominantFoot as FootSide,
    weakFootFreq: PExt.defaultWeakFootFreq,
    weakFootAccuracy: PExt.defaultWeakFootAccuracy,
    ballControl: PExt.defaultBallControl,
  };
}

/** Create a foot at a given position */
function mkFoot(side: FootSide, playerPos: V, face: V): Foot {
  const feet = calcFootPositions(playerPos, face);
  const pos = side === "L" ? feet.left : feet.right;
  return {
    side,
    pos,
    offset: vsub(pos, playerPos),
    animOffset: v(0, 0),
    animTimer: 0,
    animType: "none" as const,
  };
}

// Formation definitions
// 4-4-2 Formation for soccer pitch (105m x 68m)
const FORM_442_BLUE = [
  v(-48.0, 0),     // GK
  v(-35.0, -20.0), v(-35.0, -7.0), v(-35.0, 7.0), v(-35.0, 20.0), // DEF (back 4)
  v(-15.0, -22.0), v(-15.0, -7.5), v(-15.0, 7.5), v(-15.0, 22.0), // MID (midfield 4)
  v(-5.0, -10.0), v(-5.0, 10.0),  // FWD (strikers)
];
const FORM_442_RED = FORM_442_BLUE.map((p) => v(-p.x, -p.y));

export function mkPlayers(): Player[] {
  const pl: Player[] = [];
  for (let i = 0; i < 11; i++) {
    const home = FORM_442_BLUE[i];
    const face = v(1, 0);
    pl.push({
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: -1, num: i + 1, home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      // ★ v8.9.0: Foot system
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
    });
  }
  for (let i = 0; i < 11; i++) {
    const home = FORM_442_RED[i];
    const face = v(-1, 0);
    pl.push({
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: 1, num: i + 1, home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: slotRole(i), jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      // ★ v8.9.0: Foot system
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
    });
  }
  return pl;
}

export function mkState(): State {
  return {
    pl: mkPlayers(),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: true, shot: false, dead: 0, cooldown: 0, lob: 0, lastTouchTeam: 0, holdT: 0, holdAX0: 0, holdT0: 0, phaseBBlockedPassStreak: 0, kickSeq: 0, kickKind: null, kickTeam: 0, intendedReceiverIdx: null, kickActive: false, prevPos: v(0, 0), lastKickTime: 0, lastKickerIdx: -1 },
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
      forcedShotsFromBlocked: { blue: 0, red: 0 },
      // v8.8.2: Comprehensive statistics
      passAttempts: { blue: 0, red: 0 },
      passSuccess: { blue: 0, red: 0 },
      passToIntended: { blue: 0, red: 0 },
      passRecovered: { blue: 0, red: 0 },
      longPassAttempts: { blue: 0, red: 0 },
      longPassSuccess: { blue: 0, red: 0 },
      dribbleAttempts: { blue: 0, red: 0 },
      dribbleSuccess: { blue: 0, red: 0 },
      shotsTotal: { blue: 0, red: 0 },
      shotsOnTarget: { blue: 0, red: 0 },
      interceptions: { blue: 0, red: 0 },
      tackles: { blue: 0, red: 0 },
      tackleSuccess: { blue: 0, red: 0 },
      gkSaveAttempts: { blue: 0, red: 0 },
      gkSaves: { blue: 0, red: 0 },
      possessionFrames: { blue: 0, red: 0 }
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

export function give(ball: Ball, idx: number, pl: Player[], st: State, reason: "intercept" | "pickup" | "gkCatch" | "rebound" | "setpiece" | "receive" = "pickup") {
  // v8.7.4: Detect turnover and activate counter-press
  const prevOwnerTeam = ball.lastTouchTeam;
  const newOwnerTeam = pl[idx].team;
  
  // v8.8.4: Auto-infer reason from recent kick context
  let inferredReason = reason;
  const recentKick = (st.time - ball.lastKickTime) < 2.0;
  const isPassLike = ball.kickKind === "PASS" || ball.kickKind === "LONG";
  
  if (recentKick && isPassLike && ball.kickTeam !== 0) {
    inferredReason = (newOwnerTeam === ball.kickTeam) ? "receive" : "intercept";
  }
  
  // v8.8.5: Kick event tracking - settle kick result ONCE
  if (ball.kickActive) {
    const team = ball.kickTeam === -1 ? 'blue' : 'red';
    
    // Exclude setpiece/gkCatch from pass statistics
    const countable = (inferredReason !== "setpiece" && inferredReason !== "gkCatch");
    
    if (countable && (ball.kickKind === "PASS" || ball.kickKind === "LONG")) {
      const sameTeam = (newOwnerTeam === ball.kickTeam);
      const toIntended = (idx === ball.intendedReceiverIdx);
      
      if (ball.kickKind === "PASS") {
        if (sameTeam) {
          st.stats.passSuccess[team]++;
          if (toIntended) {
            st.stats.passToIntended[team]++;
          } else {
            st.stats.passRecovered[team]++;
          }
        }
        // Attempt already counted in doPassTo
      } else if (ball.kickKind === "LONG") {
        if (sameTeam) {
          st.stats.longPassSuccess[team]++;
        }
        // Attempt already counted in doLongPassTo
      }
    }
    
    ball.kickActive = false; // Kick settled
  }
  
  // v8.8.4: Track interceptions based on inferred reason
  if (inferredReason === "intercept" && prevOwnerTeam !== 0 && prevOwnerTeam !== newOwnerTeam) {
    const newTeam = newOwnerTeam === -1 ? 'blue' : 'red';
    st.stats.interceptions[newTeam]++;
    st.stats.tackleSuccess[newTeam]++;
  }
  
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
  
  // v8.8.3: Deactivate kick tracking when possession is established
  if (reason === "setpiece" || reason === "gkCatch") {
    ball.kickActive = false;
  }
}

export function kick(st: State, kickerIdx: number, spd: number, shot: boolean, tgt: V, isLong: boolean = false, customErr?: number) {
  const b = st.ball;
  const kicker = st.pl[kickerIdx];
  if (b.owner !== null) b.lastTouchTeam = st.pl[b.owner].team;
  
  // ★ v8.9.0: Choose which foot to use and apply accuracy modifier
  const usedFoot = chooseFootForAction(kicker, b.pos);
  const footMod = footAccuracyModifier(kicker, usedFoot, b.pos);
  
  // ★ v7.2: Unified error handling with GK-specific safety
  // v8.9.0: Error range is scaled by foot accuracy (worse foot = more error)
  let finalTarget = { ...tgt };
  let baseErrRange = customErr !== undefined ? customErr : 
                 (shot ? (1 - PExt.shotAccuracy) * 3.0 : 
                  isLong ? (1 - PExt.longPassAccuracy) * 1.5 : 
                  (1 - PExt.passAccuracy) * 1.5);
  // Apply foot accuracy: footMod=1.0 means no extra error, footMod=0.5 means 2x error
  let errRange = baseErrRange / Math.max(0.1, footMod);
  
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
  
  // ★ v8.9.0: Reset ball position to the actual foot that kicked it
  const kickingFoot = usedFoot === "L" ? kicker.leftFoot : kicker.rightFoot;
  b.pos = vadd(kickingFoot.pos, vscl(dir, 0.15));
  
  st.trail = { start: kicker.pos, end: finalTarget, shot, longPass: isLong, t: PExt.trailDuration };
  
  // Track kick type for statistics
  b.lastKickTeam = kicker.team;
  b.lastTouchTeam = kicker.team; // Ensure lastTouchTeam is set on every kick
  if (shot) b.lastKickType = "SHOT";
  else if (isLong) b.lastKickType = "LONG";
  else b.lastKickType = "PASS";
  
  // v8.8.3: Kick event tracking for accurate statistics
  b.kickSeq++;
  b.kickKind = shot ? "SHOT" : isLong ? "LONG" : "PASS";
  b.kickTeam = kicker.team;
  // v8.8.5: Use finalTarget for intended receiver (not kicker position)
  b.intendedReceiverIdx = tgt ? nearest(st, finalTarget, kicker.team) : null;
  b.kickActive = true;
  b.lastKickTime = st.time;
  b.lastKickerIdx = kickerIdx;
  
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(dir, spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0;
  
  // v8.8.2: Track shot statistics
  if (shot) {
    const team = kicker.team === -1 ? 'blue' : 'red';
    st.stats.shotsTotal[team]++;
    
    // v8.8.3: Check if shot is on target using goalline intersection
    const goalX = -kicker.team * PExt.pitchHalfW;
    const isTowardsGoal = (finalTarget.x - kicker.pos.x) * -kicker.team > 0;
    
    if (isTowardsGoal) {
      // Calculate where shot trajectory crosses goalline
      // Line from kicker.pos to finalTarget, find y when x = goalX
      const dx = finalTarget.x - kicker.pos.x;
      const dy = finalTarget.y - kicker.pos.y;
      
      if (Math.abs(dx) > 0.01) {
        // t = (goalX - kicker.pos.x) / dx
        const t = (goalX - kicker.pos.x) / dx;
        const y_at_goalline = kicker.pos.y + t * dy;
        
        // On target if intersection is within goal posts
        if (Math.abs(y_at_goalline) <= PExt.goalHalfH) {
          st.stats.shotsOnTarget[team]++;
        }
      }
    }
  }
  
  // Update kicker's face direction
  kicker.face = dir;
  
  // ★ v8.9.1: Trigger kick swing animation on the kicking foot
  const kickFoot = usedFoot === "L" ? kicker.leftFoot : kicker.rightFoot;
  kickFoot.animTimer = PExt.footKickSwingDuration;
  kickFoot.animType = "kick";
  kickFoot.animOffset = vscl(dir, PExt.footKickSwingDist);
  
  // ★ v8.7.1: Kick logging (1% sample)
  if (Math.random() < 0.01) {
    const dirLen = vlen(dir);
    const ballVelLen = vlen(b.vel);
    const type = shot ? "SHOT" : isLong ? "LONG" : "PASS";
    // Debug log removed for clean output
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
          // Debug log removed
        }
      } else {
        // v8.7.5: Track blocked passes in Phase B for safety valve
        if (!isPhaseA) {
          // This is Phase B and pass is blocked - will count if this pass is chosen
          // (actual counting happens in decideHasBall when bestPass returns blocked target)
        }
        if (Math.random() < 0.01) {
          // Debug log removed
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
  
  // v8.8.2: Track pass attempt
  const team = me.team === -1 ? 'blue' : 'red';
  st.stats.passAttempts[team]++;
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
  
  // v8.8.2: Track long pass attempt
  const team = me.team === -1 ? 'blue' : 'red';
  st.stats.longPassAttempts[team]++;
}

export function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  const team = me.team === -1 ? 'blue' : 'red';
  
  // v8.8.2: Track dribble attempt
  st.stats.dribbleAttempts[team]++;
  
  // ★ v8.9.0: Foot affects dribble control
  // Choose foot for dribble (ball is at player's feet)
  const usedFoot = chooseFootForAction(me, st.ball.pos);
  const footMod = footAccuracyModifier(me, usedFoot, st.ball.pos);
  // Dribble control adjusted by foot accuracy
  const effectiveControl = PExt.dribbleControl * footMod;
  
  if (Math.random() > effectiveControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, idx, 3, false, vadd(me.pos, vscl(fd, 2)));
    return;
  }
  
  // v8.8.2: Dribble success (not lost immediately)
  st.stats.dribbleSuccess[team]++;
  
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
    const searchDist = 25.0; // Adjusted for soccer pitch
    const minConeDist = isPhaseA ? 3.5 : 2.5; // Adjusted for soccer: Phase A: 3.5m, Phase B: 2.5m
    
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
      // Adjusted for soccer: Normal carry distance scaled to 15m
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 15.0)));
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
      // Debug log removed
    }
    return;
  }
  
  // Check if stuck: holdT >= 0.5s AND no progress (ax advance < 0.25)
  const axAdvance = ax - st.ball.holdAX0;
  const isStuck = st.ball.holdT >= 0.5 && axAdvance < 0.25;
  
  if (isStuck) {
    // Stuck for 0.5s with no progress - force forward movement
    const toGoalDir = vnorm(vsub(gc, me.pos));
    
    // Try forced carry with very relaxed minConeDist (adjusted for soccer)
    const relaxedMinConeDist = 2.0;
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
      // Adjusted for soccer: Stuck carry distance scaled to 18m
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 18.0)));
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
          // Debug log removed
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
    // Debug log removed
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
    // ★ v8.9.1: Target the BALL position, not the player.
    // When ball is separated from dribbler (touch cycle push phase),
    // defenders should target the ball to attempt a tackle.
    if (ballOwner && ballOwner.team !== me.team) {
      // Calculate ball separation from dribbler
      const ballSep = vdist(b.pos, ballOwner.pos);
      const isDribblerPushed = ballSep > 0.5; // Ball is meaningfully separated
      
      // When ball is separated, nearby defenders rush to the ball (tackle opportunity)
      if (isDribblerPushed && distToBall < 4.0) {
        // ★ v8.9.1: Tackle targeting - aim for the ball, not the player
        me.act = "move";
        me.tgt = { ...b.pos }; // Target the actual ball position
        me.face = vnorm(vsub(b.pos, me.pos));
        return;
      }
      
      if (me.role === "FWD" && distToBall < 5.0) {
        // FWD: Press aggressively
        me.act = "move";
        me.tgt = vlerp(ballPos, v(me.team * PExt.pitchHalfW, 0), 0.1);
      } else if (me.role === "MID" && distToBall < 4.5) {
        // MID: Press moderately
        me.act = "move";
        me.tgt = vlerp(ballPos, v(me.team * PExt.pitchHalfW, 0), 0.15);
      } else if (me.role === "DEF" && distToBall < 3.5) {
        // ★ v8.9.1: DEF also presses when close enough
        me.act = "move";
        me.tgt = vlerp(ballPos, v(me.team * PExt.pitchHalfW, 0), 0.2);
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
  // Debug log removed
  
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
  
  // Goal kicks must be taken by goalkeeper
  let taker: number;
  if (sp.kind === "GOALKICK") {
    taker = findGK(st, sp.team);
    if (taker === -1) return; // No GK found
  } else {
    // Corner kicks and throw-ins taken by nearest outfield player
    taker = nearestOutfield(st, sp.pos, sp.team);
    if (taker === -1) return;
  }

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
    // v8.8.3: Store previous position for line-segment collision detection
    b.prevPos = { ...b.pos };
    
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
    // ★ v8.9.0: Use foot distance for interception (closer foot counts)
    if (b.cooldown <= 0) {
      let closestIdx = -1;
      let minD = PExt.interceptRadius;
      
      for (let i = 0; i < st.pl.length; i++) {
        const p = st.pl[i];
        // v8.9.0: Check distance to nearest foot, not just body center
        const dBody = vdist(p.pos, b.pos);
        // v8.9.0: Use foot distance if available, fallback to body distance
        const dLeftFoot = p.leftFoot ? vdist(p.leftFoot.pos, b.pos) : dBody;
        const dRightFoot = p.rightFoot ? vdist(p.rightFoot.pos, b.pos) : dBody;
        const d = Math.min(dBody, dLeftFoot, dRightFoot);
        
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
        // ★ v8.9.1: Trigger tackle/intercept foot animation
        const interceptor = st.pl[closestIdx];
        if (interceptor.leftFoot && interceptor.rightFoot) {
          // Determine which foot is closer to the ball
          const dL = vdist(interceptor.leftFoot.pos, b.pos);
          const dR = vdist(interceptor.rightFoot.pos, b.pos);
          const tackleFoot = dL < dR ? interceptor.leftFoot : interceptor.rightFoot;
          const lungeDir = vnorm(vsub(b.pos, interceptor.pos));
          tackleFoot.animTimer = PExt.footTackleLungeDuration;
          tackleFoot.animType = "tackle";
          tackleFoot.animOffset = vscl(lungeDir, PExt.footTackleLungeDist);
        }
        give(b, closestIdx, st.pl, st);
      }
    }
    
    // v8.8.3: GK save with line-segment detection
    if (PExt.gkSaveEnabled && b.shot) {
      const defTeam = b.lastTouchTeam === -1 ? 1 : -1;
      const gkIdx = findGK(st, defTeam);
      if (gkIdx !== -1) {
        const gk = st.pl[gkIdx];
        // Check if shot trajectory (prevPos -> pos) crosses GK radius
        const distToGK = distSegmentToPoint(b.prevPos, b.pos, gk.pos);
        if (distToGK < PExt.gkSaveRadius) {
          const gc = v(defTeam * PExt.pitchHalfW, 0);
          const toGoal = vsub(gc, b.pos);
          const toBall = vsub(b.pos, gk.pos);
          const angle = vang(toGoal, toBall);
          const angleBonus = (1 - angle / 180) * PExt.gkSaveAngleBonus;
          const saveChance = PExt.gkSaveBase + angleBonus;
          
          // v8.8.2: Track save attempt
          const gkTeam = defTeam === -1 ? 'blue' : 'red';
          st.stats.gkSaveAttempts[gkTeam]++;
          
          if (Math.random() < saveChance) {
            // v8.8.2: Track successful save
            st.stats.gkSaves[gkTeam]++;
            
            if (Math.random() < PExt.gkParryChance) {
              // Parry
              const parryDir = vnorm(vsub(b.pos, gk.pos));
              b.vel = vscl(parryDir, PExt.shotSpeed * 0.4);
              b.shot = false;
              b.cooldown = PExt.gkHoldCooldown;
            } else {
              // Catch
              give(b, gkIdx, st.pl, st, "gkCatch");
              b.cooldown = PExt.gkHoldCooldown;
            }
          }
        }
      }
    }
    
    // 1) Touchline out => throw-in
    if (PExt.outEnabled && Math.abs(b.pos.y) >= PExt.pitchHalfH) {
      // ★ 修正: throwInInset を適用し、境界線ぴったりに配置されることによる即時アウト判定を防ぐ
      const outY = Math.sign(b.pos.y) * (PExt.pitchHalfH - PExt.throwInInset);
      const outX = clamp(b.pos.x, -PExt.pitchHalfW + PExt.throwInInset, PExt.pitchHalfW - PExt.throwInInset);
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
      const goalSide = Math.sign(b.pos.x);
      const outYSide = Math.sign(b.pos.y); // 出たY方向の符号を保持
      const defendingTeam = goalSide;
      const last = b.lastTouchTeam;

      if (last === defendingTeam) {
        // defender touched last => corner for attackers
        st.stats.corners += 1;
        const restartTeam = -defendingTeam;

        // ★ 修正: cornerInset を適用して、ボールをピッチの内側に少しずらす
        const cornerX = goalSide * (PExt.pitchHalfW - PExt.cornerInset);
        const cornerY = outYSide * (PExt.pitchHalfH - PExt.cornerInset);
        stopForSetPiece(st, "CORNER", restartTeam, v(cornerX, cornerY));
        return;
      } else {
        // attacker touched last => goal kick for defenders
        const restartTeam = defendingTeam;
        // ★ 修正: ハードコードされた 3.0 を廃止し、専用の定数 goalKickX を使用する
        const gkX = goalSide * PExt.goalKickX;
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
    // Ball follows owner (★ v8.9.1: with dribble touch cycle separation)
    if (b.owner !== null) {
      const owner = st.pl[b.owner];
      
      // ★ v8.9.1: Dribble ball separation physics
      // During dribble/carry, ball oscillates between foot contact and push-ahead.
      // During idle/move (just received ball), ball stays at foot.
      const isDribbling = owner.act === "dribble" || owner.act === "carry";
      
      if (isDribbling) {
        // Advance touch cycle oscillator
        owner.dribbleTouchPhase += PExt.dribbleTouchCycleSpeed * dt;
        if (owner.dribbleTouchPhase > Math.PI * 2) owner.dribbleTouchPhase -= Math.PI * 2;
        
        // touchT: 0 at foot contact, 1 at max push distance
        const touchT = (Math.sin(owner.dribbleTouchPhase) + 1) * 0.5; // 0..1
        
        // Push distance based on ballControl (0-10)
        // control=10 → pushDist=pushDistMin, control=0 → pushDist=pushDistMax
        const controlNorm = owner.footParams.ballControl / 10; // 0..1
        const maxPush = PExt.dribblePushDistMin + (1 - controlNorm) * (PExt.dribblePushDistMax - PExt.dribblePushDistMin);
        const pushDist = touchT * maxPush;
        
        // Ball position: dominant foot position + push in facing direction
        const usedFoot = owner.footParams.dominantFoot === "R" ? owner.rightFoot : owner.leftFoot;
        const footPos = usedFoot.pos;
        const pushDir = vnorm(owner.face);
        b.pos = vadd(footPos, vscl(pushDir, pushDist));
        
        // ★ v8.9.1: Animate dribbling foot (swing forward during touch)
        const footSwing = touchT * PExt.dribbleTouchFootSwing;
        const fwd = vnorm(owner.face);
        if (owner.footParams.dominantFoot === "R") {
          owner.rightFoot.animOffset = vscl(fwd, footSwing);
          owner.rightFoot.animType = "dribbleTouch";
          owner.leftFoot.animOffset = v(0, 0);
          owner.leftFoot.animType = "none";
        } else {
          owner.leftFoot.animOffset = vscl(fwd, footSwing);
          owner.leftFoot.animType = "dribbleTouch";
          owner.rightFoot.animOffset = v(0, 0);
          owner.rightFoot.animType = "none";
        }
      } else {
        // Not dribbling: ball at dominant foot position
        const usedFoot = owner.footParams.dominantFoot === "R" ? owner.rightFoot : owner.leftFoot;
        b.pos = { ...usedFoot.pos };
        owner.dribbleTouchPhase = 0;
        // Reset foot animation
        owner.leftFoot.animOffset = v(0, 0);
        owner.leftFoot.animType = "none";
        owner.rightFoot.animOffset = v(0, 0);
        owner.rightFoot.animType = "none";
      }
      
      // ★ v8.7.1: Track hold time for safety valve
      b.holdT += dt;
      
      // ★ v8.8.6: Goal detection during possession (enables dribble goals)
      const g = checkGoal(b.pos);
      if (g !== 0) {
        // Own goal detection
        const goalSide = Math.sign(b.pos.x);
        const concedingTeam = goalSide;
        if (b.lastTouchTeam === concedingTeam) {
          // Own goal (rare but possible)
          const concedingKey = concedingTeam === -1 ? 'blue' : 'red';
          st.stats.ownGoals = (st.stats.ownGoals || 0) + 1;
        }
        
        if (g === -1) st.sR++;
        else st.sL++;
        st.flash = 1.0;
        st.flashTxt = "GOAL!";
        st.koSide = g;
        doKickOff(st);
        return;
      }
      
      // v8.8.2: Track possession frames
      const ownerTeam = st.pl[b.owner].team === -1 ? 'blue' : 'red';
      st.stats.possessionFrames[ownerTeam]++;
      
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
    
    // ★ v8.9.0: Update foot positions every frame
    updatePlayerFeet(p, dt);
  }
}
