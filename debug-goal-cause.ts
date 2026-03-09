/**
 * debug-goal-cause.ts
 * VFASTでのゴール原因を詳細調査
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const st = mkState();
(st as any).speed = "VFAST";

let f = 0;
let freezeGiveCount = 0;
let totalGoals = 0;
let goalAfterFreezeGive = 0;
let lastFreezeGiveFrame = -999;

// Patch give to track freeze gives
const origFreeze = (st.ball as any).freezeT;

while (!st.over && f < 8000) {
  const prevScore = st.scoreBlue + st.scoreRed;
  const prevFreezeT = st.ball.freezeT;
  
  update(st, REAL_DT);
  f++;
  
  // Detect freeze give (freezeT was > 3.0 and ball got an owner)
  if (prevFreezeT > 3.0 && st.ball.owner !== null && st.ball.freezeT === 0) {
    freezeGiveCount++;
    lastFreezeGiveFrame = f;
    if (freezeGiveCount <= 3) {
      console.log(`F${f}: freezeGive! owner=${st.ball.owner} pos=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
    }
  }
  
  // Detect goal
  const newScore = st.scoreBlue + st.scoreRed;
  if (newScore > prevScore) {
    totalGoals++;
    const isAfterFreeze = (f - lastFreezeGiveFrame) < 30;
    if (isAfterFreeze) goalAfterFreezeGive++;
    if (totalGoals <= 5) {
      console.log(`F${f}: GOAL! score=${st.scoreBlue}-${st.scoreRed} afterFreeze=${isAfterFreeze} (lastFreezeGive: F${lastFreezeGiveFrame})`);
    }
  }
}

console.log(`\n=== VFAST ゴール原因分析 ===`);
console.log(`総フレーム: ${f}, 総ゴール: ${totalGoals}`);
console.log(`freezeGive発動回数: ${freezeGiveCount}`);
console.log(`freezeGive後30フレーム以内のゴール: ${goalAfterFreezeGive} (${(goalAfterFreezeGive/totalGoals*100).toFixed(1)}%)`);
