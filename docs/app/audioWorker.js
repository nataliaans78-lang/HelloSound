self.onmessage = (event) => {
  const payload = event.data || {};
  const frequencyData = payload.frequencyData;

  if (!frequencyData || typeof frequencyData.length !== 'number') {
    return;
  }

  const length = frequencyData.length;
  if (!length) {
    self.postMessage({ avgEnergy: 0, bassEnergy: 0 });
    return;
  }

  let total = 0;
  for (let i = 0; i < length; i += 1) {
    total += frequencyData[i];
  }

  const bassBins = Math.min(1020, length);
  let bassTotal = 0;
  for (let i = 0; i < bassBins; i += 1) {
    bassTotal += frequencyData[i];
  }

  self.postMessage({
    avgEnergy: total / length,
    bassEnergy: bassTotal / bassBins
  });
};
