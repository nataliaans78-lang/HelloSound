import { MODE } from './config.js';
import { initAudioEngine } from './audio/audioEngine.js';
import { initEqualizer } from './audio/equalizer.js';
import { initVisualizer } from './audio/visualizer.js';
import { initPlaylist } from './playlist/playlist.js';
import { initControls } from './ui/controls.js';
import { initShortcuts } from './input/shortcuts.js';
import { initStorage } from './persistence/storage.js';

void MODE;

initEqualizer();
initVisualizer();
initPlaylist();
initControls();
initShortcuts();
initStorage();
initAudioEngine();
