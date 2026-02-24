#!/usr/bin/env node
/**
 * Comprehensive Statistics Analysis - 1000 Matches
 * Tracks: Pass success rate, Possession, Shot conversion rate, xG
 */

import { mkState, update } from './client/src/game/engine.ts';
import { writeFileSync } from 'fs';

const MATCHES = 200;
const FRAME_RATE = 30;

// xG model: Calculate expected goals based on shot position and angle
function calculateXG(shotPos, goalPos, isPhaseB) {
  const distToGoal = Math.sqrt(
    Math.pow(shotPos.x - goalPos.x, 2) + 
    Math.pow(shotPos.y - goalPos.y, 2)
  );
  
  // Angle to goal
  const goalHalfH = 1.22;
  const angleTop = Math.atan2(goalHalfH - shotPos.y, goalPos.x - shotPos.x);
  const angleBottom = Math.atan2(-goalHalfH - shotPos.y, goalPos.x - shotPos.x);
  const angleToGoal = Math.abs(angleTop - angleBottom) * (180 / Math.PI);
  
  // Base xG from distance (exponential decay)
  let xg = Math.exp(-distToGoal / 8.0);
  
  // Angle multiplier (wider angle = better chance)
  const angleMultiplier = Math.min(angleToGoal / 30, 1.5);
  xg *= angleMultiplier;
  
  // Phase B bonus (better positioning)
  if (isPhaseB) {
    xg *= 1.2;
  }
  
  // Clamp to reasonable range
  return Math.max(0, Math.min(xg, 0.95));
}

// Track all statistics
const allStats = {
  blue: {
    passes: { attempted: 0, completed: 0 },
    shots: { attempted: 0, goals: 0, xG: 0 },
    possession: { frames: 0 },
    shotDetails: [], // { dist, angle, xG, scored }
  },
  red: {
    passes: { attempted: 0, completed: 0 },
    shots: { attempted: 0, goals: 0, xG: 0 },
    possession: { frames: 0 },
    shotDetails: [],
  },
  matches: [],
};

console.log(`Starting ${MATCHES}-match simulation...`);

for (let matchIdx = 0; matchIdx < MATCHES; matchIdx++) {
  const st = mkState();
  
  const matchStats = {
    blue: {
      passes: { attempted: 0, completed: 0 },
      shots: { attempted: 0, goals: 0, xG: 0 },
      possession: { frames: 0 },
    },
    red: {
      passes: { attempted: 0, completed: 0 },
      shots: { attempted: 0, goals: 0, xG: 0 },
      possession: { frames: 0 },
    },
    duration: 0,
  };
  
  let prevScoreBlue = 0;
  let prevScoreRed = 0;
  let prevBallOwner = null;
  let prevBallPos = { x: 0, y: 0 };
  let prevBallShot = false;
  
  // Run match
  while (!st.over) {
    const dt = 1 / FRAME_RATE;
    update(st, dt);
    matchStats.duration++;
    
    // Track possession
    if (st.ball.owner !== null) {
      const ownerTeam = st.pl[st.ball.owner].team;
      if (ownerTeam === -1) {
        matchStats.blue.possession.frames++;
      } else if (ownerTeam === 1) {
        matchStats.red.possession.frames++;
      }
    }
    
    // Detect pass attempts and completions
    if (prevBallOwner !== null && st.ball.owner !== null && prevBallOwner !== st.ball.owner) {
      const prevTeam = st.pl[prevBallOwner].team;
      const newTeam = st.pl[st.ball.owner].team;
      
      if (st.ball.lastKickType === 'PASS') {
        // Pass was attempted
        if (prevTeam === -1) {
          matchStats.blue.passes.attempted++;
          if (newTeam === -1) {
            matchStats.blue.passes.completed++;
          }
        } else if (prevTeam === 1) {
          matchStats.red.passes.attempted++;
          if (newTeam === 1) {
            matchStats.red.passes.completed++;
          }
        }
      }
    }
    
    // Detect shots and calculate xG (only count when shot state changes from false to true)
    if (st.ball.lastKickType === 'SHOT' && st.ball.shot && !prevBallShot) {
      const shooterTeam = st.ball.lastKickTeam;
      const shooterPos = { ...prevBallPos };
      
      // Determine target goal
      const goalX = shooterTeam === -1 ? 10.5 : -10.5;
      const goalPos = { x: goalX, y: 0 };
      
      // Calculate xG
      const ax = shooterPos.x * (-shooterTeam);
      const isPhaseB = ax >= (2 * 10.5 / 3);
      const xg = calculateXG(shooterPos, goalPos, isPhaseB);
      
      if (shooterTeam === -1) {
        matchStats.blue.shots.attempted++;
        matchStats.blue.shots.xG += xg;
        allStats.blue.shotDetails.push({
          dist: Math.sqrt(Math.pow(shooterPos.x - goalX, 2) + Math.pow(shooterPos.y, 2)),
          xG: xg,
          scored: false, // Will update if goal
        });
      } else if (shooterTeam === 1) {
        matchStats.red.shots.attempted++;
        matchStats.red.shots.xG += xg;
        allStats.red.shotDetails.push({
          dist: Math.sqrt(Math.pow(shooterPos.x - goalX, 2) + Math.pow(shooterPos.y, 2)),
          xG: xg,
          scored: false,
        });
      }
    }
    
    // Detect goals
    if (st.sL > prevScoreBlue) {
      matchStats.blue.shots.goals++;
      // Mark last shot as scored
      if (allStats.blue.shotDetails.length > 0) {
        allStats.blue.shotDetails[allStats.blue.shotDetails.length - 1].scored = true;
      }
    }
    if (st.sR > prevScoreRed) {
      matchStats.red.shots.goals++;
      if (allStats.red.shotDetails.length > 0) {
        allStats.red.shotDetails[allStats.red.shotDetails.length - 1].scored = true;
      }
    }
    
    prevScoreBlue = st.sL;
    prevScoreRed = st.sR;
    prevBallOwner = st.ball.owner;
    prevBallPos = { x: st.ball.pos.x, y: st.ball.pos.y };
    prevBallShot = st.ball.shot;
  }
  
  // Aggregate match stats
  allStats.blue.passes.attempted += matchStats.blue.passes.attempted;
  allStats.blue.passes.completed += matchStats.blue.passes.completed;
  allStats.blue.shots.attempted += matchStats.blue.shots.attempted;
  allStats.blue.shots.goals += matchStats.blue.shots.goals;
  allStats.blue.shots.xG += matchStats.blue.shots.xG;
  allStats.blue.possession.frames += matchStats.blue.possession.frames;
  
  allStats.red.passes.attempted += matchStats.red.passes.attempted;
  allStats.red.passes.completed += matchStats.red.passes.completed;
  allStats.red.shots.attempted += matchStats.red.shots.attempted;
  allStats.red.shots.goals += matchStats.red.shots.goals;
  allStats.red.shots.xG += matchStats.red.shots.xG;
  allStats.red.possession.frames += matchStats.red.possession.frames;
  
  allStats.matches.push(matchStats);
  
  if ((matchIdx + 1) % 100 === 0) {
    console.log(`Progress: ${matchIdx + 1}/${MATCHES} matches completed`);
  }
}

// Calculate averages and percentages
const totalFrames = allStats.matches.reduce((sum, m) => sum + m.duration, 0);

const report = {
  summary: {
    totalMatches: MATCHES,
    totalFrames: totalFrames,
    avgMatchDuration: (totalFrames / MATCHES / FRAME_RATE).toFixed(2) + 's',
  },
  blue: {
    passSuccessRate: (allStats.blue.passes.completed / allStats.blue.passes.attempted * 100).toFixed(2) + '%',
    passesPerMatch: (allStats.blue.passes.attempted / MATCHES).toFixed(2),
    completedPassesPerMatch: (allStats.blue.passes.completed / MATCHES).toFixed(2),
    possession: (allStats.blue.possession.frames / totalFrames * 100).toFixed(2) + '%',
    shotsPerMatch: (allStats.blue.shots.attempted / MATCHES).toFixed(2),
    goalsPerMatch: (allStats.blue.shots.goals / MATCHES).toFixed(2),
    shotConversionRate: (allStats.blue.shots.goals / allStats.blue.shots.attempted * 100).toFixed(2) + '%',
    xGPerMatch: (allStats.blue.shots.xG / MATCHES).toFixed(2),
    xGPerShot: (allStats.blue.shots.xG / allStats.blue.shots.attempted).toFixed(3),
    goalsVsXG: (allStats.blue.shots.goals - allStats.blue.shots.xG).toFixed(2),
  },
  red: {
    passSuccessRate: (allStats.red.passes.completed / allStats.red.passes.attempted * 100).toFixed(2) + '%',
    passesPerMatch: (allStats.red.passes.attempted / MATCHES).toFixed(2),
    completedPassesPerMatch: (allStats.red.passes.completed / MATCHES).toFixed(2),
    possession: (allStats.red.possession.frames / totalFrames * 100).toFixed(2) + '%',
    shotsPerMatch: (allStats.red.shots.attempted / MATCHES).toFixed(2),
    goalsPerMatch: (allStats.red.shots.goals / MATCHES).toFixed(2),
    shotConversionRate: (allStats.red.shots.goals / allStats.red.shots.attempted * 100).toFixed(2) + '%',
    xGPerMatch: (allStats.red.shots.xG / MATCHES).toFixed(2),
    xGPerShot: (allStats.red.shots.xG / allStats.red.shots.attempted).toFixed(3),
    goalsVsXG: (allStats.red.shots.goals - allStats.red.shots.xG).toFixed(2),
  },
};

// Generate text report
let textReport = '';
textReport += '='.repeat(80) + '\n';
textReport += 'COMPREHENSIVE STATISTICS REPORT - 1000 MATCHES\n';
textReport += '='.repeat(80) + '\n\n';

textReport += 'SUMMARY\n';
textReport += '-'.repeat(80) + '\n';
textReport += `Total Matches: ${report.summary.totalMatches}\n`;
textReport += `Total Frames: ${report.summary.totalFrames}\n`;
textReport += `Avg Match Duration: ${report.summary.avgMatchDuration}\n\n`;

textReport += 'BLUE TEAM STATISTICS\n';
textReport += '='.repeat(80) + '\n\n';

textReport += 'Passing:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Pass Success Rate: ${report.blue.passSuccessRate}\n`;
textReport += `  Passes per Match: ${report.blue.passesPerMatch}\n`;
textReport += `  Completed Passes per Match: ${report.blue.completedPassesPerMatch}\n\n`;

textReport += 'Possession:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Possession: ${report.blue.possession}\n\n`;

textReport += 'Shooting:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Shots per Match: ${report.blue.shotsPerMatch}\n`;
textReport += `  Goals per Match: ${report.blue.goalsPerMatch}\n`;
textReport += `  Shot Conversion Rate: ${report.blue.shotConversionRate}\n`;
textReport += `  xG per Match: ${report.blue.xGPerMatch}\n`;
textReport += `  xG per Shot: ${report.blue.xGPerShot}\n`;
textReport += `  Goals vs xG: ${report.blue.goalsVsXG} (${parseFloat(report.blue.goalsVsXG) > 0 ? 'overperforming' : 'underperforming'})\n\n`;

textReport += 'RED TEAM STATISTICS\n';
textReport += '='.repeat(80) + '\n\n';

textReport += 'Passing:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Pass Success Rate: ${report.red.passSuccessRate}\n`;
textReport += `  Passes per Match: ${report.red.passesPerMatch}\n`;
textReport += `  Completed Passes per Match: ${report.red.completedPassesPerMatch}\n\n`;

textReport += 'Possession:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Possession: ${report.red.possession}\n\n`;

textReport += 'Shooting:\n';
textReport += '-'.repeat(80) + '\n';
textReport += `  Shots per Match: ${report.red.shotsPerMatch}\n`;
textReport += `  Goals per Match: ${report.red.goalsPerMatch}\n`;
textReport += `  Shot Conversion Rate: ${report.red.shotConversionRate}\n`;
textReport += `  xG per Match: ${report.red.xGPerMatch}\n`;
textReport += `  xG per Shot: ${report.red.xGPerShot}\n`;
textReport += `  Goals vs xG: ${report.red.goalsVsXG} (${parseFloat(report.red.goalsVsXG) > 0 ? 'overperforming' : 'underperforming'})\n\n`;

textReport += 'COMPARATIVE ANALYSIS\n';
textReport += '='.repeat(80) + '\n\n';

const bluePassRate = parseFloat(report.blue.passSuccessRate);
const redPassRate = parseFloat(report.red.passSuccessRate);
const bluePoss = parseFloat(report.blue.possession);
const redPoss = parseFloat(report.red.possession);
const blueConv = parseFloat(report.blue.shotConversionRate);
const redConv = parseFloat(report.red.shotConversionRate);

textReport += `Pass Success Rate: Blue ${report.blue.passSuccessRate} vs Red ${report.red.passSuccessRate}\n`;
textReport += `  Difference: ${(bluePassRate - redPassRate).toFixed(2)}%\n\n`;

textReport += `Possession: Blue ${report.blue.possession} vs Red ${report.red.possession}\n`;
textReport += `  Difference: ${(bluePoss - redPoss).toFixed(2)}%\n`;
textReport += `  Balance Factor: ${(bluePoss / redPoss).toFixed(2)}x\n\n`;

textReport += `Shot Conversion: Blue ${report.blue.shotConversionRate} vs Red ${report.red.shotConversionRate}\n`;
textReport += `  Difference: ${(blueConv - redConv).toFixed(2)}%\n\n`;

textReport += `xG: Blue ${report.blue.xGPerMatch} vs Red ${report.red.xGPerMatch}\n`;
textReport += `  Difference: ${(parseFloat(report.blue.xGPerMatch) - parseFloat(report.red.xGPerMatch)).toFixed(2)}\n\n`;

textReport += '='.repeat(80) + '\n';
textReport += 'END OF REPORT\n';
textReport += '='.repeat(80) + '\n';

// Save reports
writeFileSync('/home/ubuntu/comprehensive-stats-report.txt', textReport);
writeFileSync('/home/ubuntu/comprehensive-stats-data.json', JSON.stringify({
  report,
  rawStats: allStats,
}, null, 2));

console.log('✓ Report saved to /home/ubuntu/comprehensive-stats-report.txt');
console.log('✓ Raw data saved to /home/ubuntu/comprehensive-stats-data.json');
