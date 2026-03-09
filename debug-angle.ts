/**
 * debug-angle.ts
 * PA角度12mシュートの枠外率が高い原因を調査
 * FWD位置: (40.5, 6) → 赤ゴール(52.5, 0)まで
 */

import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

let goalCount = 0, saveCount = 0, missCount = 0;
let shotYAtGoal: number[] = [];

for (let trial = 0; trial < 200; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;
  st.scenarioActiveIdxs = new Set([BLUE_FWD_IDX, RED_GK_IDX]);

  const att = st.pl[BLUE_FWD_IDX];
  // PA角度12m: FWD位置 (40.5, 6)
  att.pos = { x: PITCH_HALF_W - 12, y: 6 };
  att.home = { x: PITCH_HALF_W - 12, y: 6 };
  att.tgt = { x: PITCH_HALF_W - 12, y: 6 };
  att.face = v(1, 0);
  att.dt = 0;
  att.act = "idle";
  updatePlayerFeet(att);

  st.ball.pos = { x: PITCH_HALF_W - 12, y: 6 };
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
      
      // ゴールラインに到達した時のY座標を計算
      const dx = PITCH_HALF_W - shotPos.x;
      if (Math.abs(shotVel.x) > 0.01) {
        const t = dx / shotVel.x;
        const goalY = shotPos.y + shotVel.y * t;
        shotYAtGoal.push(goalY);
        
        if (trial < 5) {
          console.log(`[Trial ${trial}] shotPos=(${shotPos.x.toFixed(1)}, ${shotPos.y.toFixed(1)}) vel=(${shotVel.x.toFixed(1)}, ${shotVel.y.toFixed(1)}) goalY=${goalY.toFixed(2)}m`);
        }
      }
    }
    prevShot = b.shot && b.free;

    if (st.scoreRed > 0) { outcome = "goal"; break; }
    if (b.pos.x > PITCH_HALF_W + 2.0 && Math.abs(b.pos.y) < GOAL_HALF_H) { outcome = "goal"; break; }
    if (st.matchPhase === "kickoff" && shotFired) { outcome = "goal"; break; }
    if (!b.free && b.owner === RED_GK_IDX && shotFired) { outcome = "save"; break; }
    if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        if (trial < 10) {
          console.log(`[Trial ${trial}] OUT: pos=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) lastTouchTeam=${b.lastTouchTeam} shot=${b.shot}`);
        }
        outcome = b.lastTouchTeam === 1 ? "save" : "miss";
      }
      break;
    }
    if (st.setPieceRestart && shotFired) { outcome = "save"; break; }
  }

  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else missCount++;
}

console.log(`\n=== PA角度12m 200試行結果 ===`);
console.log(`ゴール: ${goalCount} (${(goalCount/2).toFixed(1)}%)`);
console.log(`セーブ: ${saveCount} (${(saveCount/2).toFixed(1)}%)`);
console.log(`枠外/その他: ${missCount} (${(missCount/2).toFixed(1)}%)`);

if (shotYAtGoal.length > 0) {
  const absY = shotYAtGoal.map(y => Math.abs(y));
  const outOfFrame = absY.filter(y => y > GOAL_HALF_H).length;
  const avgY = absY.reduce((a, b) => a + b, 0) / absY.length;
  console.log(`\nゴールラインY到達値:`);
  console.log(`  平均|Y|: ${avgY.toFixed(2)}m`);
  console.log(`  枠外(|Y|>${GOAL_HALF_H}): ${outOfFrame}/${shotYAtGoal.length} (${(outOfFrame/shotYAtGoal.length*100).toFixed(1)}%)`);
  
  // 分布
  const bins = [0, 1, 2, 3, 4, 5, 8, 15];
  for (let i = 0; i < bins.length - 1; i++) {
    const count = absY.filter(y => y >= bins[i] && y < bins[i+1]).length;
    if (count > 0) console.log(`  ${bins[i]}-${bins[i+1]}m: ${count} (${(count/shotYAtGoal.length*100).toFixed(1)}%)`);
  }
}
