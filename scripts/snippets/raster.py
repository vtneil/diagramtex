#!/usr/bin/env python3
"""Rasterise PDFs (the LaTeX references, or the app's compiled exports) inside the same locked-down container as
compile.py, so Ghostscript never reads a corpus PDF on the host.

  python3 -I scripts/snippets/raster.py --root DIR --list pairs.tsv --out DIR [-j 10] [--force]

pairs.tsv: one `<name> TAB <pdf path relative to --root>` per line. Writes <out>/<name>.png (first page, 254 dpi =
100 px/cm unless the page is too large) and <out>/<name>.json {status, dpi, size, pdf_sha}. Cached by the PDF's
SHA-256, so only new or changed PDFs are drawn again.
"""
import argparse
import concurrent.futures
import json
import os
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import sha  # noqa: E402
from compile import IMAGE, TOOL  # noqa: E402


def run_chunk(a, rows, n, lists):
    lst = lists / f'chunk-{n}.txt'
    lst.write_text('\n'.join(f'{k}\t{v}' for k, v in rows))
    cmd = ['docker', 'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,size=512m',
           '--memory', a.memory, '--memory-swap', a.memory, '--cpus', '1', '--pids-limit', '128',
           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
           '-e', f'RASTER_TIMEOUT={a.timeout}',
           '-v', f'{a.root}:/in:ro', '-v', f'{TOOL}:/tool:ro', '-v', f'{a.out}:/out:rw',
           a.image, 'python3', '-I', '/tool/rasterrun.py', f'/out/.lists/{lst.name}']
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=len(rows) * (2 * a.timeout + 10) + 120)
    if p.returncode != 0:
        print(f'raster chunk {n}: container exited {p.returncode}: {p.stderr[-500:]}', file=sys.stderr)
    return len(rows)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--root', required=True, help='directory the PDF paths are relative to (mounted read-only)')
    p.add_argument('--list', required=True, help='lines of <name> TAB <relative pdf path>')
    p.add_argument('--out', required=True)
    p.add_argument('-j', type=int, default=10, help='containers at once')
    p.add_argument('--chunk', type=int, default=80)
    p.add_argument('--timeout', type=int, default=60, help='seconds per Ghostscript run')
    p.add_argument('--memory', default='1024m')
    p.add_argument('--image', default=IMAGE)
    p.add_argument('--force', action='store_true')
    a = p.parse_args()
    a.root, a.out = pathlib.Path(a.root).resolve(), pathlib.Path(a.out).resolve()
    lists = a.out / '.lists'
    lists.mkdir(parents=True, exist_ok=True)
    rows = []
    for line in pathlib.Path(a.list).read_text(encoding='utf-8').splitlines():
        if '\t' in line:
            name, rel = line.split('\t', 1)
            src = (a.root / rel).resolve()
            if not str(src).startswith(str(a.root) + os.sep) or not src.is_file():
                continue
            rows.append((name, rel, sha(src.read_bytes())))
    todo = []
    for name, rel, digest in rows:
        j, png = a.out / f'{name}.json', a.out / f'{name}.png'
        if a.force or not j.exists():
            todo.append((name, rel)); continue
        r = json.loads(j.read_text())
        if r.get('pdf_sha') != digest or (r.get('status') == 'ok' and not png.exists()):
            todo.append((name, rel))
    print(f'raster: {len(todo)} to draw, {len(rows) - len(todo)} cached', flush=True)
    chunks = [todo[k:k + a.chunk] for k in range(0, len(todo), a.chunk)]
    done, t0 = 0, time.time()
    with concurrent.futures.ThreadPoolExecutor(a.j) as ex:
        futs = [ex.submit(run_chunk, a, c, n, lists) for n, c in enumerate(chunks)]
        for f in concurrent.futures.as_completed(futs):
            try:
                done += f.result()
            except subprocess.TimeoutExpired:
                print('a raster chunk timed out as a whole', file=sys.stderr); continue
            rate = done / max(1e-9, time.time() - t0)
            print(f'raster: {done}/{len(todo)}  ({rate:.1f}/s)', flush=True)
    by = {}
    for name, _, _ in rows:
        j = a.out / f'{name}.json'
        s = json.loads(j.read_text()).get('status', '?') if j.exists() else 'not-run'
        by[s] = by.get(s, 0) + 1
    print('raster:', by)


if __name__ == '__main__':
    main()
