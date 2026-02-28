// Tunable parameters for soccer simulation
// Extracted from Home.tsx for centralized configuration

export const P = {
  matchDuration: 240,         // Total simulation seconds for full 90-min match (120s per half)
  halfDuration: 120,           // Simulation seconds per half
  matchMinutesPerHalf: 45,     // Match minutes per half (for display)
  goalResetDelay: 2.0,
  halftimePauseDuration: 3.0,  // Seconds to show halftime screen
  kickoffCountdown: 1.5,       // Seconds before kickoff is taken
  centerCircleR: 9.15,         // Center circle radius in meters

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
  moveSpeed: 7.5,  // v9.2.0: Slightly increased for larger pitch
  dribbleSpeed: 6.0,  // v9.2.0: Slightly increased
  passSpeed: 20,  // v9.3.0: Increased from 18 for faster pass delivery
  shotSpeed: 25,
  longPassSpeed: 15,
  passAccuracy: 0.94,  // v9.3.0: Increased from 0.92 for better pass completion
  shotAccuracy: 0.40,  // v9.2.0: Reduced from 0.60 for more realistic on-target rate
  longPassAccuracy: 0.70,  // v9.2.0: Slightly increased
  dribbleControl: 0.75,  // v9.2.0: Reduced from 0.90 to incentivize passing
  // Adjusted for soccer pitch
  interceptRadius: 0.9,  // v9.3.0: Reduced from 1.5 to allow more passes through
  decisionInterval: 0.25,  // Slightly longer decision time
  shotRange: 38.0,  // v10.0.0: Increased to allow shots from realistic distance (105m pitch, goal at x=52.5)
  shotAngle: 45,  // Narrower angle for longer distances

  looseBallDrag: 3.5,
  deadBallTime: 0.7,

  trailDuration: 1.0,  // v9.7.0: Increased from 0.35 for better pass visibility
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
  footOffsetForward: 0.20,
  footOffsetLateral: 0.15,
  footMaxReach: 0.40,
  footSize: 0.15,
  footAccuracyDecay: 0.15,
  
  defaultDominantFoot: "R" as const,
  defaultWeakFootFreq: 0,
  defaultWeakFootAccuracy: 5,
  
  // ★ v8.9.1: Dribble ball separation physics
  defaultBallControl: 5,
  dribblePushDistMin: 0.15,
  dribblePushDistMax: 2.5,
  dribbleTouchCycleSpeed: 5.0,
  dribbleTouchFootSwing: 0.12,
  
  // ★ v8.9.1: Foot animation parameters
  footKickSwingDist: 0.30,
  footKickSwingDuration: 0.20,
  footTackleLungeDist: 0.35,
  footTackleLungeDuration: 0.25,

  // ★ v9.1.0: Defensive AI parameters
  defInterceptLeadTime: 0.5,
  defTackleApproachAngle: 0.6,
  defPassLaneCoverDist: 6.0,
  defShotBlockDist: 10.0,

  // ★ v9.5.0: Pass decision AI parameters
  receiverPassLaneBonus: 4.0,     // Bonus when receiver has open pass lanes to others
  receiverSpaceBonus: 3.0,        // Bonus when receiver has space ahead
  pressurePassThreshold: 4.0,     // Distance at which enemy is considered "pressing" (meters)
  pressurePassPriority: 6.0,      // Extra score for passing when under pressure
  backPassProgressiveBonus: 5.0,  // Bonus for back-pass when receiver has progressive pass option
  lateralPassBonus: 2.0,          // Bonus for lateral passes to switch play
  backPassMinScore: -2.0,         // Minimum score for back-pass (was -3.0 penalty)
};

// ★ Formation definitions (all coordinates are for the "left" team attacking right)
// Mirror with v(-p.x, -p.y) for the "right" team

export type FormationId = "4-4-2" | "4-2-3-1" | "3-4-3";

export interface FormationDef {
  id: FormationId;
  label: string;
  positions: { x: number; y: number }[];
  roles: ("GK" | "DEF" | "MID" | "FWD")[];
  // ★ v9.1.0: Realistic jersey numbers per formation
  // Index 0 = slot 0 (GK), index 1 = slot 1, etc.
  jerseyNumbers: number[];
  // ★ v9.11.0: Detailed position labels (RCB, LCB, LB, RB, LCM, RCM, LW, RW, etc.)
  posLabels: string[];
}

// 4-4-2 Formation (scaled for 105m x 68m soccer pitch)
// Standard numbering: GK=1, RB=2, CB=4,5, LB=3, RM=7, CM=6,8, LM=11, ST=9,10
// v10.0.0: Pushed FWD/MID positions forward for more attacking play
const FORM_442_POS = [
  { x: -48.0, y: 0 },       // 0  GK     → #1
  { x: -30.0, y: -24.0 },   // 1  LB     → #3
  { x: -32.0, y: -8.0 },    // 2  CB     → #4
  { x: -32.0, y: 8.0 },     // 3  CB     → #5
  { x: -30.0, y: 24.0 },    // 4  RB     → #2
  { x: -10.0, y: -28.0 },   // 5  LM     → #11 (pushed forward)
  { x: -12.0, y: -9.0 },    // 6  CM     → #6 (pushed forward)
  { x: -12.0, y: 9.0 },     // 7  CM     → #8 (pushed forward)
  { x: -10.0, y: 28.0 },    // 8  RM     → #7 (pushed forward)
  { x: 8.0, y: -10.0 },     // 9  ST     → #9 (in opponent half)
  { x: 8.0, y: 10.0 },      // 10 ST     → #10 (in opponent half)
];

// 4-2-3-1 Formation
// Standard numbering: GK=1, RB=2, CB=4,5, LB=3, CDM=6,8, LAM=11, CAM=10, RAM=7, ST=9
// v10.0.0: Pushed attacking positions forward
const FORM_4231_POS = [
  { x: -48.0, y: 0 },       // 0  GK     → #1
  { x: -30.0, y: -24.0 },   // 1  LB     → #3
  { x: -32.0, y: -8.0 },    // 2  CB     → #4
  { x: -32.0, y: 8.0 },     // 3  CB     → #5
  { x: -30.0, y: 24.0 },    // 4  RB     → #2
  { x: -20.0, y: -7.0 },    // 5  CDM    → #6
  { x: -20.0, y: 7.0 },     // 6  CDM    → #8
  { x: -2.0, y: -22.0 },    // 7  LAM    → #11 (pushed into opp half)
  { x: 0.0, y: 0 },         // 8  CAM    → #10 (at halfway)
  { x: -2.0, y: 22.0 },     // 9  RAM    → #7 (pushed into opp half)
  { x: 12.0, y: 0 },        // 10 ST     → #9 (deep in opp half)
];

// 3-4-3 Formation
// Standard numbering: GK=1, CB=4,5,3, LWB=6, CM=8,10, RWB=2, LW=11, ST=9, RW=7
// v10.0.0: Pushed attacking positions forward
const FORM_343_POS = [
  { x: -48.0, y: 0 },       // 0  GK     → #1
  { x: -32.0, y: -18.0 },   // 1  CB     → #3
  { x: -34.0, y: 0 },       // 2  CB     → #4
  { x: -32.0, y: 18.0 },    // 3  CB     → #5
  { x: -8.0, y: -26.0 },    // 4  LWB    → #6 (pushed forward)
  { x: -14.0, y: -8.0 },    // 5  CM     → #8 (pushed forward)
  { x: -14.0, y: 8.0 },     // 6  CM     → #10 (pushed forward)
  { x: -8.0, y: 26.0 },     // 7  RWB    → #2 (pushed forward)
  { x: 5.0, y: -18.0 },     // 8  LW     → #11 (in opp half)
  { x: 12.0, y: 0 },        // 9  ST     → #9 (deep in opp half)
  { x: 5.0, y: 18.0 },      // 10 RW     → #7 (in opp half)
];

export const FORMATIONS: Record<FormationId, FormationDef> = {
  "4-4-2": {
    id: "4-4-2",
    label: "4-4-2",
    positions: FORM_442_POS,
    roles: ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"],
    jerseyNumbers: [1, 3, 4, 5, 2, 11, 6, 8, 7, 9, 10],
    posLabels: ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCM", "RCM", "RM", "LST", "RST"],
  },
  "4-2-3-1": {
    id: "4-2-3-1",
    label: "4-2-3-1",
    positions: FORM_4231_POS,
    roles: ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD"],
    jerseyNumbers: [1, 3, 4, 5, 2, 6, 8, 11, 10, 7, 9],
    posLabels: ["GK", "LB", "LCB", "RCB", "RB", "LCDM", "RCDM", "LAM", "CAM", "RAM", "ST"],
  },
  "3-4-3": {
    id: "3-4-3",
    label: "3-4-3",
    positions: FORM_343_POS,
    roles: ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
    jerseyNumbers: [1, 3, 4, 5, 6, 8, 10, 2, 11, 9, 7],
    posLabels: ["GK", "LCB", "CB", "RCB", "LWB", "LCM", "RCM", "RWB", "LW", "ST", "RW"],
  },
};

export const FORMATION_IDS: FormationId[] = ["4-4-2", "4-2-3-1", "3-4-3"];

// Legacy export for backward compatibility
export const FORM_442 = FORM_442_POS;
