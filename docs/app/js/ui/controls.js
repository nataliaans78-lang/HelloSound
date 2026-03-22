export function initControls(context) {
  const {
    refs: {
      animatedText,
      controlsToggleBtn,
      controlsToggleIcon,
      playlistRoot,
      playlistTools,
      playlistToolsPanel,
      playlistToolsToggle,
      seekBar,
      songSearchInput,
      volumeBar
    }
  } = context;

  function updateRangeVisual(rangeEl, value = null) {
    if (!rangeEl) return;
    const min = Number(rangeEl.min || 0);
    const max = Number(rangeEl.max || 100);
    const current = value === null ? Number(rangeEl.value) : Number(value);
    const safeValue = Number.isFinite(current) ? current : min;
    const denominator = max - min || 1;
    const progress = ((safeValue - min) / denominator) * 100;
    const clamped = Math.max(0, Math.min(100, progress));
    rangeEl.style.setProperty('--range-progress', `${clamped}%`);
  }

  function syncRangeVisuals() {
    updateRangeVisual(seekBar);
    updateRangeVisual(volumeBar);
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function getTitleArcMetrics() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width <= 768) {
      return { radius: 140, startAngle: -29, endAngle: 29 };
    }

    if (width <= 1440 || height <= 900) {
      const widthScale = Math.min(width / 1440, 1);
      const heightScale = Math.min(height / 900, 1);
      const compactScale = Math.max(0.84, Math.min(widthScale, heightScale));

      return {
        radius: Math.round(188 * compactScale),
        startAngle: -32,
        endAngle: 32
      };
    }

    return { radius: 188, startAngle: -34, endAngle: 34 };
  }

  function buildArcTitle() {
    if (!animatedText) return;
    const text = animatedText.textContent.trim();
    animatedText.textContent = '';

    const { radius, startAngle, endAngle } = getTitleArcMetrics();
    const letters = text.length;
    const angleStep = (endAngle - startAngle) / Math.max(letters - 1, 1);
    const colors = [
      'hsl(0,100%,63%)',
      'hsl(30,100%,65%)',
      'hsl(50,100%,65%)',
      'hsl(160,100%,65%)',
      'hsl(200,100%,65%)',
      'hsl(260,100%,65%)',
      'hsl(320,100%,65%)',
      'hsl(0,100%,63%)'
    ];
    const pIndex = text.indexOf('P');
    const yIndex = text.indexOf('y');
    const tIndex = text.lastIndexOf('t');

    text.split('').forEach((letter, index) => {
      const span = document.createElement('span');
      span.textContent = letter;
      const angle = startAngle + index * angleStep;
      const rad = angle * Math.PI / 180;
      const x = radius * Math.sin(rad);
      const y = radius * (1 - Math.cos(rad));
      span.style.left = `calc(50% + ${x}px)`;
      span.style.top = `${y}px`;
      span.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      if (index === pIndex || index === tIndex) {
        span.style.color = 'hsl(0,100%,63%)';
      } else if (index === yIndex) {
        span.style.color = 'hsl(160,100%,65%)';
      } else {
        span.style.color = colors[index % colors.length];
      }
      animatedText.appendChild(span);
    });
  }

  function updateSearchClearBtn() {
    const isOpen = playlistTools?.classList.contains('open');
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
    const maxWidth = Math.max(180, Math.floor(playlistRect.right - toggleRect.left - 8));
    playlistRoot.style.setProperty('--playlist-search-panel-max-width', `${maxWidth}px`);
  }

  function setPlaylistToolsOpen(isOpen, { focusInput = false, returnFocus = false } = {}) {
    if (!playlistTools || !playlistToolsPanel || !playlistToolsToggle) return;
    if (isOpen && !playlistRoot?.classList.contains('has-songs')) return;

    if (isOpen) {
      syncPlaylistToolsPanelBounds();
    }

    playlistTools.classList.toggle('open', isOpen);
    playlistToolsToggle.classList.toggle('active', isOpen);
    playlistToolsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    playlistToolsPanel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    if (isOpen && focusInput) {
      requestAnimationFrame(() => songSearchInput?.focus());
    }

    if (!isOpen && returnFocus) {
      playlistToolsToggle.focus({ preventScroll: true });
    }
  }

  function setControlsHidden(isHidden) {
    if (isHidden) {
      context.actions.setEQState?.(false);
    }

    document.body.classList.toggle('controls-hidden', isHidden);

    if (controlsToggleIcon) {
      controlsToggleIcon.src = isHidden ? 'icons/up.svg' : 'icons/down.svg';
      controlsToggleIcon.alt = isHidden ? 'Show controls' : 'Hide controls';
    }

    controlsToggleBtn?.setAttribute('aria-label', isHidden ? 'Show control bar' : 'Hide control bar');
  }

  buildArcTitle();
  window.addEventListener('resize', buildArcTitle);
  window.addEventListener('resize', syncPlaylistToolsPanelBounds);
  controlsToggleBtn?.addEventListener('click', () => {
    const isHidden = !document.body.classList.contains('controls-hidden');
    setControlsHidden(isHidden);
  });

  Object.assign(context.actions, {
    buildArcTitle,
    isTypingTarget,
    normalizeText,
    setControlsHidden,
    setPlaylistToolsOpen,
    syncPlaylistToolsPanelBounds,
    syncRangeVisuals,
    updateRangeVisual,
    updateSearchClearBtn
  });
}
