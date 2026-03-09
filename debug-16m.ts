/**
 * debug-16m.ts
 * 16.5mシュートの枠外率が高い原因を調査
 * pSAとerrRangeの実際の値を確認
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

let goalCount = 0, saveCount = 0, missCount = 0;
let shotYValues: number[] = [];

for (let trial = 0; trial < 500; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;
  st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

  const att = st.pl[BLUE_FWD_IDX];
  att.pos = { x: PITCH_HALF_W - 16.5, y: 0 };
  att.home = { x: PITCH_HALF_W - 16.5, y: 0 };
  att.tgt = { x: PITCH_HALF_W - 16.5, y: 0 };
  att.face = v(1, 0);
  att.dt = 0;
  att.act = "idle";
  updatePlayerFeet(att);

  st.ball.pos = { x: PITCH_HALF_W - 16.5, y: 0 };
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
  let outcome = "timeout";
  let prevShot = false;
  let shotFired = false;
  let shotVel = { x: 0, y: 0 };
  let shotPos = { x: 0, y: 0 };

  for (let frame = 0; frame < 480; frame++) {
    update(st, DT);
    const b = st.ball;
    const justFired = b.shot && b.free && !prevShot;
    if (!shotFired && justFired) {
      shotFired = true;
      shotVel = { x: b.vel.x, y: b.vel.y };
      shotPos = { x: b.pos.x, y: b.pos.y };
      
      // ゴールに到達した時のY座標を計算
      const dx = PITCH_HALF_W - shotPos.x;
      const ratio = dx / Math.max(0.001, Math.abs(shotVel.x));
      const goalY = shotPos.y + shotVel.y * ratio;
      shotYValues.push(goalY);
    }
    prevShot = b.shot && b.free;

    if (st.scoreRed > 0) { outcome = "goal"; break; }
    if (b.pos.x > PITCH_HALF_W + 2.0 && Math.abs(b.pos.y) < GOAL_HALF_H) { outcome = "goal"; break; }
    if (st.matchPhase === "kickoff" && shotFired) { outcome = "goal"; break; }
    if (!b.free && b.owner === RED_GK_IDX && shotFired) { outcome = "save"; break; }
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 3 || Math.abs(b.pos.y) > 34.5) {
      if (shotFired) { outcome = "miss"; break; }
    }
    if (st.setPieceRestart && shotFired) { outcome = "save"; break; }
  }

  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else missCount++;
}

console.log(`=== 16.5mシュート 500試行結果 ===`);
console.log(`ゴール: ${goalCount} (${(goalCount/5).toFixed(1)}%)`);
console.log(`セーブ: ${saveCount} (${(saveCount/5).toFixed(1)}%)`);
console.log(`枠外/その他: ${missCount} (${(missCount/5).toFixed(1)}%)`);

// shotYValuesの統計
if (shotYValues.length > 0) {
  const absY = shotYValues.map(y => Math.abs(y));
  const maxY = Math.max(...absY);
  const avgY = absY.reduce((a, b) => a + b, 0) / absY.length;
  const outOfFrame = absY.filter(y => y > GOAL_HALF_H).length;
  console.log(`\nシュートY到達値（ゴールライン時）:`);
  console.log(`  平均|Y|: ${avgY.toFixed(2)}m`);
  console.log(`  最大|Y|: ${maxY.toFixed(2)}m`);
  console.log(`  枠外(|Y|>${GOAL_HALF_H}): ${outOfFrame}/${shotYValues.length} (${(outOfFrame/shotYValues.length*100).toFixed(1)}%)`);
  
  // 分布
  const bins = [0, 1, 2, 3, 4, 5, 10, 20, 50];
  for (let i = 0; i < bins.length - 1; i++) {
    const count = absY.filter(y => y >= bins[i] && y < bins[i+1]).length;
    console.log(`  ${bins[i]}-${bins[i+1]}m: ${count} (${(count/shotYValues.length*100).toFixed(1)}%)`);
  }
}
