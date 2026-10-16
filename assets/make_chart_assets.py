#!/usr/bin/env python3
"""
make_chart_assets.py — готовит скриншот графика для анимации.

Вход:  скриншот «Artificial Analysis Intelligence Index» с artificialanalysis.ai
       (PNG, 2324×1182 — снимок от 16.10.2026).
Выход: assets/aa-intelligence-index.png        — копия скриншота (как есть);
       assets/aa-intelligence-index-empty.png  — тот же кадр без столбиков
                                                 (фон + пунктир сетки);
       печатает координаты столбиков для js/chart.js (SHOT.bars).

«Пустой» кадр нужен только для анимации роста: шторка из него закрывает
столбик и уезжает вверх, открывая настоящий столбик со скриншота.

Запуск: python3 assets/make_chart_assets.py путь/к/01_Intelligence_Index.png
Нужны numpy и Pillow.
"""

import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE_Y = 780          # строка чуть выше базовой линии — по ней ищем столбики
BASE_Y = 792           # нижний край столбиков на скриншоте


def find_bars(img):
    white = img.min(2) > 235
    row = ~white[PROBE_Y]
    runs, x = [], 0
    while x < len(row):
        if row[x]:
            s = x
            while x < len(row) and row[x]:
                x += 1
            if x - s > 30:
                runs.append((s, x - 1))
        else:
            x += 1
    bars = []
    for a, b in runs:
        # верх ищем у краёв: в центре столбика стоит белая цифра
        tops = []
        for cx in (a + 5, a + 8, b - 5):
            col = ~white[:, cx]
            y = PROBE_Y
            while col[y - 1]:
                y -= 1
            tops.append(y)
        bars.append([int(a), int(b), int(min(tops))])
    return bars


def erase_bars(img, bars):
    """Закрасить столбики фоном соседнего промежутка (с пунктиром сетки)."""
    out = img.copy()
    for i, (a, b, top) in enumerate(bars):
        # промежуток между столбиками ≈ 21 px; у первого слева сетки ещё нет — берём правый
        gap = b + 2 if i == 0 else a - 20
        for x in range(a - 1, b + 2):
            sx = gap + (x - a) % 18
            out[top - 3:BASE_Y + 1, x] = img[top - 3:BASE_Y + 1, sx]
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    img = np.asarray(Image.open(src).convert('RGB'))
    bars = find_bars(img.astype(int))
    if len(bars) != 27:
        print(f'внимание: найдено {len(bars)} столбиков, ожидалось 27', file=sys.stderr)

    shutil.copyfile(src, os.path.join(HERE, 'aa-intelligence-index.png'))
    Image.fromarray(erase_bars(img, bars)).save(os.path.join(HERE, 'aa-intelligence-index-empty.png'), optimize=True)

    h, w = img.shape[:2]
    print(json.dumps({'w': w, 'h': h, 'baseY': BASE_Y, 'bars': bars}))


if __name__ == '__main__':
    main()
