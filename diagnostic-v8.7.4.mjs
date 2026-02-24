#!/usr/bin/env node
/**
 * v8.7.4 Diagnostic: 1-match detailed analysis
 * Tracks zone occupancy, maxBallAX, shots, goals, and new v8.7.4 statistics
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';

function runDiagnostic() {
  const state = mkState();
  doKickOff(state);
  
  // Zone tracking (ball-owner-frame-based)
  const zoneFrames = { blue: { def: 0, mid: 0, att: 0 }, red: { def: 0, mid: 0, att: 0 } };
  const possFrames = { blue: 0, red: 0 };
  let freeFrames = 0;
  
  // Max progression tracking
  let maxBallAX = 0;
  let maxCarrierAX = 0;
  
  // Shot and goal tracking
  let shotsBlue = 0;
  let shotsRed = 0;
  
  const dt = 1/60; // 60 FPS simulation
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    const prevScoreL = state.sL;
    const prevScoreR = state.sR;
    
    update(state, dt);
    
    // Track shots
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
      const carrierAX = owner.pos.x * (-owner.team);
      if (carrierAX > maxCarrierAX) maxCarrierAX = carrierAX;
      
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
  const bluePoss = (possFrames.blue / totalFrames * 100).toFixed(1);
  const redPoss = (possFrames.red / totalFrames * 100).toFixed(1);
  
  const blueDefPct = (zoneFrames.blue.def / possFrames.blue * 100).toFixed(1);
  const blueMidPct = (zoneFrames.blue.mid / possFrames.blue * 100).toFixed(1);
  const blueAttPct = (zoneFrames.blue.att / possFrames.blue * 100).toFixed(1);
  
  const redDefPct = (zoneFrames.red.def / possFrames.red * 100).toFixed(1);
  const redMidPct = (zoneFrames.red.mid / possFrames.red * 100).toFixed(1);
  const redAttPct = (zoneFrames.red.att / possFrames.red * 100).toFixed(1);
  
  // v8.7.4 statistics
  const avgAttPossStreakBlue = possFrames.blue > 0 
    ? (state.stats.attPossStreakFrames.blue / possFrames.blue * 100).toFixed(1)
    : '0.0';
  const avgAttPossStreakRed = possFrames.red > 0
    ? (state.stats.attPossStreakFrames.red / possFrames.red * 100).toFixed(1)
    : '0.0';
  
  console.log('=== v8.7.4 DIAGNOSTIC (1 MATCH) ===\n');
  console.log(`Final Score: Blue ${state.sL} - ${state.sR} Red`);
  console.log(`Shots: Blue ${shotsBlue}, Red ${shotsRed}`);
  console.log(`\nPossession: Blue ${bluePoss}%, Red ${redPoss}%`);
  console.log(`\nBlue Zone Occupancy (ball-owner-frame-based):`);
  console.log(`  Defensive Third: ${blueDefPct}%`);
  console.log(`  Middle Third: ${blueMidPct}%`);
  console.log(`  Attacking Third: ${blueAttPct}%`);
  console.log(`\nRed Zone Occupancy (ball-owner-frame-based):`);
  console.log(`  Defensive Third: ${redDefPct}%`);
  console.log(`  Middle Third: ${redMidPct}%`);
  console.log(`  Attacking Third: ${redAttPct}%`);
  console.log(`\nProgression:`);
  console.log(`  maxBallAX: ${maxBallAX.toFixed(2)}`);
  console.log(`  maxCarrierAX: ${maxCarrierAX.toFixed(2)}`);
  console.log(`\nv8.7.4 Statistics:`);
  console.log(`  Counter-press Hits: Blue ${state.stats.turnoverPressHits.blue}, Red ${state.stats.turnoverPressHits.red}`);
  console.log(`  Att Third Poss %: Blue ${avgAttPossStreakBlue}%, Red ${avgAttPossStreakRed}%`);
  console.log(`\n✓ Diagnostic complete`);
  
  return {
    score: { blue: state.sL, red: state.sR },
    shots: { blue: shotsBlue, red: shotsRed },
    possession: { blue: parseFloat(bluePoss), red: parseFloat(redPoss) },
    zones: {
      blue: { def: parseFloat(blueDefPct), mid: parseFloat(blueMidPct), att: parseFloat(blueAttPct) },
      red: { def: parseFloat(redDefPct), mid: parseFloat(redMidPct), att: parseFloat(redAttPct) }
    },
    progression: { maxBallAX, maxCarrierAX },
    v874: {
      counterPressHits: { blue: state.stats.turnoverPressHits.blue, red: state.stats.turnoverPressHits.red },
      attThirdPossPct: { blue: parseFloat(avgAttPossStreakBlue), red: parseFloat(avgAttPossStreakRed) }
    }
  };
}

const result = runDiagnostic();

// Save result
import { writeFileSync } from 'fs';
writeFileSync('/home/ubuntu/v8.7.4-diagnostic.json', JSON.stringify(result, null, 2));
console.log(`\n✓ Result saved to /home/ubuntu/v8.7.4-diagnostic.json`);
