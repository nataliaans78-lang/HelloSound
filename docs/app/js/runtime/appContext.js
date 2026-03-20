import {
  AUDIO_EXTENSIONS,
  EQ_PRESETS,
  EQ_STORAGE_KEY,
  MAX_PERSIST_TOTAL_BYTES,
  MAX_PERSIST_TRACKS,
  PLAYER_STATE_KEY,
  PLAYLIST_DB_NAME,
  PLAYLIST_DB_STORE,
  VISUALIZER_CONSTANTS
} from './appConstants.js';
import { getAppDomRefs } from './domRefs.js';

export function createAppContext() {
  const refs = getAppDomRefs();
  refs.ctx = refs.canvas?.getContext('2d') ?? null;

  const state = {
    analyser: null,
    audioCtx: null,
    audioMetricsWorker: null,
    audioSrc: null,
    audioWorkerEnabled: false,
    audioWorkerFrameTick: 0,
    bassFilter: null,
    clearModalLastFocus: null,
    currentSongObjectUrl: null,
    isAudioCtxInitialized: false,
    isPlaying: false,
    isRepeating: false,
    isShuffling: false,
    lastPersistToastAt: 0,
    lastStatePersistAt: 0,
    midFilter: null,
    open: false,
    playlistDbPromise: null,
    playlistPersistTimer: null,
    reactiveBassLevel: 0,
    songArray: [],
    songIndex: 0,
    songSearchTerm: '',
    startY: 0,
    endY: 0,
    statePersistTimer: null,
    toastRoot: null,
    toastTimer: null,
    trebleFilter: null,
    visualizerAnimationId: null,
    visualizerBufferLength: 0,
    visualizerDataArray: null,
    visualizerFrameTick: 0,
    visualizerLastFrameAt: 0,
    visualizerRunToken: 0
  };

  window.audioMetrics = {
    avgEnergy: 0,
    bassEnergy: 0
  };

  return {
    actions: {},
    constants: {
      AUDIO_EXTENSIONS,
      EQ_PRESETS,
      EQ_STORAGE_KEY,
      MAX_PERSIST_TOTAL_BYTES,
      MAX_PERSIST_TRACKS,
      PLAYER_STATE_KEY,
      PLAYLIST_DB_NAME,
      PLAYLIST_DB_STORE,
      VISUALIZER_CONSTANTS
    },
    refs,
    state
  };
}
