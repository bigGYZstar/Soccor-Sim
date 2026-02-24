// Type definitions for futsal simulation engine
// Extracted from Home.tsx for UI-independent testing

export interface V {
  x: number;
  y: number;
}

export type Role = "GK" | "DEF" | "MID" | "FWD";

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
  jumpY: number;
  turnDebt: number;  // 0-1, turning inertia penalty
  staminaShort: number;  // 0-1, short-term stamina
  burstT: number;  // Off-the-ball burst timer
  burstCD: number;  // Off-the-ball burst cooldown
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
}
