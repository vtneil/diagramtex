# The Physics block: models, assumptions and limitations

The Physics block draws a physics figure from a short source and works out the physics as it goes: it traces
rays, follows field lines, transforms events between frames, places energy levels and solves the forces on
blocks and linkages. The figure is exported as plain TikZ (only `arrows.meta` is needed). The same scene
draws the preview and writes the TikZ, so the two agree.

This page lists what each domain computes, the model behind each result, what it assumes and what it leaves
out. The block's code is in `public/js/physics.js` (source model, units, scene, export) and one file per domain
(`public/js/phys-*.js`). Its editor is `public/js/phyeditor.js`. The tests are in `tests/suites/78-physics.js`.

## The source

```latex
\physics{optics}
\setup[lambda=633nm, unit=1cm]
% a converging lens and an object 3 cm in front of it
\axis
\object[h=1, label=$O$](-3)
\lens[f=2, label=$L$](0)
\draw[dashed] (0,-1.5) -- (0,1.5);
```

- The first line, `\physics{domain}`, picks the domain: `optics`, `fields`, `waves`, `spacetime`, `levels` or
  `mechanics`. One block holds one domain.
- Every other line is one object: a command, its options in `[key=value, …]` and its position(s) in
  `(x, y)`, or the name(s) of the objects it refers to in `(name)`.
- **Round trips:** comments, blank lines, lines the block does not know (plain TikZ included) and options
  it does not know are all kept as written. The editor lists unknown options under **Kept as written**.
  Editing an object rewrites only the option or position that changed.
- **Units:** a value can carry its unit: `500nm`, `30deg`, `0.5rad`, `2kg`, `5nC`, `3A`, `1.2eV`, `20N/m`,
  `9.8m/s^2`, `10km/h`. A plain number is in the unit shown next to the field in the editor. A unit from the
  wrong family (`f=2kg`) is a warning, and the default is used.
- **Coordinates:** positions are in centimetres of the drawing, x to the right and y up. A `\setup[unit=…]`
  says how long 1 cm of the drawing is physically, where that matters (optical path lengths, fields,
  springs). Spacetime diagrams use (x, ct) in one unit, so light runs at 45°.
- **Not LaTeX:** this is DiagramTeX's own syntax. It does not compile with LaTeX; the block's export (or
  **Copy TikZ Code**) turns it into plain TikZ.
- **Drawn shapes:** a line `\shape{…}` holds one shape from the main editor as JSON, in px of the
  figure (1 cm = 40 px, y down), drawn and exported by the main editor's own code in a scope of its own.
  Blocks, plots, images and groups are refused with a warning.
- **Angles** are in degrees, counter-clockwise from +x, unless the field says otherwise.

## Result kinds

Every computed value is labelled with how far to trust it:

| Kind | Meaning |
| --- | --- |
| **exact** | Follows exactly from the model as stated (Coulomb's law, the Lorentz transform, loop closure). |
| **ideal** | Exact within a named idealisation (thin lenses, massless strings, Coulomb friction, no air drag). The note says which. |
| **approx** | An approximation (small angles, the Bohr model, sampled maxima). The note says what is neglected. |
| **schematic** | Drawn to show the idea, not computed to scale (field-line density, slit drawings). |

The kind shows as a tag beside each result in the editor; hover a result for its note.

## Optics

**Objects:** optical axis, object, ray, parallel beam, point source, laser, thin lens, mirror (flat or curved),
beam splitter, interface between two media, prism, glass slab, polariser, phase plate, screen and detector.

**Models**

- **Ray tracing:** each ray is traced segment by segment through every element it meets, up to a fixed
  number of bounces. At an interface or a prism face, Snell's law `n₁ sin θ₁ = n₂ sin θ₂` (exact). Beyond the
  critical angle `θc = arcsin(n₂/n₁)` the ray is totally internally reflected (exact).
- **Lenses and curved mirrors** are thin and paraxial: a ray is bent so that it passes through the focal
  point that the thin-lens equation `1/v − 1/u = 1/f` gives (ideal). The object's image position, height and
  magnification (ideal) come from the same equation; a lens system is solved element by element.
- **Principal rays** are drawn from the tip of the object to the first lens or mirror on the axis to its right.
  A virtual image is drawn dashed.
- **Prism:** the minimum deviation `δmin = 2 arcsin(n sin(A/2)) − A` (exact for the given n).
- **Polarisers:** Malus's law, `I = I₀ cos² Δθ`; unpolarised light loses half its intensity at the first
  polariser (ideal).
- **Interference at a detector:** the optical path length of each beam is summed along its rays (with
  `n` inside media and the drawing unit converting centimetres to metres). With two coherent beams,
  `I = I₁ + I₂ + 2√(I₁I₂) cos Δφ`, with Δφ from the path difference and any phase plates (ideal). The phase is
  reported in (−180°, 180°].

**Assumptions and limits:** one wavelength; no dispersion (n is the same for every colour); no partial
(Fresnel) reflection at interfaces; no phase shift on reflection; thin lenses only (no thickness, no
aberrations); ideal 50:50 beam splitters and perfect polarisers. When more than two beams reach one detector,
only the first two are added, with a warning.

## Electric and magnetic fields

**Objects:** point charges, wires through the page (current in or out), one uniform field, electric field
lines, equipotentials, magnetic field lines, field probes and the plotting region.

**Models**

- **E and V:** Coulomb's law superposed over the point charges in vacuum, plus the uniform field (exact).
  `V = Σ kq/r`, zero at infinity.
- **B:** the field of infinitely long straight wires, `B = μ₀I/(2πr)`, superposed (exact). Magnetic field lines
  are level curves of `A_z = −(μ₀/2π) Σ I ln r`, so they close on themselves.
- **Field lines** follow E exactly (fourth-order Runge–Kutta), but how many leave each charge (in proportion
  to |q|) and where they start is a drawing choice, so the line pattern is **schematic**: line density is not
  a measured field strength.
- **Equipotentials** are traced as contours of V on a grid at the levels you give (in volts) or chosen
  evenly; a level that does not cross the region is reported.
- **Null points**, where E = 0, are found numerically (Newton's method from several starting points) and
  reported with their position (exact to the solver's tolerance).
- **Probe:** E (magnitude, direction) and V at a point, or B for wires (exact).

**Assumptions and limits:** electrostatics and magnetostatics in vacuum; point charges and infinitely long thin
wires only; no dielectrics, conductors, induced charges or image charges; no magnetic dipoles or solenoids;
no time dependence. A probe on top of a charge or wire, where the field is infinite, is refused with a warning.

## Waves

**Objects:** two coherent sources, slits and a screen (single slit, double slit, grating), travelling waves,
the sum of the waves (superposition), standing waves on strings and in pipes.

**Models**

- **Two sources:** the antinodal and nodal lines are the hyperbolas `|r₁ − r₂| = mλ` and `(m + ½)λ` (exact),
  with the far-field directions `sin θ = mλ/d` (exact) and the number of antinodal lines.
- **Slits:** the Fraunhofer intensity, the single-slit envelope `sinc²(πa sin θ/λ)` times the N-slit factor
  (approx: the far field). The fringe spacing `λL/d` and the first envelope minimum `λL/a` use small angles
  (approx). Missing orders, where a grating maximum meets an envelope zero, are listed (ideal). If the Fresnel
  number `a²/(λL)` is above 1 the screen is not in the far field, and a warning says so. The slit drawing is
  **schematic** (not to scale with L).
- **Superposition:** the displacements add point by point; the largest displacement of the sum is sampled
  (40 samples per cm, approx).
- **Beats** follow from adding waves of nearby wavelength.
- **Standing waves:** on a string fixed at both ends, or in a pipe open or closed at each end; the harmonic
  number, wavelength and the positions of the nodes and antinodes (ideal: no damping, no end correction).

**Assumptions and limits:** linear superposition; scalar waves; monochromatic, equal-amplitude sources unless
you set amplitudes; no near-field (Fresnel) diffraction; no end correction in pipes; no dispersion.

## Minkowski spacetime

**Objects:** axes, moving frames (by β = v/c), events (in any frame), world lines (by β, or between two
events), light cones, lines of simultaneity, intervals between two events, invariant hyperbolas.

**Models (all exact, special relativity in one space dimension, c = 1 in the drawing):**

- A moving frame's axes are drawn at `ct' = 0` and `x' = 0`, tilted towards the light line by `atan β`, with
  tick marks spaced by the invariant hyperbolas, so one unit in S′ is drawn at its true place.
- An event given in a frame is transformed with the Lorentz transformation, γ = 1/√(1 − β²).
- The interval `s² = (cΔt)² − Δx²` classes the separation as timelike, lightlike or spacelike, and gives the
  proper time (timelike) or proper distance (spacelike).
- The twin-paradox example adds the proper time along each leg of a broken world line.

**Assumptions and limits:** one space dimension; inertial frames only (a broken world line is a sequence of
inertial legs, with instantaneous turns); |β| < 1 (β = 1 or above is refused); no acceleration, no general
relativity.

## Energy levels

**Objects:** the scale, levels (by energy, with a name and label), hydrogen-like levels (by Z, up to n), transitions
(absorption or emission, allowed or forbidden), and a line spectrum.

**Models**

- **Levels** are placed to scale at their energy; crowded labels near a series limit are spread and joined to
  their level by short leaders.
- **Hydrogen-like levels:** the Bohr model, `E_n = −13.6 eV · Z²/n²` (approx: infinitely heavy nucleus; no
  fine structure, Lamb shift or reduced-mass correction, about 0.05 % for hydrogen), and the ionisation energy.
- **Transitions:** the photon's energy ΔE and wavelength `λ = hc/ΔE` (exact for the given levels); the arrow
  points up for absorption and down for emission. A transition marked forbidden is drawn dashed.
- **Spectrum:** the lines that fall in the chosen range, at their wavelength (exact); the background colours are
  approximate.

**Assumptions and limits:** no selection rules are enforced (you mark a line forbidden); no fine or hyperfine
structure, Zeeman or Stark splitting; no line widths or intensities.

## Mechanics, kinematics and linkages

**Objects:** settings (g, force scale, drawing unit), ground, incline, block, applied force, Atwood machine,
spring, pendulum, projectile, four-bar linkage and slider–crank.

**Models**

- **Block on a surface:** the forces on a rigid block starting at rest: weight, the normal force, Coulomb friction
  (`|f| ≤ μs N` at rest, `μk N` when sliding) and applied forces. The block is reported at rest, sliding (and
  which way) or leaving the surface; acceleration, N and f follow (ideal). The critical angle `tan θ = μs`
  (ideal). Force arrows share one scale (exact), shown as a result.
- **Atwood machine:** `a = (m₂ − m₁)g/(m₁ + m₂)`, `T = 2m₁m₂g/(m₁ + m₂)` (ideal: massless, frictionless
  pulley and inextensible, massless string).
- **Spring:** Hooke's law, force `kx` and stored energy `½kx²` (ideal: linear and massless).
- **Pendulum:** the small-angle period `T₀ = 2π√(L/g)` (approx), the exact period at the given amplitude from
  the arithmetic–geometric mean (ideal: a point mass on a massless rod, no friction) and the speed at the bottom
  from energy conservation (ideal).
- **Projectile:** range, greatest height and time of flight (ideal: uniform g, no air drag, launched from
  and landing at the same height); the path is drawn to scale.
- **Four-bar linkage:** the coupler and rocker angles from loop closure (exact; B is where the circles about A
  and O₄ meet), the Grashof class, the transmission angle μ, and a warning where the linkage cannot close at
  the input angle.
- **Slider–crank:** the slider position `x = r cos θ + √(l² − (e − r sin θ)²)`, the rod angle and the stroke
  between the two dead centres (exact), with an offset e.

**Assumptions and limits:** rigid bodies and point masses; one block per incline; no rolling, no rotation of
bodies about their centre, no drag or damping; linkage results are positions only (no velocities, accelerations
or forces).

## How it is tested

`tests/suites/78-physics.js` checks the physics against analytic solutions, limits and degenerate input, and
the block as a whole:

- **Source model:** round trips of every example, unknown lines and options kept, units, empty and unknown
  domains.
- **Optics:** the thin-lens equation over several object distances and focal lengths, objects at the focus
  (image at infinity) and f = 0 refused, the concave mirror, an afocal telescope, Snell and total internal
  reflection, the prism's minimum deviation, Malus's law, Michelson and Mach–Zehnder (a λ/8 mirror shift gives a
  path difference of 0.25 λ and I = 0.5).
- **Fields:** Coulomb E and V at a point, the dipole, the null point of unequal charges (x = 2 for +4q and −q a
  unit apart), a wire's B, antiparallel wires, and degenerate inputs.
- **Waves:** two sources, slits and gratings, standing waves, beats.
- **Spacetime:** the Lorentz transform and the invariance of the interval for four values of β, the twin
  paradox, spacelike and lightlike separations, β = 1 refused.
- **Levels:** hydrogen, absorption against emission, forbidden lines, missing levels.
- **Mechanics:** the incline, the Atwood machine, the pendulum's exact period, projectile and spring, the four
  Grashof classes and loop closure, the slider–crank.
- **Export:** deterministic TikZ, no NaN, every example compiles with LaTeX, and two golden files.
- **Editor:** dragging a handle writes only its own option; Tab selection, field edits, nudging, duplicate,
  delete, undo and redo, placing from the palette, switching domain (undoable) and Done, plus the shared
  editor lifecycle (history, ⌘S save, cancel and reopen).

## Left out

These were considered and are not in this version. Each would be a change of model, not just a new option.

| Domain | Left out | Why, or what it would need |
| --- | --- | --- |
| Optics | Dispersion (n varying with λ) and white-light prisms | Needs several wavelengths per ray and a colour per ray. |
| Optics | Fresnel partial reflection, phase shift on reflection | Needs amplitude tracking along each ray; the detector already sums phases, so this would slot in there. |
| Optics | Thick lenses, aberrations, apertures and stops | The thin-lens model bends rays at one plane; a thick lens needs two refracting surfaces and real ray tracing through them. |
| Optics | More than two beams at a detector | Only the first two are added (with a warning). A general coherent sum is straightforward but needs a clear way to show it. |
| Fields | Magnetic dipoles, solenoids, loops, dielectrics, conductors, image charges | Needs other source kinds or boundary conditions; the field-line tracer would work unchanged. |
| Fields | Field-line density proportional to field strength | Field lines are schematic by design; a quantitative density needs flux-based seeding in 3D. |
| Waves | Near-field (Fresnel) diffraction, 2D wave fronts drawn as ripples, Doppler effect | The block warns when the far-field assumption fails. |
| Waves | End correction in pipes, damped or driven waves | Small corrections; would be extra options with their own result kind. |
| Spacetime | Accelerated observers (Rindler), 2+1 light cones, velocity addition panels | One space dimension and inertial frames only. |
| Levels | Fine and hyperfine structure, Zeeman and Stark splitting, line widths and intensities, enforced selection rules | Beyond the Bohr model; transitions are marked forbidden by hand. |
| Mechanics | Modified Atwood machine (a block on a table and a hanging mass), pulleys with mass, rolling bodies | Each is a new machine with its own equations. |
| Mechanics | Drag, damping, time animation, velocity and acceleration of linkages | Results are static; a time axis would need playback controls in the editor. |
| Import | Rebuilding a Physics block from TikZ that was imported back | The export is plain TikZ; the block's source is not embedded in it, so an imported figure stays plain TikZ. |
