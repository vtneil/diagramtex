#!/usr/bin/env python3
"""Choose the corpus: de-duplicate candidates, sample them by stratum, and freeze the final set.

  python3 -I scripts/snippets/curate.py pool     de-duplicate work/candidates.jsonl.gz, pick an oversampled pool
                                                 (targets x --oversample) and write work/pool/<id>.tex to compile
  python3 -I scripts/snippets/compile.py         compile the pool in the container (work/compile/)
  python3 -I scripts/snippets/curate.py final    pick the targets again from what compiled cleanly, split dev/held-out,
                                                 write cases/<class>/<id>.tex (+ its reference .pdf) and manifest.json

Both picks use the same seeded procedure: quotas per tag (rarest first), at most --per-doc snippets from one source
document, a maximum share per source, and for libraries an allocation of --lib-min..--lib-max each.
"""
import argparse
import collections
import gzip
import json
import math
import os
import pathlib
import random
import re
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CASES, EXT, RAW, WORK, read_jsonl, sha, write_jsonl  # noqa: E402

TARGETS = {'math': 3000, 'tikz': 4000, 'lib': 3000}
# the most of a class that one source may supply
MAX_SHARE = {'math': {'arxiv': 0.85, 'texse': 0.25, 'datikz': 0.10, 'ctan': 0.0},
             'tikz': {'arxiv': 0.50, 'datikz': 0.50, 'texse': 0.35, 'ctan': 0.05},
             'lib': {'arxiv': 0.70, 'datikz': 0.50, 'texse': 0.70, 'ctan': 0.15}}
SOURCE_RANK = {'arxiv': 0, 'texse': 1, 'datikz': 2, 'ctan': 3}  # which copy of a duplicate is kept


def doc_key(c):
    m = c['meta']
    return c['source'] + ':' + str({'arxiv': m.get('paper'), 'datikz': m.get('row'), 'texse': m.get('post'),
                                    'ctan': m.get('file')}[c['source']])


def skeleton(c):
    """Near-duplicates share a skeleton: the same code up to numbers, case and spacing."""
    body = re.sub(r'\s+', '', c.get('formula') or '') if c['class'] == 'math' else None
    if body is None:
        m = re.search(r'\\begin\{document\}(.*)\\end\{document\}', c['tex'], re.S)
        body = re.sub(r'\s+', ' ', re.sub(r'\d+(?:\.\d+)?', '0', (m[1] if m else c['tex']).lower()))
    return c['class'] + (c['lib'] or '') + sha(body, 20)


def load_candidates(path):
    by_id, by_skel, dups = {}, {}, collections.Counter()
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        for line in f:
            c = json.loads(line)
            k = skeleton(c)
            old = by_skel.get(k)
            if old is not None:
                dups['exact' if old['norm_sha'] == c['norm_sha'] else 'near'] += 1
                if (SOURCE_RANK[c['source']], c['id']) >= (SOURCE_RANK[old['source']], old['id']):
                    continue
                del by_id[old['id']]
            by_skel[k] = c
            by_id[c['id']] = c
    return list(by_id.values()), dups


def allocate(avail, total, lo, hi):
    """Water-filling: each library gets an equal share, clamped to [lo, hi] and to what exists."""
    alloc = {k: 0 for k in avail}
    left, open_ = total, {k for k, v in avail.items() if v > 0}
    while left > 0 and open_:
        share = max(1, left // len(open_))
        for k in sorted(open_):
            cap = min(avail[k], hi)
            add = min(share, cap - alloc[k], left)
            alloc[k] += add
            left -= add
            if alloc[k] >= cap:
                open_.discard(k)
            if left <= 0:
                break
    for k in alloc:  # the floor, where it exists, even past the total
        alloc[k] = max(alloc[k], min(lo, avail[k]))
    return alloc


def pick(items, target, cls, rng, per_doc, ctan_doc_share=0.15, min_tag=None, backfill=0):
    """Seeded stratified pick: tag quotas rarest first, then fill; per-document and per-source caps hold throughout,
    except that a stratum still short of `backfill` is topped up past the caps (a library only manuals use)."""
    items = sorted(items, key=lambda c: c['id'])
    rng.shuffle(items)
    shares = MAX_SHARE[cls]
    src_cap = {s: math.ceil(target * v) for s, v in shares.items()}
    doc_cap_ctan = max(per_doc, math.ceil(target * ctan_doc_share))
    docs, srcs, chosen, ids = collections.Counter(), collections.Counter(), [], set()

    def take(c, shares=True):
        cap = doc_cap_ctan if c['source'] == 'ctan' else per_doc
        if c['id'] in ids or docs[doc_key(c)] >= cap or (shares and srcs[c['source']] >= src_cap.get(c['source'], 0)):
            return False
        ids.add(c['id']); chosen.append(c)
        docs[doc_key(c)] += 1; srcs[c['source']] += 1
        return True

    freq = collections.Counter(t for c in items for t in set(c['tags']))
    if freq:
        quota = min_tag or max(10, target // (2 * len(freq)))
        have = collections.Counter()
        for t in sorted(freq, key=lambda t: (freq[t], t)):
            for c in items:
                if have[t] >= quota or len(chosen) >= target:
                    break
                if t in c['tags'] and take(c):
                    have.update(set(c['tags']))
    for c in items:
        if len(chosen) >= target:
            break
        take(c)
    # source shares are a preference: a stratum that only some sources supply is still filled
    for c in items:
        if len(chosen) >= target:
            break
        take(c, shares=False)
    for c in items:
        if len(chosen) >= min(target, backfill):
            break
        if c['id'] not in ids:
            ids.add(c['id']); chosen.append(c)
    return chosen


def strata(cands, targets, args, rng):
    """{(class, lib): [chosen]} for the given per-class targets."""
    out = {}
    for cls in ('math', 'tikz'):
        out[(cls, None)] = pick([c for c in cands if c['class'] == cls], targets[cls], cls, rng, args.per_doc)
    libs = collections.defaultdict(list)
    for c in cands:
        if c['class'] == 'lib':
            libs[c['lib']].append(c)
    alloc = allocate({k: len(v) for k, v in libs.items()}, targets['lib'], args.lib_min, args.lib_max)
    for lib, items in sorted(libs.items()):
        out[('lib', lib)] = pick(items, alloc[lib], 'lib', rng, args.per_doc, backfill=args.lib_backfill)
    return out, alloc


def header(c, final=False):
    m = c['meta']
    where = {'arxiv': f'arXiv:{m.get("paper")} {c["main"]}', 'datikz': f'DaTikZ row {m.get("row")} ({m.get("origin")})',
             'texse': f'TeX.SE post {m.get("post")} block {m.get("block")}', 'ctan': f'TeX Live doc {m.get("from")}'}[c['source']]
    lines = [f'% DiagramTeX snippet corpus {c["id"]}' + (f' ({c["split"]})' if final else ''),
             f'% class: {c["class"]}' + (f'/{c["lib"]}' if c['lib'] else '') + (f'  tags: {" ".join(c["tags"])}' if c['tags'] else ''),
             f'% source: {where}, line {c["line"]}' + (f'  {m.get("uri")}' if m.get('uri') else ''),
             f'% engine: {c["engine"]}']
    if c['fonts_stripped']:
        lines.append(f'% fonts normalised: {" ".join(c["fonts_stripped"])} removed')
    if c['class'] == 'math':
        lines.append('% formula: ' + c['formula'].replace('\n', ' ')[:500] + ('' if len(c['formula']) <= 500 else ' …'))
    return '\n'.join(lines) + '\n'


def cmd_pool(a):
    rng = random.Random(a.seed)
    cands, dups = load_candidates(a.candidates)
    print(f'pool: {len(cands)} distinct candidates ({dups["exact"]} exact and {dups["near"]} near duplicates dropped)')
    targets = {k: math.ceil(v * a.oversample) for k, v in TARGETS.items()}
    scaled = argparse.Namespace(**{**vars(a), 'lib_min': math.ceil(a.lib_min * a.oversample), 'lib_max': math.ceil(a.lib_max * a.oversample)})
    chosen, alloc = strata(cands, targets, scaled, rng)
    if a.all_diagrams:  # the raw tier: every distinct diagram is compiled; maths stays a stratified sample
        picked = {c['id'] for items in chosen.values() for c in items}
        rest = [c for c in cands if c['class'] != 'math' and c['id'] not in picked]
        for c in rest:
            chosen.setdefault((c['class'], c['lib']), []).append(c)
    pool = WORK / 'pool'
    pool.mkdir(parents=True, exist_ok=True)
    rows = []
    for (cls, lib), items in chosen.items():
        for c in items:
            text = header(c) + c['tex']
            p = pool / f'{c["id"]}.tex'
            if not p.exists() or p.read_text(encoding='utf-8') != text:
                p.write_text(text, encoding='utf-8')
            rows.append({k: v for k, v in c.items() if k != 'tex'})
    keep = {r['id'] for r in rows}
    for f in pool.glob('*.tex'):  # the pool is exactly this pick (compile results stay cached by content)
        if f.stem not in keep:
            f.unlink()
    write_jsonl(WORK / 'pool.jsonl', rows)
    for (cls, lib), items in sorted(chosen.items(), key=lambda kv: (kv[0][0], kv[0][1] or '')):
        print(f'  {cls + ("/" + lib if lib else ""):28s} {len(items):6d}' + (f'  (allocation {alloc.get(lib, 0)})' if lib else f'  (target {targets[cls]})'))
    print(f'pool: {len(rows)} snippets in {pool}')


def usable(r, a):
    if not r or r.get('status') != 'ok' or r.get('pages') != 1 or r.get('empty') or r.get('missing_chars'):
        return False
    b = r.get('ink_bbox_pt')
    return bool(b) and (b[2] - b[0]) <= a.max_cm * 72 / 2.54 and (b[3] - b[1]) <= a.max_cm * 72 / 2.54


def cmd_final(a):
    rng = random.Random(a.seed + 1)
    pool = list(read_jsonl(WORK / 'pool.jsonl'))
    res = {r['id']: r for r in read_jsonl(WORK / 'compile' / 'results.jsonl')}
    texts = {}
    ok = []
    yield_ = collections.Counter()
    for c in pool:
        r = res.get(c['id'])
        good = usable(r, a)
        key = (c['source'], c['class'])
        yield_[key + ('all',)] += 1
        yield_[key + ('ok',)] += good
        if good:
            c['tex'] = (WORK / 'pool' / f'{c["id"]}.tex').read_text(encoding='utf-8')
            c['compile'] = {k: r.get(k) for k in ('engine', 'seconds', 'ink_bbox_pt', 'overfull', 'runs')}
            ok.append(c)
    # the raw tier: every diagram that compiled cleanly (its document stays in work/pool, its PDF in work/compile)
    write_jsonl(EXT / 'raw-diagrams.jsonl', ({k: v for k, v in c.items() if k != 'tex'} | {
        'tex_path': f'work/pool/{c["id"]}.tex', 'pdf_path': f'work/compile/{c["id"]}.pdf'} for c in ok if c['class'] != 'math'))
    chosen, alloc = strata(ok, TARGETS, a, rng)
    # held-out: every fifth of each stratum, by a seeded order
    for items in chosen.values():
        for n, c in enumerate(sorted(items, key=lambda c: sha(f'{a.seed}:{c["id"]}'))):
            c['split'] = 'heldout' if n % 5 == 4 else 'dev'
    if CASES.exists():
        shutil.rmtree(CASES)
    cases = []
    for (cls, lib), items in chosen.items():
        d = CASES / (f'lib/{lib}' if lib else cls)
        d.mkdir(parents=True, exist_ok=True)
        for c in items:
            body = c['tex'].split('\n')
            body = '\n'.join(l for l in body if not l.startswith('% ') or not re.match(r'% (DiagramTeX snippet|class:|source:|engine:|fonts normalised:|formula:)', l))
            (d / f'{c["id"]}.tex').write_text(header(c, final=True) + body.lstrip('\n'), encoding='utf-8')
            shutil.copyfile(WORK / 'compile' / f'{c["id"]}.pdf', d / f'{c["id"]}.pdf')
            row = {k: v for k, v in c.items() if k not in ('tex',)}
            row['path'] = str((d / f'{c["id"]}.tex').relative_to(EXT))
            cases.append(row)
    sources = {}
    for name in ('datikz', 'texse', 'ctan'):
        p = RAW / name / 'meta.json'
        if p.exists():
            sources[name] = json.loads(p.read_text())
    sources['arxiv'] = {'papers_with_source': sum(1 for r in read_jsonl(RAW / 'arxiv' / 'fetched.jsonl') if r.get('file'))}
    import compile as comp  # noqa: E402
    manifest = {'created': time.strftime('%Y-%m-%d'), 'seed': a.seed, 'targets': TARGETS, 'lib_allocation': alloc,
                'compiler_image': comp.IMAGE, 'sources': sources, 'count': len(cases),
                'splits': dict(collections.Counter(c['split'] for c in cases)), 'cases': cases}
    (EXT / 'manifest.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    report(cases, chosen, alloc, yield_, a, ok)


def report(cases, chosen, alloc, yield_, a, ok=()):
    L = ['# Snippet corpus', '', f'{len(cases)} snippets, frozen {time.strftime("%Y-%m-%d")} (seed {a.seed}). '
         'Generated by scripts/snippets/curate.py final; see scripts/snippets/README.md.', '',
         '| Stratum | Snippets | Target | dev | held-out |', '|---|---:|---:|---:|---:|']
    for (cls, lib), items in sorted(chosen.items(), key=lambda kv: (kv[0][0], kv[0][1] or '')):
        tgt = alloc[lib] if lib else TARGETS[cls]
        sp = collections.Counter(c['split'] for c in items)
        L.append(f'| {cls + ("/" + lib if lib else "")} | {len(items)} | {tgt} | {sp["dev"]} | {sp["heldout"]} |')
    L += ['', '## Sources', '', '| Source | math | tikz | lib |', '|---|---:|---:|---:|']
    by = collections.Counter((c['source'], c['class']) for c in cases)
    for s in ('arxiv', 'datikz', 'texse', 'ctan'):
        L.append(f'| {s} | {by[(s, "math")]} | {by[(s, "tikz")]} | {by[(s, "lib")]} |')
    L += ['', '## Compile yield of the pool (real LaTeX in the container)', '', '| Source | Class | Compiled cleanly |', '|---|---|---:|']
    for (s, cl, k), v in sorted(yield_.items()):
        if k == 'all':
            L.append(f'| {s} | {cl} | {yield_[(s, cl, "ok")]}/{v} ({100 * yield_[(s, cl, "ok")] / max(v, 1):.0f} %) |')
    for cls in ('math', 'tikz'):
        tags = collections.Counter(t for c in cases if c['class'] == cls for t in c['tags'])
        L += ['', f'## {cls} tags', '', ' · '.join(f'{t} {n}' for t, n in tags.most_common())]
    raw = collections.Counter(c['lib'] or c['class'] for c in ok if c['class'] != 'math')
    L += ['', f'## Raw tier: {sum(raw.values())} diagrams compiled cleanly (raw-diagrams.jsonl)', '',
          ' · '.join(f'{k} {v}' for k, v in raw.most_common())]
    eng = collections.Counter(c['engine'] for c in cases)
    L += ['', f'Engines: {dict(eng)}. Fonts normalised in {sum(1 for c in cases if c["fonts_stripped"])} snippets.']
    (EXT / 'REPORT.md').write_text('\n'.join(L) + '\n')
    print('\n'.join(L[:40]))


def cmd_probe(a):
    """Compile a random sample of candidates and tally why they fail (for tuning extract.py)."""
    import subprocess
    rng = random.Random(a.seed)
    rows = [json.loads(l) for l in gzip.open(a.candidates, 'rt', encoding='utf-8')]
    if a.source:
        rows = [r for r in rows if r['source'] == a.source]
    rng.shuffle(rows)
    n = a.n // 3
    sample = [r for r in rows if r['class'] == 'tikz'][:n] + [r for r in rows if r['class'] == 'lib'][:n] + [r for r in rows if r['class'] == 'math'][:a.n - 2 * n]
    d = WORK / 'probe'
    if d.exists():
        shutil.rmtree(d)
    (d / 'pool').mkdir(parents=True)
    for r in sample:
        (d / 'pool' / f'{r["id"]}.tex').write_text(header(r) + r['tex'], encoding='utf-8')
    subprocess.run([sys.executable, '-I', str(pathlib.Path(__file__).with_name('compile.py')), '--dir', str(d / 'pool'), '-j', '10', '--chunk', '8'], check=True)
    res = {r['id']: r for r in read_jsonl(d / 'compile' / 'results.jsonl')}
    tally, why = collections.Counter(), collections.Counter()
    for r in sample:
        x = res.get(r['id'], {})
        good = usable(x, a)
        tally[(r['source'], r['class'], 'ok' if good else 'fail')] += 1
        if not good:
            e = x.get('missing_file') and 'missing ' + x['missing_file'] or (x.get('errors') or [x.get('status')])[0] or ''
            why[re.sub(r'^\./s\.tex:\d+: ', '', str(e))[:100]] += 1
    for k, v in sorted(tally.items()):
        print(f'{v:5d}  {" ".join(k)}')
    for e, v in why.most_common(30):
        print(f'{v:5d}  {e}')
    print(f'probe: sources in {d / "pool"}, logs in {d / "compile"}')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('cmd', choices=['pool', 'final', 'probe'])
    p.add_argument('--n', type=int, default=150, help='probe: sample size')
    p.add_argument('--source', help='probe: only this source')
    p.add_argument('--candidates', default=str(WORK / 'candidates.jsonl.gz'))
    p.add_argument('--seed', type=int, default=20261123)
    p.add_argument('--oversample', type=float, default=1.8)
    p.add_argument('--per-doc', type=int, default=3)
    p.add_argument('--lib-min', type=int, default=50)
    p.add_argument('--lib-max', type=int, default=300)
    p.add_argument('--lib-backfill', type=int, default=100,
                   help='a library still short of this is topped up past the per-document and source caps (zx-calculus: mostly its manual)')
    p.add_argument('--max-cm', type=float, default=50, help='largest ink width/height kept (cm)')
    p.add_argument('--no-all-diagrams', dest='all_diagrams', action='store_false',
                   help='pool: only the oversampled pick, not every distinct diagram (the raw tier)')
    a = p.parse_args()
    {'pool': cmd_pool, 'final': cmd_final, 'probe': cmd_probe}[a.cmd](a)


if __name__ == '__main__':
    main()
