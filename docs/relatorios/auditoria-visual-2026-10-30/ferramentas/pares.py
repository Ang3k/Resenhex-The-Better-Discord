#!/usr/bin/env python3
"""Tabela Markdown antes | depois para o relatório. Uso: pares.py <pasta-evidencias> nome:legenda ..."""
import sys, os
base = sys.argv[1]
rel = 'auditoria-visual-2026-10-30'
print('| Tela | Antes | Depois |')
print('|---|---|---|')
for arg in sys.argv[2:]:
    name, _, caption = arg.partition(':')
    a, d = f'antes/{name}.webp', f'depois/{name}.webp'
    if not (os.path.exists(os.path.join(base, a)) and os.path.exists(os.path.join(base, d))):
        print(f'<!-- faltando: {name} -->', file=sys.stderr)
        continue
    print(f'| {caption}<br>`{name}` | ![antes]({rel}/{a}) | ![depois]({rel}/{d}) |')
