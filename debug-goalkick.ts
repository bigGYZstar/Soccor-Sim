/**
 * debug-goalkick.ts
 * VFASTでのGOALKICKフリーズを詳細調査
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const st = mkState();
(st as any).speed = "VFAST";

let f = 0;
let gkFreezeCount = 0;
let prevSetPiece: any = null;

while (!st.over && f < 3000) {
  update(st, REAL_DT);
  f++;
  
  const sp = st.setPieceRestart;
  
  // GOALKICKのフリーズを検出
  if (sp && sp.kind === "GOALKICK") {
    if (!prevSetPiece || prevSetPiece.kind !== "GOALKICK") {
      console.log(`F${f}: GOALKICK開始! phase=${sp.phase} fwdWaitTimer=${sp.fwdWaitTimer?.toFixed(2)} ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
      gkFreezeCount++;
    }
    if (f % 10 === 0 || sp.fwdWaitTimer > 2.0) {
      console.log(`  F${f}: phase=${sp.phase} timer=${sp.timer?.toFixed(2)} fwdWaitTimer=${sp.fwdWaitTimer?.toFixed(2)} ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
    }
  }
  
  if (!sp && prevSetPiece && prevSetPiece.kind === "GOALKICK") {
    console.log(`F${f}: GOALKICK終了! ball=(${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)}) vel=(${st.ball.vel.x.toFixed(1)}, ${st.ball.vel.y.toFixed(1)})`);
  }
  
  prevSetPiece = sp ? { ...sp } : null;
  
  if (gkFreezeCount >= 3) break;
}

console.log(`\n総フレーム: ${f}, score=${st.scoreBlue}-${st.scoreRed}`);
