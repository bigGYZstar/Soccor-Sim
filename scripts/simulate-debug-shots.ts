import { mkState, update, doKickOff } from "../client/src/game/engine.js";

const st = mkState();
doKickOff(st, -1);

const dt = 1 / 60;
let shotAttempts = 0;
let goalAttempts = 0;

// Intercept kick function to count shots
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const msg = args.join(" ");
  if (msg.includes("GOAL")) {
    goalAttempts++;
    originalConsoleLog(...args);
  }
};

// Run for 60 seconds
for (let i = 0; i < 3600; i++) {
  update(st, dt);
  
  // Check if any player is shooting
  for (const p of st.pl) {
    if (p.act === "shoot") {
      shotAttempts++;
    }
  }
  
  // Log every 10 seconds
  if (i % 600 === 0) {
    const time = (i * dt).toFixed(1);
    console.log = originalConsoleLog;
    console.log(`[${time}s] Score: ${st.sL}-${st.sR}, Shots: ${shotAttempts}, Goals: ${goalAttempts}`);
    console.log = (...args: any[]) => {
      const msg = args.join(" ");
      if (msg.includes("GOAL")) {
        goalAttempts++;
        originalConsoleLog(...args);
      }
    };
  }
}

console.log = originalConsoleLog;
console.log(`\nFinal: ${st.sL}-${st.sR}`);
console.log(`Total shot attempts: ${shotAttempts}`);
console.log(`Total goal attempts: ${goalAttempts}`);
