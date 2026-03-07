# lo-vi

Vibecoding music. Each song is a Python file — the code *is* the score.

DIY/lo-fi principle: no DAW, no GUI, just write the structure, chords, and melody directly in code and run it.

---

## Idea

```python
# songs/first_light.py
PROGRESSION = [
    [(Am, 2.0), (F, 2.0)],
    [(C,  2.0), (G, 2.0)],
]

add_progression(chords_part, times=2)
add_melody(melody_part, verse_melody_notes)
```

Each `songs/*.py` generates a MIDI file in `output/`. The web demo lets you listen to it in a minimal DAW-like interface — waveform overview, per-track piano roll, zoom, seek, WAV export.

## Songs

| File | BPM | Key | Tools |
|------|-----|-----|-------|
| `songs/first_light.py` | 72 | Am | music21 |
| `songs/dnb_break.py` | 170 | Am | mido |

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/grazder/lo-vi
cd lo-vi
uv sync
```

## Usage

```bash
# Write a song → MIDI
uv run songs/first_light.py
# output/first_light.mid

# Open the web demo
uv run web/server.py
# → http://127.0.0.1:8080
```

The web demo plays back any MIDI in `output/` using synthesized audio (Tone.js), shows a note-activity waveform and per-track piano rolls, and can export WAV.

## Writing a song

**Pitched instruments** — use [music21](https://web.mit.edu/music21/):

```python
from music21 import stream, note, chord, tempo

score = stream.Score()
part  = stream.Part()
part.append(tempo.MetronomeMark(number=90))
part.append(chord.Chord(["A3", "C4", "E4"], quarterLength=2.0))
part.append(note.Note("E5", quarterLength=1.0))
score.append(part)
score.write("midi", fp="output/my_song.mid")
```

`quarterLength`: `4.0` = whole, `2.0` = half, `1.0` = quarter, `0.5` = eighth.

**Beats and drums** — use [mido](https://mido.readthedocs.io/) for direct MIDI control (channel 9 = GM percussion):

```python
import mido
from mido import MidiFile, MidiTrack, Message

KICK, SNARE, CLHAT = 36, 38, 42   # GM drum map

mid = MidiFile(ticks_per_beat=480)
# build tracks, write note_on/note_off messages on channel=9
mid.save("output/my_beat.mid")
```

## Stack

- [music21](https://web.mit.edu/music21/) — music theory, notation, MIDI generation
- [mido](https://mido.readthedocs.io/) — low-level MIDI, drum tracks
- [Tone.js](https://tonejs.github.io/) — browser synthesis and offline WAV render
- [FastAPI](https://fastapi.tiangolo.com/) — dev server, MIDI→JSON API
