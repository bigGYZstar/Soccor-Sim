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
}
