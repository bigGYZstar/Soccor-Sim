// Tunable parameters for soccer simulation
// Extracted from Home.tsx for centralized configuration

export const P = {
  matchDuration: 120,
  goalResetDelay: 2.0,

  // Soccer pitch dimensions (105m x 68m)
  pitchHalfW: 52.5,  // Half of 105m
  pitchHalfH: 34.0,  // Half of 68m
  goalHalfH: 3.66,   // Goal width 7.32m
  goalDepth: 2.0,
  penAreaW: 16.5,    // Penalty area width 40.3m
  penAreaH: 16.5,    // Penalty area depth 16.5m
  goalAreaW: 5.5,    // Goal area width 18.32m
  goalAreaH: 5.5,    // Goal area depth 5.5m
  centreCircleR: 9.15,
  penSpotDist: 11.0, // Penalty spot 11m from goal
  cornerArcR: 1.0,

  // Adjusted speeds for soccer (larger pitch)
  moveSpeed: 7.0,
  dribbleSpeed: 5.5,
  passSpeed: 18,
  shotSpeed: 25,
  longPassSpeed: 15,
  passAccuracy: 0.88,
  shotAccuracy: 0.60,
  longPassAccuracy: 0.65,
  dribbleControl: 0.90,
  // Adjusted for soccer pitch
  interceptRadius: 1.5,  // Larger interception radius for soccer
  decisionInterval: 0.25,  // Slightly longer decision time
  shotRange: 18.0,  // Increased shot range for soccer
  shotAngle: 45,  // Narrower angle for longer distances

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

  // Long pass (adjusted for soccer)
  longPassMinDist: 25,
  longPassMaxDist: 60,

  // Throw-in / Corner animation (adjusted for soccer)
  throwInMaxDist: 20,
  throwInAnimDur: 0.5,
  cornerAnimDur: 0.4,
  headingContestRadius: 2.5,
  headingContestDur: 0.35,

  // Foul
  foulChanceOnTackle: 0.18,
  foulChanceOnDribble: 0.10,
  foulPause: 1.5,
  freeKickNoIntercept: 0.8,
  wallDistance: 1.83,
  wallPlayerCount: 3,
  directFKShotRange: 7.0,
  directFKShotChance: 0.65,

  // ★ v8.9.0: Foot system parameters
  /**
   * KEY INVARIANT: Feet must stay close to body center.
   * footOffsetForward: how far forward the foot sits from body center (meters)
   * footOffsetLateral: how far left/right the foot sits from body center (meters)
   * footMaxReach: maximum distance a foot can extend from body (meters)
   * footSize: visual radius of foot for rendering (meters)
   * footAccuracyDecay: accuracy multiplier per meter of foot extension beyond rest position
   *   e.g., 0.15 means 15% accuracy loss per extra meter of reach
   */
  footOffsetForward: 0.20,   // Foot sits 0.20m ahead of body center
  footOffsetLateral: 0.15,   // Foot sits 0.15m to the side of body center
  footMaxReach: 0.40,        // Maximum 0.40m from body center
  footSize: 0.15,            // Visual radius 0.15m (smaller than player 0.30m)
  footAccuracyDecay: 0.15,   // 15% accuracy loss per meter of extra reach
  
  // Default foot parameters for all players (can be overridden per player)
  defaultDominantFoot: "R" as const,  // All players start right-footed
  defaultWeakFootFreq: 0,             // 0/10: never use weak foot initially
  defaultWeakFootAccuracy: 5,         // 5/10: average weak foot accuracy
  
  // ★ v8.9.1: Dribble ball separation physics
  /**
   * During dribble, the ball cycles between "touch" (foot contact) and "push" (ball ahead of foot).
   * ballControl (0-10) determines how far the ball separates during push phase.
   *   10 = ball barely leaves foot (Messi-like close control)
   *    0 = ball pushed far ahead (poor control, vulnerable to tackle)
   *    5 = average control (default)
   *
   * Touch cycle:
   *   touchPhase: 0..1 oscillates via sin(). 0 = ball at foot, 1 = ball at max push distance
   *   pushDistMin: minimum push distance (high control) in meters
   *   pushDistMax: maximum push distance (low control) in meters
   *   touchCycleSpeed: how fast the touch cycle oscillates (radians/sec)
   */
  defaultBallControl: 5,       // 5/10: average ball control for all players
  dribblePushDistMin: 0.15,    // High control: ball stays 0.15m from foot
  dribblePushDistMax: 2.5,     // Low control: ball pushed up to 2.5m ahead
  dribbleTouchCycleSpeed: 5.0, // Oscillation speed (rad/s) - ~0.6s per touch cycle
  dribbleTouchFootSwing: 0.12, // How far foot swings forward during touch (meters)
  
  // ★ v8.9.1: Foot animation parameters
  /**
   * Feet animate during actions: kick swing, dribble touch, tackle lunge.
   * footKickSwingDist: how far foot swings forward during kick (meters)
   * footKickSwingDuration: duration of kick swing animation (seconds)
   * footTackleLungeDist: how far foot extends during tackle (meters)
   * footTackleLungeDuration: duration of tackle lunge animation (seconds)
   */
  footKickSwingDist: 0.30,      // Foot swings 0.30m forward during kick
  footKickSwingDuration: 0.20,  // Kick animation lasts 0.20s
  footTackleLungeDist: 0.35,    // Foot extends 0.35m during tackle
  footTackleLungeDuration: 0.25, // Tackle animation lasts 0.25s
};

// 4-4-2 Formation (scaled for 105m x 68m soccer pitch)
export const FORM_442 = [
  { x: -48.0, y: 0 },       // 0  GK
  { x: -36.0, y: -24.0 },   // 1  LB
  { x: -36.0, y: -8.0 },    // 2  CB
  { x: -36.0, y: 8.0 },     // 3  CB
  { x: -36.0, y: 24.0 },    // 4  RB
  { x: -20.0, y: -28.0 },   // 5  LM
  { x: -20.0, y: -9.0 },    // 6  CM
  { x: -20.0, y: 9.0 },     // 7  CM
  { x: -20.0, y: 28.0 },    // 8  RM
  { x: -8.0, y: -10.0 },    // 9  ST
  { x: -8.0, y: 10.0 },     // 10 ST
];
