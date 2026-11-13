import { runtime as TD } from '../../runtime';

TD.panels = TD.panels || {};
TD.panels.image = {
    model: s => ({ file: TD.TYPES.image.fileName(s) }),
    apply(s, t) { if (t.dataset.img === 'file') s.file = t.value.trim(); },
  };
