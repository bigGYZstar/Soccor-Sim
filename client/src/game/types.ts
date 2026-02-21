// Type definitions for futsal simulation engine
// Extracted from Home.tsx for UI-independent testing

export interface V {
  x: number;
  y: number;
}

export type Role = "GK" | "DEF" | "MID" | "FWD";

export type SpeedMode = "LOW" | "MID" | "FAST";

export type SetPieceType = "throw-in" | "corner" | "free-kick" | null;

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
  pos: V;
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
  atkLevelBlue: number;
  atkLevelRed: number;
}
