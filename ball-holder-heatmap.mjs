#!/usr/bin/env node
/**
 * Ball Holder Heatmap: 100-match headless simulation
 * Tracks where players have possession of the ball on the pitch
 */

import { mkState, doKickOff, update } from './client/src/game/engine.ts';
import { P } from './client/src/game/constants.ts';
import { writeFileSync } from 'fs';

// Grid size for heatmap
const GRID_SIZE = 1.0; // 1m x 1m cells for higher resolution
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

function updateHeatmap(heatmap, pos) {
  // Convert world coordinates to grid indices
  const x = pos.x + PITCH_WIDTH / 2; // 0 to 20
  const y = pos.y + PITCH_HEIGHT / 2; // 0 to 12
  
  const col = Math.floor(x / GRID_SIZE);
  const row = Math.floor(y / GRID_SIZE);
  
  if (row >= 0 && row < heatmap.rows && col >= 0 && col < heatmap.cols) {
    heatmap.grid[row][col]++;
  }
}

function runMatch(matchId) {
  const state = mkState();
  doKickOff(state);
  
  const heatmaps = {
    overall: initHeatmap(),
    blue: initHeatmap(),
    red: initHeatmap(),
    byPlayer: {}
  };
  
  const dt = 1/60;
  const maxSteps = Math.ceil(P.matchDuration / dt);
  
  for (let step = 0; step < maxSteps; step++) {
    update(state, dt);
    
    // Track ball holder position
    if (state.ball.owner !== null) {
      const owner = state.pl[state.ball.owner];
      const ownerIdx = state.ball.owner;
      
      // Update overall heatmap
      updateHeatmap(heatmaps.overall, owner.pos);
      
      // Update team-specific heatmap
      if (owner.team === -1) {
        updateHeatmap(heatmaps.blue, owner.pos);
      } else {
        updateHeatmap(heatmaps.red, owner.pos);
      }
      
      // Update player-specific heatmap
      if (!heatmaps.byPlayer[ownerIdx]) {
        heatmaps.byPlayer[ownerIdx] = initHeatmap();
      }
      updateHeatmap(heatmaps.byPlayer[ownerIdx], owner.pos);
    }
  }
  
  return {
    matchId,
    score: { blue: state.sL, red: state.sR },
    heatmaps
  };
}

console.log('Starting ball holder heatmap generation: 100-match simulation...\n');
const startTime = Date.now();

const results = [];
const aggregateHeatmaps = {
  overall: initHeatmap(),
  blue: initHeatmap(),
  red: initHeatmap(),
  byPlayer: {}
};

for (let i = 1; i <= 100; i++) {
  if (i % 10 === 0) console.log(`Progress: ${i}/100 matches completed`);
  const result = runMatch(i);
  results.push(result);
  
  // Merge heatmaps
  for (let row = 0; row < result.heatmaps.overall.rows; row++) {
    for (let col = 0; col < result.heatmaps.overall.cols; col++) {
      aggregateHeatmaps.overall.grid[row][col] += result.heatmaps.overall.grid[row][col];
      aggregateHeatmaps.blue.grid[row][col] += result.heatmaps.blue.grid[row][col];
      aggregateHeatmaps.red.grid[row][col] += result.heatmaps.red.grid[row][col];
    }
  }
  
  // Merge player heatmaps
  for (const [playerIdx, heatmap] of Object.entries(result.heatmaps.byPlayer)) {
    if (!aggregateHeatmaps.byPlayer[playerIdx]) {
      aggregateHeatmaps.byPlayer[playerIdx] = initHeatmap();
    }
    for (let row = 0; row < heatmap.rows; row++) {
      for (let col = 0; col < heatmap.cols; col++) {
        aggregateHeatmaps.byPlayer[playerIdx].grid[row][col] += heatmap.grid[row][col];
      }
    }
  }
}

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\n✓ Completed 100 matches in ${duration}s\n`);

// Generate report
let report = '';
report += '='.repeat(80) + '\n';
report += 'FUTSAL SIMULATION - BALL HOLDER HEATMAP REPORT\n';
report += '='.repeat(80) + '\n\n';

report += 'SIMULATION SUMMARY\n';
report += '-'.repeat(80) + '\n';
report += `Total Matches: 100\n`;
report += `Simulation Duration: ${duration}s\n`;
report += `Grid Resolution: ${GRID_SIZE}m x ${GRID_SIZE}m cells\n`;
report += `Pitch Dimensions: ${PITCH_WIDTH}m x ${PITCH_HEIGHT}m\n\n`;

// Helper function to render heatmap
function renderHeatmap(heatmap, title) {
  let output = '';
  output += title + '\n';
  output += '='.repeat(80) + '\n\n';
  
  // Find max value for normalization
  let maxCount = 0;
  for (let row = 0; row < heatmap.rows; row++) {
    for (let col = 0; col < heatmap.cols; col++) {
      if (heatmap.grid[row][col] > maxCount) {
        maxCount = heatmap.grid[row][col];
      }
    }
  }
  
  output += 'ASCII Heatmap (0-9, 9 = highest density):\n';
  output += '-'.repeat(80) + '\n';
  
  // Print from top to bottom
  for (let row = heatmap.rows - 1; row >= 0; row--) {
    const yStart = (row * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
    const yEnd = ((row + 1) * GRID_SIZE - PITCH_HEIGHT / 2).toFixed(1);
    output += `Y[${yStart.padStart(5)}:${yEnd.padStart(5)}] `;
    
    for (let col = 0; col < heatmap.cols; col++) {
      const count = heatmap.grid[row][col];
      const normalized = maxCount > 0 ? Math.floor(count / maxCount * 9) : 0;
      output += normalized.toString();
    }
    output += '\n';
  }
  
  // X-axis labels
  output += '              ';
  for (let col = 0; col < heatmap.cols; col++) {
    const xStart = (col * GRID_SIZE - PITCH_WIDTH / 2).toFixed(0);
    if (col % 2 === 0) {
      output += xStart.padStart(2, ' ');
    }
  }
  output += '\n';
  output += '              X-axis (meters)\n\n';
  
  // Top 10 hotspots
  const hotspots = [];
  for (let row = 0; row < heatmap.rows; row++) {
    for (let col = 0; col < heatmap.cols; col++) {
      const count = heatmap.grid[row][col];
      if (count > 0) {
        const xCenter = col * GRID_SIZE - PITCH_WIDTH / 2 + GRID_SIZE / 2;
        const yCenter = row * GRID_SIZE - PITCH_HEIGHT / 2 + GRID_SIZE / 2;
        hotspots.push({ x: xCenter, y: yCenter, count });
      }
    }
  }
  hotspots.sort((a, b) => b.count - a.count);
  
  output += 'TOP 10 POSSESSION HOTSPOTS:\n';
  output += '-'.repeat(80) + '\n';
  const totalFrames = hotspots.reduce((sum, spot) => sum + spot.count, 0);
  hotspots.slice(0, 10).forEach((spot, idx) => {
    const percentage = (spot.count / totalFrames * 100).toFixed(2);
    output += `${idx + 1}. Position (${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}): ${spot.count} frames (${percentage}%)\n`;
  });
  output += '\n';
  
  return output;
}

// Overall heatmap
report += renderHeatmap(aggregateHeatmaps.overall, 'OVERALL BALL HOLDER HEATMAP (Both Teams)');

// Blue team heatmap
report += renderHeatmap(aggregateHeatmaps.blue, 'BLUE TEAM BALL HOLDER HEATMAP');

// Red team heatmap
report += renderHeatmap(aggregateHeatmaps.red, 'RED TEAM BALL HOLDER HEATMAP');

// Player-specific heatmaps (top 5 by possession time)
report += 'INDIVIDUAL PLAYER HEATMAPS\n';
report += '='.repeat(80) + '\n\n';

const playerPossessionTimes = [];
for (const [playerIdx, heatmap] of Object.entries(aggregateHeatmaps.byPlayer)) {
  let totalFrames = 0;
  for (let row = 0; row < heatmap.rows; row++) {
    for (let col = 0; col < heatmap.cols; col++) {
      totalFrames += heatmap.grid[row][col];
    }
  }
  playerPossessionTimes.push({ playerIdx: parseInt(playerIdx), totalFrames });
}
playerPossessionTimes.sort((a, b) => b.totalFrames - a.totalFrames);

report += 'POSSESSION TIME BY PLAYER (Top 10):\n';
report += '-'.repeat(80) + '\n';
playerPossessionTimes.slice(0, 10).forEach((p, idx) => {
  const team = p.playerIdx < 11 ? 'Blue' : 'Red';
  const displayNum = p.playerIdx < 11 ? p.playerIdx + 1 : p.playerIdx - 10;
  const seconds = (p.totalFrames / 60).toFixed(2);
  report += `${idx + 1}. Player ${displayNum} (${team}): ${p.totalFrames} frames (${seconds}s total)\n`;
});
report += '\n';

// Top 5 player heatmaps
playerPossessionTimes.slice(0, 5).forEach((p) => {
  const team = p.playerIdx < 11 ? 'Blue' : 'Red';
  const displayNum = p.playerIdx < 11 ? p.playerIdx + 1 : p.playerIdx - 10;
  const seconds = (p.totalFrames / 60).toFixed(2);
  report += renderHeatmap(
    aggregateHeatmaps.byPlayer[p.playerIdx],
    `PLAYER ${displayNum} (${team}) - ${seconds}s possession`
  );
});

report += '='.repeat(80) + '\n';
report += 'END OF REPORT\n';
report += '='.repeat(80) + '\n';

// Save report
const reportPath = '/home/ubuntu/ball-holder-heatmap-report.txt';
writeFileSync(reportPath, report);
console.log(`✓ Report saved to ${reportPath}`);

// Save raw JSON
const jsonPath = '/home/ubuntu/ball-holder-heatmap-data.json';
writeFileSync(jsonPath, JSON.stringify({
  summary: {
    totalMatches: 100,
    duration,
    gridSize: GRID_SIZE
  },
  aggregateHeatmaps: {
    overall: aggregateHeatmaps.overall.grid,
    blue: aggregateHeatmaps.blue.grid,
    red: aggregateHeatmaps.red.grid
  },
  playerPossessionTimes
}, null, 2));
console.log(`✓ Raw data saved to ${jsonPath}`);
