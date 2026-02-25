# EchoGlow Smoke Tests

## Scope
- Persistence restore (playlist, track index, playback time, shuffle/repeat, volume)
- Clear modal options (clear playlist vs reset app)
- Autosave limits and user feedback

## Manual Checklist
1. Add 3 audio files and start playback of file `#2`.
2. Set volume to `35%`, enable `Shuffle`, disable `Repeat`, seek to ~`00:25`.
3. Refresh page.
4. Verify:
   - playlist is restored,
   - selected track index is restored,
   - playback time is restored (approximately),
   - volume is restored,
   - shuffle/repeat button states are restored.
5. Click `Clear` and choose `Clear Playlist`, then refresh page.
6. Verify playlist is empty and no track is restored.
7. Add files again, then click `Clear` and choose `Reset App`.
8. Refresh page.
9. Verify full reset:
   - no playlist restored,
   - no saved playback state restored,
   - shuffle/repeat reset.
10. Add many files (or duplicates) until limits are exceeded.
11. Verify warning toast appears for:
   - track limit,
   - size limit (if reached),
   - storage/quota save failure (if browser blocks storage).

## Notes
- Autosave limits:
  - max tracks: `500`
  - max persisted size: `350 MB`
- `Saved` toast is throttled (does not spam on every update).
