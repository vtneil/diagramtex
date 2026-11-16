for (const type of ['rect', 'text', 'qc', 'cd', 'forest', 'chemfig']) {
  T.test(`Scale: ${type} exports a compilable scaled object`, () => {
    const s = { ...TD.TYPES[type].create({ x: 0, y: 0 }, TD.state.defaults), id: 'scaled-' + type, objectScale: 2 };
    if (type === 'rect') Object.assign(s, { w: 80, h: 40, radius: 4 });
    if (type === 'text') s.text = '$x^2$ scaled text';
    const tex = TD.toTikz([s], { standalone: true });
    T.ok(tex.includes('scale around={2:'), 'scaled scope exported');
    T.ok(!/NaN|Infinity/.test(tex), 'finite output');
    T.tex('object scale ' + type, tex);
  });
}
