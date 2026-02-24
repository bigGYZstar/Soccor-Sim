#!/usr/bin/env node
/**
 * Stack Analysis: 100-match headless simulation with detailed stack event logging
 * Tracks all player positions, velocities, and actions during stack events
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';
import { writeFileSync } from 'fs';

const stackEvents = [];
let totalStackDetections = 0;
let totalStackResolutions = 0;

function runMatch(matchId) {
  const state = mkState();
  doKickOff(state);
  
  let matchStackEvents = [];
  let previousStackState = false;
  
  const dt = 1/60; // 60 FPS simulation
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    update(state, dt);
    
    // Detect stack state change
    if (state.stackDetection.isStacked && !previousStackState) {
      // Stack just detected
      totalStackDetections++;
      
      // Capture detailed snapshot of all players
      const snapshot = {
        matchId,
        time: state.time.toFixed(2),
        ballPos: { x: state.ball.pos.x.toFixed(2), y: state.ball.pos.y.toFixed(2) },
        ballOwner: state.ball.owner,
        stableTime: state.stackDetection.stableTime.toFixed(2),
        players: state.pl.map((p, idx) => ({
          id: idx,
          team: p.team === -1 ? 'Blue' : 'Red',
          role: p.role,
          isGK: p.isGK,
          num: p.num,
          pos: { x: p.pos.x.toFixed(2), y: p.pos.y.toFixed(2) },
          tgt: { x: p.tgt.x.toFixed(2), y: p.tgt.y.toFixed(2) },
          vel: { x: p.vel.x.toFixed(2), y: p.vel.y.toFixed(2) },
          face: { x: p.face.x.toFixed(2), y: p.face.y.toFixed(2) },
          act: p.act,
          distToBall: Math.sqrt(
            Math.pow(p.pos.x - state.ball.pos.x, 2) + 
            Math.pow(p.pos.y - state.ball.pos.y, 2)
          ).toFixed(2)
        }))
      };
      
      matchStackEvents.push(snapshot);
    } else if (!state.stackDetection.isStacked && previousStackState) {
      // Stack just resolved
      totalStackResolutions++;
    }
    
    previousStackState = state.stackDetection.isStacked;
  }
  
  return {
    matchId,
    score: { blue: state.sL, red: state.sR },
    stackEventsCount: matchStackEvents.length,
    stackEvents: matchStackEvents
  };
}

console.log('Starting stack analysis: 100-match headless simulation...\n');
const startTime = Date.now();

const results = [];
for (let i = 1; i <= 100; i++) {
  if (i % 10 === 0) console.log(`Progress: ${i}/100 matches completed`);
  const result = runMatch(i);
  results.push(result);
  stackEvents.push(...result.stackEvents);
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\n✓ Completed 100 matches in ${duration}s`);
console.log(`Total stack detections: ${totalStackDetections}`);
console.log(`Total stack resolutions: ${totalStackResolutions}`);
console.log(`Stack events captured: ${stackEvents.length}\n`);

// Generate comprehensive text report
let report = '';
report += '=' .repeat(80) + '\n';
report += 'FUTSAL SIMULATION - STACK DETECTION ANALYSIS REPORT\n';
report += '=' .repeat(80) + '\n\n';

report += 'SIMULATION SUMMARY\n';
report += '-' .repeat(80) + '\n';
report += `Total Matches: 100\n`;
report += `Simulation Duration: ${duration}s\n`;
report += `Total Stack Detections: ${totalStackDetections}\n`;
report += `Total Stack Resolutions: ${totalStackResolutions}\n`;
report += `Stack Events Captured: ${stackEvents.length}\n`;
report += `Average Stack Events per Match: ${(stackEvents.length / 100).toFixed(2)}\n\n`;

// Match-by-match summary
report += 'MATCH-BY-MATCH STACK SUMMARY\n';
report += '-' .repeat(80) + '\n';
results.forEach(r => {
  if (r.stackEventsCount > 0) {
    report += `Match ${r.matchId}: ${r.stackEventsCount} stack event(s) detected\n`;
  }
});
report += '\n';

// Detailed stack event analysis
report += 'DETAILED STACK EVENT ANALYSIS\n';
report += '=' .repeat(80) + '\n\n';

if (stackEvents.length === 0) {
  report += 'NO STACK EVENTS DETECTED IN 100 MATCHES\n\n';
  report += 'POSSIBLE REASONS:\n';
  report += '1. Stack detection threshold (2.0s, 0.5m) may be too strict\n';
  report += '2. Stack resolution logic may be triggering before detection completes\n';
  report += '3. Ball movement is sufficient to prevent stacks from forming\n\n';
} else {
  stackEvents.forEach((event, idx) => {
    report += `STACK EVENT #${idx + 1}\n`;
    report += '-' .repeat(80) + '\n';
    report += `Match: ${event.matchId}\n`;
    report += `Time: ${event.time}s\n`;
    report += `Ball Position: (${event.ballPos.x}, ${event.ballPos.y})\n`;
    report += `Ball Owner: ${event.ballOwner !== null ? `Player ${event.ballOwner}` : 'None (free ball)'}\n`;
    report += `Stable Time: ${event.stableTime}s\n\n`;
    
    report += 'PLAYER POSITIONS AND BEHAVIORS:\n';
    report += '-' .repeat(80) + '\n';
    
    // Sort players by distance to ball
    const sortedPlayers = [...event.players].sort((a, b) => 
      parseFloat(a.distToBall) - parseFloat(b.distToBall)
    );
    
    sortedPlayers.forEach(p => {
      report += `Player ${p.num} (${p.team} ${p.role}${p.isGK ? '-GK' : ''})\n`;
      report += `  Position: (${p.pos.x}, ${p.pos.y})\n`;
      report += `  Target: (${p.tgt.x}, ${p.tgt.y})\n`;
      report += `  Velocity: (${p.vel.x}, ${p.vel.y})\n`;
      report += `  Facing: (${p.face.x}, ${p.face.y})\n`;
      report += `  Action: ${p.act}\n`;
      report += `  Distance to Ball: ${p.distToBall}m\n`;
      
      // Analyze behavior
      const dist = parseFloat(p.distToBall);
      if (dist < 1.0) {
        report += `  ⚠️  VERY CLOSE TO BALL - Part of cluster\n`;
      } else if (dist < 3.0) {
        report += `  ⚠️  CLOSE TO BALL - Potentially contributing to stack\n`;
      }
      
      const velMag = Math.sqrt(
        Math.pow(parseFloat(p.vel.x), 2) + 
        Math.pow(parseFloat(p.vel.y), 2)
      );
      if (velMag < 0.1) {
        report += `  ⚠️  STATIONARY - Not moving\n`;
      }
      
      report += '\n';
    });
    
    // Cluster analysis
    const playersWithin1m = sortedPlayers.filter(p => parseFloat(p.distToBall) < 1.0).length;
    const playersWithin3m = sortedPlayers.filter(p => parseFloat(p.distToBall) < 3.0).length;
    const stationaryPlayers = sortedPlayers.filter(p => {
      const velMag = Math.sqrt(
        Math.pow(parseFloat(p.vel.x), 2) + 
        Math.pow(parseFloat(p.vel.y), 2)
      );
      return velMag < 0.1;
    }).length;
    
    report += 'CLUSTER ANALYSIS:\n';
    report += `-`.repeat(80) + '\n';
    report += `Players within 1m of ball: ${playersWithin1m}\n`;
    report += `Players within 3m of ball: ${playersWithin3m}\n`;
    report += `Stationary players: ${stationaryPlayers}\n\n`;
    
    report += '=' .repeat(80) + '\n\n';
  });
}

// Recommendations
report += 'RECOMMENDATIONS\n';
report += '=' .repeat(80) + '\n\n';

if (stackEvents.length === 0) {
  report += '1. REDUCE DETECTION THRESHOLD\n';
  report += '   - Current: 2.0s stable time, 0.5m radius\n';
  report += '   - Suggested: 1.0s stable time, 0.8m radius\n\n';
  
  report += '2. ADD INTERMEDIATE LOGGING\n';
  report += '   - Log when stableTime > 0.5s (before threshold)\n';
  report += '   - Track near-miss stack situations\n\n';
  
  report += '3. VERIFY STACK RESOLUTION TIMING\n';
  report += '   - Check if forced long kick triggers before detection completes\n';
  report += '   - May need to separate detection from resolution\n\n';
} else {
  report += '1. ANALYZE CLUSTER PATTERNS\n';
  report += '   - Identify common player configurations during stacks\n';
  report += '   - Determine if specific roles/positions are more prone to clustering\n\n';
  
  report += '2. TUNE DISPERSION PARAMETERS\n';
  report += '   - Current: 3m detection radius, 4-6m dispersion distance\n';
  report += '   - Adjust based on observed cluster sizes\n\n';
  
  report += '3. IMPROVE RESOLUTION TIMING\n';
  report += '   - Ensure forced long kick executes immediately\n';
  report += '   - Verify player dispersion happens before next frame\n\n';
}

report += '=' .repeat(80) + '\n';
report += 'END OF REPORT\n';
report += '=' .repeat(80) + '\n';

// Save report
const reportPath = '/home/ubuntu/stack-analysis-report.txt';
writeFileSync(reportPath, report);
console.log(`✓ Report saved to ${reportPath}`);

// Save raw JSON data
const jsonPath = '/home/ubuntu/stack-analysis-data.json';
writeFileSync(jsonPath, JSON.stringify({ 
  summary: {
    totalMatches: 100,
    duration,
    totalStackDetections,
    totalStackResolutions,
    stackEventsCount: stackEvents.length
  },
  results,
  stackEvents 
}, null, 2));
console.log(`✓ Raw data saved to ${jsonPath}`);
