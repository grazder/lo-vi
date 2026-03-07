"""
First Light — первая песня проекта lo-vi.

Структура: intro → verse → chorus → verse → chorus → outro
Тональность: Am  Темп: 72 bpm
"""

from music21 import chord, metadata, note, stream, tempo

# --- Song setup ---------------------------------------------------------

score = stream.Score()
score.metadata = metadata.Metadata()
score.metadata.title = "First Light"
score.metadata.composer = "lo-vi"

BPM = 72


def part(name: str) -> stream.Part:
    p = stream.Part()
    p.id = name
    p.append(tempo.MetronomeMark(number=BPM))  # fresh object per part
    return p


# --- Chord helpers -------------------------------------------------------

# Chord data: pitches only (new Chord objects created on each use)
Am = ["A3", "C4", "E4"]
F  = ["F3", "A3", "C4"]
C  = ["C3", "E3", "G3"]
G  = ["G3", "B3", "D4"]

# Progression as raw data: list of (pitches, duration) per bar
PROGRESSION: list[list[tuple[list[str], float]]] = [
    [(Am, 2.0), (F, 2.0)],
    [(C,  2.0), (G, 2.0)],
]


def add_progression(part: stream.Part, times: int = 1) -> None:
    """Append chord progression, creating fresh objects each time."""
    for _ in range(times):
        for bar in PROGRESSION:
            for pitches, dur in bar:
                part.append(chord.Chord(pitches, quarterLength=dur))


# --- Melody (verse) ------------------------------------------------------

verse_melody_notes = [
    # bar 1: Am
    ("A4", 1.0), ("C5", 1.0), ("E5", 0.5), ("D5", 0.5), ("C5", 1.0),
    # bar 2: F
    ("C5", 1.0), ("A4", 1.0), ("G4", 2.0),
    # bar 3: C
    ("G4", 1.0), ("E4", 1.0), ("G4", 0.5), ("A4", 0.5), ("G4", 1.0),
    # bar 4: G
    ("B4", 1.0), ("D5", 1.0), ("B4", 2.0),
]

chorus_melody_notes = [
    # bar 1: Am
    ("E5", 2.0), ("D5", 1.0), ("C5", 1.0),
    # bar 2: F
    ("A4", 4.0),
    # bar 3: C
    ("G4", 2.0), ("E4", 2.0),
    # bar 4: G
    ("D5", 2.0), ("B4", 2.0),
]


def add_melody(part: stream.Part, notes_list: list[tuple[str, float]]) -> None:
    for pitch, dur in notes_list:
        part.append(note.Note(pitch, quarterLength=dur))


# --- Build the song ------------------------------------------------------

chords_part = part("Chords")
melody_part = part("Melody")

# Intro (chords only, 1 pass)
add_progression(chords_part, times=1)
for _ in range(4):  # 4 bars of rest in melody during intro
    melody_part.append(note.Rest(quarterLength=4.0))

# Verse
add_progression(chords_part, times=2)
add_melody(melody_part, verse_melody_notes)
add_melody(melody_part, verse_melody_notes)

# Chorus
add_progression(chords_part, times=2)
add_melody(melody_part, chorus_melody_notes)
add_melody(melody_part, chorus_melody_notes)

# Outro (chords only, fade out feel)
add_progression(chords_part, times=1)
for _ in range(4):
    melody_part.append(note.Rest(quarterLength=4.0))

score.append(chords_part)
score.append(melody_part)

# --- Export --------------------------------------------------------------

if __name__ == "__main__":
    out = score.write("midi", fp="output/first_light.mid")
    print(f"Written: {out}")
