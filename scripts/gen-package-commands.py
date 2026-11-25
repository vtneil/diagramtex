#!/usr/bin/env python3
"""Build src/domain/package-commands.ts: the commands and environments each package defines, as TeX Live has them.

  python3 -I scripts/gen-package-commands.py

An export loads a package only when something in it uses one of that package's commands (src/domain/texlint.ts
mathNeeds). This measures, for every package below, the control sequences that loading it defines in a document that
already loads TikZ (LuaTeX lists every defined name: tex.hashtokens), less what TikZ defines inside a picture and what
infrastructure packages (kvoptions, environ …) define. Each name goes to the first package in PACKAGES that defines
it, so a package that loads another (mathtools loads amsmath) gets only its own names. Runs TeX Live in Docker (the
image the snippet corpus uses), with no network; only TeX Live's own files are read.
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snippets'))
from compile import IMAGE  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'domain' / 'package-commands.ts'

# Priority order: a name two packages define goes to the earlier one. Packages that change fonts or the look of what
# is already there (mathabx, MnSymbol, txfonts, fourier, nccmath, calrsfs …) are left out: loading one for one symbol
# would change every formula. braket, physics, siunitx and mhchem have rules of their own in texlint.ts.
PACKAGES = '''
amsmath amssymb amsfonts array etoolbox xparse calc ifthen xifthen xstring listofitems amsthm mathtools latexsym textcomp
stmaryrd mathrsfs bm amsbsy amsxtra xspace url pifont gensymb contour scalerel stackengine accents eqparbox varwidth
blkarray ytableau youngtab amscd makecell rotating multirow booktabs cancel extarrows yhmath esint mathdots upgreek
euscript nicefrac xfrac slashed centernot tensor cmll bussproofs mathpartir proof semantic stackrel relsize faktor
esvect dsfont bbm cases colonequals units ulem soul diagbox tabularx arydshln colortbl hhline bigstrut bigdelim lipsum
blindtext tikzducks skull epsdice steinmetz mathcomp textgreek abraces oubraces empheq turnstile shuffle simplewick
adjustbox eurosym multicol framed trimclip ragged2e boldline wasysym marvosym bbding ifsym tikzsymbols circledsteps
elements listings tikz-dimline dynkin-diagrams mdframed tcolorbox cleveref hyperref
'''.split()
# what a package brings along that isn't its own, and what every document defines already
DEPS = 'kvoptions keyval xkeyval kvsetkeys ltxcmds environ trimspaces etexcmds infwarerr pdftexcmds iftex ifpdf letltxmacro epstopdf-base kvdefinekeys'.split()
# packages whose loading pulls in large machinery: only these of their names
ONLY = {
    'hyperref': 'href hyperlink hypertarget hyperref hypersetup texorpdfstring nolinkurl phantomsection autoref'.split(),
    'tikz-dimline': ['dimline'],
}
# names the kernel defines only to say "not provided in base LaTeX2e" (latexsym's; amssymb has them too)
STUBS = {n: 'amssymb' for n in 'mho Join Box Diamond leadsto sqsubset sqsupset lhd unlhd rhd unrhd'.split()}
# names that are a package's internals or too likely to mean something else
SKIP_NAMES = {'arc'}
# the packages DiagramTeX's blocks load: a name one of them defines is theirs in a picture (quantikz's \phase is not
# steinmetz's), so it is left out of the table (one that doesn't load here, as zx-calculus with standalone's tikz
# option, is skipped)
BLOCKS = '''pgfplots tikz-cd circuitikz chemfig forest xy tikz-feynman tikz-timing karnaugh-map bytefield pgf-umlcd pgf-umlsd
tikz-3dplot tkz-euclide zx-calculus blochsphere pgf-pie smartdiagram tikz-qtree tikz-network pgfgantt quantikz siunitx
physics mhchem braket tikz-chemlab'''.split()

LUA = r'''
function snap() before={} for _,n in ipairs(tex.hashtokens()) do if token.is_defined(n) then before[n]=true end end end
function dump(path) local f=io.open(path,"w") for _,n in ipairs(tex.hashtokens()) do if token.is_defined(n) and not before[n] and n:match("^[A-Za-z]+%*?$") then f:write(n,"\n") end end f:close() end
'''
DOC = r'''\documentclass[tikz]{standalone}
\usepackage{tikz}
\directlua{dofile("/w/dump.lua") snap()}
\usepackage{PKG}
\begin{document}
\directlua{dump("PKG.txt")}
x
\end{document}
'''
# the base: everything defined inside a picture, in a document that loads only TikZ
BASE = r'''\documentclass[tikz]{standalone}
\directlua{dofile("/w/dump.lua") before={}}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\directlua{dump("base.txt")}
\node {x};
\end{tikzpicture}
\end{document}
'''
RUN = r'''#!/bin/sh
cd /tmp && lualatex -interaction=batchmode -halt-on-error "/w/$1.tex" >/dev/null 2>&1 && cp "$1.txt" /w/ || echo "failed: $1"
'''


def main():
    with tempfile.TemporaryDirectory() as w:
        wd = pathlib.Path(w)
        (wd / 'dump.lua').write_text(LUA)
        (wd / 'run.sh').write_text(RUN)
        os.chmod(wd / 'run.sh', 0o755)
        (wd / 'base.tex').write_text(BASE)
        names = PACKAGES + DEPS + BLOCKS
        for p in names:
            (wd / f'{p}.tex').write_text(DOC.replace('PKG', p))
        (wd / 'list.txt').write_text('\n'.join(['base'] + names))
        subprocess.run(['docker', 'run', '--rm', '--network', 'none', '-v', f'{wd}:/w', IMAGE, 'sh', '-c',
                        'cat /w/list.txt | xargs -P 8 -n1 /w/run.sh'], check=True)
        read = lambda p: set((wd / f'{p}.txt').read_text().split()) if (wd / f'{p}.txt').exists() else None
        base = read('base') or set()
        for d in DEPS:
            base |= read(d) or set()
        # a block's own names: not those of a package in the table that it loads (all of that package's names are
        # among the block's: physics loads amsmath, whose \gathered stays amsmath's)
        dumps = {p: read(p) for p in PACKAGES}
        theirs = set()
        for b in BLOCKS:
            full = read(b) or set()
            s = set(full)
            for p, d in dumps.items():
                if d and len(d & full) >= 0.9 * len(d):
                    s -= d
            theirs |= s
        own, missing = {}, []
        for p in PACKAGES:
            s = read(p)
            if s is None:
                missing.append(p)
                continue
            s -= base | theirs
            if p in ONLY:
                s &= set(ONLY[p])
            for n in sorted(s):
                # PGF and TikZ internals a package loads, and \if switches with their \…true / \…false
                if re.match(r'(if|end|begin)?(pgf|tikz)', n) or n in SKIP_NAMES:
                    continue
                if re.match(r'if[a-z]', n) or (re.search(r'(true|false)$', n) and 'if' + re.sub(r'(true|false)$', '', n) in s):
                    continue
                own.setdefault(n, p)
    for n, p in STUBS.items():
        own.setdefault(n, p)
    by = {}
    for n, p in own.items():
        by.setdefault(p, []).append(n)
    rows = [f"  ['{p}', '{' '.join(sorted(by[p]))}']," for p in PACKAGES if p in by]
    OUT.write_text('\n'.join([
        '// Generated by scripts/gen-package-commands.py from TeX Live; do not edit by hand.',
        '// [package, the commands and environments it defines (space-separated)], in priority order: a name belongs to the',
        '// first package that defines it. Read by src/domain/texlint.ts (mathNeeds) to load what an export uses.',
        'export const PACKAGE_COMMANDS: [string, string][] = [',
        *rows,
        '];',
        '',
    ]))
    print(f'{OUT.relative_to(ROOT)}: {len(own)} names in {len(by)} packages' + (f'; not loaded: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    main()
