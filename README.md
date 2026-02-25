<p align="center">
  <img src="docs/assets/banner.svg" alt="EchoGlow banner" width="85%">
</p>

## 🎧 Neon-themed Browser Audio Player
Neon-themed browser audio player with drag & drop playlists, real-time canvas visualizer, EQ presets, autosave, and keyboard shortcuts.

<p align="center">
  <img 
    src="docs/assets/image/preview.gif" 
    alt="EchoGlow preview"
    width="60%"
  />
</p>

---

## 🚀 Live Demo
- **Landing page:** https://nataliaans78-lang.github.io/EchoGlow/
- **Player demo:** https://nataliaans78-lang.github.io/EchoGlow/app/

---

## ✨ Features
- Drag & drop audio files **and folders**
- Playlist search
- Canvas visualizer with neon glow
- 3-band EQ (Bass / Mid / Treble) with presets + saved state
- Playlist and player state persistence (IndexedDB + localStorage)
- Clear modal with `Clear Playlist` and `Reset App`
- Toast feedback for autosave and storage limits
- Shuffle / Repeat
- Mobile layout with a slide-down playlist panel
- Keyboard shortcuts (play/pause, next/prev, seek, volume)
- Service Worker registration (PWA-ready app shell)

---

## 🖼️ Screenshots

<table>
  <tr>
    <td valign="top" width="50%">
      <img
        src="docs/assets/image/ScreenShot_2.png"
        alt="Desktop UI - Playlist and Controls"
        width="100%"
      />
    </td>
    <td valign="top" width="50%">
      <img
        src="docs/assets/image/ScreenShot_1.png"
        alt="Desktop UI - Main Player"
        width="100%"
      />
    </td>
  </tr>
  <tr>
    <td valign="top" width="50%">
      <img
        src="docs/assets/image/ScreenShot_3.png"
        alt="Desktop UI - Equalizer View"
        width="100%"
      />
    </td>
    <td valign="top" width="50%">
      <img
        src="docs/assets/image/ScreenShot_Mobile.png"
        alt="Mobile UI"
        height="340"
      />
    </td>
  </tr>
</table>

---

## 🛠️ Tech Stack
- HTML / CSS / Vanilla JS
- Web Audio API (AudioContext + BiquadFilter EQ + Analyser)
- IndexedDB + localStorage (optional persistence)
- Service Worker (offline-ready shell)

---

## ▶️ Run Locally

### Option A (quick)
Open `docs/app/index.html` in your browser.

### Option B (recommended — local server)
```bash
cd docs
python -m http.server 8000
```
