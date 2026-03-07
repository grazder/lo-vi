"""
DNB Break — 170 bpm, A minor
drums (ch 9) + bass (ch 1), 16 bars

Beat structure: bars 1-3 = pattern A, bar 4 = pattern B (busier kicks + bass fill)
"""

from pathlib import Path

import mido
from mido import Message, MetaMessage, MidiFile, MidiTrack

# ── Timing ────────────────────────────────────────────────────────────────────

BPM   = 170
TPB   = 480               # ticks per beat
TEMPO = mido.bpm2tempo(BPM)

T16 = TPB // 4            # 16th note = 120 ticks
T8  = TPB // 2            # 8th note  = 240 ticks
T4  = TPB                 # quarter   = 480 ticks
BAR = T4 * 4              # 1 bar     = 1920 ticks

BARS = 16

# ── GM drum pitches (channel 9 = MIDI ch 10) ─────────────────────────────────

KICK  = 36   # Bass Drum 1
SNARE = 38   # Acoustic Snare
CLHAT = 42   # Closed Hi-Hat
OHAT  = 46   # Open Hi-Hat
RIM   = 37   # Side Stick

# ── Bass pitches (channel 1) ──────────────────────────────────────────────────

A2 = 45; C3 = 48; D3 = 50; E3 = 52; G3 = 55; A3 = 57

# ── Drum patterns — 16th-note step grid (0–15 per bar) ───────────────────────
#
#   Steps per beat:  1=0  1.25=1  1.5=2  1.75=3
#                    2=4  2.25=5  2.5=6  2.75=7
#                    3=8  3.25=9  3.5=10 3.75=11
#                    4=12 4.25=13 4.5=14 4.75=15

def _hats(open_steps=(6, 14)):
    """All 16 hi-hats; open on open_steps, closed elsewhere."""
    hits = []
    for s in range(16):
        if s in open_steps:
            hits.append((s, OHAT, 75))
        else:
            hits.append((s, CLHAT, 82 if s % 2 == 0 else 52))
    return hits


DRUM_A = [                              # main groove
    (0,  KICK,  112), (3,  KICK,  90),
    (8,  KICK,  100),
    (4,  SNARE, 100), (10, SNARE, 65),  # ghost snare on 10
    (12, SNARE, 100),
    *_hats(),
]

DRUM_B = [                              # fill bar (busier kicks)
    (0,  KICK,  112), (3,  KICK,  90),
    (6,  KICK,   82), (9,  KICK,  78),
    (12, KICK,   90),
    (4,  SNARE, 100), (12, SNARE, 100), (15, SNARE, 82),
    *_hats(open_steps=(6, 13)),
]

# ── Bass patterns — 16th-note steps, (step, pitch, dur_in_16ths) ──────────────

BASS_A = [                              # root groove
    (0,  A2, 4),                        # beat 1 — root, quarter
    (6,  A2, 2),                        # beat 2.5 — synco
    (8,  G3, 2),                        # beat 3 — ♭7
    (10, A2, 2),                        # beat 3.5 — root back
    (14, E3, 2),                        # beat 4.5 — 5th pickup
]

BASS_B = [                              # fill bar
    (0,  A2, 2), (2,  C3, 2),           # beat 1 walk up
    (4,  E3, 4),                        # beat 2 — 5th, held
    (8,  A2, 2), (10, G3, 2),           # beat 3 root → ♭7
    (12, E3, 2), (14, A2, 2),           # beat 4 back down
]


# ── Event builders ────────────────────────────────────────────────────────────

def build_events(bars, pattern_selector, channel, is_drum=False):
    """
    Returns a flat list of (abs_tick, channel, pitch, velocity, is_note_on).
    pattern_selector(bar_index) → list of (step, pitch, vel_or_dur)
    """
    events = []
    gap = 10  # ticks of silence at note end (crisp articulation)

    for bar in range(bars):
        base = bar * BAR
        pat  = pattern_selector(bar)

        for entry in pat:
            step, pitch, val = entry
            t_on = base + step * T16

            if is_drum:
                vel   = val
                t_off = t_on + T16 - gap
            else:
                dur_16ths = val
                vel   = 95
                t_off = t_on + dur_16ths * T16 - gap

            events.append((t_on,  channel, pitch, vel, True))
            events.append((t_off, channel, pitch, 0,  False))

    # Sort: by tick, note-offs before note-ons at the same tick
    return sorted(events, key=lambda e: (e[0], e[4]))


def events_to_track(events, name, program=None, channel=None):
    track = MidiTrack()
    track.append(MetaMessage('track_name', name=name, time=0))
    if program is not None:
        track.append(Message('program_change', channel=channel, program=program, time=0))

    prev = 0
    for abs_tick, ch, pitch, vel, is_on in events:
        delta    = abs_tick - prev
        msg_type = 'note_on' if is_on else 'note_off'
        track.append(Message(msg_type, channel=ch, note=pitch, velocity=vel, time=delta))
        prev = abs_tick

    track.append(MetaMessage('end_of_track', time=0))
    return track


# ── Assemble ──────────────────────────────────────────────────────────────────

def drum_pat(bar):
    return DRUM_B if (bar + 1) % 4 == 0 else DRUM_A

def bass_pat(bar):
    return BASS_B if (bar + 1) % 4 == 0 else BASS_A


mid = MidiFile(ticks_per_beat=TPB, type=1)

meta = MidiTrack()
meta.append(MetaMessage('set_tempo', tempo=TEMPO, time=0))
meta.append(MetaMessage('time_signature',
    numerator=4, denominator=4,
    clocks_per_click=24, notated_32nd_notes_per_beat=8, time=0))
mid.tracks.append(meta)

mid.tracks.append(
    events_to_track(build_events(BARS, drum_pat, channel=9, is_drum=True), 'Drums')
)
mid.tracks.append(
    events_to_track(build_events(BARS, bass_pat, channel=1, is_drum=False),
                    'Bass', program=38, channel=1)   # GM 38 = Synth Bass 1
)


# ── Export ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    out = Path('output/dnb_break.mid')
    out.parent.mkdir(exist_ok=True)
    mid.save(str(out))
    print(f'Written: {out}')
