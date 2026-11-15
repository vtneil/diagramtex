"""Measure the real PDF baseline independently of browser/SVG metadata."""
import json
import sys
import pymupdf
page = pymupdf.open(sys.argv[1])[0]
spans = [s for b in page.get_text('dict')['blocks'] for line in b.get('lines', []) for s in line['spans']]
word = next(s for s in spans if s['text'] == 'unitary')
preceding = [s for s in spans if s['text'].strip() == 'A' and s['origin'][0] < word['origin'][0]]
a = max(preceding, key=lambda s: s['origin'][0])
em = word['size']
page.get_pixmap(matrix=pymupdf.Matrix(80 / em, 80 / em)).save(sys.argv[2])
permutes = [s for s in spans if s['text'] == 'permutes']
print(json.dumps({
    'unitaryBaselineDifferenceEm': (word['origin'][1] - a['origin'][1]) / em,
    'pageSizeEm': [page.rect.width / em, page.rect.height / em],
    'originXEm': min(s['origin'][0] for s in spans) / em,
    'baselinesEm': [s['origin'][1] / em for s in [word, *permutes]],
}))
