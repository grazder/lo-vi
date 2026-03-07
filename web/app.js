'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS    = ['#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77', '#c77dff', '#4d96ff'];
const LABEL_W   = 110;
const TRACK_H   = 96;
const OVERVIEW_H = 64;

// ─── State ───────────────────────────────────────────────────────────────────

let song     = null;   // { bpm, duration, tracks: [{name, notes: [{time,duration,midi,velocity}]}] }
let synths   = [];
let playing  = false;
let zoom     = 100;    // px per second
let offset   = 0;     // view left edge in seconds
let trackCanvases = [];

// ─── DOM refs ────────────────────────────────────────────────────────────────

const songSelect   = document.getElementById('song-select');
const btnPlay      = document.getElementById('btn-play');
const btnStop      = document.getElementById('btn-stop');
const btnDownload  = document.getElementById('btn-download');
const timeDisplay  = document.getElementById('time-display');
const bpmDisplay   = document.getElementById('bpm-display');
const overviewEl   = document.getElementById('overview');
const rulerEl      = document.getElementById('ruler');
const tracksEl     = document.getElementById('tracks');

// ─── Boot ────────────────────────────────────────────────────────────────────

(async function init() {
  const songs = await fetch('/api/songs').then(r => r.json());

  if (!songs.length) {
    tracksEl.innerHTML = '<p id="empty">no songs in output/ yet — run a song file first</p>';
    songSelect.innerHTML = '<option>no songs</option>';
    return;
  }

  songSelect.innerHTML = songs
    .map(s => `<option value="${s.name}">${s.label}</option>`)
    .join('');

  await loadSong(songs[0].name);

  songSelect.addEventListener('change', () => loadSong(songSelect.value));
  btnPlay.addEventListener('click', togglePlay);
  btnStop.addEventListener('click', doStop);
  btnDownload.addEventListener('click', renderAndDownload);
  overviewEl.addEventListener('click', seek);
  window.addEventListener('resize', renderAll);
})();

// ─── Load ────────────────────────────────────────────────────────────────────

async function loadSong(name) {
  doStop();
  disposeSynths();
  trackCanvases = [];
  tracksEl.innerHTML = '';

  song = await fetch(`/api/songs/${name}/midi`).then(r => r.json());

  Tone.Transport.bpm.value = song.bpm;
  bpmDisplay.textContent   = `${song.bpm} bpm`;

  fitZoom();
  buildTracks();
  scheduleSynths();
  renderAll();
}

function fitZoom() {
  zoom   = (window.innerWidth - LABEL_W) / song.duration;
  offset = 0;
}

// ─── Synths ──────────────────────────────────────────────────────────────────

// GM drum pitches → synth type
const DRUM_MAP = {
  35: 'kick', 36: 'kick',
  38: 'snare', 40: 'snare', 37: 'snare',
  42: 'chh', 44: 'chh',
  46: 'ohh', 49: 'ohh', 51: 'ohh',
};

function makeDrumKit() {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05, octaves: 8,
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.1 },
  }).toDestination();
  kick.volume.value = 2;

  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.04 },
  }).toDestination();
  snare.volume.value = -2;

  const chh = new Tone.MetalSynth({
    frequency: 600, harmonicity: 5.1, modulationIndex: 32,
    resonance: 4200, octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
  }).toDestination();
  chh.volume.value = -8;

  const ohh = new Tone.MetalSynth({
    frequency: 600, harmonicity: 5.1, modulationIndex: 32,
    resonance: 4200, octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.28, release: 0.12 },
  }).toDestination();
  ohh.volume.value = -8;

  return { kick, snare, chh, ohh };
}

// Returns a player object: { trigger(note, time), disposables[] }
function buildTrackPlayer(track) {
  if (track.channel === 9) {
    const kit = makeDrumKit();
    const disposables = Object.values(kit);

    function trigger(n, t) {
      const type = DRUM_MAP[n.midi];
      if (!type) return;
      if (type === 'kick')  kit.kick.triggerAttackRelease('C1', '8n', t, n.velocity);
      if (type === 'snare') kit.snare.triggerAttackRelease('16n', t, n.velocity);
      if (type === 'chh')   kit.chh.triggerAttackRelease(600, '32n', t, n.velocity);
      if (type === 'ohh')   kit.ohh.triggerAttackRelease(600, '8n', t, n.velocity);
    }

    return { trigger, disposables };
  } else {
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.set({
      oscillator: { type: 'triangle6' },
      envelope:   { attack: 0.01, decay: 0.25, sustain: 0.4, release: 1.2 },
    });
    synth.volume.value = -9;

    function trigger(n, t) {
      const freq = Tone.Frequency(n.midi, 'midi').toFrequency();
      synth.triggerAttackRelease(freq, Math.max(0.05, n.duration - 0.02), t, n.velocity);
    }

    return { trigger, disposables: [synth] };
  }
}

function scheduleSynths() {
  song.tracks.forEach(track => {
    const player = buildTrackPlayer(track);
    synths.push(...player.disposables);

    track.notes.forEach(n => {
      Tone.Transport.schedule(t => player.trigger(n, t), n.time);
    });
  });
}

function disposeSynths() {
  Tone.Transport.cancel();
  synths.forEach(s => s.dispose());
  synths = [];
}

// ─── Transport ───────────────────────────────────────────────────────────────

async function togglePlay() {
  await Tone.start();
  if (playing) {
    Tone.Transport.pause();
    btnPlay.innerHTML = '&#9654;';
    playing = false;
  } else {
    Tone.Transport.start();
    btnPlay.innerHTML = '&#9646;&#9646;';
    playing = true;
    requestAnimationFrame(tick);
  }
}

function doStop() {
  Tone.Transport.stop();
  btnPlay.innerHTML = '&#9654;';
  playing = false;
  renderAll();
}

// ─── Animation ───────────────────────────────────────────────────────────────

function tick() {
  if (!playing) return;

  const t     = Tone.Transport.seconds;
  const viewW = window.innerWidth - LABEL_W;

  // Auto-scroll: keep playhead visible past 70% of view width
  const scrollAt = offset + (viewW / zoom) * 0.7;
  if (t > scrollAt) {
    offset = t - (viewW / zoom) * 0.7;
    offset = Math.max(0, offset);
  }

  if (t >= song.duration) {
    doStop();
    return;
  }

  renderAll();
  requestAnimationFrame(tick);
}

// ─── Build track DOM ─────────────────────────────────────────────────────────

function buildTracks() {
  song.tracks.forEach((track, i) => {
    const color = COLORS[i % COLORS.length];

    const row = document.createElement('div');
    row.className = 'track-row';

    const label = document.createElement('div');
    label.className = 'row-label';
    label.innerHTML = `<span class="dot" style="background:${color}"></span>${track.name}`;

    const canvas = document.createElement('canvas');
    canvas.className = 'track-canvas';
    canvas.height = TRACK_H;
    canvas.addEventListener('wheel', onZoom, { passive: false });

    row.appendChild(label);
    row.appendChild(canvas);
    tracksEl.appendChild(row);

    trackCanvases.push({ canvas, track, color });
  });

  rulerEl.addEventListener('wheel', onZoom, { passive: false });
  overviewEl.addEventListener('wheel', onZoom, { passive: false });
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderAll() {
  if (!song) return;
  updateTime();
  renderOverview();
  renderRuler();
  trackCanvases.forEach(renderTrack);
}

function updateTime() {
  const t = Tone.Transport.seconds;
  timeDisplay.textContent = `${fmt(t)} / ${fmt(song.duration)}`;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// Overview — note-activity heatmap, always shows full song
function renderOverview() {
  const W   = overviewEl.width  = window.innerWidth;
  const H   = overviewEl.height = OVERVIEW_H;
  const ctx = overviewEl.getContext('2d');

  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, W, H);

  // Accumulate velocity-weighted note activity per pixel column
  const sPerBin = song.duration / W;
  const act     = new Float32Array(W);
  song.tracks.forEach(track => {
    track.notes.forEach(n => {
      const b0 = Math.floor(n.time / sPerBin);
      const b1 = Math.min(W - 1, Math.ceil((n.time + n.duration) / sPerBin));
      for (let b = b0; b <= b1; b++) act[b] += n.velocity;
    });
  });
  const peak = Math.max(...act, 0.001);

  // Gradient bars
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4ecdc4');
  grad.addColorStop(1, '#1a5c59');
  ctx.fillStyle = grad;
  for (let b = 0; b < W; b++) {
    const h = (act[b] / peak) * (H - 8);
    if (h > 0) ctx.fillRect(b, H - h - 4, 1, h);
  }

  // Viewport indicator box
  const vx = (offset / song.duration) * W;
  const vw = ((window.innerWidth - LABEL_W) / zoom / song.duration) * W;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(vx + 0.5, 0.5, Math.max(2, vw - 1), H - 1);

  // Playhead
  const ph = (Tone.Transport.seconds / song.duration) * W;
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(ph - 1, 0, 2, H);
}

// Time ruler
function renderRuler() {
  const W   = rulerEl.width  = window.innerWidth - LABEL_W;
  const H   = rulerEl.height = 22;
  const ctx = rulerEl.getContext('2d');

  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, W, H);

  // Pick tick interval so ticks are at least 50 px apart
  const intervals = [0.25, 0.5, 1, 2, 5, 10, 30, 60];
  const interval  = intervals.find(i => i * zoom >= 50) ?? 60;

  ctx.font      = '10px monospace';
  ctx.textBaseline = 'middle';

  const tStart = Math.ceil(offset / interval) * interval;
  for (let t = tStart; t < offset + W / zoom + interval; t += interval) {
    const x = (t - offset) * zoom;
    if (x < 0 || x > W) continue;

    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x - 0.5, H - 5, 1, 5);

    ctx.fillStyle = '#666';
    ctx.fillText(fmt(t), x + 3, H / 2);
  }

  // Playhead on ruler
  const ph = (Tone.Transport.seconds - offset) * zoom;
  if (ph >= 0 && ph <= W) {
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(ph - 1, 0, 2, H);
  }
}

// Piano roll for a single track
function renderTrack({ canvas, track, color }) {
  const W   = canvas.width  = window.innerWidth - LABEL_W;
  const H   = TRACK_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, W, H);

  if (!track.notes.length) return;

  // Pitch range for this track
  const pitches = track.notes.map(n => n.midi);
  const lo      = Math.min(...pitches) - 1;
  const hi      = Math.max(...pitches) + 1;
  const span    = hi - lo || 1;
  const rowH    = Math.max(2, (H - 4) / span);

  const tx = t => (t - offset) * zoom;
  const py = p => H - 2 - ((p - lo) / span) * (H - 4);

  // Subtle C-note horizontal lines
  ctx.strokeStyle = '#222';
  ctx.lineWidth   = 1;
  for (let p = lo; p <= hi; p++) {
    if (p % 12 === 0) {
      const y = py(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  // Notes
  const [r, g, b] = hexToRgb(color);
  track.notes.forEach(n => {
    const x = tx(n.time);
    const w = Math.max(2, n.duration * zoom - 1);
    if (x + w < 0 || x > W) return; // cull off-screen

    const y     = py(n.midi);
    const alpha = 0.35 + n.velocity * 0.65;
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fillRect(
      Math.max(0, x),
      y - rowH / 2,
      Math.min(w, W - Math.max(0, x)),
      rowH - 1
    );
  });

  // Playhead
  const ph = tx(Tone.Transport.seconds);
  if (ph >= 0 && ph <= W) {
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(ph - 1, 0, 2, H);
  }
}

// ─── Zoom ────────────────────────────────────────────────────────────────────

function onZoom(e) {
  e.preventDefault();
  if (!song) return;

  const factor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
  const rect   = e.currentTarget.getBoundingClientRect();
  const cx     = e.clientX - rect.left;
  const tAt    = offset + cx / zoom;

  zoom   = Math.max(4, Math.min(12000, zoom * factor));
  offset = tAt - cx / zoom;

  const maxOff = Math.max(0, song.duration - (window.innerWidth - LABEL_W) / zoom);
  offset = Math.max(0, Math.min(maxOff, offset));

  renderAll();
}

// ─── Seek (click on overview) ─────────────────────────────────────────────────

function seek(e) {
  if (!song) return;

  const t = Math.max(0, Math.min(song.duration, (e.clientX / window.innerWidth) * song.duration));

  const wasPlaying = playing;
  if (playing) {
    Tone.Transport.pause();
    playing = false;
  }

  // Reschedule so notes after seek point play correctly
  disposeSynths();
  Tone.Transport.seconds = t;
  scheduleSynths();

  // Center view on seek point
  const viewW = (window.innerWidth - LABEL_W) / zoom;
  offset = Math.max(0, Math.min(song.duration - viewW, t - viewW / 2));

  if (wasPlaying) {
    Tone.Transport.start();
    btnPlay.innerHTML = '&#9646;&#9646;';
    playing = true;
    requestAnimationFrame(tick);
  } else {
    renderAll();
  }
}

// ─── Download (offline render → WAV) ─────────────────────────────────────────

async function renderAndDownload() {
  if (!song) return;

  btnDownload.disabled = true;
  btnDownload.classList.add('rendering');
  btnDownload.textContent = 'rendering…';

  try {
    // Render in OfflineAudioContext — no Transport, schedule notes by absolute time directly.
    // Tone.Transport.schedule() doesn't work reliably inside Tone.Offline(); instead,
    // pass n.time as the third argument to triggerAttackRelease so Tone schedules
    // the note at that exact second within the offline context.
    const toneBuffer = await Tone.Offline(() => {
      song.tracks.forEach(track => {
        const player = buildTrackPlayer(track);
        track.notes.forEach(n => player.trigger(n, n.time));
      });
    }, song.duration + 2); // +2 s tail for release envelope

    const wavBuffer = encodeWav(toneBuffer.get());
    const blob      = new Blob([wavBuffer], { type: 'audio/wav' });
    const url       = URL.createObjectURL(blob);

    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${songSelect.value}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    btnDownload.disabled = false;
    btnDownload.classList.remove('rendering');
    btnDownload.innerHTML = '&#8595; wav';
  }
}

// Encode an AudioBuffer as a 16-bit PCM WAV ArrayBuffer
function encodeWav(ab) {
  const ch      = ab.numberOfChannels;
  const sr      = ab.sampleRate;
  const samples = ab.length;
  const bytes   = samples * ch * 2;          // 16-bit = 2 bytes per sample
  const buf     = new ArrayBuffer(44 + bytes);
  const v       = new DataView(buf);

  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };

  str(0,  'RIFF');  v.setUint32(4,  36 + bytes, true);
  str(8,  'WAVE');
  str(12, 'fmt ');  v.setUint32(16, 16, true);
  v.setUint16(20, 1,         true);   // PCM
  v.setUint16(22, ch,        true);
  v.setUint32(24, sr,        true);
  v.setUint32(28, sr*ch*2,   true);   // byte rate
  v.setUint16(32, ch*2,      true);   // block align
  v.setUint16(34, 16,        true);   // bits per sample
  str(36, 'data');  v.setUint32(40, bytes, true);

  let off = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, ab.getChannelData(c)[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }

  return buf;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
