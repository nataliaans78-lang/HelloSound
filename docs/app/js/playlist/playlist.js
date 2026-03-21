export function initPlaylist(context) {
  const {
    refs: {
      audioA,
      audioControls,
      clearModal,
      clearModalCancelBtn,
      clearModalClearBtn,
      clearModalFullBtn,
      controlsToggleBtn,
      currentTimeEl,
      fileUpload,
      fileUploadContainer,
      handle,
      playlistClearBtn,
      playlistDropOverlay,
      playlistRoot,
      playlistTools,
      playlistToolsToggle,
      seekBar,
      songList,
      songListEmpty,
      songSearchInput,
      totalTimeEl,
      uploadBtnMobile,
      visualizerContainer
    },
    state
  } = context;

  function isAudioFile(file) {
    if (!file) return false;
    if (file.type?.startsWith('audio/')) return true;
    const lowerName = file.name.toLowerCase();
    return context.constants.AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
  }

  function getFilteredEntries() {
    const term = context.actions.normalizeText?.(state.songSearchTerm);
    const entries = state.songArray.map((file, index) => ({ file, index }));
    if (!term) return entries;
    return entries.filter(entry => entry.file.name.toLowerCase().includes(term));
  }

  function clearPlaylist() {
    state.songArray = [];
    context.actions.stopPlaybackAndReset?.();
    renderSongList();
    updatePlaylistState();
    context.actions.schedulePlaylistPersist?.({ immediate: true });
    context.actions.scheduleStatePersist?.({ immediate: true });
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

    if (event.shiftKey && (active === first || !clearModal.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openClearModal() {
    if (!clearModal) return;
    state.clearModalLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (playlistClearBtn && !playlistClearBtn.hidden) nextFocus = playlistClearBtn;
      else if (controlsToggleBtn) nextFocus = controlsToggleBtn;
      else if (playlistToolsToggle) nextFocus = playlistToolsToggle;
    } else if (state.clearModalLastFocus instanceof HTMLElement && document.contains(state.clearModalLastFocus)) {
      nextFocus = state.clearModalLastFocus;
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
    await context.actions.clearPersistedStorage?.();
    try {
      localStorage.removeItem(context.constants.EQ_STORAGE_KEY);
    } catch (_) {
      // ignore localStorage cleanup errors
    }

    context.actions.applyEQSettings?.(context.constants.EQ_PRESETS.flat, { preset: 'flat' });
    context.actions.setEQState?.(false);
    context.actions.setControlsHidden?.(false);
    context.actions.setPlaylistOpenState?.(false);

    state.isShuffling = false;
    state.isRepeating = false;
    context.refs.shuffleBtn.classList.remove('active');
    context.refs.repeatBtn.classList.remove('active');
    audioA.loop = false;
    context.actions.setVolume?.(100);

    state.songSearchTerm = '';
    if (songSearchInput) {
      songSearchInput.value = '';
    }
    context.actions.setPlaylistToolsOpen?.(false);
    context.actions.updateSearchClearBtn?.();
    document.body.classList.remove('is-playing');

    if (seekBar) {
      seekBar.value = 0;
      context.actions.updateRangeVisual?.(seekBar, 0);
    }
    if (currentTimeEl) currentTimeEl.textContent = '0:00';
    if (totalTimeEl) totalTimeEl.textContent = '0:00';

    clearPlaylist();

    if (state.statePersistTimer) {
      clearTimeout(state.statePersistTimer);
      state.statePersistTimer = null;
    }

    try {
      localStorage.removeItem(context.constants.PLAYER_STATE_KEY);
    } catch (_) {
      // ignore localStorage cleanup errors
    }

    context.actions.showToast?.('Reset App done.', { type: 'success', duration: 1800 });
    closeClearModal();
  }

  function addSongs(files) {
    const validFiles = files.filter(isAudioFile);
    if (!validFiles.length) return;

    const freeSlots = Math.max(0, context.constants.MAX_PERSIST_TRACKS - state.songArray.length);
    const acceptedByCount = validFiles.slice(0, freeSlots);
    const skippedByCount = validFiles.length - acceptedByCount.length;

    let projectedBytes = context.actions.getPlaylistTotalBytes?.(state.songArray) ?? 0;
    const accepted = [];
    let skippedBySize = 0;
    for (const file of acceptedByCount) {
      const nextBytes = projectedBytes + (file.size || 0);
      if (nextBytes <= context.constants.MAX_PERSIST_TOTAL_BYTES) {
        accepted.push(file);
        projectedBytes = nextBytes;
      } else {
        skippedBySize += 1;
      }
    }

    if (!accepted.length) {
      if (skippedByCount > 0) {
        context.actions.showToast?.(`Limit reached: max ${context.constants.MAX_PERSIST_TRACKS} tracks.`, { type: 'warn', duration: 2600 });
      } else {
        context.actions.showToast?.(
          `Limit reached: max ${context.actions.formatBytes?.(context.constants.MAX_PERSIST_TOTAL_BYTES)} total size.`,
          { type: 'warn', duration: 2600 }
        );
      }
      return;
    }

    if (skippedByCount > 0 || skippedBySize > 0) {
      let message = '';
      if (skippedByCount > 0) message += `${skippedByCount} skipped (track limit). `;
      if (skippedBySize > 0) message += `${skippedBySize} skipped (size limit).`;
      context.actions.showToast?.(message.trim(), { type: 'warn', duration: 2600 });
    }

    const firstNew = accepted[0];
    accepted.forEach(file => {
      state.songArray.push(file);
    });

    renderSongList();

    if (!state.isPlaying) {
      const newIndex = state.songArray.indexOf(firstNew);
      state.songIndex = newIndex >= 0 ? newIndex : 0;
      context.actions.playSong?.(state.songArray[state.songIndex]);
    }

    updatePlaylistState();
    context.actions.schedulePlaylistPersist?.({ immediate: true });
    context.actions.scheduleStatePersist?.({ immediate: true });

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

      removeBtn.addEventListener('click', event => {
        event.stopPropagation();
        removeSong(index);
      });

      div.appendChild(indexSpan);
      div.appendChild(titleSpan);
      div.appendChild(removeBtn);

      div.addEventListener('click', () => {
        state.songIndex = index;
        context.actions.playSong?.(state.songArray[state.songIndex]);
      });

      div.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          state.songIndex = index;
          context.actions.playSong?.(state.songArray[state.songIndex]);
        }
      });

      songList.appendChild(div);
    });

    if (songListEmpty) {
      songListEmpty.hidden = !(state.songArray.length > 0 && entries.length === 0);
    }

    context.actions.updateActiveSong?.();
  }

  function removeSong(indexToRemove) {
    if (indexToRemove < 0 || indexToRemove >= state.songArray.length) return;

    const removedCurrentSong = indexToRemove === state.songIndex;
    const removedBeforeCurrent = indexToRemove < state.songIndex;
    state.songArray.splice(indexToRemove, 1);

    if (!state.songArray.length) {
      context.actions.stopPlaybackAndReset?.();
      renderSongList();
      updatePlaylistState();
      return;
    }

    if (removedBeforeCurrent) {
      state.songIndex -= 1;
    }

    if (removedCurrentSong) {
      state.songIndex = Math.min(indexToRemove, state.songArray.length - 1);
      renderSongList();
      context.actions.playSong?.(state.songArray[state.songIndex]);
    } else {
      renderSongList();
    }

    updatePlaylistState();
    context.actions.schedulePlaylistPersist?.({ immediate: true });
    context.actions.scheduleStatePersist?.({ immediate: true });
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

  function updatePlaylistState() {
    const hasSongs = state.songArray.length > 0;
    playlistRoot.classList.toggle('has-songs', hasSongs);

    if (!hasSongs) {
      context.actions.setPlaylistToolsOpen?.(false);
      if (state.songSearchTerm) {
        state.songSearchTerm = '';
        if (songSearchInput) songSearchInput.value = '';
        context.actions.updateSearchClearBtn?.();
      }
    }

    if (playlistClearBtn) {
      playlistClearBtn.hidden = !hasSongs;
      playlistClearBtn.setAttribute('aria-hidden', hasSongs ? 'false' : 'true');
    }
  }

  function setDropState(isDragging) {
    playlistRoot.classList.toggle('drag-active', isDragging);
  }

  function setPlaylistOpenState(isOpen) {
    state.open = isOpen;
    playlistRoot.classList.toggle('open', isOpen);
  }

  function closePlaylistFromPlayerInteraction() {
    if (!state.open) return;
    if (window.innerWidth > 768) return;
    setPlaylistOpenState(false);
  }

  fileUpload.addEventListener('change', function () {
    addSongs([...this.files]);
    this.value = '';
  });

  uploadBtnMobile?.addEventListener('click', event => {
    event.preventDefault();
    fileUpload?.click();
  });

  playlistDropOverlay?.addEventListener('click', () => {
    fileUpload?.click();
  });

  playlistToolsToggle?.addEventListener('click', () => {
    const isOpen = playlistTools?.classList.contains('open');
    context.actions.setPlaylistToolsOpen?.(!isOpen, { focusInput: !isOpen });
  });

  songSearchInput?.addEventListener('input', event => {
    state.songSearchTerm = event.target.value;
    context.actions.updateSearchClearBtn?.();
    renderSongList();
  });

  songSearchInput?.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    context.actions.setPlaylistToolsOpen?.(false, { returnFocus: true });
  });

  document.addEventListener('pointerdown', event => {
    if (window.innerWidth <= 768) return;
    if (!playlistTools?.classList.contains('open')) return;
    if (!(event.target instanceof Node)) return;
    if (playlistTools.contains(event.target)) return;
    context.actions.setPlaylistToolsOpen?.(false);
  });

  document.addEventListener('focusin', event => {
    if (window.innerWidth <= 768) return;
    if (!playlistTools?.classList.contains('open')) return;
    if (!(event.target instanceof Node)) return;
    if (playlistTools.contains(event.target)) return;
    context.actions.setPlaylistToolsOpen?.(false);
  });

  playlistClearBtn?.addEventListener('click', openClearModal);
  clearModal?.addEventListener('click', event => {
    if (event.target === clearModal) {
      closeClearModal();
    }
  });
  clearModalCancelBtn?.addEventListener('click', () => closeClearModal());
  clearModalClearBtn?.addEventListener('click', handleClearPlaylist);
  clearModalFullBtn?.addEventListener('click', () => {
    handleFullReset().catch(() => {});
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    playlistRoot.addEventListener(eventName, event => {
      event.preventDefault();
      setDropState(true);
    });
  });

  ['dragleave', 'dragend'].forEach(eventName => {
    playlistRoot.addEventListener(eventName, event => {
      event.preventDefault();
      if (!playlistRoot.contains(event.relatedTarget)) {
        setDropState(false);
      }
    });
  });

  playlistRoot.addEventListener('drop', async event => {
    event.preventDefault();
    setDropState(false);
    const droppedFiles = await getDroppedFiles(event.dataTransfer);
    addSongs(droppedFiles);
  });

  fileUploadContainer?.addEventListener('dragover', event => {
    event.preventDefault();
  });

  visualizerContainer?.addEventListener('pointerdown', closePlaylistFromPlayerInteraction);
  audioControls?.addEventListener('pointerdown', closePlaylistFromPlayerInteraction);
  handle?.addEventListener('click', () => {
    setPlaylistOpenState(!state.open);
  });

  playlistRoot.addEventListener('touchstart', event => {
    state.startY = event.touches[0].clientY;
  });
  playlistRoot.addEventListener('touchmove', event => {
    state.endY = event.touches[0].clientY;
  });
  playlistRoot.addEventListener('touchend', () => {
    const diff = state.endY - state.startY;
    if (diff > 50) setPlaylistOpenState(false);
    else if (diff < -50) setPlaylistOpenState(true);
    state.startY = 0;
    state.endY = 0;
  });

  Object.assign(context.actions, {
    addSongs,
    clearPlaylist,
    closeClearModal,
    getFilteredEntries,
    getDroppedFiles,
    handleFullReset,
    openClearModal,
    removeSong,
    renderSongList,
    setPlaylistOpenState,
    updatePlaylistState
  });
}
