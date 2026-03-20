export function initShortcuts(context) {
  const {
    refs: { playlistTools, songSearchInput, volumeBar }
  } = context;

  document.addEventListener('keydown', event => {
    if (context.actions.isTypingTarget?.(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case ' ':
        event.preventDefault();
        context.actions.togglePlayPause?.();
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) context.actions.seekBy?.(5);
        else context.actions.playNext?.();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) context.actions.seekBy?.(-5);
        else context.actions.playPrev?.();
        break;
      case 'ArrowUp':
        event.preventDefault();
        context.actions.setVolume?.(Number(volumeBar.value) + 5);
        break;
      case 'ArrowDown':
        event.preventDefault();
        context.actions.setVolume?.(Number(volumeBar.value) - 5);
        break;
      case 's':
      case 'S':
        context.actions.toggleShuffle?.();
        break;
      case 'r':
      case 'R':
        context.actions.toggleRepeat?.();
        break;
      case '/':
        if (songSearchInput) {
          event.preventDefault();
          context.actions.setPlaylistToolsOpen?.(true, { focusInput: true });
        }
        break;
      case 'Escape':
        if (playlistTools?.classList.contains('open')) {
          event.preventDefault();
          context.actions.setPlaylistToolsOpen?.(false, { returnFocus: true });
        } else if (context.state.songSearchTerm) {
          context.state.songSearchTerm = '';
          if (songSearchInput) songSearchInput.value = '';
          context.actions.updateSearchClearBtn?.();
          context.actions.renderSongList?.();
        }
        break;
      default:
        break;
    }
  });
}
