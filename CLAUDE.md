# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**lo-vi** — вайбкодинг музыки. Каждая песня — это Python-файл в `songs/`, описывающий структуру, аккорды и мелодию напрямую через music21. Принцип DIY/lo-fi: код и есть партитура.

## Commands

```bash
# Run a song (generate MIDI into output/)
uv run songs/first_light.py

# Start the web DAW demo → http://127.0.0.1:8080
uv run web/server.py

# Install dependencies
uv sync

# Add a new dependency
uv add <package>
```

MIDI output lands in `output/` (git-ignored).

## Architecture

Each song is a self-contained script in `songs/`. No shared library — songs import directly from `music21`.

**Typical song structure:**
1. Create a `stream.Score` with `metadata.Metadata`
2. Build `stream.Part` objects (one per instrument/voice)
3. Append `chord.Chord`, `note.Note`, `note.Rest`, and `tempo.MetronomeMark` objects
4. Call `score.write("midi", fp="output/<name>.mid")`

**Key music21 objects used:**
- `stream.Score` / `stream.Part` — containers for musical content
- `chord.Chord(pitches, quarterLength=...)` — pitches as e.g. `["A3","C4","E4"]`
- `note.Note("A4", quarterLength=1.0)` — quarter note = 1.0
- `note.Rest(quarterLength=4.0)` — silence
- `tempo.MetronomeMark(number=72)` — BPM, added to a Part

**Duration convention:** `quarterLength` — 4.0 = whole note, 2.0 = half, 1.0 = quarter, 0.5 = eighth.

## Web demo (web/)

`web/server.py` is a FastAPI server that:
- `GET /api/songs` → lists `output/*.mid` files
- `GET /api/songs/{name}/midi` → parses MIDI with `mido` and returns JSON `{bpm, duration, tracks}`
- Serves `web/` as static root, `output/` at `/output/`

`web/app.js` (vanilla JS + Tone.js 14.x via CDN):
- Fetches MIDI JSON, schedules notes with `Tone.PolySynth` via `Tone.Transport.schedule`
- Renders overview (note-activity heatmap over full song), time ruler, and per-track piano rolls on `<canvas>`
- Zoom: scroll wheel on any track canvas or ruler scales `zoom` (px/sec) around cursor time
- Seek: click overview → reschedule synths + set `Tone.Transport.seconds`
- Auto-scroll: keeps playhead visible past 70% of view width

**Important Tone.js 14.x gotchas:**
- Objects (notes, chords, MetronomeMark) can only belong to one `stream` — always create fresh instances when appending multiple times
- `Tone.Transport.schedule()` uses absolute seconds; seeking backward requires `cancel()` + reschedule
- Must call `await Tone.start()` on a user gesture before starting the Transport

## Output formats

music21 can write to multiple formats via `score.write(fmt, fp=...)`:
- `"midi"` — MIDI file
- `"musicxml"` — MusicXML (importable in MuseScore, Sibelius)
- `"lilypond"` — sheet music (requires LilyPond installed)
- `"braille.music"` — Braille notation
