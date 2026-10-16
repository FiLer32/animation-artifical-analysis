#!/usr/bin/env python3
"""
make_audio.py — саундтрек ролика, синтезированный с нуля на numpy.

Что делает:
  1. читает audio/cues.json — звуковые события ролика с абсолютным временем
     (их размечают анимации, выгружает audio/export_cues.js);
  2. пишет чиптюн-музыку 120 BPM (квадрат, треугольник, шумовые барабаны),
     аранжировка меняется по сценам: интро, объяснение, диаграмма, разгон
     перед барабанной дробью, тёмная пауза перед 1 местом, фанфары, финал;
  3. синтезирует звуковые эффекты под каждое событие: щелчки клешнёй,
     прыжки, печать текста, переходы, барабанную дробь, корону, конфетти…;
  4. сводит всё, мягко ограничивает и сохраняет audio/soundtrack.wav
     (48 кГц, 16 бит, стерео);
  5. с флагом --mux вклеивает дорожку в видео через ffmpeg.

Запуск:
  python3 audio/make_audio.py                      # только soundtrack.wav
  python3 audio/make_audio.py --mux video/top3-ai-artificial-analysis.mp4

Нужен только numpy (pip install numpy); для --mux — ffmpeg в PATH.
Звук детерминированный: шум и «случайные» ноты идут из генератора с seed.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import wave

import numpy as np

SR = 48_000                       # частота дискретизации
BPM = 120
BEAT = 60 / BPM                   # 0.5 с
S16 = BEAT / 4                    # шестнадцатая = 0.125 с
BAR = BEAT * 4                    # такт = 2 с

HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(20261016)


# =============================================================================
# Базовые кирпичики синтеза
# =============================================================================

def mtof(m):
    """MIDI-нота → частота, Гц."""
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def tt(dur):
    """Время сэмплов [0, dur)."""
    return np.arange(int(round(dur * SR))) / SR


def phase(freq, n):
    """Фаза для постоянной частоты или массива частот (свипы)."""
    f = np.asarray(freq, dtype=float)
    if f.ndim:                      # массив частот: подогнать длину (±1 сэмпл от округлений)
        f = f[:n] if len(f) >= n else np.pad(f, (0, n - len(f)), mode='edge')
    else:
        f = np.full(n, float(f))
    return np.cumsum(f) / SR


def square(freq, dur, duty=0.5):
    n = int(round(dur * SR))
    ph = phase(freq, n) % 1.0
    # минус среднее (2·duty − 1): узкий импульс иначе даёт постоянную составляющую
    return np.where(ph < duty, 1.0, -1.0) - (2 * duty - 1)


def triangle(freq, dur):
    n = int(round(dur * SR))
    ph = phase(freq, n) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def saw(freq, dur):
    n = int(round(dur * SR))
    ph = phase(freq, n) % 1.0
    return 2 * ph - 1


def sine(freq, dur):
    n = int(round(dur * SR))
    return np.sin(2 * np.pi * phase(freq, n))


def noise(dur):
    return rng.uniform(-1, 1, int(round(dur * SR)))


def sweep(f0, f1, dur, kind='exp'):
    """Массив частот от f0 до f1 (экспоненциально или линейно)."""
    x = np.linspace(0, 1, int(round(dur * SR)))
    return f0 * (f1 / f0) ** x if kind == 'exp' else f0 + (f1 - f0) * x


def env_ad(dur, a=0.005, curve=6.0):
    """Атака + экспоненциальный спад до нуля."""
    t = tt(dur)
    e = np.exp(-curve * t / max(dur, 1e-6))
    if a > 0:
        e *= np.clip(t / a, 0, 1)
    return e * fade_tail(len(t))


def env_adsr(dur, a=0.005, d=0.05, s=0.6, r=0.05):
    t = tt(dur)
    e = np.where(t < a, t / max(a, 1e-6),
                 np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e * rel


def fade_tail(n, ms=4):
    """Короткий хвост, чтобы не было щелчков на обрезке."""
    k = min(n, int(SR * ms / 1000))
    f = np.ones(n)
    if k:
        f[-k:] = np.linspace(1, 0, k)
    return f


def band(x, lo=None, hi=None):
    """Полосовой фильтр через FFT (для шумов и коротких звуков)."""
    if len(x) < 8:
        return x
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def lowpass_sweep(x, c0, c1):
    """Однополюсный ФНЧ с плавно меняющейся частотой среза (для разгона)."""
    cut = sweep(c0, c1, len(x) / SR)[:len(x)]
    a = 1 - np.exp(-2 * np.pi * cut / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


# =============================================================================
# Микшер
# =============================================================================

class Bus:
    """Стерео-шина: add() кладёт моно-сигнал в момент t с панорамой."""

    def __init__(self, dur):
        self.buf = np.zeros((2, int(round(dur * SR)) + SR))

    def add(self, t, sig, gain=1.0, pan=0.0):
        if t < 0:
            sig = sig[int(-t * SR):]
            t = 0
        i = int(round(t * SR))
        n = min(len(sig), self.buf.shape[1] - i)
        if n <= 0:
            return
        l = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)   # равная мощность
        r = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        self.buf[0, i:i + n] += sig[:n] * gain * min(l, 1.0)
        self.buf[1, i:i + n] += sig[:n] * gain * min(r, 1.0)


def echo(buf, delay, fb=0.3, taps=4, cross=True):
    """Простое стерео-эхо (пинг-понг) — немного «воздуха» для музыки."""
    out = buf.copy()
    d = int(delay * SR)
    for k in range(1, taps + 1):
        g = fb ** k
        src = buf[::-1] if (cross and k % 2) else buf
        out[:, d * k:] += src[:, :-d * k] * g
    return out


# =============================================================================
# Музыка
# =============================================================================

# Гармония: I–V–vi–IV в до мажоре; корень (MIDI) и ступени аккорда
CHORDS = {
    'C':  (36, [0, 4, 7]),
    'G':  (31, [0, 4, 7]),
    'Am': (33, [0, 3, 7]),
    'F':  (29, [0, 4, 7]),
}
PROG = ['C', 'G', 'Am', 'F']

# Мелодия: восьмые, None — пауза. Две вариации на каждый аккорд.
LEAD = {
    'C':  ([76, None, 79, None, 84, None, 79, 76], [84, 83, 79, None, 76, None, 79, None]),
    'G':  ([74, None, 79, None, 83, None, 81, 79], [83, 81, 79, None, 74, None, 79, None]),
    'Am': ([72, None, 76, None, 81, None, 79, 76], [81, 79, 76, None, 72, None, 76, None]),
    'F':  ([77, None, 81, None, 84, None, 81, 79], [84, 81, 77, None, 81, None, 79, None]),
}


def chord_at(bar, overrides):
    return overrides.get(bar, PROG[bar % 4])


class Arrangement:
    """Какие инструменты звучат в какой момент. Окна строятся по событиям."""

    def __init__(self, cues):
        T = {}
        for c in cues:
            T.setdefault(c['type'], []).append(c)
        sec = {c['name']: c['t'] for c in T.get('section', [])}
        first = lambda k, d: T[k][0]['t'] if k in T else d
        self.T = T
        self.end = first('end', 60.0)
        riser = first('riser', 23.0)
        crash = first('crash', 26.8)
        dark = first('dark', sec.get('first', 43.0))
        fanfare = first('fanfare', dark + 2.35)
        pixels = first('pixels', sec.get('final', 54.0) - 0.3)
        collapse = first('collapse', self.end - 1.5)
        final = sec.get('final', 54.0)

        self.fanfare = fanfare
        self.dark = dark
        self.collapse = collapse
        self.final = final

        # (начало, конец, {инструмент: громкость}, транспонирование мелодии)
        full = {'kick': 1, 'snare': 1, 'hat': 1, 'bass': 1, 'arp': 1, 'lead': 1}
        self.windows = [
            (0.0, sec.get('aa', 6.0) - 0.1, full, 0),
            (sec.get('aa', 6.0) - 0.1, sec.get('chart', 15.0),
             {'kick1': 0.8, 'hat': 0.5, 'bass': 0.9, 'arp': 0.6}, 0),
            (sec.get('chart', 15.0), riser, full, 0),
            (riser, sec.get('third', 25.0), {'bass': 1, 'arp': 1, 'build': 1}, 0),
            (sec.get('third', 25.0), crash, {'pedal': 1}, 0),
            (crash, sec.get('second', 34.0), {'kick': 0.9, 'snare': 0.8, 'hat': 0.8, 'bass': 1, 'arp': 0.8}, 0),
            (sec.get('second', 34.0), dark - 0.1, full, 0),
            (fanfare + 0.6, pixels, dict(full, pad=1), 12),
            (final + 0.3, collapse - 0.05, {'bass': 0.7, 'arp': 0.55, 'pad': 0.8}, 0),
        ]
        # Финал: F → G → C (разрешение в тонику к щелчку)
        fb = int(final // BAR)
        self.overrides = {fb: 'F', fb + 1: 'G', fb + 2: 'C'}

    def level(self, inst, t):
        for t0, t1, ins, _ in self.windows:
            if t0 <= t < t1 and inst in ins:
                return ins[inst], t1
        return 0.0, None

    def transpose(self, t):
        for t0, t1, _, tr in self.windows:
            if t0 <= t < t1:
                return tr
        return 0


def drum_kick(gain=1.0):
    d = 0.18
    s = sine(sweep(150, 42, d), d) * env_ad(d, 0.001, 5)
    click = band(noise(0.01), 1500) * env_ad(0.01, 0.0005, 4)
    s[:len(click)] += click * 0.3          # щелчок атаки
    return s * gain


def drum_snare():
    d = 0.14
    n = band(noise(d), 1200, 7000) * env_ad(d, 0.001, 7)
    tone = sine(sweep(240, 170, d), d) * env_ad(d, 0.001, 12) * 0.5
    return n * 0.8 + tone


def drum_hat(open_=False):
    d = 0.12 if open_ else 0.035
    return band(noise(d), 7000) * env_ad(d, 0.001, 6)


def cymbal(d=1.6):
    return band(noise(d), 4500) * env_ad(d, 0.002, 5)


def render_music(arr, dur):
    bus = Bus(dur)
    nbars = int(np.ceil(dur / BAR))
    kick, snare = drum_kick(), drum_snare()
    hat, ohat = drum_hat(), drum_hat(True)

    for bar in range(nbars):
        name = chord_at(bar, arr.overrides)
        root, tones = CHORDS[name]
        for step in range(16):                      # шестнадцатые
            t = bar * BAR + step * S16
            if t >= dur:
                break

            # --- ударные
            g, _ = arr.level('kick', t)
            if g and step in (0, 8, 10):
                bus.add(t, kick, 0.55 * g)
            g, _ = arr.level('kick1', t)
            if g and step == 0:
                bus.add(t, kick, 0.45 * g)
            g, _ = arr.level('snare', t)
            if g and step in (4, 12):
                bus.add(t, snare, 0.35 * g, 0.05)
            g, _ = arr.level('hat', t)
            if g and step % 2 == 0:
                bus.add(t, ohat if step in (6, 14) else hat, 0.12 * g, 0.3)
            # разгон перед зумом: дробь шестнадцатыми с крещендо
            g, t1 = arr.level('build', t)
            if g:
                w = arr.windows[3]
                k = (t - w[0]) / max(w[1] - w[0], 1e-6)
                bus.add(t, snare, (0.08 + 0.32 * k) * g, -0.05)
                if step % 4 == 0:
                    bus.add(t, kick, 0.3 * k)

            # --- бас (треугольник, восьмые: корень/октава)
            g, t1 = arr.level('bass', t)
            if g and step % 2 == 0:
                m = root + (12 if step % 4 == 2 else 0)
                d = min(S16 * 1.8, t1 - t)
                if d > 0.02:
                    s = triangle(mtof(m), d) * env_adsr(d, 0.003, 0.05, 0.7, 0.03)
                    bus.add(t, s, 0.42 * g)
            # педаль во время барабанной дроби: долгий низкий тон
            g, t1 = arr.level('pedal', t)
            if g and step == 0:
                d = min(BAR, t1 - t)
                if d > 0.05:
                    s = triangle(mtof(root), d) * env_adsr(d, 0.05, 0.1, 0.8, 0.1)
                    bus.add(t, s, 0.3 * g)

            # --- арпеджио (узкий квадрат, вверх-вниз по аккорду)
            g, t1 = arr.level('arp', t)
            if g:
                seq = [0, 1, 2, 3, 2, 1, 0, 1]
                chord = [root + 36 + x for x in tones] + [root + 48]
                m = chord[seq[step % 8]]
                d = min(S16 * 0.9, t1 - t)
                if d > 0.02:
                    s = square(mtof(m), d, 0.125) * env_ad(d, 0.002, 4)
                    bus.add(t, s, 0.075 * g, 0.35 if step % 2 else -0.15)

            # --- мелодия (квадрат 50% с лёгким вибрато)
            g, t1 = arr.level('lead', t)
            if g and step % 2 == 0:
                motif = LEAD[name][(bar // 4) % 2]
                m = motif[step // 2]
                if m is not None:
                    m += arr.transpose(t)
                    # длина ноты: до следующей ноты мотива
                    k = step // 2 + 1
                    while k < 8 and motif[k] is None:
                        k += 1
                    d = min((k - step // 2) * 2 * S16 * 0.92, t1 - t)
                    if d > 0.03:
                        n = int(d * SR)
                        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * np.arange(n) / SR) * np.clip(np.arange(n) / SR / 0.15, 0, 1)
                        s = square(mtof(m) * vib, d, 0.5) * env_adsr(d, 0.004, 0.08, 0.65, 0.04)
                        bus.add(t, s, 0.075 * g, -0.1)

            # --- «медный» пэд в кульминации и финале
            g, t1 = arr.level('pad', t)
            if g and step == 0:
                d = min(BAR, t1 - t)
                if d > 0.1:
                    s = sum(saw(mtof(root + 24 + x) * (1 + det), d)
                            for x in tones for det in (-0.003, 0.003))
                    s = band(s, None, 2500) * env_adsr(d, 0.08, 0.2, 0.7, 0.25)
                    bus.add(t, s, 0.035 * g, 0.0)

    # --- тёмная пауза перед 1 местом: гул + «сердцебиение»
    d = arr.fanfare - arr.dark
    drone = (saw(mtof(33) * (1 + 0.002 * np.sin(2 * np.pi * 0.7 * tt(d))), d)
             + saw(mtof(40), d) * 0.6)
    drone = band(drone, None, 400) * env_adsr(d, 0.4, 0.1, 1.0, 0.15)
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * 3 * tt(d))
    bus.add(arr.dark, drone * trem, 0.22)
    t = arr.dark + 0.35
    while t < arr.fanfare - 0.25:
        bus.add(t, kick, 0.5)
        bus.add(t + 0.18, kick, 0.32)
        t += 0.8

    # --- фанфары: мажорный аккорд + тарелка
    f = arr.fanfare
    for i, m in enumerate([60, 64, 67, 72]):
        d = 1.3
        s = (square(mtof(m), d, 0.25) + saw(mtof(m) * 1.003, d) * 0.6)
        s = band(s, None, 4000) * env_adsr(d, 0.01, 0.2, 0.55, 0.4)
        bus.add(f + i * 0.06, s, 0.085, -0.3 + 0.2 * i)
    bus.add(f, kick, 0.8)
    bus.add(f, cymbal(2.0), 0.35)
    bus.add(f, triangle(mtof(36), 1.2) * env_ad(1.2, 0.005, 3), 0.5)

    # --- финальный аккорд затухает к схлопыванию
    out = echo(bus.buf, BEAT * 0.75, fb=0.22, taps=3)
    fade_from = int(arr.collapse * SR)
    fade_to = int((arr.collapse + 0.75) * SR)
    ramp = np.ones(out.shape[1])
    ramp[fade_from:fade_to] = np.linspace(1, 0, fade_to - fade_from)
    ramp[fade_to:] = 0
    return out * ramp


# =============================================================================
# Звуковые эффекты
# =============================================================================

PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]   # мажорная пентатоника


def blip(m, d=0.04, duty=0.25, decay=5):
    return square(mtof(m), d, duty) * env_ad(d, 0.001, decay)


def bell(m, d=0.9):
    f = mtof(m)
    t = tt(d)
    s = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-6 * t)
         + 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-10 * t))
    return s * env_ad(d, 0.002, 5)


def whoosh(d, f0=300, f1=3000, f2=None):
    n = noise(d)
    lo = band(n, f0, f0 * 3)
    hi = band(n, f1 / 3, f1)
    k = np.linspace(0, 1, len(n))
    shape = np.sin(np.pi * k) ** 1.5
    if f2:  # подъём и спад
        mix = np.sin(np.pi * k)
    else:
        mix = k
    return (lo * (1 - mix) + hi * mix) * shape


def thud(d=0.2, f0=160, f1=45):
    return sine(sweep(f0, f1, d), d) * env_ad(d, 0.001, 5) + band(noise(d), None, 600) * env_ad(d, 0.001, 9) * 0.6


BOUNCE = [1 / 2.75, 2 / 2.75, 2.5 / 2.75, 1.0]   # точки касания для bounce.out


def ease_power2_out(p):
    return 1 - (1 - p) ** 2


def render_sfx(cues, dur):
    bus = Bus(dur)
    tick = blip(96, 0.012, 0.5, 3)

    for c in cues:
        t, k = c['t'], c['type']

        if k == 'bubble':
            bus.add(t, sine(sweep(420, 1100, 0.08), 0.08) * env_ad(0.08, 0.002, 4), 0.22)
        elif k == 'unbubble':
            bus.add(t, sine(sweep(900, 380, 0.06), 0.06) * env_ad(0.06, 0.002, 4), 0.08)

        elif k == 'type':
            # «печать»: короткий писк на каждый второй символ, высота — пентатоника
            for j in range(0, c['n'], 2):
                m = PENTA[int(rng.integers(3, 8))]
                bus.add(t + j * c['rate'], blip(m, 0.018, 0.5, 3), 0.045, float(rng.uniform(-0.2, 0.2)))

        elif k == 'snap':
            s = band(noise(0.012), 2500) * env_ad(0.012, 0.0005, 4)
            s = np.concatenate([s, np.zeros(int(0.03 * SR))])
            s[:int(0.025 * SR)] += sine(3200, 0.025) * env_ad(0.025, 0.0005, 8) * 0.6
            bus.add(t, s, 0.55)
        elif k == 'clap':
            for j, off in enumerate((0, 0.009, 0.018)):
                bus.add(t + off, band(noise(0.05), 900, 3500) * env_ad(0.05, 0.0005, 8), 0.3 - 0.07 * j,
                        -0.2 if c.get('n', 0) % 2 else 0.2)
        elif k == 'land':
            bus.add(t, thud(), 0.6)
        elif k == 'jump':
            d = 0.16
            bus.add(t - 0.05, square(sweep(260, 820, d), d, 0.25) * env_ad(d, 0.003, 3), 0.11)
        elif k == 'walk':
            n = int(c['dur'] / c['step'])
            for j in range(n):
                s = band(noise(0.012), 1800, 5000) * env_ad(0.012, 0.0005, 5)
                bus.add(t + j * c['step'], s, 0.08, -0.25 if j % 2 else 0.25)
        elif k == 'boing':
            d = 0.38
            tm = tt(d)
            f = 260 * (1 + 0.9 * (1 - np.exp(-tm * 30))) * (1 + 0.12 * np.sin(2 * np.pi * 18 * tm) * np.exp(-tm * 6))
            bus.add(t, sine(f, d) * env_ad(d, 0.003, 4), 0.2)
        elif k == 'prop':
            for j, m in enumerate([84, 88, 91, 96]):
                bus.add(t + j * 0.035, bell(m, 0.25), 0.07, 0.3)
        elif k == 'propoff':
            for j, m in enumerate([91, 84]):
                bus.add(t + j * 0.04, blip(m, 0.04), 0.04)

        elif k == 'titlebounce':
            for j, p in enumerate(BOUNCE):
                bus.add(t + p * c['dur'], thud(0.18, 130, 50), 0.5 * (0.55 ** j))
        elif k == 'card':
            m = PENTA[c.get('i', 0) % len(PENTA)]
            bus.add(t, whoosh(0.12, 800, 5000), 0.12, 0.4)
            bus.add(t + 0.05, blip(m, 0.09, 0.25, 4), 0.06, 0.4)
        elif k == 'chip':
            bus.add(t, sine(sweep(500 + 80 * c.get('i', 0), 1000 + 120 * c.get('i', 0), 0.07), 0.07) * env_ad(0.07, 0.002, 4), 0.18, 0.2)
        elif k == 'bar':
            # столбики (27 штук): восходящая гамма до мажора; топ-10 — громче
            scale = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96]
            i = c.get('i', 0)
            m = scale[i % len(scale)]
            d = 0.22 if i < 10 else 0.12
            s = (triangle(mtof(m), d) + 0.4 * square(mtof(m), d, 0.25)) * env_ad(d, 0.003, 5)
            bus.add(t, s, 0.12 if i < 10 else 0.05, -0.6 + 1.2 * i / 26)
        elif k == 'gap':
            bus.add(t, blip(81, 0.08, 0.5), 0.08)
            bus.add(t + 0.1, blip(76, 0.12, 0.5), 0.08)

        elif k == 'curtain':
            bus.add(t, whoosh(c['dur'], 250, 2500, True), 0.4, -0.3)
        elif k == 'whoosh':
            bus.add(t, whoosh(max(c['dur'], 0.2), 400, 4000), 0.4)
        elif k == 'iris':
            d = c['dur']
            s = sine(sweep(180, 1600, d), d) * env_adsr(d, 0.02, 0.1, 0.8, 0.12)
            bus.add(t, s, 0.14)
            bus.add(t, whoosh(d, 300, 3000), 0.2)
        elif k == 'riser':
            d = c['dur']
            s = lowpass_sweep(noise(d), 250, 7000) * np.linspace(0.2, 1, int(d * SR)) ** 2
            bus.add(t, s, 0.3)
            bus.add(t, sine(sweep(150, 900, d), d) * np.linspace(0, 1, int(d * SR)) * fade_tail(int(d * SR), 30), 0.06)

        elif k == 'drumroll':
            d = c['dur']
            n = int(d * 26)
            sn = drum_snare()
            for j in range(n):
                g = 0.12 + 0.4 * (j / n) ** 1.5
                bus.add(t + j / 26, sn, g, -0.15 if j % 2 else 0.15)
        elif k == 'crash':
            bus.add(t, cymbal(1.8), 0.4)
            bus.add(t, drum_kick(), 0.7)
        elif k == 'medal':
            bus.add(t, bell(91 if c.get('rank') == 2 else 88, 1.0), 0.14)
        elif k == 'reveal':
            notes = [72, 76, 79, 84] + ([88, 91] if c.get('rank') == 1 else [])
            for j, m in enumerate(notes):
                bus.add(t + j * 0.055, blip(m, 0.12, 0.25, 4), 0.08, -0.2 + 0.08 * j)
        elif k == 'count':
            # тик на каждое изменение числа (как в main.js: power2.out)
            last, lt = -1, -1.0
            steps = int(c['dur'] * SR / 256)
            for j in range(steps + 1):
                p = j / steps
                v = round(c['to'] * ease_power2_out(p))
                tj = t + p * c['dur']
                if v != last and tj - lt > 0.022:
                    bus.add(tj, tick, 0.07, 0.3)
                    last, lt = v, tj
            bus.add(t + c['dur'], bell(96, 0.5), 0.1, 0.3)
        elif k == 'fall':
            d = c['dur']
            bus.add(t, sine(sweep(1900, 320, d), d) * env_adsr(d, 0.02, 0.1, 0.8, 0.05), 0.12)
        elif k == 'impact':
            if c.get('amp', 0) >= 6:
                g = min(1.0, c['amp'] / 14)
                bus.add(t, thud(0.35, 110, 32), 0.7 * g)
                bus.add(t, band(noise(0.3), None, 1500) * env_ad(0.3, 0.002, 6), 0.25 * g)

        elif k == 'dark':
            bus.add(t, thud(1.2, 70, 30), 0.7)
            # «реверс»-тарелка, нарастающая к фанфарам
            d = c['dur']
            rev = cymbal(d)[::-1] * np.linspace(0, 1, int(d * SR)) ** 2
            bus.add(t, rev, 0.18)
        elif k == 'spot':
            bus.add(t, whoosh(c['dur'], 300, 2500, True), 0.22, 0.4)
        elif k == 'spotlock':
            s = band(noise(0.02), 1500) * env_ad(0.02, 0.0005, 4)
            bus.add(t, s, 0.45)
            bus.add(t, thud(0.25, 90, 40), 0.45)
        elif k == 'crown':
            d = c['dur']
            bus.add(t, sine(sweep(2200, 700, d * 0.36), d * 0.36) * env_adsr(d * 0.36, 0.01, 0.05, 0.8, 0.02), 0.08)
            for j, p in enumerate(BOUNCE):
                bus.add(t + p * d, bell(96 - 3 * j, 0.5), 0.16 * (0.6 ** j))
        elif k == 'pop':
            bus.add(t, band(noise(0.08), 200, 5000) * env_ad(0.08, 0.0005, 6), 0.7)
            bus.add(t, thud(0.2, 200, 60), 0.5)
        elif k == 'sparkle':
            d = c['dur']
            for _ in range(int(d * 14)):
                tj = t + float(rng.uniform(0, d))
                m = PENTA[int(rng.integers(5, len(PENTA)))]
                fade = 1 - (tj - t) / d
                bus.add(tj, sine(mtof(m), 0.08) * env_ad(0.08, 0.001, 6), 0.05 * fade, float(rng.uniform(-0.8, 0.8)))
        elif k == 'shine':
            d = 0.45
            bus.add(t, sine(sweep(2000, 5200, d), d) * env_ad(d, 0.01, 4), 0.05, 0.3)

        elif k == 'pixels':
            d = c['dur']
            notes = PENTA if c.get('dir') == 'in' else PENTA[::-1]
            for j in range(22):
                m = notes[j % len(notes)] - (0 if c.get('dir') == 'in' else 12)
                bus.add(t + j * d / 22, blip(m, 0.03, 0.5, 3), 0.07, -0.6 + 1.2 * j / 21)
        elif k == 'line':
            bus.add(t, thud(0.2, 140, 60), 0.35)
            bus.add(t, bell(84 + 3 * c.get('i', 0), 0.7), 0.1)
        elif k == 'collapse':
            d = c['dur']
            f = sweep(1400, 55, d)
            bus.add(t, sine(f, d) * env_adsr(d, 0.01, 0.05, 0.9, 0.08), 0.22)
            bus.add(t, square(f / 2, d, 0.5) * env_adsr(d, 0.01, 0.05, 0.9, 0.08), 0.04)
        elif k == 'ding':
            bus.add(t, bell(96, 1.2), 0.2)
            bus.add(t + 0.03, bell(103, 1.0), 0.08)

    return bus.buf


# =============================================================================
# Сведение и запись
# =============================================================================

def master(music, sfx, dur):
    n = int(round(dur * SR))
    mix = music[:, :n] * 0.9 + sfx[:, :n]
    # срез ниже 20 Гц: убрать постоянную составляющую и инфранизы
    mix = np.stack([band(ch, 20) for ch in mix])
    # мягкий лимитер: уровень по 99.95-му перцентилю, редкие пики скругляет tanh
    ref = np.percentile(np.abs(mix), 99.95) or 1.0
    mix = np.tanh(mix / ref * 1.1)
    mix *= 10 ** (-1.0 / 20)                # запас -1 dBFS
    return mix


def write_wav(path, stereo):
    data = (np.clip(stereo.T, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def mux(video, wav):
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg не найден в PATH')
    tmp = video + '.tmp.mp4'
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-i', video, '-i', wav,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-movflags', '+faststart', tmp
    ], check=True)
    os.replace(tmp, video)
    print('звук вклеен в', video)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cues', default=os.path.join(HERE, 'cues.json'))
    ap.add_argument('--out', default=os.path.join(HERE, 'soundtrack.wav'))
    ap.add_argument('--mux', metavar='VIDEO.mp4', help='вклеить дорожку в это видео (видео не перекодируется)')
    args = ap.parse_args()

    with open(args.cues, encoding='utf-8') as f:
        data = json.load(f)
    cues = data['cues']
    dur = float(data['duration'])

    arr = Arrangement(cues)
    music = render_music(arr, dur)
    sfx = render_sfx(cues, dur)
    out = master(music, sfx, dur)
    write_wav(args.out, out)
    print(f'{args.out}: {dur:.2f} с, {len(cues)} событий')

    if args.mux:
        mux(args.mux, args.out)


if __name__ == '__main__':
    main()
