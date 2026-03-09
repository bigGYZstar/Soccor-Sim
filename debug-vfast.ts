/**
 * debug-vfast.ts
 * VFASTモードで27mシュートのゴール率が0%になる原因を調査
 */
import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const BLUE_FWD_IDX = 9;
const RED_GK_IDX = 11;

// VFASTで10試行を詳細トレース
const TRIALS = 10;
const REAL_DT = 1 / 60;

for (let trial = 0; trial < TRIALS; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.matchClock = 0;
  st.kickoffReady = false;
  (st as any).speed = "VFAST";

  const activeIdxs = new Set<number>();
  activeIdxs.add(BLUE_FWD_IDX);
  activeIdxs.add(RED_GK_IDX);
  st.scenarioActiveIdxs = activeIdxs;

  const attacker = st.pl[BLUE_FWD_IDX];
  attacker.pos = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.home = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.tgt = { x: PITCH_HALF_W - 27, y: 0 };
  attacker.face = v(1, 0);
  attacker.dt = 0;
  attacker.act = "idle";
  updatePlayerFeet(attacker);

  st.ball.pos = { x: PITCH_HALF_W - 27, y: 0 };
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

  const maxFrames = 8 * 60;
  let outcome = "timeout";
  let shotFired = false;
  let prevBallShot = false;

  console.log(`\n=== Trial ${trial + 1} (VFAST) ===`);

  for (let frame = 0; frame < maxFrames; frame++) {
    update(st, REAL_DT);
    const b = st.ball;
    const atk = st.pl[BLUE_FWD_IDX];
    const gkPlayer = st.pl[RED_GK_IDX];

    const justFired = b.shot && b.free && !prevBallShot;
    if (justFired) {
      shotFired = true;
      console.log(`  F${frame}: シュート発射! ball=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) vel=(${b.vel.x.toFixed(1)}, ${b.vel.y.toFixed(1)}) speed=${Math.sqrt(b.vel.x**2+b.vel.y**2).toFixed(1)}m/s`);
    }

    if (shotFired) {
      if (frame < 30 || b.pos.x > PITCH_HALF_W - 5) {
        const velStr = b.free ? `vel=(${b.vel.x.toFixed(1)}, ${b.vel.y.toFixed(1)})` : `owner=${b.owner}`;
        console.log(`  F${frame}: ball=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) ${velStr} shot=${b.shot} free=${b.free} cd=${b.cooldown.toFixed(2)} gk=(${gkPlayer.pos.x.toFixed(1)}, ${gkPlayer.pos.y.toFixed(1)}) matchPhase=${st.matchPhase} scoreRed=${st.scoreRed}`);
      }
    }

    prevBallShot = b.shot && b.free;

    if (st.scoreRed > 0 && shotFired) {
      outcome = "goal";
      console.log(`  → ゴール！`);
      break;
    }

    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      outcome = "save";
      console.log(`  → セーブ (GKがキャッチ)`);
      break;
    }

    if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        outcome = "miss";
        console.log(`  → 枠外 (x=${b.pos.x.toFixed(1)}, y=${b.pos.y.toFixed(1)})`);
      }
      break;
    }

    if (st.setPieceRestart && shotFired) {
      outcome = "save";
      console.log(`  → セットピース再開`);
      break;
    }

    if (st.matchPhase === "kickoff" && shotFired) {
      outcome = "goal";
      console.log(`  → ゴール (kickoff再開)`);
      break;
    }

    if (frame === maxFrames - 1) {
      console.log(`  → タイムアウト (ball=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) shot=${b.shot} free=${b.free} owner=${b.owner})`);
    }
  }

  console.log(`  結果: ${outcome}`);
}
