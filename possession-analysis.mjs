#!/usr/bin/env node
/**
 * Possession Imbalance Analysis
 * Investigates why Red team has only 2% possession
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';
import { writeFileSync } from 'fs';

function runMatch(matchId) {
  const state = mkState();
  doKickOff(state);
  
  const analysis = {
    possessionFrames: { blue: 0, red: 0, none: 0 },
    possessionChanges: [],
    kickoffs: [],
    setpieces: { throwin: 0, corner: 0, goalkick: 0 },
    setpiecesByTeam: { blue: 0, red: 0 },
    firstPossession: null,
    tackles: { blue: 0, red: 0 },
    passes: { blue: 0, red: 0 },
    interceptedPasses: { blue: 0, red: 0 }
  };
  
  let prevOwner = null;
  let prevOwnerTeam = null;
  
  const dt = 1/60;
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    update(state, dt);
    
    const currentOwner = state.ball.owner;
    const currentOwnerTeam = currentOwner !== null ? state.pl[currentOwner].team : null;
    
    // Track possession frames
    if (currentOwnerTeam === -1) {
      analysis.possessionFrames.blue++;
    } else if (currentOwnerTeam === 1) {
      analysis.possessionFrames.red++;
    } else {
      analysis.possessionFrames.none++;
    }
    
    // Track first possession
    if (analysis.firstPossession === null && currentOwnerTeam !== null) {
      analysis.firstPossession = currentOwnerTeam === -1 ? 'blue' : 'red';
    }
    
    // Track possession changes
    if (prevOwnerTeam !== null && currentOwnerTeam !== null && 
        prevOwnerTeam !== currentOwnerTeam) {
      const fromTeam = prevOwnerTeam === -1 ? 'blue' : 'red';
      const toTeam = currentOwnerTeam === -1 ? 'blue' : 'red';
      
      analysis.possessionChanges.push({
        time: state.time.toFixed(2),
        from: fromTeam,
        to: toTeam,
        fromPlayer: prevOwner,
        toPlayer: currentOwner
      });
      
      // This is a tackle/interception
      if (toTeam === 'blue') {
        analysis.tackles.blue++;
      } else {
        analysis.tackles.red++;
      }
    }
    
    // Track passes (same team possession change)
    if (prevOwner !== null && currentOwner !== null && 
        prevOwner !== currentOwner &&
        prevOwnerTeam === currentOwnerTeam) {
      if (currentOwnerTeam === -1) {
        analysis.passes.blue++;
      } else {
        analysis.passes.red++;
      }
    }
    
    prevOwner = currentOwner;
    prevOwnerTeam = currentOwnerTeam;
  }
  
  return {
    matchId,
    score: { blue: state.sL, red: state.sR },
    analysis
  };
}

console.log('Starting possession imbalance analysis: 100-match diagnostic...\n');
const startTime = Date.now();

const results = [];
const aggregate = {
  possessionFrames: { blue: 0, red: 0, none: 0 },
  possessionChanges: { blueToRed: 0, redToBlue: 0 },
  firstPossession: { blue: 0, red: 0 },
  tackles: { blue: 0, red: 0 },
  passes: { blue: 0, red: 0 }
};

for (let i = 1; i <= 100; i++) {
  if (i % 10 === 0) console.log(`Progress: ${i}/100 matches completed`);
  const result = runMatch(i);
  results.push(result);
  
  // Aggregate
  aggregate.possessionFrames.blue += result.analysis.possessionFrames.blue;
  aggregate.possessionFrames.red += result.analysis.possessionFrames.red;
  aggregate.possessionFrames.none += result.analysis.possessionFrames.none;
  
  if (result.analysis.firstPossession === 'blue') {
    aggregate.firstPossession.blue++;
  } else if (result.analysis.firstPossession === 'red') {
    aggregate.firstPossession.red++;
  }
  
  result.analysis.possessionChanges.forEach(change => {
    if (change.from === 'blue' && change.to === 'red') {
      aggregate.possessionChanges.blueToRed++;
    } else if (change.from === 'red' && change.to === 'blue') {
      aggregate.possessionChanges.redToBlue++;
    }
  });
  
  aggregate.tackles.blue += result.analysis.tackles.blue;
  aggregate.tackles.red += result.analysis.tackles.red;
  aggregate.passes.blue += result.analysis.passes.blue;
  aggregate.passes.red += result.analysis.passes.red;
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\n✓ Completed 10 matches in ${duration}s\n`);

// Generate report
let report = '';
report += '='.repeat(80) + '\n';
report += 'POSSESSION IMBALANCE ANALYSIS REPORT\n';
report += '='.repeat(80) + '\n\n';

report += 'EXECUTIVE SUMMARY\n';
report += '-'.repeat(80) + '\n';
const totalFrames = aggregate.possessionFrames.blue + aggregate.possessionFrames.red + aggregate.possessionFrames.none;
const bluePct = (aggregate.possessionFrames.blue / totalFrames * 100).toFixed(2);
const redPct = (aggregate.possessionFrames.red / totalFrames * 100).toFixed(2);
const nonePct = (aggregate.possessionFrames.none / totalFrames * 100).toFixed(2);

report += `Total Matches: 100\n`;
report += `Total Frames: ${totalFrames}\n\n`;

report += `Blue Possession: ${aggregate.possessionFrames.blue} frames (${bluePct}%)\n`;
report += `Red Possession: ${aggregate.possessionFrames.red} frames (${redPct}%)\n`;
report += `No Possession: ${aggregate.possessionFrames.none} frames (${nonePct}%)\n\n`;

report += `POSSESSION RATIO: Blue ${bluePct}% vs Red ${redPct}%\n`;
report += `IMBALANCE FACTOR: ${(parseFloat(bluePct) / parseFloat(redPct)).toFixed(2)}x\n\n`;

report += 'ROOT CAUSE ANALYSIS\n';
report += '='.repeat(80) + '\n\n';

// 1. First possession bias
report += '1. KICKOFF / FIRST POSSESSION\n';
report += '-'.repeat(80) + '\n';
report += `Blue had first possession: ${aggregate.firstPossession.blue}/100 matches (${(aggregate.firstPossession.blue / 100 * 100).toFixed(0)}%)\n`;
report += `Red had first possession: ${aggregate.firstPossession.red}/100 matches (${(aggregate.firstPossession.red / 100 * 100).toFixed(0)}%)\n\n`;

if (aggregate.firstPossession.blue > aggregate.firstPossession.red) {
  report += `⚠️  ASYMMETRY DETECTED: Blue consistently gets first possession\n`;
  report += `This suggests kickoff logic may favor Blue team\n\n`;
} else {
  report += `✓ Kickoff appears balanced\n\n`;
}

// 2. Possession retention
report += '2. POSSESSION RETENTION\n';
report += '-'.repeat(80) + '\n';
const avgBlueFramesPerPossession = aggregate.possessionChanges.blueToRed > 0
  ? (aggregate.possessionFrames.blue / aggregate.possessionChanges.blueToRed).toFixed(2)
  : 'N/A';
const avgRedFramesPerPossession = aggregate.possessionChanges.redToBlue > 0
  ? (aggregate.possessionFrames.red / aggregate.possessionChanges.redToBlue).toFixed(2)
  : 'N/A';

report += `Blue → Red transitions: ${aggregate.possessionChanges.blueToRed}\n`;
report += `Red → Blue transitions: ${aggregate.possessionChanges.redToBlue}\n\n`;

report += `Blue avg frames per possession: ${avgBlueFramesPerPossession}\n`;
report += `Red avg frames per possession: ${avgRedFramesPerPossession}\n\n`;

if (aggregate.possessionChanges.redToBlue > aggregate.possessionChanges.blueToRed * 2) {
  report += `⚠️  CRITICAL ISSUE: Red loses possession ${(aggregate.possessionChanges.redToBlue / aggregate.possessionChanges.blueToRed).toFixed(2)}x more often than Blue\n`;
  report += `This indicates Red team has difficulty maintaining possession\n\n`;
}

// 3. Tackle success
report += '3. TACKLE / INTERCEPTION SUCCESS\n';
report += '-'.repeat(80) + '\n';
report += `Blue successful tackles: ${aggregate.tackles.blue}\n`;
report += `Red successful tackles: ${aggregate.tackles.red}\n\n`;

const tackleRatio = aggregate.tackles.red > 0 
  ? (aggregate.tackles.blue / aggregate.tackles.red).toFixed(2)
  : 'Infinity';
report += `Tackle ratio (Blue:Red): ${tackleRatio}\n\n`;

if (aggregate.tackles.blue > aggregate.tackles.red * 2) {
  report += `⚠️  ASYMMETRY: Blue wins possession ${tackleRatio}x more often via tackles\n`;
  report += `This suggests Blue's pressing/defensive AI is more effective\n\n`;
}

// 4. Pass completion
report += '4. PASSING STATISTICS\n';
report += '-'.repeat(80) + '\n';
report += `Blue completed passes: ${aggregate.passes.blue}\n`;
report += `Red completed passes: ${aggregate.passes.red}\n\n`;

const passRatio = aggregate.passes.red > 0
  ? (aggregate.passes.blue / aggregate.passes.red).toFixed(2)
  : 'Infinity';
report += `Pass ratio (Blue:Red): ${passRatio}\n\n`;

if (aggregate.passes.blue > aggregate.passes.red * 5) {
  report += `⚠️  CRITICAL ASYMMETRY: Blue completes ${passRatio}x more passes than Red\n`;
  report += `Red team is unable to string passes together\n\n`;
}

// Match-by-match breakdown
report += 'MATCH-BY-MATCH BREAKDOWN\n';
report += '='.repeat(80) + '\n\n';

results.forEach(r => {
  const total = r.analysis.possessionFrames.blue + r.analysis.possessionFrames.red + r.analysis.possessionFrames.none;
  const bPct = (r.analysis.possessionFrames.blue / total * 100).toFixed(1);
  const rPct = (r.analysis.possessionFrames.red / total * 100).toFixed(1);
  
  report += `Match ${r.matchId}: Blue ${bPct}% vs Red ${rPct}%\n`;
  report += `  First possession: ${r.analysis.firstPossession}\n`;
  report += `  Possession changes: ${r.analysis.possessionChanges.length}\n`;
  report += `  Blue passes: ${r.analysis.passes.blue}, Red passes: ${r.analysis.passes.red}\n`;
  report += `  Blue tackles: ${r.analysis.tackles.blue}, Red tackles: ${r.analysis.tackles.red}\n\n`;
});

// Hypotheses
report += 'HYPOTHESES FOR RED TEAM POSSESSION DEFICIT\n';
report += '='.repeat(80) + '\n\n';

report += 'HYPOTHESIS 1: Kickoff Bias\n';
report += '-'.repeat(80) + '\n';
report += 'If Blue consistently gets first possession from kickoff, this gives them\n';
report += 'an initial advantage. Combined with strong possession retention, Blue may\n';
report += 'dominate the entire match from the opening seconds.\n\n';
report += `Evidence: Blue had first possession in ${aggregate.firstPossession.blue}/100 matches\n\n`;

report += 'HYPOTHESIS 2: Asymmetric AI Behavior\n';
report += '-'.repeat(80) + '\n';
report += 'Blue and Red teams may use different decision-making logic, or there may be\n';
report += 'a directional bias in the coordinate system that favors one team.\n\n';
report += `Evidence: Blue:Red tackle ratio = ${tackleRatio}, pass ratio = ${passRatio}\n\n`;

report += 'HYPOTHESIS 3: Counter-Press Effectiveness\n';
report += '-'.repeat(80) + '\n';
report += 'The v8.7.4 counter-press mechanic (1.2s window after turnover) may be\n';
report += 'disproportionately effective for Blue team, allowing them to immediately\n';
report += 'regain possession whenever Red wins the ball.\n\n';
report += `Evidence: Red → Blue transitions (${aggregate.possessionChanges.redToBlue}) >> Blue → Red (${aggregate.possessionChanges.blueToRed})\n\n`;

report += 'HYPOTHESIS 4: Formation/Positioning Asymmetry\n';
report += '-'.repeat(80) + '\n';
report += 'Initial player positions or formation logic may favor Blue team, giving them\n';
report += 'better field coverage and easier access to the ball.\n\n';

report += 'RECOMMENDED NEXT STEPS\n';
report += '='.repeat(80) + '\n\n';
report += '1. Inspect doKickOff() function for team bias\n';
report += '2. Verify both teams use identical decision logic (decideHasBall/decideNoBall)\n';
report += '3. Check initial player positions for asymmetry\n';
report += '4. Test with counter-press disabled to isolate its effect\n';
report += '5. Add team-agnostic coordinate transformations\n\n';

report += '='.repeat(80) + '\n';
report += 'END OF REPORT\n';
report += '='.repeat(80) + '\n';

// Save report
const reportPath = '/home/ubuntu/possession-analysis-report.txt';
writeFileSync(reportPath, report);
console.log(`✓ Report saved to ${reportPath}`);

// Save JSON
const jsonPath = '/home/ubuntu/possession-analysis-data.json';
writeFileSync(jsonPath, JSON.stringify({ aggregate, results }, null, 2));
console.log(`✓ Raw data saved to ${jsonPath}`);
