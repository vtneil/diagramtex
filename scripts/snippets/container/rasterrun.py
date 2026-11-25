"""Runs inside the TeX Live container (see ../raster.py): rasterise the first page of each listed PDF with Ghostscript.

  python3 /tool/rasterrun.py /out/.lists/chunk-N.txt      (lines: <name> TAB <pdf path under /in>)

Writes /out/<name>.png (png16m, antialiased) and /out/<name>.json. 254 dpi is 100 px/cm, the scale the app's
pictures are scored at; a page too large for that (over MAX_PX a side) is drawn at a lower resolution, recorded
as `dpi`. Ghostscript runs with -dSAFER, a time limit, and only the mounted directories to see.
"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile

TIMEOUT = int(os.environ.get('RASTER_TIMEOUT', '60'))
DPI, MAX_PX, PROBE = 254, 6000, 10
GS = ['gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dFirstPage=1', '-dLastPage=1', '-sDEVICE=png16m',
      '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4']


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    return struct.unpack('>II', head[16:24]) if head[:8] == b'\x89PNG\r\n\x1a\n' else (0, 0)


def gs(pdf, png, dpi):
    p = subprocess.run(['timeout', '-k', '5', str(TIMEOUT)] + GS + [f'-r{dpi}', f'-sOutputFile={png}', pdf],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return p.returncode, p.stderr.decode('utf-8', 'replace')[-400:]


def one(name, rel, tmp):
    pdf = os.path.join('/in', rel)
    res = {'name': name, 'pdf': rel}
    try:
        res['pdf_sha'] = hashlib.sha256(open(pdf, 'rb').read()).hexdigest()
    except OSError as e:
        res.update(status='missing', error=str(e)[:200])
        return res
    # a small probe first: the page's size decides the resolution
    probe = os.path.join(tmp, 'probe.png')
    rc, err = gs(pdf, probe, PROBE)
    w, h = png_size(probe) if rc == 0 and os.path.exists(probe) else (0, 0)
    if not w:
        res.update(status='timeout' if rc in (124, 137) else 'error', error=err)
        return res
    side_in = max(w, h) / PROBE
    dpi = DPI if side_in * DPI <= MAX_PX else max(10, int(MAX_PX / side_in))
    out = os.path.join('/out', name + '.png')
    rc, err = gs(pdf, out, dpi)
    if rc != 0 or not os.path.exists(out):
        res.update(status='timeout' if rc in (124, 137) else 'error', error=err)
        return res
    res.update(status='ok', dpi=dpi, size=list(png_size(out)))
    return res


def main():
    tmp = tempfile.mkdtemp(dir='/tmp')
    for line in open(sys.argv[1], encoding='utf-8').read().splitlines():
        if '\t' not in line:
            continue
        name, rel = line.split('\t', 1)
        if '/' in name or name.startswith('.') or '..' in rel.split('/'):
            continue
        try:
            res = one(name, rel, tmp)
        except Exception as e:  # noqa: BLE001 - one bad file must not stop the chunk
            res = {'name': name, 'pdf': rel, 'status': 'harness-error', 'error': repr(e)[:300]}
        with open(os.path.join('/out', name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(res, f)


if __name__ == '__main__':
    main()
