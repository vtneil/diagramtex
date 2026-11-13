import { runtime as TD } from '../runtime';
// circuitikz parts: wires and connection nodes. See czcore.ts for units and the drawing API.
(function () {
  const P = TD.CZ.part;
  const RLEN = 1.4; // bipoles/length (cm)
  const NODE_R = 0.04 * RLEN; // nodes width × Rlen

  P({ key: 'short', name: 'Wire', cat: 'wires', kind: 'bipole', tikz: 'short', w: 0, keywords: 'short line connection', draw() {} });
  P({ key: 'ocirc', name: 'End node', cat: 'wires', kind: 'node', tikz: 'ocirc', keywords: 'open terminal pole',
    pins: { center: [0, 0] }, draw: (g: any) => g.circle(0, 0, NODE_R).paper() });
  P({ key: 'circ', name: 'Junction node', cat: 'wires', kind: 'node', tikz: 'circ', keywords: 'dot connection pole',
    pins: { center: [0, 0] }, draw: (g: any) => g.circle(0, 0, NODE_R).ink() });
})();
