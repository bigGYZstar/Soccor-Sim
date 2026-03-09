/**
 * debug-throwin.ts
 * VFASTでのスローイン処理を詳細デバッグ
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;

// MIDとVFASTでスローイン処理を比較
for (const mode of ["MID", "VFAST"]) {
  console.log(`\n=== ${mode}モード ===`);
  const st = mkState();
  (st as any).speed = mode;

  let f = 0;
  let throwInCount = 0;
  let prevSetPieceRestart: any = null;
  let throwInStartFrame = -1;
  let throwInEndFrame = -1;

  while (!st.over && f < 60 * 60 * 5 && throwInCount < 3) {
    update(st, REAL_DT);
    f++;

    const sp = st.setPieceRestart;

    // スローイン開始を検出
    if (sp && !prevSetPieceRestart) {
      throwInStartFrame = f;
      throwInCount++;
      console.log(`  F${f}: スローイン開始! pos=(${sp.pos?.x?.toFixed(1)}, ${sp.pos?.y?.toFixed(1)}) kind=${sp.kind} phase=${sp.phase} ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}) paused=${st.paused} pauseT=${st.pauseT?.toFixed(2)}`);
    }

    // スローイン中の状態を追跡
    if (sp && throwInStartFrame > 0) {
      if (f - throwInStartFrame <= 50 || f % 20 === 0) {
        console.log(`  F${f}: sp.phase=${sp.phase} sp.timer=${sp.timer?.toFixed(2)} ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}) paused=${st.paused} pauseT=${st.pauseT?.toFixed(2)}`);
      }
    }

    // スローイン終了を検出
    if (!sp && prevSetPieceRestart) {
      throwInEndFrame = f;
      console.log(`  F${f}: スローイン終了! 所要フレーム=${f - throwInStartFrame} ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}) vel=(${st.ball.vel.x.toFixed(1)}, ${st.ball.vel.y.toFixed(1)})`);
    }

    prevSetPieceRestart = sp ? { ...sp } : null;
  }
}
