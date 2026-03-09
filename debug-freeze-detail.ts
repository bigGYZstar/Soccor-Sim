/**
 * debug-freeze-detail.ts
 * VFASTでのフリーズ原因を詳細調査
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const st = mkState();
(st as any).speed = "VFAST";

let f = 0;
let prevBallPos = { x: 0, y: 0 };
let frozenFrames = 0;
let freezeByCategory: Record<string, number> = {
  setPieceRestart: 0,
  kickoffReady: 0,
  halftimeShow: 0,
  paused: 0,
  ownerFrozen: 0,
  unknown: 0,
};

while (!st.over && f < 8000) {
  update(st, REAL_DT);
  f++;
  
  const b = st.ball;
  const dx = Math.abs(b.pos.x - prevBallPos.x);
  const dy = Math.abs(b.pos.y - prevBallPos.y);
  
  if (dx < 0.01 && dy < 0.01 && st.matchPhase === 'play') {
    frozenFrames++;
    
    // カテゴリ別に分類
    if (st.setPieceRestart) {
      freezeByCategory.setPieceRestart++;
    } else if (st.kickoffReady) {
      freezeByCategory.kickoffReady++;
    } else if ((st as any).halftimeShow) {
      freezeByCategory.halftimeShow++;
    } else if ((st as any).paused) {
      freezeByCategory.paused++;
    } else if (!b.free && b.owner !== null) {
      freezeByCategory.ownerFrozen++;
    } else {
      freezeByCategory.unknown++;
      if (freezeByCategory.unknown <= 5) {
        console.log(`F${f}: 不明フリーズ! pos=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) free=${b.free} owner=${b.owner} shot=${b.shot} vel=(${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)}) cooldown=${b.cooldown?.toFixed(2)}`);
      }
    }
  } else {
    frozenFrames = 0;
  }
  
  prevBallPos = { ...b.pos };
}

const totalGoals = st.scoreBlue + st.scoreRed;
console.log(`\n=== VFAST フリーズ分析 ===`);
console.log(`総フレーム: ${f}, goals=${totalGoals}`);
console.log(`フリーズ内訳:`);
for (const [cat, count] of Object.entries(freezeByCategory)) {
  if (count > 0) {
    console.log(`  ${cat}: ${count}フレーム (${(count/f*100).toFixed(1)}%)`);
  }
}
