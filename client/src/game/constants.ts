// Tunable parameters for futsal simulation
// Extracted from Home.tsx for centralized configuration

export const P = {
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
  longPassSpeed: 10,
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
  longPassMinDist: 8,
  longPassMaxDist: 22,

  // Throw-in / Corner animation
  throwInMaxDist: 12,
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
};

// 4-4-2 Formation
export const FORM_442 = [
  { x: -9.8, y: 0 },       // 0  GK
  { x: -7.5, y: -4.5 },    // 1  LB
  { x: -7.5, y: -1.5 },    // 2  CB
  { x: -7.5, y: 1.5 },     // 3  CB
  { x: -7.5, y: 4.5 },     // 4  RB
  { x: -4.5, y: -5.0 },    // 5  LM
  { x: -4.5, y: -1.5 },    // 6  CM
  { x: -4.5, y: 1.5 },     // 7  CM
  { x: -4.5, y: 5.0 },     // 8  RM
  { x: -1.5, y: -1.8 },    // 9  ST
  { x: -1.5, y: 1.8 },     // 10 ST
];
