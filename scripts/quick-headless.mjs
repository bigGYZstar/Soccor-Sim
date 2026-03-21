/**
 * Quick headless simulation - 20 matches in VFAST mode
 * Outputs goal statistics for comparison with actual gameplay
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

// We need to compile and run the TypeScript engine
// Use tsx to run the TypeScript directly
const script = `
import { mkState, update } from './client/src/game/engine.js';

const NUM_MATCHES = 20;
const results = [];

for (let i = 0; i < NUM_MATCHES; i++) {
  const st = mkState("4-4-2", "4-4-2");
  st.speed = "VFAST";
  
  const SIM_DT = 1/60;
  let frames = 0;
  const maxFrames = 60 * 60 * 20;
  
  while (!st.over && frames < maxFrames) {
    update(st, SIM_DT);
    frames++;
  }
  
  const totalGoals = st.scoreBlue + st.scoreRed;
  results.push({
    match: i+1,
    blue: st.scoreBlue,
    red: st.scoreRed,
    total: totalGoals,
    frames,
    shotsBlue: st.stats?.shotsTotal?.blue ?? 0,
    shotsRed: st.stats?.shotsTotal?.red ?? 0,
  });
  
  process.stdout.write(\`Match \${i+1}: \${st.scoreBlue}-\${st.scoreRed} (\${frames} frames)\\n\`);
}

const avgGoals = results.reduce((s,r) => s + r.total, 0) / NUM_MATCHES;
const avgFrames = results.reduce((s,r) => s + r.frames, 0) / NUM_MATCHES;
process.stdout.write(\`\\nAverage goals: \${avgGoals.toFixed(2)}\\n\`);
process.stdout.write(\`Average frames: \${avgFrames.toFixed(0)}\\n\`);
process.stdout.write(\`Goal rate per frame: \${(avgGoals/avgFrames).toFixed(6)}\\n\`);
`;

writeFileSync('/tmp/quick-sim.ts', script);
console.log('Script written, running with tsx...');
