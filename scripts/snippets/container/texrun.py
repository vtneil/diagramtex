"""Runs inside the TeX Live container (see ../compile.py): compile each listed snippet in its own empty directory.

  python3 /tool/texrun.py /out/.lists/chunk-N.txt      (reads /in/<id>.tex, writes /out/<id>.{pdf,log,json})

TeX runs with shell escape off and openout_any=p, so a source can't run programs or write outside its directory
(checked: \\write18 runs nothing, \\openout to /out is refused). openin_any=p does not stop \\input of an absolute path,
so reads are confined by the container instead: it sees only the image (nothing private), the snippets (read-only)
and the output directory, with no network, a read-only root and a non-root user.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

TIMEOUT = int(os.environ.get('SNIPPET_TIMEOUT', '60'))
ENV = {**os.environ, 'openin_any': 'p', 'openout_any': 'p', 'shell_escape': 'f', 'HOME': '/tmp/home',
       'TEXMFVAR': '/tmp/texmf-var', 'TEXMFCACHE': '/tmp/texmf-var', 'TEXMFCONFIG': '/tmp/texmf-config',
       'max_print_line': '10000', 'SOURCE_DATE_EPOCH': '0', 'FORCE_SOURCE_DATE': '1'}
ERR = re.compile(r'^(?:! .*|[^\s:]+\.[A-Za-z]+:\d+: .*)$', re.M)  # -file-line-error: s.tex:12:, foo.sty:213: …


def tex(engine, cwd):
    cmd = ['timeout', '-k', '5', str(TIMEOUT), engine, '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape',
           '-file-line-error', 's.tex']
    p = subprocess.run(cmd, cwd=cwd, env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log = open(os.path.join(cwd, 's.log'), encoding='utf-8', errors='replace').read() if os.path.exists(os.path.join(cwd, 's.log')) else ''
    return p.returncode, log


def one(sid):
    src = f'/in/{sid}.tex'
    text = open(src, encoding='utf-8').read()
    m = re.search(r'^% engine: (\w+)', text, re.M)
    engine = m[1] if m and m[1] in ('pdflatex', 'xelatex') else 'pdflatex'
    work = tempfile.mkdtemp(dir='/tmp')
    res = {'id': sid, 'engine': engine, 'tex_sha': hashlib.sha256(open(src, 'rb').read()).hexdigest()}  # the bytes, as the host hashes them
    t0 = time.time()
    try:
        shutil.copyfile(src, os.path.join(work, 's.tex'))
        rc, log = tex(engine, work)
        runs = 1
        if rc == 0 and re.search(r'Rerun to get|rerun LaTeX|Label\(s\) may have changed', log):
            rc, log = tex(engine, work); runs = 2
        res.update(seconds=round(time.time() - t0, 2), runs=runs, rc=rc)
        pdf = os.path.join(work, 's.pdf')
        if rc in (124, 137):
            res['status'] = 'timeout'
        elif rc != 0:
            res['status'] = 'error'
        elif not os.path.exists(pdf):
            res['status'] = 'no-output'
        else:
            res['status'] = 'ok'
        res['errors'] = [e[:300] for e in ERR.findall(log)[:6]]
        miss = re.search(r"File `([^']+)' not found", log)
        if miss:
            res['missing_file'] = miss[1]
        pages = re.search(r'Output written on s\.(?:pdf|xdv) \((\d+) pages?', log)
        res['pages'] = int(pages[1]) if pages else 0
        # stray text inside a picture lands in nullfont and is dropped by TeX too; only real fonts' gaps count
        res['missing_chars'] = len(re.findall(r'Missing character: There is no .* in font (?!nullfont)', log))
        res['nullfont_chars'] = len(re.findall(r'Missing character: There is no .* in font nullfont', log))
        res['undefined'] = len(re.findall(r'Undefined control sequence', log))
        res['overfull'] = len(re.findall(r'^Overfull \\[hv]box', log, re.M))
        if res['status'] == 'ok':
            g = subprocess.run(['timeout', '30', 'gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=bbox', 's.pdf'],
                               cwd=work, env=ENV, capture_output=True, text=True)
            boxes = [[float(v) for v in b.split()] for b in re.findall(r'%%HiResBoundingBox: ([-\d. ]+)', g.stderr)]
            res['ink_bbox_pt'] = boxes[0] if boxes else None
            res['empty'] = not boxes or (boxes[0][2] - boxes[0][0] <= 0 and boxes[0][3] - boxes[0][1] <= 0)
            shutil.copyfile(pdf, f'/out/{sid}.pdf')
        with open(f'/out/{sid}.log', 'w', encoding='utf-8') as f:
            f.write(log[-16000:])  # the tail holds the errors and the output line; keeps 100k logs small
    except Exception as e:  # report, keep going
        res.update(status='harness-error', errors=[f'{type(e).__name__}: {e}'])
    finally:
        shutil.rmtree(work, ignore_errors=True)
    with open(f'/out/{sid}.json', 'w', encoding='utf-8') as f:
        json.dump(res, f)


def main():
    os.makedirs('/tmp/home', exist_ok=True)
    for sid in open(sys.argv[1], encoding='utf-8').read().split():
        if re.fullmatch(r'[0-9a-f]{16}', sid):
            one(sid)


if __name__ == '__main__':
    main()
