export function initVisualizer(context) {
  const {
    refs: { canvas, ctx, visualizerContainer },
    state,
    constants: { VISUALIZER_CONSTANTS }
  } = context;

  const {
    desktopMaxBars: VISUALIZER_DESKTOP_MAX_BARS,
    desktopTargetFps: VISUALIZER_DESKTOP_TARGET_FPS,
    mobileMaxBars: VISUALIZER_MOBILE_MAX_BARS,
    mobileTargetFps: VISUALIZER_MOBILE_TARGET_FPS,
    shadowEvery: VISUALIZER_SHADOW_EVERY
  } = VISUALIZER_CONSTANTS;

  function computeAudioMetricsLocal(dataArray) {
    if (!dataArray?.length) {
      return { avgEnergy: 0, bassEnergy: 0 };
    }

    let total = 0;
    for (let i = 0; i < dataArray.length; i += 1) {
      total += dataArray[i];
    }

    const bassBins = Math.min(1020, dataArray.length);
    let bassTotal = 0;
    for (let i = 0; i < bassBins; i += 1) {
      bassTotal += dataArray[i];
    }

    return {
      avgEnergy: total / dataArray.length,
      bassEnergy: bassTotal / bassBins
    };
  }

  function initAudioMetricsWorker() {
    if (state.audioWorkerEnabled || state.audioMetricsWorker !== null) return;
    if (typeof Worker === 'undefined') return;

    try {
      state.audioMetricsWorker = new Worker('../../audioWorker.js');
      state.audioWorkerEnabled = true;
      state.audioMetricsWorker.onmessage = event => {
        const next = event.data;
        if (!next) return;
        window.audioMetrics = {
          avgEnergy: Number(next.avgEnergy) || 0,
          bassEnergy: Number(next.bassEnergy) || 0
        };
      };
      state.audioMetricsWorker.onerror = () => {
        state.audioWorkerEnabled = false;
        if (state.audioMetricsWorker) {
          state.audioMetricsWorker.terminate();
          state.audioMetricsWorker = null;
        }
      };
    } catch (_) {
      state.audioWorkerEnabled = false;
      state.audioMetricsWorker = null;
    }
  }

  function resizeCanvas() {
    if (!canvas || !visualizerContainer) return;
    canvas.width = visualizerContainer.clientWidth;
    canvas.height = visualizerContainer.clientHeight;
  }

  function updateReactiveBackground(dataArray) {
    if (!dataArray?.length) return;

    const bassBins = Math.min(20, dataArray.length);
    let bassSum = 0;
    for (let i = 0; i < bassBins; i += 1) {
      bassSum += dataArray[i];
    }

    const bassNormalized = (bassSum / bassBins) / 255;
    state.reactiveBassLevel = state.reactiveBassLevel * 0.86 + bassNormalized * 0.14;

    const bassLevel = Math.min(1, state.reactiveBassLevel * 1.45);
    const bloomLevel = Math.min(1, state.reactiveBassLevel * 1.2);

    document.documentElement.style.setProperty('--reactive-bass', bassLevel.toFixed(3));
    document.documentElement.style.setProperty('--reactive-bloom', bloomLevel.toFixed(3));
  }

  function drawVisualizer(bufferLength, dataArray) {
    if (!ctx || !canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const isMobile = window.innerWidth <= 768;
    const viewportScale = Math.min(window.innerWidth, window.innerHeight);
    const barScale = isMobile
      ? Math.max(0.82, Math.min(0.95, viewportScale / 780))
      : Math.min(1.62, Math.max(1.12, viewportScale / 780));
    const drawCount = Math.min(
      bufferLength,
      isMobile ? VISUALIZER_MOBILE_MAX_BARS : VISUALIZER_DESKTOP_MAX_BARS
    );
    const avgEnergy = Math.max(0, Math.min(1, (window.audioMetrics?.avgEnergy || 0) / 255));
    state.visualizerFrameTick += 1;

    const tailStart = Math.floor(drawCount * 0.9);
    let tailMax = 0;
    for (let i = tailStart; i < drawCount; i += 1) {
      if (dataArray[i] > tailMax) tailMax = dataArray[i];
    }
    const tailThreshold = tailMax * 0.9;

    for (let i = 0; i < drawCount; i += 1) {
      const rawBarHeight = dataArray[i];
      const motionBoost = 1 + avgEnergy * 0.22;
      const waveBoost = 1 + Math.sin((state.visualizerFrameTick * 0.06) + i * 0.22) * 0.06;
      const barHeight = rawBarHeight * motionBoost * waveBoost * barScale;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(i + 4.184);

      const hue = 195 + ((i * 3.2) % 78);
      const lightness = Math.min(72, 42 + barHeight * 0.26);
      const isTailHighlight = i >= tailStart && barHeight >= tailThreshold && tailMax > 0;
      const normalizedBar = barHeight / 255;
      const isTopBar = normalizedBar > 0.72;
      const isHighBar = normalizedBar > 0.58;
      const isAccentBar = normalizedBar > 0.46 && (i % 4 === 0 || i % 5 === 0);
      const isLeftLowerAccentBar = i >= Math.floor(drawCount * 0.1) &&
        i <= Math.floor(drawCount * 0.18) &&
        normalizedBar > 0.72 &&
        hue >= 185 &&
        hue <= 225;
      const isRightLowerAccentBar = i >= Math.floor(drawCount * 0.82) &&
        i <= Math.floor(drawCount * 0.92) &&
        normalizedBar > 0.72 &&
        hue >= 185 &&
        hue <= 225;
      const shouldGlow = isTailHighlight ||
        (isTopBar && (i % 3 === 0 || i % 4 === 0 || i % 5 === 0)) ||
        (isHighBar && i % 5 === 0) ||
        isAccentBar ||
        isLeftLowerAccentBar ||
        isRightLowerAccentBar;
      const shouldBoostGlow = isTailHighlight ||
        (isTopBar && (i % 4 === 0 || i % 6 === 0)) ||
        isLeftLowerAccentBar ||
        isRightLowerAccentBar;
      const capY = barHeight + barHeight / 2;
      const capRadius = Math.max(isMobile ? 1.7 : 1.45, barHeight / (isMobile ? 10.5 : 11.5));
      ctx.strokeStyle = `hsl(${hue}, 100%, ${lightness}%)`;
      ctx.shadowBlur = 0;
      ctx.lineWidth = (isMobile ? 1.05 : 0.95) + normalizedBar * (isMobile ? 0.55 : 0.4);

      const prevBar = dataArray[(i - 1 + drawCount) % drawCount];
      const nextBar = dataArray[(i + 1) % drawCount];
      const prev2Bar = dataArray[(i - 2 + drawCount) % drawCount];
      const next2Bar = dataArray[(i + 2) % drawCount];
      const isNeighborOfTallBar = (
        barHeight < tailThreshold &&
        (prevBar >= tailThreshold || nextBar >= tailThreshold || prev2Bar >= tailThreshold || next2Bar >= tailThreshold)
      );

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, barHeight);
      ctx.arc(0, capY, barHeight / (isMobile ? 9 : 10), 0, Math.PI * 2);
      ctx.stroke();

      if (isNeighborOfTallBar) {
        ctx.save();
        ctx.shadowBlur = isMobile ? 14 : 10;
        ctx.shadowColor = `hsla(${hue}, 100%, 72%, 0.28)`;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = isMobile ? 1.4 : 1.1;
        ctx.strokeStyle = `hsla(${hue}, 100%, 78%, 0.22)`;
        ctx.beginPath();
        ctx.arc(0, capY, (barHeight / (isMobile ? 9 : 10)) * 1.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (shouldGlow) {
        ctx.globalCompositeOperation = 'lighter';
        const isTopGlowBar = isTailHighlight || normalizedBar > 0.82;
        ctx.lineWidth = shouldBoostGlow
          ? (isMobile ? 3.15 : 2.55)
          : (isMobile ? 1.9 : 1.55);
        ctx.shadowBlur = isTailHighlight
          ? (isMobile ? 54 : 44)
          : (isTopGlowBar ? (isMobile ? 30 : 22) : (isHighBar ? (isMobile ? 20 : 15) : (isMobile ? 12 : 9)));
        ctx.shadowColor = `hsla(${hue}, 100%, 62%, ${shouldBoostGlow ? 0.95 : (isTopGlowBar ? 0.46 : (isHighBar ? 0.28 : 0.18))})`;
        ctx.strokeStyle = `hsla(${hue}, 100%, 74%, ${shouldBoostGlow ? 0.95 : (isTopGlowBar ? 0.72 : (isHighBar ? 0.52 : 0.36))})`;
        ctx.beginPath();
        ctx.arc(0, capY, capRadius * (shouldBoostGlow ? 1.52 : (isTopGlowBar ? 1.24 : 1.12)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    }
  }

  function resetVisualizerState() {
    if (!ctx || !canvas) return;
    canvas.width = canvas.width;
    canvas.height = canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    state.reactiveBassLevel = 0;
    document.documentElement.style.setProperty('--reactive-bass', '0');
    document.documentElement.style.setProperty('--reactive-bloom', '0');
  }

  function stopVisualizer() {
    state.visualizerRunToken += 1;
    if (state.visualizerAnimationId !== null) {
      cancelAnimationFrame(state.visualizerAnimationId);
      state.visualizerAnimationId = null;
    }
    resetVisualizerState();
  }

  function startVisualizer() {
    if (!state.analyser) return;

    state.visualizerRunToken += 1;
    const runToken = state.visualizerRunToken;

    if (state.visualizerAnimationId !== null) {
      cancelAnimationFrame(state.visualizerAnimationId);
    }

    const bufferLength = state.analyser.frequencyBinCount;
    if (!state.visualizerDataArray || state.visualizerBufferLength !== bufferLength) {
      state.visualizerDataArray = new Uint8Array(bufferLength);
      state.visualizerBufferLength = bufferLength;
    }

    function animate(timestamp) {
      if (runToken !== state.visualizerRunToken) return;
      const isMobile = window.innerWidth <= 768;
      const targetFps = isMobile ? VISUALIZER_MOBILE_TARGET_FPS : VISUALIZER_DESKTOP_TARGET_FPS;
      const frameInterval = 1000 / targetFps;
      if (timestamp && timestamp - state.visualizerLastFrameAt < frameInterval) {
        state.visualizerAnimationId = requestAnimationFrame(animate);
        return;
      }

      state.visualizerLastFrameAt = timestamp || performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      state.analyser.getByteFrequencyData(state.visualizerDataArray);

      if (state.audioWorkerEnabled && state.audioMetricsWorker) {
        state.audioWorkerFrameTick = (state.audioWorkerFrameTick + 1) % 3;
        if (state.audioWorkerFrameTick === 0) {
          const workerBuffer = new Uint8Array(state.visualizerDataArray);
          state.audioMetricsWorker.postMessage({ frequencyData: workerBuffer }, [workerBuffer.buffer]);
        }
      } else {
        window.audioMetrics = computeAudioMetricsLocal(state.visualizerDataArray);
      }

      updateReactiveBackground(state.visualizerDataArray);
      drawVisualizer(bufferLength, state.visualizerDataArray);
      state.visualizerAnimationId = requestAnimationFrame(animate);
    }

    animate();
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  Object.assign(context.actions, {
    initAudioMetricsWorker,
    resizeCanvas,
    startVisualizer,
    stopVisualizer
  });
}
