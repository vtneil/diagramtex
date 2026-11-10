# Roadmap

## Milestone: science blocks

Blocks in the same class as Circuit and Quantum: the LaTeX source is the object, drawn on the canvas,
exported unchanged, with a visual editor that writes the code both ways.

- [x] **Tree** (`forest`): hierarchical diagrams and trees (syntax trees, org charts, directory trees).
- [x] **ZX** (`zx-calculus`): ZX-calculus diagrams (spiders, phases, wires, Hadamard edges).
- [x] **CD** (`tikz-cd`): move XyMatrix into a CD block like the others: the `tikz-cd` source is the object,
      with a visual editor (cells, arrows, labels, styles, bends) that writes the code both ways. Existing
      XyMatrix shapes open as CD blocks.
- [ ] **Chemistry** (`chemfig`): structural formulas and reaction schemes.
- [ ] **Feynman Diagram** (`tikz-feynman`): vertices, propagators (fermion, photon, gluon, scalar), momentum labels.
- [x] **Bloch sphere** (`blochsphere`): a configurable Bloch sphere (state vectors, axes, labels, view angle).
- [ ] **Physics library**: common mechanics and optics objects (blocks, inclines, pulleys, pendulums,
      lenses, mirrors, prisms, rays, screens) in the shape library.
