/**
 * debug-scenario4.ts
 * ゴール判定の詳細デバッグ
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v, vnorm } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const GOAL_DEPTH = 2.0;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

const st = mkState();
st.matchPhase = "play";
st.matchClock = 0;
st.kickoffReady = false;
st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

const att = st.pl[BLUE_FWD_IDX];
att.pos = { x: PITCH_HALF_W - 12, y: 0 };
att.home = { x: PITCH_HALF_W - 12, y: 0 };
att.tgt = { x: PITCH_HALF_W - 12, y: 0 };
att.face = v(1, 0);
att.dt = 0;
att.act = "idle";
updatePlayerFeet(att);

st.ball.pos = { x: PITCH_HALF_W - 12, y: 0 };
st.ball.vel = v(0, 0);
st.ball.free = false;
st.ball.owner = BLUE_FWD_IDX;
st.ball.lastTouchTeam = -1;
st.ball.shot = false;
st.ball.cooldown = 0;
st.ball.z = 0;
st.ball.vz = 0;

const gk = st.pl[RED_GK_IDX];
gk.pos = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.home = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.tgt = { x: PITCH_HALF_W - 2.5, y: 0 };
gk.face = v(-1, 0);
gk.dt = 0;
gk.act = "idle";
updatePlayerFeet(gk);

const DT = 1 / 60;
let prevShot = false;
let shotFired = false;

console.log("=== 詳細フレームログ ===");

for (let frame = 0; frame < 100; frame++) {
  update(st, DT);
  const b = st.ball;
  const justFired = b.shot && b.free && !prevShot;
  
  if (!shotFired && justFired) {
    shotFired = true;
    const spd = Math.sqrt(b.vel.x**2 + b.vel.y**2);
    console.log(`[Frame ${frame}] シュート発射! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) spd=${spd.toFixed(1)} GK=(${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)})`);
  }
  
  if (shotFired) {
    const spd = Math.sqrt(b.vel.x**2 + b.vel.y**2);
    console.log(`[Frame ${frame}] ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) spd=${spd.toFixed(1)} shot=${b.shot} free=${b.free} owner=${b.owner} GK=(${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)}) scoreRed=${st.scoreRed} setPiece=${st.setPieceRestart?.kind ?? 'null'}`);
  }
  
  prevShot = b.shot && b.free;
  
  if (st.scoreRed > 0) {
    console.log(`→ ゴール! scoreRed=${st.scoreRed}`);
    break;
  }
  if (!b.free && b.owner === RED_GK_IDX && shotFired) {
    console.log(`→ GKセーブ`);
    break;
  }
  if (b.pos.x > PITCH_HALF_W + GOAL_DEPTH && Math.abs(b.pos.y) < GOAL_HALF_H) {
    console.log(`→ ゴール判定! (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
    break;
  }
  if (Math.abs(b.pos.x) > PITCH_HALF_W + 3 || Math.abs(b.pos.y) > 34.5) {
    console.log(`→ アウト (${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
    break;
  }
  if (st.setPieceRestart && shotFired) {
    console.log(`→ セットプレー: ${st.setPieceRestart.kind}`);
    break;
  }
  if (frame >= 99) {
    console.log(`→ タイムアウト`);
  }
}
