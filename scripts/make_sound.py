"""Synthesizes the mod's sounds: a soft, short "beep bop boop" of a cartoon computer thinking.

Usage: python3 scripts/make_sound.py sounds/computing.wav
       python3 scripts/make_sound.py sounds/where-are-we.wav pm
Pure sine tones with a hint of harmonics, gentle fades, low volume, under a second in all.
"""
import math
import struct
import sys
import wave

RATE = 44100

VOICES = {
    # (frequency in Hz, length in ms): beep, bop, boop. The last one lands lower and longer. ~0.75 s.
    "computing": {
        "notes": [(659, 130), (523, 130), (392, 190)],
        "gap_ms": 60,
        "volume": 0.075,
        "harmonics": (0.12, 0.04),
        "attack": 0.010,
        "release": 0.045,
    },
    # PM Mode: six quick, high bips that go up and down, like a computer typing. ~0.77 s.
    # A little quieter than the other: high notes sound louder.
    "pm": {
        "notes": [(1047, 70), (1319, 70), (1175, 70), (1568, 70), (1319, 70), (1760, 90)],
        "gap_ms": 35,
        "volume": 0.065,
        "harmonics": (0.08, 0.02),
        "attack": 0.006,
        "release": 0.025,
    },
}


def tone(freq, ms, voice):
    n = int(RATE * ms / 1000)
    attack = int(RATE * voice["attack"])
    release = int(RATE * voice["release"])
    second, third = voice["harmonics"]
    out = []
    for i in range(n):
        t = i / RATE
        # A sine with a touch of the 2nd and 3rd harmonics: warm, a little "digital", never harsh.
        s = math.sin(2 * math.pi * freq * t) + second * math.sin(4 * math.pi * freq * t) + third * math.sin(6 * math.pi * freq * t)
        env = 1.0
        if i < attack:
            env = 0.5 - 0.5 * math.cos(math.pi * i / attack)
        elif n - i < release:
            env = 0.5 - 0.5 * math.cos(math.pi * (n - i) / release)
        out.append(s * voice["volume"] * env)
    return out


def silence(ms):
    return [0.0] * int(RATE * ms / 1000)


voice = VOICES[sys.argv[2] if len(sys.argv) > 2 else "computing"]
samples = silence(40)
for index, (freq, ms) in enumerate(voice["notes"]):
    if index:
        samples += silence(voice["gap_ms"])
    samples += tone(freq, ms, voice)
samples += silence(120)

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
