export function initEqualizer(context) {
  const {
    refs: {
      audioControls,
      controlsToggleBtn,
      controlsToggleIcon,
      eqBtn,
      eqCloseBtn,
      eqIcon,
      eqPanel,
      eqPresetSelect,
      eqResetBtn,
      eqSliders
    },
    state,
    constants: { EQ_PRESETS, EQ_STORAGE_KEY }
  } = context;

  const presetDropdown = document.getElementById('eq-preset-dropdown');
  const presetToggle = document.getElementById('eq-preset-toggle');
  const presetLabel = document.getElementById('eq-preset-label');
  const presetMenu = document.getElementById('eq-preset-menu');
  const presetOptions = [...document.querySelectorAll('.eq-preset-option')];

  function syncCustomPresetUI(value) {
    const nextValue = value || 'custom';
    const activeOption = presetOptions.find(option => option.dataset.value === nextValue)
      || presetOptions.find(option => option.dataset.value === 'custom');

    presetOptions.forEach(option => {
      const isActive = option === activeOption;
      option.classList.toggle('is-selected', isActive);
      option.setAttribute('aria-selected', String(isActive));
    });

    if (presetLabel && activeOption) {
      presetLabel.textContent = activeOption.textContent.trim();
    }
  }

  function closePresetMenu() {
    presetDropdown?.classList.remove('open');
    presetToggle?.setAttribute('aria-expanded', 'false');
  }

  function positionPresetMenu() {
    if (!presetDropdown || !presetMenu || !presetToggle) return;

    const toggleRect = presetToggle.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 10;

    const spaceBelow = viewportHeight - toggleRect.bottom - gap;
    const safeHeight = Math.max(90, Math.min(spaceBelow, 220));

    presetMenu.style.setProperty('--eq-menu-max-height', `${safeHeight}px`);
  }

  function openPresetMenu() {
    positionPresetMenu();
    presetDropdown?.classList.add('open');
    presetToggle?.setAttribute('aria-expanded', 'true');
  }

  function togglePresetMenu() {
    if (!presetDropdown || !presetToggle) return;
    const isOpen = presetDropdown.classList.contains('open');
    if (isOpen) closePresetMenu();
    else openPresetMenu();
  }

  function getCurrentEQSettings() {
    return {
      bass: parseFloat(eqSliders.find(slider => slider.dataset.band === 'bass')?.value ?? '0'),
      mid: parseFloat(eqSliders.find(slider => slider.dataset.band === 'mid')?.value ?? '0'),
      treble: parseFloat(eqSliders.find(slider => slider.dataset.band === 'treble')?.value ?? '0')
    };
  }

  function saveEQState(preset = 'custom') {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify({
      preset,
      settings: getCurrentEQSettings()
    }));
  }

  function applyEQSettings(settings, { save = true, preset = 'custom' } = {}) {
    eqSliders.forEach(slider => {
      const band = slider.dataset.band;
      const nextValue = settings[band] ?? 0;
      slider.value = String(nextValue);

      if (state.bassFilter && state.midFilter && state.trebleFilter) {
        if (band === 'bass') state.bassFilter.gain.value = nextValue;
        if (band === 'mid') state.midFilter.gain.value = nextValue;
        if (band === 'treble') state.trebleFilter.gain.value = nextValue;
      }
    });

    if (eqPresetSelect) {
      eqPresetSelect.value = EQ_PRESETS[preset] ? preset : 'custom';
    }

    syncCustomPresetUI(EQ_PRESETS[preset] ? preset : 'custom');

    if (save) {
      saveEQState(EQ_PRESETS[preset] ? preset : 'custom');
    }
  }

  function loadEQState() {
    try {
      const raw = localStorage.getItem(EQ_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.settings) return;
      applyEQSettings(parsed.settings, { save: false, preset: parsed.preset ?? 'custom' });
    } catch (_) {
      // ignore invalid localStorage payload
    }
  }

  function updateMobilePlaylistPush() {
    const isEqOpen = audioControls?.classList.contains('eq-open');
    const isMobile = window.innerWidth <= 768;

    if (!isEqOpen || !isMobile || !eqPanel) {
      document.body.style.setProperty('--eq-mobile-push', '0px');
      return;
    }

    const eqHeight = eqPanel.getBoundingClientRect().height || 0;
    const pushValue = Math.min(eqHeight * 0.22, window.innerHeight * 0.14);
    document.body.style.setProperty('--eq-mobile-push', `${Math.max(0, Math.round(pushValue))}px`);
  }

  function syncEQMobileLayout() {
    const isEqOpen = audioControls?.classList.contains('eq-open');
    const shouldCompactPlaylist = isEqOpen && window.innerWidth <= 768;
    document.body.classList.toggle('eq-mobile-open', shouldCompactPlaylist);
    updateMobilePlaylistPush();
  }

  function setEQState(isOpen) {
    audioControls?.classList.toggle('eq-open', isOpen);
    eqPanel?.classList.toggle('open', isOpen);
    eqBtn?.classList.toggle('active', isOpen);

    if (!isOpen) {
      closePresetMenu();
    }

    syncEQMobileLayout();
    requestAnimationFrame(updateMobilePlaylistPush);

    if (eqIcon) {
      eqIcon.src = isOpen ? 'icons/return.svg' : 'icons/eq.svg';
      eqIcon.alt = isOpen ? 'Close EQ' : 'EQ';
    }

    eqBtn?.setAttribute('aria-label', isOpen ? 'Close equalizer' : 'Open equalizer');
    controlsToggleBtn?.setAttribute('aria-label',
      document.body.classList.contains('controls-hidden') ? 'Show control bar' : 'Hide control bar');
    if (controlsToggleIcon) {
      controlsToggleIcon.alt = document.body.classList.contains('controls-hidden') ? 'Show controls' : 'Hide controls';
    }
  }

  eqSliders.forEach(slider => {
    slider.addEventListener('input', event => {
      if (!state.isAudioCtxInitialized) {
        context.actions.initAudioCtx?.();
      }

      if (!state.bassFilter || !state.midFilter || !state.trebleFilter) {
        return;
      }

      const value = parseFloat(event.target.value);
      const band = event.target.dataset.band;
      if (band === 'bass') state.bassFilter.gain.value = value;
      if (band === 'mid') state.midFilter.gain.value = value;
      if (band === 'treble') state.trebleFilter.gain.value = value;

      if (eqPresetSelect) {
        eqPresetSelect.value = 'custom';
      }
      syncCustomPresetUI('custom');
      saveEQState('custom');
    });
  });

  eqPresetSelect?.addEventListener('change', event => {
    syncCustomPresetUI(event.target.value);
    const preset = event.target.value;
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

  eqBtn?.addEventListener('click', () => {
    const isOpen = !audioControls?.classList.contains('eq-open');
    setEQState(isOpen);
  });

  eqCloseBtn?.addEventListener('click', () => {
    setEQState(false);
  });

  presetToggle?.addEventListener('click', togglePresetMenu);

  presetOptions.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.value;
      if (!eqPresetSelect) return;

      eqPresetSelect.value = value;
      eqPresetSelect.dispatchEvent(new Event('change', { bubbles: true }));
      closePresetMenu();
    });
  });

  document.addEventListener('click', event => {
    if (!presetDropdown || !presetMenu) return;
    if (!presetDropdown.contains(event.target)) {
      closePresetMenu();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePresetMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (presetDropdown?.classList.contains('open')) {
      positionPresetMenu();
    }
  });

  syncCustomPresetUI(eqPresetSelect?.value || 'custom');
  loadEQState();
  syncEQMobileLayout();
  window.addEventListener('resize', syncEQMobileLayout);

  Object.assign(context.actions, {
    applyEQSettings,
    getCurrentEQSettings,
    initEQState: loadEQState,
    setEQState,
    syncEQMobileLayout,
    updateMobilePlaylistPush
  });
}
