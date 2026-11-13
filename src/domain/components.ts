import { runtime as TD } from '../runtime';
// Components: a group saved as a reusable part. Each instance is one object of type 'comp' that carries the
// part's shapes (s.def, placed round the instance's origin) and the id of the part it belongs to (s.ref). Copies
// of an instance are linked: they share ref, and saving an edited copy rewrites the shapes of every instance
// with that ref (app.ts). Carrying the shapes on each instance keeps undo, copy and paste, other files and the
// export working without a separate store.
//   s = { type: 'comp', x, y (origin, px), ref, cname, def: [shapes] }
// The export defines each part once as a TikZ pic, \tikzset{name/.pic={…}}, and draws each instance with
// \pic at (x,y) {name};
(function () {
  const { r2 } = TD.util;
  const T = TD.TYPES;

  const parts = (s: any) => (Array.isArray(s.def) ? s.def.filter((p: any) => p && T[p.type] && !p.hidden) : []);
  const moved = (s: any, P: any) => P.map((p: any) => ({ x: p.x + s.x, y: p.y + s.y }));
  // a TikZ-safe pic name: letters, digits, spaces and dashes
  const picBase = (n: any) => String(n || '').replace(/[^A-Za-z0-9 -]+/g, '').trim() || 'part';
  // the shapes of a part, as plain objects anywhere: placed at the instance (for Edit and Detach)
  function placed(s: any) {
    return JSON.parse(JSON.stringify(parts(s))).map((p: any) => { TD.translate(p, s.x, s.y); return p; });
  }
  // a part made from shapes: placed round (ox, oy), without what tied them to the diagram around them
  function defOf(list: any, ox: any, oy: any) {
    const ids = new Set(list.map((s: any) => s.id));
    return JSON.parse(JSON.stringify(list)).map((p: any) => {
      for (const k of ['tex', 'g', 'gname', 'ex', '_ev', 'pos', 'tkStyle', 'refs', 'cpart', 'locked', '_pr']) delete p[k];
      for (const L of ['link1', 'link2']) if (p[L] && !ids.has(p[L].id)) delete p[L];
      TD.translate(p, -ox, -oy);
      return p;
    });
  }

  T.comp = {
    name: 'Component',
    pts: [['x', 'y']],
    create: (p: any) => ({ type: 'comp', x: p.x, y: p.y, ref: Math.random().toString(36).slice(2, 10), cname: 'part', def: [] }),
    valid: (s: any) => parts(s).length > 0,
    handles: () => [],
    anchors(s: any) { return parts(s).flatMap((p: any) => moved(s, T[p.type].anchors(p))); },
    samples(s: any) { const P = parts(s).flatMap((p: any) => moved(s, T[p.type].samples(p))); return P.length ? P : [{ x: s.x, y: s.y }]; },
    svg(s: any, ctx: any) {
      const inner = parts(s).map((p: any) => T[p.type].svg(p, ctx)).join('');
      const g = `<g transform="translate(${r2(s.x)} ${r2(s.y)})">${inner}</g>`;
      if (ctx && ctx.export) return g;
      const b = TD.bbox(s);
      return `<g class="comp">${g}<rect class="hitfill" x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}"/></g>`;
    },
    translate(s: any, dx: any, dy: any) { s.x += dx; s.y += dy; },
    tikz(s: any, X: any) {
      const P = parts(s);
      if (!P.length) return '';
      // one definition per part (and per version of it, should two copies differ), named after the part
      X.decls = X.decls || new Map();
      const body = JSON.stringify(P);
      const key = 'pic:' + s.ref + ':' + body.length + ':' + TD.texSig({ def: P });
      if (!X.decls.has(key)) {
        const taken = new Set([...X.decls.values()].map((d) => d.name));
        let name = picBase(s.cname);
        for (let k = 2; taken.has(name); k++) name = picBase(s.cname) + '-' + k;
        X.decls.set(key, { name, decl: '' }); // named first: a part inside itself is not possible, but a part inside another is
        const refs = X.refs; X.refs = null;
        let lines;
        try { lines = TD.tikzLines(P, X); } finally { X.refs = refs; }
        // set again so it comes after the parts it uses
        X.decls.delete(key);
        X.decls.set(key, { name, decl: `\\tikzset{${name}/.pic={\n  ${lines.join('\n').replace(/\n/g, '\n  ')}\n}}` });
      }
      return `\\pic at ${X.c(s.x, s.y)} {${X.decls.get(key).name}};`;
    },
  };
  TD.comp = { parts, placed, defOf, picBase };
})();
