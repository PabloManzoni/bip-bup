"""Synthesizes the mod's sound: a quick burst of high blips, a cartoon computer thinking, closed by a two-note ding.

Usage: python3 scripts/make_sound.py sounds/computing.wav
Soft square-wave tones (the first odd harmonics only), about 1.5 s, recorded quiet:
the mod's Volume setting scales it up to 4x from there.
"""
import math
import random
import struct
import sys
import wave

RATE = 44100
VOLUME = 0.08
random.seed(7)

# A pentatonic-ish set, so the random blips sound like a musical robot rather than noise.
PITCHES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760]


def blip(freq, ms, vol=VOLUME):
    n = int(RATE * ms / 1000)
    out = []
    for i in range(n):
        t = i / RATE
        # Soft square: the first odd harmonics only, so it beeps without being harsh.
        s = sum(math.sin(2 * math.pi * freq * k * t) / k for k in (1, 3, 5)) * 0.8
        attack = min(1.0, i / (RATE * 0.004))
        release = min(1.0, (n - i) / (RATE * 0.012))
        out.append(s * vol * attack * release)
    return out


def silence(ms):
    return [0.0] * int(RATE * ms / 1000)


samples = silence(40)
# The burst: sixteen quick blips at random pitches and lengths.
for _ in range(16):
    samples += blip(random.choice(PITCHES), random.choice([45, 55, 70])) + silence(18)
samples += silence(60)
# The ding that closes it.
samples += blip(1568, 90) + silence(40) + blip(2093, 160, vol=VOLUME * 0.78)

with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
