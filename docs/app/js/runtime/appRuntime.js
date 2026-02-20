export function initAppRuntime() {
/* ===== DOM Refs ===== */
const canvas = document.getElementById('canvasA');
const ctx = canvas.getContext('2d');
const visualizerContainer = document.getElementById('visualizer-container');
const fileUpload = document.getElementById('fileupload');
const uploadBtnMobile = document.getElementById('upload-btn-mobile');
const songList = document.getElementById('song-list');
const audioA = document.getElementById('audioA');
const seekBar = document.getElementById('seek-bar');
const volumeBar = document.getElementById('volume-bar');
const playPauseBtn = document.getElementById('play-pause-btn');
const playPauseIcon = document.getElementById('play-pause-icon');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const shuffleBtn = document.getElementById('shuffle-btn');
const repeatBtn = document.getElementById('repeat-btn');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const volumePercentage = document.getElementById('volume-percentage');
const animatedText = document.getElementById('playlist-title');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const controlsToggleIcon = document.getElementById('controls-toggle-icon');
const playlistClearBtn = document.getElementById('playlist-clear-btn');
const playlistTools = document.getElementById('playlist-tools');
const playlistToolsToggle = document.getElementById('playlist-tools-toggle');
const playlistToolsPanel = document.getElementById('playlist-tools-panel');
const songSearchInput = document.getElementById('song-search');
const songSearchClear = document.getElementById('song-search-clear');
const songListEmpty = document.getElementById('song-list-empty');
const playlistRoot = document.getElementById('playlist');
const clearModal = document.getElementById('clear-modal');
const clearModalClearBtn = document.getElementById('clear-modal-clear');
const clearModalFullBtn = document.getElementById('clear-modal-full');
const clearModalCancelBtn = document.getElementById('clear-modal-cancel');

let audioCtx, audioSrc, analyser;
let isPlaying=false,isShuffling=false,isRepeating=false;
let songIndex=0;
let songArray=[];
let isAudioCtxInitialized=false;
let visualizerAnimationId = null;
let visualizerRunToken = 0;
let visualizerDataArray = null;
let visualizerBufferLength = 0;
let visualizerFrameTick = 0;
let cachedCenterGlow = null;
let cachedCenterGlowKey = '';
let audioMetricsWorker = null;
let audioWorkerEnabled = false;
let audioWorkerFrameTick = 0;
let currentSongObjectUrl = null;
let songSearchTerm = '';
let playlistDbPromise = null;
let playlistPersistTimer = null;
let statePersistTimer = null;
let lastStatePersistAt = 0;
let lastPersistToastAt = 0;
let toastRoot = null;
let toastTimer = null;
let clearModalLastFocus = null;
let visualizerLastFrameAt = 0;
const VISUALIZER_TARGET_FPS = 18;
const VISUALIZER_MOBILE_MAX_BARS = 100;
const VISUALIZER_DESKTOP_MAX_BARS = 160;
const VISUALIZER_SHADOW_EVERY = 7;

window.audioMetrics = {
    avgEnergy: 0,
    bassEnergy: 0
};

function computeAudioMetricsLocal(dataArray) {
    if (!dataArray?.length) {
        return { avgEnergy: 0, bassEnergy: 0 };
    }

    const length = dataArray.length;
    let total = 0;
    for (let i = 0; i < length; i += 1) {
        total += dataArray[i];
    }

    const bassBins = Math.min(1020, length);
    let bassTotal = 0;
    for (let i = 0; i < bassBins; i += 1) {
        bassTotal += dataArray[i];
    }

    return {
        avgEnergy: total / length,
        bassEnergy: bassTotal / bassBins
    };
}

function initAudioMetricsWorker() {
    if (audioWorkerEnabled || audioMetricsWorker !== null) return;
    if (typeof Worker === 'undefined') return;

    try {
        audioMetricsWorker = new Worker('../../audioWorker.js');
        audioWorkerEnabled = true;
        audioMetricsWorker.onmessage = (event) => {
            const next = event.data;
            if (!next) return;
            window.audioMetrics = {
                avgEnergy: Number(next.avgEnergy) || 0,
                bassEnergy: Number(next.bassEnergy) || 0
            };
        };
        audioMetricsWorker.onerror = () => {
            audioWorkerEnabled = false;
            if (audioMetricsWorker) {
                audioMetricsWorker.terminate();
                audioMetricsWorker = null;
            }
        };
    } catch (_) {
        audioWorkerEnabled = false;
        audioMetricsWorker = null;
    }
}

const PLAYLIST_DB_NAME = 'helloSound.playlist.v1';
const PLAYLIST_DB_STORE = 'tracks';
const PLAYER_STATE_KEY = 'helloSound.playerState.v1';
const MAX_PERSIST_TRACKS = 500;
const MAX_PERSIST_TOTAL_BYTES = 350 * 1024 * 1024;

/* ===== Persistence ===== */

function openPlaylistDb() {
    if (playlistDbPromise) return playlistDbPromise;

    playlistDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(PLAYLIST_DB_NAME, 1);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PLAYLIST_DB_STORE)) {
                db.createObjectStore(PLAYLIST_DB_STORE, { keyPath: 'order' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return playlistDbPromise;
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getPlaylistTotalBytes(files = songArray) {
    return files.reduce((sum, file) => sum + (file?.size || 0), 0);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded} ${units[unitIndex]}`;
}

function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    const root = document.createElement('div');
    root.id = 'app-toast';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    document.body.appendChild(root);
    toastRoot = root;
    return root;
}

function showToast(message, { type = 'info', duration = 2200 } = {}) {
    const root = ensureToastRoot();
    root.className = '';
    root.textContent = message;
    root.classList.add('show', `toast-${type}`);

    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
        root.classList.remove('show');
    }, duration);
}

function handlePersistError(error) {
    const message = String(error?.message || '');
    if (message === 'persist-limit-tracks') {
        showToast(`Autosave limit: max ${MAX_PERSIST_TRACKS} tracks.`, { type: 'warn', duration: 3200 });
        return;
    }
    if (message === 'persist-limit-size') {
        showToast(`Autosave limit: max ${formatBytes(MAX_PERSIST_TOTAL_BYTES)} total size.`, { type: 'warn', duration: 3200 });
        return;
    }
    if (error?.name === 'QuotaExceededError') {
        showToast('Storage full: could not save playlist.', { type: 'warn', duration: 3200 });
        return;
    }
    showToast('Could not save player state.', { type: 'warn' });
}

async function savePlaylistToDb() {
    if (songArray.length > MAX_PERSIST_TRACKS) {
        throw new Error('persist-limit-tracks');
    }
    if (getPlaylistTotalBytes(songArray) > MAX_PERSIST_TOTAL_BYTES) {
        throw new Error('persist-limit-size');
    }

    const db = await openPlaylistDb();
    const transaction = db.transaction(PLAYLIST_DB_STORE, 'readwrite');
    const store = transaction.objectStore(PLAYLIST_DB_STORE);

    await requestToPromise(store.clear());

    for (let i = 0; i < songArray.length; i += 1) {
        const track = songArray[i];
        await requestToPromise(store.put({
            order: i,
            name: track.name,
            type: track.type || 'audio/*',
            lastModified: track.lastModified || Date.now(),
            data: track
        }));
    }

    await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

async function loadPlaylistFromDb() {
    try {
        const db = await openPlaylistDb();
        const transaction = db.transaction(PLAYLIST_DB_STORE, 'readonly');
        const store = transaction.objectStore(PLAYLIST_DB_STORE);
        const rows = await requestToPromise(store.getAll());

        return rows
            .sort((a, b) => a.order - b.order)
            .map(row => new File([row.data], row.name, {
                type: row.type || 'audio/*',
                lastModified: row.lastModified || Date.now()
            }));
    } catch (_) {
        return [];
    }
}

async function clearPersistedStorage() {
    try {
        const db = await openPlaylistDb();
        const transaction = db.transaction(PLAYLIST_DB_STORE, 'readwrite');
        const store = transaction.objectStore(PLAYLIST_DB_STORE);
        await requestToPromise(store.clear());
        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } catch (_) {
        // ignore IndexedDB cleanup errors
    }

    try {
        localStorage.removeItem(PLAYER_STATE_KEY);
    } catch (_) {
        // ignore localStorage cleanup errors
    }
}

function getPlayerStatePayload() {
    return {
        songIndex,
        currentTime: Number.isFinite(audioA.currentTime) ? audioA.currentTime : 0,
        isShuffling,
        isRepeating,
        volume: Math.round((audioA.volume ?? 1) * 100)
    };
}

function savePlayerState() {
    try {
        localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(getPlayerStatePayload()));
    } catch (_) {
        // ignore localStorage write errors
    }
}

function loadPlayerState() {
    try {
        const raw = localStorage.getItem(PLAYER_STATE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function schedulePlaylistPersist({ immediate = false } = {}) {
    if (playlistPersistTimer) {
        clearTimeout(playlistPersistTimer);
    }

    const persist = () => {
        savePlaylistToDb()
            .then(() => {
                const now = Date.now();
                if (now - lastPersistToastAt > 7000) {
                    showToast('Saved', { type: 'success', duration: 1200 });
                    lastPersistToastAt = now;
                }
            })
            .catch(handlePersistError);
        playlistPersistTimer = null;
    };

    if (immediate) {
        persist();
    } else {
        playlistPersistTimer = setTimeout(persist, 220);
    }
}

function scheduleStatePersist({ immediate = false } = {}) {
    const now = Date.now();
    if (!immediate && now - lastStatePersistAt < 450) return;

    if (statePersistTimer) {
        clearTimeout(statePersistTimer);
    }

    const persist = () => {
        savePlayerState();
        lastStatePersistAt = Date.now();
        statePersistTimer = null;
    };

    if (immediate) {
        persist();
    } else {
        statePersistTimer = setTimeout(persist, 120);
    }
}

function applyPlayerState(state) {
    if (!state) return;

    const nextVolume = Number(state.volume);
    if (Number.isFinite(nextVolume)) {
        setVolume(nextVolume);
    }

    isShuffling = Boolean(state.isShuffling);
    isRepeating = Boolean(state.isRepeating);

    if (isShuffling && isRepeating) {
        isShuffling = false;
    }

    shuffleBtn.classList.toggle('active', isShuffling);
    repeatBtn.classList.toggle('active', isRepeating);
    audioA.loop = isRepeating;
}

function restoreCurrentTrackSource(state) {
    if (!songArray.length) return;

    const savedIndex = Number.isInteger(state?.songIndex) ? state.songIndex : 0;
    songIndex = Math.max(0, Math.min(songArray.length - 1, savedIndex));

    if (currentSongObjectUrl) {
        URL.revokeObjectURL(currentSongObjectUrl);
    }

    currentSongObjectUrl = URL.createObjectURL(songArray[songIndex]);
    audioA.src = currentSongObjectUrl;
    audioA.load();
    updateActiveSong();

    const savedTime = Number(state?.currentTime);
    if (Number.isFinite(savedTime) && savedTime > 0) {
        audioA.addEventListener('loadedmetadata', () => {
            const boundedTime = Math.max(0, Math.min(savedTime, audioA.duration || savedTime));
            audioA.currentTime = boundedTime;
            currentTimeEl.textContent = formatTime(boundedTime);
        }, { once: true });
    }
}

async function restorePersistentState() {
    const [files, state] = await Promise.all([
        loadPlaylistFromDb(),
        Promise.resolve(loadPlayerState())
    ]);

    if (files.length) {
        songArray = files;
    }

    renderSongList();
    updatePlaylistState();
    applyPlayerState(state);

    if (songArray.length) {
        restoreCurrentTrackSource(state);
        showToast(`Restored ${songArray.length} track${songArray.length === 1 ? '' : 's'}.`, { type: 'success', duration: 1700 });
    }

    updatePlayPauseBtn();
}
let reactiveBassLevel = 0;

// --- Arc text layout ---
function buildArcTitle() {
  const text = animatedText.textContent.trim();
  animatedText.textContent='';

  const isMobile = window.innerWidth <= 768;
  const radius = isMobile ? 120 : 180;
  const startAngle = isMobile ? -25 : -35;
  const endAngle = isMobile ? 25 : 35;
  const letters = text.length;
  const angleStep = (endAngle - startAngle) / Math.max(letters - 1, 1);
  const colors=['hsl(0,100%,63%)','hsl(30,100%,65%)','hsl(50,100%,65%)','hsl(160,100%,65%)','hsl(200,100%,65%)','hsl(260,100%,65%)','hsl(320,100%,65%)','hsl(0,100%,63%)'];
  const pIndex = text.indexOf('P');
  const yIndex = text.indexOf('y');
  const tIndex = text.lastIndexOf('t');

  text.split('').forEach((letter,index)=>{
      const span = document.createElement('span');
      span.textContent = letter;
      const angle = startAngle+index*angleStep;
      const rad = angle*Math.PI/180;
      const x = radius*Math.sin(rad);
      const y = radius*(1-Math.cos(rad));
      span.style.left = `calc(50% + ${x}px)`;
      span.style.top = `${y}px`;
      span.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      if (index === pIndex || index === tIndex) {
          span.style.color = 'hsl(0,100%,63%)';
      } else if (index === yIndex) {
          span.style.color = 'hsl(160,100%,65%)';
      } else {
          span.style.color = colors[index%colors.length];
      }
      animatedText.appendChild(span);
  });
}

buildArcTitle();
window.addEventListener('resize', buildArcTitle);

// --- Audio ---
let bassFilter, midFilter, trebleFilter;

function initAudioCtx() {
  if (isAudioCtxInitialized) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioSrc = audioCtx.createMediaElementSource(audioA);

  // EQ filters
  bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 200;
  bassFilter.gain.value = 0;

  midFilter = audioCtx.createBiquadFilter();
  midFilter.type = 'peaking';
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 1;
  midFilter.gain.value = 0;

  trebleFilter = audioCtx.createBiquadFilter();
  trebleFilter.type = 'highshelf';
  trebleFilter.frequency.value = 3000;
  trebleFilter.gain.value = 0;

  const currentSettings = getCurrentEQSettings();
  bassFilter.gain.value = currentSettings.bass;
  midFilter.gain.value = currentSettings.mid;
  trebleFilter.gain.value = currentSettings.treble;

  analyser = audioCtx.createAnalyser();
  if (window.innerWidth <= 768) {
    analyser.fftSize = 512;
  } else {
    analyser.fftSize = 512;
  }
  initAudioMetricsWorker();

  // Audio chain
  audioSrc
    .connect(bassFilter)
    .connect(midFilter)
    .connect(trebleFilter)
    .connect(analyser)
    .connect(audioCtx.destination);

  isAudioCtxInitialized = true;
}

const eqBtn = document.getElementById('eq-btn');
const eqPanel = document.getElementById('eq-panel');
const eqIcon = document.getElementById('eq-icon');
const eqCloseBtn = document.getElementById('eq-close-btn');
const eqPresetSelect = document.getElementById('eq-preset-select');
const eqResetBtn = document.getElementById('eq-reset-btn');
const eqSliders = [...document.querySelectorAll('#eq-panel input[data-band]')];
const audioControls = document.getElementById('audio-controls');

const EQ_STORAGE_KEY = 'helloSound.eqState.v1';
const EQ_PRESETS = {
  custom: null,
  flat: { bass: 0, mid: 0, treble: 0 },
  'bass-boost': { bass: 8, mid: 1, treble: -2 },
  vocal: { bass: -2, mid: 5, treble: 2 },
  'treble-boost': { bass: -3, mid: 1, treble: 7 }
};

function getCurrentEQSettings() {
  return {
    bass: parseFloat(eqSliders.find(s => s.dataset.band === 'bass')?.value ?? '0'),
    mid: parseFloat(eqSliders.find(s => s.dataset.band === 'mid')?.value ?? '0'),
    treble: parseFloat(eqSliders.find(s => s.dataset.band === 'treble')?.value ?? '0')
  };
}

function saveEQState(preset = 'custom') {
  const payload = {
    preset,
    settings: getCurrentEQSettings()
  };

  localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(payload));
}

function applyEQSettings(settings, { save = true, preset = 'custom' } = {}) {
  eqSliders.forEach(slider => {
    const band = slider.dataset.band;
    const nextValue = settings[band] ?? 0;
    slider.value = String(nextValue);

    if (bassFilter && midFilter && trebleFilter) {
      if (band === 'bass') bassFilter.gain.value = nextValue;
      if (band === 'mid') midFilter.gain.value = nextValue;
      if (band === 'treble') trebleFilter.gain.value = nextValue;
    }
  });

  if (eqPresetSelect) {
    eqPresetSelect.value = EQ_PRESETS[preset] ? preset : 'custom';
  }

  if (save) {
    saveEQState(EQ_PRESETS[preset] ? preset : 'custom');
  }
}

function loadEQState() {
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.settings) return;

    applyEQSettings(parsed.settings, { save: false, preset: parsed.preset ?? 'custom' });
  } catch (_) {
    // ignore invalid localStorage payload
  }
}

eqSliders.forEach(slider => {
  slider.addEventListener('input', e => {
    if (!isAudioCtxInitialized) {
      initAudioCtx();
    }

    if (!bassFilter || !midFilter || !trebleFilter) {
      return;
    }

    const value = parseFloat(e.target.value);
    const band = e.target.dataset.band;

    if (band === 'bass') bassFilter.gain.value = value;
    if (band === 'mid') midFilter.gain.value = value;
    if (band === 'treble') trebleFilter.gain.value = value;

    if (eqPresetSelect) {
      eqPresetSelect.value = 'custom';
    }

    saveEQState('custom');
  });
});

eqPresetSelect?.addEventListener('change', e => {
  const preset = e.target.value;
  const presetValues = EQ_PRESETS[preset];

  if (!presetValues) {
    saveEQState('custom');
    return;
  }

  applyEQSettings(presetValues, { preset });
});

eqResetBtn?.addEventListener('click', () => {
  applyEQSettings(EQ_PRESETS.flat, { preset: 'flat' });
});

loadEQState();

function updateMobilePlaylistPush() {
  const isEqOpen = audioControls.classList.contains('eq-open');
  const isMobile = window.innerWidth <= 768;

  if (!isEqOpen || !isMobile) {
    document.body.style.setProperty('--eq-mobile-push', '0px');
    return;
  }

  const eqHeight = eqPanel.getBoundingClientRect().height || 0;
  const pushValue = Math.min(eqHeight * 0.22, window.innerHeight * 0.14);
  document.body.style.setProperty('--eq-mobile-push', `${Math.max(0, Math.round(pushValue))}px`);
}

function syncEQMobileLayout() {
  const isEqOpen = audioControls.classList.contains('eq-open');
  const shouldCompactPlaylist = isEqOpen && window.innerWidth <= 768;

  document.body.classList.toggle('eq-mobile-open', shouldCompactPlaylist);
  updateMobilePlaylistPush();
}

function setEQState(isOpen) {
  audioControls.classList.toggle('eq-open', isOpen);
  eqPanel.classList.toggle('open', isOpen);
  eqBtn.classList.toggle('active', isOpen);

  syncEQMobileLayout();

  requestAnimationFrame(() => {
    updateMobilePlaylistPush();
  });

  if (eqIcon) {
    eqIcon.src = isOpen ? 'icons/return.svg' : 'icons/eq.svg';
    eqIcon.alt = isOpen ? 'Close EQ' : 'EQ';
  }

  eqBtn.setAttribute('aria-label', isOpen ? 'Close equalizer' : 'Open equalizer');
}

function setControlsHidden(isHidden) {
  if (isHidden) {
    setEQState(false);
  }

  document.body.classList.toggle('controls-hidden', isHidden);

  if (controlsToggleIcon) {
    controlsToggleIcon.src = isHidden ? 'icons/up.svg' : 'icons/down.svg';
    controlsToggleIcon.alt = isHidden ? 'Show controls' : 'Hide controls';
  }

  if (controlsToggleBtn) {
    controlsToggleBtn.setAttribute('aria-label', isHidden ? 'Show control bar' : 'Hide control bar');
  }
}

controlsToggleBtn?.addEventListener('click', () => {
  const isHidden = !document.body.classList.contains('controls-hidden');
  setControlsHidden(isHidden);
});

// EQ toggle with a single button (icon switches to close)
eqBtn.addEventListener('click', () => {
  const isOpen = !audioControls.classList.contains('eq-open');
  setEQState(isOpen);
});

eqCloseBtn?.addEventListener('click', () => {
  setEQState(false);
});
function resizeCanvas(){
    canvas.width=visualizerContainer.clientWidth;canvas.height=visualizerContainer.clientHeight;
}
resizeCanvas();
window.addEventListener('resize',resizeCanvas);
window.addEventListener('resize', syncEQMobileLayout);
syncEQMobileLayout();

function startVisualizer(){
    if (!analyser) return;

    visualizerRunToken += 1;
    const runToken = visualizerRunToken;

    if (visualizerAnimationId !== null) {
        cancelAnimationFrame(visualizerAnimationId);
    }

    const bufferLength = analyser.frequencyBinCount;
    if (!visualizerDataArray || visualizerBufferLength !== bufferLength) {
        visualizerDataArray = new Uint8Array(bufferLength);
        visualizerBufferLength = bufferLength;
    }

    function animate(timestamp){
        if (runToken !== visualizerRunToken) return;
        const frameInterval = 1000 / VISUALIZER_TARGET_FPS;
        if (timestamp && timestamp - visualizerLastFrameAt < frameInterval) {
            visualizerAnimationId = requestAnimationFrame(animate);
            return;
        }
        visualizerLastFrameAt = timestamp || performance.now();
        ctx.clearRect(0,0,canvas.width,canvas.height);
        analyser.getByteFrequencyData(visualizerDataArray);

        if (audioWorkerEnabled && audioMetricsWorker) {
            audioWorkerFrameTick = (audioWorkerFrameTick + 1) % 3;
            if (audioWorkerFrameTick === 0) {
                const workerBuffer = new Uint8Array(visualizerDataArray);
                audioMetricsWorker.postMessage({ frequencyData: workerBuffer }, [workerBuffer.buffer]);
            }
        } else {
            window.audioMetrics = computeAudioMetricsLocal(visualizerDataArray);
        }

        updateReactiveBackground(visualizerDataArray);
        drawVisualizer(bufferLength, visualizerDataArray);
        visualizerAnimationId = requestAnimationFrame(animate);
    }

    animate();
}

function updateReactiveBackground(dataArray) {
    if (!dataArray?.length) return;

    const bassBins = Math.min(20, dataArray.length);
    let bassSum = 0;
    for (let i = 0; i < bassBins; i += 1) {
        bassSum += dataArray[i];
    }

    const bassNormalized = (bassSum / bassBins) / 255;
    reactiveBassLevel = reactiveBassLevel * 0.86 + bassNormalized * 0.14;

    const bassLevel = Math.min(1, reactiveBassLevel * 1.45);
    const bloomLevel = Math.min(1, reactiveBassLevel * 1.2);

    document.documentElement.style.setProperty('--reactive-bass', bassLevel.toFixed(3));
    document.documentElement.style.setProperty('--reactive-bloom', bloomLevel.toFixed(3));
}

function drawVisualizer(bufferLength, dataArray) {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const avgEnergy = Math.max(0, Math.min(1, (window.audioMetrics?.avgEnergy || 0) / 255));
    visualizerFrameTick += 1;

    // Subtle neon bloom in the center (cache gradient; draw every fifth frame).
    if (visualizerFrameTick % 5 === 0) {
        const glowRadius = Math.min(canvas.width, canvas.height) * (0.128 + avgEnergy * 0.053);
        const glowKey = `${canvas.width}x${canvas.height}`;
        if (!cachedCenterGlow || cachedCenterGlowKey !== glowKey) {
            cachedCenterGlowKey = glowKey;
            cachedCenterGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        }
        const glow = cachedCenterGlow;
        glow.addColorStop(0, `rgba(0, 220, 255, ${0.15 + avgEnergy * 0.105})`);
        glow.addColorStop(0.6, `rgba(255, 0, 200, ${0.098 + avgEnergy * 0.075})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const tailStart = Math.floor(bufferLength * 0.9);
    let tailMax = 0;
    for (let i = tailStart; i < bufferLength; i += 1) {
        if (dataArray[i] > tailMax) tailMax = dataArray[i];
    }
    const tailThreshold = tailMax * 0.9;

    for (let i = 0; i < bufferLength; i += 1) {
        const barHeight = dataArray[i];
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(i + 4.184);

        const hue = (i * 5 + 190) % 360;
        const lightness = Math.min(70, 38 + barHeight * 0.32);
        const isTailHighlight = i >= tailStart && barHeight >= tailThreshold && tailMax > 0;
        ctx.strokeStyle = isTailHighlight ? 'rgba(255, 255, 255, 1)' : `hsl(${hue}, 100%, ${lightness}%)`;
        if (i % VISUALIZER_SHADOW_EVERY === 0) {
            ctx.shadowBlur = 30;
            ctx.shadowColor = isTailHighlight ? 'rgba(255, 255, 255, 0.65)' : `hsla(${hue}, 100%, 60%, 0.5)`;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, barHeight);
        ctx.arc(0, barHeight + barHeight / 2, barHeight / 10, 0, Math.PI * 2);
        ctx.stroke();

        if (i % VISUALIZER_SHADOW_EVERY === 0) {
            ctx.lineWidth = 3.1;
            ctx.shadowBlur = 0;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = isTailHighlight ? 'rgba(255, 255, 255, 0.4)' : `hsla(${hue}, 100%, 70%, 0.85)`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, barHeight);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function resetVisualizerState() {
    canvas.width = canvas.width;
    canvas.height = canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; // im mniejsze tym dĹ‚uĹĽszy â€śogonâ€ť (np 0.10â€“0.25)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    reactiveBassLevel = 0;
    document.documentElement.style.setProperty('--reactive-bass', '0');
    document.documentElement.style.setProperty('--reactive-bloom', '0');
}

function stopVisualizer() {
    visualizerRunToken += 1;
    if (visualizerAnimationId !== null) {
        cancelAnimationFrame(visualizerAnimationId);
    }
    visualizerAnimationId = null;
    visualizerLastFrameAt = 0;
    resetVisualizerState();
}

// --- Adding files ---
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

function isAudioFile(file) {
    if (!file) return false;
    if (file.type?.startsWith('audio/')) return true;

    const lowerName = file.name.toLowerCase();
    return AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

function normalizeText(value) {
    return value.trim().toLowerCase();
}

function updateSearchClearBtn() {
    if (!songSearchClear) return;
    const isOpen = playlistTools?.classList.contains('open');
    songSearchClear.classList.toggle('active', Boolean(isOpen));
    songSearchClear.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    playlistToolsToggle?.classList.toggle('active', Boolean(isOpen));
}

function syncPlaylistToolsPanelBounds() {
    if (!playlistRoot || !playlistTools || !playlistToolsPanel) return;

    if (window.innerWidth <= 768) {
        playlistRoot.style.removeProperty('--playlist-search-panel-max-width');
        return;
    }

    const playlistRect = playlistRoot.getBoundingClientRect();
    const toggleRect = playlistTools.getBoundingClientRect();
    const sidePadding = 12;
    const maxWidth = Math.max(180, Math.floor(toggleRect.right - playlistRect.left - sidePadding));
    playlistRoot.style.setProperty('--playlist-search-panel-max-width', `${maxWidth}px`);
}

function setPlaylistToolsOpen(isOpen, { focusInput = false, returnFocus = false } = {}) {
    if (!playlistTools || !playlistToolsPanel || !playlistToolsToggle) return;
    if (isOpen && !playlistRoot?.classList.contains('has-songs')) return;
    if (isOpen) {
        syncPlaylistToolsPanelBounds();
    }

    playlistTools.classList.toggle('open', isOpen);
    playlistToolsPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    playlistToolsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    playlistToolsToggle.setAttribute('aria-label', isOpen ? 'Close search panel' : 'Open search panel');
    updateSearchClearBtn();

    if (isOpen && focusInput && songSearchInput) {
        requestAnimationFrame(() => {
            songSearchInput.focus();
            songSearchInput.select();
        });
    }

    if (!isOpen && returnFocus) {
        playlistToolsToggle.focus();
    }
}

function getFilteredEntries() {
    const term = normalizeText(songSearchTerm);
    const entries = songArray.map((file, index) => ({ file, index }));
    if (!term) return entries;
    return entries.filter(entry => entry.file.name.toLowerCase().includes(term));
}

function stopPlaybackAndReset() {
    if (currentSongObjectUrl) {
        URL.revokeObjectURL(currentSongObjectUrl);
        currentSongObjectUrl = null;
    }

    stopVisualizer();

    audioA.pause();
    audioA.removeAttribute('src');
    audioA.load();
    isPlaying = false;
    songIndex = 0;
    updatePlayPauseBtn();
}

function clearPlaylist() {
    songArray = [];
    stopPlaybackAndReset();
    renderSongList();
    updatePlaylistState();
    schedulePlaylistPersist({ immediate: true });
    scheduleStatePersist({ immediate: true });
}

function getClearModalFocusable() {
  if (!clearModal) return [];
  return Array.from(clearModal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

function handleClearModalKeydown(event) {
  if (!clearModal?.classList.contains('open')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeClearModal();
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = getClearModalFocusable();
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !clearModal.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

function openClearModal() {
  if (!clearModal) return;
  clearModalLastFocus = document.activeElement;
  clearModal.classList.add('open');
  clearModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', handleClearModalKeydown);

  requestAnimationFrame(() => {
    clearModalClearBtn?.focus();
  });
}

function closeClearModal({ returnFocus = true } = {}) {
  if (!clearModal) return;

  let nextFocus = null;
  if (returnFocus) {
    if (playlistClearBtn && !playlistClearBtn.hidden) {
      nextFocus = playlistClearBtn;
    } else if (controlsToggleBtn) {
      nextFocus = controlsToggleBtn;
    } else if (playlistToolsToggle) {
      nextFocus = playlistToolsToggle;
    }
  } else if (clearModalLastFocus instanceof HTMLElement && document.contains(clearModalLastFocus)) {
    nextFocus = clearModalLastFocus;
  }

  if (nextFocus) {
    nextFocus.focus({ preventScroll: true });
  } else if (document.activeElement && clearModal.contains(document.activeElement)) {
    document.body.focus?.();
  }

  clearModal.classList.remove('open');
  clearModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', handleClearModalKeydown);
}

function handleClearPlaylist() {
  clearPlaylist();
  closeClearModal();
}

async function handleFullReset() {
  await clearPersistedStorage();
  try {
    localStorage.removeItem(EQ_STORAGE_KEY);
  } catch (_) {
    // ignore localStorage cleanup errors
  }

  isShuffling = false;
  isRepeating = false;
  shuffleBtn.classList.remove('active');
  repeatBtn.classList.remove('active');
  audioA.loop = false;
  setVolume(100);

  songSearchTerm = '';
  if (songSearchInput) {
    songSearchInput.value = '';
  }
  setPlaylistToolsOpen(false);
  updateSearchClearBtn();

  if (seekBar) seekBar.value = 0;
  if (currentTimeEl) currentTimeEl.textContent = '0:00';
  if (totalTimeEl) totalTimeEl.textContent = '0:00';

  clearPlaylist();

  if (statePersistTimer) {
    clearTimeout(statePersistTimer);
    statePersistTimer = null;
  }
  try {
    localStorage.removeItem(PLAYER_STATE_KEY);
  } catch (_) {
    // ignore localStorage cleanup errors
  }

  showToast('Reset App done.', { type: 'success', duration: 1800 });
  closeClearModal();
}

function addSongs(files) {
    const validFiles = files.filter(isAudioFile);
    if (!validFiles.length) return;

    const freeSlots = Math.max(0, MAX_PERSIST_TRACKS - songArray.length);
    let acceptedByCount = validFiles.slice(0, freeSlots);
    const skippedByCount = validFiles.length - acceptedByCount.length;

    let projectedBytes = getPlaylistTotalBytes(songArray);
    const accepted = [];
    let skippedBySize = 0;
    for (const file of acceptedByCount) {
        const nextBytes = projectedBytes + (file.size || 0);
        if (nextBytes <= MAX_PERSIST_TOTAL_BYTES) {
            accepted.push(file);
            projectedBytes = nextBytes;
        } else {
            skippedBySize += 1;
        }
    }

    if (!accepted.length) {
        if (skippedByCount > 0) {
            showToast(`Limit reached: max ${MAX_PERSIST_TRACKS} tracks.`, { type: 'warn', duration: 2600 });
        } else {
            showToast(`Limit reached: max ${formatBytes(MAX_PERSIST_TOTAL_BYTES)} total size.`, { type: 'warn', duration: 2600 });
        }
        return;
    }

    if (skippedByCount > 0 || skippedBySize > 0) {
        let msg = '';
        if (skippedByCount > 0) msg += `${skippedByCount} skipped (track limit). `;
        if (skippedBySize > 0) msg += `${skippedBySize} skipped (size limit).`;
        showToast(msg.trim(), { type: 'warn', duration: 2600 });
    }

    const firstNew = accepted[0];

    accepted.forEach(file => {
        songArray.push(file);
    });

    renderSongList();

    if (!isPlaying) {
        const newIndex = songArray.indexOf(firstNew);
        songIndex = newIndex >= 0 ? newIndex : 0;
        playSong(songArray[songIndex]);
    }

    updatePlaylistState();
    schedulePlaylistPersist({ immediate: true });
    scheduleStatePersist({ immediate: true });

    if (window.innerWidth <= 768) {
        setPlaylistOpenState(false);
    }
}

function renderSongList() {
    songList.querySelectorAll('.song').forEach(song => song.remove());

    const entries = getFilteredEntries();

    entries.forEach((entry, visibleIndex) => {
        const { file, index } = entry;
        const div = document.createElement('div');
        div.classList.add('song');
        div.dataset.songIndex = String(index);
        div.setAttribute('role', 'listitem');
        div.tabIndex = 0;

        const indexSpan = document.createElement('span');
        indexSpan.classList.add('song-index');
        indexSpan.textContent = `${visibleIndex + 1}.`;

        const titleSpan = document.createElement('span');
        titleSpan.classList.add('song-title');
        titleSpan.textContent = file.name;
        titleSpan.title = file.name;
        titleSpan.setAttribute('aria-label', file.name);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.classList.add('song-remove-btn');
        removeBtn.textContent = '-';
        removeBtn.setAttribute('aria-label', `Remove track ${file.name}`);

        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            removeSong(index);
        });

        div.appendChild(indexSpan);
        div.appendChild(titleSpan);
        div.appendChild(removeBtn);

        div.addEventListener('click', () => {
            songIndex = index;
            playSong(songArray[songIndex]);
        });

        div.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                songIndex = index;
                playSong(songArray[songIndex]);
            }
        });

        songList.appendChild(div);
    });

    if (songListEmpty) {
        const showEmpty = songArray.length > 0 && entries.length === 0;
        songListEmpty.hidden = !showEmpty;
    }

    updateActiveSong();
}

function removeSong(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= songArray.length) return;

    const removedCurrentSong = indexToRemove === songIndex;
    const removedBeforeCurrent = indexToRemove < songIndex;

    songArray.splice(indexToRemove, 1);

    if (!songArray.length) {
        stopPlaybackAndReset();
        renderSongList();
        updatePlaylistState();
        return;
    }

    if (removedBeforeCurrent) {
        songIndex -= 1;
    }

    if (removedCurrentSong) {
        songIndex = Math.min(indexToRemove, songArray.length - 1);
        renderSongList();
        playSong(songArray[songIndex]);
    } else {
        renderSongList();
    }

    updatePlaylistState();
    schedulePlaylistPersist({ immediate: true });
    scheduleStatePersist({ immediate: true });
}

async function getFilesFromEntry(entry) {
    if (!entry) return [];

    if (entry.isFile) {
        const file = await new Promise(resolve => entry.file(resolve, () => resolve(null)));
        return file ? [file] : [];
    }

    if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = [];

        while (true) {
            const batch = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])));
            if (!batch.length) break;
            entries.push(...batch);
        }

        const nestedFiles = await Promise.all(entries.map(getFilesFromEntry));
        return nestedFiles.flat();
    }

    return [];
}

async function getDroppedFiles(dataTransfer) {
    if (!dataTransfer) return [];

    const items = [...(dataTransfer.items || [])];
    if (items.length && items.some(item => typeof item.webkitGetAsEntry === 'function')) {
        const entries = items
            .map(item => item.webkitGetAsEntry?.())
            .filter(Boolean);
        const files = await Promise.all(entries.map(getFilesFromEntry));
        return files.flat();
    }

    return [...(dataTransfer.files || [])];
}

fileUpload.addEventListener('change', function () {
    addSongs([...this.files]);
    this.value = '';
});

uploadBtnMobile?.addEventListener('click', e => {
    e.preventDefault();
    fileUpload?.click();
});

playlistToolsToggle?.addEventListener('click', () => {
    const isOpen = playlistTools?.classList.contains('open');
    setPlaylistToolsOpen(!isOpen, { focusInput: !isOpen });
});

songSearchInput?.addEventListener('input', e => {
    songSearchTerm = e.target.value;
    updateSearchClearBtn();
    renderSongList();
});

songSearchClear?.addEventListener('click', () => {
    setPlaylistToolsOpen(false, { returnFocus: true });
});

songSearchInput?.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    setPlaylistToolsOpen(false, { returnFocus: true });
});

document.addEventListener('pointerdown', e => {
    if (window.innerWidth <= 768) return;
    if (!playlistTools?.classList.contains('open')) return;
    if (!(e.target instanceof Node)) return;
    if (playlistTools.contains(e.target)) return;
    setPlaylistToolsOpen(false);
});

document.addEventListener('focusin', e => {
    if (window.innerWidth <= 768) return;
    if (!playlistTools?.classList.contains('open')) return;
    if (!(e.target instanceof Node)) return;
    if (playlistTools.contains(e.target)) return;
    setPlaylistToolsOpen(false);
});

window.addEventListener('resize', syncPlaylistToolsPanelBounds);

updateSearchClearBtn();
setPlaylistToolsOpen(false);
syncPlaylistToolsPanelBounds();

/* ===== Playback ===== */
function playSong(song){
    if(!song) return;
    initAudioCtx();

    if (currentSongObjectUrl) {
        URL.revokeObjectURL(currentSongObjectUrl);
    }

    currentSongObjectUrl = URL.createObjectURL(song);
    audioA.src = currentSongObjectUrl;
    audioA.load();
    audioA.play().catch(()=>{});
    startVisualizer();
    isPlaying=true;
    document.body.classList.add('is-playing');
    updatePlayPauseBtn();
    updateActiveSong();
    setEQState(false);
    // Keep playlist open on mobile so the user can close it manually.
    if (window.innerWidth > 768) {
      playlist.classList.remove('open');
      open = false;
    }
    scheduleStatePersist({ immediate: true });
}

function updateActiveSong(){
    document.querySelectorAll('.song').forEach(s => {
        const idx = Number(s.dataset.songIndex);
        s.classList.toggle('active', idx === songIndex);
    });
}

function togglePlayPause() {
    if (!songArray.length) return;
    if (!audioCtx) initAudioCtx();

    if (isPlaying) audioA.pause();
    else {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        audioA.play();
        startVisualizer();
    }

    isPlaying = !isPlaying;
    document.body.classList.toggle('is-playing', isPlaying);
    updatePlayPauseBtn();
    scheduleStatePersist({ immediate: true });
}

playPauseBtn.addEventListener('click', togglePlayPause);

function updatePlayPauseBtn(){
    const label = isPlaying ? 'Pause' : 'Play';
    playPauseIcon.src = isPlaying ? "icons/pause.svg" : "icons/play.svg";
    playPauseBtn.setAttribute('aria-label', label);
}

/* ===== Play Modes ===== */
function toggleShuffle() {
    isShuffling = !isShuffling;
    shuffleBtn.classList.toggle('active', isShuffling);

    // If shuffle enabled, disable repeat
    if (isShuffling && isRepeating) {
        isRepeating = false;
        repeatBtn.classList.remove('active');
        audioA.loop = false;
    }
    scheduleStatePersist({ immediate: true });
}

function toggleRepeat() {
    isRepeating = !isRepeating;
    repeatBtn.classList.toggle('active', isRepeating);
    audioA.loop = isRepeating;

    // If repeat enabled, disable shuffle
    if (isRepeating && isShuffling) {
        isShuffling = false;
        shuffleBtn.classList.remove('active');
    }
    scheduleStatePersist({ immediate: true });
}

shuffleBtn.addEventListener('click', toggleShuffle);
repeatBtn.addEventListener('click', toggleRepeat);

// --- Next track logic with repeat and shuffle ---
function replayCurrentTrack() {
    audioA.currentTime = 0;
    audioA.play().catch(() => {});
}

function getAdjacentSongIndex(step) {
    if (isShuffling) {
        return Math.floor(Math.random() * songArray.length);
    }

    return (songIndex + step + songArray.length) % songArray.length;
}

function playNext() {
    if (!songArray.length) return;
    if (isRepeating) {
        replayCurrentTrack();
        return;
    }
    songIndex = getAdjacentSongIndex(1);
    playSong(songArray[songIndex]);
}

function playPrev() {
    if (!songArray.length) return;
    if (isRepeating) {
        replayCurrentTrack();
        return;
    }
    songIndex = getAdjacentSongIndex(-1);
    playSong(songArray[songIndex]);
}

nextBtn.addEventListener('click', playNext);
prevBtn.addEventListener('click', playPrev);

audioA.addEventListener('timeupdate',()=>{
    if(audioA.duration){
        seekBar.value=(audioA.currentTime/audioA.duration)*100;
        currentTimeEl.textContent=formatTime(audioA.currentTime);
        totalTimeEl.textContent=formatTime(audioA.duration);
        scheduleStatePersist();
    }
});

seekBar.addEventListener('input',e=>{
    if(audioA.duration) {
        audioA.currentTime=(audioA.duration*e.target.value)/100;
        scheduleStatePersist();
    }
});

volumeBar.addEventListener('input',e=>{
    audioA.volume=e.target.value/100;volumePercentage.textContent=`${e.target.value}%`;
    scheduleStatePersist();
});

function setVolume(nextValue) {
    const clamped = Math.max(0, Math.min(100, nextValue));
    audioA.volume = clamped / 100;
    volumeBar.value = clamped;
    volumePercentage.textContent = `${Math.round(clamped)}%`;
    scheduleStatePersist();
}

function seekBy(seconds) {
    if (!audioA.duration) return;
    const nextTime = Math.max(0, Math.min(audioA.duration, audioA.currentTime + seconds));
    audioA.currentTime = nextTime;
}

audioA.addEventListener('ended',()=>{
    if (!songArray.length) return;
    songIndex = getAdjacentSongIndex(1);
    playSong(songArray[songIndex]);
});

audioA.addEventListener('play', () => {
    startVisualizer();
    document.body.classList.add('is-playing');
});

audioA.addEventListener('pause', () => {
    stopVisualizer();
    document.body.classList.remove('is-playing');
});

function formatTime(s){
    const m=Math.floor(s/60);const sec=Math.floor(s%60);return `${m}:${sec<10?'0':''}${sec}`;}

/* ===== Playlist Panel / Drag and Drop ===== */

const playlist = playlistRoot;
const handle = document.querySelector('.playlist-handle');
const fileUploadContainer = document.getElementById('fileupload-container');
let open = false;

playlistClearBtn?.addEventListener('click', () => {
  openClearModal();
});

clearModal?.addEventListener('click', event => {
  if (event.target === clearModal) {
    closeClearModal();
  }
});

clearModalCancelBtn?.addEventListener('click', () => {
  closeClearModal();
});

clearModalClearBtn?.addEventListener('click', () => {
  handleClearPlaylist();
});

clearModalFullBtn?.addEventListener('click', () => {
  handleFullReset().catch(() => {});
});

function updatePlaylistState() {
  const hasSongs = songArray.length > 0;
  playlist.classList.toggle('has-songs', hasSongs);

  if (!hasSongs) {
    setPlaylistToolsOpen(false);
    if (songSearchTerm) {
      songSearchTerm = '';
      if (songSearchInput) songSearchInput.value = '';
      updateSearchClearBtn();
    }
  }

  if (playlistClearBtn) {
    playlistClearBtn.hidden = !hasSongs;
    playlistClearBtn.setAttribute('aria-hidden', hasSongs ? 'false' : 'true');
  }
}

function setDropState(isDragging) {
  playlist.classList.toggle('drag-active', isDragging);
}

['dragenter', 'dragover'].forEach(eventName => {
  playlist.addEventListener(eventName, e => {
    e.preventDefault();
    setDropState(true);
  });
});

['dragleave', 'dragend'].forEach(eventName => {
  playlist.addEventListener(eventName, e => {
    e.preventDefault();
    if (!playlist.contains(e.relatedTarget)) {
      setDropState(false);
    }
  });
});

playlist.addEventListener('drop', async e => {
  e.preventDefault();
  setDropState(false);

  const droppedFiles = await getDroppedFiles(e.dataTransfer);
  addSongs(droppedFiles);
});

fileUploadContainer?.addEventListener('dragover', e => {
  e.preventDefault();
});

restorePersistentState().catch(() => {
  renderSongList();
  updatePlaylistState();
  updatePlayPauseBtn();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    scheduleStatePersist({ immediate: true });
  }
});

window.addEventListener('beforeunload', () => {
  scheduleStatePersist({ immediate: true });
});

function setPlaylistOpenState(isOpen) {
  open = isOpen;
  playlist.classList.toggle('open', isOpen);
}

/* Handle click */
handle.addEventListener('click', () => {
  setPlaylistOpenState(!open);
});

/* Swipe (touch) */
let startY = 0;
let endY = 0;

playlist.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
});

playlist.addEventListener('touchmove', (e) => {
  endY = e.touches[0].clientY;
});

playlist.addEventListener('touchend', () => {
  const diff = endY - startY;

  // swipe down (hide panel)
  if (diff > 50) {
    setPlaylistOpenState(false);
  }
  // swipe up (open panel)
  else if (diff < -50) {
    setPlaylistOpenState(true);
  }

  startY = 0;
  endY = 0;
});

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) seekBy(5);
      else playNext();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) seekBy(-5);
      else playPrev();
      break;
    case 'ArrowUp':
      e.preventDefault();
      setVolume(Number(volumeBar.value) + 5);
      break;
    case 'ArrowDown':
      e.preventDefault();
      setVolume(Number(volumeBar.value) - 5);
      break;
    case 's':
    case 'S':
      toggleShuffle();
      break;
    case 'r':
    case 'R':
      toggleRepeat();
      break;
    case '/':
      if (songSearchInput) {
        e.preventDefault();
        setPlaylistToolsOpen(true, { focusInput: true });
      }
      break;
    case 'Escape':
      if (playlistTools?.classList.contains('open')) {
        e.preventDefault();
        setPlaylistToolsOpen(false, { returnFocus: true });
      } else if (songSearchTerm) {
        songSearchTerm = '';
        if (songSearchInput) songSearchInput.value = '';
        updateSearchClearBtn();
        renderSongList();
      }
      break;
    default:
      break;
  }
});



}

