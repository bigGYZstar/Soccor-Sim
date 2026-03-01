// Game engine - all logic extracted from Home.tsx
// UI-independent, testable simulation core

import { State, Player, Ball, Role, V, Trail, Foot, FootSide, FootParams, SPEED_MULTIPLIERS } from './types';
import { P, FORMATIONS, FormationId } from './constants';
import {
  v, vadd, vsub, vscl, vlen, vnorm, vdist, vdot, vlerp, vang,
  clamp, rng, pitchClamp, vmove, distSegmentToPoint
} from './math';
import {
  emitLog,
  logPass, logPassReceive, logShot, logDribbleAttempt, logDribbleSuccess, logDribbleFail,
  logTackle, logIntercept, logGoal, logSave, logTurnover, logTrapFail,
  updateLogTTL
} from './actionLog';

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
      team: -1, isBlue: true, num: FORMATIONS[blueFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(blueFormation, i),
      posLabel: FORMATIONS[blueFormation].posLabels[i],
      jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
      passAndMoveTimer: 0,
      passAndMoveTarget: v(0, 0),
      wantsBall: false,
      committedRunTarget: null,
      committedRunTimer: 0,
    });
  }
  for (let i = 0; i < 11; i++) {
    const home = redPositions[i];
    const face = v(-1, 0);
    pl.push({
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: 1, isBlue: false, num: FORMATIONS[redFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(redFormation, i),
      posLabel: FORMATIONS[redFormation].posLabels[i],
      jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
      passAndMoveTimer: 0,
      passAndMoveTarget: v(0, 0),
      wantsBall: false,
      committedRunTarget: null,
      committedRunTimer: 0,
    });
  }
  // v9.5.0: Configure #10 players as ambidextrous (both feet equally skilled)
  for (const p of pl) {
    if (p.num === 10) {
      p.footParams.weakFootFreq = 8;      // 80% chance to use weak foot when it's closer
      p.footParams.weakFootAccuracy = 8;  // 80% accuracy with weak foot
    }
  }
  
  return pl;
}

/** ★ v10.1.0: Card data for custom team building */
export interface CardPlayerData {
  name: string;
  nameEn: string;
  overall: number;
  rarity: string;
  stats: { speed: number; shoot: number; pass: number; dribble: number; defense: number; physical: number };
  position: string;
  foot?: string; // "left" | "right" | "both"
  jerseyNum?: number;
}

/** ★ v10.1.0: Create players from gacha card data */
export function mkCustomPlayers(
  blueFormation: FormationId,
  redFormation: FormationId,
  blueCards: (CardPlayerData | null)[],
  redCards: (CardPlayerData | null)[]
): Player[] {
  const pl: Player[] = [];
  const bluePositions = formationToVecs(blueFormation, -1);
  const redPositions = formationToVecs(redFormation, 1);

  // Helper: map card stats to engine parameters
  // ★ v10.2.0: Deep stat reflection - card stats affect all engine parameters
  function applyCardStats(p: Player, card: CardPlayerData) {
    p.cardName = card.name;
    p.cardNameEn = card.nameEn;
    p.cardOverall = card.overall;
    p.cardRarity = card.rarity;
    if (card.jerseyNum) p.num = card.jerseyNum;

    // Foot preference from card
    if (card.foot === 'left') {
      p.footParams.dominantFoot = 'L';
      p.footParams.weakFootFreq = 2;
      p.footParams.weakFootAccuracy = 4;
    } else if (card.foot === 'both') {
      p.footParams.weakFootFreq = 8;
      p.footParams.weakFootAccuracy = 8;
    }

    // Ball control from dribble stat (1-10 scale, base 5)
    p.footParams.ballControl = Math.round(card.stats.dribble / 10);

    // ★ v10.2.0: Compute per-player stat modifiers
    // Stats are 1-99 scale. We map to multipliers around 1.0.
    // Base reference: stat=75 → multiplier=1.0
    // stat=50 → ~0.85, stat=99 → ~1.20
    const norm = (stat: number, low = 0.80, high = 1.25) => {
      const t = Math.max(0, Math.min(1, (stat - 40) / 60)); // 40-100 → 0-1
      return low + t * (high - low);
    };
    const s = card.stats;
    p.cardMods = {
      moveSpeed: norm(s.speed, 0.82, 1.22),
      dribbleSpeed: norm((s.speed + s.dribble) / 2, 0.82, 1.20),
      passAccuracy: norm(s.pass, 0.85, 1.12),
      shotAccuracy: norm(s.shoot, 0.80, 1.30),
      shotSpeed: norm((s.shoot + s.physical) / 2, 0.85, 1.20),
      passSpeed: norm(s.pass, 0.90, 1.15),
      interceptRadius: norm(s.defense, 0.80, 1.30),
      gkSaveBase: p.isGK ? norm((s.defense + s.physical) / 2, 0.85, 1.25) : 1.0,
      staminaDrain: norm(s.physical, 1.25, 0.75), // Higher physical = less drain (inverted)
      burstCooldown: norm(s.speed, 1.20, 0.70),   // Higher speed = shorter cooldown (inverted)
      // ★ v11.4.0: Curve parameters - based on pass/shoot stats
      curvePower: norm((s.pass + s.shoot) / 2, 0.65, 1.45),    // How much spin is applied
      curveAccuracy: norm(s.pass, 0.70, 1.30),                   // How controlled the curve is
    };
  }

  for (let i = 0; i < 11; i++) {
    const home = bluePositions[i];
    const face = v(1, 0);
    const p: Player = {
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: -1, isBlue: true, num: FORMATIONS[blueFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(blueFormation, i),
      posLabel: FORMATIONS[blueFormation].posLabels[i],
      jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
      passAndMoveTimer: 0,
      passAndMoveTarget: v(0, 0),
      wantsBall: false,
      committedRunTarget: null,
      committedRunTimer: 0,
    };
    if (blueCards[i]) applyCardStats(p, blueCards[i]!);
    pl.push(p);
  }
  for (let i = 0; i < 11; i++) {
    const home = redPositions[i];
    const face = v(-1, 0);
    const p: Player = {
      idx: pl.length,
      pos: { ...home },
      vel: v(0, 0),
      team: 1, isBlue: false, num: FORMATIONS[redFormation].jerseyNumbers[i], home, face,
      act: "idle", tgt: { ...home }, dt: Math.random() * PExt.decisionInterval, isGK: i === 0, slot: i, role: roleForSlot(redFormation, i),
      posLabel: FORMATIONS[redFormation].posLabels[i],
      jumpY: 0,
      turnDebt: 0,
      staminaShort: 1,
      burstT: 0,
      burstCD: 0,
      leftFoot: mkFoot("L", home, face),
      rightFoot: mkFoot("R", home, face),
      footParams: mkFootParams(),
      dribbleTouchPhase: 0,
      passAndMoveTimer: 0,
      passAndMoveTarget: v(0, 0),
      wantsBall: false,
      committedRunTarget: null,
      committedRunTimer: 0,
    };
    if (redCards[i]) applyCardStats(p, redCards[i]!);
    pl.push(p);
  }
  return pl;
}

/** ★ v10.1.0: Create state with custom team lineups from gacha cards */
export function mkCustomState(
  blueFormation: FormationId,
  redFormation: FormationId,
  blueCards: (CardPlayerData | null)[],
  redCards: (CardPlayerData | null)[]
): State {
  const st = mkState(blueFormation, redFormation);
  st.pl = mkCustomPlayers(blueFormation, redFormation, blueCards, redCards);
  return st;
}

export function mkState(blueFormation: FormationId = "4-4-2", redFormation: FormationId = "4-4-2"): State {
  return {
    pl: mkPlayers(blueFormation, redFormation),
    ball: { pos: v(0, 0), vel: v(0, 0), owner: null, free: true, shot: false, dead: 0, cooldown: 0, lob: 0, lastTouchTeam: 0, holdT: 0, holdAX0: 0, holdT0: 0, phaseBBlockedPassStreak: 0, kickSeq: 0, kickKind: null, kickTeam: 0, intendedReceiverIdx: null, kickActive: false, prevPos: v(0, 0), lastKickTime: 0, lastKickerIdx: -1, lastPasserIdx: -1, z: 0, vz: 0, spinX: 0, spinY: 0, spinDecay: 3.0, kickFoot: null, kickStyle: null },
    sL: 0, sR: 0, scoreBlue: 0, scoreRed: 0,
    time: 0, matchClock: 0, half: 1, halftimeShow: false, halftimeDone: false,
    matchPhase: "kickoff" as const,
    over: false, paused: false, pauseT: 0, koSide: Math.random() < 0.5 ? -1 : 1,  // Randomize initial kickoff
    kickoffReady: true, kickoffCountdown: 1.5,  // 1.5s countdown before kickoff is taken
    trail: null, flash: 0, flashTxt: "", restartT: 0,
    speed: "MID",  // ★ v11.6.0: Default = NORMAL (12× speed, ~7-8min for 90min match)
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
      possessionFrames: { blue: 0, red: 0 },
      // ★ v10.2.0: Per-player stats
      playerStats: Array.from({ length: 22 }, (_, i) => ({
        playerIdx: i, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
        passes: 0, passSuccess: 0, dribbles: 0, dribbleSuccess: 0,
        tackles: 0, tackleSuccess: 0, interceptions: 0, saves: 0,
        // ★ v10.4.0: Progressive pass tracking
        progPasses: 0, progPassSuccess: 0, longPasses: 0, longPassSuccess: 0,
        keyPasses: 0, chancesCreated: 0,
      })),
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
    ballTrail: [],
    // ★ v9.9.0: Action log
    actionLog: [],
    // ★ v10.3.0: Complete log for headless mode
    fullLog: [],
    possessionPush: { team: 0, duration: 0, pushLevel: 0 },
    screenEffect: { type: "none", timer: 0, text: "", playerNum: 0, team: 0 },
    // ★ v10.3.0: Heatmap data
    heatmaps: [],  // Will be initialized after players are created
    heatmapSampleCounter: 0,
    // ★ v11.0.0: Goal replay system
    goalReplays: [],
    replayBuffer: [],
    replayFrameCounter: 0,
    replayWallTimeAccum: 0,  // ★ v11.7.0: Wall-clock accumulator for speed-independent capture
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
          // ★ v10.2.0: Per-player pass success
          if (ball.lastKickerIdx >= 0 && st.stats.playerStats[ball.lastKickerIdx]) {
            st.stats.playerStats[ball.lastKickerIdx].passSuccess++;
            // ★ v10.4.0: Progressive pass success tracking
            if ((ball as any)._progPasserIdx === ball.lastKickerIdx) {
              st.stats.playerStats[ball.lastKickerIdx].progPassSuccess++;
              (ball as any)._progPasserIdx = undefined;
            }
          }
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
          // ★ v10.4.0: Per-player long pass success
          if (ball.lastKickerIdx >= 0 && st.stats.playerStats[ball.lastKickerIdx]) {
            st.stats.playerStats[ball.lastKickerIdx].passSuccess++;
            st.stats.playerStats[ball.lastKickerIdx].longPassSuccess++;
            (ball as any)._longPasserIdx = undefined;
          }
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
    // ★ v10.2.0: Per-player intercept tracking
    if (st.stats.playerStats[idx]) st.stats.playerStats[idx].interceptions++;
    // ★ v9.9.0: Log intercept
    logIntercept(st, pl[idx]);
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
  // ★ v10.2.0: Apply per-player accuracy modifiers
  const pShotAcc = PExt.shotAccuracy * (kicker.cardMods?.shotAccuracy ?? 1.0);
  const pPassAcc = PExt.passAccuracy * (kicker.cardMods?.passAccuracy ?? 1.0);
  const pLongAcc = PExt.longPassAccuracy * (kicker.cardMods?.passAccuracy ?? 1.0);
  // ★ v10.7.0: Distance-based shot accuracy decay for long-range shots
  let shotDistPenalty = 0;
  if (shot) {
    const distToGoal = vdist(kicker.pos, v(-kicker.team * PExt.pitchHalfW, 0));
    // Beyond 20m, accuracy degrades progressively
    if (distToGoal > 20) {
      shotDistPenalty = (distToGoal - 20) * 0.15; // Extra error per meter beyond 20m
    }
  }
  let baseErrRange = customErr !== undefined ? customErr : 
                 (shot ? (1 - Math.min(pShotAcc, 0.95)) * 8.0 + shotDistPenalty :
                  isLong ? (1 - Math.min(pLongAcc, 0.95)) * 1.5 : 
                  (1 - Math.min(pPassAcc, 0.99)) * 1.5);
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
  // ★ v10.2.0: Apply per-player speed modifiers
  const spdMod = shot ? (kicker.cardMods?.shotSpeed ?? 1.0) : (kicker.cardMods?.passSpeed ?? 1.0);
  // ★ v10.7.0: Distance-based shot speed scaling - ensure shots reach the goal
  let finalSpd = spd * spdMod;
  if (shot) {
    const distToGoal = vdist(kicker.pos, v(-kicker.team * PExt.pitchHalfW, 0));
    // For long-range shots (>20m), boost speed so ball reaches goal
    // Physics: with friction 0.985^(60*t), ball travels ~15m at speed 14m/s
    // We need speed proportional to distance to ensure arrival
    // Minimum speed to reach goal: approx dist * 1.2 (accounting for friction)
    const minSpeedToReach = distToGoal * 0.9;
    if (finalSpd < minSpeedToReach) {
      finalSpd = Math.min(minSpeedToReach, 35.0); // Cap at 35 m/s (powerful shot)
    }
  }
  b.vel = vscl(dir, finalSpd); b.dead = 0;
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
  
  // ★ v11.4.0: Calculate side spin based on foot, kick style, and player curve ability
  // Right foot inside kick: ball curves left (spinX < 0)
  // Right foot outside kick: ball curves right (spinX > 0)
  // Left foot inside kick: ball curves right (spinX > 0)
  // Left foot outside kick: ball curves left (spinX < 0)
  const footSign = usedFoot === "R" ? 1 : -1;
  const styleSign = b.kickStyle === "inside" ? -1 : b.kickStyle === "outside" ? 1 : 0;
  // ★ v11.4.0: Per-player curve power multiplier
  const pCurvePower = kicker.cardMods?.curvePower ?? 1.0;
  const pCurveAccuracy = kicker.cardMods?.curveAccuracy ?? 1.0;
  // Base spin intensity: shots and long passes get more spin
  // Increased from previous values for more visible curve effect
  const spinIntensity = shot ? 3.5 : isLong ? 3.0 : 1.2;
  // Apply curve power: higher stat = more spin
  // Random component: curveAccuracy controls how consistent the spin is
  const spinRandRange = isLong ? 1.2 : 0.8;
  const spinBase = spinIntensity * pCurvePower;
  b.spinX = footSign * styleSign * spinBase * (0.5 + Math.random() * spinRandRange);
  // curveAccuracy: high accuracy = spin stays close to intended, low = wild variation
  const accuracyNoise = (1.0 - pCurveAccuracy) * spinBase * rng(-0.5, 0.5);
  b.spinX += accuracyNoise;
  
  // Backspin/topspin: lofted passes get backspin, ground passes get slight topspin
  if (isLong) {
    b.spinY = -(1.5 + Math.random() * 1.5); // Backspin on lofted balls (stronger)
  } else if (shot) {
    b.spinY = 0.5 + Math.random() * 1.5; // Topspin on shots (dips more)
  } else {
    b.spinY = Math.random() * 0.4; // Minimal spin on ground passes
  }
  // ★ v11.4.0: Spin decay - slower decay for more visible curve effect
  b.spinDecay = isLong ? 1.5 : shot ? 2.0 : 3.0;
  
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
    // ★ v10.2.0: Per-player shot tracking
    if (st.stats.playerStats[kicker.idx]) st.stats.playerStats[kicker.idx].shots++;
    // ★ v9.9.0: Log shot
    const shotDist = vdist(kicker.pos, v(-kicker.team * PExt.pitchHalfW, 0));
    logShot(st, kicker, shotDist);
    
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
          // ★ v10.2.0: Per-player on-target shot
          if (st.stats.playerStats[kicker.idx]) st.stats.playerStats[kicker.idx].shotsOnTarget++;
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

/**
 * ★ v9.13.0: Space-scan algorithm for wide attackers (LM/RM/LW/RW)
 * Instead of home-anchor based positioning, scan forward space on the player's side
 * and move to the best open position to receive a pass.
 * 
 * Key principles:
 * - Stay on your side (LM stays left, RM stays right) but move forward into space
 * - Score candidate positions by: openness, forward progress, pass lane to carrier, offside safety
 * - Minimal home anchor: only a slight bias toward home.y to prevent crossing to wrong side
 */
function findBestSpaceForWide(st: State, me: Player, carrier: Player, forwardRunMode: boolean = false): V {
  const attackDir = -me.team; // Direction of attack
  const mySide = Math.sign(me.home.y); // -1 = left side, +1 = right side
  const pitchW = PExt.pitchHalfW;
  const pitchH = PExt.pitchHalfH;
  
  // Generate candidate positions: grid of points on my side, from current x to well ahead of carrier
  const candidates: { pos: V; score: number }[] = [];
  
  // ★ v9.17.0: In forward run mode, scan from carrier to opponent DEF line
  // Find opponent DEF line position
  const oppDefs = st.pl.filter(p => p.team !== me.team && p.role === "DEF");
  let oppDefLineX = -me.team * pitchW * 0.7;
  if (oppDefs.length > 0) oppDefLineX = oppDefs.reduce((s, p) => s + p.pos.x, 0) / oppDefs.length;
  
  const scanAhead = forwardRunMode ? 55.0 : 40.0; // Much further scan
  const startX = carrier.pos.x; // Always start from carrier
  const endX = forwardRunMode 
    ? oppDefLineX - attackDir * 5.0  // Scan up to opponent DEF line
    : startX - attackDir * scanAhead;
  
  // ★ v9.18.0: Y range - ENFORCE side discipline, use full width
  // Wide players MUST stay on their side to provide width
  const yCenter = me.home.y * 0.9; // Was 0.7 - stay much closer to home side
  const yRange = forwardRunMode ? 8.0 : 10.0; // Tighter range to prevent central drift
  
  // Generate 8x5 grid of candidate positions (more resolution)
  const xSteps = forwardRunMode ? 8 : 6;
  for (let xi = 0; xi < xSteps; xi++) {
    const t = xi / (xSteps - 1);
    const candX = startX + (endX - startX) * t;
    
    for (let yi = 0; yi < 5; yi++) {
      const yT = yi / 4;
      const candY = yCenter - yRange + yRange * 2 * yT;
      
      const pos = pitchClamp(v(
        clamp(candX, -pitchW + 3, pitchW - 3),
        clamp(candY, -pitchH + 2, pitchH - 2)
      ));
      
      // --- Score this candidate ---
      let score = 0;
      
      // 1. Openness: distance to nearest opponent (0-1, higher = more open)
      let minOppDist = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        const d = vdist(pos, opp.pos);
        if (d < minOppDist) minOppDist = d;
      }
      const open = Math.min(minOppDist / 5.0, 1.0);
      score += open * (forwardRunMode ? 10.0 : 8.0); // Stronger openness weight in forward run
      
      // 2. Forward progress - ★ v9.17.0: Very strong forward bias
      const forwardGain = (pos.x - carrier.pos.x) * attackDir;
      if (forwardGain > 0) {
        const fwdWeight = forwardRunMode ? 15.0 : 8.0; // Much stronger forward weight
        score += Math.min(forwardGain / 20.0, 1.0) * fwdWeight;
      } else {
        score += forwardGain * (forwardRunMode ? 2.0 : 0.5); // Stronger penalty for going backward
      }
      
      // ★ v9.17.0: Bonus for being near opponent DEF line (stretching the defense)
      const distToDefLine = Math.abs((pos.x - oppDefLineX) * attackDir);
      if (distToDefLine < 10.0) {
        score += (10.0 - distToDefLine) / 10.0 * (forwardRunMode ? 8.0 : 4.0);
      }
      
      // 3. Pass lane to carrier is open
      if (!laneBlocked(st, carrier.pos, pos, me.team)) {
        score += 5.0;
      } else {
        score -= forwardRunMode ? 2.0 : 4.0; // Less penalty in forward run (long pass can lob over)
      }
      
      // 4. ★ v9.18.0: Stay on my side (HARD constraint for width)
      const sideMatch = (pos.y * mySide > 0) ? 1.0 : 0.0;
      score += sideMatch * 8.0; // Was 3.0 - much stronger side discipline
      // Bonus for being near the touchline (using width)
      const touchlineDist = Math.abs(pos.y);
      if (touchlineDist > 20.0) score += 3.0; // Reward hugging the sideline
      // Penalty for drifting to wrong side
      if (pos.y * mySide < 0) score -= 6.0;
      
      // 5. Not too far from carrier (realistic pass distance)
      const distToCarrier = vdist(pos, carrier.pos);
      if (distToCarrier > 35.0) score -= 3.0;
      if (distToCarrier < 5.0) score -= 2.0;
      if (distToCarrier >= 8.0 && distToCarrier <= 25.0) score += 2.0;
      
      // 6. Not too close to teammates (avoid clustering)
      let minTeammateDist = Infinity;
      for (const tm of st.pl) {
        if (tm.team !== me.team || tm.idx === me.idx || tm.isGK) continue;
        const d = vdist(pos, tm.pos);
        if (d < minTeammateDist) minTeammateDist = d;
      }
      if (minTeammateDist < 4.0) score -= 3.0;
      
      // 7. Offside check
      if (isOffside(st, { ...me, pos } as Player, carrier.pos)) {
        score -= 50.0;
      }
      
      // 8. Space ahead from this position (can I advance further after receiving?)
      let spaceAheadFromPos = 15.0;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        const toOpp = vsub(opp.pos, pos);
        const proj = toOpp.x * attackDir * -1;
        if (proj > 0 && proj < spaceAheadFromPos) {
          const lateral = Math.abs(toOpp.y);
          if (lateral < 4.0) spaceAheadFromPos = proj;
        }
      }
      score += Math.min(spaceAheadFromPos / 8.0, 1.0) * (forwardRunMode ? 5.0 : 3.0);
      
      // ★ v9.15.0: Forward run bonus - prefer positions that are ahead of current position
      if (forwardRunMode) {
        const progressFromCurrent = (pos.x - me.pos.x) * attackDir;
        if (progressFromCurrent > 3.0) {
          score += Math.min(progressFromCurrent / 10.0, 1.0) * 4.0;
        }
      }
      
      candidates.push({ pos, score });
    }
  }
  
  // Sort by score and pick the best
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length > 0 && candidates[0].score > 0) {
    return candidates[0].pos;
  }
  
  // Fallback: move slightly ahead of carrier on my side
  return pitchClamp(v(
    carrier.pos.x - attackDir * 5.0,
    me.home.y * 0.8
  ));
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
    
    // ★ v9.13.0: Anti-pingpong penalty - penalize passing back to the player who just passed to me
    if (i === st.ball.lastPasserIdx) {
      score -= 8.0; // Strong penalty for immediate return pass (pingpong)
    }
    
    // Base forward progress bonus - ★ v9.13.0: Increased forward bonus from 1.0 to 1.5
    if (gp >= 0) {
      score += gp * 1.5; // Forward progress: strong bonus (was 1.0)
    } else if (tm.role === "DEF" || tm.isGK) {
      // ★ v9.10.0: DEF/GK backpass: no distance penalty (buildup recycling is natural)
      score += Math.max(gp * 0.1, -2.0); // Very mild penalty
    } else {
      score += Math.max(gp * 0.5, -5.0); // Other backpasses: halved and capped
    }
    
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
    const isPhaseA = ax < (w * 0.4);  // v10.0.0: consistent with Phase B threshold
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
    
    // ★ v9.17.0: Role-based routing — forward-pass priority
    // MF is the hub but MUST look forward first
    if (tm.role === "MID") score += 4.0; // Reduced from 6.0 to not over-attract lateral passes
    
    // FWD routing: combination play strongly encouraged
    if (me.role === "FWD" && tm.role === "MID") score += 8.0;   // FWD→MID: layoff
    if (me.role === "FWD" && tm.role === "DEF") score -= 10.0;  // FWD→DEF: heavily penalized
    if (me.role === "FWD" && tm.role === "FWD") score += 10.0;  // ★ v9.17.0: FWD→FWD: strong combination play (was 3.0)
    
    // MID is the playmaker — MUST prioritize forward passes to FWD
    if (me.role === "MID" && tm.role === "FWD") score += 18.0;  // ★ v9.17.0: MID→FWD: very strong (was 12.0)
    if (me.role === "MID" && tm.role === "MID") score += 3.0;   // MID→MID: circulation
    if (me.role === "MID" && tm.role === "DEF") score += underPressure ? 10.0 : 4.0; // ★ v9.17.0: Reduced backpass bonus (was 7.0)
    
    // DEF routing: look forward first, then MID, then CB switch
    if (me.role === "DEF" && tm.role === "MID") score += 10.0;  // DEF→MID: primary outlet
    if (me.role === "DEF" && tm.role === "FWD" && !isBlocked) score += 8.0; // ★ v9.17.0: DEF→FWD: long ball encouraged (was 2.0)
    if (me.role === "DEF" && tm.role === "DEF") {
      score += 4.0;   // DEF→DEF: CB switch (reduced from 6.0)
      const onOppositeSide = (me.pos.y * tm.pos.y < 0);
      if (onOppositeSide && underPressure) {
        score += 10.0;
      } else if (onOppositeSide) {
        score += 4.0;
      }
    }
    
    // GK buildup
    if (me.isGK && tm.role === "DEF") score += 12.0;
    if (me.isGK && tm.role === "MID") score += 8.0;
    
    // ★ v9.17.0: Bonus for passing to players near opponent DEF line (high up the pitch)
    // This rewards passes to FWDs who have pushed forward
    const tmForwardPos = (tm.pos.x * -me.team); // Higher = more forward
    if (tmForwardPos > PExt.pitchHalfW * 0.3 && isForward && !isBlocked) {
      score += 6.0; // Bonus for passing to players in advanced positions
    }
    
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
    
    // ★ v9.9.0: Pass-and-move bonus - teammate who just passed and is running into space
    if (tm.passAndMoveTimer > 0) {
      score += 10.0; // Very strong bonus for pass-and-move target
    }
    // ★ v9.19.0: WantsBall bonus - player actively requesting the ball (making a run)
    if (tm.wantsBall && !isBlocked) {
      score += 14.0; // Was 12.0 - strong bonus for players showing for the ball
      // ★ v9.19.0: Extra bonus for OVERTAKING runs (player ahead of carrier making a run)
      const wantGp = (tm.pos.x - me.pos.x) * -me.team;
      if (wantGp > 2.0) score += 8.0; // Was 5.0 - forward-running player gets strong attraction
      if (wantGp > 5.0) score += 6.0; // Deep forward run = even more attractive
      // ★ v9.19.0: Compound bonus — player in forward space + wants ball + open lane = ideal target
      if (wantGp > 5.0 && recvSpace > 5.0) {
        score += 10.0; // Was 8.0 - very strong compound bonus for player deep in space
      }
      // ★ v9.19.0: FWD/wide MID making overtaking run = highest priority pass target
      if (wantGp > 3.0 && (tm.role === "FWD" || Math.abs(tm.home.y) > 15.0)) {
        score += 8.0; // Extra bonus for FWD/wide players making forward runs
      }
    }
    
    // ★ v9.13.0: "Vision" bonus — reward passes that advance the ball significantly
    // This ensures the team looks for forward passes to players in space, not just safe sideways passes
    if (isForward && recvSpace > 5.0 && recvOpenness > 0.4 && !isBlocked) {
      // Forward pass to open player with space ahead = great vision
      const visionBonus = Math.min(gp / 8.0, 1.0) * Math.min(recvSpace / 8.0, 1.0) * 10.0;
      score += visionBonus;
    }
    
    // ★ v9.5.0: Lateral pass bonus (switch of play)
    if (isLateral && Math.abs(tm.pos.y - me.pos.y) > 8.0) {
      // Wide lateral pass to switch play
      if (!isBlocked) {
        score += PExt.lateralPassBonus + recvSpace * 0.3;
      }
    }
    
    // ★ v9.9.0: Back-pass evaluation - more nuanced, allows DEF buildup
    if (isBackward) {
      if (underPressure) {
        // Under pressure: back-pass to open teammate is a smart escape
        score += recvOpenness * 5.0 + 5.0;
      } else if (tm.role === "DEF" || tm.isGK) {
        // ★ v9.10.0: Backpass to DEF/GK is a natural part of buildup
        // Even without pressure, recycling to DEF is smart play
        score += recvOpenness > 0.2 ? 5.0 : 1.0;
      } else if (recvOpenness > 0.5) {
        score += PExt.backPassMinScore;
      } else {
        score -= 3.0;
      }
    }
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  if (bestScore < -8.0) return null;
  
  return bestIdx === -1 ? null : bestIdx;
}

// ★ v9.10.0: Find a DEF/GK behind the player to backpass to (for MF secondary movement)
function findBackpassTarget(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bestIdx = -1;
  let bestScore = -999;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || i === idx) continue;
    const tm = st.pl[i];
    // Only consider DEF and GK as backpass targets
    if (tm.role !== "DEF" && !tm.isGK) continue;
    const dist = vdist(me.pos, tm.pos);
    if (dist < 4.0 || dist > 30.0) continue;
    // Must be behind me (toward own goal)
    const gp = (tm.pos.x - me.pos.x) * -me.team;
    if (gp > -2.0) continue; // Must be at least 2m behind
    
    let score = 0;
    score += openness(st, tm) * 5.0; // Prioritize open defenders
    if (!laneBlocked(st, me.pos, tm.pos, me.team)) score += 10.0;
    if (tm.role === "DEF") score += 5.0;
    if (tm.isGK) score += 2.0;
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  return bestIdx === -1 ? null : bestIdx;
}

export function bestLongPass(st: State, idx: number): number | null {
  const me = st.pl[idx];
  let bestIdx = -1, bestScore = -999;
  
  for (let i = 0; i < st.pl.length; i++) {
    if (st.pl[i].team !== me.team || i === idx) continue;
    const tm = st.pl[i];
    const dist = vdist(me.pos, tm.pos);
    // ★ v9.15.0: Reduced minimum distance to 14m for lofted passes
    if (dist < 14.0 || dist > PExt.longPassMaxDist) continue;
    
    let score = 0;
    const gp = (tm.pos.x - me.pos.x) * -me.team;
    score += gp * 1.5;
    score += openness(st, tm) * 3.0; // Increased from 2.0
    if (isOffside(st, tm, me.pos)) score -= 100;
    
    // ★ v9.13.0: Strong bonus for long pass to player who wants ball in space
    if (tm.wantsBall) {
      score += 8.0; // Big bonus for player actively seeking the ball
    }
    
    // ★ v9.13.0: Space ahead bonus for long pass target
    const recvSpace = spaceAhead(st, tm);
    if (recvSpace > 5.0) {
      score += Math.min(recvSpace / 6.0, 1.0) * 5.0;
    }
    
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  
  return bestIdx === -1 ? null : bestIdx;
}

export function doPassTo(st: State, idx: number, targetIdx: number) {
  const me = st.pl[idx];
  const tm = st.pl[targetIdx];
  let tp = { ...tm.pos };
  
  const passDist = vdist(me.pos, tm.pos);
  
  // ★ v9.15.0: Auto-convert to lofted long pass when distance > 16m and target is ahead
  // Long-distance passes on the ground are unrealistic; they should be lofted
  const gp = (tm.pos.x - me.pos.x) * -me.team;
  if (passDist > 16.0 && gp > 2.0) {
    doLongPassTo(st, idx, targetIdx);
    return;
  }
  
  // ★ v9.4.0: Lead pass - aim slightly ahead of moving teammate
  if (tm.act === "move" || tm.act === "carry") {
    const lead = vnorm(vsub(tm.tgt, tm.pos));
    const leadDist = Math.min(passDist * 0.08, 1.5); // Subtle lead
    tp = vadd(tp, vscl(lead, leadDist));
  }
  
  // ★ v10.2.0: Per-player pass accuracy
  const pPassAcc2 = PExt.passAccuracy * (me.cardMods?.passAccuracy ?? 1.0);
  let baseErr = (1 - Math.min(pPassAcc2, 0.99)) * 1.5;
  if (passDist < 4.0) baseErr *= 0.5;
  else if (passDist < 7.0) baseErr *= 0.7;
  const inOwnHalf = me.team * me.pos.x > 0;
  if (inOwnHalf) baseErr *= 0.6;
  
  // ★ v9.15.0: Choose kicking foot and apply foot accuracy modifier
  const usedFoot = chooseFootForAction(me, st.ball.pos);
  const footMod = footAccuracyModifier(me, usedFoot, st.ball.pos);
  // Weak foot adds error to short passes too (but less than long passes)
  const footErr = (1.0 - footMod) * 0.3;
  baseErr += footErr;
  
  // v9.2.0: Set intendedReceiverIdx BEFORE kick() so it's not overwritten
  st.ball.intendedReceiverIdx = targetIdx;
  st.ball.lastPasserIdx = idx; // ★ v9.13.0: Track passer for anti-pingpong
  
  // ★ v9.8.0: Physics-based pass speed calculation
  const targetDist = vdist(me.pos, tp);
  const neededSpeed = targetDist * 0.9;
  const overshootFactor = 1.25;
  let passSpd = Math.max(6.0, Math.min(22.0, neededSpeed * overshootFactor));
  
  kick(st, idx, passSpd, false, tp, false, baseErr);
  
  // ★ v9.11.0: Enhanced pass-and-move - after passing, run forward into space
  // Key principle: pass then move into space to become a receiving option
  const attackDir = -me.team;
  const isBackpass = (tm.pos.x * attackDir) < (me.pos.x * attackDir); // target is behind me
  
  if (!me.isGK && me.role === "FWD") {
    // FWD: After backpass to MF/DEF, make a deep run into enemy territory
    if (isBackpass) {
      // Deep run forward after laying off - this is the key buildup move
      const deepRunDist = 10.0 + rng(0, 4.0);
      const lateralShift = rng(-5.0, 5.0);
      const runTarget = pitchClamp(v(
        me.pos.x + attackDir * deepRunDist,
        me.pos.y + lateralShift
      ));
      let nearestOpp = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        nearestOpp = Math.min(nearestOpp, vdist(runTarget, opp.pos));
      }
      if (nearestOpp > 3.0) {
        me.passAndMoveTimer = 1.8; // Longer run time for deep runs
        me.passAndMoveTarget = runTarget;
        me.wantsBall = true; // Signal that I want the ball back
      }
    } else {
      // Forward pass: short forward burst to stay in play
      const fwdOffset = 5.0 + rng(0, 3.0);
      const runTarget = pitchClamp(v(
        me.pos.x + attackDir * fwdOffset,
        me.pos.y + rng(-3.0, 3.0)
      ));
      let nearestOpp = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        nearestOpp = Math.min(nearestOpp, vdist(runTarget, opp.pos));
      }
      if (nearestOpp > 3.5) {
        me.passAndMoveTimer = 1.0;
        me.passAndMoveTarget = runTarget;
      }
    }
  } else if (!me.isGK && me.role === "MID") {
    // MID: After backpass to DEF, push forward into attacking space to receive
    if (isBackpass) {
      // Key buildup: pass back then advance to create passing lane
      const advanceDist = 6.0 + rng(0, 3.0);
      const lateralShift = rng(-4.0, 4.0);
      const runTarget = pitchClamp(v(
        me.pos.x + attackDir * advanceDist,
        me.pos.y + lateralShift
      ));
      let nearestOpp = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        nearestOpp = Math.min(nearestOpp, vdist(runTarget, opp.pos));
      }
      if (nearestOpp > 3.0) {
        me.passAndMoveTimer = 1.5;
        me.passAndMoveTarget = runTarget;
        me.wantsBall = true;
      }
    } else {
      // Forward pass: continue forward movement
      const fwdOffset = 4.0 + rng(0, 2.0);
      const runTarget = pitchClamp(v(
        me.pos.x + attackDir * fwdOffset,
        me.pos.y + rng(-2.0, 2.0)
      ));
      let nearestOpp = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        nearestOpp = Math.min(nearestOpp, vdist(runTarget, opp.pos));
      }
      if (nearestOpp > 3.5) {
        me.passAndMoveTimer = 1.0;
        me.passAndMoveTarget = runTarget;
      }
    }
  } else if (me.role === "DEF" && !me.isGK) {
    // DEF: After passing, push up slightly to compress the team shape
    const pushDist = isBackpass ? 1.5 : 3.0;
    const pushTarget = pitchClamp(v(
      me.pos.x + attackDir * pushDist,
      me.pos.y
    ));
    me.passAndMoveTimer = 0.8;
    me.passAndMoveTarget = pushTarget;
  }
  
  // v8.8.2: Track pass attempt
  const team = me.team === -1 ? 'blue' : 'red';
  st.stats.passAttempts[team]++;
  // ★ v10.2.0: Per-player pass tracking
  if (st.stats.playerStats[me.idx]) {
    st.stats.playerStats[me.idx].passes++;
    // ★ v10.4.0: Progressive pass tracking (forward pass advancing >10m toward opponent goal)
    const attackDir2 = -me.team;
    const progressDist = (tm.pos.x - me.pos.x) * attackDir2;
    if (progressDist > 10.0) {
      st.stats.playerStats[me.idx].progPasses++;
      // Mark ball for progressive pass success tracking
      (st.ball as any)._progPasserIdx = me.idx;
    }
  }
  
  // ★ v9.15.0: Action log with foot info
  logPass(st, me, tm.num, passDist, false, usedFoot, tm.pos);
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
  st.ball.lastPasserIdx = idx; // Track passer for anti-pingpong
  
  // ★ v9.15.0: Lofted long pass physics
  // Long passes are ALWAYS lofted (floating balls) with:
  // - Higher arc (more z-axis movement)
  // - More deviation due to wind/bounce
  // - Harder to trap on reception
  const lpDist = vdist(me.pos, tp);
  
  // ★ v9.15.0: Choose kicking foot and apply foot accuracy
  const usedFoot = chooseFootForAction(me, st.ball.pos);
  const footMod = footAccuracyModifier(me, usedFoot, st.ball.pos);
  
  // Speed: proportional to distance, but lofted balls travel differently
  const lpSpeed = Math.max(12.0, Math.min(28.0, lpDist * 0.7));
  
  // ★ v9.15.0: Error increases with distance AND foot accuracy
  // Base error from accuracy stat, amplified by distance and foot quality
  // ★ v10.2.0: Per-player long pass accuracy
  const pLongAcc2 = PExt.longPassAccuracy * (me.cardMods?.passAccuracy ?? 1.0);
  const baseErr = (1 - Math.min(pLongAcc2, 0.95)) * 2.0;
  const distErr = Math.max(0, (lpDist - 15.0) * 0.03); // Extra error for very long passes
  const footErr = (1.0 - footMod) * 0.5; // Weak foot adds error
  const totalErr = baseErr + distErr + footErr;
  
  kick(st, idx, lpSpeed, false, tp, true, totalErr);
  
  // ★ v9.15.0: Mark ball as lofted long pass for trap difficulty calculation
  st.ball.lob = 1.0;
  // Ensure proper z-axis for lofted ball (kick() already sets this, but reinforce)
  if (st.ball.z < 0.3) {
    st.ball.z = 0.3;
    st.ball.vz = Math.min(8.0, lpDist * 0.12 + 1.5);
  }
  
  // v8.8.2: Track long pass attempt
  const team = me.team === -1 ? 'blue' : 'red';
  st.stats.longPassAttempts[team]++;
  // ★ v10.4.0: Per-player long pass tracking
  if (st.stats.playerStats[me.idx]) {
    st.stats.playerStats[me.idx].passes++;
    st.stats.playerStats[me.idx].longPasses++;
    // Mark ball for long pass success tracking
    (st.ball as any)._longPasserIdx = me.idx;
  }
  
  // ★ v9.15.0: Action log with foot info
  logPass(st, me, tm.num, lpDist, true, usedFoot, tm.pos);
}

export function doDribble(st: State, idx: number) {
  const me = st.pl[idx];
  const team = me.team === -1 ? 'blue' : 'red';
  
  // v8.8.2: Track dribble attempt
  st.stats.dribbleAttempts[team]++;
  // ★ v10.2.0: Per-player dribble tracking
  if (st.stats.playerStats[me.idx]) st.stats.playerStats[me.idx].dribbles++;
  
  // ★ v8.9.0: Foot affects dribble control
  // Choose foot for dribble (ball is at player's feet)
  const usedFoot = chooseFootForAction(me, st.ball.pos);
  const footMod = footAccuracyModifier(me, usedFoot, st.ball.pos);
  // Dribble control adjusted by foot accuracy
  // ★ v10.2.0: Per-player dribble modifier from card stats
  const dribbleMod = me.cardMods?.dribbleSpeed ?? 1.0; // reuse dribbleSpeed as general dribble skill
  const effectiveControl = Math.min(PExt.dribbleControl * footMod * dribbleMod, 0.95);
  
  if (Math.random() > effectiveControl) {
    const fd = vnorm(v(rng(-1, 1), rng(-1, 1)));
    kick(st, idx, 3, false, vadd(me.pos, vscl(fd, 2)));
    // ★ v9.8.0: Mark as dribble loss, not a pass
    st.ball.kickKind = "DRIBBLE_LOST";
    st.ball.kickActive = false; // Don't track as pass attempt
    // ★ v9.9.0: Log dribble fail
    logDribbleFail(st, me, 0); // tackler unknown at this point
    return;
  }
  
  // v8.8.2: Dribble success (not lost immediately)
  st.stats.dribbleSuccess[team]++;
  // ★ v10.2.0: Per-player dribble success
  if (st.stats.playerStats[me.idx]) st.stats.playerStats[me.idx].dribbleSuccess++;
  // ★ v9.9.0: Log dribble attempt (success path)
  logDribbleAttempt(st, me);
  
  // ★ v9.11.0: Screen effect for dribble breakthrough
  const pName = me.cardName || `#${me.num}`;
  const dribbleTexts = [
    `★ ${pName} 突破！！`,
    `${pName} ドリブル成功！`,
    `★ ${pName} 抜いた！！`,
    `${pName} 美技！！`,
  ];
  st.screenEffect = {
    type: "dribbleSuccess",
    timer: 1.5,
    text: dribbleTexts[Math.floor(Math.random() * dribbleTexts.length)],
    playerNum: me.num,
    team: me.team,
  };
  
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
  
  // ★ v9.11.0: GK buildup - carry forward slightly then distribute to CB
  if (me.isGK && me.act === "carry") {
    const carryTime = st.ball.holdT;
    // GK carries forward for 0.3-0.6s to draw press, then distributes
    if (carryTime < 0.4) {
      // Step forward slightly to draw opponents
      const fwd = v(-me.team * 3.0, 0);
      me.tgt = pitchClamp(vadd(me.home, fwd));
      me.act = "carry";
      return;
    }
    // After 0.4s, distribute to CB or MF
    const passTgt = bestPass(st, idx);
    if (passTgt !== null) {
      doPassTo(st, idx, passTgt);
      return;
    }
    // Fallback: long pass to MF
    const longTgt = bestLongPass(st, idx);
    if (longTgt !== null) {
      doLongPassTo(st, idx, longTgt);
      return;
    }
    // Last resort: kick forward
    kick(st, idx, 12, false, v(-me.team, 0), false);
    return;
  }

  // ★ v10.0.0: SHOT PRIORITY - if close to goal, shoot before anything else
  if (!me.isGK) {
    const distToGoalEarly = vdist(me.pos, gc);
    const axEarly = me.pos.x * (-me.team);
    if (distToGoalEarly < 35.0 && axEarly > 5.0) {  // In opponent half (5m+), within 35m
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      let shotAngle = 90;
      if (distToGoalEarly <= 8.0) shotAngle = 90;
      else if (distToGoalEarly <= 14.0) shotAngle = 75;
      else if (distToGoalEarly <= 22.0) shotAngle = 60;
      else shotAngle = 40;  // Long range shots need narrower angle
      if (angle < shotAngle) {
        const pSA = (1 - PExt.shotAccuracy * (me.cardMods?.shotAccuracy ?? 1.0)) * 2.5;
        const t = v(gc.x, gc.y + rng(-pSA, pSA));
        kick(st, idx, PExt.shotSpeed, true, t);
        chosenAction = "shot-priority";
        return;
      }
    }
  }

  // ★ v9.21.0: FORWARD CARRY PRIORITY - if path to goal is clear, carry forward immediately
  // This check happens BEFORE carry state lock to ensure first-touch carry toward goal
  if (!me.isGK && st.ball.holdT < 0.15) {
    const toGoalDir = vnorm(vsub(gc, me.pos));
    const fwdDir = v(-me.team, 0);
    // Check if facing roughly toward goal (within 90 degrees)
    const facingGoal = vdot(me.face, fwdDir) > 0.0;
    
    // Check for clear path: no enemy within cone toward goal
    let clearPathDist = 15.0;
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const toOpp = vsub(p.pos, me.pos);
      const proj = vdot(toOpp, toGoalDir);
      if (proj < 0 || proj > 15.0) continue;
      const lateral = Math.abs(toOpp.y * toGoalDir.x - toOpp.x * toGoalDir.y);
      if (lateral < 2.5 && proj < clearPathDist) {
        clearPathDist = proj;
      }
    }
    
    // If clear path > 6m ahead and facing forward, carry toward goal
    const minClearDist = me.role === "FWD" ? 5.0 : me.role === "MID" ? 6.0 : 8.0;
    if (clearPathDist >= minClearDist && (facingGoal || clearPathDist >= 10.0)) {
      me.act = "carry";
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, Math.min(clearPathDist - 1.0, 12.0))));
      me.face = toGoalDir;
      chosenAction = "carry-forwardClear";
      return;
    }
  }

  // ★ v9.7.0: Carry state lock - aggressive pass-first with short carry windows
  if (me.act === "carry") {
    let closestEnemy = Infinity;
    let closestEnemyPos = v(0, 0);
    for (const p of st.pl) {
      if (p.team === me.team) continue;
      const d = vdist(me.pos, p.pos);
      if (d < closestEnemy) { closestEnemy = d; closestEnemyPos = p.pos; }
    }
    
    // ★ v9.13.0: Space-aware carry windows - longer when space ahead
    const carryTime = st.ball.holdT;
    const spaceAheadCarrier = spaceAhead(st, me);
    // ★ v9.21.0: Extended carry windows when path to goal is clear
    let maxCarryTime: number;
    if (me.role === "FWD") {
      maxCarryTime = spaceAheadCarrier > 10.0 ? 2.5 : spaceAheadCarrier > 7.0 ? 1.8 : spaceAheadCarrier > 4.0 ? 1.2 : 0.6;
    } else if (me.role === "MID" && Math.abs(me.home.y) > 15.0) {
      maxCarryTime = spaceAheadCarrier > 10.0 ? 2.0 : spaceAheadCarrier > 7.0 ? 1.4 : spaceAheadCarrier > 4.0 ? 0.9 : 0.5;
    } else if (me.role === "MID") {
      maxCarryTime = spaceAheadCarrier > 8.0 ? 1.0 : spaceAheadCarrier > 5.0 ? 0.6 : 0.4;
    } else {
      maxCarryTime = spaceAheadCarrier > 8.0 ? 0.5 : 0.3;
    }
    
    // ★ v9.21.0: Hard limit extended for clear-path carries
    const hardLimit = me.role === "FWD" ? 3.0 : me.role === "MID" ? 2.2 : 1.2;
    if (carryTime > hardLimit) {
      const passTgt = bestPass(st, idx);
      if (passTgt !== null) {
        doPassTo(st, idx, passTgt);
        return;
      }
      // No pass available: forced dribble to break out
      doDribble(st, idx);
      return;
    }
    
    // ★ v9.15.0: During carry, check for proactive long pass to wide player making run
    if (carryTime > 0.15 && !me.isGK) {
      let bestLPTarget: number | null = null;
      let bestLPScore = 0;
      for (let i = 0; i < st.pl.length; i++) {
        const tm = st.pl[i];
        if (tm.team !== me.team || i === idx) continue;
        if (!tm.wantsBall) continue;
        const isWide = Math.abs(tm.home.y) > 15.0 || (tm.role === "FWD" && me.role !== "FWD");
        if (!isWide) continue;
        const dist = vdist(me.pos, tm.pos);
        if (dist < 10.0 || dist > 40.0) continue;
        const gp = (tm.pos.x - me.pos.x) * -me.team;
        if (gp < 2.0) continue;
        const op = openness(st, tm);
        if (op < 1.5) continue;
        const score = gp * 1.5 + op * 2.0 + 8.0;
        if (score > bestLPScore) { bestLPScore = score; bestLPTarget = i; }
      }
      if (bestLPTarget !== null && bestLPScore > 10.0 && Math.random() < 0.18) {
        doLongPassTo(st, idx, bestLPTarget);
        return;
      }
    }
    
    // ★ v9.14.0: Check for pass after grace period
    // FWD with space: lower pass probability to allow carry advancement
    // But ALWAYS prefer FORWARD passes over backward ones
    const graceTime = me.role === "FWD" ? 0.40 : 0.30;
    if (carryTime > graceTime) {
      const passTgt = bestPass(st, idx);
      if (passTgt !== null) {
        const timeRatio = Math.min(1.0, carryTime / maxCarryTime);
        const passGp = (st.pl[passTgt].pos.x - me.pos.x) * -me.team;
        const passIsForward = passGp > 2.0;
        
        let passProb: number;
        if (me.role === "FWD" && spaceAheadCarrier > 5.0) {
          // FWD with space: prefer forward passes, resist backward ones
          if (passIsForward) {
            passProb = 0.50 + timeRatio * 0.40; // Eagerly pass forward
          } else {
            passProb = 0.10 + timeRatio * 0.25; // Resist backward passes
          }
        } else if (me.role === "MID" && Math.abs(me.home.y) > 15.0 && spaceAheadCarrier > 5.0) {
          if (passIsForward) {
            passProb = 0.45 + timeRatio * 0.40;
          } else {
            passProb = 0.20 + timeRatio * 0.30;
          }
        } else {
          passProb = 0.55 + timeRatio * 0.35;
        }
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
    
    // ★ v9.13.0: Continue carry when space ahead - more aggressive for FWD/Wide MF
    if (closestEnemy > 5.0 && carryTime < maxCarryTime && spaceAheadCarrier > 4.0) {
      const toGoalDir = vnorm(vsub(gc, me.pos));
      me.tgt = pitchClamp(vadd(me.pos, vscl(toGoalDir, 12.0)));
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
  const isPhaseA = ax < (w * 0.4);  // v10.0.0: Phase A = own half + midfield (ax < 21m)
  const isPhaseB = ax >= (w * 0.4);  // v10.0.0: Phase B = attacking half (ax >= 21m, was 2/3=35m)
  
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
        const pSA = (1 - PExt.shotAccuracy * (me.cardMods?.shotAccuracy ?? 1.0)) * 2.5;
        const t = v(gc.x, gc.y + rng(-pSA, pSA));
        kick(st, idx, PExt.shotSpeed, true, t);
        if (me.team === -1) st.stats.forcedShotsFromBlocked.blue++;
        else st.stats.forcedShotsFromBlocked.red++;
        st.ball.phaseBBlockedPassStreak = 0;
        chosenAction = "shot-forced";
        return;
      }
    }
    
    // v10.0.0: Extended shot range with wider angle limits
    const shouldPrioritizeShot = distToGoal < PExt.shotRange;
    if (shouldPrioritizeShot) {
      const toGoal = vsub(gc, me.pos);
      const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
      let allowedAngle = 45;  // v10.0.0: wider base angle
      if (distToGoal <= 5.0) allowedAngle = 90;
      else if (distToGoal <= 10.0) allowedAngle = 75;
      else if (distToGoal <= 18.0) allowedAngle = 60;
      else if (distToGoal <= 28.0) allowedAngle = 45;
      else allowedAngle = 35;  // Long range shots
      
      if (angle < allowedAngle) {
        const pSA2 = (1 - PExt.shotAccuracy * (me.cardMods?.shotAccuracy ?? 1.0)) * 2.5;
        const t = v(gc.x, gc.y + rng(-pSA2, pSA2));
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
  // ★ v9.15.0: Proactive long pass to wide player making a forward run
  // Before normal pass decision, check if a wide player is ahead in space and wants ball
  if (!me.isGK && me.role !== "FWD") {
    let bestWideTarget: number | null = null;
    let bestWideScore = 0;
    for (let i = 0; i < st.pl.length; i++) {
      const tm = st.pl[i];
      if (tm.team !== me.team || i === idx) continue;
      if (!tm.wantsBall) continue;
      const isWide = Math.abs(tm.home.y) > 15.0 || tm.role === "FWD";
      if (!isWide) continue;
      const dist = vdist(me.pos, tm.pos);
      if (dist < 10.0 || dist > PExt.longPassMaxDist) continue;
      const gp = (tm.pos.x - me.pos.x) * -me.team;
      if (gp < 2.0) continue; // Must be ahead
      const op = openness(st, tm);
      if (op < 2.0) continue; // Must have some space
      const score = gp * 1.5 + op * 2.0 + (tm.wantsBall ? 8.0 : 0);
      if (score > bestWideScore) {
        bestWideScore = score;
        bestWideTarget = i;
      }
    }
    if (bestWideTarget !== null && bestWideScore > 10.0 && Math.random() < 0.45) {
      doLongPassTo(st, idx, bestWideTarget);
      chosenAction = "longPass-wideRun";
      return;
    }
  }
  
  if (enemyBlockingForward && hasPass) {
    // Enemy blocking forward: ALWAYS pass if possible (no carry attempt)
    doPassTo(st, idx, tgt!);
    chosenAction = "pass-pressure";
    return;
  }
  
  // ★ v9.21.0: Space-aware carry decision - much more aggressive when path is clear
  const spaceAheadOfMe = spaceAhead(st, me);
  let carryPref: number;
  if (me.role === "FWD") {
    // FWD: strongly prefer carry when space is available
    carryPref = spaceAheadOfMe > 10.0 ? 0.85 : spaceAheadOfMe > 7.0 ? 0.65 : spaceAheadOfMe > 4.0 ? 0.40 : 0.12;
  } else if (me.role === "MID" && Math.abs(me.home.y) > 15.0) {
    // Wide MF (LM/RM): aggressive carry on the wing when space exists
    carryPref = spaceAheadOfMe > 10.0 ? 0.75 : spaceAheadOfMe > 7.0 ? 0.55 : spaceAheadOfMe > 4.0 ? 0.30 : 0.08;
  } else if (me.role === "MID") {
    carryPref = spaceAheadOfMe > 8.0 ? 0.35 : spaceAheadOfMe > 5.0 ? 0.15 : 0.08;
  } else {
    // DEF: carry when lots of space (e.g., SB overlap)
    carryPref = spaceAheadOfMe > 10.0 ? 0.25 : spaceAheadOfMe > 7.0 ? 0.10 : 0.03;
  }
  // Under pressure: reduce carry; very open: boost carry
  const pressureMod = closestEnemyDist < 5.0 ? -0.15 : closestEnemyDist > 10.0 ? 0.10 : 0;
  const carryChance = Math.max(0.02, Math.min(0.90, carryPref + pressureMod));
  
  if (canCarry && hasPass) {
    // ★ v9.13.0: If best pass is backward and I have space ahead, prefer carry
    const bestPassGp = tgt !== null ? (st.pl[tgt].pos.x - me.pos.x) * -me.team : 0;
    const passIsBackward = bestPassGp < -2.0;
    const shouldCarry = passIsBackward && spaceAheadOfMe > 5.0 ? 0.70 : carryChance;
    
    if (Math.random() < shouldCarry) {
      me.act = "carry";
      me.tgt = pitchClamp(vadd(me.pos, vscl(carryDir, 12.0)));
      me.face = carryDir;
      chosenAction = "carry";
      return;
    }
  } else if (canCarry && !hasPass) {
    // ★ v9.10.0: MF secondary movement - when no short pass, try alternatives before carrying
    if (me.role === "MID") {
      // 2nd option: Long pass to FWD to relieve pressure
      const lp = bestLongPass(st, idx);
      if (lp !== null) {
        doLongPassTo(st, idx, lp);
        chosenAction = "longPass-relief";
        return;
      }
      // 3rd option: Backpass to DEF/GK and advance (pass & move)
      const backTgt = findBackpassTarget(st, idx);
      if (backTgt !== null) {
        doPassTo(st, idx, backTgt);
        chosenAction = "backpass-advance";
        return;
      }
    }
    me.act = "carry";
    me.tgt = pitchClamp(vadd(me.pos, vscl(carryDir, 12.0)));
    me.face = carryDir;
    chosenAction = "carry";
    return;
  }
  
  // ★ v9.13.0: Before normal pass, check if a wide attacker is in forward space wanting the ball
  // If so, try long pass to them even if a short pass is available (progressive play)
  if (hasPass && tgt !== null) {
    const shortTm = st.pl[tgt];
    const shortGp = (shortTm.pos.x - me.pos.x) * -me.team;
    // If the short pass is backward or lateral, check if there's a better long option
    if (shortGp < 3.0 && !isPhaseB) {
      const lpTgt = bestLongPass(st, idx);
      if (lpTgt !== null) {
        const lpTm = st.pl[lpTgt];
        const lpGp = (lpTm.pos.x - me.pos.x) * -me.team;
        // Long pass to forward player who wants ball = better than safe short pass
        if (lpGp > 8.0 && lpTm.wantsBall && openness(st, lpTm) > 0.3) {
          doLongPassTo(st, idx, lpTgt);
          chosenAction = "longPass-vision";
          return;
        }
      }
    }
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
  
  // v10.0.0: Phase A shot - allow shots when close enough (widened angles)
  if (distToGoal < PExt.shotRange) {
    const toGoal = vsub(gc, me.pos);
    const angle = Math.abs(Math.atan2(toGoal.y, toGoal.x * -me.team) * (180 / Math.PI));
    let allowedAngle = 45;
    if (distToGoal <= 8.0) allowedAngle = 75;
    else if (distToGoal <= 18.0) allowedAngle = 60;
    else if (distToGoal <= 28.0) allowedAngle = 45;
    else allowedAngle = 35;
    if (angle < allowedAngle) {
      const pSA3 = (1 - PExt.shotAccuracy * (me.cardMods?.shotAccuracy ?? 1.0)) * 2.5;
      const t = v(gc.x, gc.y + rng(-pSA3, pSA3));
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
    const phase = ax < (w * 0.4) ? "A" : "B";
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
  
  // ★ v9.9.0: Pass-and-move execution - player who just passed runs forward
  if (me.passAndMoveTimer > 0 && myTeamHasBall) {
    me.passAndMoveTimer -= P.decisionInterval;
    me.tgt = pitchClamp(me.passAndMoveTarget);
    me.act = "move";
    me.face = vnorm(vsub(me.passAndMoveTarget, me.pos));
    // Mark as wanting ball (for bestPass bonus)
    me.wantsBall = true;
    return;
  } else {
    me.passAndMoveTimer = 0;
    me.wantsBall = false;
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
    // ★ v10.7.0: GK stays closer to goal to be ready for counter-attacks
    if (me.isGK) {
      if (isOwnHalf) {
        // During own-half buildup, position in penalty area between CBs as "back +1"
        // But don't go too far from goal
        baseTgt = v(me.team * (PExt.pitchHalfW - 4.0), carrier.pos.y * 0.2);
      } else {
        // When pushed into opponent half, maintain high line but not too far
        baseTgt = v(me.team * (PExt.pitchHalfW - 8.0), 0);
      }
    }
    // ② FWD role division - ★ v9.17.0: Aggressive forward positioning based on opponent lines
    else if (me.role === "FWD") {
      const attackDir = -me.team;
      const push = st.possessionPush.team === me.team ? st.possessionPush.pushLevel : 0;
      const isWideFwd = (me.posLabel === "LW" || me.posLabel === "RW") && Math.abs(me.home.y) > 10.0;
      
      // ★ v9.17.0: Detect opponent line positions (used by all FWDs)
      const oppDefs = st.pl.filter(p => p.team !== me.team && p.role === "DEF");
      const oppMids = st.pl.filter(p => p.team !== me.team && p.role === "MID");
      let oppDefLineX = -me.team * PExt.pitchHalfW * 0.7; // Default: 70% of pitch toward their goal
      let oppMidLineX = 0;
      if (oppDefs.length > 0) {
        oppDefLineX = oppDefs.reduce((s, p) => s + p.pos.x, 0) / oppDefs.length;
      }
      if (oppMids.length > 0) {
        oppMidLineX = oppMids.reduce((s, p) => s + p.pos.x, 0) / oppMids.length;
      }
      // Pocket = between opponent MID and DEF lines
      const pocketX = (oppMidLineX + oppDefLineX) / 2;
      // Shoulder of DEF line = just behind the DEF line (stay onside)
      const shoulderX = oppDefLineX + me.team * 2.0; // 2m behind DEF line (safe from offside)
      
      if (isWideFwd) {
        // ★ v9.17.0: Wide FWD (LW/RW) - space-based movement, always aggressive
        baseTgt = findBestSpaceForWide(st, me, carrier, push > 0.1);
        me.wantsBall = true;
      } else {
        // ★ v9.17.0: Central FWD (ST, LST, RST) - position based on OPPONENT lines, not carrier
        // Key principle: FWD should ALWAYS be near the opponent DEF line, regardless of where the ball is
        // This creates the forward target that MF/DEF need to pass to
        
        // Check my personal pressure (am I being tightly marked?)
        let myPressure = Infinity;
        for (const opp of st.pl) {
          if (opp.team === me.team) continue;
          myPressure = Math.min(myPressure, vdist(me.pos, opp.pos));
        }
        const iAmMarked = myPressure < 3.0;
        
        // Find the other FWD on my team (for combination play)
        const otherFwd = st.pl.find(p => p.team === me.team && p.role === "FWD" && p.idx !== me.idx && !p.isGK);
        
        // ★ v9.18.0: Determine lateral position - enforce channel discipline
        let lateralY: number;
        if (otherFwd) {
          // Two strikers: MUST stay in their assigned channel
          const myChannel = me.home.y < 0 ? -1 : 1; // -1 = left, +1 = right
          // ★ v9.18.0: Wider spread to use pitch width
          lateralY = myChannel * (10.0 + rng(0, 5.0)); // Spread 10-15m from center (was 8-12)
          
          // If marked, drift away from marker but STAY on assigned side
          if (iAmMarked) {
            const markerY = st.pl.reduce((closest, p) => {
              if (p.team === me.team) return closest;
              const d = vdist(me.pos, p.pos);
              return d < closest.d ? { d, y: p.pos.y } : closest;
            }, { d: Infinity, y: 0 }).y;
            // Move away from marker but stay on correct side
            lateralY = me.pos.y + (me.pos.y - markerY) * 0.4;
            // Clamp to stay on assigned side
            if (myChannel > 0) lateralY = clamp(lateralY, 2.0, PExt.pitchHalfH - 5);
            else lateralY = clamp(lateralY, -PExt.pitchHalfH + 5, -2.0);
          }
        } else {
          // Solo striker: stay central but drift toward ball side
          lateralY = carrier.pos.y * 0.3 + rng(-3.0, 3.0);
        }
        
        // ★ v9.17.0: Forward position target - ALWAYS near opponent DEF line
        // The FWD's job is to stretch the defense by staying high
        let targetX: number;
        if (isOwnHalf && carrier.role === "DEF") {
          // When ball is deep in own half with DEF: drop slightly to offer outlet
          // But still stay in the opponent's half or near halfway
          targetX = pocketX; // Stay in the pocket even when ball is deep
          me.wantsBall = true;
        } else {
          // Normal: position between opponent MID and DEF lines (the pocket)
          // Use the more advanced position: pocket or shoulder
          const pocketAx = pocketX * attackDir;
          const shoulderAx = shoulderX * attackDir;
          // Prefer shoulder (closer to DEF line) when push is high
          const blendToShoulder = Math.min(1.0, push * 1.5); // At push=0.67, fully at shoulder
          targetX = pocketX + (shoulderX - pocketX) * blendToShoulder;
          me.wantsBall = true;
        }
        
        // ★ v9.17.0: NO home anchor for FWD during attack!
        // FWD position is purely based on opponent lines
        baseTgt = v(
          clamp(targetX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
          clamp(lateralY, -PExt.pitchHalfH + 5, PExt.pitchHalfH - 5)
        );
        
        // Offside safety: if target would be offside, pull back to shoulder
        if (isOffside(st, { ...me, pos: baseTgt } as Player, carrier.pos)) {
          baseTgt = v(
            clamp(shoulderX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            baseTgt.y
          );
        }
      }
    }
    // ③ MID positioning - ★ v9.17.0: Aggressive forward movement, space-based for wide players
    else if (me.role === "MID") {
      const attackDir = -me.team;
      const push = st.possessionPush.team === me.team ? st.possessionPush.pushLevel : 0;
      
      // Carrier pressure check
      let carrierPressureMid = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        carrierPressureMid = Math.min(carrierPressureMid, vdist(carrier.pos, opp.pos));
      }
      const carrierPressedMid = carrierPressureMid < 6.0;
      
      const isWide = Math.abs(me.home.y) > 15.0; // LM/RM/LAM/RAM
      const isSemiWide = Math.abs(me.home.y) > 3.0 && !isWide; // CM with offset
      const isCAM = me.posLabel === "CAM"; // Central attacking midfielder
      const isClosestCM = !isWide && !isSemiWide && !isCAM && nearestEx(st, carrier.pos, me.team, carrier.idx) === me.idx;
      
      if (isWide) {
        // ★ v9.17.0: Wide MF - ALWAYS use space-based movement, no stable possession requirement
        // Wide players should constantly seek forward space
        if (carrierPressedMid && isOwnHalf) {
          // Own half under pressure: drop to offer outlet
          baseTgt = v(
            clamp(carrier.pos.x + me.team * 1.0, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            me.home.y * 0.8
          );
          me.wantsBall = true;
        } else {
          // ★ v9.17.0: Always use forward run mode when push > 0.1 (very low threshold)
          const useForwardRun = push > 0.1 && !isOwnHalf;
          baseTgt = findBestSpaceForWide(st, me, carrier, useForwardRun);
          me.wantsBall = true;
          // Sprint burst for forward runs
          if (useForwardRun && me.burstT <= 0 && me.burstCD <= 0 && me.staminaShort > 0.3) {
            me.burstT = 1.5;
            me.burstCD = 3.0 * (me.cardMods?.burstCooldown ?? 1.0);
          }
        }
      } else if (isCAM) {
        // ★ v9.17.0: CAM (4-2-3-1) - position between opponent lines, similar to FWD
        const oppMids = st.pl.filter(p => p.team !== me.team && p.role === "MID");
        const oppDefs = st.pl.filter(p => p.team !== me.team && p.role === "DEF");
        let oppMidLineX = 0;
        let oppDefLineX = -me.team * PExt.pitchHalfW * 0.7;
        if (oppMids.length > 0) oppMidLineX = oppMids.reduce((s, p) => s + p.pos.x, 0) / oppMids.length;
        if (oppDefs.length > 0) oppDefLineX = oppDefs.reduce((s, p) => s + p.pos.x, 0) / oppDefs.length;
        const pocketX = (oppMidLineX + oppDefLineX) / 2;
        
        // CAM positions in the pocket, drifting toward ball side
        const camY = carrier.pos.y * 0.4 + rng(-2.0, 2.0);
        baseTgt = v(
          clamp(pocketX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
          clamp(camY, -PExt.pitchHalfH + 5, PExt.pitchHalfH - 5)
        );
        me.wantsBall = true;
      } else if (isSemiWide) {
        // ★ v9.20.0: Semi-wide MF - stay in midfield zone, distribute to FWD
        if (carrierPressedMid && isOwnHalf) {
          baseTgt = v(
            clamp(carrier.pos.x + me.team * 1.0, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            me.home.y * 0.8
          );
          me.wantsBall = true;
        } else {
          // ★ v9.20.0: Semi-wide MF - push forward to bridge DEF and FWD
          const oppMids = st.pl.filter(p => p.team !== me.team && p.role === "MID");
          let oppMidLineX = carrier.pos.x - me.team * 15.0;
          if (oppMids.length > 0) oppMidLineX = oppMids.reduce((s, p) => s + p.pos.x, 0) / oppMids.length;
          const targetX = (carrier.pos.x + oppMidLineX) / 2 - me.team * (3.0 + push * 5.0);
          const rawTgt = v(
            clamp(targetX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            me.home.y
          );
          baseTgt = vlerp(me.home, rawTgt, 0.80 + push * 0.15);
          me.wantsBall = true;
        }
      } else if (isOwnHalf && isClosestCM) {
        // Buildup: CM closest to ball drops to CB line
        baseTgt = v(carrier.pos.x + me.team * 2.0, carrier.pos.y > 0 ? 2.0 : -2.0);
        me.wantsBall = true;
      } else {
        // ★ v9.20.0: CM - stay in midfield zone, be the distribution hub
        // Key: CM should NOT push into FWD territory. Instead, use midfield space
        // and be available to receive and distribute to FWD/wide players
        if (carrierPressedMid) {
          const cmX = carrier.pos.x - me.team * 5.0;
          baseTgt = v(clamp(cmX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5), me.home.y * 0.8);
          me.wantsBall = true;
        } else {
          // ★ v9.20.0: CM pushes forward to bridge DEF and FWD lines
          const oppMids = st.pl.filter(p => p.team !== me.team && p.role === "MID");
          let oppMidLineX = carrier.pos.x - me.team * 25.0;
          if (oppMids.length > 0) oppMidLineX = oppMids.reduce((s, p) => s + p.pos.x, 0) / oppMids.length;
          const pushExtra = push * 10.0;
          const cmX = carrier.pos.x - me.team * (15.0 + pushExtra);
          const rawTgt = v(clamp(cmX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5), me.home.y);
          baseTgt = vlerp(me.home, rawTgt, 0.85 + push * 0.12);
          me.wantsBall = true;
        }
      }
    }
    // ⑤ DEF positioning - ★ v9.17.0: More aggressive push with possession
    else if (me.role === "DEF") {
      const push = st.possessionPush.team === me.team ? st.possessionPush.pushLevel : 0;
      let carrierPressureDef = Infinity;
      for (const opp of st.pl) {
        if (opp.team === me.team) continue;
        carrierPressureDef = Math.min(carrierPressureDef, vdist(carrier.pos, opp.pos));
      }
      const carrierPressedDef = carrierPressureDef < 6.0;
      
      if (Math.abs(me.home.y) > 3.0) {
        // SB (Side Back) - ★ v9.20.0: Overlap into space vacated by wide MF/FWD
        const mySide = Math.sign(me.home.y); // -1 = left, +1 = right
        const isBallSide = (carrier.pos.y * me.home.y) > 0;
        
        // ★ v9.20.0: Find the same-side wide player (LM/RM or LW/RW)
        const sameSideWide = st.pl.find(p => 
          p.team === me.team && !p.isGK && p.idx !== me.idx &&
          (p.role === "MID" || p.role === "FWD") &&
          Math.abs(p.home.y) > 15.0 && Math.sign(p.home.y) === mySide
        );
        
        // Check if the wide player has pushed forward (committed run or advanced position)
        const widePlayerAdvanced = sameSideWide && 
          (sameSideWide.pos.x * -me.team) > (me.pos.x * -me.team) + 5.0; // Wide player is 5m+ ahead
        
        if (isBallSide && widePlayerAdvanced && sameSideWide && push > 0.2) {
          // ★ v9.20.0: SB OVERLAP - fill the space behind the advanced wide player
          // Position between carrier and the wide player's vacated space
          const overlapX = sameSideWide.pos.x + me.team * 5.0; // 5m behind the wide player
          const overlapY = me.home.y * 1.0; // Stay on the sideline
          const rawTgt = v(
            clamp(overlapX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            overlapY
          );
          // Strong forward push when overlapping
          const homeRatio = 0.80 + push * 0.15;
          baseTgt = vlerp(me.home, rawTgt, homeRatio);
          me.wantsBall = true;
        } else if (isBallSide) {
          // ★ Normal ball-side SB: push forward with possession
          const pushExtra = push * 8.0;
          const sbX = carrier.pos.x - me.team * (5.0 + pushExtra);
          const rawTgt = v(
            clamp(sbX, -PExt.pitchHalfW + 5, PExt.pitchHalfW - 5),
            me.home.y * 1.05
          );
          const homeRatio = isOwnHalf ? 0.55 + push * 0.20 : 0.75 + push * 0.15;
          baseTgt = vlerp(me.home, rawTgt, homeRatio);
          me.wantsBall = true;
        } else {
          // Far-side SB: tuck inside and push up with possession
          const pushExtra = push * 4.0;
          const rawTgt = v(
            carrier.pos.x + me.team * (2.0 - pushExtra),
            Math.sign(me.home.y) * Math.abs(me.home.y) * 0.4
          );
          baseTgt = vlerp(me.home, rawTgt, 0.45 + push * 0.20);
        }
      } else {
        // CB - ★ v9.17.0: Push up more with sustained possession
        const carrierIsCB = carrier.role === "DEF" && Math.abs(carrier.home.y) <= 3.0;
        if (carrierPressedDef && carrierIsCB && carrier.idx !== me.idx) {
          const spreadY = carrier.pos.y > 0 ? -6.0 : 6.0;
          baseTgt = v(carrier.pos.x + me.team * 2.0, spreadY);
          me.wantsBall = true;
        } else {
          // ★ v9.17.0: CB pushes up aggressively with possession - up to halfway line
          const pushExtra = push * 8.0; // Very aggressive
          const rawTgt = v(carrier.pos.x + me.team * (2.0 - pushExtra), me.home.y * 0.3);
          baseTgt = vlerp(me.home, rawTgt, 0.60 + push * 0.20); // Much weaker home anchor
        }
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

    // --- Phase 5.5: Off-the-Ball Movement (★ v9.20.0: Committed runs + space-finding) ---
    // Key principles:
    //   1. FWD and wide attackers commit to forward runs (locked target until reached)
    //   2. Space-finding: maximize distance from BOTH teammates AND opponents
    //   3. CM stays in midfield zone, doesn't push into FWD territory
    //   4. Once a run is committed, player doesn't re-evaluate until target reached or expired
    if (!me.isGK && (me.role === "MID" || me.role === "FWD")) {
      me.burstCD = Math.max(0, (me.burstCD ?? 0) - P.decisionInterval);
      
      // ★ v9.20.0: Committed run system - if we have an active committed run, follow it
      if (me.committedRunTarget && me.committedRunTimer > 0) {
        me.committedRunTimer -= P.decisionInterval;
        const distToTarget = vdist(me.pos, me.committedRunTarget);
        
        // Check if run should be cancelled:
        // 1. Reached target (within 2m)
        // 2. Timer expired
        // 3. Would be offside at target (dynamic check)
        const carrier = ballOwner!;
        const wouldBeOffside = isOffside(st, { ...me, pos: me.committedRunTarget } as Player, carrier.pos);
        
        if (distToTarget < 2.0 || me.committedRunTimer <= 0 || wouldBeOffside) {
          me.committedRunTarget = null;
          me.committedRunTimer = 0;
        } else {
          // Continue committed run - LOCK the target
          baseTgt = me.committedRunTarget;
          me.wantsBall = true;
          // Sprint toward target
          if (me.burstT <= 0 && me.staminaShort > 0.3 && distToTarget > 5.0) {
            me.burstT = 1.0;
          }
        }
      }
      
      // ★ v9.20.0: If no committed run active, evaluate new runs
      if (!me.committedRunTarget) {
        const carrier = ballOwner!;
        const attackDir = -me.team;
        const dToCarrier = vdist(me.pos, carrier.pos);
        const iAmAhead = (me.pos.x - carrier.pos.x) * attackDir > 1.0;
        const iAmBehind = !iAmAhead;
        const isWidePlayer = Math.abs(me.home.y) > 15.0;
        const isFwd = me.role === "FWD";
        
        // ★ v9.20.0: Enhanced space-finding - score positions by distance from BOTH teams
        const findBestSpace = (searchDist: number, lateralCenter: number, lateralRange: number, mustBeAhead: boolean): V | null => {
          let bestTarget: V | null = null;
          let bestScore = -Infinity;
          
          for (let attempt = 0; attempt < 8; attempt++) {
            const runX = mustBeAhead 
              ? carrier.pos.x - attackDir * (searchDist + rng(0, 5.0))
              : me.pos.x - attackDir * (rng(-2.0, searchDist));
            const runY = lateralCenter + rng(-lateralRange, lateralRange);
            const candidate = pitchClamp(v(runX, runY));
            
            // Check offside
            if (isOffside(st, { ...me, pos: candidate } as Player, carrier.pos)) continue;
            
            // ★ v9.20.0: Score by distance from ALL players (both teams)
            let minOppDist = Infinity;
            let minTeamDist = Infinity;
            for (const p of st.pl) {
              if (p.idx === me.idx || p.isGK) continue;
              const d = vdist(candidate, p.pos);
              if (p.team !== me.team) {
                if (d < minOppDist) minOppDist = d;
              } else {
                if (d < minTeamDist) minTeamDist = d;
              }
            }
            if (minOppDist < 2.5) continue; // Too close to opponent
            
            // Check pass lane
            const blocked = laneBlocked(st, carrier.pos, candidate, me.team);
            
            // Score this candidate
            let score = 0;
            score += Math.min(minOppDist, 10.0) * 2.5; // Space from opponents (capped at 10m)
            score += Math.min(minTeamDist, 10.0) * 1.5; // Space from teammates (avoid clustering)
            if (mustBeAhead) {
              score += ((candidate.x - carrier.pos.x) * attackDir) * 1.0; // Forward progress
            }
            if (!blocked) score += 6.0; // Open pass lane
            if (candidate.y * me.home.y > 0) score += 2.0; // Correct side
            
            if (score > bestScore) {
              bestScore = score;
              bestTarget = candidate;
            }
          }
          return bestTarget;
        };
        
        // ★ v9.20.0: FWD ALWAYS attempts runs (no cooldown), wide players have short cooldown
        const shouldRunFwd = isFwd && dToCarrier >= 2.0;
        const shouldRunWide = isWidePlayer && me.burstCD <= 0 && dToCarrier >= 3.0 && dToCarrier <= 30.0;
        const shouldRunCM = !isFwd && !isWidePlayer && me.burstCD <= 0 && dToCarrier >= 3.0 && dToCarrier <= 25.0;
        
        if (shouldRunFwd) {
          // ★ FWD: ALWAYS try to find and commit to forward runs
          // Only accept targets that are FORWARD of current baseTgt (don't regress)
          const runDist = iAmBehind ? 14.0 : 10.0;
          const target = findBestSpace(runDist, me.home.y * 0.85, 4.0, true);
          if (target) {
            // ★ v9.20.0: Only commit if target is ahead of current baseTgt
            const targetForward = (target.x - baseTgt.x) * attackDir;
            if (targetForward > -2.0) { // Allow slight backward if space is much better
              me.committedRunTarget = target;
              me.committedRunTimer = 2.0 + rng(0, 1.0);
              baseTgt = target;
              if (me.burstT <= 0 && me.staminaShort > 0.3) {
                me.burstT = 1.5;
              }
            }
          } else if (iAmBehind) {
            const levelTarget = pitchClamp(v(
              carrier.pos.x - attackDir * 5.0,
              me.home.y + rng(-2.0, 2.0)
            ));
            if (!isOffside(st, { ...me, pos: levelTarget } as Player, carrier.pos)) {
              baseTgt = levelTarget;
            }
          }
          // FWD ALWAYS wants ball regardless of run success
          me.wantsBall = true;
        } else if (shouldRunWide) {
            // ★ Wide MID/SH: Committed overlap runs on the flank
            const runDist = iAmBehind ? 12.0 : 8.0;
            const target = findBestSpace(runDist, me.home.y * 0.9, 3.0, true);
            if (target) {
              me.committedRunTarget = target;
              me.committedRunTimer = 2.5 + rng(0, 1.0);
              baseTgt = target;
              me.wantsBall = true;
              me.burstCD = 0.3;
              if (me.burstT <= 0 && me.staminaShort > 0.3) {
                me.burstT = 1.5;
              }
            } else {
              // Even without ideal space, wide players STILL push forward
              const forceRunTarget = pitchClamp(v(
                me.pos.x - attackDir * 8.0,
                me.home.y * 0.9
              ));
              if (!isOffside(st, { ...me, pos: forceRunTarget } as Player, carrier.pos)) {
                me.committedRunTarget = forceRunTarget;
                me.committedRunTimer = 2.0;
                baseTgt = forceRunTarget;
                me.wantsBall = true;
                me.burstCD = 0.5;
              }
            }
        } else if (shouldRunCM) {
            // ★ v9.20.0: Central MID - DON'T push into FWD territory
            // Instead, find space in the MIDFIELD zone and be available for distribution
            if (iAmAhead) {
              // Already ahead - shift laterally to find open pass lane
              const blocked = laneBlocked(st, carrier.pos, me.pos, me.team);
              if (blocked) {
                const dir = vnorm(vsub(me.pos, carrier.pos));
                const perp = v(-dir.y, dir.x);
                const shift = 3.0;
                const cand1 = pitchClamp(vadd(baseTgt, vscl(perp, shift)));
                const cand2 = pitchClamp(vadd(baseTgt, vscl(perp, -shift)));
                const ok1 = !laneBlocked(st, carrier.pos, cand1, me.team);
                const ok2 = !laneBlocked(st, carrier.pos, cand2, me.team);
                if (ok1 || ok2) {
                  const scorePos = (tp: V) => {
                    const gp = (tp.x - carrier.pos.x) * attackDir;
                    let minD = Infinity;
                    for (const opp of st.pl) if (opp.team !== me.team) minD = Math.min(minD, vdist(tp, opp.pos));
                    return gp * 1.0 + Math.min(minD / 3.0, 1.0) * 3.0; // More weight on space
                  };
                  baseTgt = (ok1 && ok2) ? (scorePos(cand1) >= scorePos(cand2) ? cand1 : cand2) : (ok1 ? cand1 : cand2);
                  me.burstCD = 0.5;
                }
              }
            } else {
              // ★ v9.20.0: CM behind carrier - find space in midfield, NOT a forward run
              // Use findBestSpace but with moderate forward distance (midfield zone)
              const target = findBestSpace(5.0, me.home.y, 3.0, false);
              if (target) {
                baseTgt = target;
                me.wantsBall = true;
                me.burstCD = 0.6;
              }
            }
          }
        }
      }
    // --- end Phase 5.5 ---

    // ★ v9.20.0: Space-finding - maximize distance from BOTH teammates AND opponents
    if (!me.isGK) {
      const minTeammateDist = 5.0;
      const minLateralDist = 3.5;
      
      // Repulsion from teammates (avoid clustering)
      for (const p of st.pl) {
        if (p.idx === me.idx || p.team !== me.team || p.isGK) continue;
        const d = vdist(baseTgt, p.pos);
        if (d < minTeammateDist && d > 0.1) {
          const away = vnorm(vsub(baseTgt, p.pos));
          const pushDist = (minTeammateDist - d) * 0.6;
          baseTgt = vadd(baseTgt, vscl(away, pushDist));
        }
        // Lateral separation
        const lateralDist = Math.abs(baseTgt.y - p.pos.y);
        const longitudinalDist = Math.abs(baseTgt.x - p.pos.x);
        if (lateralDist < minLateralDist && longitudinalDist < 8.0 && d > 0.1) {
          const pushY = (me.home.y - baseTgt.y) * 0.12;
          baseTgt = v(baseTgt.x, baseTgt.y + pushY);
        }
      }
      
      // ★ v9.20.0: Soft repulsion from nearby opponents (find space AWAY from opponents too)
      // Only for attacking players when team has ball
      if (myTeamHasBall && (me.role === "MID" || me.role === "FWD")) {
        for (const opp of st.pl) {
          if (opp.team === me.team || opp.isGK) continue;
          const d = vdist(baseTgt, opp.pos);
          if (d < 4.0 && d > 0.1) {
            // Soft push away from opponent (find space)
            const away = vnorm(vsub(baseTgt, opp.pos));
            const pushDist = (4.0 - d) * 0.3; // Gentle push
            baseTgt = vadd(baseTgt, vscl(away, pushDist));
          }
        }
      }
      
      // Width enforcement - prevent drifting too far from assigned side
      if (me.role !== "FWD" || Math.abs(me.home.y) > 10.0) {
        const yDrift = Math.abs(baseTgt.y - me.home.y);
        if (yDrift > 12.0) {
          baseTgt = v(baseTgt.x, baseTgt.y + (me.home.y - baseTgt.y) * 0.2);
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
    
    // ★ v10.7.0: GK actively chases loose balls in their area (especially dropped shots)
    if (me.isGK) {
      const distGKToBall = vdist(me.pos, ballPos);
      const myGoalX = me.team * PExt.pitchHalfW;
      const ballDistFromGoal = Math.abs(ballPos.x - myGoalX);
      // GK should chase loose balls that are:
      // 1. Within penalty area distance (~16.5m from goal line)
      // 2. Free (no one owns them)
      // 3. Especially if it's a shot that's slowing down
      const inGKZone = ballDistFromGoal < 20.0; // Slightly wider than penalty area
      const ballSpeed = vlen(b.vel);
      const isSlowBall = ballSpeed < 8.0;
      const isShotDrop = b.shot && isSlowBall;
      
      if (b.free && inGKZone && (distGKToBall < 12.0 || isShotDrop)) {
        // Actively go collect the ball
        me.act = "move";
        // Predict where ball will be
        const predictT = Math.min(distGKToBall / Math.max(PExt.moveSpeed, 1), 1.0);
        const predictedBallPos = vadd(ballPos, vscl(b.vel, predictT * 0.5));
        me.tgt = pitchClamp(predictedBallPos);
        me.face = vnorm(vsub(ballPos, me.pos));
        return;
      }
      // Default: stay home
      me.act = "move";
      me.tgt = { ...me.home };
      return;
    }
    
    // Free ball: Only closest player chases, others maintain shape
    if (b.free) {
      if (distToBall < 12.0) {
        const myTeamClosest = nearest(st, b.pos, me.team);
        if (myTeamClosest === idx) {
          me.act = "move";
          me.tgt = ballPos;
          return;
        }
      }
      // ★ v9.20.0: FWD and MID during free ball
      if (me.role === "FWD" || me.role === "MID") {
        // ★ v9.20.0: If player has a committed run, CONTINUE it during free ball
        if (me.committedRunTarget && me.committedRunTimer > 0) {
          me.committedRunTimer -= P.decisionInterval;
          const distToTarget = vdist(me.pos, me.committedRunTarget);
          if (distToTarget < 2.0 || me.committedRunTimer <= 0) {
            me.committedRunTarget = null;
            me.committedRunTimer = 0;
          } else {
            me.act = "move";
            me.tgt = me.committedRunTarget;
            me.wantsBall = true;
            if (me.burstT <= 0 && me.staminaShort > 0.3 && distToTarget > 5.0) {
              me.burstT = 0.8;
            }
            return;
          }
        }
        // No committed run - hold position with slight drift toward assigned side
        me.act = "move";
        const holdX = me.pos.x + (ballPos.x - me.pos.x) * 0.03;
        const holdY = me.pos.y + (me.home.y - me.pos.y) * 0.05;
        me.tgt = pitchClamp(v(holdX, holdY));
        return;
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
        const ballShiftXMid = clamp((ballPos.x - me.home.x) * 0.3, -4.0, 4.0);
        const ballShiftYMid = clamp((ballPos.y - me.home.y) * 0.35, -5.0, 5.0);
        me.act = "move";
        me.tgt = pitchClamp(v(me.home.x + ballShiftXMid, me.home.y + ballShiftYMid));
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
  
  const ccR = P.centerCircleR;  // Center circle radius (9.15m)
  
  // ★ v9.22.0: Realistic kickoff positioning
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    const isKickoffTeam = p.team === st.koSide;
    
    // Start from home position
    let posX = p.home.x;
    let posY = p.home.y;
    
    // Rule 1: All players must be in their own half (except kickoff taker)
    // koSide team attacks toward -koSide direction, so their half is koSide * positive X
    if (!p.isGK) {
      // Ensure player is on their own side of the halfway line
      if (p.team * posX < 0) {
        // Player is on opponent's half - pull back to own half
        posX = p.team * 2.0;  // Just inside own half
      }
    }
    
    // Rule 2: Opponent players must be outside center circle
    if (!isKickoffTeam) {
      const distToCenter = Math.sqrt(posX * posX + posY * posY);
      if (distToCenter < ccR + 1.0) {
        // Push player outside center circle, toward their own half
        const angle = Math.atan2(posY, posX * p.team);
        posX = p.team * (ccR + 1.5) * Math.cos(angle);
        posY = (ccR + 1.5) * Math.sin(angle);
        // Ensure still on own half
        if (p.team * posX < 0) posX = p.team * (ccR + 1.5);
      }
    }
    
    p.pos = pitchClamp(v(posX, posY));
    p.vel = v(0, 0);
    p.act = "idle";
    p.tgt = { ...p.pos };
    p.face = v(-p.team, 0);
    p.dt = Math.random() * PExt.decisionInterval;
    p.turnDebt = 0;
    p.staminaShort = 1;
  }
  
  // Place ball at center spot
  st.ball.pos = v(0, 0);
  st.ball.vel = v(0, 0);
  st.ball.free = true;
  st.ball.owner = null;
  st.ball.cooldown = PExt.restartNoIntercept;
  st.ball.dead = 0;
  st.trail = null;
  
  // ★ v9.22.0: Kickoff taker and partner positioned at center
  // Find two closest outfield players from kickoff team
  let taker1Idx = -1, taker2Idx = -1;
  let taker1Dist = Infinity, taker2Dist = Infinity;
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    if (p.team !== st.koSide || p.isGK) continue;
    const d = vdist(p.home, v(0, 0));
    if (d < taker1Dist) {
      taker2Idx = taker1Idx;
      taker2Dist = taker1Dist;
      taker1Idx = i;
      taker1Dist = d;
    } else if (d < taker2Dist) {
      taker2Idx = i;
      taker2Dist = d;
    }
  }
  
  // Taker 1: on the ball at center spot (slightly on own side)
  if (taker1Idx !== -1) {
    st.ball.owner = taker1Idx;
    st.ball.free = false;
    st.pl[taker1Idx].pos = v(-st.koSide * 0.3, 0);
    st.pl[taker1Idx].face = v(-st.koSide, 0);
  }
  
  // Taker 2: partner standing nearby (on own side of center)
  if (taker2Idx !== -1) {
    st.pl[taker2Idx].pos = v(-st.koSide * 2.0, st.pl[taker2Idx].home.y > 0 ? 2.0 : -2.0);
    st.pl[taker2Idx].face = v(-st.koSide, 0);
  }
  
  // Set kickoff state
  st.kickoffReady = true;
  st.kickoffCountdown = P.kickoffCountdown;
  st.matchPhase = "kickoff";
}

function stopForSetPiece(st: State, kind: "THROWIN" | "CORNER" | "GOALKICK", team: number, pos: V) {
  // Debug logging for statistics verification
  // Debug log removed
  
  st.paused = true;
  // ★ v11.3.0: Longer pause for goal kicks and corners to set up positions
  st.pauseT = kind === "GOALKICK" ? 2.0 : kind === "CORNER" ? 2.5 : PExt.restartPause;
  st.setPieceRestart = { kind, team, pos, phase: "setup", timer: 0, takerIdx: -1, targetPos: v(0, 0), positioned: false };
  st.ball.free = false;
  st.ball.vel = v(0, 0);
  st.ball.owner = null;
  st.ball.cooldown = PExt.restartNoIntercept;
  // ★ v11.3.0: Place ball at restart position immediately
  st.ball.pos = { ...pos };
  st.ball.z = 0;
  st.ball.vz = 0;
  st.ball.lob = 0;
  st.ball.shot = false;
}

// ★ v11.3.0: Position players for corner kick (both teams shift toward goal)
function positionForCorner(st: State, sp: { kind: string; team: number; pos: V }) {
  const attackTeam = sp.team;  // Team taking the corner
  const defTeam = -attackTeam;
  const goalSide = -attackTeam;  // Corner is near defending team's goal
  const goalX = goalSide * PExt.pitchHalfW;
  const cornerY = sp.pos.y;  // Which side the corner is on
  const cornerSide = Math.sign(cornerY);  // +1 or -1
  
  for (const p of st.pl) {
    if (p.team === attackTeam) {
      if (p.isGK) {
        // GK stays near own goal but moves up slightly
        p.tgt = pitchClamp(v(attackTeam * PExt.pitchHalfW * 0.7, 0));
      } else if (p.role === "DEF") {
        // DEF push up to halfway line area
        p.tgt = pitchClamp(v(goalX * 0.3, p.home.y * 0.6));
      } else if (p.role === "MID") {
        // MID push into penalty area edge
        const ySpread = rng(-PExt.penAreaH * 0.8, PExt.penAreaH * 0.8);
        p.tgt = pitchClamp(v(goalX - goalSide * PExt.penAreaW * 1.2, ySpread));
      } else {
        // FWD go into the box for headers
        const ySpread = rng(-PExt.goalHalfH * 2.5, PExt.goalHalfH * 2.5);
        p.tgt = pitchClamp(v(goalX - goalSide * PExt.goalAreaW * 1.5, ySpread));
      }
    } else {
      // Defending team
      if (p.isGK) {
        // GK stays on goal line, slightly toward near post
        p.tgt = pitchClamp(v(goalX - goalSide * 1.0, cornerSide * PExt.goalHalfH * 0.3));
      } else if (p.role === "DEF") {
        // DEF mark attackers in the box
        const ySpread = rng(-PExt.goalHalfH * 2.0, PExt.goalHalfH * 2.0);
        p.tgt = pitchClamp(v(goalX - goalSide * PExt.goalAreaW * 1.2, ySpread));
      } else if (p.role === "MID") {
        // MID cover edge of box
        const ySpread = rng(-PExt.penAreaH * 0.7, PExt.penAreaH * 0.7);
        p.tgt = pitchClamp(v(goalX - goalSide * PExt.penAreaW * 1.0, ySpread));
      } else {
        // FWD stay high for counter-attack
        p.tgt = pitchClamp(v(-goalSide * PExt.pitchHalfW * 0.3, p.home.y * 0.5));
      }
    }
    p.act = "move";
  }
}

// ★ v11.3.0: Position players for goal kick
function positionForGoalKick(st: State, sp: { kind: string; team: number; pos: V }) {
  const kickTeam = sp.team;
  const goalSide = kickTeam;  // Goal kick is from own goal
  
  for (const p of st.pl) {
    if (p.team === kickTeam) {
      if (p.isGK) {
        // GK moves to ball position
        p.tgt = pitchClamp(sp.pos);
      } else if (p.role === "DEF") {
        // CBs spread wide near penalty area for short option
        const yOffset = p.home.y > 0 ? PExt.penAreaH * 0.8 : -PExt.penAreaH * 0.8;
        p.tgt = pitchClamp(v(goalSide * (PExt.pitchHalfW - PExt.penAreaW * 1.5), yOffset));
      } else {
        // MID/FWD push forward to receive long kick
        p.tgt = pitchClamp(v(p.home.x * 0.6, p.home.y * 0.8));
      }
    } else {
      // Opponent team pushes up to press
      if (p.isGK) {
        p.tgt = pitchClamp(v(p.home.x, p.home.y));
      } else {
        // Push up toward halfway line
        p.tgt = pitchClamp(v(p.home.x * 0.5, p.home.y * 0.7));
      }
    }
    p.act = "move";
  }
}

function runSetPiece(st: State) {
  const sp = st.setPieceRestart!;
  
  if (sp.kind === "THROWIN") {
    // Throw-in: simple - nearest outfield player takes it
    const taker = nearestOutfield(st, sp.pos, sp.team);
    if (taker === -1) return;
    st.pl[taker].pos = pitchClamp(sp.pos);
    st.pl[taker].tgt = { ...st.pl[taker].pos };
    st.pl[taker].act = "idle";
    st.pl[taker].face = v(-sp.team, 0);
    give(st.ball, taker, st.pl, st);
    st.ball.cooldown = PExt.restartNoIntercept;
    return;
  }
  
  if (sp.kind === "GOALKICK") {
    // ★ v11.3.0: Goal kick with realistic GK behavior
    const gkIdx = findGK(st, sp.team);
    if (gkIdx === -1) return;
    const gk = st.pl[gkIdx];
    
    // Position GK at ball
    gk.pos = pitchClamp(sp.pos);
    gk.tgt = { ...gk.pos };
    gk.act = "idle";
    gk.face = v(-sp.team, 0);
    
    // Give ball to GK
    give(st.ball, gkIdx, st.pl, st);
    
    // ★ v11.3.0: GK decides: long kick (70%) or short pass to CB (30%)
    const doShortPass = Math.random() < 0.30;
    
    if (doShortPass) {
      // Short pass to nearest CB
      let bestCB = -1;
      let bestDist = Infinity;
      for (let i = 0; i < st.pl.length; i++) {
        const p = st.pl[i];
        if (p.team !== sp.team || p.isGK) continue;
        if (p.role !== "DEF") continue;
        const d = vdist(gk.pos, p.pos);
        if (d < bestDist) { bestDist = d; bestCB = i; }
      }
      if (bestCB !== -1) {
        const cb = st.pl[bestCB];
        const tp = { ...cb.pos };
        st.ball.intendedReceiverIdx = bestCB;
        st.ball.lastPasserIdx = gkIdx;
        kick(st, gkIdx, Math.max(6.0, bestDist * 0.8), false, tp, false, 0.05);
        st.ball.cooldown = PExt.restartNoIntercept;
        // Log
        emitLog(st, {
          time: st.time,
          team: gk.team,
          playerNum: gk.num,
          playerRole: "GK",
          action: "pass",
          detail: `GK ゴールキック → ${cb.cardName || '#' + cb.num}(${cb.posLabel || 'CB'})へショートパス`,
          success: true,
          excitement: 0,
        });
        return;
      }
    }
    
    // ★ v11.4.0: Long kick forward with natural curve
    const targetX = -sp.team * (PExt.pitchHalfW * 0.3 + rng(0, PExt.pitchHalfW * 0.3));
    const targetY = rng(-PExt.pitchHalfH * 0.5, PExt.pitchHalfH * 0.5);
    const target = v(targetX, targetY);
    const dist = vdist(gk.pos, target);
    kick(st, gkIdx, Math.min(28.0, Math.max(15.0, dist * 0.6)), false, target, true, 0.15);
    st.ball.lob = 1.0;
    st.ball.z = 0.5;
    st.ball.vz = Math.min(8.0, dist * 0.1 + 2.0);
    st.ball.cooldown = PExt.restartNoIntercept;
    // ★ v11.4.0: GK long kick has natural side spin (instep kick)
    // Instep kick: styleSign=0, but GKs tend to kick with slight inside of foot
    const gkCurvePower = gk.cardMods?.curvePower ?? 1.0;
    st.ball.spinX = (Math.random() < 0.5 ? 1 : -1) * gkCurvePower * 2.0 * (0.5 + Math.random() * 0.8);
    st.ball.spinDecay = 1.8; // Moderate decay for long kick
    // Log
    emitLog(st, {
      time: st.time,
      team: gk.team,
      playerNum: gk.num,
      playerRole: "GK",
      action: "pass",
      detail: `GK ゴールキック！ 大きく前方へ蹴り出す！`,
      success: true,
      excitement: 1,
    });
    return;
  }
  
  if (sp.kind === "CORNER") {
    // ★ v11.3.0: Corner kick with full positioning and cross
    const taker = nearestOutfield(st, sp.pos, sp.team);
    if (taker === -1) return;
    const kicker = st.pl[taker];
    
    // Place kicker at corner
    kicker.pos = pitchClamp(sp.pos);
    kicker.tgt = { ...kicker.pos };
    kicker.act = "idle";
    
    // Face toward goal
    const goalSide = -sp.team;
    const goalX = goalSide * PExt.pitchHalfW;
    kicker.face = vnorm(vsub(v(goalX, 0), kicker.pos));
    
    // Give ball to kicker
    give(st.ball, taker, st.pl, st);
    
    // ★ v11.3.0: Determine cross target - near post, far post, or penalty spot area
    const crossType = Math.random();
    let crossTarget: V;
    const cornerSide = Math.sign(sp.pos.y);
    
    if (crossType < 0.35) {
      // Near post
      crossTarget = v(goalX - goalSide * PExt.goalAreaW * 0.8, cornerSide * PExt.goalHalfH * 1.2);
    } else if (crossType < 0.70) {
      // Far post
      crossTarget = v(goalX - goalSide * PExt.goalAreaW * 0.8, -cornerSide * PExt.goalHalfH * 1.5);
    } else {
      // Penalty spot area
      crossTarget = v(goalX - goalSide * PExt.penSpotDist, rng(-PExt.goalHalfH, PExt.goalHalfH));
    }
    
    // ★ v11.4.0: Kick the cross with intentional curve (inswing or outswing)
    const crossDist = vdist(kicker.pos, crossTarget);
    const crossSpeed = Math.max(14.0, Math.min(22.0, crossDist * 0.55));
    st.ball.intendedReceiverIdx = null;
    kick(st, taker, crossSpeed, false, crossTarget, true, 0.10);
    st.ball.lob = 1.0;
    st.ball.z = 0.5;
    st.ball.vz = Math.min(7.0, crossDist * 0.1 + 2.5);
    st.ball.cooldown = PExt.restartNoIntercept;
    
    // ★ v11.4.0: Force strong inswing curve on corner kicks
    // Inswing: ball curves INTO the goal (toward center)
    // cornerSide > 0 (right side): right foot inside kick curves left = spinX < 0 = inswing
    // cornerSide < 0 (left side): left foot inside kick curves right = spinX > 0 = inswing
    const pCurvePower = kicker.cardMods?.curvePower ?? 1.0;
    const inswingIntensity = 4.5 * pCurvePower; // Strong inswing for corner kicks
    const isInswing = Math.random() < 0.70; // 70% inswing, 30% outswing
    // Inswing curves toward goal center (away from corner side)
    st.ball.spinX = isInswing 
      ? -cornerSide * inswingIntensity * (0.7 + Math.random() * 0.6)
      : cornerSide * inswingIntensity * 0.5 * (0.5 + Math.random() * 0.5);
    st.ball.spinDecay = 1.2; // Slow decay for full-flight curve
    st.ball.kickStyle = isInswing ? "inside" : "outside";
    
    // Find nearest attacker to cross target for intended receiver
    let bestReceiver = -1;
    let bestRecvDist = Infinity;
    for (let i = 0; i < st.pl.length; i++) {
      if (i === taker) continue;
      if (st.pl[i].team !== sp.team) continue;
      const d = vdist(st.pl[i].pos, crossTarget);
      if (d < bestRecvDist) { bestRecvDist = d; bestReceiver = i; }
    }
    if (bestReceiver !== -1) {
      st.ball.intendedReceiverIdx = bestReceiver;
    }
    
    // ★ v11.5.0: Log with inswing/outswing label
    const crossLabel = crossType < 0.35 ? "ニアポスト" : crossType < 0.70 ? "ファーポスト" : "ペナルティエリア中央";
    const swingLabel = isInswing ? "インスイングクロス" : "アウトスイングクロス";
    const swingEmoji = isInswing ? "🌀" : "↪️";
    emitLog(st, {
      time: st.time,
      team: kicker.team,
      playerNum: kicker.num,
      playerRole: kicker.posLabel || "MF",
      action: "pass",
      detail: `${kicker.cardName || '#' + kicker.num} コーナーキック！ ${swingLabel}で${crossLabel}へ！`,
      success: true,
      excitement: 2,
    });
    // Second log entry for the swing type (excitement level 1)
    emitLog(st, {
      time: st.time,
      team: kicker.team,
      playerNum: kicker.num,
      playerRole: kicker.posLabel || "MF",
      action: "pass",
      detail: isInswing
        ? `→ ゴールに向かって曲がるインスイング！チャンス！`
        : `→ 外側に流れるアウトスイングクロス`,
      success: true,
      excitement: isInswing ? 2 : 1,
    });
    return;
  }
}

export function startThrowIn(st: State, throwerIdx: number, targetPos: V) {
  // Throw-in logic - simplified
  st.paused = true;
  st.pauseT = PExt.restartPause;
}

export function update(st: State, dt: number) {
  if (st.over) {
    // ★ v10.2.0: Even after game over, keep counting down timers
    // so the result screen can detect when the FULL TIME overlay fades
    // ★ v11.9.0: Use physDt (real-time) for visual timers after game over
    if (st.screenEffect.timer > 0) {
      st.screenEffect.timer -= dt;
    }
    if (st.flash > 0) {
      st.flash = Math.max(0, st.flash - dt * 2);
    }
    return;
  }
  
  // ★ v11.9.0: Correct physDt/simDt separation
  //
  // physDt = raw wall-clock elapsed seconds (always ~0.016s at 60fps)
  //   -> Used for: ball physics, player movement, AI decisions, stamina, animations
  //   -> Physics constants (moveSpeed, passSpeed etc.) are tuned for physDt
  //   -> AI decision interval (0.25s) is in real-world seconds
  //
  // simDt = physDt * speedMul
  //   -> Used for: match timer ONLY
  //   -> Controls how fast the match clock advances
  //
  // speedMul = matchDuration / target_real_seconds
  //   REAL:  240/5400 = 0.0444 -> 90 real minutes
  //   SLOW:  240/1200 = 0.2    -> 20 real minutes
  //   NORMAL:240/450  = 0.533  -> 7.5 real minutes
  //   FAST:  240/240  = 1.0    -> 4 real minutes
  //   VFAST: 240/120  = 2.0    -> 2 real minutes
  //
  // KEY INSIGHT: Physics runs at the same speed regardless of speed mode.
  // Only the match clock rate changes. This means:
  // - Ball speed, player speed, AI decisions are always the same
  // - The match just takes more/less real time to complete
  const speedMul = SPEED_MULTIPLIERS[st.speed] ?? (240 / 450);
  const physDt = dt;              // Raw wall-clock time: for ALL physics and AI
  const simDt = dt * speedMul;   // Scaled time: for match clock ONLY
  dt = physDt;                   // dt = physDt for all physics below
  
  // ★ v9.22.0: HALFTIME SCREEN - pause game during halftime show
  if (st.halftimeShow) {
    st.kickoffCountdown -= physDt;  // ★ v11.9.0: Real-time countdown (visual)
    if (st.kickoffCountdown <= 0) {
      st.halftimeShow = false;
      // ★ v9.22.0: Swap sides for second half
      // Flip all home positions (mirror X and Y) and swap team assignments
      for (const p of st.pl) {
        p.home = v(-p.home.x, -p.home.y);
        p.team = (p.team === -1 ? 1 : -1) as (-1 | 1);
        p.pos = { ...p.home };
        p.vel = v(0, 0);
        p.tgt = { ...p.home };
        p.face = v(-p.team, 0);
        p.dt = Math.random() * PExt.decisionInterval;
        p.turnDebt = 0;
        p.staminaShort = 1;
        // Reset committed runs
        p.committedRunTarget = null;
        p.committedRunTimer = 0;
      }
      // Note: sL/sR are position-based (left/right goal), not team-based
      // We use scoreBlue/scoreRed for display, so no need to swap sL/sR
      // Reset sL/sR for second half tracking
      st.sL = 0;
      st.sR = 0;
      // Reset ball to center
      st.ball.pos = v(0, 0);
      st.ball.vel = v(0, 0);
      st.ball.free = true;
      st.ball.owner = null;
      st.ball.cooldown = PExt.restartNoIntercept;
      // Second half kickoff: the OTHER team kicks off (but teams are now swapped)
      st.koSide = -st.koSide;
      st.half = 2;
      st.matchPhase = "kickoff";
      // Reset possession push
      st.possessionPush = { team: 0, duration: 0, pushLevel: 0 };
      doKickOff(st);
    }
    return;  // Don't update anything during halftime
  }
  
  // ★ v9.22.0: KICKOFF COUNTDOWN - brief pause before kickoff is taken
  if (st.kickoffReady) {
    st.kickoffCountdown -= physDt;  // ★ v11.9.0: Real-time countdown (visual)
    if (st.kickoffCountdown <= 0) {
      st.kickoffReady = false;
      st.matchPhase = "play";
    }
    return;  // Don't update during kickoff countdown
  }
  
  // Time - advance match clock using simDt (speed-scaled)
  st.time += simDt;  // ★ v11.9.0: Match clock ONLY uses simDt
  
  // ★ v9.22.0: Match clock calculation (simulation time → match minutes)
  // Each half is P.halfDuration simulation seconds = 45 match minutes
  const simTimeInHalf = st.half === 1 ? st.time : st.time - P.halfDuration;
  const matchMinInHalf = (simTimeInHalf / P.halfDuration) * P.matchMinutesPerHalf;
  st.matchClock = (st.half === 1 ? 0 : 45) + Math.min(matchMinInHalf, P.matchMinutesPerHalf);
  
  // ★ v9.22.0: HALFTIME CHECK
  if (st.half === 1 && st.time >= P.halfDuration && !st.halftimeDone) {
    st.halftimeDone = true;
    st.halftimeShow = true;
    st.matchPhase = "halftime";
    st.kickoffCountdown = P.halftimePauseDuration;  // Reuse countdown for halftime duration
    st.flash = 1.0;
    st.flashTxt = "HALF TIME";
    st.screenEffect = {
      type: "none",
      timer: P.halftimePauseDuration,
      text: "HALF TIME",
      playerNum: 0,
      team: 0,
    };
    return;
  }
  
  // ★ v9.22.0: FULLTIME CHECK
  if (st.time >= P.matchDuration) {
    st.over = true;
    st.matchPhase = "fulltime";
    st.flash = 1.0;
    st.flashTxt = "FULL TIME";
    st.screenEffect = {
      type: "none",
      timer: 3.0,
      text: "FULL TIME",
      playerNum: 0,
      team: 0,
    };
    return;
  }
  
  // Flash
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 2);
  
  // ★ v9.9.0: Update action log TTL
  updateLogTTL(st, dt);
  
  // ★ v9.11.0: Update screen effect timer
  if (st.screenEffect.timer > 0) {
    st.screenEffect.timer -= dt;
    if (st.screenEffect.timer <= 0) {
      st.screenEffect = { type: "none", timer: 0, text: "", playerNum: 0, team: 0 };
    }
  }
  
  // Pause
  if (st.paused) {
    st.pauseT -= dt;
    
    // ★ v11.3.0: During pause, move players to set piece positions
    if (st.setPieceRestart && !st.setPieceRestart.positioned) {
      if (st.setPieceRestart.kind === "CORNER") {
        positionForCorner(st, st.setPieceRestart);
      } else if (st.setPieceRestart.kind === "GOALKICK") {
        positionForGoalKick(st, st.setPieceRestart);
      }
      st.setPieceRestart.positioned = true;
      
      // Log the set piece
      if (st.setPieceRestart.kind === "CORNER") {
        emitLog(st, {
          time: st.time,
          team: st.setPieceRestart.team,
          playerNum: 0,
          playerRole: "",
          action: "pass",
          detail: st.setPieceRestart.team === -1 ? "BLU コーナーキック！ チャンス！" : "RED コーナーキック！ チャンス！",
          success: true,
          excitement: 2,
        });
      } else if (st.setPieceRestart.kind === "GOALKICK") {
        emitLog(st, {
          time: st.time,
          team: st.setPieceRestart.team,
          playerNum: 0,
          playerRole: "GK",
          action: "pass",
          detail: st.setPieceRestart.team === -1 ? "BLU ゴールキック" : "RED ゴールキック",
          success: true,
          excitement: 0,
        });
      }
    }
    
    // ★ v11.3.0: During set piece pause, still move players toward their targets
    if (st.setPieceRestart && (st.setPieceRestart.kind === "CORNER" || st.setPieceRestart.kind === "GOALKICK")) {
      for (const p of st.pl) {
        const desired = vsub(p.tgt, p.pos);
        const dist = vlen(desired);
        if (dist > 0.3) {
          const moveSpd = P.moveSpeed * 0.8; // Slightly slower during setup
          const step = Math.min(dist, moveSpd * dt);
          p.pos = vadd(p.pos, vscl(vnorm(desired), step));
          p.face = vnorm(desired);
          // Update feet
          updatePlayerFeet(p, dt);
        }
      }
      // Keep ball at restart position
      st.ball.pos = { ...st.setPieceRestart.pos };
    }
    
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
  // ★ v11.5.0: Record spinX and z for curve visualization
  if (st.ball.free && vlen(st.ball.vel) > 2.0) {
    st.ballTrail.push({ pos: { ...st.ball.pos }, t: 0.6, spinX: st.ball.spinX, z: st.ball.z });
    // Limit trail length (more dots for better curve visualization)
    if (st.ballTrail.length > 45) st.ballTrail.shift();
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
  
  // ★ v9.10.0: Update possession push level
  // Track team possession including ball in flight from team's kick
  {
    let possTeam = 0;
    if (st.ball.owner !== null) {
      possTeam = st.pl[st.ball.owner].team;
    } else if (st.ball.free && st.ball.kickTeam !== 0) {
      // Ball is in flight from a team's kick - still counts as their possession
      possTeam = st.ball.kickTeam;
    }
    
    if (possTeam !== 0 && possTeam === st.possessionPush.team) {
      // Same team still has possession - increase push
      st.possessionPush.duration += dt;
      // ★ v9.13.0: Push level ramps up over 2 seconds (was 4s) for faster team advance
      st.possessionPush.pushLevel = Math.min(1.0, st.possessionPush.duration / 2.0);
    } else if (possTeam !== 0) {
      // Different team has possession - reset
      st.possessionPush.team = possTeam;
      st.possessionPush.duration = 0;
      st.possessionPush.pushLevel = 0;
    } else {
      // ★ v9.13.0: No possession - very slow decay (was dt*0.3, now dt*0.1)
      st.possessionPush.pushLevel = Math.max(0, st.possessionPush.pushLevel - dt * 0.1);
      st.possessionPush.duration = Math.max(0, st.possessionPush.duration - dt * 0.1);
    }
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
    const isAttThird = ax >= (w * 0.4);  // v10.0.0: attacking half (ax >= 21m)
    const isPhaseB = ax >= (w * 0.4);  // v10.0.0: Phase B threshold consistent
    
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
  
  // ★ v10.3.0: Heatmap initialization (first frame)
  if (st.heatmaps.length === 0 && st.pl.length > 0) {
    st.heatmaps = st.pl.map(p => ({
      playerIdx: p.idx,
      team: p.team,
      num: p.num,
      cardName: p.cardName,
      posLabel: p.posLabel,
      offBall: [],
      onBall: [],
    }));
  }

  // ★ v10.3.0: Heatmap off-ball sampling (every 15 frames ~= 0.25s at 60fps)
  // ★ v10.6.0: Side normalization - in 2nd half, teams are swapped so we flip coordinates
  // to ensure all data is recorded as if the player always attacks in the same direction.
  // In 1st half: team=-1 attacks right (+x), team=1 attacks left (-x)
  // In 2nd half: teams are swapped, so we need to flip x and y to normalize
  const isSecondHalf = st.half === 2;
  const HEATMAP_SAMPLE_INTERVAL = 15;
  st.heatmapSampleCounter++;
  if (st.heatmapSampleCounter >= HEATMAP_SAMPLE_INTERVAL) {
    st.heatmapSampleCounter = 0;
    const PH = PExt.pitchHalfH;  // ~34m
    const PW = PExt.pitchHalfW;  // ~52.5m
    for (const p of st.pl) {
      const hm = st.heatmaps[p.idx];
      if (!hm) continue;
      if (st.ball.owner !== p.idx) {
        // Off-ball: normalize to 0-1 range
        let nx = (p.pos.x + PW) / (PW * 2);
        let ny = (p.pos.y + PH) / (PH * 2);
        // ★ v10.6.0: Flip coordinates in 2nd half to normalize sides
        if (isSecondHalf) {
          nx = 1 - nx;
          ny = 1 - ny;
        }
        hm.offBall.push({ x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) });
        // Limit to 2000 samples per player
        if (hm.offBall.length > 2000) hm.offBall.shift();
      }
    }
  }

  // ★ v11.7.0: Goal replay buffer - capture at fixed WALL-CLOCK rate (speed-mode independent)
  // We receive dt = rawElapsed * speedMul, so rawElapsed = dt / speedMul
  // We want to capture ~30 frames per real second regardless of speed mode
  const speedMulForReplay = SPEED_MULTIPLIERS[st.speed] ?? 12.0;
  const rawElapsed = dt / speedMulForReplay;  // actual wall-clock seconds this frame
  st.replayWallTimeAccum += rawElapsed;
  const REPLAY_CAPTURE_INTERVAL = 1 / 30;  // capture at 30fps wall-clock
  if (st.replayWallTimeAccum >= REPLAY_CAPTURE_INTERVAL) {
    st.replayWallTimeAccum -= REPLAY_CAPTURE_INTERVAL;
    const frame = {
      players: st.pl.map(p => ({ x: p.pos.x, y: p.pos.y, team: p.team, num: p.num, isGK: p.isGK, face: { x: p.face.x, y: p.face.y }, act: p.act })),
      ball: { x: st.ball.pos.x, y: st.ball.pos.y, z: st.ball.z, free: st.ball.free, owner: st.ball.owner },
      trail: st.ballTrail.map(t => ({ pos: { x: t.pos.x, y: t.pos.y }, t: t.t })),
      matchClock: st.matchClock,
      scoreBlue: st.scoreBlue,
      scoreRed: st.scoreRed,
    };
    st.replayBuffer.push(frame);
    // Keep ~8 seconds at 30fps = 240 frames (enough for pre-goal buildup)
    const MAX_BUFFER = 240;
    if (st.replayBuffer.length > MAX_BUFFER) st.replayBuffer.shift();
  }

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
    
    // ★ v11.4.0: Apply spin curve to ball trajectory (Magnus effect)
    // Side spin causes lateral deflection - stronger effect for more visible curves
    if (Math.abs(b.spinX) > 0.05) {
      // Perpendicular to velocity direction (right-hand rule)
      const speed = vlen(b.vel);
      if (speed > 0.5) {
        const perpX = -b.vel.y / speed;
        const perpY = b.vel.x / speed;
        // ★ v11.4.0: Increased curve force for visible effect
        // Magnus force = C * spin * speed (C=0.025 for realistic football curve)
        // Airborne balls curve more (less ground friction dampening)
        const magnusFactor = b.z > 0.3 ? 0.030 : 0.018; // More curve in air
        const curveMag = b.spinX * speed * magnusFactor * dt;
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
        
        // ★ v9.15.0: Lofted ball bounce adds lateral deviation (unpredictable bounce)
        if (b.lob > 0.2) {
          const bounceDeviation = b.lob * 0.8; // More lob = more deviation
          b.vel.x += rng(-bounceDeviation, bounceDeviation);
          b.vel.y += rng(-bounceDeviation, bounceDeviation);
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
      let minD = Infinity;
      
      for (let i = 0; i < st.pl.length; i++) {
        const p = st.pl[i];
        // ★ v10.2.0: Per-player intercept radius
        const pInterceptR = PExt.interceptRadius * (p.cardMods?.interceptRadius ?? 1.0);
        // v8.9.0: Check distance to nearest foot, not just body center
        const dBody = vdist(p.pos, b.pos);
        // v8.9.0: Use foot distance if available, fallback to body distance
        const dLeftFoot = p.leftFoot ? vdist(p.leftFoot.pos, b.pos) : dBody;
        const dRightFoot = p.rightFoot ? vdist(p.rightFoot.pos, b.pos) : dBody;
        const d = Math.min(dBody, dLeftFoot, dRightFoot);
        
        // Update if this player is within their intercept radius and closer than current best
        if (d < pInterceptR && d < minD) {
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
        
        // ★ v9.15.0: Trap difficulty based on ball speed, lob, and receiving foot
        const ballSpeed = vlen(b.vel);
        const isLobbed = b.lob > 0.3 || b.z > 0.5;
        const isIntercept = b.kickTeam !== 0 && interceptor.team !== b.kickTeam;
        
        // Determine which foot receives the ball
        const dLF = interceptor.leftFoot ? vdist(interceptor.leftFoot.pos, b.pos) : 999;
        const dRF = interceptor.rightFoot ? vdist(interceptor.rightFoot.pos, b.pos) : 999;
        const receiveFoot: FootSide = dLF < dRF ? "L" : "R";
        const isDominantFoot = receiveFoot === interceptor.footParams.dominantFoot;
        
        // Trap difficulty calculation:
        // - Fast ball (>15 m/s): harder to control
        // - Lofted ball: harder to trap (bouncing)
        // - Weak foot: harder to trap
        // - Intercept (opponent's pass): harder to control
        let trapDifficulty = 0;
        
        // Speed factor: 0 at 5m/s, 0.3 at 15m/s, 0.6 at 25m/s
        trapDifficulty += Math.max(0, (ballSpeed - 5.0) * 0.03);
        
        // Lob factor: floating balls are much harder to trap
        if (isLobbed) trapDifficulty += 0.25;
        
        // Weak foot factor
        if (!isDominantFoot) {
          const weakAccuracy = interceptor.footParams.weakFootAccuracy / 10;
          trapDifficulty += (1.0 - weakAccuracy) * 0.2;
        }
        
        // Intercept factor: cutting opponent's pass is harder
        if (isIntercept) trapDifficulty += 0.15;
        
        // Ball control stat reduces difficulty
        const controlMod = (interceptor.footParams.ballControl || 5) / 10;
        trapDifficulty *= (1.0 - controlMod * 0.5); // Good control halves difficulty
        
        // Clamp to [0, 0.8]
        trapDifficulty = Math.min(0.8, Math.max(0, trapDifficulty));
        
        // Trap result: if random < trapDifficulty, bad trap (ball bounces away slightly)
        if (Math.random() < trapDifficulty) {
          // ★ v9.15.0: Bad trap - ball bounces away from player
          // Trigger trap animation on the receiving foot
          const trapFoot = receiveFoot === "L" ? interceptor.leftFoot : interceptor.rightFoot;
          if (trapFoot) {
            trapFoot.animTimer = 0.30;
            trapFoot.animType = "trap";
            const toBall = vnorm(vsub(b.pos, interceptor.pos));
            trapFoot.animOffset = vscl(toBall, 0.20);
          }
          // Ball escapes in a random direction, distance proportional to difficulty
          const bounceDir = vnorm(v(rng(-1, 1), rng(-1, 1)));
          const bounceDist = 0.5 + trapDifficulty * 2.0; // 0.5-2.1m bounce
          const bounceSpeed = 2.0 + ballSpeed * 0.15; // Faster ball = faster bounce
          
          // Don't give the ball - let it bounce free
          b.vel = vscl(bounceDir, bounceSpeed);
          b.pos = vadd(interceptor.pos, vscl(bounceDir, 0.3));
          b.z = isLobbed ? 0.2 : 0; // Small bounce if was lofted
          b.vz = isLobbed ? 1.5 : 0;
          b.cooldown = 0.1; // Brief cooldown so same player can recover
          b.lastTouchTeam = interceptor.team;
          b.free = true;
          b.lob = 0;
          
          // Still settle kick tracking
          if (b.kickActive) {
            const team = b.kickTeam === -1 ? 'blue' : 'red';
            const sameTeam = (interceptor.team === b.kickTeam);
            if (b.kickKind === "PASS" && sameTeam) {
              st.stats.passSuccess[team]++; // Pass reached teammate but trap failed
            } else if (b.kickKind === "LONG" && sameTeam) {
              st.stats.longPassSuccess[team]++;
            }
            b.kickActive = false;
          }
          
          // ★ v9.15.0: Log trap failure
          logTrapFail(st, interceptor, receiveFoot);
        } else {
          // Good trap - normal give
          // ★ v9.15.0: Trigger trap animation on the receiving foot
          const trapFootGood = receiveFoot === "L" ? interceptor.leftFoot : interceptor.rightFoot;
          if (trapFootGood) {
            trapFootGood.animTimer = 0.25;
            trapFootGood.animType = "trap";
            const toBallDir = vnorm(vsub(b.pos, interceptor.pos));
            trapFootGood.animOffset = vscl(toBallDir, 0.15);
          }
          give(b, closestIdx, st.pl, st);
        }
      }
    }
    
    // v8.8.3: GK save with line-segment detection
    // ★ v10.7.0: Also check proximity-based save for slow/dropping shots
    if (PExt.gkSaveEnabled && b.shot) {
      const defTeam = b.lastTouchTeam === -1 ? 1 : -1;
      const gkIdx = findGK(st, defTeam);
      if (gkIdx !== -1) {
        const gk = st.pl[gkIdx];
        // Check if shot trajectory (prevPos -> pos) crosses GK radius
        const distToGK = distSegmentToPoint(b.prevPos, b.pos, gk.pos);
        // ★ v10.7.0: Also check direct distance for slow shots (dropped middle shots)
        const directDist = vdist(b.pos, gk.pos);
        const ballSpd = vlen(b.vel);
        // For slow shots (<10 m/s), use wider save radius (GK can reach further)
        const effectiveSaveRadius = ballSpd < 10.0 ? PExt.gkSaveRadius * 2.5 :
                                     ballSpd < 15.0 ? PExt.gkSaveRadius * 1.8 :
                                     PExt.gkSaveRadius;
        const canSave = distToGK < effectiveSaveRadius || (directDist < effectiveSaveRadius && ballSpd < 12.0);
        if (canSave) {
          const gc = v(defTeam * PExt.pitchHalfW, 0);
          const toGoal = vsub(gc, b.pos);
          const toBall = vsub(b.pos, gk.pos);
          const angle = vang(toGoal, toBall);
          const angleBonus = (1 - angle / 180) * PExt.gkSaveAngleBonus;
          // ★ v10.2.0: Per-player GK save modifier
          const gkSaveMod = gk.cardMods?.gkSaveBase ?? 1.0;
          const saveChance = (PExt.gkSaveBase * gkSaveMod) + angleBonus;
          
          // v8.8.2: Track save attempt
          const gkTeam = defTeam === -1 ? 'blue' : 'red';
          st.stats.gkSaveAttempts[gkTeam]++;
          
          if (Math.random() < saveChance) {
            // v8.8.2: Track successful save
            st.stats.gkSaves[gkTeam]++;
            // ★ v10.2.0: Per-player save tracking
            if (st.stats.playerStats[gk.idx]) st.stats.playerStats[gk.idx].saves++;
            // ★ v9.9.0: Log save
            logSave(st, gk);
            
            if (Math.random() < PExt.gkParryChance) {
              // Parry
              const parryDir = vnorm(vsub(b.pos, gk.pos));
              b.vel = vscl(parryDir, PExt.shotSpeed * 0.4);
              b.shot = false;
              b.cooldown = PExt.gkHoldCooldown;
              // ★ v11.3.0: GKが弾いた = GKのチームが最後に触った
              // これによりゴールラインを割った場合にコーナーキックが正しく判定される
              b.lastTouchTeam = gk.team;
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
      // ★ v9.22.0: Track team-based scores (persist across halves)
      // g === -1 means ball entered left goal; the SCORING team attacked left
      // In 1st half: team=-1 (Blue) attacks right, team=1 (Red) attacks left
      // In 2nd half: teams are swapped
      // The scoring team is the one whose lastKicker scored
      if (b.lastKickerIdx >= 0 && b.lastKickerIdx < st.pl.length) {
        const scorerTeam = st.pl[b.lastKickerIdx].team;
        if (scorerTeam === -1) st.scoreBlue++;
        else st.scoreRed++;
      }
      st.flash = 1.0;
      st.flashTxt = "GOAL!";
      // ★ v9.9.0: Log goal
      if (b.lastKickerIdx >= 0 && b.lastKickerIdx < st.pl.length) {
        const scorer = st.pl[b.lastKickerIdx];
        logGoal(st, scorer);
        // ★ v10.2.0: Track per-player goal
        if (st.stats.playerStats[scorer.idx]) st.stats.playerStats[scorer.idx].goals++;
        // ★ v10.2.0: Track assist (last passer before goal)
        if (b.lastPasserIdx >= 0 && b.lastPasserIdx < st.pl.length && b.lastPasserIdx !== b.lastKickerIdx) {
          const assister = st.pl[b.lastPasserIdx];
          if (assister.team === scorer.team && st.stats.playerStats[assister.idx]) {
            st.stats.playerStats[assister.idx].assists++;
          }
        }
        // ★ v9.11.0: Goal screen effect (v10.2.0: show player name)
        const scorerName = scorer.cardName || `#${scorer.num}`;
        st.screenEffect = {
          type: "goal",
          timer: 2.5,
          text: `⚽ GOAL!! ${scorerName}`,
          playerNum: scorer.num,
          team: scorer.team,
        };
        // ★ v11.0.0: Save goal replay clip from buffer
        const goalFrameIdx = st.replayBuffer.length - 1;
        // Capture a few more frames after goal (post-goal celebration)
        // We'll add the current frame too
        const currentFrame = {
          players: st.pl.map(p => ({ x: p.pos.x, y: p.pos.y, team: p.team, num: p.num, isGK: p.isGK, face: { x: p.face.x, y: p.face.y }, act: p.act })),
          ball: { x: st.ball.pos.x, y: st.ball.pos.y, z: st.ball.z, free: st.ball.free, owner: st.ball.owner },
          trail: st.ballTrail.map(t => ({ pos: { x: t.pos.x, y: t.pos.y }, t: t.t })),
          matchClock: st.matchClock,
          scoreBlue: st.scoreBlue,
          scoreRed: st.scoreRed,
        };
        const frames = [...st.replayBuffer, currentFrame];
        st.goalReplays.push({
          goalIndex: st.goalReplays.length,
          scorerName,
          scorerTeam: scorer.team,
          matchClock: st.matchClock,
          scoreBlue: st.scoreBlue,
          scoreRed: st.scoreRed,
          frames,
          goalFrameIdx: frames.length - 1,
        });
      }
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
        // ★ v9.22.0: Track team-based scores for dribble goals
        if (b.owner !== null) {
          const scorerTeam = st.pl[b.owner].team;
          if (scorerTeam === -1) st.scoreBlue++;
          else st.scoreRed++;
        }
        st.flash = 1.0;
        st.flashTxt = "GOAL!";
        // ★ v9.9.0: Log goal (dribble goal)
        if (b.owner !== null) {
          const dribScorer = st.pl[b.owner];
          logGoal(st, dribScorer);
          // ★ v10.2.0: Track per-player goal for dribble goals
          if (st.stats.playerStats[dribScorer.idx]) st.stats.playerStats[dribScorer.idx].goals++;
          const dribScorerName = dribScorer.cardName || `#${dribScorer.num}`;
          st.screenEffect = {
            type: "goal",
            timer: 2.5,
            text: `⚽ GOAL!! ${dribScorerName}`,
            playerNum: dribScorer.num,
            team: dribScorer.team,
          };
          // ★ v11.0.0: Save goal replay clip (dribble goal)
          const dribCurrentFrame = {
            players: st.pl.map(p => ({ x: p.pos.x, y: p.pos.y, team: p.team, num: p.num, isGK: p.isGK, face: { x: p.face.x, y: p.face.y }, act: p.act })),
            ball: { x: st.ball.pos.x, y: st.ball.pos.y, z: st.ball.z, free: st.ball.free, owner: st.ball.owner },
            trail: st.ballTrail.map(t => ({ pos: { x: t.pos.x, y: t.pos.y }, t: t.t })),
            matchClock: st.matchClock,
            scoreBlue: st.scoreBlue,
            scoreRed: st.scoreRed,
          };
          const dribFrames = [...st.replayBuffer, dribCurrentFrame];
          st.goalReplays.push({
            goalIndex: st.goalReplays.length,
            scorerName: dribScorerName,
            scorerTeam: dribScorer.team,
            matchClock: st.matchClock,
            scoreBlue: st.scoreBlue,
            scoreRed: st.scoreRed,
            frames: dribFrames,
            goalFrameIdx: dribFrames.length - 1,
          });
        }
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
    
    // ★ v10.2.0: Per-player movement speed modifiers
    const moveMod = p.cardMods?.moveSpeed ?? 1.0;
    const dribMod = p.cardMods?.dribbleSpeed ?? 1.0;
    let maxSpeed = P.moveSpeed * moveMod;
    if (p.act === "dribble") maxSpeed = P.dribbleSpeed * dribMod;
    if (p.act === "carry") maxSpeed = P.dribbleSpeed * dribMod * 1.2;
    
    // 1) Short-term stamina update
    const sprintThreshold = maxSpeed * 0.85;
    const curSpeed = vlen(p.vel);
    const isSprinting = curSpeed > sprintThreshold;
    
    // ★ v10.2.0: Per-player stamina modifiers
    const staminaMod = p.cardMods?.staminaDrain ?? 1.0;
    const shortDrain = 0.35 * staminaMod;
    const shortRecover = 0.55 / staminaMod; // Better physical = faster recovery
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
