// Game engine - all logic extracted from Home.tsx
// UI-independent, testable simulation core

import { State, Player, Ball, Role, V, Trail, Foot, FootSide, FootParams } from './types';
import { P, FORMATIONS, FormationId } from './constants';
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

// Formation helper: convert formation positions to V[] for a team
function formationToVecs(formId: FormationId, teamSign: -1 | 1): V[] {
  const def = FORMATIONS[formId];
  return def.positions.map(p => {
    if (teamSign === -1) return v(p.x, p.y);       // Blue: left side
    return v(-p.x, -p.y);                           // Red: mirrored
  });
}

function roleForSlot(formId: FormationId, slot: number): Role {
  return FORMATIONS[formId].roles[slot];
}

export function mkPlayers(blueFormation: FormationId = "4-4-2", redFormation: FormationId = "4-4-2"): Player[] {
  const pl: Player[] = [];
  const bluePositions = formationToVecs(blueFormation, -1);
  const redPositions = formationToVecs(redFormation, 1);
  
  for (let i = 0; i < 11; i++) {
    const home = bluePositions[i];
    const face = v(1, 0);
    pl.push({
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: -1, num: FORMATIONS[blueFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(blueFormation, i), jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
    });
  }
  for (let i = 0; i < 11; i++) {
    const home = redPositions[i];
    const face = v(-1, 0);
    pl.push({
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: 1, num: FORMATIONS[redFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(redFormation, i), jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
    });
  }
  
  // ★ v9.5.0: Configure #10 players as ambidextrous (both feet equally skilled)
  for (const p of pl) {
    if (p.num === 10) {
      p.footParams.weakFootFreq = 8;      // 80% chance to use weak foot when it's closer
      p.footParams.weakFootAccuracy = 8;  // 80% accuracy with weak foot
    }
  }
  
  return pl;
}

export function mkState(blueFormation: FormationId = "4-4-2", redFormation: FormationId = "4-4-2"): State {
  return {
    pl: mkPlayers(blueFormation, redFormation),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: true, shot: false, dead: 0, cooldown: 0, lob: 0, lastTouchTeam: 0, holdT: 0, holdAX0: 0, holdT0: 0, phaseBBlockedPassStreak: 0, kickSeq: 0, kickKind: null, kickTeam: 0, intendedReceiverIdx: null, kickActive: false, prevPos: v(0, 0), lastKickTime: 0, lastKickerIdx: -1, z: 0, vz: 0, spinX: 0, spinY: 0, spinDecay: 3.0, kickFoot: null, kickStyle: null },
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
    },
    // ★ v9.7.0: Ball trail dots
    ballTrail: []
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
                 (shot ? (1 - PExt.shotAccuracy) * 8.0 :  // v9.2.0: Increased from 3.0 for realistic on-target rate
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
  // v9.2.0: intendedReceiverIdx is set by doPassTo/doLongPassTo BEFORE kick()
  // ★ v9.8.0: Fallback excludes the kicker to prevent self-pass tracking
  if (b.intendedReceiverIdx === null || b.intendedReceiverIdx === undefined) {
    b.intendedReceiverIdx = tgt ? nearestEx(st, finalTarget, kicker.team, kickerIdx) : null;
  }
  b.kickActive = true;
  b.lastKickTime = st.time;
  b.lastKickerIdx = kickerIdx;
  
  b.owner = null; b.free = true; b.shot = shot;
  b.vel = vscl(dir, spd); b.dead = 0;
  b.lob = isLong ? 1.0 : 0;
  // v9.2.0: Add cooldown after kick to prevent kicker from immediately re-intercepting
  b.cooldown = 0.15;  // 150ms cooldown before anyone can pick up the ball
  
  // ★ v9.4.0: Spin physics - determine kick style and apply spin
  b.kickFoot = usedFoot;
  // Determine kick style based on context
  // Short passes: inside foot (most common), Long passes: instep, Shots: instep or outside
  if (shot) {
    b.kickStyle = Math.random() < 0.7 ? "instep" : "outside";
  } else if (isLong) {
    b.kickStyle = "instep";
  } else {
    b.kickStyle = Math.random() < 0.85 ? "inside" : "outside";
  }
  
  // Calculate side spin based on foot and kick style
  // Right foot inside kick: ball curves left (spinX < 0)
  // Right foot outside kick: ball curves right (spinX > 0)
  // Left foot inside kick: ball curves right (spinX > 0)
  // Left foot outside kick: ball curves left (spinX < 0)
  const footSign = usedFoot === "R" ? 1 : -1;
  const styleSign = b.kickStyle === "inside" ? -1 : b.kickStyle === "outside" ? 1 : 0;
  const spinIntensity = shot ? 2.5 : isLong ? 1.8 : 1.0;
  // Subtle spin: 0.3-1.5 rad/s depending on kick type
  b.spinX = footSign * styleSign * spinIntensity * (0.3 + Math.random() * 0.5);
  
  // Backspin/topspin: lofted passes get backspin, ground passes get slight topspin
  if (isLong) {
    b.spinY = -(1.0 + Math.random() * 1.0); // Backspin on lofted balls
  } else if (shot) {
    b.spinY = 0.5 + Math.random() * 1.0; // Slight topspin on shots (dips)
  } else {
    b.spinY = Math.random() * 0.3; // Minimal spin on ground passes
  }
  b.spinDecay = 3.0;
  
  // Z-axis: lob/long passes go up, ground passes stay low
  if (isLong) {
    const dist = vdist(kicker.pos, finalTarget);
    // Height proportional to distance: ~3-6m peak for 25-60m passes
    b.vz = Math.min(8.0, dist * 0.12 + 1.5);
    b.z = 0.3; // Initial lift
  } else if (shot) {
    // Shots can be low or rising
    b.vz = Math.random() < 0.3 ? (1.0 + Math.random() * 2.0) : 0; // 30% chance of rising shot
    b.z = 0;
  } else {
    // Ground passes
    b.vz = 0;
    b.z = 0;
  }
  
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

/** ★ v9.5.0: Evaluate if a receiver has progressive pass options (can play forward after receiving) */
function receiverHasProgressivePass(st: State, receiverIdx: number, passerIdx: number): boolean {
  const receiver = st.pl[receiverIdx];
  const gc = v(-receiver.team * PExt.pitchHalfW, 0);
  let count = 0;
  for (let i = 0; i < st.pl.length; i++) {
    if (i === receiverIdx || i === passerIdx) continue;
    const tm = st.pl[i];
    if (tm.team !== receiver.team) continue;
    const dist = vdist(receiver.pos, tm.pos);
    if (dist < 3.0 || dist > 30.0) continue;
    // Is this teammate ahead of the receiver?
    const gp = (tm.pos.x - receiver.pos.x) * -receiver.team;
    if (gp <= 1.0) continue; // Must be at least 1m forward
    // Is the lane open?
    if (!laneBlocked(st, receiver.pos, tm.pos, receiver.team)) {
      count++;
      if (count >= 1) return true; // At least 1 progressive option
    }
  }
  return false;
}

/** ★ v9.5.0: Evaluate space ahead of a player (how far they can advance without opposition) */
function spaceAhead(st: State, p: Player): number {
  const fwdDir = v(-p.team, 0); // Forward direction
  let minBlockDist = 15.0; // Max check distance
  for (const opp of st.pl) {
    if (opp.team === p.team) continue;
    const toOpp = vsub(opp.pos, p.pos);
    // Is opponent ahead?
    const proj = vdot(toOpp, fwdDir);
    if (proj < 0 || proj > minBlockDist) continue;
    // Is opponent in the path (within 3m lateral)?
    const lateral = Math.abs(toOpp.y * fwdDir.x - toOpp.x * fwdDir.y);
    if (lateral < 3.0 && proj < minBlockDist) {
      minBlockDist = proj;
    }
  }
  return minBlockDist;
}

export function bestPass(st: State, idx: number, relaxed: boolean = false): number | null {
  const me = st.pl[idx];
  let bestIdx = -1, bestScore = -999;
  
  // ★ v9.5.0: Pre-compute passer's pressure level
  let closestEnemyToPasser = Infinity;
  let closestEnemyDir = v(0, 0);
  for (const opp of st.pl) {
    if (opp.team === me.team) continue;
    const d = vdist(me.pos, opp.pos);
    if (d < closestEnemyToPasser) {
      closestEnemyToPasser = d;
      closestEnemyDir = vnorm(vsub(opp.pos, me.pos));
    }
  }
  const underPressure = closestEnemyToPasser < PExt.pressurePassThreshold;
  // Is the enemy in front of the passer? (blocking forward progress)
  const enemyInFront = underPressure && vdot(closestEnemyDir, v(-me.team, 0)) > 0.3;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || i === idx) continue;
    const tm = st.pl[i];
    const dist = vdist(me.pos, tm.pos);
    // ★ v9.8.0: Minimum 4m to prevent micro-passes that kicker re-intercepts
    if (dist < 4.0 || dist > 35.0) continue;
    
    let score = 0;
    const gp = (tm.pos.x - me.pos.x) * -me.team;
    const isForward = gp > 1.0;
    const isBackward = gp < -1.0;
    const isLateral = !isForward && !isBackward;
    
    // Base forward progress bonus
    score += gp * 2.0;
    
    // Receiver openness (how free they are from markers)
    const recvOpenness = openness(st, tm);
    score += recvOpenness * 3.0;
    
    // ★ v9.5.0: Receiver space ahead evaluation
    const recvSpace = spaceAhead(st, tm);
    score += Math.min(recvSpace / 5.0, 1.0) * PExt.receiverSpaceBonus;
    
    // ★ v9.5.0: Receiver's progressive pass options (can they play forward?)
    if (receiverHasProgressivePass(st, i, idx)) {
      score += PExt.receiverPassLaneBonus;
      // Extra bonus for back-pass to someone who can immediately play forward
      if (isBackward) {
        score += PExt.backPassProgressiveBonus;
      }
    }
    
    const isBlocked = laneBlocked(st, me.pos, tm.pos, me.team);
    const ax = me.pos.x * (-me.team);
    const w = PExt.pitchHalfW;
    const isPhaseA = ax < (2 * w / 3);
    if (isBlocked && !isPhaseA) score -= 2.0;
    if (isOffside(st, tm, me.pos)) score -= 100;
    
    // GK diagonal switch
    if (me.isGK && Math.abs(tm.pos.y) > 3.0) {
      score += 6.0;
    }
    
    // Attacking third penetration pass
    const isIntoAttackingThird = (tm.pos.x * -me.team) > (PExt.pitchHalfW / 3);
    const amINotInAttackingThird = (me.pos.x * -me.team) <= (PExt.pitchHalfW / 3);
    if (isIntoAttackingThird && amINotInAttackingThird && gp > 0) {
      if (!isBlocked) {
        score += 15.0;
      }
    }
    
    // Role-based bonuses
    if (me.role === "FWD" && tm.role === "MID") score += 8.0;
    if (me.role === "MID" && (tm.role === "MID" || tm.role === "FWD" || tm.slot === 3)) score += 5.0;
    
    // ★ v9.5.0: Pressure-aware passing
    if (underPressure) {
      // Under pressure: strongly prefer any open pass over dribble
      if (!isBlocked && recvOpenness > 0.2) {
        score += PExt.pressurePassPriority;
      }
      // If enemy is in front, lateral/back passes become very attractive
      if (enemyInFront && !isForward && !isBlocked) {
        score += PExt.pressurePassPriority * 0.8;
      }
    }
    
    // ★ v9.5.0: Lateral pass bonus (switch of play)
    if (isLateral && Math.abs(tm.pos.y - me.pos.y) > 8.0) {
      // Wide lateral pass to switch play
      if (!isBlocked) {
        score += PExt.lateralPassBonus + recvSpace * 0.3;
      }
    }
    
    // ★ v9.5.0: Back-pass evaluation (replaces old simple penalty)
    if (isBackward) {
      if (underPressure && recvOpenness > 0.3) {
        // Under pressure: back-pass to open teammate is a smart escape
        score += recvOpenness * 3.0;
      } else if (recvOpenness > 0.5) {
        // Not under pressure but receiver is very open: mild penalty
        score += PExt.backPassMinScore;
      } else {
        // Not under pressure and receiver is marked: discourage
        score -= 4.0;
      }
    }
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  if (bestScore < -8.0) return null;
  
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
  
  const passDist = vdist(me.pos, tm.pos);
  
  // ★ v9.4.0: Lead pass - aim slightly ahead of moving teammate
  if (tm.act === "move" || tm.act === "carry") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const leadDist = Math.min(passDist * 0.08, 1.5); // Subtle lead
    tp = vadd(tp, vscl(lead, leadDist));
  }
  
  let baseErr = (1 - PExt.passAccuracy) * 1.5;
  if (passDist < 4.0) baseErr *= 0.5;
  else if (passDist < 7.0) baseErr *= 0.7;
  const inOwnHalf = me.team * me.pos.x > 0;
  if (inOwnHalf) baseErr *= 0.6;
  
  // v9.2.0: Set intendedReceiverIdx BEFORE kick() so it's not overwritten
  st.ball.intendedReceiverIdx = targetIdx;
  
  // ★ v9.8.0: Physics-based pass speed calculation
  // With fric=0.985, the relationship is approximately:
  //   distance = speed * (1/60) / (1 - 0.985) = speed / 0.9
  //   So speed ≈ distance * 0.9 (m/s per meter of target distance)
  // We add ~20% overshoot so the ball arrives with some residual speed
  // (receiver can control a moving ball, not chase a dead one)
  const targetDist = vdist(me.pos, tp); // Distance to actual target point
  const neededSpeed = targetDist * 0.9; // Base speed to reach target
  const overshootFactor = 1.25; // Ball should arrive with ~25% residual speed
  let passSpd = Math.max(6.0, Math.min(22.0, neededSpeed * overshootFactor));
  // Short passes (< 5m): gentler touch, minimum 6 m/s
  // Medium passes (5-15m): proportional
  // Long passes (> 15m): capped at 22 m/s to stay realistic
  
  kick(st, idx, passSpd, false, tp, false, baseErr);
  
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
  
  // v9.2.0: Set intendedReceiverIdx BEFORE kick() so it's not overwritten
  st.ball.intendedReceiverIdx = targetIdx;
  
  // ★ v9.8.0: Distance-based long pass speed (lob has less friction: 0.99)
  // With fric=0.99, distance ≈ speed / 0.6, so speed ≈ distance * 0.6
  const lpDist = vdist(me.pos, tp);
  const lpSpeed = Math.max(12.0, Math.min(28.0, lpDist * 0.7));
  const err = (1 - PExt.longPassAccuracy) * 2.0;
  kick(st, idx, lpSpeed, false, tp, true, err);
  
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
    // ★ v9.8.0: Mark as dribble loss, not a pass
    st.ball.kickKind = "DRIBBLE_LOST";
    st.ball.kickActive = false; // Don't track as pass attempt
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
  
  // ★ v9.7.0: Carry state lock - aggressive pass-first with short carry windows
  if (me.act === "carry") {
    let closestEnemy = Infinity;
    let closestEnemyPos = v(0, 0);
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const d = vdist(me.pos, p.pos);
      if (d < closestEnemy) { closestEnemy = d; closestEnemyPos = p.pos; }
    }
    
    // ★ v9.7.0: Very short carry windows - pass is always the default
    const carryTime = st.ball.holdT;
    const maxCarryTime = me.role === "FWD" ? 0.8 : me.role === "MID" ? 0.5 : 0.3;
    
    // ★ v9.7.0: HARD LIMIT - force pass or dribble when carry time exceeds 1.2s
    if (carryTime > 1.2) {
      const passTgt = bestPass(st, idx);
      if (passTgt !== null) {
        doPassTo(st, idx, passTgt);
        return;
      }
      // No pass available: forced dribble to break out
      doDribble(st, idx);
      return;
    }
    
    // ★ v9.8.0: Check for pass after 0.3s grace period
    // (0.15s was too short - kicker would kick and immediately re-intercept)
    if (carryTime > 0.30) {
      const passTgt = bestPass(st, idx);
      if (passTgt !== null) {
        // Pass probability increases rapidly with carry time
        const timeRatio = Math.min(1.0, carryTime / maxCarryTime);
        const passProb = 0.60 + timeRatio * 0.35; // 60% → 95% as carry time increases
        // Under pressure: always pass
        const pressureBoost = closestEnemy < 5.0 ? 0.30 : 0;
        if (Math.random() < Math.min(0.98, passProb + pressureBoost)) {
          doPassTo(st, idx, passTgt);
          return;
        }
      }
    }
    
    // Enemy in front and close - must pass
    const toEnemyDir = closestEnemy < 20 ? vnorm(vsub(closestEnemyPos, me.pos)) : v(0, 0);
    const fwdDir = v(-me.team, 0);
    const enemyInFrontOfCarrier = closestEnemy < 5.0 && vdot(toEnemyDir, fwdDir) > 0.2;
    
    if (enemyInFrontOfCarrier) {
      const escapeTgt = bestPass(st, idx);
      if (escapeTgt !== null) {
        doPassTo(st, idx, escapeTgt);
        return;
      }
    }
    
    // ★ v9.7.0: Continue carry only for very short time in very open space
    if (closestEnemy > 8.0 && carryTime < maxCarryTime) {
      const toGoalDir = vnorm(vsub(gc, me.pos));
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 10.0)));
      return;
    }
    
    // Carry time exceeded or enemy close - fall through to normal decision
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
  
  // ★ v9.2.0: Compute common variables first
  const distToGoal = vdist(me.pos, gc);
  const ax = me.pos.x * (-me.team);
  const w = PExt.pitchHalfW;
  const isPhaseA = ax < (2 * w / 3);
  const isPhaseB = ax >= (2 * w / 3);
  
  // ★ Stack resolution: Force long kick when stack detected (HIGHEST PRIORITY)
  if (st.stackDetection.isStacked) {
    const forwardDir = v(-me.team + rng(-0.3, 0.3), rng(-0.5, 0.5));
    const kickTarget = vadd(me.pos, vscl(vnorm(forwardDir), 8.0));
    kick(st, idx, PExt.longPassSpeed, false, pitchClamp(kickTarget), true);
    st.stackDetection.isStacked = false;
    st.stackDetection.stableTime = 0;
    return;
  }
  
  // Check if stuck: holdT >= 0.5s AND no progress
  const axAdvance = ax - st.ball.holdAX0;
  const isStuck = st.ball.holdT >= 0.5 && axAdvance < 0.25;
  
  if (isStuck) {
    // Stuck - force pass first, then carry
    const stuckTgt = bestPass(st, idx, true);
    if (stuckTgt !== null) {
      doPassTo(st, idx, stuckTgt);
      chosenAction = "pass-forced";
      return;
    }
    // No pass available - try forced carry
    const toGoalDir = vnorm(vsub(gc, me.pos));
    const relaxedMinConeDist = 2.0;
    let closestInCone = Infinity;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const toOpp = vsub(p.pos, me.pos);
      const dist = vlen(toOpp);
      if (dist > 10.0) continue;
      const angle = vang(toGoalDir, toOpp);
      if (angle < 60) {
        if (dist < closestInCone) closestInCone = dist;
      }
    }
    if (closestInCone >= relaxedMinConeDist) {
      me.act = "carry";
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 18.0)));
      me.face = toGoalDir;
      chosenAction = "carry-forced";
      return;
    }
  }
  
  // ★ v8.7: Phase B (finish): Shot-first evaluation
  if (isPhaseB) {
    if (st.ball.phaseBBlockedPassStreak >= 3 && distToGoal < 8.2) {
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      if (angle < 60) {
        const err = (1 - PExt.shotAccuracy) * 2.5;
        const t = v(gc.x, gc.y + rng(-err, err));
        kick(st, idx, PExt.shotSpeed, true, t);
        if (me.team === -1) st.stats.forcedShotsFromBlocked.blue++;
        else st.stats.forcedShotsFromBlocked.red++;
        st.ball.phaseBBlockedPassStreak = 0;
        chosenAction = "shot-forced";
        return;
      }
    }
    
    // v9.2.0: Extended shot range to match PExt.shotRange (18m)
    const shouldPrioritizeShot = distToGoal < PExt.shotRange;
    if (shouldPrioritizeShot) {
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      let allowedAngle = 30;
      if (distToGoal <= 5.0) allowedAngle = 80;
      else if (distToGoal <= 8.0) allowedAngle = 60;
      else if (distToGoal <= 12.0) allowedAngle = 45;
      else allowedAngle = 30;
      
      if (angle < allowedAngle) {
        const err = (1 - PExt.shotAccuracy) * 2.5;
        const t = v(gc.x, gc.y + rng(-err, err));
        kick(st, idx, PExt.shotSpeed, true, t);
        st.ball.phaseBBlockedPassStreak = 0;
        if (me.team === -1) st.stats.phaseBShots.blue++;
        else st.stats.phaseBShots.red++;
        chosenAction = "shot";
        return;
      }
    }
  }
  
  // ★ v9.5.0: PRESSURE-AWARE PASS/CARRY ARCHITECTURE
  // When enemy is in front, prioritize passing to teammates
  
  // Pre-compute closest enemy info
  let closestEnemyDist = Infinity;
  let closestEnemyToMePos = v(0, 0);
  for (const p of st.pl) {
    if (p.team === me.team) continue;
    const d = vdist(me.pos, p.pos);
    if (d < closestEnemyDist) { closestEnemyDist = d; closestEnemyToMePos = p.pos; }
  }
  
  // Check if enemy is blocking forward path
  const fwdDirMe = v(-me.team, 0);
  const toNearestEnemy = closestEnemyDist < 20 ? vnorm(vsub(closestEnemyToMePos, me.pos)) : v(0, 0);
  const enemyBlockingForward = closestEnemyDist < PExt.pressurePassThreshold && vdot(toNearestEnemy, fwdDirMe) > 0.2;
  
  // Check pass viability
  const tgt = bestPass(st, idx);
  const hasPass = tgt !== null;
  
  // Check carry viability
  let canCarry = false;
  let carryDir = v(0, 0);
  if (distToGoal > 3.0 && !me.isGK) {
    const toGoalDir = vnorm(vsub(gc, me.pos));
    carryDir = toGoalDir;
    const coneAngle = isPhaseA ? 120 : 90;
    const searchDist = 15.0;
    const minConeDist = isPhaseA ? 4.0 : 3.0;
    
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
    canCarry = closestInCone >= minConeDist;
  }
  
  // ★ v9.5.0: DECISION FLOW - enemy in front → pass first; open space → carry first
  if (enemyBlockingForward && hasPass) {
    // Enemy blocking forward: ALWAYS pass if possible (no carry attempt)
    doPassTo(st, idx, tgt!);
    chosenAction = "pass-pressure";
    return;
  }
  
  // ★ v9.7.0: Strongly pass-first - carry only when extremely open and no pass available
  const carryPref = me.role === "FWD" ? 0.15 : me.role === "MID" ? 0.08 : 0.03;
  // Under pressure: never carry; very open: slight carry chance
  const pressureMod = closestEnemyDist < 6.0 ? -0.10 : closestEnemyDist > 12.0 ? 0.05 : 0;
  const carryChance = Math.max(0.02, Math.min(0.20, carryPref + pressureMod));
  
  if (canCarry && hasPass) {
    if (Math.random() < carryChance) {
      me.act = "carry";
      me.tgt = pitchClamp(vadd(me.pos, vscl(carryDir, 12.0)));
      me.face = carryDir;
      chosenAction = "carry";
      return;
    }
  } else if (canCarry && !hasPass) {
    me.act = "carry";
    me.tgt = pitchClamp(vadd(me.pos, vscl(carryDir, 12.0)));
    me.face = carryDir;
    chosenAction = "carry";
    return;
  }
  
  // Execute pass if available
  if (hasPass && tgt !== null) {
    if (isPhaseB) {
      const tm = st.pl[tgt];
      const isBlocked = laneBlocked(st, me.pos, tm.pos, me.team);
      if (isBlocked) {
        st.ball.phaseBBlockedPassStreak++;
        if (me.team === -1) st.stats.phaseBBlockedPassCount.blue++;
        else st.stats.phaseBBlockedPassCount.red++;
      } else {
        st.ball.phaseBBlockedPassStreak = 0;
      }
    } else {
      st.ball.phaseBBlockedPassStreak = 0;
    }
    doPassTo(st, idx, tgt);
    chosenAction = "pass";
    return;
  }
  
  // Try long pass
  const ltgt = bestLongPass(st, idx);
  if (ltgt !== null) {
    st.ball.phaseBBlockedPassStreak = 0;
    doLongPassTo(st, idx, ltgt);
    chosenAction = "longPass";
    return;
  }
  
  // v9.2.0: Phase A shot - allow shots when close enough
  if (distToGoal < PExt.shotRange) {
    const toGoal = vsub(gc, me.pos);
    const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
    let allowedAngle = distToGoal <= 8.0 ? 60 : 35;
    if (angle < allowedAngle) {
      const err = (1 - PExt.shotAccuracy) * 2.5;
      const t = v(gc.x, gc.y + rng(-err, err));
      kick(st, idx, PExt.shotSpeed, true, t);
      st.ball.phaseBBlockedPassStreak = 0;
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
  
  // ★ v9.3.0: Stack dispersion - return to home positions when clustered
  if (st.stackDetection.isStacked && !me.isGK) {
    const distToBall = vlen(vsub(b.pos, me.pos));
    if (distToBall < 4.0) {
      // Player is in clustered area - return toward home position instead of random direction
      me.tgt = pitchClamp(vlerp(me.pos, me.home, 0.6));
      me.face = vnorm(vsub(me.home, me.pos));
      return;
    }
  }
  
  // ★ v9.3.0: Counter-press - only closest 2 players press, others recover shape
  if (st.turnoverT > 0 && me.team === st.turnoverTeam && !me.isGK) {
    const distToBall = vlen(vsub(b.pos, me.pos));
    // Determine if I'm one of the 2 closest to ball
    const myTeamOutfield = st.pl.filter(p => p.team === me.team && !p.isGK);
    const sorted = myTeamOutfield.map(p => ({ idx: p.idx, d: vdist(p.pos, b.pos) })).sort((a, b) => a.d - b.d);
    const myPressRank = sorted.findIndex(s => s.idx === me.idx);
    
    if (myPressRank < 2 && distToBall > 0.8) {
      // Closest 2: press the ball
      me.tgt = pitchClamp(b.pos);
      me.face = vnorm(vsub(b.pos, me.pos));
      return;
    } else {
      // Others: recover toward home position (maintain formation)
      me.tgt = pitchClamp(vlerp(me.pos, me.home, 0.4));
      return;
    }
  }
  
  // ★ v9.8.0: Intended receiver moves toward incoming ball
  // In real soccer, the receiver always moves toward the pass to receive it
  if (b.free && b.intendedReceiverIdx === idx && b.kickTeam === me.team) {
    // I am the intended receiver of an in-flight pass from my team
    // Move toward where the ball is heading (intercept point)
    const ballSpeed = vlen(b.vel);
    if (ballSpeed > 1.0) {
      // Predict where ball will be when I can reach it
      const toBall = vsub(b.pos, me.pos);
      const distToBall = vlen(toBall);
      // Simple intercept: move toward ball's current position
      // (ball is moving toward me, so meeting point is between us)
      const meetPoint = distToBall > 2.0 
        ? vadd(b.pos, vscl(vnorm(b.vel), Math.min(distToBall * 0.3, 3.0)))
        : b.pos;
      me.tgt = pitchClamp(meetPoint);
      me.face = vnorm(toBall);
      me.act = "move";
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
        // v9.3.0: Dropping FW - blend between home and ahead-of-carrier
        const aheadX = carrier.pos.x - me.team * 8.0;
        const rawTgt = v(clamp(aheadX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5), me.home.y * 0.7);
        baseTgt = vlerp(me.home, rawTgt, 0.6); // 60% tactical, 40% home anchor
      } else {
        // Pinning FW: Pin opponent CBs, maintain width from home.y
        baseTgt = v(targetGoalX * 0.85, me.home.y * 0.6);
      }
    }
    // ③ CM's dynamic stagger (段差) and 3-1/3-2 formation
    else if (me.role === "MID" && Math.abs(me.home.y) <= 9.0) {
      const isWide = Math.abs(me.home.y) > 3.0;
      const isClosestCM = !isWide && nearestEx(st, carrier.pos, me.team, carrier.idx) === me.idx;
      
      if (isWide) {
        // v9.3.0: Wide MF - MUST maintain width, only shift forward moderately
        const wmX = carrier.pos.x - me.team * 5.0;
        const rawTgt = v(
          clamp(wmX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
          me.home.y  // Keep original wide position!
        );
        baseTgt = vlerp(me.home, rawTgt, 0.5); // 50% tactical, 50% home anchor
      } else if (isOwnHalf && isClosestCM) {
        // During own-half buildup, CM closest to ball drops to CB line
        baseTgt = v(carrier.pos.x + me.team * 2.0, carrier.pos.y > 0 ? 2.0 : -2.0);
      } else {
        // v9.3.0: CM pushes ahead but anchored to home
        const cmX = carrier.pos.x - me.team * 8.0;
        const rawTgt = v(clamp(cmX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5), me.home.y);
        baseTgt = vlerp(me.home, rawTgt, 0.55); // 55% tactical, 45% home anchor
      }
    }
    // ⑤ SB and CB's Rest Defence (2-3/3-2 remaining defense)
    else if (me.role === "DEF") {
      if (Math.abs(me.home.y) > 3.0) {
        const isBallSide = (carrier.pos.y * me.home.y) > 0;
        if (isBallSide) {
          // v9.3.0: Ball-side SB - maintain width, moderate forward push
          const sbX = carrier.pos.x - me.team * 3.0;
          const rawTgt = v(
            clamp(sbX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            me.home.y  // Keep wide position
          );
          baseTgt = vlerp(me.home, rawTgt, 0.4); // 40% tactical, 60% home anchor
        } else {
          // Far-side SB: tuck inside slightly but stay near home
          const rawTgt = v(carrier.pos.x + me.team * 4.0, Math.sign(me.home.y) * Math.abs(me.home.y) * 0.6);
          baseTgt = vlerp(me.home, rawTgt, 0.35); // 35% tactical, 65% home anchor
        }
      } else {
        // CB: Support behind ball, anchored to home
        const rawTgt = v(carrier.pos.x + me.team * 5.0, me.home.y * 0.5);
        baseTgt = vlerp(me.home, rawTgt, 0.4); // 40% tactical, 60% home anchor
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

    // ★ v9.3.0: Anti-clustering - push away from nearby teammates
    if (!me.isGK) {
      const minTeammateDist = 4.0; // Minimum 4m between teammates
      for (const p of st.pl) {
        if (p.idx === me.idx || p.team !== me.team || p.isGK) continue;
        const d = vdist(baseTgt, p.pos);
        if (d < minTeammateDist && d > 0.1) {
          const away = vnorm(vsub(baseTgt, p.pos));
          const pushDist = (minTeammateDist - d) * 0.5;
          baseTgt = vadd(baseTgt, vscl(away, pushDist));
        }
      }
    }

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
    
    // ★ v9.3.0: Defensive AI with formation-preserving positioning
    // Key principles:
    //   1. Only closest 1-2 players actively press the carrier
    //   2. Others maintain formation shape with slight ball-side shift
    //   3. DEF line stays compact as a unit
    //   4. MID covers zones, not just pass lanes
    //   5. FWD presses high but stays in own zone
    if (ballOwner && ballOwner.team !== me.team) {
      const carrier = ballOwner;
      const carrierVel = carrier.vel;
      const carrierSpeed = vlen(carrierVel);
      const carrierDir = carrierSpeed > 0.1 ? vnorm(carrierVel) : vnorm(vsub(v(-carrier.team * PExt.pitchHalfW, 0), carrier.pos));
      const myGoal = v(me.team * PExt.pitchHalfW, 0);
      
      // Calculate ball separation from dribbler
      const ballSep = vdist(b.pos, carrier.pos);
      const isDribblerPushed = ballSep > 0.5;
      
      // ★ Determine if I am the closest or 2nd closest to ball on my team
      const teamOutfield = st.pl.filter(p => p.team === me.team && !p.isGK);
      const sortedByDist = teamOutfield.map(p => ({ idx: p.idx, d: vdist(p.pos, ballPos) })).sort((a, b) => a.d - b.d);
      const myRank = sortedByDist.findIndex(s => s.idx === me.idx);
      const isFirstPresser = myRank === 0;
      const isSecondPresser = myRank === 1;
      
      // ★ DEF role: Maintain defensive line, only engage when very close
      if (me.role === "DEF") {
        // Loose ball nearby - go for it
        if (isDribblerPushed && distToBall < 3.0) {
          me.act = "move";
          me.tgt = { ...b.pos };
          me.face = vnorm(vsub(b.pos, me.pos));
          return;
        }
        
        // Close range AND I'm the closest presser: block carrier's path
        if (distToBall < 7.0 && isFirstPresser) {
          const carrierToGoal = vnorm(vsub(myGoal, carrier.pos));
          const blockDist = Math.max(2.0, distToBall * 0.35);
          const blockPoint = vadd(carrier.pos, vscl(carrierToGoal, blockDist));
          const lateralShift = vscl(vperp(carrierToGoal), carrierDir.y * 1.2);
          me.act = "move";
          me.tgt = pitchClamp(vadd(blockPoint, lateralShift));
          me.face = vnorm(vsub(carrier.pos, me.pos));
          return;
        }
        
        // ★ v9.3.0: All other DEFs maintain formation shape
        // Shift entire defensive line toward ball side, but stay anchored to home
        const ballShiftX = clamp((ballPos.x - me.home.x) * 0.25, -5.0, 5.0);
        const ballShiftY = clamp((ballPos.y - me.home.y) * 0.3, -4.0, 4.0);
        me.act = "move";
        me.tgt = pitchClamp(v(me.home.x + ballShiftX, me.home.y + ballShiftY));
        return;
      }
      
      // ★ MID role: Zone-based defense, only closest MID presses
      if (me.role === "MID") {
        // Loose ball nearby
        if (isDribblerPushed && distToBall < 3.0) {
          me.act = "move";
          me.tgt = { ...b.pos };
          me.face = vnorm(vsub(b.pos, me.pos));
          return;
        }
        
        // Close range AND I'm first/second presser: intercept
        if (distToBall < 6.0 && (isFirstPresser || isSecondPresser)) {
          const aheadPoint = vadd(carrier.pos, vscl(carrierDir, Math.min(carrierSpeed * 0.6, 3.0)));
          const cutoffPoint = vlerp(aheadPoint, myGoal, 0.08);
          me.act = "move";
          me.tgt = pitchClamp(cutoffPoint);
          me.face = vnorm(vsub(carrier.pos, me.pos));
          return;
        }
        
        // ★ v9.3.0: Zone defense - shift home toward ball but maintain shape
        const ballShiftX = clamp((ballPos.x - me.home.x) * 0.3, -4.0, 4.0);
        const ballShiftY = clamp((ballPos.y - me.home.y) * 0.35, -5.0, 5.0);
        me.act = "move";
        me.tgt = pitchClamp(v(me.home.x + ballShiftX, me.home.y + ballShiftY));
        return;
      }
      
      // ★ FWD role: Press high in own zone
      if (me.role === "FWD") {
        if (distToBall < 5.0 && isFirstPresser) {
          // Close: Press the carrier from front
          const pressPoint = vlerp(carrier.pos, myGoal, 0.06);
          me.act = "move";
          me.tgt = pitchClamp(pressPoint);
          me.face = vnorm(vsub(carrier.pos, me.pos));
          return;
        }
        
        // ★ v9.3.0: FWDs stay in their zone, shift slightly toward ball
        const ballShiftX = clamp((ballPos.x - me.home.x) * 0.2, -3.0, 3.0);
        const ballShiftY = clamp((ballPos.y - me.home.y) * 0.25, -3.0, 3.0);
        me.act = "move";
        me.tgt = pitchClamp(v(me.home.x + ballShiftX, me.home.y + ballShiftY));
        return;
      }
      
      // Fallback: slight shift toward ball from home
      const shiftX = clamp((ballPos.x - me.home.x) * 0.2, -3.0, 3.0);
      const shiftY = clamp((ballPos.y - me.home.y) * 0.2, -3.0, 3.0);
      me.act = "move";
      me.tgt = v(me.home.x + shiftX, me.home.y + shiftY);
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
  
  // ★ v9.7.0: Ball trail dots - emit when ball is in flight
  if (st.ball.free && vlen(st.ball.vel) > 2.0) {
    st.ballTrail.push({ pos: { ...st.ball.pos }, t: 0.6 });
    // Limit trail length
    if (st.ballTrail.length > 30) st.ballTrail.shift();
  }
  // Decay trail dots
  for (let i = st.ballTrail.length - 1; i >= 0; i--) {
    st.ballTrail[i].t -= dt;
    if (st.ballTrail[i].t <= 0) st.ballTrail.splice(i, 1);
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
    
    // ★ v9.4.0: Apply spin curve to ball trajectory
    // Side spin causes lateral deflection (Magnus effect)
    if (Math.abs(b.spinX) > 0.05) {
      // Perpendicular to velocity direction
      const speed = vlen(b.vel);
      if (speed > 0.5) {
        const perpX = -b.vel.y / speed;
        const perpY = b.vel.x / speed;
        // Curve force proportional to spin and speed
        const curveMag = b.spinX * speed * 0.008 * dt; // Subtle curve
        b.vel.x += perpX * curveMag;
        b.vel.y += perpY * curveMag;
      }
    }
    
    // ★ v9.4.0: Z-axis physics (gravity, bounce)
    if (b.z > 0 || b.vz > 0) {
      b.z += b.vz * dt;
      b.vz -= 9.81 * dt; // Gravity
      
      // Ground bounce
      if (b.z <= 0 && b.vz < 0) {
        b.z = 0;
        // Backspin reduces bounce (ball dies on landing)
        const bounceFactor = b.spinY < -0.5 ? 0.2 : 0.4; // Backspin = less bounce
        b.vz = -b.vz * bounceFactor;
        // Backspin also reduces forward speed on bounce
        if (b.spinY < -0.5) {
          b.vel = vscl(b.vel, 0.7); // Ball slows significantly with backspin
        }
        // Small bounces just stop
        if (Math.abs(b.vz) < 0.3) {
          b.vz = 0;
          b.z = 0;
        }
      }
    }
    
    // ★ v9.4.0: Spin decay over time
    if (Math.abs(b.spinX) > 0.01 || Math.abs(b.spinY) > 0.01) {
      const decay = Math.exp(-b.spinDecay * dt);
      b.spinX *= decay;
      b.spinY *= decay;
    }
    
    // ★ v9.8.0: Realistic grass friction
    // Real grass: 14m/s ball travels ~15m before stopping (fric=0.985)
    // Previous 0.92 was catastrophically high - ball only traveled 2.9m
    // Airborne: 0.998 (minimal air resistance), Lob: 0.99, Ground: 0.985
    const fric = b.z > 0.3 ? 0.998 : (b.lob > 0 ? 0.99 : 0.985);
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
    // ★ v9.4.0: Airborne balls (z > 1.5m) cannot be intercepted on the ground
    const canIntercept = b.z < 1.5; // Ball must be below head height
    if (b.cooldown <= 0 && canIntercept) {
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
