"""Synthesizes the mod's sound: a soft, short "beep bop boop" of a cartoon computer thinking.

Usage: python3 scripts/make_sound.py sounds/computing.wav
Pure sine tones with a hint of harmonics, gentle fades, low volume, ~0.75 s in all.
"""
import math
import struct
import sys
import wave

RATE = 44100
VOLUME = 0.15

# (frequency in Hz, length in ms): beep, bop, boop. The last one lands lower and longer.
NOTES = [(659, 130), (523, 130), (392, 190)]
GAP_MS = 60


def tone(freq, ms):
    n = int(RATE * ms / 1000)
    attack = int(RATE * 0.010)
    release = int(RATE * 0.045)
    out = []
    for i in range(n):
        t = i / RATE
        # A sine with a touch of the 2nd and 3rd harmonics: warm, a little "digital", never harsh.
        s = math.sin(2 * math.pi * freq * t) + 0.12 * math.sin(4 * math.pi * freq * t) + 0.04 * math.sin(6 * math.pi * freq * t)
        env = 1.0
        if i < attack:
            env = 0.5 - 0.5 * math.cos(math.pi * i / attack)
        elif n - i < release:
            env = 0.5 - 0.5 * math.cos(math.pi * (n - i) / release)
        out.append(s * VOLUME * env)
    return out


def silence(ms):
    return [0.0] * int(RATE * ms / 1000)


samples = silence(40)
for index, (freq, ms) in enumerate(NOTES):
    if index:
        samples += silence(GAP_MS)
    samples += tone(freq, ms)
samples += silence(120)

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
