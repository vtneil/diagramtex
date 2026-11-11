#!/usr/bin/env python3
"""Tolerance match score from the parity composites (app | LaTeX | overlay).
Overlay colours: dark (60,60,60) both, red (230,40,40) app only, blue (40,90,230) LaTeX only.
Score at tolerance r px: share of all ink pixels (app ink + LaTeX ink) that have ink of the other picture
within r px (Chebyshev). 100 px = 1 cm."""
import sys, zlib, struct, os

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    i = 8; idat = []; w = h = ct = bd = None
    while i < len(data):
        n, = struct.unpack('>I', data[i:i+4]); t = data[i+4:i+8]; c = data[i+8:i+8+n]; i += 12 + n
        if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', c[:10])
        elif t == b'IDAT': idat.append(c)
        elif t == b'IEND': break
    assert bd == 8 and ct in (2, 6), (bd, ct)
    bpp = 3 if ct == 2 else 4
    raw = zlib.decompress(b''.join(idat)); stride = w * bpp
    rows = []; prev = bytearray(stride); p = 0
    for y in range(h):
        f = raw[p]; line = bytearray(raw[p+1:p+1+stride]); p += 1 + stride
        if f == 1:
            for x in range(bpp, stride): line[x] = (line[x] + line[x-bpp]) & 255
        elif f == 2:
            line = bytearray((a + b) & 255 for a, b in zip(line, prev))
        elif f == 3:
            for x in range(stride):
                a = line[x-bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x-bpp] if x >= bpp else 0; b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
                pa = abs(b - c); pb = abs(a - c); pc = abs(a + b - 2*c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line)); prev = line
    return w, h, bpp, rows

def masks(path):
    w, h, bpp, rows = read_png(path)
    W = (w - 120) // 3; x0 = 2 * W + 90; top = 28; H = h - 58
    A = []; L = []
    for y in range(top, top + H):
        r = rows[y]; a = 0; l = 0
        for x in range(W):
            k = (x0 + x) * bpp; R, G, B = r[k], r[k+1], r[k+2]
            if R < 120 and G < 120 and B < 120: a |= 1 << x; l |= 1 << x       # both
            elif R > 180 and G < 100 and B < 100: a |= 1 << x                 # app only
            elif B > 180 and R < 100 and G < 150: l |= 1 << x                 # LaTeX only
        A.append(a); L.append(l)
    return W, H, A, L

def dilate(M, r):
    hz = []
    for m in M:
        d = m
        for s in range(1, r + 1): d |= (m << s) | (m >> s)
        hz.append(d)
    n = len(hz); out = []
    for y in range(n):
        d = 0
        for yy in range(max(0, y - r), min(n, y + r + 1)): d |= hz[yy]
        out.append(d)
    return out

def score(W, H, A, L, r):
    na = sum(m.bit_count() for m in A); nl = sum(m.bit_count() for m in L)
    if r == 0:
        ma = sum((a & l).bit_count() for a, l in zip(A, L)); ml = ma
    else:
        DA = dilate(A, r); DL = dilate(L, r)
        ma = sum((a & d).bit_count() for a, d in zip(A, DL)); ml = sum((l & d).bit_count() for l, d in zip(L, DA))
    return (ma + ml) / max(1, na + nl), ma / max(1, na), ml / max(1, nl)

out = {}
for p in sys.argv[1:]:
    W, H, A, L = masks(p)
    out[os.path.basename(p)[:-4]] = {f'r{r}': round(score(W, H, A, L, r)[0] * 100, 1) for r in (0, 2, 5, 10)}
    print(os.path.basename(p), out[os.path.basename(p)[:-4]], flush=True)
