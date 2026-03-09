// GKセーブ処理の詳細デバッグ
import { mkState, update, updatePlayerFeet } from './client/src/game/engine';
import { v } from './client/src/game/math';

const DT = 1 / 60;
const PITCH_HALF_W = 52.5;
const GOAL_HALF_H = 3.66;
const GOAL_DEPTH = 2.0;

// 12mシュート（GKのみ）のシナリオ
const ATT_IDX = 9;
const RED_GK_IDX = 11;

let goalCount = 0;
let saveCount = 0;
let missCount = 0;
let gkReachedBall = 0;

const TRIALS = 200;

for (let trial = 0; trial < TRIALS; trial++) {
  const st = mkState();
  st.matchPhase = "play";
  st.scenarioActiveIdxs = new Set([ATT_IDX, RED_GK_IDX]);

  const att = st.pl[ATT_IDX];
  att.team = -1;
  att.isGK = false;
  att.pos = v(40.5, 0);
  att.vel = v(0, 0);
  att.tgt = v(40.5, 0);
  updatePlayerFeet(att);

  const gk = st.pl[RED_GK_IDX];
  gk.team = 1;
  gk.isGK = true;
  gk.pos = v(50.0, 0);
  gk.vel = v(0, 0);
  gk.tgt = v(50.0, 0);
  updatePlayerFeet(gk);

  st.ball.pos = v(40.5, 0);
  st.ball.vel = v(0, 0);
  st.ball.free = false;
  st.ball.owner = ATT_IDX;
  st.ball.shot = false;

  let outcome = "timeout";
  let shotFired = false;
  let frameCount = 0;
  let gkSaveAttempted = false;
  let gkDistMin = 999;

  for (let frame = 0; frame < 300; frame++) {
    const b = st.ball;
    const prevShot = b.shot && b.free;

    update(st, DT);
    frameCount++;

    if (!shotFired && b.shot && b.free) {
      shotFired = true;
    }

    if (shotFired) {
      const gkDist = Math.sqrt((b.pos.x - gk.pos.x) ** 2 + (b.pos.y - gk.pos.y) ** 2);
      if (gkDist < gkDistMin) gkDistMin = gkDist;

      // GKがボールに近い場合
      if (gkDist < 1.5) {
        gkReachedBall++;
        if (trial < 5) {
          console.log(`[Trial ${trial}] Frame ${frame}: GK dist=${gkDist.toFixed(2)} ball=(${b.pos.x.toFixed(1)}, ${b.pos.y.toFixed(1)}) free=${b.free} shot=${b.shot} owner=${b.owner}`);
        }
      }
    }

    // ゴール判定
    if (Math.abs(b.pos.y) < GOAL_HALF_H && shotFired) {
      if (b.pos.x > PITCH_HALF_W + GOAL_DEPTH) {
        outcome = "goal"; break;
      } else if (b.pos.x > PITCH_HALF_W && b.free) {
        outcome = "goal"; break;
      }
    }

    if (st.scoreRed > 0 || st.matchPhase === "kickoff") {
      outcome = "goal"; break;
    }

    if (!b.free && b.owner === RED_GK_IDX && shotFired) {
      outcome = "save"; break;
    }

    if (Math.abs(b.pos.x) > PITCH_HALF_W + 0.5 || Math.abs(b.pos.y) > 34 + 0.5) {
      if (shotFired) {
        outcome = b.lastTouchTeam === 1 ? "save" : "miss";
      }
      break;
    }

    if (st.setPieceRestart && shotFired) {
      outcome = "save"; break;
    }
  }

  if (outcome === "goal") goalCount++;
  else if (outcome === "save") saveCount++;
  else missCount++;

  if (trial < 5) {
    console.log(`[Trial ${trial}] outcome=${outcome} gkDistMin=${gkDistMin.toFixed(2)}`);
  }
}

console.log(`\n=== 12mシュート（GKのみ）200試行結果 ===`);
console.log(`ゴール: ${goalCount} (${(goalCount/TRIALS*100).toFixed(1)}%)`);
console.log(`セーブ: ${saveCount} (${(saveCount/TRIALS*100).toFixed(1)}%)`);
console.log(`枠外/タイムアウト: ${missCount} (${(missCount/TRIALS*100).toFixed(1)}%)`);
console.log(`GKがボール1.5m以内に到達した回数: ${gkReachedBall}`);
console.log(`\n(PExt.gkSaveBase, gkSaveRadius は engine.ts 内部定数)`);
