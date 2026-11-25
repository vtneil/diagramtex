#!/usr/bin/env python3
"""Download the raw sources of the snippet corpus into ext/snippets/raw/ (resumable; see README.md).

  python3 -I scripts/snippets/fetch.py datikz            all DaTikZ train rows (code + provenance, no images)
  python3 -I scripts/snippets/fetch.py arxiv-list        choose arXiv papers (DaTikZ's arXiv papers + category samples)
  python3 -I scripts/snippets/fetch.py arxiv             download their e-prints (one connection, >= 3 s apart)
  python3 -I scripts/snippets/fetch.py texse             read Posts.xml out of the TeX.SE dump into posts.jsonl
  python3 -I scripts/snippets/fetch.py ctan              copy the target packages' documentation sources from TeX Live

Raw bytes are stored as downloaded and never unpacked to disk; extract.py reads them in memory.
"""
import argparse
import html
import json
import os
import pathlib
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RAW, Http, read_jsonl, sha, write_jsonl  # noqa: E402

# ---------------------------------------------------------------- DaTikZ

DATIKZ = 'nllg/datikz'
DATIKZ_REV = '2d03e7098ab71186a8a7f96c0d115dcda320243f'  # the commit tests/corpus/README.md was measured on


def fetch_datikz(a):
    out = RAW / 'datikz'
    out.mkdir(parents=True, exist_ok=True)
    http = Http(gap=a.gap)
    st, _, body = http.get(f'https://huggingface.co/api/datasets/{DATIKZ}')
    meta = json.loads(body)
    if meta.get('sha') != DATIKZ_REV and not a.any_revision:
        sys.exit(f'DaTikZ is at {meta.get("sha")}, not the pinned {DATIKZ_REV}: the rows API only serves the head; '
                 'pass --any-revision to accept it (and record it)')
    pages = out / 'pages'
    pages.mkdir(exist_ok=True)
    offset, total = 0, None
    while total is None or offset < total:
        cache = pages / f'{a.split}-{offset:06d}.json'
        if cache.exists():
            page = json.loads(cache.read_text())
        else:
            q = urllib.parse.urlencode({'dataset': DATIKZ, 'config': 'default', 'split': a.split, 'offset': offset, 'length': 100})
            st, _, body = http.get('https://datasets-server.huggingface.co/rows?' + q)
            if st != 200 or not body:
                sys.exit(f'rows API returned {st} at offset {offset}')
            page = json.loads(body)
            if page.get('partial'):
                sys.exit('rows API returned partial data')
            # images are not needed (references are compiled from source): keep only text columns
            page = {'num_rows_total': page['num_rows_total'],
                    'rows': [{'row_idx': r['row_idx'], **{k: v for k, v in r['row'].items() if k != 'image'}} for r in page['rows']]}
            cache.write_text(json.dumps(page))
        total = page['num_rows_total']
        offset += 100
        if offset // 100 % 50 == 0:
            print(f'datikz {offset}/{total}', flush=True)
    rows = []
    for f in sorted(pages.glob(f'{a.split}-*.json')):
        rows.extend(json.loads(f.read_text())['rows'])
    write_jsonl(out / f'{a.split}.jsonl', rows)
    (out / 'meta.json').write_text(json.dumps({'dataset': DATIKZ, 'revision': meta.get('sha'), 'split': a.split,
                                               'rows': len(rows), 'fetched': time.strftime('%Y-%m-%d')}, indent=1))
    print(f'datikz: {len(rows)} rows')


# ---------------------------------------------------------------- arXiv

# categories chosen for the libraries they tend to use; weights are shares of the category sample
ARXIV_CATS = {
    'math.CT': 6, 'math.AT': 5, 'math.AG': 4, 'math.RT': 2,            # tikz-cd, xymatrix
    'quant-ph': 14,                                                    # quantikz, zx, Bloch spheres
    'eess.SY': 6, 'eess.SP': 5, 'cs.AR': 6, 'physics.ins-det': 3,      # circuitikz, timing, bytefield
    'cs.NI': 4, 'cs.CR': 3,                                            # packet formats (bytefield), protocols (umlsd)
    'cs.FL': 5, 'cs.LO': 4,                                            # automata
    'cs.CL': 4,                                                        # forest trees
    'hep-ph': 5, 'hep-th': 3,                                          # tikz-feynman
    'physics.chem-ph': 4, 'q-bio.BM': 2,                               # chemfig
    'cs.SE': 3,                                                        # UML
    'math.MG': 2, 'math.CO': 3, 'math.PR': 2, 'cs.LG': 3, 'physics.ed-ph': 2,
    # more blocks and libraries: networks, pie and Gantt charts, knots and geometry, optics, quantum devices
    'cs.SI': 2, 'physics.soc-ph': 2, 'cs.CY': 2, 'econ.GN': 2, 'math.HO': 2, 'physics.optics': 3,
    'cond-mat.mes-hall': 3, 'q-bio.QM': 2, 'math.LO': 3, 'cs.DM': 2, 'math.GT': 3, 'stat.ME': 2, 'cs.DS': 2,
    'cs.PL': 3, 'cs.RO': 2, 'math.OC': 2, 'astro-ph.IM': 1, 'gr-qc': 2,
}


def arxiv_list(a):
    out = RAW / 'arxiv'
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(a.seed)
    chosen = {r['id']: r for r in read_jsonl(out / 'list.jsonl')}
    # 1. papers DaTikZ took a TikZ picture from: their full sources hold more pictures, maths and libraries
    have_dt = sum(1 for r in chosen.values() if r['why'] == 'datikz')
    if have_dt < a.from_datikz:
        ids = set()
        for r in read_jsonl(RAW / 'datikz' / 'train.jsonl'):
            m = re.search(r'arxiv\.org/(?:abs|pdf|e-print)/([\w.\-/]+?)(?:\.pdf)?$', r.get('uri') or '')
            if m and r.get('augmented') in (False, 'False'):
                ids.add(m[1])
        ids = sorted(i for i in ids if i not in chosen)
        rng.shuffle(ids)
        for i in ids[:a.from_datikz - have_dt]:
            chosen[i] = {'id': i, 'why': 'datikz'}
        print(f'arxiv-list: {len(ids)} DaTikZ arXiv papers available')
    # 2. a seeded sample per category, from random months of the last few years
    write_jsonl(out / 'list.jsonl', chosen.values())
    http = Http(gap=5.0)
    weights = sum(ARXIV_CATS.values())
    for cat, w in ARXIV_CATS.items():
        want = round(a.categories * w / weights)
        have = [r for r in chosen.values() if r.get('cat') == cat]
        tries = 0
        while len(have) < want and tries < 40:
            tries += 1
            y, mo = rng.randrange(a.first_year, a.last_year + 1), rng.randrange(1, 13)
            q = f'cat:{cat} AND submittedDate:[{y}{mo:02d}010000 TO {y}{mo:02d}282359]'
            url = 'https://export.arxiv.org/api/query?' + urllib.parse.urlencode(
                {'search_query': q, 'start': rng.randrange(0, 200), 'max_results': 100})
            try:
                st, _, body = http.get(url)
            except OSError as e:  # rate limited past the retries: rest, then go on with the next query
                print(f'arxiv-list: {cat}: {e}; pausing 5 min', flush=True)
                time.sleep(300)
                continue
            if not body:
                continue
            ns = {'a': 'http://www.w3.org/2005/Atom', 'x': 'http://arxiv.org/schemas/atom'}
            entries = ET.fromstring(body).findall('a:entry', ns)
            ids = [e.findtext('a:id', '', ns).rsplit('/abs/', 1)[-1] for e in entries]
            prim = [e.find('x:primary_category', ns) for e in entries]
            # primary category only, so a cross-list doesn't stand in for the field
            ids = [i for i, p in zip(ids, prim) if i and p is not None and p.get('term') == cat and i not in chosen]
            rng.shuffle(ids)
            for i in ids[:min(50, want - len(have))]:  # random months and offsets keep it spread out
                chosen[i] = {'id': i, 'why': 'category', 'cat': cat}
                have.append(chosen[i])
        print(f'arxiv-list: {cat} {len(have)}/{want}', flush=True)
        write_jsonl(out / 'list.jsonl', chosen.values())  # keep progress across interruptions
    write_jsonl(out / 'list.jsonl', chosen.values())
    print(f'arxiv-list: {len(chosen)} papers')


def arxiv_fetch(a):
    out = RAW / 'arxiv'
    src = out / 'src'
    src.mkdir(parents=True, exist_ok=True)
    done = {r['id']: r for r in read_jsonl(out / 'fetched.jsonl')}
    todo = [r for r in read_jsonl(out / 'list.jsonl') if r['id'] not in done]
    random.Random(a.seed).shuffle(todo)  # sources stay balanced however far the download gets
    http = Http(gap=3.0, log=lambda m: print('arxiv:', m, flush=True))  # one connection, >= 3 s apart
    log = (out / 'fetched.jsonl').open('a', encoding='utf-8')
    for n, r in enumerate(todo, 1):
        try:
            st, headers, body = http.get('https://export.arxiv.org/src/' + r['id'], max_bytes=a.max_mb << 20)
        except OSError as e:
            print(f'arxiv: {r["id"]}: {e}; pausing 5 min (not recorded, retried next run)', flush=True)
            time.sleep(300)
            continue
        ctype = (headers.get('Content-Type') or '').split(';')[0]
        rec = {'id': r['id'], 'status': st, 'type': ctype, 'bytes': len(body) if body else 0}
        if body is None:
            rec['skip'] = 'too large or missing'
        elif ctype == 'application/pdf' or body[:5] == b'%PDF-':
            rec['skip'] = 'PDF only, no source'
        else:
            name = r['id'].replace('/', '_') + '.bin'
            (src / name).write_bytes(body)
            rec.update(file=name, sha256=sha(body))
        log.write(json.dumps(rec) + '\n'); log.flush()
        if n % 50 == 0:
            print(f'arxiv: {n}/{len(todo)} at {time.strftime("%H:%M")} (gap {http.gap:.1f} s)', flush=True)
    print(f'arxiv: fetched {len(todo)} more, {len(done) + len(todo)} in all')


# ---------------------------------------------------------------- TeX.SE

# tags whose posts are all kept; other posts are kept with a code block and score >= --min-score
SE_TAGS = {'chemfig', 'circuitikz', 'quantikz', 'qcircuit', 'tikz-cd', 'forest', 'tikz-timing', 'bytefield', 'karnaugh',
           'kvmacros', 'pgf-umlcd', 'pgf-umlsd', 'tikz-feynman', 'tikz-3dplot', 'tkz-euclide', 'automata', 'xy-pic',
           'zx-calculus', 'blochsphere', 'tikz-chemlab', 'pgfplots', 'tikz-trees', 'tikz-matrix', 'tikz-pgf', 'math-mode',
           'amsmath', 'equations', 'align', 'matrices', 'siunitx', 'physics', 'mhchem', 'braket', 'tikz-styles',
           'tikz-arrows', 'tikz-node', 'diagrams', 'graphs', 'circuits', 'chemistry', 'feynman', 'logic-gates', 'uml',
           'tikz-shape', 'tikz-decorations', 'tikz-3d', 'pgfplots-groupplots', 'tikz-calc', 'tikz-positioning',
           'timing-diagrams', 'xymatrix', 'tikz-uml', 'tikz-circuit-lib', 'groupplots', 'symbols', 'relation-symbols',
           'stacking-symbols', 'subequations', 'trees', 'venn-diagrams', 'logic'}
SE_RARE = {'chemfig', 'circuitikz', 'quantikz', 'qcircuit', 'tikz-cd', 'forest', 'tikz-timing', 'bytefield', 'karnaugh',
           'kvmacros', 'pgf-umlcd', 'pgf-umlsd', 'tikz-feynman', 'tikz-3dplot', 'tkz-euclide', 'automata', 'xy-pic',
           'zx-calculus', 'blochsphere', 'tikz-chemlab', 'circuits', 'chemistry', 'feynman', 'logic-gates', 'uml',
           'timing-diagrams', 'xymatrix', 'tikz-uml', 'tikz-circuit-lib'}
CODE_RE = re.compile(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', re.S)


def texse(a):
    out = RAW / 'texse'
    dump = out / 'tex.stackexchange.com.7z'
    if not dump.exists():
        sys.exit(f'download the dump first: {dump} (https://archive.org/download/stackexchange/tex.stackexchange.com.7z)')
    unpacked = out / 'unpacked'  # its own empty directory, only the two named members
    if not (unpacked / 'Posts.xml').exists():
        unpacked.mkdir(exist_ok=True)
        # libarchive (macOS bsdtar) reads 7z; named members only, never absolute or parent paths
        subprocess.run(['tar', '-x', '-C', str(unpacked), '-f', str(dump), 'Posts.xml', 'Tags.xml'], check=True)
    tags_of, keep_q = {}, set()
    # pass 1: questions' tags (answers carry none)
    for _, el in ET.iterparse(unpacked / 'Posts.xml', events=('end',)):
        if el.tag == 'row' and el.get('PostTypeId') == '1':
            t = set(re.findall(r'<([^<>]+)>', el.get('Tags') or '')) or set((el.get('Tags') or '').strip('|').split('|'))
            if t & SE_TAGS:
                tags_of[el.get('Id')] = sorted(t)
        el.clear()
    rows = []
    for _, el in ET.iterparse(unpacked / 'Posts.xml', events=('end',)):
        if el.tag != 'row':
            continue
        kind, pid = el.get('PostTypeId'), el.get('Id')
        qid = pid if kind == '1' else el.get('ParentId') if kind == '2' else None
        tags = tags_of.get(qid)
        if tags:
            score = int(el.get('Score') or 0)
            rare = bool(set(tags) & SE_RARE)
            if score >= (0 if rare else a.min_score):
                code = [html.unescape(c) for c in CODE_RE.findall(el.get('Body') or '')]
                code = [c for c in code if '\\begin{document}' in c or re.search(r'\\begin\{|\\chemfig|\\xymatrix|\$', c)]
                if code:
                    rows.append({'post': pid, 'question': qid, 'type': 'q' if kind == '1' else 'a', 'score': score,
                                 'tags': tags, 'date': el.get('CreationDate'), 'code': code,
                                 'uri': f'https://tex.stackexchange.com/{"q" if kind == "1" else "a"}/{pid}'})
        el.clear()
    write_jsonl(out / 'posts.jsonl', rows)
    (out / 'meta.json').write_text(json.dumps({'dump': 'archive.org/details/stackexchange tex.stackexchange.com.7z',
                                               'sha256': sha(dump.read_bytes()), 'posts': len(rows),
                                               'license': 'CC BY-SA (per post; attribute by URI)'}, indent=1))
    print(f'texse: {len(rows)} posts with code ({sum(len(r["code"]) for r in rows)} blocks)')


# ---------------------------------------------------------------- CTAN documentation (from the local TeX Live)

CTAN_PKGS = ['chemfig', 'circuitikz', 'quantikz', 'tikz-cd', 'forest', 'tikz-timing', 'bytefield', 'karnaugh-map',
             'pgf-umlcd', 'pgf-umlsd', 'tikz-feynman', 'tikz-3dplot', 'tkz-euclide', 'zx-calculus', 'blochsphere',
             'tikz-chemlab', 'pgfplots', 'xypic', 'kvmacros']


def ctan(a):
    out = RAW / 'ctan'
    tl = pathlib.Path(subprocess.run(['kpsewhich', '-var-value=TEXMFDIST'], capture_output=True, text=True, check=True).stdout.strip())
    version = subprocess.run(['pdflatex', '--version'], capture_output=True, text=True).stdout.splitlines()[0]
    files = []
    for pkg in CTAN_PKGS:
        for top in ('doc', 'source'):
            for d in tl.glob(f'{top}/*/{pkg}'):
                for f in sorted(d.rglob('*')):
                    if f.suffix in ('.tex', '.dtx') and f.is_file() and f.stat().st_size < 4 << 20:
                        dest = out / pkg / f.relative_to(d)
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(f, dest)
                        files.append({'pkg': pkg, 'file': str(dest.relative_to(out)), 'from': str(f.relative_to(tl))})
    write_jsonl(out / 'files.jsonl', files)
    (out / 'meta.json').write_text(json.dumps({'texlive': version, 'texmfdist': str(tl), 'files': len(files)}, indent=1))
    print(f'ctan: {len(files)} files from {len({f["pkg"] for f in files})} packages')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('datikz'); s.add_argument('--split', default='train'); s.add_argument('--gap', type=float, default=1.0)
    s.add_argument('--any-revision', action='store_true'); s.set_defaults(fn=fetch_datikz)
    s = sub.add_parser('arxiv-list'); s.add_argument('--from-datikz', type=int, default=800)
    s.add_argument('--categories', type=int, default=1400); s.add_argument('--first-year', type=int, default=2019)
    s.add_argument('--last-year', type=int, default=2025); s.add_argument('--seed', type=int, default=20261123)
    s.set_defaults(fn=arxiv_list)
    s = sub.add_parser('arxiv'); s.add_argument('--max-mb', type=int, default=40); s.add_argument('--seed', type=int, default=20261123)
    s.set_defaults(fn=arxiv_fetch)
    s = sub.add_parser('texse'); s.add_argument('--min-score', type=int, default=3); s.set_defaults(fn=texse)
    s = sub.add_parser('ctan'); s.set_defaults(fn=ctan)
    a = p.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
