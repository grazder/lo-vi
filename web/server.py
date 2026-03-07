#!/usr/bin/env python3
"""Dev server for the lo-vi web demo.

Run from project root:
    uv run web/server.py
"""

from pathlib import Path

import mido
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).parent.parent  # project root

app = FastAPI()


# ── MIDI → JSON ──────────────────────────────────────────────────────────────


def midi_to_json(path: Path) -> dict:
    mid = mido.MidiFile(str(path))
    tpb = mid.ticks_per_beat

    # Collect all tempo change events (from any track)
    tempo_map: list[tuple[int, int]] = []
    for track in mid.tracks:
        abs_tick = 0
        for msg in track:
            abs_tick += msg.time
            if msg.type == "set_tempo":
                tempo_map.append((abs_tick, msg.tempo))
    tempo_map.sort()
    if not tempo_map:
        tempo_map = [(0, 500_000)]  # default 120 bpm

    def ticks_to_sec(tick: int) -> float:
        sec = 0.0
        cur_tick = 0
        cur_tempo = 500_000
        for tc_tick, tc_tempo in tempo_map:
            if tc_tick >= tick:
                break
            sec += mido.tick2second(tc_tick - cur_tick, tpb, cur_tempo)
            cur_tick = tc_tick
            cur_tempo = tc_tempo
        sec += mido.tick2second(tick - cur_tick, tpb, cur_tempo)
        return sec

    tracks_out = []
    duration = 0.0

    for track in mid.tracks:
        notes: list[dict] = []
        active: dict[int, tuple[float, float]] = {}  # pitch → (start_sec, velocity)
        abs_tick = 0
        channel: int | None = None

        for msg in track:
            abs_tick += msg.time
            t = ticks_to_sec(abs_tick)

            if hasattr(msg, "channel") and channel is None:
                channel = msg.channel  # first channel seen in this track

            if msg.type == "note_on" and msg.velocity > 0:
                active[msg.note] = (t, msg.velocity / 127.0)
            elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
                if msg.note in active:
                    start, vel = active.pop(msg.note)
                    dur = max(0.01, t - start)
                    notes.append({"time": start, "duration": dur, "midi": msg.note, "velocity": vel})
                    duration = max(duration, t)

        if notes:
            tracks_out.append(
                {
                    "name": track.name or f"Track {len(tracks_out) + 1}",
                    "channel": channel,
                    "notes": sorted(notes, key=lambda n: n["time"]),
                }
            )

    bpm = round(60_000_000 / tempo_map[0][1]) if tempo_map else 120
    return {"bpm": bpm, "duration": duration + 1.0, "tracks": tracks_out}


# ── API ───────────────────────────────────────────────────────────────────────


@app.get("/api/songs")
def list_songs():
    output_dir = ROOT / "output"
    files = sorted(output_dir.glob("*.mid"))
    return [{"name": f.stem, "label": f.stem.replace("_", " ")} for f in files]


@app.get("/api/songs/{name}/midi")
def get_song_midi(name: str):
    path = ROOT / "output" / f"{name}.mid"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Song not found")
    return JSONResponse(midi_to_json(path))


# ── Static files ──────────────────────────────────────────────────────────────

# Serve MIDI files so the browser can download them if needed
app.mount("/output", StaticFiles(directory=str(ROOT / "output")), name="output")

# Serve web UI (must be last — catches everything else)
app.mount("/", StaticFiles(directory=str(ROOT / "web"), html=True), name="web")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    print("lo-vi  →  http://127.0.0.1:8080")
    uvicorn.run(app, host="127.0.0.1", port=8080)
