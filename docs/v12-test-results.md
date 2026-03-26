# v12.0.0 Speed Mode Fix - Test Results

## Browser Test (V.FAST mode)
- Speed: VFAST (confirmed via stRef.current.speed)
- Final Score: BLUE 7 - RED 4 (11 goals total)
- Total Shots: 46
- Match completed normally at 90:00

## Headless Test (20 matches per mode)

| Mode | Goals/match | Shots/match | OnTarget/match | GKSaves/match | Pass% | Frames |
|------|------------|------------|---------------|-------------|-------|--------|
| MID | 18.3 | 63.3 | 50.9 | 38.5 | 77.1% | 38,014 |
| FAST | 21.5 | 66.6 | 54.8 | 38.1 | 77.4% | 15,323 |
| VFAST | 20.1 | 65.2 | 53.9 | 38.8 | 77.2% | 7,636 |

### Deviation from MID baseline
- FAST: Goals 17.8% ✓ | Shots 5.3% ✓ | OnTarget 7.7% ✓
- VFAST: Goals 9.9% ✓ | Shots 3.1% ✓ | OnTarget 5.8% ✓

**ALL MODES WITHIN 30% OF MID BASELINE - PASS**

## Before Fix (for comparison)

| Mode | Goals/match | Shots/match | Ratio vs MID |
|------|------------|------------|-------------|
| MID | 20.4 | 77.8 | 1.0x |
| FAST | 8.6 | 31.8 | 0.42x |
| VFAST | 4.0 | 15.6 | 0.20x |

VFAST was producing 1/5 of MID's goals. Now all modes are equivalent.
