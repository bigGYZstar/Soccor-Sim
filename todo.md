# Foot System Implementation

## Phase 1: Data Model
- [ ] Add Foot interface to types.ts (position, side)
- [ ] Add foot parameters to Player type (dominantFoot, weakFootFreq, weakFootAccuracy)
- [ ] Add foot constants to constants.ts (footOffset, footSize, accuracy decay)

## Phase 2: Engine Logic
- [ ] Calculate foot positions based on player facing direction
- [ ] Update foot positions each frame in update()
- [ ] Determine which foot to use for kicks/dribbles based on ball position
- [ ] Apply accuracy modifier based on foot used (dominant vs weak)
- [ ] Apply accuracy decay based on foot-to-ball distance

## Phase 3: Action Integration
- [ ] Modify kick() to use foot position and accuracy
- [ ] Modify doDribble() to alternate feet or use dominant foot
- [ ] Modify tackle logic to use foot position

## Phase 4: Rendering
- [ ] Draw both feet as small dots on canvas
- [ ] Color-code feet (dominant vs weak)

## Key Invariants (MUST preserve):
- Feet MUST NOT stray far from player body
- Accuracy MUST decrease as foot distance from body increases
- All players start with right foot dominant, weakFootFreq=0, weakFootAccuracy=5/10

# v9.8.0 Pass Circulation Fix

## Root Cause Analysis
- Ball friction 0.92/frame → 14m/s ball only travels 2.68m total → passes never reach targets
- Pass speed too low for short passes (10m/s for 5m → ball dies at 2.5m)
- Receivers don't move toward incoming ball

## Tasks
- [ ] Fix ball ground friction: 0.92 → ~0.985 (realistic grass friction)
- [ ] Fix pass speed: ensure speed is sufficient for ball to reach target + overshoot slightly
- [ ] Add receiver movement: intended receiver should move toward ball when pass is in flight
- [ ] Run pass pair diagnostic to verify self-pass rate < 5%
- [ ] Verify genuine pass rate > 50%
- [ ] Browser visual test
- [ ] Push to GitHub
