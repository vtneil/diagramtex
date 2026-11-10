# Roadmap

## Milestone: science blocks

Blocks in the same class as Circuit and Quantum: the LaTeX source is the object, drawn on the canvas,
exported unchanged, with a visual editor that writes the code both ways.

- [x] **Tree** (`forest`): hierarchical diagrams and trees (syntax trees, org charts, directory trees).
- [x] **ZX** (`zx-calculus`): ZX-calculus diagrams (spiders, phases, wires, Hadamard edges).
- [x] **CD** (`tikz-cd`): move XyMatrix into a CD block like the others: the `tikz-cd` source is the object,
      with a visual editor (cells, arrows, labels, styles, bends) that writes the code both ways. Existing
      XyMatrix shapes open as CD blocks.
- [ ] **Chemistry** (`chemfig`): structural formulas and reaction schemes. Atoms, single, double, triple
      and aromatic bonds, rings, functional groups as reusable pieces, stereochemistry (wedge and hashed
      bonds), charges and lone pairs, and reaction schemes with arrows and conditions (`\schemestart`).
- [ ] **Timing diagram** (`tikz-timing`): digital waveforms for clocks, signals, buses and states, one row
      per signal. Transitions drag along the time axis; high, low, high-impedance, unknown and bus values
      with labels; timing annotations (setup, hold, delays) between edges. Exports a `tikztimingtable`.
- [ ] **State machine** (TikZ `automata` library): states, labelled transitions, self-loops, initial and
      accepting states. An automatic layout places the states on request, and moving a state keeps its
      transitions attached.
- [ ] **Karnaugh map** (`karnaugh-map`): maps of 2 to 6 variables with Gray-code row and column order.
      Cells are edited by clicking through 0, 1 and don't-care; implicant groups are drawn and dragged
      over the cells (wrapping round the edges) and can be checked against the truth values.
- [x] **Feynman Diagram** (`tikz-feynman`): vertices, propagators (fermion, photon, gluon, scalar), momentum labels.
- [x] **Bloch sphere** (`blochsphere`): a configurable Bloch sphere (state vectors, axes, labels, view angle).
- [x] **Physics library**: common mechanics and optics objects (blocks, inclines, pulleys, pendulums,
      lenses, mirrors, prisms, rays, screens) in the shape library.

## Milestone: 3D geometry

- [x] **3D geometry** (`tikz-3dplot`): coordinate systems, points, vectors, planes, solids, angles
      (including the polar and azimuthal angles of a vector), projections onto axes and planes, and
      transformations (rotated frames with `\tdplotsetrotatedcoords`). Built on the shared 3D engine of
      the 3D figures: the view turns on the canvas, with the main view angles exported as
      `\tdplotsetmaincoords`.
