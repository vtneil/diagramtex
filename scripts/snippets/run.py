#!/usr/bin/env python3
"""Unattended driver for the whole corpus build (meant to run overnight, detached):

  caffeinate -is nohup python3 -I scripts/snippets/run.py --papers 10000 > ext/snippets/work/run.out 2>&1 &

1. extends the arXiv list to --papers (every DaTikZ arXiv paper first, the rest sampled by category);
2. downloads the e-prints in a child process (one connection, >= 3 s apart), restarting it if it dies;
3. every --every minutes, and once more when the download is done, runs a checkpoint:
   extract -> curate pool -> compile (container) -> curate final, so cases/, REPORT.md and raw-diagrams.jsonl
   always reflect what has been fetched so far.
Progress: ext/snippets/work/run.log (one line per event) and work/status.json. Stop: kill the run.py process
(the download child is stopped with it); everything resumes where it left off when started again.
"""
import argparse
import json
import os
import signal
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RAW, WORK, read_jsonl  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PY = [sys.executable, '-I']
LOG = WORK / 'run.log'
STATUS = {}


def log(msg):
    line = f'{time.strftime("%Y-%m-%d %H:%M:%S")}  {msg}'
    with LOG.open('a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)


def status(**kw):
    STATUS.update(kw, updated=time.strftime('%Y-%m-%d %H:%M:%S'))
    (WORK / 'status.json').write_text(json.dumps(STATUS, indent=1))


def counts():
    listed = sum(1 for _ in read_jsonl(RAW / 'arxiv' / 'list.jsonl'))
    fetched = list(read_jsonl(RAW / 'arxiv' / 'fetched.jsonl'))
    return listed, len(fetched), sum(1 for r in fetched if r.get('file'))


def step(name, args, timeout):
    t = time.time()
    with (WORK / f'{name}.log').open('w', encoding='utf-8') as out:
        try:
            p = subprocess.run(PY + [os.path.join(HERE, args[0])] + args[1:], stdout=out, stderr=subprocess.STDOUT, timeout=timeout)
            rc = p.returncode
        except subprocess.TimeoutExpired:
            rc = 'timeout'
    tail = (WORK / f'{name}.log').read_text(encoding='utf-8', errors='replace').strip().splitlines()[-1:]
    log(f'  {name}: rc={rc} in {(time.time() - t) / 60:.1f} min  {tail[0][:160] if tail else ""}')
    return rc == 0


def checkpoint(n):
    listed, tried, papers = counts()
    log(f'checkpoint {n}: {papers} arXiv papers with source ({tried} tried of {listed} listed)')
    status(phase=f'checkpoint {n}', papers=papers)
    ok = step('extract', ['extract.py'], 4 * 3600) and step('pool', ['curate.py', 'pool'], 3600) \
        and step('compile', ['compile.py', '-j', '12'], 8 * 3600) and step('final', ['curate.py', 'final'], 3600)
    if ok:
        rep = (WORK.parent / 'REPORT.md')
        head = rep.read_text().splitlines()[2] if rep.exists() else ''
        log(f'checkpoint {n} done: {head}')
    status(last_checkpoint=n, last_checkpoint_ok=ok, papers_at_checkpoint=papers)
    return ok


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--papers', type=int, default=10000)
    p.add_argument('--every', type=int, default=120, help='minutes between checkpoints')
    p.add_argument('--no-first', action='store_true', help='skip the checkpoint at start')
    a = p.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    log(f'run.py start (pid {os.getpid()}): target {a.papers} arXiv papers')
    status(pid=os.getpid(), phase='listing', target=a.papers)
    listed, _, _ = counts()
    if listed < a.papers:
        datikz_ids = 3000  # all of them (2789 at the pinned revision)
        step('arxiv-list', ['fetch.py', 'arxiv-list', '--from-datikz', str(datikz_ids),
                            '--categories', str(max(0, a.papers - 2789))], 6 * 3600)
    child, restarts, n = None, 0, 0

    def stop(*_):
        if child and child.poll() is None:
            child.terminate()
        log('run.py stopped by signal')
        sys.exit(1)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def start_fetch():
        out = (RAW / 'arxiv' / 'fetch.log').open('a', encoding='utf-8')
        return subprocess.Popen(PY + [os.path.join(HERE, 'fetch.py'), 'arxiv'], stdout=out, stderr=subprocess.STDOUT)
    child = start_fetch()
    log(f'arXiv download started (pid {child.pid})')
    status(phase='downloading', fetch_pid=child.pid)
    next_cp = time.time() + (a.every * 60 if a.no_first else 0)
    while True:
        if time.time() >= next_cp:
            n += 1
            checkpoint(n)
            next_cp = time.time() + a.every * 60
        rc = child.poll()
        if rc is not None:
            listed, tried, papers = counts()
            if tried < listed and restarts < 20:  # died early (network, rate limit): resume
                restarts += 1
                log(f'arXiv download exited rc={rc} at {tried}/{listed}; restart {restarts}')
                time.sleep(120)
                child = start_fetch()
                continue
            log(f'arXiv download finished: {papers} papers with source of {tried} tried')
            break
        listed, tried, papers = counts()
        status(phase='downloading', tried=tried, papers=papers, listed=listed)
        time.sleep(60)
    n += 1
    checkpoint(n)
    status(phase='done')
    log('run.py done')


if __name__ == '__main__':
    main()
