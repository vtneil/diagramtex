# Roadmap

## Milestone: science blocks

Blocks in the same class as Circuit and Quantum: the LaTeX source is the object, drawn on the canvas,
exported unchanged, with a visual editor that writes the code both ways.

- [x] **Tree** (`forest`): hierarchical diagrams and trees (syntax trees, org charts, directory trees).
- [x] **ZX** (`zx-calculus`): ZX-calculus diagrams (spiders, phases, wires, Hadamard edges).
- [x] **CD** (`tikz-cd`): move XyMatrix into a CD block like the others: the `tikz-cd` source is the object,
      with a visual editor (cells, arrows, labels, styles, bends) that writes the code both ways. Existing
      XyMatrix shapes open as CD blocks.
- [x] **Chemistry** (`chemfig`): structural formulas and reaction schemes. Atoms, single, double, triple
      and aromatic bonds, rings, functional groups as reusable pieces, stereochemistry (wedge and hashed
      bonds), charges and lone pairs, and reaction schemes with arrows and conditions (`\schemestart`).
- [x] **Timing diagram** (`tikz-timing`): digital waveforms for clocks, signals, buses and states, one row
      per signal. Transitions drag along the time axis; high, low, high-impedance, unknown and bus values
      with labels; timing annotations (setup, hold, delays) between edges. Exports a `tikztimingtable`.
- [x] **State machine** (TikZ `automata` library): states, labelled transitions, self-loops, initial and
      accepting states. An automatic layout places the states on request, and moving a state keeps its
      transitions attached.
- [x] **Karnaugh map** (`karnaugh-map`): maps of 2 to 6 variables with Gray-code row and column order.
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

## Milestone: structure diagrams

Diagrams whose meaning is their structure: which legs are joined, which strand passes over, which bits a
field covers. Shapes and arrows can draw them once but can't keep them right while they change. Each is a
block like those above (the source is the object, drawn on the canvas, exported, and written both ways by a
visual editor in the shared block-editor shell), backed by a model of its structure that every edit keeps
valid. The packages named are references for the output, not constraints on how it is built.

- [ ] **Tensor network** (TikZ, after `tikz-tensor-networks`): tensors with named, index-labelled legs; a
      contraction joins one leg to another, so moving a tensor carries its bonds, and unjoined legs are the
      open indices. Generators for MPS, MPO and PEPS of a given length or grid, bond-dimension labels, and an
      automatic layout (chain, grid, tree) that keeps legs from crossing. Contract or split a bond, and list
      the network's open indices; legs keep their order when a tensor is rotated or mirrored.
- [ ] **String diagram** (TikZ, after `string-diagrams`): morphisms as boxes with typed input and output
      wires. Composition stacks diagrams, tensor product sets them side by side, and wires join only where
      their types match. Cups, caps, swaps and identities come from the palette. Boxes slide along their
      wires and the layout follows without changing the topology, so the picture stays the same morphism.
      Builds on the ZX editor's wire routing.
- [ ] **Braid and knot** (TikZ, after `braids`): braids on n strands as words in σᵢ and σᵢ⁻¹, typed as a
      word or built by clicking between strands, with the drawing and the word kept in step. A click flips a
      crossing over or under; strands take colours and labels; closing a braid gives a knot or link diagram.
      Moves keep the topology (the braid relations are offered as moves), and the only edit that changes it
      is an explicit crossing change.
- [x] **Bitfield** (`bytefield`): protocol headers and register layouts in rows of a fixed bit width (8, 16,
      32 or 64). Each field has a name and a width in bits; dragging a boundary resizes it and the fields after
      it reflow across rows, splitting and rejoining fields that span a row end. Bit numbers (either order),
      byte offsets and a bit ruler are generated, variable-length and elided fields are drawn as such, and a
      row that doesn't add up to the width or a field without a positive width is flagged. Builds on the
      timing editor's rows and edge dragging.
