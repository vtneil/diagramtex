#!/usr/bin/env python3
"""Extract circuitikz part geometry straight from LaTeX, for parts that would take thousands of lines of
TeX to port by hand. Each part in SPEC is compiled on its own (latex + the pgf dvisvgm driver), the SVG is
read back (paths, fills, line widths, glyph outlines, all transforms applied) and its anchors are printed
from TeX. The result is src/domain/czparts-gen.ts, which registers the parts with TD.CZ.part like the
hand-written part files. Coordinates are cm with y up, as in czcore.ts.

usage: python3 scripts/cz-extract.py [-j 8] [--only 'en amp'] [--keep DIR]
Needs latex and dvisvgm (TeX Live). Re-run after changing SPEC; the output is deterministic.
"""
import os, re, sys, json, math, shutil, subprocess, tempfile, argparse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'domain', 'czparts-gen.ts')
PT = 2.54 / 72.27          # cm per TeX pt
LW1 = 0.8                  # pt: line width factor 1 (bipoles/thickness 2 × 0.4 pt wire)
HALF = 2.0                 # bipoles are drawn from (-HALF,0) to (HALF,0) cm

# (circuitikz name, 'b' bipole | 'n' node, category, palette name, keywords, options)
SPEC = [
  # ---- amplifiers
  ('en amp', 'n', 'opamp', 'European op-amp', 'operational amplifier opamp european iec infinity box', ''),
  ('fd op amp', 'n', 'opamp', 'Fully differential op-amp', 'fully differential operational amplifier opamp', ''),
  ('gm amp', 'n', 'opamp', 'Transconductance amplifier', 'gm ota transconductance amplifier', ''),
  ('inst amp', 'n', 'opamp', 'Instrumentation amplifier', 'instrumentation amplifier inamp', ''),
  ('fd inst amp', 'n', 'opamp', 'Fully differential inst. amplifier', 'fully differential instrumentation amplifier', ''),
  ('inst amp ra', 'n', 'opamp', 'Inst. amplifier (gain resistor)', 'instrumentation amplifier gain resistor ra', ''),
  ('plain amp', 'n', 'opamp', 'Plain amplifier', 'plain amplifier differential inputs', ''),
  ('plain mono amp', 'n', 'opamp', 'Plain mono amplifier', 'plain amplifier single input mono', ''),
  ('plain gm mono amp', 'n', 'opamp', 'Plain gm mono amplifier', 'plain transconductance amplifier mono', ''),
  ('buffer', 'n', 'opamp', 'Buffer amplifier', 'buffer amplifier unity gain', ''),
  # ---- IEEE-std logic
  ('ieeestd and port', 'n', 'logic', 'IEEE AND gate', 'and port logic ieee', ''),
  ('ieeestd nand port', 'n', 'logic', 'IEEE NAND gate', 'nand port logic ieee', ''),
  ('ieeestd or port', 'n', 'logic', 'IEEE OR gate', 'or port logic ieee', ''),
  ('ieeestd nor port', 'n', 'logic', 'IEEE NOR gate', 'nor port logic ieee', ''),
  ('ieeestd xor port', 'n', 'logic', 'IEEE XOR gate', 'xor exclusive port logic ieee', ''),
  ('ieeestd xnor port', 'n', 'logic', 'IEEE XNOR gate', 'xnor exclusive port logic ieee', ''),
  ('ieeestd buffer port', 'n', 'logic', 'IEEE buffer', 'buffer port logic ieee driver', ''),
  ('ieeestd not port', 'n', 'logic', 'IEEE NOT gate', 'not inverter port logic ieee', ''),
  ('ieeestd schmitt port', 'n', 'logic', 'IEEE Schmitt trigger', 'schmitt trigger hysteresis buffer ieee', ''),
  ('ieeestd invschmitt port', 'n', 'logic', 'IEEE inverting Schmitt trigger', 'schmitt trigger inverting hysteresis not ieee', ''),
  ('ieee tgate', 'n', 'logic', 'IEEE transmission gate', 'transmission gate tgate cmos switch ieee', ''),
  ('ieee double tgate', 'n', 'logic', 'IEEE double transmission gate', 'transmission gate double tgate cmos switch ieee', ''),
  ('notcirc', 'n', 'logic', 'Negation circle', 'not circle bubble inverter negation', ''),
  ('schmitt symbol', 'n', 'logic', 'Schmitt symbol', 'schmitt hysteresis symbol', ''),
  # ---- depletion MOS
  ('nmosd', 'n', 'trans', 'NMOSD transistor', 'depletion nmos mosfet', ''),
  ('pmosd', 'n', 'trans', 'PMOSD transistor', 'depletion pmos mosfet', ''),
  ('nfetd', 'n', 'trans', 'NFETD transistor', 'depletion nfet mosfet', ''),
  ('pfetd', 'n', 'trans', 'PFETD transistor', 'depletion pfet mosfet', ''),
  ('nigfetd', 'n', 'trans', 'NIGFETD transistor', 'depletion insulated gate fet igfet', ''),
  ('pigfetd', 'n', 'trans', 'PIGFETD transistor', 'depletion insulated gate fet igfet', ''),
  ('nigfetebulk', 'n', 'trans', 'NIGFETE (bulk)', 'enhancement insulated gate fet igfet bulk', ''),
  ('pigfetebulk', 'n', 'trans', 'PIGFETE (bulk)', 'enhancement insulated gate fet igfet bulk', ''),
  # ---- sources
  ('sinusoidal current source', 'b', 'src', 'Sinusoidal current source', 'sinusoidal ac current source sI', ''),
  ('controlled sinusoidal voltage source', 'b', 'src', 'Controlled sinusoidal voltage source', 'controlled dependent sinusoidal ac voltage source csV', ''),
  ('controlled sinusoidal current source', 'b', 'src', 'Controlled sinusoidal current source', 'controlled dependent sinusoidal ac current source csI', ''),
  ('ioosource', 'b', 'src', 'Double-circle current source', 'current source two circles oosource', ''),
  ('voosource', 'b', 'src', 'Double-circle voltage source', 'voltage source two circles oosource', ''),
  ('dcvsource', 'b', 'src', 'DC voltage source', 'dc voltage source', ''),
  ('dcisource', 'b', 'src', 'DC current source', 'dc current source', ''),
  # ---- inductors
  ('american inductor', 'b', 'ind', 'American inductor', 'inductor coil american L', ''),
  ('variable american inductor', 'b', 'ind', 'Variable American inductor', 'variable inductor coil american', ''),
  ('american inductive sensor', 'b', 'ind', 'American inductive sensor', 'inductive sensor coil american', ''),
  ('european inductor', 'b', 'ind', 'European inductor', 'inductor coil european block L', ''),
  ('variable european inductor', 'b', 'ind', 'Variable European inductor', 'variable inductor european', ''),
  ('european inductive sensor', 'b', 'ind', 'European inductive sensor', 'inductive sensor european', ''),
  ('cute inductive sensor', 'b', 'ind', 'Cute inductive sensor', 'inductive sensor cute coil', ''),
]

# diode fill styles: what the hand-written library lacks
for st, have in [('empty', {'ZZener', 'TVS', 'laser', 'Shockley', 'bidirectional', 'triac', 'thyristor', 'put', 'gto', 'gtobar', 'agtobar'}),
                 ('full', {'', 'Schottky', 'Zener', 'tunnel', 'photo', 'led', 'varcap'}),
                 ('stroke', set())]:
  for d, nm in [('', 'diode'), ('Schottky', 'Schottky diode'), ('Zener', 'Zener diode'), ('ZZener', 'ZZener diode'),
                ('tunnel', 'tunnel diode'), ('photo', 'photodiode'), ('led', 'led'), ('laser', 'laser diode'),
                ('varcap', 'varcap'), ('TVS', 'TVS diode'), ('Shockley', 'Shockley diode'), ('bidirectional', 'bidirectionaldiode'),
                ('triac', 'triac'), ('thyristor', 'thyristor'), ('put', 'put'), ('gto', 'gto'), ('gtobar', 'gtobar'), ('agtobar', 'agtobar')]:
    if d in have: continue
    if st == 'stroke' and d in ('TVS', 'Shockley', 'bidirectional'): continue  # circuitikz has no stroke form
    label = {'led': 'LED', 'put': 'PUT', 'gto': 'GTO', 'gtobar': 'GTO bar', 'agtobar': 'AGTO bar', 'varcap': 'varicap',
             'photo': 'photodiode', 'bidirectional': 'bidirectional diode', '': 'diode'}.get(d, nm)
    SPEC.append((st + ' ' + nm, 'b', 'diode', st.capitalize() + ' ' + label, ' '.join([st, nm, 'diode', label]), ''))

SPEC += [
  # ---- wiring
  ('jump crossing', 'n', 'wires', 'Jump crossing', 'crossing wire jump hop bridge', ''),
  ('plain crossing', 'n', 'wires', 'Plain crossing', 'crossing wire plain', ''),
  ('currarrow', 'n', 'wires', 'Current arrow', 'arrow current tip', ''),
  ('inputarrow', 'n', 'wires', 'Input arrow', 'arrow input tip', ''),
  ('trarrow', 'n', 'wires', 'Transistor arrow', 'arrow transistor tip', ''),
  ('flowarrow', 'n', 'wires', 'Flow arrow', 'arrow flow', ''),
  ('diamondpole', 'n', 'wires', 'Diamond pole', 'pole node diamond filled', ''),
  ('odiamondpole', 'n', 'wires', 'Open diamond pole', 'pole node diamond open', ''),
  ('squarepole', 'n', 'wires', 'Square pole', 'pole node square filled', ''),
  ('osquarepole', 'n', 'wires', 'Open square pole', 'pole node square open', ''),
  ('iecconn', 'b', 'conn', 'IEC connector (plug & socket)', 'iec connector plug socket', ''),
  ('iecplugL', 'n', 'conn', 'IEC plug (left)', 'iec plug connector', ''),
  ('iecplugR', 'n', 'conn', 'IEC plug (right)', 'iec plug connector', ''),
  ('iecsocketL', 'n', 'conn', 'IEC socket (left)', 'iec socket connector', ''),
  ('iecsocketR', 'n', 'conn', 'IEC socket (right)', 'iec socket connector', ''),
  ('multiwire', 'b', 'wires', 'Multiwire', 'multiwire bus slash', ''),
  ('bmultiwire', 'b', 'wires', 'Multiwire (bottom)', 'multiwire bus slash', ''),
  ('tmultiwire', 'b', 'wires', 'Multiwire (top)', 'multiwire bus slash', ''),
  # ---- switches
  ('cute spdt up', 'n', 'switch', 'Cute SPDT (up)', 'cute spdt switch changeover', ''),
  ('cute spdt mid', 'n', 'switch', 'Cute SPDT (middle)', 'cute spdt switch changeover', ''),
  ('cute spdt down', 'n', 'switch', 'Cute SPDT (down)', 'cute spdt switch changeover', ''),
  ('cute spdt up arrow', 'n', 'switch', 'Cute SPDT (up, arrow)', 'cute spdt switch changeover arrow', ''),
  ('cute spdt mid arrow', 'n', 'switch', 'Cute SPDT (middle, arrow)', 'cute spdt switch changeover arrow', ''),
  ('cute spdt down arrow', 'n', 'switch', 'Cute SPDT (down, arrow)', 'cute spdt switch changeover arrow', ''),
  ('proximeter', 'n', 'switch', 'Proximeter (node)', 'proximity sensor proximeter', ''),
  ('ncs', 'b', 'switch', 'Normally closed switch', 'normal closed switch ncs', ''),
  ('oncs', 'b', 'switch', 'Opening normally closed switch', 'opening normal closed switch oncs', ''),
  ('cncs', 'b', 'switch', 'Closing normally closed switch', 'closing normal closed switch cncs', ''),
  ('onos', 'b', 'switch', 'Opening normally open switch', 'opening normal open switch onos', ''),
  ('cnos', 'b', 'switch', 'Closing normally open switch', 'closing normal open switch cnos', ''),
  ('cute closed switch', 'b', 'switch', 'Cute closed switch', 'cute closed switch', ''),
  ('cute open switch', 'b', 'switch', 'Cute open switch', 'cute open switch', ''),
  ('cute closing switch', 'b', 'switch', 'Cute closing switch', 'cute closing switch', ''),
  ('cute opening switch', 'b', 'switch', 'Cute opening switch', 'cute opening switch', ''),
  # ---- tubes
  ('diodetube', 'n', 'tube', 'Diode tube', 'vacuum tube valve diode', ''),
  ('triode', 'n', 'tube', 'Triode', 'vacuum tube valve triode', ''),
  ('tetrode', 'n', 'tube', 'Tetrode', 'vacuum tube valve tetrode', ''),
  ('pentode', 'n', 'tube', 'Pentode', 'vacuum tube valve pentode', ''),
  ('pentode suppressor to cathode', 'n', 'tube', 'Pentode (suppressor to cathode)', 'vacuum tube valve pentode suppressor cathode', ''),
  ('magnetron', 'n', 'tube', 'Magnetron', 'magnetron microwave tube', ''),
  ('dynode', 'n', 'tube', 'Dynode', 'dynode photomultiplier electrode', ''),
  # ---- RF and block diagram
  ('antenna', 'n', 'rf', 'Antenna', 'antenna aerial', ''),
  ('rxantenna', 'n', 'rf', 'Receiving antenna', 'antenna receiver rx aerial', ''),
  ('txantenna', 'n', 'rf', 'Transmitting antenna', 'antenna transmitter tx aerial', ''),
  ('bareRXantenna', 'n', 'rf', 'Bare receiving antenna', 'antenna receiver rx bare', ''),
  ('bareTXantenna', 'n', 'rf', 'Bare transmitting antenna', 'antenna transmitter tx bare', ''),
  ('harmonics', 'n', 'rf', 'Harmonics', 'harmonics waves sine', ''),
  ('match', 'n', 'rf', 'Matching network', 'match matching network impedance', ''),
  ('mixer', 'n', 'dsp', 'Mixer', 'mixer multiplier rf block', ''),
  ('adder', 'n', 'dsp', 'Adder', 'adder sum block', ''),
  ('oscillator', 'n', 'dsp', 'Oscillator', 'oscillator generator sine block', ''),
  ('vco', 'b', 'dsp', 'VCO', 'vco voltage controlled oscillator', ''),
  ('circulator', 'n', 'dsp', 'Circulator', 'circulator rf block', ''),
  ('wilkinson', 'n', 'dsp', 'Wilkinson divider', 'wilkinson power divider splitter rf', ''),
  ('splitter', 'n', 'dsp', 'Splitter', 'splitter divider rf', ''),
  ('genericsplitter', 'n', 'dsp', 'Generic splitter', 'splitter divider generic', ''),
  ('gridnode', 'n', 'dsp', 'Grid node', 'grid node block', ''),
  ('mzm', 'n', 'dsp', 'Mach-Zehnder modulator', 'mzm mach zehnder modulator optical', ''),
  ('fourport', 'n', 'dsp', 'Four port', 'four port block generic', ''),
  ('coupler', 'n', 'dsp', 'Coupler', 'coupler directional rf', ''),
  ('coupler2', 'n', 'dsp', 'Coupler (two arrows)', 'coupler directional rf', ''),
  # ---- grounds and misc
  ('tlground', 'n', 'ground', 'Tline ground', 'ground transmission line', ''),
  ('rground', 'n', 'ground', 'Reference ground', 'ground reference', ''),
  ('tground', 'n', 'ground', 'Thick ground', 'ground thick', ''),
  ('generic', 'b', 'res', 'Generic', 'generic resistor impedance box', ''),
  ('tgeneric', 'b', 'res', 'Tunable generic', 'tunable generic variable box', ''),
  ('thermistor', 'b', 'res', 'Thermistor', 'thermistor temperature resistor', ''),
  ('rmeter', 'b', 'meter', 'Meter (arrow)', 'meter rmeter instrument arrow', ''),
  ('double bipole', 'n', 'ic', 'Double bipole', 'double bipole quadpole two port', ''),
  ('tlmic', 'b', 'audio', 'Microphone (tline)', 'microphone tlmic', ''),
]

BLACK = {'center', 'text', 'north', 'south', 'east', 'west', 'north east', 'north west', 'south east', 'south west',
         'label', 'above', 'below', 'zero', 'pathstart', 'pathend', 'geocenter', 'mid', 'vcenter', 'narrow center',
         'a', 'b', 'c', 'd', 'e', 'f', 'g', 'i', 'n', 's', 'w', 'ne', 'nw', 'se', 'sw', 'v+', 'v-', 'i+', 'i-', 'b+', 'b-',
         'top', 'bottom', 'top left', 'top right', 'bottom left', 'bottom right', 'topleft', 'topright', 'leftedge',
         'rightedge', 'apex', 'tip', 'btip', 'arc', 'dot', 'kink', 'kink left', 'kink right', 'waves', 'arrows', 'centergap'}
ALIAS = {'nobase', 'nobulk', 'nogate', 'base', 'collector', 'emitter', 'drain', 'source', 'gate1', 'gate2', 'G1', 'G2',
         'in up', 'in down', 'in1', 'in2', 'W', 'cin', 'cout', 'cout 1', 'cout 2', 'centerprim', 'centersec', 'bnotgate', 'bgate'}
PREFER = ['D', 'G', 'S', 'C', 'bulk', 'B', 'E', '+', '-', 'in', 'in 1', 'in 2', 'out', 'out 1', 'out 2', 'out +', 'out -',
          'anode', 'cathode', 'grid', 'control', 'screen', 'suppressor', 'gate', 'notgate', 'mod', 'out1', 'out2',
          '1', '2', '3', '4', 'A1', 'A2', 'B1', 'B2', 'wiper', 'midtap', 'up', 'down']
PREFIX = ('ext ', 'inset ', 'block ', 'body ', 'circle ', 'hlines', 'inner ', 'outer ', 'tube ', 'tubesq', 'top arc', 'bin',
          'ibin', 'bout', 'ra', 'bra', 'refv', 'curve ', 'nixie', 'core ', 'symbol', 'ul ', 'ur ', 'll ', 'lr ', 'left ', 'right ',
          'center ', 'plug center', 'socket center', 'filament center')

def anchor_names():
  src = ''
  d = subprocess.run(['kpsewhich', 'pgfcircshapes.tex'], capture_output=True, text=True).stdout.strip()
  for f in os.listdir(os.path.dirname(d)):
    if f.endswith('.tex'): src += open(os.path.join(os.path.dirname(d), f), encoding='latin-1').read()
  names = set(re.findall(r'\\anchor\{([^}#\\]+)\}', src)) | set(re.findall(r'\\inheritanchor(?:\[[^\]]*\])?\{([^}#\\]+)\}', src))
  for i in range(1, 9):
    for p in ('in ', 'bin ', 'ibin ', 'out ', 'port', 'cathode ', 'grid ', 'anode '): names.add(p + str(i))
  return sorted(n for n in names if ',' not in n)

def tex_for(name, kind, opts, anchors):
  o = (', ' + opts) if opts else ''
  body = (r'\draw (-%g,0) to[%s%s, name=X] (%g,0);' % (HALF, name, o, HALF)) if kind == 'b' else (r'\node[%s%s] (X) at (0,0) {};' % (name, o))
  return r'''\def\pgfsysdriver{pgfsys-dvisvgm.def}
\documentclass{article}
\usepackage{circuitikz}
\pagestyle{empty}
\begin{document}
\begin{tikzpicture}
%s
\makeatletter
\edef\czsh{\csname pgf@sh@ns@X\endcsname}
\immediate\write16{SHAPE|\czsh}
\foreach \a in {%s} {\pgfutil@ifundefined{pgf@anchor@\czsh @\a}{}{\pgfpointanchor{X}{\a}\immediate\write16{ANCH|\a|\the\pgf@x|\the\pgf@y}}}
\makeatother
\end{tikzpicture}
\end{document}
''' % (body, ','.join(anchors))

# ---------- SVG reading ----------
NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
def tokens(d):
  return re.findall(r'[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d)

def parse_d(d):
  """SVG path data → list of subpaths [[('M',x,y),('L',x,y),('C',x1,y1,x2,y2,x,y),('Z',)],…] (absolute)."""
  t = tokens(d); i = 0; cmd = None; x = y = sx = sy = 0; out = []; cur = None; lc = None
  def num():
    nonlocal i; v = float(t[i]); i += 1; return v
  while i < len(t):
    if t[i].isalpha(): cmd = t[i]; i += 1
    c = cmd
    if c in 'Mm':
      nx, ny = num(), num()
      if c == 'm' and cur is not None: nx += x; ny += y
      x, y = nx, ny; sx, sy = x, y; cur = [('M', x, y)]; out.append(cur); cmd = 'l' if c == 'm' else 'L'
    elif c in 'Ll':
      nx, ny = num(), num()
      if c == 'l': nx += x; ny += y
      x, y = nx, ny; cur.append(('L', x, y))
    elif c in 'Hh':
      nx = num(); x = nx + (x if c == 'h' else 0); cur.append(('L', x, y))
    elif c in 'Vv':
      ny = num(); y = ny + (y if c == 'v' else 0); cur.append(('L', x, y))
    elif c in 'Cc':
      a = [num() for _ in range(6)]
      if c == 'c': a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y, a[4] + x, a[5] + y]
      cur.append(('C', *a)); lc = (a[2], a[3]); x, y = a[4], a[5]
    elif c in 'Ss':
      a = [num() for _ in range(4)]
      if c == 's': a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y]
      p = cur[-1]; r = (2 * x - p[3], 2 * y - p[4]) if p[0] == 'C' else (x, y)
      cur.append(('C', r[0], r[1], *a)); x, y = a[2], a[3]
    elif c in 'Qq':
      a = [num() for _ in range(4)]
      if c == 'q': a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y]
      cur.append(('C', x + 2 / 3 * (a[0] - x), y + 2 / 3 * (a[1] - y), a[2] + 2 / 3 * (a[0] - a[2]), a[3] + 2 / 3 * (a[1] - a[3]), a[2], a[3]))
      x, y = a[2], a[3]
    elif c in 'Zz':
      cur.append(('Z',)); x, y = sx, sy
      if i < len(t) and not t[i].isalpha(): cmd = 'L'
    else: raise ValueError('path command ' + c)
  return out

def parse_tf(s):
  m = [1, 0, 0, 1, 0, 0]
  for fn, args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
    a = [float(v) for v in NUM.findall(args)]
    if fn == 'translate': n = [1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0]
    elif fn == 'scale': n = [a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0]
    elif fn == 'matrix': n = a
    elif fn == 'rotate':
      r = math.radians(a[0]); n = [math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0]
    else: raise ValueError(fn)
    m = mul(m, n)
  return m
def mul(a, b):
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
          a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
def inv(m):
  det = m[0] * m[3] - m[1] * m[2]
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]
def ap(m, x, y): return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]

def bez(p0, p1, p2, p3, n):
  out = []
  for i in range(1, n + 1):
    t = i / n; u = 1 - t
    out.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
  return out

def flatten(sub, n=48):
  """one subpath → points (curves sampled)"""
  pts = []
  for seg in sub:
    if seg[0] == 'M' or seg[0] == 'L': pts.append((seg[1], seg[2]))
    elif seg[0] == 'C': pts += bez(pts[-1], seg[1:3], seg[3:5], seg[5:7], n)
    elif seg[0] == 'Z' and pts: pts.append(pts[0])
  return pts

def clip_lines(subs, poly):
  """Cut polylines (curves flattened) to a convex polygon (Cyrus-Beck); returns M/L subpaths."""
  if len(poly) > 1 and abs(poly[0][0] - poly[-1][0]) + abs(poly[0][1] - poly[-1][1]) < 1e-9: poly = poly[:-1]
  area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
  sg = 1 if area > 0 else -1
  def seg(a, b):
    t0, t1 = 0.0, 1.0
    for i in range(len(poly)):
      p, q = poly[i], poly[(i + 1) % len(poly)]
      nx, ny = -(q[1] - p[1]) * sg, (q[0] - p[0]) * sg       # inward normal
      den = nx * (b[0] - a[0]) + ny * (b[1] - a[1]); num = nx * (a[0] - p[0]) + ny * (a[1] - p[1])
      if abs(den) < 1e-12:
        if num < 0: return None
        continue
      t = -num / den
      if den > 0: t0 = max(t0, t)
      else: t1 = min(t1, t)
      if t0 > t1: return None
    return ((a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])), (a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1])))
  out = []
  for s in subs:
    pts = flatten(s); cur = None
    for a, b in zip(pts, pts[1:]):
      r = seg(a, b)
      if r is None: cur = None; continue
      if cur is None or abs(cur[-1][1] - r[0][0]) + abs(cur[-1][2] - r[0][1]) > 1e-6:
        cur = [('M', *r[0])]; out.append(cur)
      cur.append(('L', *r[1]))
  return out

KEY_FIX = {'switch:proximeter': 'switch:proximeter-node'}

def read_svg(path):
  NS = '{http://www.w3.org/2000/svg}'; XL = '{http://www.w3.org/1999/xlink}href'
  root = ET.parse(path).getroot()
  defs = {e.get('id'): e.get('d') for e in root.iter(NS + 'path') if e.get('id')}
  page = root.find(NS + 'g')
  items = []   # (subpaths in page coords, fill, stroke, stroke-width, scale)
  clips = {}
  base = None
  def walk(el, m, st):
    nonlocal base
    st = dict(st)
    for k in ('fill', 'stroke', 'stroke-width'):
      if el.get(k) is not None: st[k] = el.get(k)
    if el.get('transform'):
      m = mul(m, parse_tf(el.get('transform')))
      if base is None: base = m          # pgf's picture frame: translate + scale(.996264, -.996264)
    tag = el.tag.replace(NS, '')
    if tag == 'clipPath':            # the clip region, not ink: kept for the groups that use it
      pe = el.find(NS + 'path')
      if pe is not None: clips[el.get('id')] = (parse_d(pe.get('d')), m)
      return
    cp = el.get('clip-path')
    if cp: st['clip'] = clips.get(cp[cp.find('#') + 1:].rstrip(')'))
    if tag == 'path' and el.get('d'):
      items.append((parse_d(el.get('d')), m, st, False))
    elif tag == 'use':
      d = defs.get(el.get(XL).lstrip('#'))
      if d:
        mm = mul(m, [1, 0, 0, 1, float(el.get('x', 0)), float(el.get('y', 0))])
        items.append((parse_d(d), mm, dict(st, stroke='none'), True))
    for c in el: walk(c, m, st)
  walk(page, [1, 0, 0, 1, 0, 0], {'fill': '#000', 'stroke': 'none', 'stroke-width': '1'})
  if base is None: return []
  ib = inv(base)
  out = []
  for subs, m, st, glyph in items:
    t = mul(ib, m)           # element → picture pt (y up)
    k = math.sqrt(abs(t[0] * t[3] - t[1] * t[2]))
    conv = []
    for s in subs:
      q = []
      for seg in s:
        if seg[0] == 'Z': q.append(('Z',)); continue
        pts = []
        for j in range(1, len(seg), 2):
          X, Y = ap(t, seg[j], seg[j + 1]); pts += [X * PT, Y * PT]
        q.append((seg[0], *pts))
      conv.append(q)
    fill = st.get('fill', '#000'); stroke = st.get('stroke', 'none')
    sw = float(st.get('stroke-width', 1)) * k
    if st.get('clip'):             # pgf clips (antenna and harmonics waves): stroke cut to a convex region
      csubs, cm = st['clip']; ct = mul(ib, cm)
      poly = [ap(ct, x, y) for x, y in flatten(csubs[0])]
      poly = [(x * PT, y * PT) for x, y in poly]
      conv = clip_lines(conv, poly); fill = 'none'
    out.append({'subs': conv, 'fill': fill, 'stroke': stroke, 'lw': sw / LW1, 'glyph': glyph})
  return out

def colour_paint(c):
  c = c.lower()
  if c in ('#000', '#000000', 'black'): return 'ink'
  if c in ('#fff', '#ffffff', 'white'): return 'paper'
  return 'grey'

def run_one(spec, anchors, keep):
  name, kind, cat, label, kw, opts = spec
  d = tempfile.mkdtemp(prefix='czx')
  try:
    open(os.path.join(d, 'p.tex'), 'w').write(tex_for(name, kind, opts, anchors))
    r = subprocess.run(['latex', '-interaction=nonstopmode', '-halt-on-error', 'p.tex'], cwd=d, capture_output=True, text=True, errors='replace')
    log = r.stdout
    if r.returncode != 0 or not os.path.exists(os.path.join(d, 'p.dvi')):
      err = re.findall(r'^! .*', log, re.M)
      return {'spec': spec, 'error': (err[0] if err else 'latex failed')}
    subprocess.run(['dvisvgm', '--no-fonts', '-o', 'p.svg', 'p.dvi'], cwd=d, capture_output=True)
    shape = (re.findall(r'^SHAPE\|(.*)$', log, re.M) or [''])[0]
    anch = {}
    for a, x, y in re.findall(r'^ANCH\|(.*?)\|(-?[\d.]+)pt\|(-?[\d.]+)pt$', log, re.M):
      anch[a] = [float(x) * PT, float(y) * PT]
    items = read_svg(os.path.join(d, 'p.svg'))
    if keep: shutil.copy(os.path.join(d, 'p.svg'), os.path.join(keep, re.sub(r'\W+', '_', name + '_' + opts) + '.svg'))
    return {'spec': spec, 'shape': shape, 'anchors': anch, 'items': items}
  finally:
    shutil.rmtree(d, ignore_errors=True)

def is_lead(s):
  """a straight lead from a path end (±HALF, 0) along y = 0"""
  if len(s) != 2 or s[0][0] != 'M' or s[1][0] != 'L': return None
  (_, x1, y1), (_, x2, y2) = s
  if abs(y1) > 1e-3 or abs(y2) > 1e-3: return None
  for a, b in ((x1, x2), (x2, x1)):
    if abs(abs(a) - HALF) < 1e-3: return b
  return None

def r4(v):
  v = round(v, 4)
  return 0.0 if v == 0 else v
def fmt(v):
  s = ('%.4f' % r4(v)).rstrip('0').rstrip('.')
  return s.replace('0.', '.', 1) if s.startswith('0.') else s.replace('-0.', '-.', 1) if s.startswith('-0.') else s

def build(res):
  name, kind, cat, label, kw, opts = res['spec']
  items = res['items']
  inner = []
  # drop the leads (bipoles): body ends are the inner ends of the two leads
  if kind == 'b':
    for it in items:
      keep = []
      for s in it['subs']:
        e = is_lead(s)
        if e is not None and not it['glyph']: inner.append(e); continue
        keep.append(s)
      it['subs'] = keep
  w = 0
  if kind == 'b':
    lo = [e for e in inner if e < 0]; hi = [e for e in inner if e > 0]
    w = (min(hi) if hi else 0) - (max(lo) if lo else 0)
    if not lo and not hi: w = 0
  paths = []
  for it in items:
    if not it['subs']: continue
    filled = it['fill'] != 'none'    # pgf marks every stroke-only path fill='none'
    stroked = it['stroke'] not in ('none',)
    if filled and it['fill'] != 'none':
      paint = colour_paint(it['fill']); lw = round(it['lw'], 3) if stroked else 0
    else:
      if not stroked: continue
      paint = 'stroke'; lw = round(it['lw'], 3)
    d = []
    for s in it['subs']:
      for seg in s:
        d.append(seg[0] + ' '.join(fmt(v) for v in seg[1:]) if seg[0] != 'Z' else 'Z')
    paths.append([paint, lw, ''.join(d)])
  # pins: one name per point, the most usual one (D before drain, + before in up, …)
  cand = {a: p for a, p in res['anchors'].items() if not (a in BLACK or a.startswith(PREFIX) or a in ALIAS)}
  if 'bulk' in cand and abs(cand['bulk'][0]) + abs(cand['bulk'][1]) < 1e-3: cand.pop('bulk')
  if cat == 'logic': cand.pop('up', None); cand.pop('down', None)
  if kind == 'b' or len(set(cand) - {'left', 'right'}) > 0: cand.pop('left', None); cand.pop('right', None)
  rank = lambda a: (PREFER.index(a) if a in PREFER else 100 + len(a), a)
  best = {}
  for a in sorted(cand, key=rank):
    k = (round(cand[a][0], 3), round(cand[a][1], 3))
    if k not in best: best[k] = a
  pins = {a: [r4(cand[a][0]), r4(cand[a][1])] for a in sorted(best.values(), key=rank)}
  if all(abs(p[0]) + abs(p[1]) < 1e-3 for p in pins.values()) and kind == 'n': pins = {'center': [0, 0]}
  key = cat + ':' + re.sub(r'[^a-z0-9]+', '-', (name + ('-' + opts if opts else '')).lower()).strip('-')
  key = KEY_FIX.get(key, key)   # keys the hand-drawn parts already use
  tikz = name + ((', ' + opts) if opts else '')
  return {'key': key, 'name': label, 'cat': cat, 'kind': 'bipole' if kind == 'b' else 'node', 'tikz': tikz,
          'w': r4(w), 'pins': pins, 'keywords': kw, 'd': paths}

HEAD = '''// circuitikz parts generated by scripts/cz-extract.py from circuitikz itself (latex + dvisvgm): each part's
// outline, fills and glyphs as circuitikz draws them with the default settings, and its anchors.
// Do not edit by hand: change SPEC in the script and run it again. Units are cm, y up (see czcore.ts).
// d: [paint, line width factor, path] with M/L/C/Z commands; a filled path keeps its holes (one subpath).
(function () {
  const CZ = TD.CZ;
  const draw = (paths: any) => (g: any) => {
    for (const [paint, lw, d] of paths) {
      g.width(lw);
      const t = d.match(/[MLCZ]|-?[\\d.]+/g);
      let first = true, sub = null;
      for (let i = 0; i < t.length;) {
        const c = t[i++], n = c === 'C' ? 6 : c === 'Z' ? 0 : 2, a = t.slice(i, i + n).map(Number);
        i += n;
        if (c === 'M') {
          if (first || paint === 'stroke') { g.M(a[0], a[1]); sub = g.subs[g.subs.length - 1]; first = false; }
          else sub.segs.push(['M', a[0], a[1]]);
        } else if (c === 'L') g.L(a[0], a[1]);
        else if (c === 'C') g.C(...a);
        else g.Z();
      }
      if (paint !== 'stroke') g[paint]();
    }
    g.width(1);
  };
  const PARTS = '''
TAIL = ''';
  for (const p of PARTS) CZ.part({ ...p, draw: draw(p.d) });
})();
'''

def main():
  ap_ = argparse.ArgumentParser()
  ap_.add_argument('-j', type=int, default=8)
  ap_.add_argument('--only')
  ap_.add_argument('--keep')
  ap_.add_argument('--dry', action='store_true', help='report only, do not write the JS')
  a = ap_.parse_args()
  if a.keep: os.makedirs(a.keep, exist_ok=True)
  anchors = anchor_names()
  specs = [s for s in SPEC if not a.only or s[0] == a.only]
  with ThreadPoolExecutor(a.j) as ex:
    results = list(ex.map(lambda s: run_one(s, anchors, a.keep), specs))
  parts, bad = [], []
  for r in results:
    if 'error' in r: bad.append((r['spec'][0], r['error'])); continue
    p = build(r)
    if not p['d']: bad.append((r['spec'][0], 'nothing drawn')); continue
    parts.append(p)
    print('%-42s %-6s w=%-7s pins=%s' % (p['key'], p['kind'], p['w'], ','.join(p['pins'])))
  for n, e in bad: print('FAILED', n, e, file=sys.stderr)
  keys = [p['key'] for p in parts]
  assert len(keys) == len(set(keys)), 'duplicate keys'
  if a.dry or a.only: return
  body = json.dumps(parts, separators=(',', ':'), ensure_ascii=False)
  body = body.replace('},{"key"', '},\n    {"key"')
  open(OUT, 'w').write("import { runtime as TD } from '../runtime';\n" + HEAD + body + TAIL)
  print('wrote', OUT, len(parts), 'parts,', os.path.getsize(OUT), 'bytes')

if __name__ == '__main__':
  main()
