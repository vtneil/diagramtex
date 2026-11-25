#!/usr/bin/env python3
# TeX's script-size fonts for KaTeX, made once at maintenance time (like scripts/generate-label-glyphs.js).
# LaTeX at 10pt sets scripts in the 7pt designs and second-order scripts in the 5pt ones (\DeclareMathSizes{10}{10}{7}{5}:
# cmr7/cmr5, cmmi7/cmmi5, cmsy7/cmsy5 …), which are wider and heavier per em than the 10pt design KaTeX shrinks. Each
# face here is a copy of a KaTeX face with the glyphs KaTeX took from a TeX font (KaTeX's src/metrics/mapping.pl: TeX
# font and slot -> code point) replaced by that slot of the same font at 7pt or 5pt, from TeX Live's AMS Type 1 fonts.
# Glyphs KaTeX made of its own stay as they are. public/vendor/katex/katex-scripts.css picks them by KaTeX's size class.
#
#   python3 -I scripts/generate-script-fonts.py      (fontTools and brotli installed; kpsewhich from TeX Live on PATH)
import json, os, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.t1Lib import T1Font
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONTS = os.path.join(ROOT, 'public', 'vendor', 'katex', 'fonts')
# KaTeX face -> 10pt TeX font -> [slot, code point] or [first slot, last slot, first code point] (mapping.pl, the
# entries KaTeX copies without moving the glyph)
MAP = json.loads('{"Main-Bold":{"cmbsy10":[[0,8722],[1,8901],[2,215],[3,8727],[4,247],[5,8900],[6,177],[7,8723],[8,12,8853],[13,9711],[14,15,8728],[16,8781],[17,8801],[18,19,8838],[20,21,8804],[22,23,10927],[24,8764],[25,8776],[26,27,8834],[28,29,8810],[30,31,8826],[32,8592],[33,8594],[34,8593],[35,36,8595],[37,38,8599],[39,8771],[40,8656],[41,8658],[42,8657],[43,44,8659],[45,8598],[46,8601],[47,8733],[48,8242],[49,8734],[50,8712],[51,8715],[52,9651],[53,9661],[54,57376],[56,8704],[57,8707],[58,172],[59,8709],[60,8476],[61,8465],[62,63,8868],[64,8501],[91,8746],[92,8745],[93,8846],[94,95,8743],[96,97,8866],[98,99,8970],[100,101,8968],[102,123],[103,125],[104,105,10216],[106,124],[106,8739],[107,8741],[108,8597],[109,8661],[110,92],[110,8726],[111,8768],[113,10815],[114,8711],[115,8747],[116,8852],[117,8851],[118,119,8849],[121,122,8224],[124,9827],[125,9826],[126,9825],[127,9824]],"cmbx10":[[0,1,915],[2,920],[3,923],[4,926],[5,928],[6,931],[7,8,933],[9,10,936],[16,305],[17,567],[18,715],[19,714],[20,711],[21,728],[22,713],[23,730],[24,184],[25,223],[26,230],[27,339],[28,248],[29,198],[30,338],[31,216],[33,34,33],[34,8221],[35,39,35],[39,8217],[40,59,40],[61,61],[63,91,63],[92,8220],[93,94,93],[94,710],[95,729],[96,8216],[97,122,97],[123,124,8211],[125,733],[126,732],[127,168]],"cmmib10":[[40,41,8636],[42,43,8640],[46,9657],[47,9667],[60,60],[61,8725],[62,62],[63,8902],[64,8706],[91,93,9837],[94,8995],[95,8994],[96,8467],[104,8463],[125,8472]],"msam10":[[92,8736]]},"Main-Regular":{"cmmi10":[[40,41,8636],[42,43,8640],[46,9657],[47,9667],[60,60],[61,8725],[62,62],[63,8902],[64,8706],[91,93,9837],[94,8995],[95,8994],[96,8467],[125,8472]],"cmr10":[[0,1,915],[2,920],[3,923],[4,926],[5,928],[6,931],[7,8,933],[9,10,936],[16,305],[17,567],[18,715],[19,714],[20,711],[21,728],[22,713],[23,730],[24,184],[25,223],[26,230],[27,339],[28,248],[29,198],[30,338],[31,216],[33,34,33],[34,8221],[35,39,35],[39,8217],[40,59,40],[61,61],[63,91,63],[92,8220],[93,94,93],[94,710],[95,729],[96,8216],[97,122,97],[123,124,8211],[125,733],[126,732],[127,168]],"cmsy10":[[0,8722],[1,8901],[2,215],[3,8727],[4,247],[5,8900],[6,177],[7,8723],[8,12,8853],[13,9711],[14,15,8728],[16,8781],[17,8801],[18,19,8838],[20,21,8804],[22,23,10927],[24,8764],[25,8776],[26,27,8834],[28,29,8810],[30,31,8826],[32,8592],[33,8594],[34,8593],[35,36,8595],[37,38,8599],[39,8771],[40,8656],[41,8658],[42,8657],[43,44,8659],[45,8598],[46,8601],[47,8733],[48,8242],[49,8734],[50,8712],[51,8715],[52,9651],[53,9661],[54,57376],[56,8704],[57,8707],[58,172],[59,8709],[60,8476],[61,8465],[62,63,8868],[64,8501],[91,8746],[92,8745],[93,8846],[94,95,8743],[96,97,8866],[98,99,8970],[100,101,8968],[102,123],[103,125],[104,105,10216],[106,124],[106,8739],[107,8741],[108,8597],[109,8661],[110,92],[110,8726],[111,8768],[113,10815],[114,8711],[115,8747],[116,8852],[117,8851],[118,119,8849],[120,167],[121,122,8224],[123,182],[124,9827],[125,9826],[126,9825],[127,9824]],"msam10":[[92,8736]],"msbm10":[[126,8463]]},"Math-Italic":{"cmmi10":[[0,1,915],[2,920],[3,923],[4,926],[5,928],[6,931],[7,8,933],[9,10,936],[11,14,945],[15,1013],[16,24,950],[25,26,960],[27,29,963],[30,981],[31,33,967],[34,949],[35,977],[36,982],[37,1009],[38,962],[39,966],[48,57,48],[65,90,65],[97,111,97],[111,959],[112,122,112],[123,57649],[124,57911]]},"Caligraphic-Regular":{"cmsy10":[[65,90,65]]}}')
# the TeX font LaTeX uses at 7pt and at 5pt for each 10pt one (ot1cmr.fd, omlcmm.fd, omscmsy.fd, umsa.fd, umsb.fd)
SIZES = {'cmr10': ('cmr7', 'cmr5'), 'cmmi10': ('cmmi7', 'cmmi5'), 'cmsy10': ('cmsy7', 'cmsy5'), 'msam10': ('msam7', 'msam5'),
         'msbm10': ('msbm7', 'msbm5'), 'cmbx10': ('cmbx7', 'cmbx5'), 'cmmib10': ('cmmib7', 'cmmib5'), 'cmbsy10': ('cmbsy7', 'cmbsy5')}
# KaTeX file -> its face in MAP: the faces scripts use most. \mathit, \boldsymbol, \mathbb and bold \mathcal in a
# script keep KaTeX's 10pt faces (katex-scripts.css), which keeps the label glyph tables (label-glyphs.ts) small.
FACES = {'Main-Regular': 'Main-Regular', 'Main-Bold': 'Main-Bold', 'Math-Italic': 'Math-Italic', 'Caligraphic-Regular': 'Caligraphic-Regular'}

COPYRIGHT = ('Copyright (c) 2009-2010, Design Science, Inc. Copyright (c) 2014-2018 Khan Academy. '
             'Copyright (c) 1997, 2009, American Mathematical Society. Modified by DiagramTeX.')

types1 = {}
def type1(name):
    if name not in types1:
        path = subprocess.check_output(['kpsewhich', name + '.pfb']).decode().strip()
        font = T1Font(path); font.parse()
        types1[name] = (font.font['Encoding'], font.getGlyphSet())
    return types1[name]

def slots(entries):
    for e in entries:
        first, last, code = (e[0], e[0], e[1]) if len(e) == 2 else e
        for k in range(last - first + 1): yield first + k, code + k

def outline(glyphs, name, width=None):
    # Type 1 and CFF outlines are the same cubic curves; KaTeX's TrueType quadratics are raised to cubics exactly
    pen = T2CharStringPen(width, glyphs)
    glyphs[name].draw(pen)
    bounds = BoundsPen(glyphs); glyphs[name].draw(bounds)
    return pen.getCharString(), glyphs[name].width if width is None else width, bounds.bounds

def make(file, size):
    base = TTFont(os.path.join(FONTS, 'KaTeX_%s.woff2' % file))
    cmap, hmtx, own = base.getBestCmap(), base['hmtx'], base.getGlyphSet()
    order, replaced, skipped = base.getGlyphOrder(), {}, []
    for tex, entries in MAP[FACES[file]].items():
        small = SIZES[tex][0 if size == 7 else 1]
        enc10, glyphs10 = type1(tex); enc, glyphs = type1(small)
        for slot, code in slots(entries):
            name = cmap.get(code)
            if not name or name in replaced or enc[slot] == '.notdef': continue
            # the KaTeX glyph must be that 10pt slot (same advance), or it is KaTeX's own and stays
            if abs(outline(glyphs10, enc10[slot])[1] - hmtx[name][0]) > 1.5: skipped.append('%s U+%04X' % (tex, code)); continue
            replaced[name] = (glyphs, enc[slot])
    # (a name of its own: KaTeX's and the AMS fonts' names are Reserved Font Names under the SIL OFL)
    family, style = 'TDScript_%s%d' % (file.split('-')[0], size), file.split('-')[1]
    charstrings, metrics = {}, {}
    for name in order:
        glyphs, source = replaced.get(name, (own, name))
        if name in replaced:
            glyphs[source].draw(BoundsPen(glyphs))  # reads the Type 1 width
        charstring, width, bounds = outline(glyphs, source, None if name in replaced else hmtx[name][0])
        charstrings[name], metrics[name] = charstring, (round(width), round(bounds[0]) if bounds else 0)
    fb = FontBuilder(base['head'].unitsPerEm, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(family + '-' + style, {'FullName': family + ' ' + style, 'FamilyName': family}, charstrings, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=base['hhea'].ascent, descent=base['hhea'].descent, lineGap=base['hhea'].lineGap)
    fb.setupNameTable({'copyright': COPYRIGHT, 'familyName': family, 'styleName': style, 'licenseDescription': 'SIL Open Font License, Version 1.1'})
    fb.setupOS2()
    fb.font['OS/2'] = base['OS/2']  # the same line metrics as KaTeX's face, so a line's box is unchanged
    fb.setupPost()
    fb.font.flavor = 'woff2'
    out = os.path.join(FONTS, '%s-%s.woff2' % (family, style))
    fb.save(out)
    print('%s: %d glyphs from the %spt fonts%s' % (os.path.basename(out), len(replaced), size, ('; kept ' + ', '.join(skipped)) if skipped else ''))

for file in FACES:
    for size in (7, 5):
        make(file, size)
