#!/usr/bin/env python3
"""Cut real documents in ext/snippets/raw/ into self-contained snippet documents (work/candidates.jsonl).

  python3 -I scripts/snippets/extract.py [--sources arxiv,datikz,texse,ctan] [-j 8] [--limit N]

Each candidate is one picture, one library block or one formula from a real document, written as a standalone
document whose preamble is the source's packages, TikZ libraries and styles plus only the definitions the snippet
uses (followed transitively). Fonts are normalised to Computer Modern and layout, bibliography and shell-escape
packages are dropped: see README.md for the rules and what each candidate records. Nothing is compiled here.
"""
import argparse
import collections
import gzip
import io
import json
import multiprocessing
import os
import pathlib
import random
import re
import sys
import tarfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import RAW, WORK, control_words, env_end, envs, group_end, normalise, read_jsonl, read_opt, sha, skip_ws, strip_comments  # noqa: E402

# ---------------------------------------------------------------- what counts as a snippet

# environments that are a drawing (outermost occurrence wins) and the library each one is
DRAW_ENVS = {'tikzpicture': None, 'circuitikz': 'circuitikz', 'tikzcd': 'tikz-cd', 'quantikz': 'quantikz',
             'forest': 'forest', 'tikztimingtable': 'tikz-timing', 'bytefield': 'bytefield',
             'karnaugh-map': 'karnaugh-map', 'sequencediagram': 'pgf-umlsd', 'ZX': 'zx-calculus',
             'blochsphere': 'blochsphere', 'ganttchart': 'pgfgantt'}
# library -> the package it needs (added after the source's own packages when missing)
LIB_PKG = {'quantikz': 'quantikz', 'tikz-cd': 'tikz-cd', 'xymatrix': 'xy', 'forest': 'forest', 'circuitikz': 'circuitikz',
           'chemfig': 'chemfig', 'tikz-timing': 'tikz-timing', 'bytefield': 'bytefield', 'karnaugh-map': 'karnaugh-map',
           'pgf-umlcd': 'pgf-umlcd', 'pgf-umlsd': 'pgf-umlsd', 'tikz-feynman': 'tikz-feynman', 'tikz-3dplot': 'tikz-3dplot',
           'zx-calculus': 'zx-calculus', 'blochsphere': 'blochsphere', 'tikz-chemlab': 'tikz-chemlab',
           'pgfplots': 'pgfplots', 'tkz-euclide': 'tkz-euclide', 'automata': 'tikz', 'graphs': 'tikz',
           'pgf-pie': 'pgf-pie', 'smartdiagram': 'smartdiagram', 'tikz-qtree': 'tikz-qtree', 'pgfgantt': 'pgfgantt',
           'tikz-network': 'tikz-network', 'bodegraph': 'bodegraph'}
CHEMLAB = ('TestTube HeatTube RoundFlask HeatFlask Funnel GraduatedCylinder Pipette LargePipette Titration Distillation '
           'SeparatoryFunnel Stand Column BunsenBurner BunsenBurnerGrill FlameGrill Thermometer Condenser Heater '
           'CrystallizingDish InvertedTube TestTubeRack HeaterRoundFlask RoundFlaskReflux').split()
CZ_PARTS = re.compile(r'\bto\s*\[\s*(?:R|C|L|D|V|I|short|open|battery\d?|[sc]?[VI]|vsource|isource|[ac]?sV|[ac]?sI|cV|cI|'
                      r'generic|ammeter|voltmeter|lamp|led|leD|empty led|full led|zD|sD|Do|spst|nos|ncs|switch|cute inductor|'
                      r'american \w+|european \w+|vR|pR|thermistor|fuse|esource|pvsource|crystal|memristor|'
                      r'twoport|tline|antenna|diode|capacitor|resistor|inductor|curved capacitor|ecsource|stroke diode|'
                      r'cute spst|cspst|push button|nopb|ncpb|vC|vL|sR|Z|eC|polar capacitor)\b'
                      r'|\b(?:op amp|nmos|pmos|npn|pnp|nfet|pfet|nigfete|pigfete|ground|rground|sground|tlground|vcc|vee|'
                      r'(?:american |european |ieeestd )?(?:and|or|not|nand|nor|xor|xnor|buffer) port|'
                      r'transformer(?: core)?|gyrator|fd op amp|en amp|inst amp|plain amp|flipflop \w+|dipchip|qfpchip|'
                      r'muxdemux|bare7seg|circulator|oscillator|mixer|adder|amp|bulb|loudspeaker|mic|bjt)\b')
# a TikZ picture whose content is a library's: (library, pattern, package that must be loaded)
PIC_LIBS = [
    ('tikz-chemlab', re.compile(r'\\tkz(?:' + '|'.join(CHEMLAB) + r')\b'), 'tikz-chemlab'),
    ('pgf-umlcd', re.compile(r'\\begin\{(?:class|interface|abstractclass|object)\}|\\(?:inherit|implement|association|aggregation|composition|unidirectionalAssociation)\b'), 'pgf-umlcd'),
    ('tikz-feynman', re.compile(r'\\begin\{feynman\}|\\feynmandiagram\b|\\diagram\*?\s*[\[{]'), 'tikz-feynman'),
    ('pgfplots', re.compile(r'\\begin\{(?:axis|semilogxaxis|semilogyaxis|loglogaxis|polaraxis|groupplot|ternaryaxis|smithchart)\}|\\addplot'), None),
    ('circuitikz', CZ_PARTS, 'circuitikz'),
    ('tikz-3dplot', re.compile(r'\\tdplot\w+|tdplot_(?:main|rotated)_coords'), None),
    ('tkz-euclide', re.compile(r'\\tkz(?:Def|Draw|Label|Mark|Init|Clip|Get|Fill|Interpoint|Pic|Compass|Show|Text|Point|Grid|Axe)\w*'), 'tkz-euclide'),
    ('pgf-pie', re.compile(r'\\pie\s*[\[{]'), 'pgf-pie'),
    ('bodegraph', re.compile(r'\\Bode(?:Amp|Phase|Graph)\w*|\\(?:TfAmp|TfPhase|POAmp|POPhase|SOAmp|SOPhase)\w*'), 'bodegraph'),
    ('tikz-network', re.compile(r'\\(?:Vertex|Vertices|Edge|Edges|Text)\s*[\[{(]'), 'tikz-network'),
    ('tikz-qtree', re.compile(r'\\Tree\s*\['), 'tikz-qtree'),
    ('automata', re.compile(r'\[[^\]]*\bstate\b[^\]]*\]'), 'automata'),  # 'automata' here is the TikZ library
    ('graphs', re.compile(r'\\graph\b'), None),
]
MATH_ENVS = ['equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*', 'multline',
             'multline*', 'flalign', 'flalign*', 'displaymath', 'eqnarray', 'eqnarray*', 'math']
VERBATIM = ['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*',
            'BVerbatim', 'LVerbatim', 'alltt']

# hard drops: what a standalone page can't reproduce (or that only beamer/lualatex/shell escape can)
DROP_PIC = [('remember picture / overlay', re.compile(r'remember picture|\boverlay\b|current page|\\tikzmark')),
            ('needs an image file', re.compile(r'\\includegraphics|\\includesvg|\\pgfimage|\\pgfdeclareimage|\\includestandalone')),
            ('needs a file', re.compile(r'\\(?:input|include|subfile|import|pgfplotstableread|lstinputlisting)\b|'
                                        r'\btable\s*(?:\[[^\]]*\])?\s*\{[\w./-]+\.(?:dat|txt|csv|tsv|data|tab)\}|\bfile\s*=?\s*\{')),
            ('beamer overlays', re.compile(r'\\(?:only|onslide|uncover|visible|invisible|alt|temporal|pause)\b|<\d+-?\d*>|\bvisible on\s*=')),
            ('graph drawing (LuaLaTeX)', re.compile(r'\\usegdlibrary|\blayered layout\b|\bspring layout\b|\btree layout\b|\bspring electrical')),
            ('shell escape', re.compile(r'\braw gnuplot\b|\bgnuplot\b|\\write18|\bshell escape\b|\bplot\s*(?:\[[^\]]*\])?\s*function\b')),
            ('animation', re.compile(r'\\(?:animategraphics|newframe|multiframe)\b|\\begin\{animateinline\}'))]

# ---------------------------------------------------------------- preamble statements

# dropped: what needs shell escape or outside files, draws on the page by itself, changes spacing or the page, or
# re-encodes input (sources are re-encoded to UTF-8). Everything else the source loads is kept.
PKG_DROP = set('''minted pythontex svg shellesc auto-pst-pdf pst-pdf epstopdf tikzexternal pdfpages embedfile attachfile
media9 movie15 animate lineno showframe showkeys showlabels draftwatermark background layout crop pgfpages
beamerarticle setspace inputenc luainputenc fixltx2e hyperxmp pdfcomment ocgx2 tikzscale standalone biblatex
amsaddr geometry fullpage a4wide a4 vmargin anysize typearea layaureo savetrees nopageno pdflscape lscape
'''.split())  # amsaddr: only under amsart; page-geometry packages reset the page standalone crops (a blank result)
FONT_ENCODINGS = {'T1', 'OT1', 'T2A', 'T2B', 'T2C', 'X2', 'LGR', 'T5', 'TS1'}  # what CM/EC fonts provide
# font families are normalised to Computer Modern for parity (recorded per candidate as "fonts_stripped")
PKG_FONTS = set('''times mathptmx mathptm newtxtext newtxmath newtx txfonts pxfonts palatino mathpazo newpxtext newpxmath
libertine libertinus libertinust1math libertinus-otf linuxlibertine fourier kpfonts charter helvet avant bookman
newcent courier cmbright sansmath eulervm euler mlmodern stix stix2 tgtermes tgpagella tgheros tgschola tgbonum
lucidabr lucimatx mathdesign utopia fouriernc gfsartemisia gfsneohellenic baskervald baskervillef ebgaramond garamondx
cochineal crimson crimsonpro sourcesanspro sourceserifpro sourcecodepro inconsolata beramono berasans beraserif
dejavu opensans roboto lato merriweather noto notomath fontawesome fontawesome5 mathastext arev concmath ccfonts
iwona kurier antpolt anttor arev cfr-lm fbb mathtime mtpro2 minion minionpro mnsymbol? sfmath
cantarell tgadventor tgcursor qtxmath qpxmath newtxsf mathabx? fdsymbol? libertinus-type1 xcharter xcharter-otf
erewhon heuristica domitian lmodern'''.replace('?', '').split())
XELATEX_PKGS = {'fontspec', 'unicode-math', 'polyglossia', 'xeCJK', 'xltxtra', 'xunicode', 'xgreek', 'bidi', 'xepersian', 'fontsetup'}
LUALATEX_PKGS = {'luacode', 'luatexbase', 'luamplib', 'luatexja', 'luatexja-fontspec', 'lua-visual-debug', 'luaotfload', 'pyluatex', 'lualatex-math'}
FONT_CMDS = re.compile(r'\\(?:setmainfont|setsansfont|setmonofont|setmathfont|defaultfontfeatures|setCJK\w*font|setmathrm|'
                       r'setboldmathrm|newfontfamily|newfontface|setotherlanguage|setmainlanguage|setdefaultlanguage)\b')

KINDS = {}
for k, names in {
    'pkg': 'usepackage RequirePackage',
    'lib': 'usetikzlibrary usepgfplotslibrary usepgflibrary',
    'style': '''tikzset pgfplotsset tikzcdset forestset ctikzset setchemfig sisetup pgfkeys tikzstyle pgfdeclarelayer
        pgfsetlayers pgfplotscreateplotcyclelist pgfdeclarepatternformonly pgfdeclarepatterninherentlycolored
        pgfdeclareshape pgfdeclaredecoration pgfdeclarearrow pgfarrowsdeclare pgfdeclareplotmark tdplotsetmaincoords
        bytefieldsetup quantikzset zxset setatomsep setbondoffset setdoublesep setangleincrement setcrambond
        setnodestyle setbondstyle setcompoundsep setarrowoffset setlewis setlewisdist setstacksep chemsetup
        tikztimingdef tikzsetnextfilename pgfmathdeclarefunction pgfplotsdeclarelayers forestStandardNode
        tikzdeclarecoordinatesystem newcolumntype DeclareSymbolFont SetSymbolFont DeclareSymbolFontAlphabet
        DeclareFontFamily DeclareFontShape DeclareFontSubstitution DeclareUnicodeCharacter SetMathAlphabet''',
    'def': '''newcommand renewcommand providecommand DeclareRobustCommand DeclareMathOperator DeclarePairedDelimiter
        DeclarePairedDelimiterX DeclarePairedDelimiterXPP NewDocumentCommand RenewDocumentCommand ProvideDocumentCommand
        DeclareDocumentCommand NewExpandableDocumentCommand newrobustcmd renewrobustcmd DeclareMathAlphabet
        DeclareMathSymbol DeclareMathDelimiter DeclareMathAccent DeclareMathRadical pgfmathsetmacro pgfmathtruncatemacro
        pgfmathsetlengthmacro newlength setlength addtolength settowidth newsavebox sbox savebox def gdef edef xdef let
        newif DeclareSIUnit newenvironment renewenvironment NewDocumentEnvironment RenewDocumentEnvironment
        definesubmol redefinesubmol newcounter''',
    'color': 'definecolor colorlet providecolor definecolorset definecolors',
    'drop': 'tikzexternalize tikzsetexternalprefix tikzexternaldisable tikzexternalenable usegdlibrary',
    'expl': 'ExplSyntaxOn',
}.items():
    for name in names.split():
        KINDS[name] = k
NEEDS_BODY = set('''newcommand renewcommand providecommand DeclareRobustCommand DeclareMathOperator NewDocumentCommand
    RenewDocumentCommand ProvideDocumentCommand DeclareDocumentCommand NewExpandableDocumentCommand newrobustcmd
    renewrobustcmd newenvironment renewenvironment NewDocumentEnvironment RenewDocumentEnvironment pgfmathsetmacro'''.split())
KEYVAL = set('''tikzset pgfplotsset pgfkeys tikzstyle tikzcdset forestset ctikzset setchemfig sisetup bytefieldsetup
    quantikzset zxset chemsetup'''.split())
STMT_RE = re.compile(r'\\(' + '|'.join(sorted(KINDS, key=len, reverse=True)) + r')(?![A-Za-z@])')
CS_TOKEN = re.compile(r'\\(?:[A-Za-z@]+|.)')
TL_STY = set()  # every package TeX Live has (from ls-R); filled in main() and each worker
TL_LIBS = set()  # every TikZ / PGF / pgfplots library: ('usetikzlibrary', name), …


def load_tl_index():
    import subprocess
    dist = subprocess.run(['kpsewhich', '-var-value=TEXMFDIST'], capture_output=True, text=True, check=True).stdout.strip()
    names, on_path = set(), False
    with open(os.path.join(dist, 'ls-R'), encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.endswith(':\n'):  # a directory; only tex/ is on TeX's search path (doc/ holds manuals' own .sty)
                on_path = line.startswith('./tex/')
            elif on_path and line.endswith('.sty\n'):
                names.add(line[:-5])
            elif on_path:
                m = re.match(r'(tikz|pgf|pgfplots)library(.+)\.code\.tex$', line.strip())
                if m:
                    names.add(({'tikz': 'usetikzlibrary', 'pgf': 'usepgflibrary', 'pgfplots': 'usepgfplotslibrary'}[m[1]], m[2]))
    return names


def init_worker(names):
    TL_STY.update(n for n in names if isinstance(n, str))
    TL_LIBS.update(n for n in names if isinstance(n, tuple))


def args_after(text, j, max_args=8):
    """Greedily read the [..], {..} and * that follow (not across a blank line): the index after them."""
    n = len(text)
    for _ in range(max_args + 4):
        k = j
        while k < n and text[k] in ' \t':
            k += 1
        if k < n and text[k] == '\n':
            k += 1
            while k < n and text[k] in ' \t':
                k += 1
        if k >= n:
            return j
        c = text[k]
        if c == '{':
            e = group_end(text, k)
            if e < 0:
                return j
            j = e
        elif c == '[':
            _, e = read_opt(text, k)
            if e == k:
                return j
            j = e
        elif c == '*' and k == j:
            j = k + 1
        elif c in '+=' and re.match(r'\+?=\s*\[', text[k:k + 40]):  # \tikzstyle{x} = [..] / +=[..]
            j = text.index('[', k)
        else:
            return j
    return j


def cs_name(tok):
    return tok[1:] if tok and tok.startswith('\\') else tok


class Stmt:
    __slots__ = ('kind', 'cmd', 'names', 'text', 'start', 'end', 'deps', 'arg', 'scope_end')

    def __repr__(self):
        return f'<{self.kind} {self.cmd} {self.names}>'


def scan(text, offset=0):
    """Preamble-like statements in text: packages, libraries, styles, definitions, colours."""
    out, i = [], 0
    while True:
        m = STMT_RE.search(text, i)
        if not m:
            return out
        cmd, j = m[1], m.end()
        st = Stmt()
        st.kind, st.cmd, st.names, st.arg, st.start = KINDS[cmd], cmd, [], None, m.start()
        try:
            if cmd in ('def', 'gdef', 'edef', 'xdef'):
                t = CS_TOKEN.match(text, skip_ws(text, j))
                if not t:
                    i = j; continue
                st.names = [cs_name(t[0])]
                b = text.find('{', t.end())
                if b < 0 or b - t.end() > 120 or '\n\n' in text[t.end():b]:
                    i = j; continue
                j = group_end(text, b)
            elif cmd == 'let':
                t = CS_TOKEN.match(text, skip_ws(text, j))
                if not t:
                    i = j; continue
                st.names = [cs_name(t[0])]
                k = skip_ws(text, t.end())
                if k < len(text) and text[k] == '=':
                    k = skip_ws(text, k + 1)
                u = CS_TOKEN.match(text, k)
                j = u.end() if u else k + 1
            elif cmd == 'ExplSyntaxOn':  # an expl3 block: kept whole (its names aren't TeX control words)
                e = text.find('\\ExplSyntaxOff', j)
                if e < 0:
                    i = j; continue
                j = e + len('\\ExplSyntaxOff')
            elif cmd == 'newif':
                t = re.compile(r'\\if([A-Za-z@]+)').match(text, skip_ws(text, j))
                if not t:
                    i = j; continue
                st.names = ['if' + t[1], t[1] + 'true', t[1] + 'false']
                j = t.end()
            else:
                if st.kind in ('def', 'color') or cmd in ('tikzstyle', 'pgfdeclarelayer'):
                    k = skip_ws(text, j)
                    if k < len(text) and text[k] == '*':
                        k = skip_ws(text, k + 1)
                    if k < len(text) and text[k] == '[' and cmd in ('DeclareSIUnit', 'definecolorset'):
                        _, k = read_opt(text, k)
                        k = skip_ws(text, k)
                    if k < len(text) and text[k] == '{':
                        e = group_end(text, k)
                        first = text[k + 1:e - 1].strip() if e > 0 else ''
                    else:
                        t = CS_TOKEN.match(text, k)
                        first, e = (t[0], t.end()) if t else ('', -1)
                    if e < 0:
                        i = j; continue
                    st.arg = first
                    if st.kind == 'def':
                        if 'environment' in cmd.lower():
                            st.names = ['env:' + first]
                        elif cmd in ('definesubmol', 'redefinesubmol', 'newcounter'):
                            st.names = ['arg:' + first]
                        else:
                            st.names = [cs_name(first)] if first.startswith('\\') else []
                    elif st.kind == 'color':
                        st.names = [first]
                    j = e
                j = args_after(text, j)
        except (IndexError, ValueError):
            i = j; continue
        if j is None or j <= m.end() - 1:
            i = m.end(); continue
        st.end = j
        st.text = text[st.start:j]
        if st.text.strip() == '\\' + cmd:  # a mention (\verb|\tikzset|, prose), not a statement
            i = j; continue
        st.scope_end = float('inf')
        # a definition must have its body; a setting whose first argument is #n sits inside some macro's body
        if st.kind == 'def' and cmd in NEEDS_BODY and '{' not in text[st.start + len(cmd) + 1 + len(st.arg or ''):j]:
            i = j; continue
        if st.kind == 'style' and re.match(r'\\\w+\s*\{\s*#', st.text):
            i = j; continue
        if cmd.startswith(('DeclareSymbolFont', 'SetSymbolFont', 'DeclareFont', 'SetMathAlphabet', 'DeclareMathAlphabet')):
            encs = set(re.findall(r'\{\s*([A-Z][A-Z0-9]{1,3})\s*\}', st.text))
            if encs - FONT_ENCODINGS - {'OML', 'OMS', 'OMX', 'U'}:  # LS1 (STIX), etc.: its font family was stripped
                i = j; continue
        st.start += offset; st.end += offset
        st.deps = control_words(st.text) - set(st.names) - {cmd}
        out.append(st)
        i = j


SCOPE_TOK = re.compile(r'\\begin\s*\{[^{}]*\}|\\end\s*\{[^{}]*\}|\\[A-Za-z@]+|\\.|[{}]')


def set_scopes(text, stmts):
    """Each statement's scope_end: where the group or environment it sits in closes (TeX keeps settings local)."""
    todo = sorted(stmts, key=lambda s: s.start)
    stack, k = [[]], 0
    for m in SCOPE_TOK.finditer(text):
        while k < len(todo) and todo[k].start < m.start():
            stack[-1].append(todo[k]); k += 1
        t = m[0]
        if t == '{' or t.startswith('\\begin'):
            stack.append([])
        elif (t == '}' or t.startswith('\\end')) and len(stack) > 1:
            for st in stack.pop():
                st.scope_end = m.start()


# ---------------------------------------------------------------- reading the sources

SYNTHETIC_ORIGINS = {'gpt4', 'chatgpt'}
TEXT_EXT = {'.tex', '.sty', '.cls', '.def', '.cfg', '.tikz', '.pgf', '.ltx', '.inc', '.clo', '.txt', '.dat', '.csv', '.bbx',
            '.tikzstyles', '.tikzdefs', '.tikzit', '.tikzstyle', '.macros', '.defs'}


def decode(b):
    try:
        return b.decode('utf-8')
    except UnicodeDecodeError:
        return b.decode('latin-1')


def capped_gunzip(data, cap=64 << 20):
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    out = d.decompress(data, cap)
    if d.unconsumed_tail:
        raise ValueError('decompressed size over cap')
    return out


def arxiv_files(path):
    """{relative path: text} of an e-print, read in memory (no member is written to disk)."""
    data = path.read_bytes()
    files, total = {}, 0
    try:
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:*') as tar:
            for m in tar:
                if not m.isfile() or m.size > 3 << 20:
                    continue
                # a member name that isn't UTF-8 comes back with surrogate escapes: make it plain text
                name = os.path.normpath(m.name.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace')).lstrip('./')
                if name.startswith('..') or os.path.isabs(name) or os.path.splitext(name)[1].lower() not in TEXT_EXT:
                    continue
                total += m.size
                if total > 40 << 20:
                    break
                files[name] = decode(tar.extractfile(m).read())
        return files
    except (tarfile.TarError, EOFError, OSError, zlib.error):
        pass
    try:
        raw = capped_gunzip(data) if data[:2] == b'\x1f\x8b' else data
    except (ValueError, zlib.error, EOFError):
        return {}
    if raw[:5] == b'%PDF-':
        return {}
    return {'main.tex': decode(raw)}


INPUT_RE = re.compile(r'\\(?:(input|include|subfile|includestandalone)(?![A-Za-z@])\s*(?:\[[^\]]*\])?\s*(?:\{([^{}]*)\}|([^\s{}\\%]+))'
                      r'|(?:sub)?import\*?\s*\{([^{}]*)\}\s*\{([^{}]*)\})')


def resolve(files, base, name):
    name = name.strip().strip('"')
    for cand in (os.path.normpath(os.path.join(base, name)), os.path.normpath(name)):
        for ext in ('', '.tex', '.tikz', '.pgf'):
            if cand + ext in files:
                return cand + ext
    return None


def inline(files, path, depth=0, seen=None):
    """A file's text with \\input/\\include of files in the archive inlined (comments stripped first)."""
    seen = seen or set()
    text = strip_comments(files[path].replace('\r\n', '\n').replace('\r', '\n'))
    m = re.search(r'\\endinput\b', text)
    if m:
        text = text[:m.start()]
    if depth > 8:
        return text
    base = os.path.dirname(path)

    def sub(m):
        name = os.path.join(m[4], m[5]) if m[5] is not None else (m[2] if m[2] is not None else m[3])
        target = resolve(files, base, name or '')
        if not target or target in seen or target.endswith(('.sty', '.cls')):
            return m[0]
        body = inline(files, target, depth + 1, seen | {target})
        if '\\documentclass' in body and '\\begin{document}' in body:  # a standalone figure: its body only
            b = body.index('\\begin{document}') + len('\\begin{document}')
            e = body.find('\\end{document}', b)
            body = body[b:e if e > 0 else None]
        return '\n' + body + '\n'
    return INPUT_RE.sub(sub, text)


def split_doc(text):
    """(class line, preamble, body). A fragment without \\begin{document} is all body."""
    b = text.find('\\begin{document}')
    if b < 0:
        return None, '', text
    e = text.find('\\end{document}', b)
    pre = text[:b]
    m = re.search(r'\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}', pre)
    cls = {'class': m[2].strip(), 'options': (m[1] or '').strip()} if m else None
    return cls, pre, text[b + len('\\begin{document}'):e if e > 0 else None]


def documents(source, limit=None):
    """Yield (doc meta, files) for every document of a source."""
    n = 0
    if source == 'arxiv':
        fetched = {r['id']: r for r in read_jsonl(RAW / 'arxiv' / 'fetched.jsonl') if r.get('file')}
        listed = {r['id']: r for r in read_jsonl(RAW / 'arxiv' / 'list.jsonl')}
        for pid, r in sorted(fetched.items()):
            yield {'source': 'arxiv', 'paper': pid, 'file': r['file'], 'cat': listed.get(pid, {}).get('cat'),
                   'why': listed.get(pid, {}).get('why'), 'uri': f'https://arxiv.org/abs/{pid}'}, None
            n += 1
            if limit and n >= limit:
                return
    elif source == 'datikz':
        for r in read_jsonl(RAW / 'datikz' / 'train.jsonl'):
            # real documents only: augmented rows and the LLM-generated origins (gpt4, chatgpt) are left out
            if r.get('augmented') in (True, 'True') or r.get('origin') in SYNTHETIC_ORIGINS:
                continue
            yield {'source': 'datikz', 'row': r['row_idx'], 'uri': r.get('uri'), 'origin': r.get('origin'),
                   'date': r.get('date')}, {'main.tex': r['code']}
            n += 1
            if limit and n >= limit:
                return
    elif source == 'texse':
        for r in read_jsonl(RAW / 'texse' / 'posts.jsonl'):
            for k, code in enumerate(r['code']):
                yield {'source': 'texse', 'post': r['post'], 'block': k, 'uri': r['uri'], 'score': r['score'],
                       'tags': r['tags'], 'date': r['date']}, {'main.tex': code}
            n += 1
            if limit and n >= limit:
                return
    elif source == 'ctan':
        for r in read_jsonl(RAW / 'ctan' / 'files.jsonl'):
            p = RAW / 'ctan' / r['file']
            text = decode(p.read_bytes())
            if p.suffix == '.dtx':
                text = dtx_doc(text)
            yield {'source': 'ctan', 'pkg': r['pkg'], 'file': r['file'], 'from': r['from']}, {'main.tex': text}
            n += 1
            if limit and n >= limit:
                return


def dtx_doc(text):
    """The documentation part of a .dtx: comment-prefixed lines unwrapped, implementation (macrocode) dropped."""
    out, code, driver = [], False, False
    for line in text.splitlines():
        if line.startswith('%<*driver>'):
            driver = True; continue
        if line.startswith('%</driver>'):
            driver = False; continue
        if driver:
            continue
        if re.match(r'%\s*\\begin\{macrocode\*?\}', line):
            code = True; continue
        if re.match(r'%\s*\\end\{macrocode\*?\}', line):
            code = False; continue
        if code or line.startswith('%<'):
            continue
        out.append(re.sub(r'^% ?', '', line) if line.startswith('%') else line)
    return '\n'.join(out)


# ---------------------------------------------------------------- one document -> snippets

def blank(text, spans):
    """text with each span replaced by spaces (same length, newlines kept)."""
    if not spans:
        return text
    chars = list(text)
    for a, b in spans:
        for k in range(a, b):
            if chars[k] != '\n':
                chars[k] = ' '
    return ''.join(chars)


def cmd_snippets(body):
    """Library blocks written as commands: \\xymatrix, \\chemfig, chemfig schemes, \\feynmandiagram."""
    out = []
    for m in re.finditer(r'\\schemestart\b', body):
        e = body.find('\\schemestop', m.end())
        if e > 0:
            out.append(('chemfig', m.start(), e + len('\\schemestop')))
    taken = lambda p: any(a <= p < b for _, a, b in out)  # noqa: E731
    for m in re.finditer(r'\\xymatrix\b', body):
        k = m.end()
        while k < len(body) and body[k] != '{' and k - m.end() < 60 and body[k] != '\n':
            k += 1
        if k < len(body) and body[k] == '{':
            e = group_end(body, k)
            if e > 0:
                out.append(('xymatrix', m.start(), e))
    for m in re.finditer(r'\\chemfig\b\*?', body):
        if taken(m.start()):
            continue
        _, k = read_opt(body, m.end())
        k = skip_ws(body, k)
        if k < len(body) and body[k] == '{':
            e = group_end(body, k)
            if e > 0:
                out.append(('chemfig', m.start(), e))
    for m in re.finditer(r'\\smartdiagram(?:add)?\b', body):
        k = m.end()
        _, k = read_opt(body, k)
        k = skip_ws(body, k)
        if k < len(body) and body[k] == '{':
            e = group_end(body, k)
            if e > 0:
                out.append(('smartdiagram', m.start(), e))
    for m in re.finditer(r'\\feynmandiagram\b', body):
        e = body.find(';', m.end())
        if 0 < e - m.start() < 20000:
            out.append(('tikz-feynman', m.start(), e + 1))
    return out


def classify_pic(code, pkgs, libs):
    for lib, pat, need in PIC_LIBS:
        if pat.search(code):
            # the library's own package (or TikZ library, for automata) must be loaded: \umlclass is tikz-uml's
            if lib == 'automata':
                if 'automata' not in libs:
                    continue
            elif need and need not in pkgs:
                continue
            return lib
    return None


# math: delimiters scanned left to right over the body with drawings and verbatim blanked out
def math_snippets(body):
    out, i, n = [], 0, len(body)
    env_pat = re.compile(r'\\begin\{(' + '|'.join(re.escape(e) for e in MATH_ENVS) + r')\}')
    while i < n:
        c = body[i]
        if c == '\\':
            nxt = body[i + 1:i + 2]
            if nxt in ('[', '('):
                close = '\\]' if nxt == '[' else '\\)'
                e = body.find(close, i + 2)
                if e > 0 and '\n\n' not in body[i:e]:
                    out.append(('display' if nxt == '[' else 'inline', body[i + 2:e], i, e + 2))
                    i = e + 2; continue
            m = env_pat.match(body, i)
            if m:
                e = env_end(body, m[1], m.end())
                if e > 0:
                    inner = body[m.end():e - len(f'\\end{{{m[1]}}}')]
                    out.append((m[1], inner, i, e))
                    i = e; continue
            i += 2; continue
        if c == '$':
            if body[i + 1:i + 2] == '$':
                e = body.find('$$', i + 2)
                if e > 0 and '\n\n' not in body[i:e]:
                    out.append(('display', body[i + 2:e], i, e + 2))
                    i = e + 2; continue
                i += 2; continue
            k = i + 1
            while k < n:
                if body[k] == '\\':
                    k += 2; continue
                if body[k] == '$' or body[k:k + 2] == '\n\n':
                    break
                k += 1
            if k < n and body[k] == '$':
                out.append(('inline', body[i + 1:k], i, k + 1))
                i = k + 1; continue
            i = k; continue
        i += 1
    return out


MATH_SKIP = re.compile(r'\\(?:intertext|shortintertext|ref|eqref|cref|Cref|autoref|cite\w*|pageref|label|includegraphics|'
                       r'input|footnote|marginpar|hyperref|href|url|caption|item|section|xymatrix|chemfig|tikz|tikzmark|'
                       r'tikzmarknode|tikznode|subnode|pnode|rnode|ncline|only|onslide|pause|uncover|visible)(?![A-Za-z@])|#'
                       r'|\\begin\{(?:figure|table|tabular|itemize|enumerate|' + '|'.join(DRAW_ENVS) + r')\}')


def normalise_math(kind, inner):
    """(formula as a label would hold it, display?) or None when it can't stand alone."""
    f = re.sub(r'\\(?:nonumber|notag)\b', '', inner)
    f = re.sub(r'\\tag\*?\s*\{[^{}]*\}', '', f)
    f = re.sub(r'\\label\s*\{[^{}]*\}', '', f)
    f = re.sub(r'\\begin\{split\}', r'\\begin{aligned}', f).replace('\\end{split}', '\\end{aligned}')
    f = f.strip()
    if not f or MATH_SKIP.search(f):
        return None
    base = kind.rstrip('*')
    if base == 'eqnarray':
        return None
    if base == 'inline' or base == 'math':
        if '\\\\' in f and not re.search(r'\\begin\{', f):
            return None
        return f, False
    wrap = {'align': 'aligned', 'flalign': 'aligned', 'gather': 'gathered', 'multline': 'multlined'}.get(base)
    if base == 'alignat':
        m = re.match(r'\s*\{(\d+)\}', f)
        if not m:
            return None
        return f'\\begin{{alignedat}}{{{m[1]}}}{f[m.end():]}\\end{{alignedat}}', True
    if wrap:
        return f'\\begin{{{wrap}}}{f}\\end{{{wrap}}}', True
    # equation, displaymath, \[..\], $$..$$: a bare \\ outside an environment can't be set
    depth, k = 0, 0
    for m in re.finditer(r'\\begin\{|\\end\{|\\\\', f):
        if m[0] == '\\begin{':
            depth += 1
        elif m[0] == '\\end{':
            depth -= 1
        elif depth == 0:
            return None
    return f, True


MATH_TAGS = [(t, re.compile(p)) for t, p in [
    ('frac', r'\\[dtc]?frac\b|\\over\b|\\[dt]?binom\b'), ('sqrt', r'\\sqrt\b'),
    ('big-operators', r'\\(?:sum|prod|coprod|int|iint|iiint|oint|bigcup|bigcap|bigoplus|bigotimes|bigvee|bigwedge|bigsqcup)\b'),
    ('limits', r'\\(?:lim|limsup|liminf|max|min|sup|inf|det|Pr|argmax|argmin)\b|\\limits\b'),
    ('matrix', r'\\begin\{(?:[pbBvV]|small)?matrix\*?\}|\\begin\{array\}'), ('cases', r'\\begin\{[dr]?cases\*?\}'),
    ('multiline', r'\\begin\{(?:aligned|gathered|alignedat|multlined)\}'),
    ('delimiters', r'\\(?:left|right|middle|bigl?|bigr|Bigl?|Bigr|biggl?|biggr|Biggl?|Biggr)\b|\\[lr](?:vert|Vert|angle|ceil|floor)\b'),
    ('accents', r'\\(?:hat|widehat|bar|overline|tilde|widetilde|vec|dot|ddot|dddot|check|breve|acute|grave|mathring|underline|overrightarrow|overleftarrow)\b'),
    ('braces-stacks', r'\\(?:overbrace|underbrace|overset|underset|stackrel|substack|xrightarrow|xleftarrow|xmapsto|xlongrightarrow)\b'),
    ('alphabets', r'\\(?:mathbb|mathcal|mathfrak|mathscr|mathsf|mathtt|mathbf|mathit|boldsymbol|bm|pmb|mathbbm|mathds)\b'),
    ('greek', r'\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega)\b'),
    ('relations-arrows', r'\\(?:leq?|geq?|neq|approx|equiv|sim|simeq|cong|propto|subset|subseteq|supset|in|notin|to|mapsto|rightarrow|Rightarrow|Leftrightarrow|longrightarrow|hookrightarrow|twoheadrightarrow|implies|iff|leftarrow|uparrow|downarrow)\b'),
    ('ams-symbols', r'\\(?:varnothing|lesssim|gtrsim|leqslant|geqslant|nmid|blacksquare|square|lozenge|circledast|boxtimes|boxplus|rightleftharpoons|curvearrowright|lll|ggg|vartriangle|triangleq|eqqcolon|coloneqq|nsubseteq|subsetneq|therefore|because|measuredangle|complement|nexists|Box|Diamond|rtimes|ltimes|leftrightarrows|rightrightarrows)\b'),
    ('text', r'\\(?:text|textrm|textbf|textit|textsf|texttt|mbox|hbox)\b'),
    ('operators', r'\\operatorname\*?\b|\\(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|arcsin|arccos|arctan|log|ln|exp|arg|deg|dim|ker|hom|gcd|lg)\b'),
    ('spacing', r'\\(?:quad|qquad|hspace|enspace|thinspace|medspace|thickspace|negthinspace|phantom|hphantom|vphantom)\b|\\[,;:!]'),
    ('dots', r'\\(?:ldots|cdots|vdots|ddots|dots[cbmio]?)\b'), ('boxed', r'\\(?:boxed|fbox|framebox)\b'),
    ('colour', r'\\(?:color|textcolor|colorbox|fcolorbox)\b'), ('arrays-rules', r'\\(?:hline|cline|hdashline|vline)\b|\{[^{}]*\|[^{}]*\}'),
    ('physics-pkg', r'\\(?:dv|pdv|ket|bra|braket|expval|ev|abs|norm|qty|mel|comm|acomm|order|grad|curl|divergence|laplacian|Tr|tr|Bra|Ket|Braket|dd|vb|va|vu)\b'),
    ('siunitx', r'\\(?:SI|si|qty|unit|num|ang|SIrange|qtyrange|numrange|SIlist|qtylist)\b'),
    ('mhchem', r'\\(?:ce|pu)\b'), ('cancel', r'\\(?:cancel|bcancel|xcancel|cancelto)\b'),
    ('tensor-indices', r'\\(?:tensor|indices|prescript|sideset)\b|\{\}\^|\{\}_'),
    ('extensible', r'\\(?:overleftrightarrow|underleftarrow|underrightarrow|xleftrightarrow|xRightarrow|xLeftarrow|xhookrightarrow)\b'),
]]
PIC_TAGS = [(t, re.compile(p)) for t, p in [
    ('loops', r'\\foreach\b'), ('pics', r'\bpic\s*[\[{]|pics/'), ('styles', r'/\.style'),
    ('style-arguments', r'/\.style\s*(?:args|\d|n args)|#\d'), ('curves', r'\.\.\s*controls\b|\bin\s*=|\bout\s*=|bend (?:left|right)'),
    ('arcs', r'\barc\s*[\[(]'), ('relative-coordinates', r'\+\+?\('), ('polar-coordinates', r'\(\s*-?[\d.]+\s*:\s*-?[\d.]+'),
    ('calc', r'\$\([^$]*\)\$|\|-|-\|'), ('positioning', r'\b(?:above|below|left|right)\s*=\s*(?:[^,\]\n]*\s)?of\b'),
    ('anchors', r'\.(?:north|south|east|west|center|base)\b'), ('fit', r'\bfit\s*='),
    ('gradients', r'\b(?:left|right|top|bottom|middle|inner|outer|ball) color\s*=|\bshading\s*='),
    ('patterns', r'\bpattern\s*='), ('transparency', r'opacity\s*='), ('plots', r'\bplot\s*[\[(]|\\addplot'),
    ('matrix', r'\\matrix\b|\bmatrix of\b'), ('trees', r'\bchild\s*(?:\[|\{)'), ('clipping', r'\\clip\b|\bclip\s*='),
    ('decorations', r'\bdecorat(?:e|ion)\b|\bsnake\b|\bzigzag\b|\bbrace\b'), ('graphs', r'\\graph\b'),
    ('procedural-pgf', r'\\(?:pgfextra|pgfkeys|pgfmathparse|pgfmathsetmacro|pgfmathtruncatemacro|pgfpathmoveto|pgfusepath|ifnum|ifdim)\b'),
    ('math-labels', r'\\node[^;]*\$'), ('text-styling', r'\\(?:textbf|textit|scriptsize|footnotesize|small|large|Large|tiny)\b|\bfont\s*='),
    ('shapes', r'\b(?:circle|ellipse|diamond|regular polygon|star|trapezium|cylinder|rounded rectangle|signal|single arrow|double arrow|cloud|rectangle split|circle split)\b'),
    ('arrows', r'-\s*>|<\s*-|arrows\.meta|\b(?:Stealth|Latex|Triangle|Straight Barb|>=)'), ('dashes', r'\bdash(?:ed|dotted|\s+pattern)|\bdotted\b'),
    ('fills', r'\\fill\b|\\filldraw\b|\bfill\s*='), ('scopes', r'\\begin\{scope\}'), ('layers', r'\\begin\{pgfonlayer\}'),
    ('transforms', r'\b(?:rotate|xshift|yshift|scale|xscale|yscale|shift|xslant|yslant)\s*='), ('3d-coordinates', r'\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)'),
    ('edges', r'\bedge\b|\bto\s*\['), ('labels-pins', r'\blabel\s*=|\bpin\s*='), ('grids', r'\bgrid\b'),
    ('user-macros', r'\\newcommand|\\def\b'),
    ('geometry-2d', r'\bpic\s*\[[^\]]*\]\s*\{\s*(?:right )?angle\s*=|\bangles\b|\|-\s*\(|\bintersection\b|name path|\btkz'),
    ('flowchart', r'\b(?:diamond|rounded corners|trapezium|start chain|on chain|join)\b'),
    ('plot-3d', r'\\addplot3|\bsurf\b|\bmesh\b|view\s*='), ('plot-bars', r'\b[xy]bar\b|ybar stacked|xbar stacked'),
    ('plot-contour', r'contour'), ('plot-scatter', r'\bscatter\b|only marks'), ('plot-groups', r'groupplot'),
    ('plot-polar-log', r'polaraxis|semilog|loglogaxis'), ('plot-fill-between', r'fill between'),
    ('plot-functions', r'\\addplot\s*(?:\[[^\]]*\])?\s*\{|domain\s*='), ('plot-data', r'\bcoordinates\s*\{|\btable\s*[\[{]'),
    ('3d-solids', r'\b(?:canvas is \w+ plane|3d view|perspective|tdplot|isometric)'),
]]


def assemble(snippet, cls, lib, stmts_pre, stmts_body, at, pre_files, doc, extra):
    """The standalone document for one snippet, and what was needed to make it."""
    info = {'added': [], 'fonts_stripped': [], 'dropped_pkgs': [], 'missing_pkgs': [], 'defs': 0, 'engine': 'pdflatex'}
    stmts = stmts_pre + [s for s in stmts_body if s.end <= at <= s.scope_end]
    pkgs, seen = [], set()
    all_pkgs = {x.strip() for s in stmts if s.kind == 'pkg' for g in re.findall(r'\{([^{}]*)\}', s.text) for x in g.split(',')}
    # \ifxetex fontspec \else fontenc \fi read flat: both appear, and pdfLaTeX is the branch to keep
    conditional_fonts = bool(all_pkgs & XELATEX_PKGS) and bool(all_pkgs & {'fontenc', 'inputenc'})
    for s in stmts:
        if s.kind != 'pkg':
            continue
        opt, _ = read_opt(s.text, len('\\' + s.cmd))
        names = re.search(r'\{([^{}]*)\}', s.text)
        for p in [x.strip() for x in (names[1] if names else '').split(',') if x.strip()]:
            if p in LUALATEX_PKGS:
                return None, 'needs LuaLaTeX (' + p + ')'
            if p in XELATEX_PKGS:
                if conditional_fonts:
                    info['dropped_pkgs'].append(p); continue
                info['engine'] = 'xelatex'
            if p in PKG_FONTS:
                info['fonts_stripped'].append(p); continue
            if p in PKG_DROP or p in pre_files or p in seen:
                if p not in seen:
                    info['dropped_pkgs'].append(p)
                continue
            if TL_STY and p not in TL_STY:
                info['missing_pkgs'].append(p); continue
            if p == 'fontenc':  # an encoding of a stripped font family (LS1 is STIX's) has no CM fonts behind it
                encs = [e.strip() for e in (opt or '').split(',') if e.strip() in FONT_ENCODINGS]
                if not encs:
                    info['dropped_pkgs'].append('fontenc'); continue
                opt = ','.join(encs)
            seen.add(p)
            pkgs.append((p, opt))
    # the snippet's library and the maths every label may use
    needs = []
    if cls != 'math':
        needs.append('tikz')
    if lib and LIB_PKG.get(lib) and LIB_PKG[lib] != 'tikz':
        # quantikz used to be a TikZ library only; loading the package too defines its macros twice
        old_quantikz = lib == 'quantikz' and any(s.kind == 'lib' and re.search(r'\bquantikz', s.text) for s in stmts)
        if not old_quantikz:
            needs.append(LIB_PKG[lib])
    if info['engine'] == 'pdflatex' and not seen & {'mnsymbol', 'MnSymbol', 'mathabx', 'fdsymbol', 'stix', 'stix2'}:
        needs += ['amsmath', 'amssymb']
    elif 'unicode-math' not in seen:
        needs += ['amsmath']
    if cls == 'math':
        needs.append('mathtools')
    if lib == 'xymatrix':
        pkgs = [(p, 'all' if p == 'xy' and not o else o) for p, o in pkgs]
    # options go ahead of everything, so packages added (or loaded by others) first never clash with them
    lines = [f'\\PassOptionsToPackage{{{o}}}{{{p}}}' for p, o in pkgs if o and p != 'xy']
    if 'tikz' in needs and 'tikz' not in seen:  # some libraries (tikz-3dplot) need TikZ loaded before them
        lines.append('\\usepackage{tikz}'); info['added'].append('tikz'); seen.add('tikz')
    lines += [f'\\usepackage{o and "[" + o + "]" or ""}{{{p}}}' for p, o in pkgs]
    for p in needs:
        if p not in seen:
            lines.append(f'\\usepackage{"[all]" if p == "xy" else ""}{{{p}}}')
            info['added'].append(p)
            seen.add(p)
    tikzish = cls != 'math'
    libs = []
    if tikzish:
        for s in stmts:
            if s.kind == 'lib':
                body = re.search(r'\{([^{}]*)\}', s.text)
                ls = [x.strip() for x in (body[1] if body else '').split(',') if x.strip() and x.strip() != 'external']
                if 'graphdrawing' in ls:
                    return None, 'graph drawing (LuaLaTeX)'
                # \usetikzlibrary also finds PGF libraries; pgfplots' live in tikzlibrarypgfplots.<name>.code.tex
                gone = [x for x in ls if TL_LIBS and not {('usetikzlibrary', x), ('usepgflibrary', x),
                                                          ('usetikzlibrary', 'pgfplots.' + x)} & TL_LIBS]
                info.setdefault('missing_libs', []).extend(gone)
                ls = [x for x in ls if x not in gone and (s.cmd, x) not in seen]
                seen.update((s.cmd, x) for x in ls)
                if ls:
                    libs.append(f'\\{s.cmd}{{{",".join(ls)}}}')
        if lib == 'automata' and not any('automata' in l for l in libs):
            libs.append('\\usetikzlibrary{automata}'); info['added'].append('automata (library)')
    # styles go with every drawing; definitions and colours only when used (followed through their bodies)
    chosen = [s for s in stmts if s.kind == 'expl']
    if tikzish:
        chosen += [s for s in stmts if s.kind == 'style']
    else:
        chosen += [s for s in stmts if s.kind == 'style' and s.cmd in ('sisetup', 'newcolumntype', 'DeclareSymbolFont', 'SetSymbolFont',
                                                                          'DeclareSymbolFontAlphabet', 'DeclareFontFamily', 'DeclareFontShape',
                                                                          'DeclareFontSubstitution', 'DeclareUnicodeCharacter', 'SetMathAlphabet')]
    by_name = collections.defaultdict(list)
    for s in stmts:
        if s.kind == 'def':
            for nm in s.names:
                by_name[nm].append(s)
    want = control_words(snippet) | {'env:' + e for e in re.findall(r'\\begin\s*\{([^{}]+)\}', snippet)}
    want |= {'arg:' + a for a in re.findall(r'!(\{[^{}]+\}|\\[A-Za-z]+)', snippet)}  # chemfig submolecules
    want |= {'arg:' + a[1:-1] for a in re.findall(r'!(\{[^{}]+\})', snippet)}
    want |= {'arg:' + a for a in re.findall(r'\{([A-Za-z@]+)\}', snippet)}  # counters (\value{x}, \stepcounter{x})
    for s in chosen:
        want |= s.deps
    picked, queue = set(), list(want)
    while queue:
        nm = queue.pop()
        for s in by_name.get(nm, ()):
            if id(s) not in picked:
                picked.add(id(s))
                queue.extend(s.deps | {'env:' + e for e in re.findall(r'\\begin\s*\{([^{}]+)\}', s.text)}
                             | {'arg:' + e for e in re.findall(r'\{([A-Za-z@]+)\}', s.text)})
    defs = [s for s in stmts if id(s) in picked]
    # \setlength/\addtolength of a picked length go with its \newlength (already by name); colours by name in use
    text_in_use = snippet + ''.join(s.text for s in chosen + defs)
    colours, changed = [], True
    while changed:
        changed = False
        for s in stmts:
            if s.kind == 'color' and s not in colours and (s.cmd in ('definecolorset', 'definecolors') or (s.arg and re.search(
                    r'(?<![\w-])' + re.escape(s.arg) + r'(?![\w-])', text_in_use))):
                colours.append(s); text_in_use += s.text; changed = True
    keep = sorted(set(chosen) | set(defs) | set(colours), key=lambda s: s.start)
    body_defs = list(dict.fromkeys(s.text for s in keep if not FONT_CMDS.search(s.text)))
    info['defs'] = len(defs)
    files = [f for f in extra.get('filecontents', []) if f[0] and f[0] in snippet]
    out = ['\\documentclass[border=' + ('2pt' if cls == 'math' else '4pt') + ']{standalone}']
    out += lines + libs
    for name, content in files:
        out += [f'\\begin{{filecontents*}}[overwrite]{{{name}}}', content.strip('\n'), '\\end{filecontents*}']
    if body_defs:
        out += ['\\makeatletter'] + body_defs + ['\\makeatother']
    out += ['\\begin{document}', snippet.strip('\n'), '\\end{document}', '']
    return '\n'.join(out), info


def doc_snippets(meta, files, rng):
    """All candidates of one document (meta, {path: text})."""
    results, stats = [], collections.Counter()
    mains = [p for p, t in files.items() if p.endswith(('.tex', '.ltx', '.tikz')) and '\\documentclass' in t and '\\begin{document}' in t]
    if not mains:
        mains = [p for p in files if p.endswith(('.tex', '.ltx'))]
        if meta['source'] in ('arxiv',):
            mains = mains[:1] if len(mains) == 1 else []
    for main in sorted(mains, key=lambda p: -len(files[p]))[:8]:
        text = inline(files, main)
        cls_line, pre, body = split_doc(text)
        if meta['source'] in ('texse', 'ctan') and cls_line is None:
            pre, body = '', text  # a fragment: its statements count where they sit
        stats['documents'] += 1
        # filecontents in the preamble (data files a plot reads)
        fc = [(m[2].strip(), m[3]) for m in re.finditer(r'\\begin\{filecontents\*?\}(\[[^\]]*\])?\s*\{([^{}]+)\}(.*?)\\end\{filecontents\*?\}', pre, re.S)]
        pre_clean = re.sub(r'\\begin\{filecontents\*?\}.*?\\end\{filecontents\*?\}', '', pre, flags=re.S)
        # local packages: their definitions are a source like the preamble (inside \makeatletter)
        local = {os.path.splitext(os.path.basename(p))[0]: p for p in files if p.endswith('.sty')}
        used_local = [x.strip() for g in re.findall(r'\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}', pre_clean)
                      for x in g.split(',') if x.strip() in local]
        # statement order is their start: local packages first, then the preamble, then the body (start >= 0)
        stmts_pre = []
        for k, n in enumerate(dict.fromkeys(used_local)):
            stmts_pre += scan(strip_comments(files[local[n]]), offset=-(4 - k * 0.01) * 10 ** 9)
        stmts_pre += scan(pre_clean, offset=-(10 ** 9))
        verb = [(a, b) for _, a, b in envs(body, VERBATIM)] if meta['source'] != 'ctan' else []
        body_v = blank(body, verb)
        stmts_body = scan(body_v)
        set_scopes(body_v, stmts_body)
        if cls_line is not None:  # \usepackage after \begin{document} is an error (and in manuals, an example)
            stmts_body = [x for x in stmts_body if x.kind != 'pkg']
        pkgs = set()
        libs = set()
        for s in stmts_pre + stmts_body:
            g = re.search(r'\{([^{}]*)\}', s.text)
            vals = [x.strip() for x in (g[1] if g else '').split(',')]
            if s.kind == 'pkg':
                pkgs.update(vals)
            elif s.kind == 'lib':
                libs.update(vals)
        drawn = [(DRAW_ENVS[name] or 'pic', a, b) for name, a, b in envs(body_v, list(DRAW_ENVS))]
        cmds = [c for c in cmd_snippets(body_v) if not any(a <= c[1] < b for _, a, b in drawn)]
        spans = drawn + cmds
        for lib0, a, b in spans:
            code = body[a:b]
            stats['pictures'] += 1
            lib = lib0 if lib0 != 'pic' else classify_pic(code, pkgs, libs)
            cls = 'lib' if lib else 'tikz'
            reason = next((r for r, p in DROP_PIC if p.search(code)), None)
            lines = code.count('\n') + 1
            if not reason and (lines > 400 or len(code) > 40000):
                reason = 'too large'
            if not reason and cls == 'tikz' and not re.search(r'\\(?:draw|fill|filldraw|node|path|shade|shadedraw|matrix|pic|graph|foreach|clip|coordinate)\b', code):
                reason = 'draws nothing'
            if reason:
                stats['drop: ' + reason] += 1
                continue
            snippet = code
            if lib == 'xymatrix':
                snippet = '$' + code + '$'
            doc, info = assemble(snippet, cls, lib, stmts_pre, stmts_body, a, local, meta, {'filecontents': fc})
            if doc is None:
                stats['drop: ' + info] += 1
                continue
            tags = [t for t, p in PIC_TAGS if p.search(code)]
            results.append(candidate(meta, main, cls, lib, code, doc, info, tags, body, a, lines=lines))
        # maths outside drawings and verbatim; a seeded sample per document keeps big papers from dominating
        if meta['source'] == 'ctan':
            continue
        # formulas inside a drawing or a definition in the body belong to it
        body_m = blank(body_v, [(a, b) for _, a, b in spans] + [(x.start, x.end) for x in stmts_body])
        found = math_snippets(body_m)
        stats['formulas'] += len(found)
        rng.shuffle(found)
        took = collections.Counter()
        for kind, inner, a, b in found:
            disp = kind != 'inline'
            if took[disp] >= 30:
                continue
            norm = normalise_math(kind, inner)
            if not norm:
                stats['drop: formula cannot stand alone'] += 1
                continue
            formula, display = norm
            core = re.sub(r'\s+', '', formula)
            if len(core) < 6 or (not display and not re.search(r'\\[A-Za-z]|[\^_]', formula)) or len(formula) > 3000:
                stats['drop: formula trivial or too long'] += 1
                continue
            snippet = f'$\\displaystyle {formula}$' if display else f'${formula}$'
            doc, info = assemble(snippet, 'math', None, stmts_pre, stmts_body, a, local, meta, {})
            if doc is None:
                stats['drop: ' + info] += 1
                continue
            tags = [t for t, p in MATH_TAGS if p.search(formula)]
            if info['defs']:
                tags.append('user-macros')
            c = candidate(meta, main, 'math', None, body[a:b], doc, info, tags, body, a)
            c.update(formula=formula, display=display, env=kind)
            results.append(c)
            took[disp] += 1
    return results, stats


def candidate(meta, main, cls, lib, code, doc, info, tags, body, at, lines=None):
    norm = normalise(code)
    return {'id': sha(cls + '\n' + norm, 16), 'class': cls, 'lib': lib, 'tags': tags, 'norm_sha': sha(norm),
            'source': meta['source'], 'meta': meta, 'main': main, 'line': body.count('\n', 0, at) + 1,
            'lines': lines or code.count('\n') + 1, 'chars': len(code), **info, 'tex': doc}


def clean(v):
    """Valid UTF-8 everywhere (lone surrogates from odd file names or JSON become U+FFFD)."""
    if isinstance(v, str):
        return v.encode('utf-8', 'surrogatepass').decode('utf-8', 'replace') if any('\ud800' <= ch <= '\udfff' for ch in v) else v
    if isinstance(v, dict):
        return {clean(k): clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v


def work(job):
    meta, files = job
    try:
        if files is None:
            files = arxiv_files(RAW / 'arxiv' / 'src' / meta['file'])
        rng = random.Random(sha(json.dumps(meta, sort_keys=True)))
        res, st = doc_snippets(meta, files, rng)
        return [clean(c) for c in res], st
    except RecursionError:
        return [], collections.Counter({'error: recursion': 1})
    except Exception as e:  # one bad document must not stop the run
        return [], collections.Counter({f'error: {type(e).__name__}': 1})


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sources', default='arxiv,datikz,texse,ctan')
    p.add_argument('-j', type=int, default=max(1, os.cpu_count() - 2))
    p.add_argument('--limit', type=int, help='documents per source (for trying changes)')
    p.add_argument('--out', default=str(WORK / 'candidates.jsonl.gz'))
    a = p.parse_args()
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    stats = collections.Counter()
    per = collections.Counter()
    tmp = out.with_suffix('.tmp')
    names = load_tl_index()
    with gzip.open(tmp, 'wt', encoding='utf-8') as f, multiprocessing.Pool(a.j, init_worker, (names,)) as pool:
        for source in a.sources.split(','):
            jobs = documents(source, a.limit)
            for res, st in pool.imap_unordered(work, jobs, chunksize=4):
                stats.update({f'{source} {k}': v for k, v in st.items()})
                for c in res:
                    f.write(json.dumps(c, ensure_ascii=False) + '\n')
                    per[(source, c['class'], c['lib'] or '')] += 1
    os.replace(tmp, out)
    report = {'stats': dict(sorted(stats.items())), 'candidates': {' '.join(k).strip(): v for k, v in sorted(per.items())}}
    (out.parent / 'extract-report.json').write_text(json.dumps(report, indent=1))
    for k, v in sorted(stats.items()):
        print(f'{v:8d}  {k}')
    by = collections.Counter()
    for (s, c, l), v in per.items():
        by[c + (':' + l if l else '')] += v
    print('candidates:', dict(sorted(by.items())))


if __name__ == '__main__':
    main()
