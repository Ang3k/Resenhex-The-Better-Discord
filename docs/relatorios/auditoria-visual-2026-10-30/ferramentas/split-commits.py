#!/usr/bin/env python3
"""Separa o diff de trabalho em commits coerentes, classificando cada pedaço (hunk, -U0) por regras.
Uso: split-commits.py <repo> <plano.json>
plano.json: [{"msg": "...", "files": ["regex"...], "match": ["regex"...]}, ...] na ordem dos commits.
Um hunk vai para o primeiro grupo cujo arquivo casa com "files" e cujo texto (linhas -/+) casa com algum "match"
(ou sem "match" = qualquer hunk do arquivo). O que sobrar vai para o último grupo."""
import json, re, subprocess, sys, tempfile, os

repo, plan_path = sys.argv[1], sys.argv[2]
plan = json.load(open(plan_path))
diff = subprocess.run(['git', '-C', repo, 'diff', '-U3', '--no-color'], capture_output=True, text=True, check=True).stdout

files = re.split(r'(?=^diff --git )', diff, flags=re.M)
groups = [[] for _ in plan]
for f in files:
    if not f.strip():
        continue
    header, *rest = re.split(r'(?=^@@ )', f, flags=re.M)
    path = re.search(r'^\+\+\+ b/(.*)$', header, re.M) or re.search(r'^--- a/(.*)$', header, re.M)
    path = path.group(1)
    for hunk in rest:
        body = '\n'.join(l for l in hunk.split('\n')[1:] if l.startswith(('+', '-')))
        target = len(plan) - 1
        for i, g in enumerate(plan):
            if not any(re.search(p, path) for p in g['files']):
                continue
            if not g.get('match') or any(re.search(m, body) for m in g['match']):
                target = i
                break
        groups[target].append((header, hunk))

for i, g in enumerate(plan):
    if not groups[i]:
        print('vazio:', g['msg'].split('\n')[0])
        continue
    patch = ''
    by_header = {}
    for header, hunk in groups[i]:
        by_header.setdefault(header, []).append(hunk)
    for header, hunks in by_header.items():
        patch += header + ''.join(hunks)
    with tempfile.NamedTemporaryFile('w', delete=False, suffix='.patch') as t:
        t.write(patch)
    r = subprocess.run(['git', '-C', repo, 'apply', '--cached', '--recount', t.name], capture_output=True, text=True)
    os.unlink(t.name)
    if r.returncode:
        print('falhou ao aplicar:', g['msg'].split('\n')[0], r.stderr[:400])
        sys.exit(1)
    subprocess.run(['git', '-C', repo, 'commit', '-q', '-m', g['msg']], check=True)
    print('commit:', g['msg'].split('\n')[0], f'({len(groups[i])} pedaços)')
