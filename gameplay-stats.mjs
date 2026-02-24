#!/usr/bin/env node
/**
 * Gameplay Statistics Analysis: 30-match headless simulation
 * Tracks: dribble success rate, pass attempts, tackle attempts, ball distribution
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';
import { writeFileSync } from 'fs';

// Grid size for ball distribution heatmap
const GRID_SIZE = 2.0; // 2m x 2m cells
const PITCH_WIDTH = 20.0; // -10 to +10
const PITCH_HEIGHT = 12.0; // -6 to +6

function initHeatmap() {
  const cols = Math.ceil(PITCH_WIDTH / GRID_SIZE);
  const rows = Math.ceil(PITCH_HEIGHT / GRID_SIZE);
  const grid = [];
  for (let i = 0; i < rows; i++) {
    grid[i] = new Array(cols).fill(0);
  }
  return { grid, cols, rows };
}

function updateHeatmap(heatmap, ballPos) {
  // Convert world coordinates to grid indices
  const x = ballPos.x + PITCH_WIDTH / 2; // 0 to 20
  const y = ballPos.y + PITCH_HEIGHT / 2; // 0 to 12
  
  const col = Math.floor(x / GRID_SIZE);
  const row = Math.floor(y / GRID_SIZE);
  
  if (row >= 0 && row < heatmap.rows && col >= 0 && col < heatmap.cols) {
    heatmap.grid[row][col]++;
  }
}

function runMatch(matchId) {
  const state = mkState();
  doKickOff(state);
  
  // Statistics tracking
  const stats = {
    dribbles: { attempts: 0, successes: 0 },
    passes: { total: 0, byPlayer: {} },
    tackles: { attempts: 0, successes: 0, byPlayer: {} },
    ballDistribution: initHeatmap()
  };
  
  // Track previous state for action detection
  let prevBallOwner = null;
  let prevAction = {};
  
  const dt = 1/60;
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    const prevState = {
      ballOwner: state.ball.owner,
      ballPos: { ...state.ball.pos },
      players: state.pl.map(p => ({
        pos: { ...p.pos },
        act: p.act,
        vel: { ...p.vel }
      }))
    };
    
    update(state, dt);
    
    // Update ball distribution heatmap
    updateHeatmap(stats.ballDistribution, state.ball.pos);
    
    // Detect actions
    const currentOwner = state.ball.owner;
    
    // Dribble detection: player has "dribble" action
    state.pl.forEach((p, idx) => {
      if (p.act === 'dribble' && prevState.players[idx].act !== 'dribble') {
        stats.dribbles.attempts++;
        
        // Check if dribble succeeded (maintained possession for 0.5s)
        // We'll track this in a delayed manner
        if (!prevAction[idx]) prevAction[idx] = {};
        prevAction[idx].dribbleStart = step;
      }
      
      // Check dribble success (maintained possession)
      if (prevAction[idx]?.dribbleStart && 
          step - prevAction[idx].dribbleStart > 30 && // 0.5s = 30 frames
          currentOwner === idx) {
        stats.dribbles.successes++;
        delete prevAction[idx].dribbleStart;
      }
    });
    
    // Pass detection: ball owner changed
    if (prevBallOwner !== null && currentOwner !== null && 
        prevBallOwner !== currentOwner) {
      const prevOwnerTeam = state.pl[prevBallOwner].team;
      const currentOwnerTeam = state.pl[currentOwner].team;
      
      // Pass (same team) or tackle (different team)
      if (prevOwnerTeam === currentOwnerTeam) {
        // Successful pass
        stats.passes.total++;
        if (!stats.passes.byPlayer[prevBallOwner]) {
          stats.passes.byPlayer[prevBallOwner] = 0;
        }
        stats.passes.byPlayer[prevBallOwner]++;
      } else {
        // Tackle/interception
        stats.tackles.attempts++;
        stats.tackles.successes++;
        if (!stats.tackles.byPlayer[currentOwner]) {
          stats.tackles.byPlayer[currentOwner] = 0;
        }
        stats.tackles.byPlayer[currentOwner]++;
      }
    }
    
    // Tackle attempt detection: opponent very close to ball owner
    if (currentOwner !== null) {
      const owner = state.pl[currentOwner];
      state.pl.forEach((p, idx) => {
        if (p.team !== owner.team && idx !== currentOwner) {
          const dist = Math.sqrt(
            Math.pow(p.pos.x - owner.pos.x, 2) + 
            Math.pow(p.pos.y - owner.pos.y, 2)
          );
          
          // Tackle attempt: opponent within 0.5m and moving towards ball
          if (dist < 0.5) {
            const toBall = {
              x: state.ball.pos.x - p.pos.x,
              y: state.ball.pos.y - p.pos.y
            };
            const velDot = p.vel.x * toBall.x + p.vel.y * toBall.y;
            
            if (velDot > 0 && !prevAction[idx]?.tackleFrame) {
              stats.tackles.attempts++;
              prevAction[idx] = { tackleFrame: step };
            }
          }
          
          // Clear tackle frame after 10 frames
          if (prevAction[idx]?.tackleFrame && 
              step - prevAction[idx].tackleFrame > 10) {
            delete prevAction[idx].tackleFrame;
          }
        }
      });
    }
    
    prevBallOwner = currentOwner;
  }
  
  return {
    matchId,
    score: { blue: state.sL, red: state.sR },
    stats
  };
}

console.log('Starting gameplay statistics analysis: 30-match simulation...\n');
const startTime = Date.now();

const results = [];
const aggregateStats = {
  dribbles: { attempts: 0, successes: 0 },
  passes: { total: 0, byPlayer: {} },
  tackles: { attempts: 0, successes: 0, byPlayer: {} },
  ballDistribution: initHeatmap()
};

for (let i = 1; i <= 30; i++) {
  if (i % 5 === 0) console.log(`Progress: ${i}/30 matches completed`);
  const result = runMatch(i);
  results.push(result);
  
  // Aggregate statistics
  aggregateStats.dribbles.attempts += result.stats.dribbles.attempts;
  aggregateStats.dribbles.successes += result.stats.dribbles.successes;
  aggregateStats.passes.total += result.stats.passes.total;
  aggregateStats.tackles.attempts += result.stats.tackles.attempts;
  aggregateStats.tackles.successes += result.stats.tackles.successes;
  
  // Merge pass counts
  for (const [player, count] of Object.entries(result.stats.passes.byPlayer)) {
    if (!aggregateStats.passes.byPlayer[player]) {
      aggregateStats.passes.byPlayer[player] = 0;
    }
    aggregateStats.passes.byPlayer[player] += count;
  }
  
  // Merge tackle counts
  for (const [player, count] of Object.entries(result.stats.tackles.byPlayer)) {
    if (!aggregateStats.tackles.byPlayer[player]) {
      aggregateStats.tackles.byPlayer[player] = 0;
    }
    aggregateStats.tackles.byPlayer[player] += count;
  }
  
  // Merge ball distribution
  for (let row = 0; row < result.stats.ballDistribution.rows; row++) {
    for (let col = 0; col < result.stats.ballDistribution.cols; col++) {
      aggregateStats.ballDistribution.grid[row][col] += 
        result.stats.ballDistribution.grid[row][col];
    }
  }
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\n✓ Completed 30 matches in ${duration}s\n`);

// Generate report
let report = '';
report += '='.repeat(80) + '\n';
report += 'FUTSAL SIMULATION - GAMEPLAY STATISTICS REPORT\n';
report += '='.repeat(80) + '\n\n';

report += 'SIMULATION SUMMARY\n';
report += '-'.repeat(80) + '\n';
report += `Total Matches: 30\n`;
report += `Simulation Duration: ${duration}s\n\n`;

// Dribble statistics
report += 'DRIBBLE STATISTICS\n';
report += '='.repeat(80) + '\n';
report += `Total Dribble Attempts: ${aggregateStats.dribbles.attempts}\n`;
report += `Successful Dribbles: ${aggregateStats.dribbles.successes}\n`;
const dribbleSuccessRate = aggregateStats.dribbles.attempts > 0 
  ? (aggregateStats.dribbles.successes / aggregateStats.dribbles.attempts * 100).toFixed(2)
  : 0;
report += `Dribble Success Rate: ${dribbleSuccessRate}%\n`;
report += `Average Dribble Attempts per Match: ${(aggregateStats.dribbles.attempts / 30).toFixed(2)}\n`;
report += `Average Successful Dribbles per Match: ${(aggregateStats.dribbles.successes / 30).toFixed(2)}\n\n`;

// Pass statistics
report += 'PASS STATISTICS\n';
report += '='.repeat(80) + '\n';
report += `Total Pass Attempts: ${aggregateStats.passes.total}\n`;
report += `Average Passes per Match: ${(aggregateStats.passes.total / 30).toFixed(2)}\n\n`;

report += 'PASSES BY PLAYER (Top 10):\n';
report += '-'.repeat(80) + '\n';
const sortedPasses = Object.entries(aggregateStats.passes.byPlayer)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

sortedPasses.forEach(([player, count], idx) => {
  const playerNum = parseInt(player);
  const team = playerNum < 11 ? 'Blue' : 'Red';
  const displayNum = playerNum < 11 ? playerNum + 1 : playerNum - 10;
  report += `${idx + 1}. Player ${displayNum} (${team}): ${count} passes (${(count / 30).toFixed(2)}/match)\n`;
});
report += '\n';

// Tackle statistics
report += 'TACKLE STATISTICS\n';
report += '='.repeat(80) + '\n';
report += `Total Tackle Attempts: ${aggregateStats.tackles.attempts}\n`;
report += `Successful Tackles: ${aggregateStats.tackles.successes}\n`;
const tackleSuccessRate = aggregateStats.tackles.attempts > 0
  ? (aggregateStats.tackles.successes / aggregateStats.tackles.attempts * 100).toFixed(2)
  : 0;
report += `Tackle Success Rate: ${tackleSuccessRate}%\n`;
report += `Average Tackle Attempts per Match: ${(aggregateStats.tackles.attempts / 30).toFixed(2)}\n`;
report += `Average Successful Tackles per Match: ${(aggregateStats.tackles.successes / 30).toFixed(2)}\n\n`;

report += 'TACKLES BY PLAYER (Top 10):\n';
report += '-'.repeat(80) + '\n';
const sortedTackles = Object.entries(aggregateStats.tackles.byPlayer)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

sortedTackles.forEach(([player, count], idx) => {
  const playerNum = parseInt(player);
  const team = playerNum < 11 ? 'Blue' : 'Red';
  const displayNum = playerNum < 11 ? playerNum + 1 : playerNum - 10;
  report += `${idx + 1}. Player ${displayNum} (${team}): ${count} tackles (${(count / 30).toFixed(2)}/match)\n`;
});
report += '\n';

// Ball distribution heatmap
report += 'BALL DISTRIBUTION HEATMAP\n';
report += '='.repeat(80) + '\n';
report += 'Pitch divided into 2m x 2m grid cells. Values show frame count.\n';
report += 'Coordinate system: X-axis (left to right), Y-axis (bottom to top)\n\n';

// Find max value for normalization
let maxCount = 0;
for (let row = 0; row < aggregateStats.ballDistribution.rows; row++) {
  for (let col = 0; col < aggregateStats.ballDistribution.cols; col++) {
    if (aggregateStats.ballDistribution.grid[row][col] > maxCount) {
      maxCount = aggregateStats.ballDistribution.grid[row][col];
    }
  }
}

// ASCII heatmap
report += 'ASCII Heatmap (normalized 0-9, 9 = highest density):\n';
report += '-'.repeat(80) + '\n';

// Print from top to bottom (reverse row order for visual correctness)
for (let row = aggregateStats.ballDistribution.rows - 1; row >= 0; row--) {
  const yStart = (row * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
  const yEnd = ((row + 1) * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
  report += `Y[${yStart.padStart(5)}:${yEnd.padStart(5)}] `;
  
  for (let col = 0; col < aggregateStats.ballDistribution.cols; col++) {
    const count = aggregateStats.ballDistribution.grid[row][col];
    const normalized = maxCount > 0 ? Math.floor(count / maxCount * 9) : 0;
    report += normalized.toString();
  }
  report += '\n';
}

// X-axis labels
report += '              ';
for (let col = 0; col < aggregateStats.ballDistribution.cols; col++) {
  const xStart = (col * GRID_SIZE - PITCH_WIDTH / 2).toFixed(0);
  if (col % 2 === 0) {
    report += xStart.padStart(2, ' ');
  }
}
report += '\n';
report += '              X-axis (meters)\n\n';

// Detailed grid values
report += 'DETAILED GRID VALUES:\n';
report += '-'.repeat(80) + '\n';
for (let row = aggregateStats.ballDistribution.rows - 1; row >= 0; row--) {
  const yStart = (row * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
  const yEnd = ((row + 1) * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
  report += `Y[${yStart}:${yEnd}]: `;
  
  for (let col = 0; col < aggregateStats.ballDistribution.cols; col++) {
    const count = aggregateStats.ballDistribution.grid[row][col];
    report += count.toString().padStart(6, ' ') + ' ';
  }
  report += '\n';
}
report += '\n';

// Top 10 hotspots
report += 'TOP 10 BALL HOTSPOTS:\n';
report += '-'.repeat(80) + '\n';
const hotspots = [];
for (let row = 0; row < aggregateStats.ballDistribution.rows; row++) {
  for (let col = 0; col < aggregateStats.ballDistribution.cols; col++) {
    const count = aggregateStats.ballDistribution.grid[row][col];
    const xCenter = col * GRID_SIZE - PITCH_WIDTH / 2 + GRID_SIZE / 2;
    const yCenter = row * GRID_SIZE - PITCH_HEIGHT / 2 + GRID_SIZE / 2;
    hotspots.push({ x: xCenter, y: yCenter, count, row, col });
  }
}
hotspots.sort((a, b) => b.count - a.count);

hotspots.slice(0, 10).forEach((spot, idx) => {
  const percentage = (spot.count / (maxCount * aggregateStats.ballDistribution.rows * aggregateStats.ballDistribution.cols) * 100).toFixed(2);
  report += `${idx + 1}. Position (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}): ${spot.count} frames (${percentage}% of total)\n`;
});
report += '\n';

report += '='.repeat(80) + '\n';
report += 'END OF REPORT\n';
report += '='.repeat(80) + '\n';

// Save report
const reportPath = '/home/ubuntu/gameplay-stats-report.txt';
writeFileSync(reportPath, report);
console.log(`✓ Report saved to ${reportPath}`);

// Save raw JSON
const jsonPath = '/home/ubuntu/gameplay-stats-data.json';
writeFileSync(jsonPath, JSON.stringify({
  summary: {
    totalMatches: 30,
    duration
  },
  aggregateStats,
  results
}, null, 2));
console.log(`✓ Raw data saved to ${jsonPath}`);
