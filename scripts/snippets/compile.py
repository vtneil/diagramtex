#!/usr/bin/env python3
"""Compile snippet documents with real LaTeX inside a locked-down TeX Live container (the reference renders).

  python3 -I scripts/snippets/compile.py [--dir ext/snippets/work/pool] [-j 10] [--force] [--ids file]

Each container: no network, read-only root, /tmp in memory, no capabilities, no new privileges, a non-root user,
memory/CPU/process limits; the snippets are mounted read-only and only the output directory is writable. Inside,
TeX runs with shell escape off and paranoid file access (container/texrun.py). Results are cached by the document's
SHA-256, so only new or changed snippets compile again. Results: <out>/<id>.{json,pdf,log} and <out>/results.jsonl.
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
from common import WORK, sha, write_jsonl  # noqa: E402

# texlive/texlive:latest as pulled on 2026-11-23 (TeX Live 2026, arm64); pinned so references are reproducible
IMAGE = 'texlive/texlive@sha256:b20c42c2a5b1be892c26e6d3b896e9aa20350528ddd0d4444d23e5925ea1545d'
TOOL = pathlib.Path(__file__).resolve().parent / 'container'


def run_chunk(a, ids, n, lists):
    lst = lists / f'chunk-{n}.txt'
    lst.write_text('\n'.join(ids))
    cmd = ['docker', 'run', '--rm', '--network', 'none', '--read-only', '--tmpfs', '/tmp:rw,size=1536m',
           '--memory', a.memory, '--memory-swap', a.memory, '--cpus', '1', '--pids-limit', '256',
           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
           '-e', f'SNIPPET_TIMEOUT={a.timeout}',
           '-v', f'{a.dir}:/in:ro', '-v', f'{TOOL}:/tool:ro', '-v', f'{a.out}:/out:rw',
           a.image, 'python3', '-I', '/tool/texrun.py', f'/out/.lists/{lst.name}']
    t = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=len(ids) * (2 * a.timeout + 20) + 120)
    if p.returncode != 0:
        print(f'chunk {n}: container exited {p.returncode}: {p.stderr[-500:]}', file=sys.stderr)
    return len(ids), time.time() - t


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--dir', default=str(WORK / 'pool'), help='directory of <id>.tex snippet documents')
    p.add_argument('--out', default=None, help='default: <dir>/../compile')
    p.add_argument('--ids', help='file listing the ids to compile (default: every .tex in --dir)')
    p.add_argument('-j', type=int, default=10, help='containers at once')
    p.add_argument('--chunk', type=int, default=40)
    p.add_argument('--timeout', type=int, default=60, help='seconds per TeX run')
    p.add_argument('--memory', default='1536m')
    p.add_argument('--image', default=IMAGE)
    p.add_argument('--force', action='store_true')
    a = p.parse_args()
    a.dir = pathlib.Path(a.dir).resolve()
    a.out = pathlib.Path(a.out).resolve() if a.out else (a.dir.parent / 'compile').resolve()
    lists = a.out / '.lists'
    lists.mkdir(parents=True, exist_ok=True)
    ids = pathlib.Path(a.ids).read_text().split() if a.ids else sorted(f.stem for f in a.dir.glob('*.tex'))
    digests = {i: sha((a.dir / f'{i}.tex').read_bytes()) for i in ids}
    todo = []
    for i in ids:
        j = a.out / f'{i}.json'
        if a.force or not j.exists() or json.loads(j.read_text()).get('tex_sha') != digests[i]:
            todo.append(i)
    print(f'compile: {len(todo)} to compile, {len(ids) - len(todo)} cached', flush=True)
    chunks = [todo[k:k + a.chunk] for k in range(0, len(todo), a.chunk)]
    done, t0 = 0, time.time()
    with concurrent.futures.ThreadPoolExecutor(a.j) as ex:
        futs = [ex.submit(run_chunk, a, c, n, lists) for n, c in enumerate(chunks)]
        for f in concurrent.futures.as_completed(futs):
            try:
                k, _ = f.result()
            except subprocess.TimeoutExpired:
                print('a chunk timed out as a whole', file=sys.stderr); continue
            done += k
            rate = done / max(1e-9, time.time() - t0)
            print(f'compile: {done}/{len(todo)}  ({rate:.1f}/s, ~{(len(todo) - done) / max(rate, 1e-9) / 60:.0f} min left)', flush=True)
    rows = []
    for i in ids:
        j = a.out / f'{i}.json'
        if j.exists():
            r = json.loads(j.read_text())
            if r.get('tex_sha') != digests[i]:
                r = {'id': i, 'status': 'stale', 'tex_sha': digests[i]}
            rows.append(r)
        else:
            rows.append({'id': i, 'status': 'not-run', 'tex_sha': digests[i]})
    write_jsonl(a.out / 'results.jsonl', rows)
    by = {}
    for r in rows:
        by[r['status']] = by.get(r['status'], 0) + 1
    print('compile:', by)


if __name__ == '__main__':
    main()
