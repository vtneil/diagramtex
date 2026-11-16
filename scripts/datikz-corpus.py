#!/usr/bin/env python3
"""Inventory TikZ constructs and select reproducible, provenance-bearing visual cases.

Default: bounded rows API scan, no Python dependencies or bulk image/parquet download.
Optional --backend datasets uses HF streaming at an exact dataset revision.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import random
import re
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError

DATASET = 'nllg/datikz'
FEATURES = {
    'loops': r'\\foreach\b', 'pics': r'\bpic\s*[\[{]|pics/',
    'styles': r'/\.style', 'style-arguments': r'/\.style\s*(?:args|\d|n args)|#\d',
    'curves': r'\.\.\s*controls\b', 'arcs': r'\barc\s*[\[(]',
    'relative-coordinates': r'\+\+?\(', 'polar-coordinates': r'\([^()\n]*:[^()\n]*\)',
    'calc': r'\$\([^\n]*|\|-|-\|', 'positioning': r'\b(?:above|below|left|right)\s*=\s*(?:[^,\]\n]*\s)?of\b',
    'anchors': r'\.[a-z ]*(?:north|south|east|west|center)\b',
    'fit': r'\bfit\s*=', 'gradients': r'\b(?:left|right|top|bottom|middle|ball) color\s*=|\bshading\s*=',
    'patterns': r'\bpattern\s*=', 'transparency': r'\bopacity\s*=',
    'plots': r'\\(?:addplot\w*|begin\{(?:axis|groupplot)\})|\bplot\s*[\[(]',
    'matrix': r'\\matrix\b|\bmatrix of\b', 'trees': r'\bchild\s*(?:\[|\{)|\\begin\{forest\}',
    'macros': r'\\(?:def|newcommand|renewcommand|pgfmathsetmacro)\b',
    'clipping': r'\\clip\b|\bclip\s*=', 'decorations': r'\bdecorat(?:e|ion)\b',
    'procedural-pgf': r'\\(?:pgfextra|pgfkeys|pgfmathparse|pgfdeclare\w*)\b|append after command',
    'external-assets': r'\\(?:includegraphics|input|include|includesvg)\b',
    '3d': r'\\tdplot\w*|\\begin\{axis\}[^;]*view\s*=',
}

def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def uncomment(code):
    # A TeX control symbol consumes the character after its backslash, including escaped percent.
    return re.sub(r'\\(?:[A-Za-z@]+|[^\n])|%[^\n]*', lambda m: '' if m[0].startswith('%') else m[0], code)


def groups(text):
    """Balanced groups, including nested options; ignores escaped delimiters."""
    stack = []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '\\':
            i += 2
            continue
        if c in '[{':
            stack.append((c, i))
        elif c in ']}' and stack and stack[-1][0] == ( '[' if c == ']' else '{'):
            opening, start = stack.pop()
            yield opening, start, text[start + 1:i]
        i += 1


def split_top(text):
    depth = 0
    start = 0
    i = 0
    while i < len(text):
        c = text[i]
        if c == '\\':
            i += 2
            continue
        if c in '{[(':
            depth += 1
        elif c in '}])':
            depth -= 1
        elif c == ',' and depth == 0:
            yield text[start:i].strip()
            start = i + 1
        i += 1
    yield text[start:].strip()


def constructs(code):
    text = uncomment(code)
    commands = collections.Counter(re.findall(r'\\([A-Za-z@]+)', text))
    environments = collections.Counter(re.findall(r'\\begin\s*\{([^}]+)\}', text))
    libraries, packages = [], []
    for command, out in [('usetikzlibrary', libraries), ('usepgfplotslibrary', libraries), ('usepackage', packages)]:
        for m in re.finditer(r'\\' + command + r'(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}', text):
            out.extend(v.strip() for v in m[1].split(',') if v.strip())
    keys = collections.Counter()
    for opening, start, body in groups(text):
        # [] option lists and {...} immediately following a style/key handler or tikzset.
        prefix = text[max(0, start - 100):start]
        if opening != '[' and not re.search(r'(?:\\tikzset\s*|/\.(?:style(?:\s+(?:args|\d+ args|n args))?|append style|prefix style|pic)\s*=\s*)$', prefix):
            continue
        for option in split_top(body):
            key = option.split('=', 1)[0].strip()
            if key and len(key) < 100 and not re.search(r'[{}\\$;\n]', key):
                keys[re.sub(r'\s+', ' ', key)] += 1
    flags = [name for name, pattern in FEATURES.items() if re.search(pattern, text)]
    return {'commands': commands, 'environments': environments, 'libraries': collections.Counter(libraries),
            'packages': collections.Counter(packages), 'option_keys': keys, 'features': collections.Counter(flags)}


def get_json(url, cache=None):
    if cache and cache.exists():
        return json.loads(cache.read_text())
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'DiagramTeX-corpus/1.0'})
            with urllib.request.urlopen(request, timeout=45) as response:
                result = json.load(response)
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_text(json.dumps(result))
            return result
        except (OSError, ValueError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def hub_rows(args, out, meta):
    splits = meta['cardData']['dataset_info']['splits']
    total = next(s['num_examples'] for s in splits if s['name'] == args.split)
    rng = random.Random(args.seed)
    count = min(args.max_rows, total)
    seen = set()
    # Random windows keep requests bounded while spreading across the whole split.
    while len(seen) < count:
        length = min(100, count - len(seen))
        offset = rng.randrange(max(1, total - length + 1)) if count < total else len(seen)
        query = urllib.parse.urlencode({'dataset': DATASET, 'config': 'default', 'split': args.split, 'offset': offset, 'length': length})
        cache = out / 'cache' / meta['sha'] / f'{args.split}-{offset}-{length}.json'
        page = get_json('https://datasets-server.huggingface.co/rows?' + query, cache)
        if page.get('partial') or not page.get('rows'):
            raise ValueError('Rows API returned partial/empty data; use --backend datasets for a pinned stream')
        for item in page['rows']:
            if item.get('truncated_cells'):
                raise ValueError('Truncated rows are not valid coverage inputs')
            idx = item['row_idx']
            if idx in seen:
                continue
            row = item['row']
            image = row.get('image') or {}
            if image.get('src') and f"/--/{meta['sha']}/--/" not in image['src']:
                raise ValueError('Dataset viewer revision differs from pinned metadata; remove stale cache or use --backend datasets')
            seen.add(idx)
            yield idx, row
            if len(seen) == count:
                return


def dataset_rows(args, out, meta):
    # Optional code-column scan. Project metadata columns and never decode image pixels.
    try:
        from datasets import load_dataset
    except ImportError as error:
        raise SystemExit('Install datasets in a virtual environment for --backend datasets') from error
    stream = load_dataset(DATASET, split=args.split, streaming=True, revision=meta['sha'],
        columns=['code', 'uri', 'origin', 'augmented'])
    stream = stream.select_columns(['code', 'uri', 'origin', 'augmented'])
    for idx, row in enumerate(stream):
        if idx >= args.max_rows:
            break
        yield idx, row


def select_cases(rows, limit, seed):
    """Half seeded random baseline, half greedy coverage of features/origins/size strata."""
    ordered = sorted(rows, key=lambda r: digest(f'{seed}:{r["sha256"]}'))
    chosen = ordered[:min(limit, (limit + 1) // 2)]
    remaining = ordered[len(chosen):]
    covered = set().union(*(set(r['tags']) for r in chosen)) if chosen else set()
    while remaining and len(chosen) < limit:
        best = max(remaining, key=lambda r: len(set(r['tags']) - covered))
        remaining.remove(best)
        chosen.append(best)
        covered.update(best['tags'])
    return chosen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend', choices=['hub', 'datasets', 'jsonl'], default='hub')
    parser.add_argument('--input', type=pathlib.Path, help='Local JSONL with code, uri, origin and optional image')
    parser.add_argument('--out', type=pathlib.Path, default=pathlib.Path('artifacts/datikz'))
    parser.add_argument('--split', choices=['train', 'test'], default='train')
    parser.add_argument('--revision', help='Exact revision for datasets backend; hub backend requires current HEAD')
    parser.add_argument('--max-rows', type=int, default=1000)
    parser.add_argument('--samples', type=int, default=40)
    parser.add_argument('--seed', type=int, default=20261115)
    parser.add_argument('--max-code-bytes', type=int, default=100000)
    parser.add_argument('--images', action='store_true', help='Download reference images for selected cases only')
    args = parser.parse_args()
    if args.images and args.backend == 'datasets':
        parser.error('--images uses the hub backend; datasets backend inventories projected text columns only')
    if args.max_rows < 1 or args.samples < 1 or args.max_code_bytes < 1:
        parser.error('row/sample/size limits must be positive')
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if args.backend == 'jsonl':
        if not args.input:
            parser.error('--input is required for jsonl')
        source = args.input.read_bytes()
        meta = {'sha': digest(source.decode()), 'source': str(args.input)}
        rows = ((i, json.loads(line)) for i, line in enumerate(source.decode().splitlines()[:args.max_rows]) if line.strip())
    else:
        meta = get_json('https://huggingface.co/api/datasets/' + DATASET)
        if args.revision and args.backend == 'hub' and args.revision != meta['sha']:
            parser.error('Rows API serves HEAD; use datasets backend to request a historical revision')
        if args.revision:
            meta['sha'] = args.revision
        rows = hub_rows(args, out, meta) if args.backend == 'hub' else dataset_rows(args, out, meta)
    occurrences = collections.defaultdict(collections.Counter)
    documents = collections.defaultdict(collections.Counter)
    eligible, hashes = [], set()
    scanned = duplicate = oversized = 0
    provenance = collections.Counter()
    for idx, row in rows:
        code = row.get('code')
        if not isinstance(code, str) or not code.strip():
            continue
        scanned += 1
        token_sets = constructs(code)
        for category, counts in token_sets.items():
            occurrences[category].update(counts)
            documents[category].update(counts.keys())
        provenance[row.get('origin') or 'unknown'] += 1
        code_hash = digest(code)
        if code_hash in hashes:
            duplicate += 1
            continue
        hashes.add(code_hash)
        if len(code.encode()) > args.max_code_bytes:
            oversized += 1
            continue
        tags = list(token_sets['features']) + ['origin:' + (row.get('origin') or 'unknown'),
            'size:' + ('short' if len(code) < 1500 else 'medium' if len(code) < 6000 else 'long'),
            'augmented:' + str(row.get('augmented'))]
        eligible.append({'id': f'{args.split}-{idx:06d}-{code_hash[:10]}', 'row_index': idx, 'split': args.split,
            'sha256': code_hash, 'code': code, 'uri': row.get('uri'), 'origin': row.get('origin'),
            'augmented': row.get('augmented'), 'image': row.get('image'), 'tags': tags})
    chosen = select_cases(eligible, args.samples, args.seed)
    for row in chosen:
        (out / 'cases').mkdir(exist_ok=True)
        (out / 'cases' / (row['id'] + '.tex')).write_text(row['code'])
        row['code_path'] = 'cases/' + row['id'] + '.tex'
        if args.images and (row.get('image') or {}).get('src'):
            url = row['image']['src']
            parts = urllib.parse.urlsplit(url)
            if parts.scheme != 'https' or parts.hostname != 'datasets-server.huggingface.co':
                raise ValueError('Unexpected reference-image host')
            target = out / 'cases' / (row['id'] + '.jpg')
            if not target.exists():
                try:
                    with urllib.request.urlopen(url, timeout=45) as response:
                        data = response.read(5_000_001)
                except HTTPError as error:
                    if error.code not in (403, 404) or args.backend != 'hub':
                        raise
                    # Refresh expiring signed URLs without changing the sampled code/revision.
                    query = urllib.parse.urlencode({'dataset':DATASET,'config':'default','split':args.split,'offset':row['row_index'],'length':1})
                    fresh = get_json('https://datasets-server.huggingface.co/rows?' + query)['rows'][0]
                    fresh_image = fresh['row'].get('image') or {}
                    url = fresh_image.get('src','')
                    if fresh.get('truncated_cells') or digest(fresh['row']['code']) != row['sha256'] or f"/--/{meta['sha']}/--/" not in url:
                        raise ValueError('Reference refresh changed dataset revision/source')
                    if urllib.parse.urlsplit(url).hostname != 'datasets-server.huggingface.co' or not url.startswith('https://'):
                        raise ValueError('Unexpected refreshed reference-image host')
                    with urllib.request.urlopen(url, timeout=45) as response:
                        data = response.read(5_000_001)
                if len(data) > 5_000_000:
                    raise ValueError('Reference image exceeds 5 MB')
                target.write_bytes(data)
            row['image_path'] = 'cases/' + target.name
        row.pop('code')
        # Signed viewer URLs expire; retain only local image metadata and provenance in the manifest.
        image = row.pop('image', None) or {}
        row['reference_size'] = {k: image[k] for k in ['width', 'height'] if k in image}
    inventory = {category: [{'token': key, 'occurrences': count, 'documents': documents[category][key]}
        for key, count in sorted(counts.items(), key=lambda p: (-documents[category][p[0]], p[0]))]
        for category, counts in occurrences.items()}
    manifest = {'dataset': DATASET if args.backend != 'jsonl' else 'local-jsonl', 'revision': meta['sha'],
        'backend': args.backend, 'split': args.split, 'seed': args.seed, 'scanned_rows': scanned,
        'scanner': {'version':1, 'requested_rows':args.max_rows, 'requested_samples':args.samples, 'max_code_bytes':args.max_code_bytes},
        'eligible_unique_rows': len(eligible), 'duplicate_code_rows': duplicate, 'oversized_rows_excluded_from_sampling': oversized,
        'selection': 'half seeded random, half greedy feature/origin/size coverage', 'cases': chosen}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    (out / 'inventory.json').write_text(json.dumps({'scanned_rows': scanned, 'origins': provenance, 'lexical_inventory': inventory}, indent=2, ensure_ascii=False) + '\n')
    (out / 'dataset-metadata.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'out': str(out), 'revision': meta['sha'], 'scanned': scanned, 'sampled': len(chosen),
        'reference_images': sum('image_path' in c for c in chosen), 'feature_documents': documents['features']}, indent=2))

if __name__ == '__main__':
    main()
