#!/usr/bin/env python3
"""Generate original, short instrumental demos for the Sonora prototype."""

import math
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 22050
DURATION = 24
ROOT = Path(__file__).resolve().parents[1] / "app" / "src" / "main" / "res" / "raw"

TRACKS = (
    ("moonlit_drive", 60, (0, 5, 3, 4), (0, 2, 4, 7, 9), 0.55),
    ("small_hours", 65, (0, 3, 5, 4), (0, 3, 5, 7, 10), 0.48),
    ("blue_window", 57, (0, 5, 1, 4), (0, 2, 5, 7, 9), 0.62),
    ("sunday_light", 69, (0, 4, 5, 3), (0, 2, 4, 7, 11), 0.5),
    ("quiet_bloom", 62, (0, 3, 4, 5), (0, 2, 3, 7, 9), 0.58),
    ("soft_landing", 58, (0, 4, 1, 5), (0, 2, 5, 7, 10), 0.45),
)


def midi_frequency(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def make_track(name: str, tonic: int, chords: tuple[int, ...], scale: tuple[int, ...], tempo: float) -> None:
    count = SAMPLE_RATE * DURATION
    audio = [0.0] * count
    beat = 60.0 / (tempo * 2)

    for chord_index, root_offset in enumerate(chords):
        start = chord_index * 4.0
        end = start + 4.0
        for semitones, amplitude in ((root_offset, 0.12), (root_offset + 7, 0.073),
                                     (root_offset + 12, 0.047), (root_offset + 16, 0.028)):
            frequency = midi_frequency(tonic + semitones)
            for frame in range(int(start * SAMPLE_RATE), min(count, int(end * SAMPLE_RATE))):
                time = frame / SAMPLE_RATE - start
                fade = min(1.0, time / 0.6, (4.0 - time) / 0.6)
                wobble = 1.0 + 0.002 * math.sin(2 * math.pi * 0.18 * time)
                audio[frame] += amplitude * max(0.0, fade) * (
                    math.sin(2 * math.pi * frequency * wobble * time)
                    + 0.22 * math.sin(4 * math.pi * frequency * wobble * time)
                )

    note_step = beat
    step_count = int(DURATION / note_step)
    for step in range(step_count):
        bar = step // int(4.0 / note_step)
        chord_root = chords[bar % len(chords)]
        note_index = (step * 3 + bar + (step // 5)) % len(scale)
        note = tonic + 12 + chord_root + scale[note_index]
        if step % 7 == 5:
            note += 12
        frequency = midi_frequency(note)
        start_frame = int(step * note_step * SAMPLE_RATE)
        note_duration = min(0.42, note_step * 0.82)
        for frame in range(start_frame, min(count, start_frame + int(note_duration * SAMPLE_RATE))):
            elapsed = (frame - start_frame) / SAMPLE_RATE
            envelope = min(1.0, elapsed / 0.018) * math.exp(-elapsed * 5.2)
            audio[frame] += 0.14 * envelope * (
                math.sin(2 * math.pi * frequency * elapsed)
                + 0.18 * math.sin(4 * math.pi * frequency * elapsed)
            )

    for beat_index in range(int(DURATION / beat)):
        start_frame = int(beat_index * beat * SAMPLE_RATE)
        is_downbeat = beat_index % 4 == 0
        amplitude = 0.16 if is_downbeat else 0.055
        length = int(0.13 * SAMPLE_RATE)
        for offset in range(min(length, count - start_frame)):
            elapsed = offset / SAMPLE_RATE
            pitch = 72 - 40 * min(1.0, elapsed / 0.12)
            audio[start_frame + offset] += amplitude * math.exp(-elapsed * 25) * math.sin(
                2 * math.pi * pitch * elapsed
            )

    peak = max(abs(sample) for sample in audio) or 1.0
    gain = min(0.88 / peak, 1.0)
    output = bytearray()
    for sample in audio:
        value = max(-1.0, min(1.0, sample * gain))
        output.extend(struct.pack("<h", round(value * 32767)))

    ROOT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(ROOT / f"{name}.wav"), "wb") as track_file:
        track_file.setnchannels(1)
        track_file.setsampwidth(2)
        track_file.setframerate(SAMPLE_RATE)
        track_file.writeframes(output)
    print(f"Generated {name}.wav ({DURATION}s)")


def main() -> None:
    for track in TRACKS:
        make_track(*track)


if __name__ == "__main__":
    main()
