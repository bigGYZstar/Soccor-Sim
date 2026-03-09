import { mkState, update, give } from './client/src/game/engine';
import type { State } from './client/src/game/types';

const PITCH_HALF_W = 52.5;

const st: State = mkState('4-4-2', '4-4-2');
st.matchClock = 45.0;
st.matchPhase = 'play' as any;
st.phase = 'play' as any;
st.kickoffReady = false;
st.setPiece = null;
st.setPieceRestart = null;

for (const p of st.pl) {
  p.pos = { x: 0, y: 200 };
  p.tgt = { x: 0, y: 200 };
  p.vel = { x: 0, y: 0 };
  p.act = 'idle';
  p.committedRunTarget = null;
  p.committedRunTimer = 0;
}

// 青チームGK
const blueGK = st.pl.find(p => p.team === -1 && p.isGK)!;
blueGK.pos = { x: -PITCH_HALF_W + 2.0, y: 0 };
blueGK.tgt = { x: -PITCH_HALF_W + 2.0, y: 0 };
blueGK.vel = { x: 0, y: 0 };
blueGK.act = 'idle';

// 赤チームGK（守備側）
const redGK = st.pl.find(p => p.team === 1 && p.isGK)!;
redGK.pos = { x: PITCH_HALF_W - 2.0, y: 0 };
redGK.tgt = { x: PITCH_HALF_W - 2.0, y: 0 };
redGK.vel = { x: 0, y: 0 };
redGK.act = 'idle';

// 攻撃側FWD（青チーム）
const blueFWDs = st.pl.filter(p => p.team === -1 && !p.isGK);
const fwd = blueFWDs[0];
fwd.pos = { x: -40.5, y: 0 };
fwd.tgt = { x: -40.5, y: 0 };
fwd.home = { x: -40.5, y: 0 };
fwd.vel = { x: 0, y: 0 };
fwd.act = 'idle';
fwd.role = 'FWD';

// ボール
st.ball.pos = { x: -40.5, y: 0 };
st.ball.vel = { x: 0, y: 0 };
st.ball.z = 0;
st.ball.vz = 0;
st.ball.shot = false;
st.ball.free = false;
st.ball.dead = 0;
st.ball.cooldown = 0;
st.ball.lastTouchTeam = -1;
give(st.ball, fwd.idx, st.pl, st, 'pickup');

console.log('初期状態:');
console.log(`  FWD位置: (${fwd.pos.x.toFixed(1)}, ${fwd.pos.y.toFixed(1)})`);
console.log(`  赤GK位置: (${redGK.pos.x.toFixed(1)}, ${redGK.pos.y.toFixed(1)})`);
console.log(`  ボール所有者: ${st.ball.owner} (FWD idx=${fwd.idx})`);
console.log(`  全選手位置:`);
for (const p of st.pl) {
  if (Math.abs(p.pos.y) < 100) {
    console.log(`    idx=${p.idx} team=${p.team} role=${p.role} isGK=${p.isGK} pos=(${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)})`);
  }
}

const DT = 1/60;
let shotFired = false;
for (let step = 0; step < 300; step++) {
  const prevShot = st.ball.shot;
  const prevOwner = st.ball.owner;
  update(st, DT);

  if (!prevShot && st.ball.shot) {
    console.log(`\nシュート発射！ step=${step} time=${(step*DT).toFixed(2)}s`);
    console.log(`  ボール位置: (${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
    console.log(`  ボール速度: (${st.ball.vel.x.toFixed(1)}, ${st.ball.vel.y.toFixed(1)})`);
    shotFired = true;
  }

  if (shotFired && st.ball.owner !== null && st.ball.owner !== prevOwner) {
    const owner = st.pl[st.ball.owner];
    console.log(`\nボール所有者変化: step=${step} → player idx=${st.ball.owner} team=${owner?.team} role=${owner?.role} isGK=${owner?.isGK}`);
    console.log(`  ボール位置: (${st.ball.pos.x.toFixed(1)}, ${st.ball.pos.y.toFixed(1)})`);
    break;
  }

  if (st.scoreBlue > 0) {
    console.log(`\nゴール！ step=${step}`);
    break;
  }

  if (step % 60 === 0) {
    const ownerInfo = st.ball.owner !== null ? `idx=${st.ball.owner} team=${st.pl[st.ball.owner]?.team}` : 'free';
    console.log(`  step=${step} ball=(${st.ball.pos.x.toFixed(1)},${st.ball.pos.y.toFixed(1)}) shot=${st.ball.shot} owner=${ownerInfo}`);
  }
}
