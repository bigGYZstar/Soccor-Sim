// Off-the-ball movement diagnostic - measures actual player displacement during possession
import { mkState, update } from '../client/src/game/engine';
import { vdist, vlen, vsub } from '../client/src/game/math';
import { P } from '../client/src/game/constants';

const st = mkState("4-4-2", "4-4-2");
const DT = 1 / 60;
const TOTAL_FRAMES = 60 * 90; // 90 seconds

// Track per-player metrics
interface PlayerTrack {
  idx: number;
  team: number;
  role: string;
  posLabel: string;
  // Position samples when team has ball
  positionsWhenTeamHasBall: { x: number; y: number; t: number }[];
  // Total distance moved during team possession
  distMovedDuringPoss: number;
  // How far from home position on average
  avgDistFromHome: number;
  distFromHomeSamples: number;
  // Forward displacement during possession (toward enemy goal)
  forwardDisplacements: number[];
  // passAndMove activations
  passAndMoveActivations: number;
  // wantsBall activations
  wantsBallActivations: number;
  // Max distance from home during possession
  maxDistFromHome: number;
}

const tracks: PlayerTrack[] = st.pl.map(p => ({
  idx: p.idx,
  team: p.team,
  role: p.role,
  posLabel: p.posLabel || p.role,
  positionsWhenTeamHasBall: [],
  distMovedDuringPoss: 0,
  avgDistFromHome: 0,
  distFromHomeSamples: 0,
  forwardDisplacements: [],
  passAndMoveActivations: 0,
  wantsBallActivations: 0,
  maxDistFromHome: 0,
}));

let prevPositions = st.pl.map(p => ({ x: p.pos.x, y: p.pos.y }));

for (let f = 0; f < TOTAL_FRAMES; f++) {
  update(st, DT);
  
  // Determine which team has ball
  let possTeam = 0;
  if (st.ball.owner !== null) {
    possTeam = st.pl[st.ball.owner].team;
  } else if (st.ball.free && (st.ball as any).kickTeam) {
    possTeam = (st.ball as any).kickTeam;
  }
  
  for (let i = 0; i < st.pl.length; i++) {
    const p = st.pl[i];
    const t = tracks[i];
    const isMyTeamPoss = possTeam === p.team && possTeam !== 0;
    const isNotBallOwner = st.ball.owner !== i;
    
    if (isMyTeamPoss && isNotBallOwner) {
      // Track movement during team possession (off-the-ball)
      const prev = prevPositions[i];
      const dist = Math.sqrt((p.pos.x - prev.x) ** 2 + (p.pos.y - prev.y) ** 2);
      t.distMovedDuringPoss += dist;
      
      // Distance from home
      const dHome = vdist(p.pos, p.home);
      t.avgDistFromHome += dHome;
      t.distFromHomeSamples++;
      t.maxDistFromHome = Math.max(t.maxDistFromHome, dHome);
      
      // Forward displacement (toward enemy goal)
      const attackDir = -p.team; // -1 for team 1 (attack left), +1 for team -1 (attack right)
      const forwardFromHome = (p.pos.x - p.home.x) * attackDir;
      t.forwardDisplacements.push(forwardFromHome);
      
      // Track position
      if (f % 6 === 0) { // Sample every 6 frames
        t.positionsWhenTeamHasBall.push({ x: p.pos.x, y: p.pos.y, t: st.time });
      }
      
      // Track flags
      if (p.passAndMoveTimer > 0) t.passAndMoveActivations++;
      if (p.wantsBall) t.wantsBallActivations++;
    }
    
    prevPositions[i] = { x: p.pos.x, y: p.pos.y };
  }
}

console.log("=== OFF-THE-BALL MOVEMENT DIAGNOSTIC ===\n");

// Blue team (team = 1) analysis
console.log("--- BLUE TEAM (team=1) ---");
const blueOutfield = tracks.filter(t => t.team === 1 && !st.pl[t.idx].isGK);
for (const t of blueOutfield) {
  const avgDHome = t.distFromHomeSamples > 0 ? (t.avgDistFromHome / t.distFromHomeSamples).toFixed(1) : "N/A";
  const avgFwd = t.forwardDisplacements.length > 0 
    ? (t.forwardDisplacements.reduce((a, b) => a + b, 0) / t.forwardDisplacements.length).toFixed(1)
    : "N/A";
  const maxFwd = t.forwardDisplacements.length > 0
    ? Math.max(...t.forwardDisplacements).toFixed(1)
    : "N/A";
  
  console.log(`  #${t.idx + 1}(${t.posLabel}/${t.role}): moved=${t.distMovedDuringPoss.toFixed(1)}m, avgDistHome=${avgDHome}m, maxDistHome=${t.maxDistFromHome.toFixed(1)}m, avgFwd=${avgFwd}m, maxFwd=${maxFwd}m, passAndMove=${t.passAndMoveActivations}, wantsBall=${t.wantsBallActivations}`);
}

// Position heatmap summary
console.log("\n--- POSITION RANGE (min_x to max_x during team possession) ---");
for (const t of blueOutfield) {
  const xs = t.positionsWhenTeamHasBall.map(p => p.x);
  const ys = t.positionsWhenTeamHasBall.map(p => p.y);
  if (xs.length > 0) {
    const minX = Math.min(...xs).toFixed(1);
    const maxX = Math.max(...xs).toFixed(1);
    const minY = Math.min(...ys).toFixed(1);
    const maxY = Math.max(...ys).toFixed(1);
    const rangeX = (Math.max(...xs) - Math.min(...xs)).toFixed(1);
    console.log(`  #${t.idx + 1}(${t.posLabel}): x=[${minX}, ${maxX}] range=${rangeX}m, y=[${minY}, ${maxY}]`);
  }
}

// Check how much players actually move vs stay near home
console.log("\n--- HOME ANCHOR ANALYSIS ---");
for (const t of blueOutfield) {
  const samples = t.positionsWhenTeamHasBall;
  if (samples.length < 2) continue;
  
  let withinHome2m = 0;
  let withinHome5m = 0;
  for (const s of samples) {
    const dHome = Math.sqrt((s.x - st.pl[t.idx].home.x) ** 2 + (s.y - st.pl[t.idx].home.y) ** 2);
    if (dHome < 2.0) withinHome2m++;
    if (dHome < 5.0) withinHome5m++;
  }
  
  console.log(`  #${t.idx + 1}(${t.posLabel}): within2m=${(withinHome2m / samples.length * 100).toFixed(0)}%, within5m=${(withinHome5m / samples.length * 100).toFixed(0)}%, total_samples=${samples.length}`);
}

// Red team summary (brief)
console.log("\n--- RED TEAM (team=-1) SUMMARY ---");
const redOutfield = tracks.filter(t => t.team === -1 && !st.pl[t.idx].isGK);
for (const t of redOutfield) {
  const avgDHome = t.distFromHomeSamples > 0 ? (t.avgDistFromHome / t.distFromHomeSamples).toFixed(1) : "N/A";
  console.log(`  #${t.idx + 1}(${t.posLabel}/${t.role}): moved=${t.distMovedDuringPoss.toFixed(1)}m, avgDistHome=${avgDHome}m, maxDistHome=${t.maxDistFromHome.toFixed(1)}m, passAndMove=${t.passAndMoveActivations}, wantsBall=${t.wantsBallActivations}`);
}
