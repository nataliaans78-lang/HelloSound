import { initAudioEngine } from '../audio/audioEngine.js';
import { initEqualizer } from '../audio/equalizer.js';
import { initVisualizer } from '../audio/visualizer.js';
import { initShortcuts } from '../input/shortcuts.js';
import { initStorage } from '../persistence/storage.js';
import { initPlaylist } from '../playlist/playlist.js';
import { initControls } from '../ui/controls.js';
import { createAppContext } from './appContext.js';

export function initAppRuntime() {
  const context = createAppContext();

  initControls(context);
  initVisualizer(context);
  initStorage(context);
  initEqualizer(context);
  initPlaylist(context);
  initAudioEngine(context);
  initShortcuts(context);

  context.actions.updateSearchClearBtn?.();
  context.actions.setPlaylistToolsOpen?.(false);
  context.actions.syncPlaylistToolsPanelBounds?.();
  context.actions.syncRangeVisuals?.();

  context.actions.restorePersistentState?.().catch(() => {
    context.actions.renderSongList?.();
    context.actions.updatePlaylistState?.();
    context.actions.updatePlayPauseBtn?.();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      context.actions.scheduleStatePersist?.({ immediate: true });
    }
  });

  window.addEventListener('beforeunload', () => {
    context.actions.scheduleStatePersist?.({ immediate: true });
  });
}
