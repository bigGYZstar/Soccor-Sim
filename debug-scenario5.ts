/**
 * debug-scenario5.ts
 * owner=20の選手情報を確認
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
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

// 全選手の情報を出力
console.log("=== 全選手情報 ===");
for (let i = 0; i < st.pl.length; i++) {
  const p = st.pl[i];
  console.log(`idx=${i}: team=${p.team} isGK=${p.isGK} pos=(${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}) active=${st.scenarioActiveIdxs?.has(i) ?? true}`);
}

const DT = 1 / 60;
let prevShot = false;

for (let frame = 0; frame < 5; frame++) {
  update(st, DT);
  const b = st.ball;
  const justFired = b.shot && b.free && !prevShot;
  if (justFired) {
    console.log(`\n[Frame ${frame}] シュート! ball=(${b.pos.x.toFixed(2)}, ${b.pos.y.toFixed(2)})`);
  }
  if (b.owner !== null && b.owner !== BLUE_FWD_IDX) {
    const owner = st.pl[b.owner];
    console.log(`[Frame ${frame}] owner=${b.owner}: team=${owner.team} isGK=${owner.isGK} pos=(${owner.pos.x.toFixed(2)}, ${owner.pos.y.toFixed(2)}) active=${st.scenarioActiveIdxs?.has(b.owner) ?? true}`);
  }
  prevShot = b.shot && b.free;
}
