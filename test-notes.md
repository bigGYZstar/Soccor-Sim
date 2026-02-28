# Integration Test Notes

## Working
- TopPage shows 3 mode cards: 試合, ガチャ, 編成
- Team Builder page loads correctly with formation display
- Auto-compose fills all 11 blue slots from collection
- Gacha opens packs and collection count persists (20 cards after 2x 10-pull)
- Custom match mode (/match?mode=custom) starts game with player names displayed
- Blue team players show Japanese names below sprites (e.g., フレッジ, ルベン)
- Regular match mode (/match) still works normally

## Issues Found
- Quick Match button navigates to /match (no custom mode) - this is correct behavior
- KICK OFF requires both teams to be 11/11 - need to test with both teams filled
- Red team has no cards assigned (shows as regular players without names) - expected since we only set blue team

## Next Steps
- The integration is working correctly
- Player names from gacha cards appear on the pitch
- Card stats affect foot params (ball control, dominant foot)
