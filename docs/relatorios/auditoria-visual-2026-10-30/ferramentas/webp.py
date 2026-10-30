#!/usr/bin/env python3
"""Converte as capturas PNG em WebP para o relatório. Celular (-cel, 2×) volta a 1×. Uso: webp.py <pasta-png> <pasta-webp>"""
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
n = 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'):
        continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    if f.endswith('-cel.png') and im.width > 390:
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(os.path.join(dst, f[:-4] + '.webp'), 'WEBP', quality=80, method=6)
    n += 1
print(n, 'convertidas')
