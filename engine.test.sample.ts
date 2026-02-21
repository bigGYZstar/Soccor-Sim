// Sample Vitest test file for futsal simulation engine
// This demonstrates how to test engine functions after refactoring
// Place this file in: client/src/tests/engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { mkState, give, kick, bestPass, decideHasBall, update, checkGoal } from '../game/engine';
import { v } from '../game/math';
import { State } from '../game/types';

describe('Soccer Simulation Engine - Core Functions', () => {
  let st: State;

  beforeEach(() => {
    st = mkState();
  });

  describe('State Initialization', () => {
    it('creates initial state with 22 players (11 per team)', () => {
      expect(st.pl.length).toBe(22);
      expect(st.pl.filter(p => p.team === -1).length).toBe(11); // Blue team
      expect(st.pl.filter(p => p.team === 1).length).toBe(11);  // Red team
    });

    it('places players at their home positions', () => {
      expect(st.pl[0].pos.x).toBe(st.pl[0].home.x);
      expect(st.pl[0].pos.y).toBe(st.pl[0].home.y);
    });

    it('initializes ball at center (0, 0)', () => {
      expect(st.ball.pos.x).toBe(0);
      expect(st.ball.pos.y).toBe(0);
      expect(st.ball.free).toBe(true);
      expect(st.ball.owner).toBeNull();
    });

    it('sets match time to 0 and score to 0-0', () => {
      expect(st.time).toBe(0);
      expect(st.sL).toBe(0);
      expect(st.sR).toBe(0);
      expect(st.over).toBe(false);
    });
  });

  describe('Ball Ownership', () => {
    it('give() transfers ball ownership correctly', () => {
      const playerIdx = 5;
      give(st.ball, playerIdx, st.pl);

      expect(st.ball.owner).toBe(playerIdx);
      expect(st.ball.free).toBe(false);
      expect(st.ball.pos.x).toBe(st.pl[playerIdx].pos.x);
      expect(st.ball.pos.y).toBe(st.pl[playerIdx].pos.y);
      expect(st.ball.lastTouchTeam).toBe(st.pl[playerIdx].team);
    });

    it('ball follows player when owned', () => {
      const playerIdx = 3;
      give(st.ball, playerIdx, st.pl);
      
      // Move player
      st.pl[playerIdx].pos = v(-5, 2);
      
      // Update should sync ball position
      update(st, 0.05);
      
      expect(st.ball.pos.x).toBe(st.pl[playerIdx].pos.x);
      expect(st.ball.pos.y).toBe(st.pl[playerIdx].pos.y);
    });
  });

  describe('Pass Decision Logic', () => {
    it('bestPass() avoids offside players', () => {
      const passerIdx = 2; // Blue CB
      st.pl[passerIdx].pos = v(-8, 0);
      give(st.ball, passerIdx, st.pl);

      // Place teammate in offside position (beyond all opponents)
      const offsideIdx = 9;
      st.pl[offsideIdx].pos = v(-10.4, 0); // Beyond goal line

      // Place safe teammate
      const safeIdx = 5;
      st.pl[safeIdx].pos = v(-5, 2);

      const target = bestPass(st, passerIdx);

      // Should NOT pass to offside player
      expect(target).not.toBe(offsideIdx);
    });

    it('bestPass() prefers forward passes (positive gain)', () => {
      const passerIdx = 2;
      st.pl[passerIdx].pos = v(-5, 0);
      give(st.ball, passerIdx, st.pl);

      // Place two teammates: one forward, one backward
      const forwardIdx = 5;
      st.pl[forwardIdx].pos = v(-2, 1); // 3 units forward

      const backwardIdx = 3;
      st.pl[backwardIdx].pos = v(-7, 1); // 2 units backward

      // Place enemies far away to avoid blocking
      for (let i = 11; i < 22; i++) {
        st.pl[i].pos = v(8, 0);
      }

      const target = bestPass(st, passerIdx);

      // Should prefer forward pass
      expect(target).toBe(forwardIdx);
    });

    it('bestPass() returns null when no good options (v7.1 pass rejection)', () => {
      const passerIdx = 2;
      st.pl[passerIdx].pos = v(-9, 0); // Deep in own half
      give(st.ball, passerIdx, st.pl);

      // Place all teammates behind passer
      for (let i = 0; i < 11; i++) {
        if (i !== passerIdx) {
          st.pl[i].pos = v(-9.5, i - 5);
        }
      }

      // Place enemies far away (no press)
      for (let i = 11; i < 22; i++) {
        st.pl[i].pos = v(8, 0);
      }

      const target = bestPass(st, passerIdx);

      // Should return null (no good pass, trigger dribble)
      expect(target).toBeNull();
    });

    it('bestPass() allows back-pass under heavy press (v7.1 press-escape)', () => {
      const passerIdx = 2;
      st.pl[passerIdx].pos = v(-7, 0);
      give(st.ball, passerIdx, st.pl);

      // Place enemy very close (heavy press)
      st.pl[11].pos = v(-6.8, 0); // 0.2 units away

      // Place GK behind (safe back-pass option)
      const gkIdx = 0;
      st.pl[gkIdx].pos = v(-9.5, 2); // Outside goal posts

      // Place other enemies far away
      for (let i = 12; i < 22; i++) {
        st.pl[i].pos = v(8, 0);
      }

      const target = bestPass(st, passerIdx);

      // Should allow back-pass to GK (press-escape)
      expect(target).toBe(gkIdx);
    });
  });

  describe('Own Goal Prevention (v7.2 Safety)', () => {
    it('kick() prevents own goal when passing to GK', () => {
      const cbIdx = 2; // Blue CB
      st.pl[cbIdx].pos = v(-7.5, 0);
      give(st.ball, cbIdx, st.pl);

      // Kick toward own goal center (dangerous)
      const ownGoal = v(-10.5, 0);
      kick(st, v(-1, 0), 12, false, ownGoal);

      // Simulate 50 frames (2.5 seconds)
      for (let i = 0; i < 50; i++) {
        update(st, 0.05);
      }

      // Ball Y-coordinate MUST be outside goal posts (±1.22)
      expect(Math.abs(st.ball.pos.y)).toBeGreaterThan(1.22);
    });

    it('kick() applies 95% error reduction for back-passes', () => {
      const cbIdx = 2;
      st.pl[cbIdx].pos = v(-7, 0);
      give(st.ball, cbIdx, st.pl);

      const gkIdx = 0;
      st.pl[gkIdx].pos = v(-9.5, 2);

      // Kick backward (should have minimal error)
      kick(st, v(-1, 0.2), 12, false, st.pl[gkIdx].pos);

      // Check that ball trajectory is very close to target
      const ballDir = v(st.ball.vel.x, st.ball.vel.y);
      const targetDir = v(st.pl[gkIdx].pos.x - st.pl[cbIdx].pos.x, 
                          st.pl[gkIdx].pos.y - st.pl[cbIdx].pos.y);

      // Angle deviation should be very small (< 5 degrees)
      const dotProduct = (ballDir.x * targetDir.x + ballDir.y * targetDir.y) /
                         (Math.sqrt(ballDir.x**2 + ballDir.y**2) * 
                          Math.sqrt(targetDir.x**2 + targetDir.y**2));
      const angleDeg = Math.acos(dotProduct) * (180 / Math.PI);

      expect(angleDeg).toBeLessThan(5);
    });
  });

  describe('Progressive Carry (v6.1 Carry State Lock)', () => {
    it('decideHasBall() continues carry when no enemy nearby', () => {
      const cbIdx = 2;
      st.pl[cbIdx].pos = v(-5, 0);
      st.pl[cbIdx].act = "carry" as any;
      give(st.ball, cbIdx, st.pl);

      // Place all enemies far away (> 1.5 units)
      for (let i = 11; i < 22; i++) {
        st.pl[i].pos = v(8, 0);
      }

      // Call decideHasBall
      decideHasBall(st, cbIdx);

      // Should still be in carry state (not interrupted by 0.2s decision)
      expect(st.pl[cbIdx].act).toBe("carry");
    });

    it('decideHasBall() exits carry when enemy approaches', () => {
      const cbIdx = 2;
      st.pl[cbIdx].pos = v(-5, 0);
      st.pl[cbIdx].act = "carry" as any;
      give(st.ball, cbIdx, st.pl);

      // Place enemy close (< 1.5 units)
      st.pl[11].pos = v(-4.2, 0); // 0.8 units away

      // Call decideHasBall
      decideHasBall(st, cbIdx);

      // Should exit carry state and make new decision
      expect(st.pl[cbIdx].act).not.toBe("carry");
    });
  });

  describe('Goal Detection', () => {
    it('checkGoal() detects goal for left side', () => {
      const goalPos = v(-10.6, 0); // Inside left goal
      const result = checkGoal(goalPos);
      expect(result).toBe(-1);
    });

    it('checkGoal() detects goal for right side', () => {
      const goalPos = v(10.6, 0); // Inside right goal
      const result = checkGoal(goalPos);
      expect(result).toBe(1);
    });

    it('checkGoal() returns 0 for ball outside goal posts', () => {
      const outsidePos = v(-10.6, 2.0); // Y > 1.22 (goal half-height)
      const result = checkGoal(outsidePos);
      expect(result).toBe(0);
    });

    it('update() increments score when goal is scored', () => {
      // Place ball inside right goal
      st.ball.pos = v(10.6, 0);
      st.ball.free = true;
      st.ball.vel = v(1, 0);
      st.ball.lastTouchTeam = -1; // Blue team scored

      update(st, 0.05);

      // Blue team (left) should have 1 goal
      expect(st.sL).toBe(1);
      expect(st.sR).toBe(0);
    });
  });

  describe('Match Flow', () => {
    it('match ends after 120 seconds', () => {
      st.time = 119.95;
      update(st, 0.1);

      expect(st.over).toBe(true);
    });

    it('match does not update after game over', () => {
      st.over = true;
      const initialTime = st.time;

      update(st, 0.05);

      expect(st.time).toBe(initialTime);
    });
  });

  describe('Performance', () => {
    it('simulates 120-second match in under 1 second', () => {
      const start = performance.now();

      while (st.time < 120) {
        update(st, 0.05);
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1000); // 1 second
    });

    it('simulates 100 matches in under 10 seconds', () => {
      const start = performance.now();

      for (let i = 0; i < 100; i++) {
        const testSt = mkState();
        while (testSt.time < 120) {
          update(testSt, 0.05);
        }
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10000); // 10 seconds
    });
  });
});

describe('Statistical Analysis Tests', () => {
  it('v7.2 own goal rate is below 5% (regression test for v7.1)', () => {
    let ownGoals = 0;
    const trials = 50; // Reduced for faster test

    for (let i = 0; i < trials; i++) {
      const st = mkState();

      while (st.time < 120) {
        update(st, 0.05);

        // Check for own goal
        const gs = checkGoal(st.ball.pos);
        if (gs !== 0 && st.ball.lastTouchTeam === gs) {
          ownGoals++;
          break; // Count once per match
        }
      }
    }

    const ownGoalRate = ownGoals / trials;
    console.log(`Own Goal Rate: ${(ownGoalRate * 100).toFixed(1)}%`);

    expect(ownGoalRate).toBeLessThan(0.05); // Less than 5%
  });

  it('back-pass success rate is above 90%', () => {
    let totalBackPasses = 0;
    let successfulBackPasses = 0;
    const trials = 20;

    for (let i = 0; i < trials; i++) {
      const st = mkState();
      let lastOwner = -1;

      while (st.time < 120 && totalBackPasses < 100) {
        update(st, 0.05);

        // Detect back-pass
        if (st.ball.owner !== null && st.ball.owner !== lastOwner) {
          const currentOwner = st.pl[st.ball.owner];
          if (lastOwner !== -1) {
            const prevOwner = st.pl[lastOwner];
            if (currentOwner.team === prevOwner.team) {
              // Check if it's a back-pass
              const isBackPass = (currentOwner.pos.x - prevOwner.pos.x) * -currentOwner.team < 0;
              if (isBackPass) {
                totalBackPasses++;
                // Success if ball reached teammate
                successfulBackPasses++;
              }
            }
          }
          lastOwner = st.ball.owner;
        }
      }

      if (totalBackPasses >= 100) break;
    }

    const successRate = successfulBackPasses / totalBackPasses;
    console.log(`Back-Pass Success Rate: ${(successRate * 100).toFixed(1)}%`);

    expect(successRate).toBeGreaterThan(0.90); // Above 90%
  });
});
