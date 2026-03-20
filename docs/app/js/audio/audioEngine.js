export function initAudioEngine(context) {
  const {
    refs: {
      audioA,
      currentTimeEl,
      nextBtn,
      playPauseBtn,
      playPauseIcon,
      prevBtn,
      repeatBtn,
      seekBar,
      shuffleBtn,
      totalTimeEl,
      volumeBar,
      volumePercentage
    },
    state
  } = context;

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function initAudioCtx() {
    if (state.isAudioCtxInitialized) return;

    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.audioSrc = state.audioCtx.createMediaElementSource(audioA);

    state.bassFilter = state.audioCtx.createBiquadFilter();
    state.bassFilter.type = 'lowshelf';
    state.bassFilter.frequency.value = 200;
    state.bassFilter.gain.value = 0;

    state.midFilter = state.audioCtx.createBiquadFilter();
    state.midFilter.type = 'peaking';
    state.midFilter.frequency.value = 1000;
    state.midFilter.Q.value = 1;
    state.midFilter.gain.value = 0;

    state.trebleFilter = state.audioCtx.createBiquadFilter();
    state.trebleFilter.type = 'highshelf';
    state.trebleFilter.frequency.value = 3000;
    state.trebleFilter.gain.value = 0;

    const currentSettings = context.actions.getCurrentEQSettings?.() ?? {
      bass: 0,
      mid: 0,
      treble: 0
    };
    state.bassFilter.gain.value = currentSettings.bass;
    state.midFilter.gain.value = currentSettings.mid;
    state.trebleFilter.gain.value = currentSettings.treble;

    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 512;
    context.actions.initAudioMetricsWorker?.();

    state.audioSrc
      .connect(state.bassFilter)
      .connect(state.midFilter)
      .connect(state.trebleFilter)
      .connect(state.analyser)
      .connect(state.audioCtx.destination);

    state.isAudioCtxInitialized = true;
  }

  function updatePlayPauseBtn() {
    const label = state.isPlaying ? 'Pause' : 'Play';
    playPauseIcon.src = state.isPlaying ? 'icons/pause.svg' : 'icons/play.svg';
    playPauseBtn.setAttribute('aria-label', label);
  }

  function updateActiveSong() {
    document.querySelectorAll('.song').forEach(songEl => {
      const idx = Number(songEl.dataset.songIndex);
      songEl.classList.toggle('active', idx === state.songIndex);
    });
  }

  function stopPlaybackAndReset() {
    if (state.currentSongObjectUrl) {
      URL.revokeObjectURL(state.currentSongObjectUrl);
      state.currentSongObjectUrl = null;
    }

    context.actions.stopVisualizer?.();
    audioA.pause();
    audioA.removeAttribute('src');
    audioA.load();
    state.isPlaying = false;
    state.songIndex = 0;
    updatePlayPauseBtn();
  }

  function playSong(song) {
    if (!song) return;
    initAudioCtx();

    if (state.currentSongObjectUrl) {
      URL.revokeObjectURL(state.currentSongObjectUrl);
    }

    state.currentSongObjectUrl = URL.createObjectURL(song);
    audioA.src = state.currentSongObjectUrl;
    audioA.load();
    audioA.play().catch(() => {});
    context.actions.startVisualizer?.();
    state.isPlaying = true;
    document.body.classList.add('is-playing');
    updatePlayPauseBtn();
    updateActiveSong();
    context.actions.setEQState?.(false);

    if (window.innerWidth > 768) {
      context.actions.setPlaylistOpenState?.(false);
    }

    context.actions.scheduleStatePersist?.({ immediate: true });
  }

  function togglePlayPause() {
    if (!state.songArray.length) return;
    if (!state.audioCtx) initAudioCtx();

    if (state.isPlaying) {
      audioA.pause();
    } else {
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
      audioA.play();
      context.actions.startVisualizer?.();
    }

    state.isPlaying = !state.isPlaying;
    document.body.classList.toggle('is-playing', state.isPlaying);
    updatePlayPauseBtn();
    context.actions.scheduleStatePersist?.({ immediate: true });
  }

  function toggleShuffle() {
    state.isShuffling = !state.isShuffling;
    shuffleBtn.classList.toggle('active', state.isShuffling);

    if (state.isShuffling && state.isRepeating) {
      state.isRepeating = false;
      repeatBtn.classList.remove('active');
      audioA.loop = false;
    }

    context.actions.scheduleStatePersist?.({ immediate: true });
  }

  function toggleRepeat() {
    state.isRepeating = !state.isRepeating;
    repeatBtn.classList.toggle('active', state.isRepeating);
    audioA.loop = state.isRepeating;

    if (state.isRepeating && state.isShuffling) {
      state.isShuffling = false;
      shuffleBtn.classList.remove('active');
    }

    context.actions.scheduleStatePersist?.({ immediate: true });
  }

  function replayCurrentTrack() {
    audioA.currentTime = 0;
    audioA.play().catch(() => {});
  }

  function getAdjacentSongIndex(step) {
    if (state.isShuffling) {
      return Math.floor(Math.random() * state.songArray.length);
    }
    return (state.songIndex + step + state.songArray.length) % state.songArray.length;
  }

  function playNext() {
    if (!state.songArray.length) return;
    if (state.isRepeating) {
      replayCurrentTrack();
      return;
    }
    state.songIndex = getAdjacentSongIndex(1);
    playSong(state.songArray[state.songIndex]);
  }

  function playPrev() {
    if (!state.songArray.length) return;
    if (state.isRepeating) {
      replayCurrentTrack();
      return;
    }
    state.songIndex = getAdjacentSongIndex(-1);
    playSong(state.songArray[state.songIndex]);
  }

  function setVolume(nextValue) {
    const clamped = Math.max(0, Math.min(100, nextValue));
    audioA.volume = clamped / 100;
    volumeBar.value = clamped;
    volumePercentage.textContent = `${Math.round(clamped)}%`;
    context.actions.updateRangeVisual?.(volumeBar, clamped);
    context.actions.scheduleStatePersist?.();
  }

  function seekBy(seconds) {
    if (!audioA.duration) return;
    const nextTime = Math.max(0, Math.min(audioA.duration, audioA.currentTime + seconds));
    audioA.currentTime = nextTime;
  }

  playPauseBtn.addEventListener('click', togglePlayPause);
  shuffleBtn.addEventListener('click', toggleShuffle);
  repeatBtn.addEventListener('click', toggleRepeat);
  nextBtn.addEventListener('click', playNext);
  prevBtn.addEventListener('click', playPrev);

  audioA.addEventListener('timeupdate', () => {
    if (!audioA.duration) return;
    seekBar.value = (audioA.currentTime / audioA.duration) * 100;
    context.actions.updateRangeVisual?.(seekBar);
    currentTimeEl.textContent = formatTime(audioA.currentTime);
    totalTimeEl.textContent = formatTime(audioA.duration);
    context.actions.scheduleStatePersist?.();
  });

  seekBar.addEventListener('input', event => {
    if (!audioA.duration) return;
    audioA.currentTime = (audioA.duration * event.target.value) / 100;
    context.actions.updateRangeVisual?.(seekBar, event.target.value);
    context.actions.scheduleStatePersist?.();
  });

  volumeBar.addEventListener('input', event => {
    audioA.volume = event.target.value / 100;
    volumePercentage.textContent = `${event.target.value}%`;
    context.actions.updateRangeVisual?.(volumeBar, event.target.value);
    context.actions.scheduleStatePersist?.();
  });

  audioA.addEventListener('ended', () => {
    if (!state.songArray.length) return;
    state.songIndex = getAdjacentSongIndex(1);
    playSong(state.songArray[state.songIndex]);
  });

  audioA.addEventListener('play', () => {
    context.actions.startVisualizer?.();
    document.body.classList.add('is-playing');
  });

  audioA.addEventListener('pause', () => {
    context.actions.stopVisualizer?.();
    document.body.classList.remove('is-playing');
  });

  Object.assign(context.actions, {
    formatTime,
    getAdjacentSongIndex,
    initAudioCtx,
    playNext,
    playPrev,
    playSong,
    setVolume,
    seekBy,
    stopPlaybackAndReset,
    togglePlayPause,
    toggleRepeat,
    toggleShuffle,
    updateActiveSong,
    updatePlayPauseBtn
  });
}
