import { mkState, doKickOff, update } from "../client/src/game/engine";
import { P } from "../client/src/game/constants";
import { vdist } from "../client/src/game/math";

const DT = 1 / 60;
const FPS = 60;
const MATCH_SECONDS = 90;
const TOTAL_FRAMES = MATCH_SECONDS * FPS;
const PITCH_HALF_W = 52.5;

const st = mkState("4-4-2", "4-4-2");
doKickOff(st);

interface PassEvent {
  frame: number;
  kickerIdx: number;
  receiverIdx: number;
  kickerPos: { x: number; y: number };
  receiverPos: { x: number; y: number };
  team: number;
  gp: number;
  dist: number;
  intended: boolean;
  isLong: boolean;
}

const passes: PassEvent[] = [];
let lastKickerIdx: number | null = null;
let lastKickPos = { x: 0, y: 0 };
let lastKickTeam = 0;
let lastIntended: number | null = null;

let blueFrames = 0, redFrames = 0, freeFrames = 0;
let maxForwardBlue = -Infinity;
let maxForwardRed = -Infinity;
const ballXSamples: number[] = [];

for (let f = 0; f < TOTAL_FRAMES; f++) {
  const prevOwner = st.ball.owner;
  const prevFree = st.ball.free;
  
  update(st, DT);
  
  const curOwner = st.ball.owner;
  
  if (curOwner !== null) {
    if (st.pl[curOwner].team === 1) blueFrames++;
    else redFrames++;
  } else {
    freeFrames++;
  }
  
  if (f % FPS === 0) {
    ballXSamples.push(st.ball.pos.x);
  }
  
  if (prevOwner !== null && curOwner === null && !prevFree) {
    lastKickerIdx = prevOwner;
    lastKickPos = { x: st.pl[prevOwner].pos.x, y: st.pl[prevOwner].pos.y };
    lastKickTeam = st.pl[prevOwner].team;
    lastIntended = st.ball.intendedReceiverIdx;
  }
  
  if (prevFree && curOwner !== null && lastKickerIdx !== null) {
    const kicker = st.pl[lastKickerIdx];
    const receiver = st.pl[curOwner];
    
    if (kicker.team === receiver.team && lastKickerIdx !== curOwner) {
      const gp = (receiver.pos.x - lastKickPos.x) * -kicker.team;
      const dist = vdist(lastKickPos, receiver.pos);
      
      passes.push({
        frame: f,
        kickerIdx: lastKickerIdx,
        receiverIdx: curOwner,
        kickerPos: lastKickPos,
        receiverPos: { x: receiver.pos.x, y: receiver.pos.y },
        team: kicker.team,
        gp,
        dist,
        intended: curOwner === lastIntended,
        isLong: dist > 18.0
      });
    }
    lastKickerIdx = null;
  }
  
  if (curOwner !== null) {
    const owner = st.pl[curOwner];
    const ax = owner.pos.x * -owner.team;
    if (owner.team === 1 && ax > maxForwardBlue) maxForwardBlue = ax;
    if (owner.team === -1 && ax > maxForwardRed) maxForwardRed = ax;
  }
}

const totalFrames = blueFrames + redFrames + freeFrames;
console.log("=== BALL PROGRESSION DIAGNOSTIC v3 ===");
console.log(`Possession: Blue=${(blueFrames/totalFrames*100).toFixed(1)}% Red=${(redFrames/totalFrames*100).toFixed(1)}% Free=${(freeFrames/totalFrames*100).toFixed(1)}%`);

const bluePasses = passes.filter(p => p.team === 1);
const redPasses = passes.filter(p => p.team === -1);

console.log(`\nTotal passes: ${passes.length} (Blue: ${bluePasses.length}, Red: ${redPasses.length})`);

for (const [label, teamPasses] of [["Blue", bluePasses], ["Red", redPasses]] as [string, PassEvent[]][]) {
  if (teamPasses.length === 0) continue;
  
  const forward = teamPasses.filter(p => p.gp > 2.0);
  const lateral = teamPasses.filter(p => p.gp >= -2.0 && p.gp <= 2.0);
  const backward = teamPasses.filter(p => p.gp < -2.0);
  const longPasses = teamPasses.filter(p => p.isLong);
  const intended = teamPasses.filter(p => p.intended);
  
  const avgGp = teamPasses.reduce((s, p) => s + p.gp, 0) / teamPasses.length;
  const avgDist = teamPasses.reduce((s, p) => s + p.dist, 0) / teamPasses.length;
  
  console.log(`\n${label} (${teamPasses.length} passes):`);
  console.log(`  Forward: ${forward.length} (${Math.round(forward.length/teamPasses.length*100)}%)`);
  console.log(`  Lateral: ${lateral.length} (${Math.round(lateral.length/teamPasses.length*100)}%)`);
  console.log(`  Backward: ${backward.length} (${Math.round(backward.length/teamPasses.length*100)}%)`);
  console.log(`  Long: ${longPasses.length}`);
  console.log(`  Intended: ${intended.length} (${Math.round(intended.length/teamPasses.length*100)}%)`);
  console.log(`  Avg gp: ${avgGp.toFixed(1)}m, Avg dist: ${avgDist.toFixed(1)}m`);
  
  console.log(`  First 10 passes:`);
  for (const p of teamPasses.slice(0, 10)) {
    const k = st.pl[p.kickerIdx];
    const r = st.pl[p.receiverIdx];
    console.log(`    ${k.posLabel} -> ${r.posLabel}: gp=${p.gp.toFixed(1)}m dist=${p.dist.toFixed(1)}m ${p.isLong?"[LONG]":""} ${p.intended?"[OK]":"[MISS]"}`);
  }
}

console.log(`\nMax forward: Blue=${maxForwardBlue.toFixed(1)}m Red=${maxForwardRed.toFixed(1)}m (PhaseB=${(2*PITCH_HALF_W/3).toFixed(1)}m)`);

console.log(`\nBall X (every 15s):`);
for (let i = 0; i < ballXSamples.length; i += 15) {
  if (ballXSamples[i] !== undefined) console.log(`  t=${i}s: ${ballXSamples[i].toFixed(1)}`);
}

const recvCount: Record<number, number> = {};
for (const p of passes) recvCount[p.receiverIdx] = (recvCount[p.receiverIdx] || 0) + 1;
console.log(`\nTop receivers:`);
Object.entries(recvCount).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([idx, count]) => {
  console.log(`  ${st.pl[Number(idx)].posLabel}(#${idx}): ${count}`);
});
