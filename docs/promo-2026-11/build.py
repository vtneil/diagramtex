from pathlib import Path
import json,html
P=Path(__file__).parent
# name, description, primary capture, secondary capture, secondary label, notes
scenes=[('01-overview', 'WSYIWYG scientific figure editing with LaTeX output', '01-overview', None, '', ['TikZ / LaTeX output', 'Editable plots and diagrams', 'Maths inside labels']),
 ('02-quality-of-life',
  'Selection, alignment, snapping, command search and export',
  '02-precision',
  '02-command-search',
  'Search tools, shapes and commands',
  ['Align and distribute selections', 'Grid, object and guide snapping', 'PNG, SVG, PDF and web export']),
 ('03-table',
  'Table editing with grouped headers and merged cells',
  '03-table-preview',
  None,
  '',
  ['Paste from Excel or Sheets', 'Import CSV, XLSX, Markdown or LaTeX', 'Copy LaTeX, SVG or PNG']),
 ('04-table-formatting',
  'Table number formatting and LaTeX output',
  '04-table-code',
  '03-table-preview',
  'Typeset preview',
  ['siunitx number columns', 'Rounding and significant figures', 'Captions, labels and float settings']),
 ('05-circuits',
  'Circuit editing with circuitikz output',
  '05-circuit',
  None,
  '',
  ['Voltage and current annotations', 'Named component pins', 'Rotate, mirror and edit labels']),
 ('06-quantum',
  'Quantum circuits and ZX diagrams',
  '06-quantum',
  '06-zx',
  'ZX calculus',
  ['Teleportation with classical corrections', 'Wire and step spacing controls', 'Code updates beside the drawing']),
 ('07-chemistry',
  'Chemical structures and reaction schemes',
  '07-chemistry',
  None,
  '',
  ['Reusable submolecule definitions', 'Charged groups and reaction arrows', 'Editable chemfig and hreac source']),
 ('08-timing-and-states',
  'Timing diagrams and state machines',
  '08-timing',
  '08-state-machine',
  'State machine editor',
  ['Clocks, buses and high-impedance signals', 'Labelled timing intervals', 'Automatic state-machine layout']),
 ('09-digital-logic',
  'Karnaugh maps and protocol field layouts',
  '09-karnaugh',
  '09-bytefield',
  'IPv4 layout · bytefield',
  ['Karnaugh maps with 2–6 variables', 'Group checking and simplified functions', 'Resize, split and merge bit fields']),
 ('10-software-diagrams',
  'UML class and sequence diagrams',
  '10-uml',
  '10-sequence',
  'Nested calls · pgf-umlsd',
  ['Inheritance, aggregation and composition', 'Roles and multiplicities', 'Lifelines, calls and returns']),
 ('11-commutative-diagrams',
  'Commutative diagrams with tikz-cd and xymatrix',
  '11-cd',
  '11-xy',
  'The xymatrix editor',
  ['Drag between cells to connect objects', 'Bends, labels and arrow styles', 'Convert between both packages']),
 ('12-trees',
  'Tree diagrams with forest output',
  '12-forest',
  None,
  '',
  ['Start from built-in templates', 'Add and move nodes visually', 'Preserve source you did not edit']),
 ('13-geometry',
  '2D and 3D geometry editing',
  '13-geometry-3d',
  '13-geometry-2d',
  '2D geometry',
  ['Rotate a 3D view by dragging', 'Cartesian and spherical coordinates', 'Angles, projections and computed values']),
 ('14-scientific-toolbox',
  'Physics, optics and scientific diagrams',
  '14-gallery',
  '14-physics',
  'Computed mechanics',
  ['Mix specialized blocks on one canvas', '2D and 3D scientific figures', 'Edit physics parameters visually']),
 ('15-documents-and-quick',
  'Documents with figures and formula image export',
  '15-document',
  '15-quick',
  'Quick formula',
  ['Classic document and diagram views', 'LaTeX article export', 'Copy formula PNG or SVG'])]
# These are crops of real captures, not reconstructions of the app.
FULL=(0,0,1920,1080)
def crop(file,box,w,h):
 x,y,cw,ch=box
 scale=min(w/cw,h/ch)
 return f'<div class="crop" style="width:{w}px;height:{h}px"><img src="raw/{file}.png" style="width:{1920*scale}px;height:{1080*scale}px;left:{(w-cw*scale)/2-x*scale}px;top:{(h-ch*scale)/2-y*scale}px"></div>'
css='''*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{position:relative;background:#f2efe8;color:#24231f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}header{position:absolute;left:40px;right:40px;top:28px;display:flex;justify-content:space-between;align-items:center;font-size:17px;font-weight:600}.brand{display:flex;align-items:center;gap:10px}.mark{width:12px;height:12px;background:#e76c4c;border-radius:50%;box-shadow:8px 8px 0 #343779;margin-right:8px}.series{font-size:14px;letter-spacing:1.6px;color:#777367}h1{position:absolute;left:40px;top:100px;margin:0;font-size:34px;line-height:1.2;letter-spacing:-.5px;font-weight:600}.sub{position:absolute;left:42px;top:123px;margin:0;font-size:20px;color:#6c685f}.hero{position:absolute;left:40px;top:182px;border:1px solid #d5d0c6;border-radius:14px;overflow:hidden;background:#fffdf8;box-shadow:0 10px 35px #332b1710}.crop{position:relative;overflow:hidden;background:#fffdf8}.crop img{position:absolute;max-width:none}.aside{position:absolute;right:40px;top:182px;width:424px}.eyebrow{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#776f60;margin-bottom:14px;font-weight:650}.companion{border:1px solid #d5d0c6;border-radius:12px;overflow:hidden;background:#fffdf8}.label{padding:13px 16px;background:#fffdf8;font-size:17px;font-weight:600;border-bottom:1px solid #e1dcd2}.note{font-size:21px;line-height:1.4;padding:22px 0;border-bottom:1px solid #d8d2c7}.note:first-of-type{padding-top:0}.notes{margin-top:24px}.plain .aside{width:248px;top:235px}.plain .note{font-size:21px;padding:30px 0}.plain .eyebrow{line-height:1.7}.footer{position:absolute;left:42px;right:42px;bottom:20px;display:flex;justify-content:space-between;color:#817a6d;font-size:13px}.dark{background:#22211e;color:#eeeae2}.dark .sub,.dark .eyebrow,.dark .series,.dark .footer{color:#b3ada1}.dark .hero{border-color:#4b4841}.dark .note{border-color:#4b4841}'''
css+=''' .split-theme{background:linear-gradient(to right,#f2efe8 50%,#22211e 50%)}.split-theme .aside,.split-theme .series,.split-theme .footer span:last-child{color:#eeeae2}.split-theme .eyebrow{color:#b3ada1}.split-theme .note{border-color:#4b4841}.theme-pair{position:relative}.theme-dark{position:absolute;inset:0;clip-path:inset(0 0 0 61.1702128%)} '''
for idx,(name,title,main,second,label,notes) in enumerate(scenes,1):
 box=FULL
 if second:
  primary=crop(main,box,1384,778)
  b=(510,710,850,350) if second=='03-table-preview' else FULL
  companion=crop(second,b,422,310 if second=='03-table-preview' else 237.375)
  side=f'<div class="eyebrow">Also in DiagramTeX</div><div class="companion"><div class="label">{html.escape(label)}</div>{companion}</div><div class="notes">'+''.join(f'<div class="note">{html.escape(n)}</div>' for n in notes)+'</div>'
  cls=''
 else:
  primary=crop(main,box,1576,886)
  side='<div class="eyebrow">Features</div>'+''.join(f'<div class="note">{html.escape(n)}</div>' for n in notes)
  cls='plain'
 if main=='01-overview':cls+=' split-theme'
 body=f'''<!doctype html><html><meta charset="utf-8"><title>{html.escape(title)}</title><style>{css}</style><body class="{cls}"><header><div class="brand"><i class="mark"></i>DiagramTeX</div></header><h1>{html.escape(title)}</h1><div class="hero">{primary}</div><aside class="aside">{side}</aside><div class="footer"><span>diagramtex.com</span><span>{idx:02d} / 15 · Actual app captures</span></div></body></html>'''
 # all heroes fit within y=182..1030
 if not second:body=body.replace(primary,crop(main,box,1504,846))
 if main=='01-overview':
  # Both captures share the same viewport and camera. Reveal only the right half of the dark capture.
  light=crop(main,box,1504,846)
  dark=crop('01-overview-dark',box,1504,846)
  body=body.replace(light, '<div class="theme-pair">'+light+'<div class="theme-dark">'+dark+'</div></div>')
 (P/(name+'.html')).write_text(body)
(P/'manifest.json').write_text(json.dumps([{'file':s[0]+'.png','title':s[1],'features':s[5]} for s in scenes],indent=2))
links=''.join(f'<a href="{s[0]}.html"><img src="final/{s[0]}.png"><b>{html.escape(s[1])}</b></a>' for s in scenes)
(P/'index.html').write_text(f'<!doctype html><meta charset="utf-8"><title>DiagramTeX promotional screenshots</title><style>body{{font:16px system-ui;background:#f2efe8;padding:32px;color:#24231f}}main{{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}}a{{color:inherit;text-decoration:none}}img{{width:100%;border-radius:8px;border:1px solid #ccc}}b{{display:block;margin:8px 0 16px}}h1{{font-size:30px}}</style><h1>DiagramTeX · 15 promotional screenshots</h1><p>1920 × 1080 PNG · Actual app captures, consolidated by workflow. Click a card to open its editable composition.</p><main>{links}</main>')
print('Built 15 compositions')
