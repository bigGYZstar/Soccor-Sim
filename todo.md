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
