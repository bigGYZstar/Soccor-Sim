import { mkState, update } from './client/src/game/engine';

const REAL_DT = 1/60;
const st = mkState();
(st as any).speed = "VFAST";

let f = 0;
let prevBallPos = { x: 0, y: 0 };
let frozenFrames = 0;
let maxFrozen = 0;
let totalFrozenFrames = 0;

while (!st.over && f < 20000) {
  update(st, REAL_DT);
  f++;
  
  const b = st.ball;
  const dx = Math.abs(b.pos.x - prevBallPos.x);
  const dy = Math.abs(b.pos.y - prevBallPos.y);
  
  if (dx < 0.01 && dy < 0.01 && st.matchPhase === 'play' && !st.setPieceRestart) {
    frozenFrames++;
    if (frozenFrames > maxFrozen) maxFrozen = frozenFrames;
    if (frozenFrames > 5) totalFrozenFrames++;
  } else {
    frozenFrames = 0;
  }
  
  prevBallPos = { ...b.pos };
}

const totalGoals = st.scoreBlue + st.scoreRed;
const frozenPct = (totalFrozenFrames / f * 100).toFixed(1);
console.log(`VFAST: ${f}フレーム, score=${st.scoreBlue}-${st.scoreRed}, goals=${totalGoals}`);
console.log(`フリーズ: ${totalFrozenFrames}フレーム(${frozenPct}%), 最大連続: ${maxFrozen}フレーム`);
