import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/bloch.ts';
const { layout, colorsOf, r2, lengthPt, UNITS, num, states, setEnvKey, setColor, stateCode, cut, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.bloch = {
    model(s) {
      const L = layout(s), o = L.opts, C = colorsOf(s.src);
      return {
        src: s.src,
        radius: r2(lengthPt(o.radius) / UNITS.cm), tilt: num(o.tilt), rotation: num(o.rotation),
        ball: ['3d', 'circle'].includes(o.ball) ? o.ball : 'none',
        colours: [['ball', 'Ball'], ['lines', 'Lines'], ['states', 'States'], ['labels', 'Labels']]
          .map(([key, name]) => ({ key, name, value: C[key], label: TD.texColor.label(C[key]), swatch: TD.texColor.swatch(C[key]) })),
        states: states(s.src).map((x: any) => ({ name: x.name, label: x.label ? x.label.math : '', theta: x.theta, phi: x.phi })),
        warnings: L.warnings,
      };
    },
    apply(s: any, t: any) {
      if (t.dataset.p === 'src') { s.src = t.value; return false; }
      if (t.dataset.bk || t.dataset.bkn) {
        const k = t.dataset.bk || t.dataset.bkn, v = parseFloat(t.value);
        if (!isFinite(v)) return false;
        s.src = setEnvKey(s.src, k, k === 'radius' ? `${r2(v)}cm` : String(v));
        return true;
      }
      if (t.dataset.bc) { s.src = setColor(s.src, t.dataset.bc, t.value); return true; }
      if (t.dataset.st) {
        const [i, which] = t.dataset.st.split(':'), S = states(s.src)[+i];
        if (!S || !isFinite(parseFloat(t.value))) return false;
        // written back as polar angles, θ then φ
        const v = String(parseFloat(t.value));
        const N = { ...S, kind: 'Polar' as const, a: which === 't' ? v : S.theta, b: which === 'p' ? v : S.phi };
        s.src = s.src.slice(0, S.at) + stateCode(N) + s.src.slice(S.end);
        return true;
      }
      if (t.dataset.sl != null) {
        const S = states(s.src)[+t.dataset.sl], raw = t.value.trim(), m = /^\$([\s\S]*)\$$/.exec(raw) || /^\\\(([\s\S]*)\\\)$/.exec(raw), v = (m ? m[1] : raw).trim(), L = S && S.label;
        if (!S) return false;
        if (L && v) s.src = s.src.slice(0, L.bodyAt) + `$${v}$` + s.src.slice(L.bodyEnd);
        else if (L) s.src = cut(s.src, L.at, L.end);
        else if (v) s.src = s.src.slice(0, S.end) + `\n  \\node[above] at (${S.name}) {$${v}$};` + s.src.slice(S.end);
        return true;
      }
      return false;
    },
    action(s: any, act: any) {
      if (act.startsWith('ball:')) {
        const v = act.slice(5), c = String(layout(s).opts.color || 'white').trim();
        s.src = setEnvKey(s.src, 'ball', v === '3d' ? null : v);
        // the package draws the outline in the ball colour, white by default: invisible on paper, so it goes black;
        // and back to the default white for a shaded ball, which would otherwise shade black
        if (v === 'circle' && c === 'white') s.src = setEnvKey(s.src, 'color', 'black');
        if (v === '3d' && c === 'black') s.src = setEnvKey(s.src, 'color', null);
        return true;
      }
      if (act.startsWith('delstate:')) {
        const S = states(s.src)[+act.slice(9)];
        if (!S) return;
        // its label goes with it: the later one is cut first, so the earlier one's place still holds
        const L = S.label;
        if (L && L.at > S.at) s.src = cut(cut(s.src, L.at, L.end), S.at, S.end);
        else if (L) s.src = cut(cut(s.src, S.at, S.end), L.at, L.end);
        else s.src = cut(s.src, S.at, S.end);
        return true;
      }
      if (act === 'addstate') {
        const used = new Set(states(s.src).map((x: any) => x.name));
        let n = 1;
        while (used.has(`s${n}`)) n++;
        const line = `  \\drawStatePolar{s${n}}{60}{${(30 * n) % 360}}\n  \\node[above] at (s${n}) {$s_${n}$};\n`;
        const e = s.src.lastIndexOf('\\end{blochsphere}');
        s.src = e < 0 ? `${s.src}\n${line}` : s.src.slice(0, e) + line + s.src.slice(e);
        return true;
      }
      if (act !== 'copybloch') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('blochsphere Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied blochsphere code';
    },
  };
