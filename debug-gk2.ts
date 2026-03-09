/**
 * debug-gk2.ts
 * GKのcanSave判定の詳細を確認
 * saveChance=0.30なのにセーブ率57%になる原因を調査
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

// 1試行の詳細ログ
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

// gkSaveAttempts を監視
const prevSaveAttempts = { blue: 0, red: 0 };

for (let frame = 0; frame < 20; frame++) {
  const b = st.ball;
  const gkPos = { x: gk.pos.x, y: gk.pos.y };
  const ballPos = { x: b.pos.x, y: b.pos.y };
  
  update(st, DT);
  
  const justFired = b.shot && b.free && !prevShot;
  if (!shotFired && justFired) {
    shotFired = true;
    console.log(`[Frame ${frame}] シュート発射! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) vel=(${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)})`);
  }
  
  // セーブ試行を検出
  if (st.stats.gkSaveAttempts.red > prevSaveAttempts.red) {
    console.log(`[Frame ${frame}] GKセーブ試行! GK=(${gkPos.x.toFixed(2)}, ${gkPos.y.toFixed(2)}) ball=(${ballPos.x.toFixed(2)}, ${ballPos.y.toFixed(2)})`);
    console.log(`  セーブ試行数: ${st.stats.gkSaveAttempts.red}`);
    console.log(`  セーブ成功数: ${st.stats.gkSaves.red}`);
    prevSaveAttempts.red = st.stats.gkSaveAttempts.red;
  }
  
  if (shotFired) {
    console.log(`[Frame ${frame}] GK=(${gk.pos.x.toFixed(2)}, ${gk.pos.y.toFixed(2)}) ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)}) owner=${b.owner} shot=${b.shot} free=${b.free}`);
  }
  
  prevShot = b.shot && b.free;
  
  if (st.matchPhase === "kickoff" || (!b.free && b.owner !== null && shotFired)) break;
}

console.log(`\n最終セーブ試行数: ${st.stats.gkSaveAttempts.red}`);
console.log(`最終セーブ成功数: ${st.stats.gkSaves.red}`);
