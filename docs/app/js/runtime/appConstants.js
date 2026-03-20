export const ELEMENT_IDS = {
  audio: 'audioA',
  canvas: 'canvasA',
  clearModal: 'clear-modal',
  clearModalCancelBtn: 'clear-modal-cancel',
  clearModalClearBtn: 'clear-modal-clear',
  clearModalFullBtn: 'clear-modal-full',
  controlsToggleBtn: 'controls-toggle-btn',
  controlsToggleIcon: 'controls-toggle-icon',
  currentTime: 'current-time',
  eqBtn: 'eq-btn',
  eqCloseBtn: 'eq-close-btn',
  eqIcon: 'eq-icon',
  eqPanel: 'eq-panel',
  eqPresetSelect: 'eq-preset-select',
  eqResetBtn: 'eq-reset-btn',
  fileUpload: 'fileupload',
  fileUploadContainer: 'fileupload-container',
  nextBtn: 'next-btn',
  playPauseBtn: 'play-pause-btn',
  playPauseIcon: 'play-pause-icon',
  playlistClearBtn: 'playlist-clear-btn',
  playlistDropOverlay: 'playlist-drop-overlay',
  playlistRoot: 'playlist',
  playlistTitle: 'playlist-title',
  playlistTools: 'playlist-tools',
  playlistToolsPanel: 'playlist-tools-panel',
  playlistToolsToggle: 'playlist-tools-toggle',
  prevBtn: 'prev-btn',
  repeatBtn: 'repeat-btn',
  seekBar: 'seek-bar',
  shuffleBtn: 'shuffle-btn',
  songList: 'song-list',
  songListEmpty: 'song-list-empty',
  songSearchInput: 'song-search',
  totalTime: 'total-time',
  uploadBtnMobile: 'upload-btn-mobile',
  visualizerContainer: 'visualizer-container',
  volumeBar: 'volume-bar',
  volumePercentage: 'volume-percentage',
  audioControls: 'audio-controls'
};

export const APP_SELECTORS = {
  clearModalFocusable: 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  eqSliders: '#eq-panel input[data-band]',
  playlistHandle: '.playlist-handle'
};

export const PLAYLIST_DB_NAME = 'helloSound.playlist.v1';
export const PLAYLIST_DB_STORE = 'tracks';
export const PLAYER_STATE_KEY = 'helloSound.playerState.v1';
export const EQ_STORAGE_KEY = 'helloSound.eqState.v1';
export const MAX_PERSIST_TRACKS = 500;
export const MAX_PERSIST_TOTAL_BYTES = 350 * 1024 * 1024;

export const VISUALIZER_CONSTANTS = {
  desktopMaxBars: 132,
  desktopTargetFps: 16,
  mobileMaxBars: 77,
  mobileTargetFps: 20,
  shadowEvery: 7
};

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

export const EQ_PRESETS = {
  custom: null,
  flat: { bass: 0, mid: 0, treble: 0 },
  'bass-boost': { bass: 8, mid: 1, treble: -2 },
  vocal: { bass: -2, mid: 5, treble: 2 },
  'treble-boost': { bass: -3, mid: 1, treble: 7 }
};
