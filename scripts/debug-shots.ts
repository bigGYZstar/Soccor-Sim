import { mkState, update, doKickOff } from '../client/src/game/engine';
import type { FormationId } from '../client/src/game/constants';

const DT = 1 / 60;
const MAX_FRAMES = 90 * 60 * 60;

const st = mkState('4-4-2' as FormationId, '4-4-2' as FormationId);
doKickOff(st);

let frames = 0;

while (!st.over && frames < MAX_FRAMES) {
  update(st, DT);
  frames++;
  
  if (frames % 600 === 0) {
    const mins = Math.floor(frames / (60 * 60));
    const secs = Math.floor((frames % (60 * 60)) / 60);
    const shots = st.stats.shotsTotal;
    const passes = st.stats.passAttempts;
    process.stderr.write(`${mins}:${String(secs).padStart(2,'0')} | shots: ${shots.blue}B/${shots.red}R | passes: ${passes.blue}B/${passes.red}R | score: ${st.scoreBlue}-${st.scoreRed}\n`);
  }
}

process.stderr.write('\n=== FINAL ===\n');
process.stderr.write(`Score: ${st.scoreBlue}-${st.scoreRed}\n`);
process.stderr.write(`Shots: ${JSON.stringify(st.stats.shotsTotal)}\n`);
process.stderr.write(`Shots on target: ${JSON.stringify(st.stats.shotsOnTarget)}\n`);
process.stderr.write(`Phase B shots: ${JSON.stringify(st.stats.phaseBShots)}\n`);
process.stderr.write(`Phase B eligible frames: ${JSON.stringify(st.stats.phaseBEligibleFrames)}\n`);
process.stderr.write(`Pass attempts: ${JSON.stringify(st.stats.passAttempts)}\n`);
process.stderr.write(`Total frames: ${frames}\n`);
