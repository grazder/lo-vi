# lo-vi

Вайбкодинг музыки. Каждая песня — это Python-файл, и код *и есть* партитура.

Принцип DIY/lo-fi: никакого DAW, никакого GUI — просто пиши структуру, аккорды и мелодию прямо в коде и запускай.

Куда движется проект — AI-DAW в браузере, где музыку делаешь в разговоре с AI, — описано в [PRODUCT.md](PRODUCT.md).

---

## Идея

```python
# songs/first_light.py
PROGRESSION = [
    [(Am, 2.0), (F, 2.0)],
    [(C,  2.0), (G, 2.0)],
]

add_progression(chords_part, times=2)
add_melody(melody_part, verse_melody_notes)
```

Каждый `songs/*.py` генерирует MIDI-файл в `output/`. Веб-демо позволяет послушать его в минималистичном DAW-подобном интерфейсе: обзор формы, пиано-ролл по трекам, зум, перемотка, экспорт в WAV.

## Песни

| Файл | BPM | Тональность | Инструменты |
|------|-----|-------------|-------------|
| `songs/first_light.py` | 72 | Am | music21 |
| `songs/dnb_break.py` | 170 | Am | mido |

## Установка

Нужен [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/grazder/lo-vi
cd lo-vi
uv sync
```

## Использование

```bash
# Написать песню → MIDI
uv run songs/first_light.py
# output/first_light.mid

# Открыть веб-демо
uv run web/server.py
# → http://127.0.0.1:8080
```

Веб-демо проигрывает любой MIDI из `output/` синтезированным звуком (Tone.js), показывает «форму волны» по активности нот и пиано-роллы по трекам, умеет экспортировать WAV.

## Как написать песню

**Мелодические инструменты** — через [music21](https://web.mit.edu/music21/):

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

`quarterLength`: `4.0` — целая, `2.0` — половинная, `1.0` — четвертная, `0.5` — восьмая.

**Биты и барабаны** — через [mido](https://mido.readthedocs.io/) для прямого управления MIDI (канал 9 = перкуссия GM):

```python
import mido
from mido import MidiFile, MidiTrack, Message

KICK, SNARE, CLHAT = 36, 38, 42   # карта ударных GM

mid = MidiFile(ticks_per_beat=480)
# собрать треки, записать сообщения note_on/note_off на channel=9
mid.save("output/my_beat.mid")
```

## Стек

- [music21](https://web.mit.edu/music21/) — теория музыки, нотация, генерация MIDI
- [mido](https://mido.readthedocs.io/) — низкоуровневый MIDI, барабанные треки
- [Tone.js](https://tonejs.github.io/) — синтез в браузере и офлайн-рендер WAV
- [FastAPI](https://fastapi.tiangolo.com/) — dev-сервер, API MIDI→JSON
