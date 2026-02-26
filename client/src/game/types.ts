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

export type SpeedMode = "LOW" | "MID" | "FAST";

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
};

export type SetPieceKind = "THROWIN" | "CORNER" | "GOALKICK";

export interface SetPieceRestart {
  kind: SetPieceKind;
  team: number;  // Restarting team (-1 or +1)
  pos: V;  // Restart position (on line)
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
}

// ★ v9.7.0: Ball trail dot for visualizing ball movement path
export interface BallTrailDot {
  pos: V;
  t: number;  // Remaining lifetime
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

export interface State {
  pl: Player[];
  ball: Ball;
  sL: number;
  sR: number;
  time: number;
  over: boolean;
  paused: boolean;
  pauseT: number;
  koSide: number;
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
  // ★ v9.10.0: Possession-based progressive line push
  possessionPush: {
    team: number;       // Which team currently has sustained possession (-1, 0, 1)
    duration: number;   // How long this team has held possession (seconds)
    pushLevel: number;  // 0.0 to 1.0 - how far the team has pushed up
  };
  // ★ v9.11.0: Screen effects for dramatic moments (dribble breakthrough, goals)
  screenEffect: {
    type: "none" | "dribbleSuccess" | "goal" | "save";
    timer: number;      // Countdown timer (seconds)
    text: string;       // Big text to display
    playerNum: number;  // Player number involved
    team: number;       // Team involved
  };
}
