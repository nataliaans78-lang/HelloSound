export function initStorage(context) {
  const {
    refs: { audioA, currentTimeEl, repeatBtn, shuffleBtn },
    state,
    constants: {
      MAX_PERSIST_TOTAL_BYTES,
      MAX_PERSIST_TRACKS,
      PLAYER_STATE_KEY,
      PLAYLIST_DB_NAME,
      PLAYLIST_DB_STORE
    }
  } = context;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function openPlaylistDb() {
    if (state.playlistDbPromise) return state.playlistDbPromise;

    state.playlistDbPromise = new Promise((resolve, reject) => {
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

    return state.playlistDbPromise;
  }

  function getPlaylistTotalBytes(files = state.songArray) {
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
    if (state.toastRoot) return state.toastRoot;
    const root = document.createElement('div');
    root.id = 'app-toast';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    document.body.appendChild(root);
    state.toastRoot = root;
    return root;
  }

  function showToast(message, { type = 'info', duration = 2200 } = {}) {
    const root = ensureToastRoot();
    root.className = '';
    root.textContent = message;
    root.classList.add('show', `toast-${type}`);

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }

    state.toastTimer = setTimeout(() => {
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
    if (state.songArray.length > MAX_PERSIST_TRACKS) {
      throw new Error('persist-limit-tracks');
    }
    if (getPlaylistTotalBytes(state.songArray) > MAX_PERSIST_TOTAL_BYTES) {
      throw new Error('persist-limit-size');
    }

    const db = await openPlaylistDb();
    const transaction = db.transaction(PLAYLIST_DB_STORE, 'readwrite');
    const store = transaction.objectStore(PLAYLIST_DB_STORE);

    await requestToPromise(store.clear());

    for (let i = 0; i < state.songArray.length; i += 1) {
      const track = state.songArray[i];
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
      songIndex: state.songIndex,
      currentTime: Number.isFinite(audioA.currentTime) ? audioA.currentTime : 0,
      isShuffling: state.isShuffling,
      isRepeating: state.isRepeating,
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
    if (state.playlistPersistTimer) {
      clearTimeout(state.playlistPersistTimer);
    }

    const persist = () => {
      savePlaylistToDb()
        .then(() => {
          const now = Date.now();
          if (now - state.lastPersistToastAt > 7000) {
            showToast('Saved', { type: 'success', duration: 1200 });
            state.lastPersistToastAt = now;
          }
        })
        .catch(handlePersistError);
      state.playlistPersistTimer = null;
    };

    if (immediate) {
      persist();
    } else {
      state.playlistPersistTimer = setTimeout(persist, 220);
    }
  }

  function scheduleStatePersist({ immediate = false } = {}) {
    const now = Date.now();
    if (!immediate && now - state.lastStatePersistAt < 450) return;

    if (state.statePersistTimer) {
      clearTimeout(state.statePersistTimer);
    }

    const persist = () => {
      savePlayerState();
      state.lastStatePersistAt = Date.now();
      state.statePersistTimer = null;
    };

    if (immediate) {
      persist();
    } else {
      state.statePersistTimer = setTimeout(persist, 120);
    }
  }

  function applyPlayerState(nextState) {
    if (!nextState) return;

    const nextVolume = Number(nextState.volume);
    if (Number.isFinite(nextVolume)) {
      context.actions.setVolume?.(nextVolume);
    }

    state.isShuffling = Boolean(nextState.isShuffling);
    state.isRepeating = Boolean(nextState.isRepeating);
    if (state.isShuffling && state.isRepeating) {
      state.isShuffling = false;
    }

    shuffleBtn.classList.toggle('active', state.isShuffling);
    repeatBtn.classList.toggle('active', state.isRepeating);
    audioA.loop = state.isRepeating;
  }

  function restoreCurrentTrackSource(nextState) {
    if (!state.songArray.length) return;

    const savedIndex = Number.isInteger(nextState?.songIndex) ? nextState.songIndex : 0;
    state.songIndex = Math.max(0, Math.min(state.songArray.length - 1, savedIndex));

    if (state.currentSongObjectUrl) {
      URL.revokeObjectURL(state.currentSongObjectUrl);
    }

    state.currentSongObjectUrl = URL.createObjectURL(state.songArray[state.songIndex]);
    audioA.src = state.currentSongObjectUrl;
    audioA.load();
    context.actions.updateActiveSong?.();

    const savedTime = Number(nextState?.currentTime);
    if (Number.isFinite(savedTime) && savedTime > 0) {
      audioA.addEventListener('loadedmetadata', () => {
        const boundedTime = Math.max(0, Math.min(savedTime, audioA.duration || savedTime));
        audioA.currentTime = boundedTime;
        currentTimeEl.textContent = context.actions.formatTime?.(boundedTime) ?? '0:00';
      }, { once: true });
    }
  }

  async function restorePersistentState() {
    const [files, nextState] = await Promise.all([
      loadPlaylistFromDb(),
      Promise.resolve(loadPlayerState())
    ]);

    if (files.length) {
      state.songArray = files;
    }

    context.actions.renderSongList?.();
    context.actions.updatePlaylistState?.();
    applyPlayerState(nextState);

    if (state.songArray.length) {
      restoreCurrentTrackSource(nextState);
      showToast(`Restored ${state.songArray.length} track${state.songArray.length === 1 ? '' : 's'}.`, {
        type: 'success',
        duration: 1700
      });
    }

    context.actions.updatePlayPauseBtn?.();
  }

  Object.assign(context.actions, {
    applyPlayerState,
    clearPersistedStorage,
    formatBytes,
    getPlayerStatePayload,
    getPlaylistTotalBytes,
    handlePersistError,
    loadPlayerState,
    requestToPromise,
    restoreCurrentTrackSource,
    restorePersistentState,
    savePlayerState,
    schedulePlaylistPersist,
    scheduleStatePersist,
    showToast
  });
}
