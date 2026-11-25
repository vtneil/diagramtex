"""Shared paths, I/O and TeX lexing for the offline snippet corpus (see README.md).

Standard library only. Every source is untrusted text: nothing here executes it, archives are read in memory
member by member, and TeX is only ever compiled inside the sandboxed container (compile.py).
"""
import hashlib
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXT = ROOT / 'ext' / 'snippets'
RAW = EXT / 'raw'
WORK = EXT / 'work'
CASES = EXT / 'cases'
UA = 'DiagramTeX-corpus/1.0 (offline parity sampling)'


def sha(text, n=None):
    h = hashlib.sha256(text.encode('utf-8') if isinstance(text, str) else text).hexdigest()
    return h[:n] if n else h


def read_jsonl(path):
    path = pathlib.Path(path)
    if not path.exists():
        return
    with path.open(encoding='utf-8') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path, rows):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    os.replace(tmp, path)


class Http:
    """One connection's worth of polite fetching: a minimum gap between requests and a few retries."""

    def __init__(self, gap=1.0, log=None):
        self.base, self.gap, self.last, self.log = gap, gap, 0.0, log

    def get(self, url, max_bytes=None, accept=None):
        for attempt in range(5):
            wait = self.last + self.gap - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA, **({'Accept': accept} if accept else {})})
                with urllib.request.urlopen(req, timeout=90) as r:
                    size = int(r.headers.get('Content-Length') or 0)
                    if max_bytes and size > max_bytes:
                        return r.status, dict(r.headers), None
                    body = r.read(max_bytes + 1 if max_bytes else -1)
                    self.gap = max(self.base, self.gap * 0.9)  # after a slow-down, ease back to the base gap
                    if max_bytes and len(body) > max_bytes:
                        return r.status, dict(r.headers), None
                    return r.status, dict(r.headers), body
            except urllib.error.HTTPError as e:
                if e.code in (403, 404, 410):
                    return e.code, dict(e.headers or {}), None
                if attempt == 4:
                    raise
                retry = (e.headers or {}).get('Retry-After')
                wait = float(retry) if retry and retry.isdigit() else 0
                if e.code in (429, 503):  # rate limited: back off hard, and go slower for a while
                    wait = max(wait, 60 * (attempt + 1))
                    self.gap = min(self.gap * 1.5, 30)
                    if self.log:
                        self.log(f'HTTP {e.code} on {url}: waiting {wait:.0f} s, gap now {self.gap:.1f} s')
                time.sleep(max(wait, min(120, self.gap * 2 ** (attempt + 1))))
            except (OSError, ValueError):
                if attempt == 4:
                    raise
                time.sleep(min(120, self.gap * 2 ** (attempt + 1)))


# ---------------------------------------------------------------- TeX lexing (no TeX semantics beyond grouping)

def strip_comments(text):
    """Drop % comments as TeX reads them: the comment, its newline and the next line's leading spaces go
    (so a whole-line comment never becomes a blank line, which TeX would read as \\par). \\% is kept."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '\\' and i + 1 < n:
            out.append(text[i:i + 2]); i += 2; continue
        if c == '%':
            j = text.find('\n', i)
            if j < 0:
                break
            i = j + 1
            while i < n and text[i] in ' \t':
                i += 1
            continue
        out.append(c); i += 1
    return ''.join(out)


def skip_ws(text, i):
    n = len(text)
    while i < n and text[i] in ' \t\r\n':
        i += 1
    return i


def group_end(text, i, open_='{', close='}'):
    """text[i] is an opening delimiter: the index just past its balanced close, or -1."""
    depth, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '\\':
            i += 2; continue
        if c == open_:
            depth += 1
        elif c == close:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def read_arg(text, i):
    """A mandatory argument at i (after spaces): (content, end) or (None, i). A bare token counts too."""
    j = skip_ws(text, i)
    if j >= len(text):
        return None, i
    if text[j] == '{':
        e = group_end(text, j)
        return (text[j + 1:e - 1], e) if e > 0 else (None, i)
    if text[j] == '\\':
        m = re.compile(r'\\(?:[A-Za-z@]+|.)').match(text, j)
        return (m[0], m.end()) if m else (None, i)
    return text[j], j + 1


def read_opt(text, i):
    """An optional [..] argument at i (after spaces): (content, end) or (None, i). Braces inside are skipped."""
    j = skip_ws(text, i)
    if j < len(text) and text[j] == '[':
        depth, k, n = 0, j, len(text)
        while k < n:
            c = text[k]
            if c == '\\':
                k += 2; continue
            if c == '{':
                e = group_end(text, k)
                if e < 0:
                    return None, i
                k = e; continue
            if c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    return text[j + 1:k], k + 1
            k += 1
    return None, i


BEGIN_RE = re.compile(r'\\(begin|end)\s*\{([^{}]+)\}')


def env_end(text, name, start):
    """start points just past \\begin{name}: the index just past the matching \\end{name}, or -1."""
    depth = 1
    for m in BEGIN_RE.finditer(text, start):
        if m[2].strip() != name:
            continue
        depth += 1 if m[1] == 'begin' else -1
        if depth == 0:
            return m.end()
    return -1


def envs(text, names):
    """Outermost occurrences of the named environments: (name, begin, end) in order."""
    i, out = 0, []
    pat = re.compile(r'\\begin\s*\{(' + '|'.join(re.escape(n) for n in names) + r')\}')
    while True:
        m = pat.search(text, i)
        if not m:
            return out
        e = env_end(text, m[1], m.end())
        if e < 0:
            i = m.end(); continue
        out.append((m[1], m.start(), e))
        i = e


CS_RE = re.compile(r'\\([A-Za-z@]+)')


def control_words(text):
    return set(CS_RE.findall(text))


def normalise(text):
    """For de-duplication: comments, whitespace runs and blank lines don't matter."""
    return re.sub(r'\s+', ' ', strip_comments(text)).strip()
