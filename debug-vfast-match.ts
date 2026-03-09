/**
 * debug-vfast-match.ts
 * VFASTで1試合を実行して初期フレームの挙動を確認
 */
import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;

// MIDで1試合
{
  const st = mkState();
  (st as any).speed = "MID";
  let f = 0;
  const max = 60 * 60 * 20;
  while (!st.over && f < max) {
    update(st, REAL_DT);
    f++;
    if (f <= 5 || f % 1000 === 0) {
      console.log(`MID F${f}: phase=${st.matchPhase} score=${st.scoreBlue}-${st.scoreRed} over=${st.over} clock=${st.matchClock.toFixed(1)}`);
    }
  }
  console.log(`MID 完了: ${f}フレーム, score=${st.scoreBlue}-${st.scoreRed}, over=${st.over}\n`);
}

// VFASTで1試合
{
  const st = mkState();
  (st as any).speed = "VFAST";
  let f = 0;
  const max = 60 * 60 * 20;
  while (!st.over && f < max) {
    update(st, REAL_DT);
    f++;
    if (f <= 20 || f % 1000 === 0) {
      console.log(`VFAST F${f}: phase=${st.matchPhase} score=${st.scoreBlue}-${st.scoreRed} over=${st.over} clock=${st.matchClock.toFixed(1)} ball=(${st.ball.pos.x.toFixed(1)},${st.ball.pos.y.toFixed(1)})`);
    }
    if (st.over) break;
  }
  console.log(`VFAST 完了: ${f}フレーム, score=${st.scoreBlue}-${st.scoreRed}, over=${st.over}`);
}
