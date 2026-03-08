// Type definitions for soccer simulation engine
// Extracted from Home.tsx for UI-independent testing

export interface V {
  x: number;
  y: number;
}

export type Role = "GK" | "DEF" | "MID" | "FWD";

export type FootSide = "L" | "R";

/**
 * ★ v8.9.0: Foot system
 * Each player has two physical feet that exist as sub-objects.
 * 
 * KEY INVARIANTS (MUST preserve):
 * 1. Feet MUST NOT stray far from player body center.
 *    Maximum offset is ~0.4m from body center.
 * 2. Accuracy MUST decrease as foot-to-ball distance increases.
 *    The further the foot reaches, the less precise the touch.
 * 3. Dominant foot has full accuracy; weak foot accuracy is parameterized.
 * 4. All actions (kick, dribble, tackle) use a specific foot.
 */
export interface Foot {
  side: FootSide;           // "L" or "R"
  pos: V;                   // World position of this foot
  offset: V;                // Offset from player center (in player-local space)
  // ★ v8.9.1: Foot animation state
  animOffset: V;            // Additional animation offset (kick swing, tackle lunge)
  animTimer: number;        // Remaining animation time (0 = no animation)
  animType: "none" | "kick" | "dribbleTouch" | "tackle" | "trap"; // Current animation
}

/**
 * Per-player foot skill parameters.
 * dominantFoot: which foot is the player's strong foot
 * weakFootFreq: 0-10, how often the player uses the weak foot (0 = never)
 * weakFootAccuracy: 0-10, accuracy with weak foot (10 = same as dominant)
 */
export interface FootParams {
  dominantFoot: FootSide;   // "R" for right-footed, "L" for left-footed
  weakFootFreq: number;     // 0-10: frequency of weak foot usage (0 = never)
  weakFootAccuracy: number; // 0-10: accuracy with weak foot (5 = average)
  ballControl: number;      // 0-10: ball control during dribble (5 = average)
}

// ★ v11.9.0: 5-stage speed modes - CORRECTED FORMULA
//
// The game engine uses "simulation seconds" (sim-sec) internally.
// matchDuration = 240 sim-sec for a full 90-min match
//
// speedMul is applied to dt (real elapsed seconds) before ALL physics/AI/timers.
// Real time for full match = matchDuration / speedMul
// => speedMul = matchDuration / target_real_seconds
//
// REAL:  240/5400 = 0.0444 => 5400s = 90min  (true real-time)
// SLOW:  240/1200 = 0.2    => 1200s = 20min
// MID:   240/450  = 0.533  => 450s  = 7.5min
// FAST:  240/240  = 1.0    => 240s  = 4min
// VFAST: 240/120  = 2.0    => 120s  = 2min
//
// All physics (ball speed, player speed, AI decisions) scale uniformly,
// so simulation results are IDENTICAL across all speed modes.
export type SpeedMode = "REAL" | "VSLOW" | "LOW" | "MID" | "FAST" | "VFAST";
/** Speed multipliers for each mode (applied to dt in engine update) */
export const SPEED_MULTIPLIERS: Record<SpeedMode, number> = {
  REAL:  240 / 5400,  // 0.0444: ~90 real minutes (true real-time)
  VSLOW: 0.10,        // ★ v11.18.0: Very slow (x0.10) - detail observation
  LOW:   0.15,        // ★ v11.18.0: Slow (x0.15) - slow motion
  MID:   0.40,        // ★ v11.18.0: Normal (x0.40) - comfortable pace
  FAST:  1.0,         // Fast (x1.0)  - 4 real minutes
  VFAST: 2.0,         // Very fast (x2.0) - 2 real minutes
};

export type SetPieceType = "throw-in" | "corner" | "free-kick" | null;

export type MatchStats = {
  ownGoals: number;
  throwIns: number;
  throwInsFromPassMiss: number;
  corners: number;
  // v8.7.4: Counter-press and attacking third retention metrics
  turnoverPressHits: { blue: number; red: number };  // Successful ball recoveries during turnoverT window
  attPossStreakFrames: { blue: number; red: number };  // Total frames of possession in attacking third
  attPossStreakCount: { blue: number; red: number };  // Number of attacking third possession streaks
  // v8.7.5: Phase B shot diagnostic metrics
  phaseBEligibleFrames: { blue: number; red: number };  // Frames in Phase B with distToGoal < 7.5
  phaseBShots: { blue: number; red: number };  // Shots taken in Phase B
  phaseBBlockedPassCount: { blue: number; red: number };  // Blocked passes in Phase B
  forcedShotsFromBlocked: { blue: number; red: number };  // Shots forced by blocked pass streak
  
  // v8.8.2: Comprehensive statistics for 1000-match analysis
  passAttempts: { blue: number; red: number };  // Total pass attempts
  passSuccess: { blue: number; red: number };  // Successful passes (reached any teammate)
  passToIntended: { blue: number; red: number };  // v8.8.5: Passes to intended receiver
  passRecovered: { blue: number; red: number };  // v8.8.5: Passes to different teammate
  longPassAttempts: { blue: number; red: number };  // Long pass attempts
  longPassSuccess: { blue: number; red: number };  // Successful long passes
  
  dribbleAttempts: { blue: number; red: number };  // Dribble attempts
  dribbleSuccess: { blue: number; red: number };  // Successful dribbles (not intercepted)
  
  shotsTotal: { blue: number; red: number };  // Total shots
  shotsOnTarget: { blue: number; red: number };  // Shots on target (towards goal)
  
  interceptions: { blue: number; red: number };  // Successful interceptions
  tackles: { blue: number; red: number };  // Tackle attempts
  tackleSuccess: { blue: number; red: number };  // Successful tackles
  
  gkSaveAttempts: { blue: number; red: number };  // Shots faced by GK
  gkSaves: { blue: number; red: number };  // Successful saves by GK
  
  possessionFrames: { blue: number; red: number };  // Frames with ball possession
  
  // ★ v10.2.0: Per-player stats for MVP calculation
  playerStats: {
    goals: number;
    assists: number;
    shots: number;
    shotsOnTarget: number;
    passes: number;
    passSuccess: number;
    dribbles: number;
    dribbleSuccess: number;
    tackles: number;
    tackleSuccess: number;
    interceptions: number;
    saves: number;
    playerIdx: number;
    // ★ v10.4.0: Progressive pass tracking
    progPasses: number;       // Forward passes that advance >10m toward opponent goal
    progPassSuccess: number;  // Successful progressive passes
    longPasses: number;       // Long pass attempts
    longPassSuccess: number;  // Successful long passes
    keyPasses: number;        // Passes leading directly to shot (assist-like)
    chancesCreated: number;   // Passes leading to goal
  }[];
};

export type SetPieceKind = "THROWIN" | "CORNER" | "GOALKICK";

export interface SetPieceRestart {
  kind: SetPieceKind;
  team: number;  // Restarting team (-1 or +1)
  pos: V;  // Restart position (on line)
  // ★ v11.16.0: Set piece animation phases (fully animated)
  // walk: taker runs to ball position
  // setup: taker places ball (brief pause)
  // windup: throw windup or kick run-up
  // kick: actual throw/kick moment
  // done: finished
  phase: "walk" | "setup" | "windup" | "kick" | "done";  // Current animation phase
  timer: number;  // Timer for current phase (counts up)
  takerIdx: number;  // Player index taking the set piece
  targetPos: V;  // Where the ball will be kicked to
  positioned: boolean;  // Whether players have been positioned
  // ★ v11.16.0: Throw-in arm raise animation
  throwArmAngle: number;  // 0=down, 1=fully raised (for throw-in windup)
  // ★ v11.16.0: Kick run-up animation
  kickRunProgress: number;  // 0..1 approach run progress
  // ★ v11.16.0: Log emitted flags
  logEmitted: boolean;  // Whether the main action log has been emitted
  fwdWaitTimer: number;  // ★ v11.21.0: Timer for FWD wait (GOALKICK) - prevents infinite freeze
}

export interface Trail {
  start: V;
  end: V;
  shot: boolean;
  longPass: boolean;
  t: number;
}

export interface SetPieceAnim {
  type: SetPieceType;
  timer: number;
  duration: number;
  throwerIdx: number;
  ballTarget: V;
  phase: "windup" | "release" | "heading" | "wall-forming" | "fk-run";
  headingTimer: number;
  headingPlayers: number[];
  headingWinner: number;
  wallPlayers: number[];
  fkIsShot: boolean;
  fkTeam: number;
}

export interface Player {
  idx: number;  // Player index in st.pl array (0-21)
  pos: V;
  vel: V;  // Velocity vector for inertia
  team: number;
  isBlue: boolean;  // ★ v11.1.0: Original team (true=Blue, false=Red) - never changes between halves
  num: number;
  home: V;
  face: V;
  act: "idle" | "dribble" | "move" | "carry";
  tgt: V;
  dt: number;
  isGK: boolean;
  slot: number;
  role: Role;
  posLabel: string;  // ★ v9.11.0: Detailed position label (RCB, LCB, LB, RB, etc.)
  // ★ v10.1.0: Gacha card integration
  cardName?: string;       // Player name from gacha card (e.g. "メッシ")
  cardNameEn?: string;     // English name (e.g. "L. Messi")
  cardOverall?: number;    // Overall rating from card (50-99)
  cardRarity?: string;     // Rarity (ICON, HERO, UR, SR, R, N)
  // ★ v10.2.0: Per-player stat modifiers from gacha card (multipliers, 1.0 = default)
  cardMods?: {
    moveSpeed: number;       // Multiplier for movement speed (0.8-1.3)
    dribbleSpeed: number;    // Multiplier for dribble speed
    passAccuracy: number;    // Multiplier for pass accuracy
    shotAccuracy: number;    // Multiplier for shot accuracy
    shotSpeed: number;       // Multiplier for shot power
    passSpeed: number;       // Multiplier for pass speed
    interceptRadius: number; // Multiplier for intercept radius
    gkSaveBase: number;      // Multiplier for GK save chance
    // ★ v11.25.0: GK distribution parameters
    gkDecision: number;      // Situational awareness: how quickly GK reads the game (0.80-1.20)
    gkDistribution: number;  // Distribution quality: accuracy/range of throws & kicks (0.80-1.20)
    staminaDrain: number;    // Multiplier for stamina drain (lower = better)
    burstCooldown: number;   // Multiplier for burst cooldown (lower = better)
    // ★ v11.4.0: Curve / spin parameters
    curvePower: number;      // Multiplier for spin intensity (0.5=low, 1.0=normal, 1.5=high) - affects how much the ball curves
    curveAccuracy: number;   // Multiplier for curve control (0.5=wild, 1.0=normal, 1.5=precise) - affects how predictably the ball curves
    technique: number;       // Multiplier for short pass curve/placement (0.5=basic, 1.0=normal, 1.5=technical) - high technique = curved short passes that bend to teammate's feet
  };
  jumpY: number;
  turnDebt: number;  // 0-1, turning inertia penalty
  staminaShort: number;  // 0-1, short-term stamina
  burstT: number;  // Off-the-ball burst timer
  burstCD: number;  // Off-the-ball burst cooldown
  // ★ v8.9.0: Foot system
  leftFoot: Foot;
  rightFoot: Foot;
  footParams: FootParams;
  // ★ v8.9.1: Dribble touch cycle
  dribbleTouchPhase: number;  // 0..2π oscillator for touch cycle
  // ★ v9.9.0: Pass-and-move system
  passAndMoveTimer: number;   // Time remaining for forward run after passing (0 = inactive)
  passAndMoveTarget: V;       // Target position for the forward run
  wantsBall: boolean;         // Player is in space and requesting a pass
  // ★ v9.20.0: Committed run system - once a forward run is decided, lock the target
  committedRunTarget: V | null; // Locked target position for committed run (null = no active run)
  committedRunTimer: number;    // Time remaining for committed run (0 = expired)
  // ★ v11.20.0: GK animation state for catch/punch/hold visuals
  gkAnimState: "none" | "catch" | "punch" | "hold";  // Current GK action animation
  gkAnimTimer: number;   // Remaining time for current GK animation
  gkPunchDir: V | null;  // Direction of punch (for arm extension drawing)
}

export interface Ball {
  pos: V;
  vel: V;
  owner: number | null;
  free: boolean;
  shot: boolean;
  dead: number;
  cooldown: number;
  lastTouchTeam: number;
  lob: number;
  lastKickType?: "PASS" | "LONG" | "CROSS" | "SHOT" | "OTHER";
  lastKickTeam?: number;
  holdT: number;  // v8.7.1: Time since current owner acquired ball (safety valve)
  holdAX0: number;  // v8.7.4: Ball ax when owner acquired (for progress check)
  holdT0: number;  // v8.7.4: Time when owner acquired (for progress check)
  phaseBBlockedPassStreak: number;  // v8.7.5: Consecutive blocked passes in Phase B
  // v8.8.3: Kick event tracking for accurate statistics
  kickSeq: number;  // Sequential kick ID
  kickKind: "PASS" | "LONG" | "SHOT" | "DRIBBLE_LOST" | null;  // Type of current kick
  kickTeam: number;  // Team that kicked (-1, 0, 1)
  intendedReceiverIdx: number | null;  // Intended receiver player index
  kickActive: boolean;  // Whether kick is still in flight/undecided
  prevPos: V;  // Previous frame position for line-segment collision
  lastKickTime: number;  // Time when last kick occurred
  lastKickerIdx: number;  // Player index who kicked
  lastPasserIdx: number;  // ★ v9.13.0: Previous passer for anti-pingpong
  // ★ v9.4.0: Z-axis and spin physics
  z: number;         // Ball height above ground (meters)
  vz: number;        // Vertical velocity (m/s)
  spinX: number;     // Side spin (rad/s) - positive = curves right, negative = curves left
  spinY: number;     // Top/back spin (rad/s) - positive = topspin, negative = backspin
  spinDecay: number; // Spin decay rate per second
  kickFoot: "L" | "R" | null;  // Which foot kicked the ball (for spin direction)
  kickStyle: "inside" | "outside" | "instep" | "toe" | null;  // Kick technique
  // ★ v11.24.0: GK catch/punch tracking
  recentBounceT: number;  // Time since last ground bounce (0 = just bounced, Infinity = never)
  gkPunchedT: number;     // Countdown after GK punch (prevents immediate re-save)
}

// ★ v9.7.0: Ball trail dot for visualizing ball movement path
export interface BallTrailDot {
  pos: V;
  t: number;  // Remaining lifetime
  // ★ v11.5.0: Spin and height info for curve visualization
  spinX?: number;  // Side spin at this point (for color coding)
  z?: number;      // Height at this point (for size scaling)
}

// ★ v9.9.0: Action log entry for SFC-style real-time commentary
export interface ActionLogEntry {
  time: number;       // Match time in seconds
  team: number;       // -1 = blue, 1 = red
  playerNum: number;  // Jersey number
  playerRole: string; // Role (GK/DEF/MID/FWD)
  action: "pass" | "longPass" | "shot" | "dribble" | "tackle" | "intercept" | "goal" | "save" | "passReceive" | "dribbleSuccess" | "dribbleFail" | "turnover";
  detail: string;     // Japanese commentary text
  targetNum?: number; // Target player number (for passes)
  success: boolean;   // Whether the action succeeded
  excitement: number; // 0-3: 0=normal, 1=notable, 2=exciting, 3=spectacular
  ttl: number;        // Time to live in seconds
}

/** ★ v10.3.0: Heatmap data for a single player */
export interface PlayerHeatmap {
  playerIdx: number;
  team: number;       // -1 = blue, 1 = red
  num: number;        // Jersey number
  cardName?: string;  // Player name from gacha card
  posLabel: string;   // Position label (GK, CB, LB, etc.)
  /** Off-ball positions: sampled every N frames (normalized 0-1 in pitch coords) */
  offBall: { x: number; y: number }[];
  /** On-ball events: when player had possession or touched ball */
  onBall: { x: number; y: number; type: 'pass' | 'shot' | 'dribble' | 'receive' | 'tackle' | 'intercept' | 'save'; toX?: number; toY?: number; success?: boolean }[];
}

/** ★ v11.0.0: Goal replay - lightweight snapshot of a single frame */
export interface GoalReplayFrame {
  /** Player positions and team info */
  players: { x: number; y: number; team: number; num: number; isGK: boolean; face: V; act: string }[];
  /** Ball position */
  ball: { x: number; y: number; z: number; free: boolean; owner: number | null };
  /** Ball trail dots */
  trail: BallTrailDot[];
  /** Match clock at this frame */
  matchClock: number;
  /** Score at this frame */
  scoreBlue: number;
  scoreRed: number;
  // ★ v11.28.0: Full-fidelity snapshot for render() reuse
  /** Full player snapshots for render() */
  plSnap: Player[];
  /** Full ball snapshot for render() */
  ballSnap: Ball;
  /** Action log at this frame (for replay commentary) */
  actionLogSnap: ActionLogEntry[];
  /** Match time for spin animation */
  timeSnap: number;
  /** Half number */
  halfSnap: number;
  /** Match phase */
  matchPhaseSnap: string;
  /** Flash overlay */
  flashSnap: number;
  flashTxtSnap: string;
}

/** ★ v11.0.0: Stored goal replay clip */
export interface GoalReplay {
  /** Goal number (1st, 2nd, ...) */
  goalIndex: number;
  /** Scorer name */
  scorerName: string;
  /** Scorer team */
  scorerTeam: number;
  /** Match clock when goal scored */
  matchClock: number;
  /** Score after this goal */
  scoreBlue: number;
  scoreRed: number;
  /** Frames before and after goal (5s before, 1s after at 30fps = ~180 frames) */
  frames: GoalReplayFrame[];
  /** Frame index where goal occurred */
  goalFrameIdx: number;
}

export interface State {
  pl: Player[];
  ball: Ball;
  sL: number;
  sR: number;
  scoreBlue: number;         // ★ v9.22.0: Blue team total goals (persists across halves)
  scoreRed: number;          // ★ v9.22.0: Red team total goals (persists across halves)
  time: number;           // Simulation elapsed time (seconds)
  matchClock: number;      // Match clock in "minutes" (0-90)
  half: 1 | 2;             // Current half (1 = first, 2 = second)
  halftimeShow: boolean;   // Whether halftime screen is showing
  halftimeDone: boolean;   // Whether halftime has been processed
  matchPhase: "kickoff" | "play" | "halftime" | "fulltime";  // Current match phase
  over: boolean;
  paused: boolean;
  pauseT: number;
  koSide: number;
  kickoffReady: boolean;   // Whether kickoff is waiting to be taken
  kickoffCountdown: number; // Countdown before kickoff is taken
  trail: Trail | null;
  flash: number;
  flashTxt: string;
  restartT: number;
  speed: SpeedMode;
  setPiece: SetPieceAnim | null;
  setPieceRestart: SetPieceRestart | null;
  stats: MatchStats;
  atkLevelBlue: number;
  atkLevelRed: number;
  turnoverT: number;  // v8.7.4: Time since turnover (1.2s counter-press window)
  turnoverTeam: number;  // v8.7.4: Team that lost possession (-1, 0, or +1)
  stackDetection: {
    lastBallPos: V;
    stableTime: number;  // Time ball has been in roughly same position
    isStacked: boolean;  // Whether stack is currently detected
  };
  // ★ v9.7.0: Ball trail dots for visualizing ball movement
  ballTrail: BallTrailDot[];
  // ★ v9.9.0: Action log for SFC-style commentary
  actionLog: ActionLogEntry[];
  // ★ v10.3.0: Complete log for headless mode (unlimited, all entries)
  fullLog: ActionLogEntry[];
  // ★ v9.10.0: Possession-based progressive line push
  possessionPush: {
    team: number;       // Which team currently has sustained possession (-1, 0, 1)
    duration: number;   // How long this team has held possession (seconds)
    pushLevel: number;  // 0.0 to 1.0 - how far the team has pushed up
  };
  // ★ v10.3.0: Per-player heatmap data collected during match
  heatmaps: PlayerHeatmap[];
  heatmapSampleCounter: number;  // Frame counter for sampling interval
  // ★ v11.0.0: Goal replay system
  goalReplays: GoalReplay[];        // Stored goal replay clips
  replayBuffer: GoalReplayFrame[];  // Rolling 5-second frame buffer (capped at ~150 frames)
  replayFrameCounter: number;       // Counter to limit buffer capture rate (every 2 frames)
  // ★ v11.7.0: Wall-clock time accumulator for replay capture (speed-mode independent)
  replayWallTimeAccum: number;      // Accumulated real seconds since last replay frame capture
  // ★ v11.19.0: AI decision dt - physics dt at time of last AI decision call
  // Used by decideHasBall/decideNoBall to decrement timers correctly
  aiDecisionDt: number;
  // ★ v9.11.0: Screen effects for dramatic moments (dribble breakthrough, goals)
  screenEffect: {
    type: "none" | "dribbleSuccess" | "goal" | "save";
    timer: number;      // Countdown timer (seconds)
    text: string;       // Big text to display
    playerNum: number;  // Player number involved
    team: number;       // Team involved
  };
}
