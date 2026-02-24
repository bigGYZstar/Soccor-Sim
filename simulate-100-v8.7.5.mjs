#!/usr/bin/env node
/**
 * v8.7.5 Simulation: 100-match tactical analysis
 * Tracks zone occupancy, shots, goals, and Phase B diagnostic metrics
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';

function runMatch(matchId) {
  const state = mkState();
  doKickOff(state);
  
  // Zone tracking (ball-owner-frame-based)
  const zoneFrames = { blue: { def: 0, mid: 0, att: 0 }, red: { def: 0, mid: 0, att: 0 } };
  const possFrames = { blue: 0, red: 0 };
  let freeFrames = 0;
  
  // Max progression tracking
  let maxBallAX = 0;
  
  // Shot tracking
  let shotsBlue = 0;
  let shotsRed = 0;
  
  const dt = 1/60; // 60 FPS simulation
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    const prevScoreL = state.sL;
    const prevScoreR = state.sR;
    
    update(state, dt);
    
    // Track shots (goals are shots that scored)
    if (state.sL > prevScoreL) shotsBlue++;
    if (state.sR > prevScoreR) shotsRed++;
    
    // Zone occupancy tracking (ball-owner-frame-based)
    const b = state.ball;
    if (b.owner !== null) {
      const owner = state.pl[b.owner];
      const ax = b.pos.x * (-owner.team);
      const w = 10.0; // PExt.pitchHalfW
      
      // Update max progression
      if (ax > maxBallAX) maxBallAX = ax;
      
      // Zone classification
      let zone = 'def';
      if (ax >= (2 * w / 3)) zone = 'att';  // ax >= 6.66
      else if (ax >= (w / 3)) zone = 'mid';  // ax >= 3.33
      
      if (owner.team === -1) {
        possFrames.blue++;
        zoneFrames.blue[zone]++;
      } else {
        possFrames.red++;
        zoneFrames.red[zone]++;
      }
    } else {
      freeFrames++;
    }
  }
  
  // Calculate percentages
  const totalFrames = possFrames.blue + possFrames.red + freeFrames;
  const bluePoss = possFrames.blue / totalFrames * 100;
  const redPoss = possFrames.red / totalFrames * 100;
  
  const blueDefPct = possFrames.blue > 0 ? (zoneFrames.blue.def / possFrames.blue * 100) : 0;
  const blueMidPct = possFrames.blue > 0 ? (zoneFrames.blue.mid / possFrames.blue * 100) : 0;
  const blueAttPct = possFrames.blue > 0 ? (zoneFrames.blue.att / possFrames.blue * 100) : 0;
  
  const redDefPct = possFrames.red > 0 ? (zoneFrames.red.def / possFrames.red * 100) : 0;
  const redMidPct = possFrames.red > 0 ? (zoneFrames.red.mid / possFrames.red * 100) : 0;
  const redAttPct = possFrames.red > 0 ? (zoneFrames.red.att / possFrames.red * 100) : 0;
  
  return {
    matchId,
    score: { blue: state.sL, red: state.sR },
    shots: { blue: shotsBlue, red: shotsRed },
    possession: { blue: bluePoss, red: redPoss },
    zones: {
      blue: { def: blueDefPct, mid: blueMidPct, att: blueAttPct },
      red: { def: redDefPct, mid: redMidPct, att: redAttPct }
    },
    progression: { maxBallAX },
    phaseB: {
      eligibleFrames: { blue: state.stats.phaseBEligibleFrames.blue, red: state.stats.phaseBEligibleFrames.red },
      shots: { blue: state.stats.phaseBShots.blue, red: state.stats.phaseBShots.red },
      blockedPassCount: { blue: state.stats.phaseBBlockedPassCount.blue, red: state.stats.phaseBBlockedPassCount.red },
      forcedShots: { blue: state.stats.forcedShotsFromBlocked.blue, red: state.stats.forcedShotsFromBlocked.red }
    }
  };
}

console.log('Starting v8.7.5 100-match simulation...\n');
const startTime = Date.now();

const results = [];
for (let i = 1; i <= 100; i++) {
  if (i % 10 === 0) console.log(`Progress: ${i}/100 matches completed`);
  results.push(runMatch(i));
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\n✓ Completed 100 matches in ${duration}s\n`);

// Calculate aggregate statistics
const avgScoreBlue = (results.reduce((sum, r) => sum + r.score.blue, 0) / 100).toFixed(2);
const avgScoreRed = (results.reduce((sum, r) => sum + r.score.red, 0) / 100).toFixed(2);

const avgShotsBlue = (results.reduce((sum, r) => sum + r.shots.blue, 0) / 100).toFixed(2);
const avgShotsRed = (results.reduce((sum, r) => sum + r.shots.red, 0) / 100).toFixed(2);

const avgPossBlue = (results.reduce((sum, r) => sum + r.possession.blue, 0) / 100).toFixed(1);
const avgPossRed = (results.reduce((sum, r) => sum + r.possession.red, 0) / 100).toFixed(1);

const avgBlueDefPct = (results.reduce((sum, r) => sum + r.zones.blue.def, 0) / 100).toFixed(1);
const avgBlueMidPct = (results.reduce((sum, r) => sum + r.zones.blue.mid, 0) / 100).toFixed(1);
const avgBlueAttPct = (results.reduce((sum, r) => sum + r.zones.blue.att, 0) / 100).toFixed(1);

const avgRedDefPct = (results.reduce((sum, r) => sum + r.zones.red.def, 0) / 100).toFixed(1);
const avgRedMidPct = (results.reduce((sum, r) => sum + r.zones.red.mid, 0) / 100).toFixed(1);
const avgRedAttPct = (results.reduce((sum, r) => sum + r.zones.red.att, 0) / 100).toFixed(1);

const avgMaxBallAX = (results.reduce((sum, r) => sum + r.progression.maxBallAX, 0) / 100).toFixed(2);

// Phase B diagnostics
const avgPhaseBEligibleBlue = (results.reduce((sum, r) => sum + r.phaseB.eligibleFrames.blue, 0) / 100).toFixed(1);
const avgPhaseBEligibleRed = (results.reduce((sum, r) => sum + r.phaseB.eligibleFrames.red, 0) / 100).toFixed(1);

const avgPhaseBShotsBlue = (results.reduce((sum, r) => sum + r.phaseB.shots.blue, 0) / 100).toFixed(2);
const avgPhaseBShotsRed = (results.reduce((sum, r) => sum + r.phaseB.shots.red, 0) / 100).toFixed(2);

const avgPhaseBBlockedBlue = (results.reduce((sum, r) => sum + r.phaseB.blockedPassCount.blue, 0) / 100).toFixed(1);
const avgPhaseBBlockedRed = (results.reduce((sum, r) => sum + r.phaseB.blockedPassCount.red, 0) / 100).toFixed(1);

const avgForcedShotsBlue = (results.reduce((sum, r) => sum + r.phaseB.forcedShots.blue, 0) / 100).toFixed(2);
const avgForcedShotsRed = (results.reduce((sum, r) => sum + r.phaseB.forcedShots.red, 0) / 100).toFixed(2);

// Win/draw/loss counts
const blueWins = results.filter(r => r.score.blue > r.score.red).length;
const redWins = results.filter(r => r.score.red > r.score.blue).length;
const draws = results.filter(r => r.score.blue === r.score.red).length;

console.log('=== v8.7.5 100-MATCH STATISTICS ===\n');
console.log(`Average Score: Blue ${avgScoreBlue} - ${avgScoreRed} Red`);
console.log(`Win/Draw/Loss: Blue ${blueWins}% / Draw ${draws}% / Red ${redWins}%`);
console.log(`\nAverage Shots: Blue ${avgShotsBlue}, Red ${avgShotsRed}`);
console.log(`\nAverage Possession: Blue ${avgPossBlue}%, Red ${avgPossRed}%`);
console.log(`\nBlue Zone Occupancy (ball-owner-frame-based):`);
console.log(`  Defensive Third: ${avgBlueDefPct}%`);
console.log(`  Middle Third: ${avgBlueMidPct}%`);
console.log(`  Attacking Third: ${avgBlueAttPct}%`);
console.log(`\nRed Zone Occupancy (ball-owner-frame-based):`);
console.log(`  Defensive Third: ${avgRedDefPct}%`);
console.log(`  Middle Third: ${avgRedMidPct}%`);
console.log(`  Attacking Third: ${avgRedAttPct}%`);
console.log(`\nProgression:`);
console.log(`  Average maxBallAX: ${avgMaxBallAX}`);
console.log(`\nv8.7.5 Phase B Diagnostics:`);
console.log(`  Avg phaseBEligibleFrames: Blue ${avgPhaseBEligibleBlue}, Red ${avgPhaseBEligibleRed}`);
console.log(`  Avg phaseBShots: Blue ${avgPhaseBShotsBlue}, Red ${avgPhaseBShotsRed}`);
console.log(`  Avg phaseBBlockedPassCount: Blue ${avgPhaseBBlockedBlue}, Red ${avgPhaseBBlockedRed}`);
console.log(`  Avg forcedShotsFromBlocked: Blue ${avgForcedShotsBlue}, Red ${avgForcedShotsRed}`);

// Save detailed results
import { writeFileSync } from 'fs';
writeFileSync('/home/ubuntu/v8.7.5-100matches.json', JSON.stringify(results, null, 2));
console.log(`\n✓ Detailed results saved to /home/ubuntu/v8.7.5-100matches.json`);

// Success criteria check
console.log(`\n=== SUCCESS CRITERIA CHECK ===`);
console.log(`Attacking Third >= 12%: ${parseFloat(avgBlueAttPct) >= 12 ? '✅' : '❌'} (${avgBlueAttPct}%)`);
console.log(`Defensive Third <= 60%: ${parseFloat(avgBlueDefPct) <= 60 ? '✅' : '❌'} (${avgBlueDefPct}%)`);
console.log(`Shots 1.0-3.0: ${parseFloat(avgShotsBlue) >= 1.0 && parseFloat(avgShotsBlue) <= 3.0 ? '✅' : '❌'} (${avgShotsBlue})`);
console.log(`Draw rate <= 95%: ${draws <= 95 ? '✅' : '❌'} (${draws}%)`);
