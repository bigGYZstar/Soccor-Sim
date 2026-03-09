/**
 * debug-vfast-freeze.ts
 * VFASTでボールが止まって動かなくなる原因を調査
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;

const st = mkState();
(st as any).speed = "VFAST";

let f = 0;
let prevBallPos = { x: 0, y: 0 };
let frozenFrames = 0;
let maxFrozenFrames = 0;
let frozenStart = 0;

while (!st.over && f < 60 * 60 * 10) {
  update(st, REAL_DT);
  f++;

  const b = st.ball;
  const dx = Math.abs(b.pos.x - prevBallPos.x);
  const dy = Math.abs(b.pos.y - prevBallPos.y);
  const moved = dx + dy;

  if (moved < 0.01 && !b.free && b.owner === null) {
    // ボールが止まっていて誰も持っていない
    frozenFrames++;
    if (frozenFrames === 1) frozenStart = f;
    if (frozenFrames > maxFrozenFrames) {
      maxFrozenFrames = frozenFrames;
    }
    if (frozenFrames === 1 || frozenFrames % 100 === 0) {
      console.log(`F${f}: ボールフリーズ! pos=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) vel=(${b.vel.x.toFixed(2)}, ${b.vel.y.toFixed(2)}) phase=${st.matchPhase} setPiece=${st.setPiece?.type ?? 'null'} setPieceRestart=${st.setPieceRestart}`);
    }
  } else {
    if (frozenFrames > 10) {
      console.log(`F${f}: フリーズ解除 (${frozenFrames}フレーム間フリーズ, 開始F${frozenStart})`);
    }
    frozenFrames = 0;
  }

  prevBallPos = { ...b.pos };

  // 最初の100フレームを詳細表示
  if (f <= 30) {
    console.log(`F${f}: phase=${st.matchPhase} score=${st.scoreBlue}-${st.scoreRed} ball=(${b.pos.x.toFixed(1)},${b.pos.y.toFixed(1)}) vel=(${b.vel.x.toFixed(1)},${b.vel.y.toFixed(1)}) free=${b.free} owner=${b.owner} clock=${st.matchClock.toFixed(1)} setPiece=${st.setPiece?.type ?? 'null'} kickoffReady=${st.kickoffReady}`);
  }
}

console.log(`\n=== 結果 ===`);
console.log(`総フレーム: ${f}`);
console.log(`最大フリーズ時間: ${maxFrozenFrames}フレーム (${(maxFrozenFrames/60).toFixed(1)}秒)`);
console.log(`最終スコア: ${st.scoreBlue}-${st.scoreRed}`);
console.log(`試合終了: ${st.over}`);
