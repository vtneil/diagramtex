import { runtime as TD } from '../../runtime';
import type { ExampleTools } from '../example-diagrams';

// Hand-written adaptations in the editors' native syntax, rather than opaque raw-TikZ pictures.
export function advancedBlockExamples(g: ExampleTools) {
  const { add, text, arrow, example, blue, red } = g;
  const block = (type: string, src: string, props = {}) => add(type, type, { x: 60, y: 80, src, ...props });
  const R = String.raw;
  const note = (shape: any, value: string, offset = 40) => { const b = TD.bbox(shape); return text(b.x + b.w / 2, b.y + b.h + offset, value); };
  example('Loaded RLC ladder with voltage and current probes', 'A circuit-editor model contains a source, two series branches, shunt capacitors, a load and node markers. Double-click to edit components and electrical annotations.', () => {
    const src = R`\begin{circuitikz}[european resistors]
\draw (0,0) to[V,l=$V_s$] (0,3) to[R,l=$R_s$,i=$i_s$] (2.5,3) to[L,l=$L$] (5,3) to[R,l=$R_o$] (7.5,3);
\draw (2.5,3) to[C,l=$C_1$,*-*] (2.5,0);
\draw (5,3) to[C,l=$C_2$,*-*] (5,0);
\draw (7.5,3) to[R,l=$R_L$,v=$v_o$] (7.5,0) -- (0,0);
\end{circuitikz}`;
    const parsed = TD.cz.parse(src); add('cz', 'cz', { x: 55, y: 270, ...parsed });
    text(230, 350, 'Source impedance → resonant ladder → load', { size: 17 });
  });
  example('Quantum teleportation with classical corrections', 'Three wires include Bell-pair preparation, a Bell-basis measurement and classically controlled X/Z corrections. Every gate remains editable in the quantum circuit editor.', () => {
    const figure = block('qc', R`\begin{quantikz}[row sep=0.6cm,column sep=0.45cm]
\lstick{\ket{\psi}} & \qw & \qw & \ctrl{1} & \gate{H} & \meter{} \setwiretype{c} & \cw & \cwbend{2} & \cw \\
\lstick{\ket{0}} & \gate{H} & \ctrl{1} & \targ{} & \qw & \meter{} \setwiretype{c} & \cwbend{1} & \cw & \cw \\
\lstick{\ket{0}} & \qw & \targ{} & \qw & \qw & \qw & \gate{X} & \gate{Z} & \rstick{\ket{\psi}}\qw
\end{quantikz}`);
    note(figure, '$\\ket{\\psi}=\\alpha\\ket0+\\beta\\ket1$');
  });
  example('A commutative ladder of short exact sequences', 'The tikz-cd editor holds a three-row ladder with zero objects, named maps and commuting vertical squares. Change arrow styles, labels or the matrix in the block editor.', () => {
    const figure = block('cd', R`\begin{tikzcd}[row sep=large,column sep=large]
0 \arrow[r] & A_1 \arrow[r,"f_1"] \arrow[d,"a"] & B_1 \arrow[r,"g_1"] \arrow[d,"b"] & C_1 \arrow[r] \arrow[d,"c"] & 0 \\
0 \arrow[r] & A_2 \arrow[r,"f_2"] \arrow[d,"a'"] & B_2 \arrow[r,"g_2"] \arrow[d,"b'"] & C_2 \arrow[r] \arrow[d,"c'"] & 0 \\
0 \arrow[r] & A_3 \arrow[r,"f_3"] & B_3 \arrow[r,"g_3"] & C_3 \arrow[r] & 0
\end{tikzcd}`);
    note(figure, '$g_i f_i=0,\\qquad b f_1=f_2 a,\\qquad c g_1=g_2 b$');
  });
  example('XyMatrix: a natural transformation on a triangle', 'Two triangular diagrams are joined by the components of a natural transformation. XyMatrix labels, diagonal arrows and commuting squares remain native editor data.', () => {
    const figure = block('xy', R`\xymatrix@C=2.2pc@R=2.8pc{
F(A) \ar[rr]^{F(f)} \ar[dr]_{F(g)} \ar[ddd]_{\eta_A} && F(B) \ar[dl]^{F(h)} \ar[ddd]^{\eta_B} \\
& F(C) \ar[ddd]^{\eta_C} & \\
&& \\
G(A) \ar[rr]_{G(f)} \ar[dr]_{G(g)} && G(B) \ar[dl]^{G(h)} \\
& G(C) &
}`);
    note(figure, '$\\eta_B\\circ F(f)=G(f)\\circ\\eta_A$');
  });
  example('Decision tree with probabilities and terminal payoffs', 'A three-level forest tree has labelled branches, asymmetric growth and distinct terminal outcomes. The complete tree and its styles are editable in the forest editor.', () => {
    block('forest', R`\begin{forest}
for tree={draw,rounded corners,align=center,l sep=12mm,s sep=7mm,inner sep=4pt}
[Launch?,fill=blue!12
  [Pilot,edge label={node[midway,left]{0.4}}
    [Strong demand,fill=green!12
      [Expand\\$+120$,edge label={node[midway,left]{0.7}}]
      [Hold\\$+40$,edge label={node[midway,right]{0.3}}]]
    [Weak demand,fill=orange!15 [Exit\\$-20$] [Revise\\$+10$]]]
  [Full launch,edge label={node[midway,right]{0.6}}
    [Success\\$+180$,fill=green!12]
    [Break even\\$0$]
    [Failure\\$-100$,fill=red!12]]
]
\end{forest}`, { size: 'normalsize' });
  });
  example('ZX representation of a three-wire phase network', 'A multi-row ZX network contains Z and X spiders, non-zero phases, Hadamard edges and cross-wire connections. Double-click to edit the cells and edges.', () => {
    block('zx', R`\begin{ZX}[column sep=8mm,row sep=9mm]
\zxN{} \rar & \zxZ{\alpha} \rar \ar[d] & \zxH{} \rar & \zxZ{\pi/4} \rar & \zxX{} \rar \ar[d] & \zxN{} \\
\zxN{} \rar & \zxX{} \rar & \zxZ{\beta} \rar \ar[d] & \zxH{} \rar & \zxZ{} \rar & \zxN{} \\
\zxN{} \rar & \zxZ{\gamma} \rar & \zxX{} \rar & \zxZ{\pi/2} \rar & \zxH{} \rar & \zxN{}
\end{ZX}`);
  });
  example('One-loop four-photon box diagram', 'A closed fermion loop couples to four external photons. Propagator types, momentum arrows and vertex labels remain editable in the Feynman editor.', () => {
    block('feynman', R`\begin{feynman}
\vertex (a) at (1,1);
\vertex (b) at (4,1);
\vertex (c) at (4,-1.5);
\vertex (d) at (1,-1.5);
\vertex (i1) at (-1,2.5) {\(\gamma_1\)};
\vertex (i2) at (-1,-3) {\(\gamma_2\)};
\vertex (o1) at (6,2.5) {\(\gamma_3\)};
\vertex (o2) at (6,-3) {\(\gamma_4\)};
\diagram* {
(i1) -- [photon,momentum=\(p_1\)] (a),
(i2) -- [photon,momentum'=\(p_2\)] (d),
(a) -- [fermion,momentum=\(k\)] (b) -- [fermion] (c) -- [fermion] (d) -- [fermion] (a),
(b) -- [photon,momentum=\(p_3\)] (o1),
(c) -- [photon,momentum'=\(p_4\)] (o2)
};
\end{feynman}`);
  });
  example('Bloch sphere: state, azimuth and rotated state', 'Two state vectors, a latitude circle, a great circle, labelled axes and a rotation marker share a native Bloch-sphere block. Edit the camera and state angles in its editor.', () => {
    const figure = block('bloch', R`\begin{blochsphere}[radius=2.5cm,tilt=20,rotation=-35]
\drawBallGrid[style={opacity=0.18}]{30}{30}
\drawGreatCircle[style={blue,dashed}]{90}{0}
\drawLatitudeCircle[style={red}]{35}
\drawAxis[scale=1.25,axisarrow={->}]{0}{0}
\drawAxis[scale=1.25,axisarrow={->}]{90}{0}
\drawAxis[scale=1.25,axisarrow={->}]{90}{90}
\labelPolar[scale=1.35]{north}{0}{0}
\node at (north) {$|0\rangle$};
\labelPolar[scale=1.35]{south}{180}{0}
\node at (south) {$|1\rangle$};
\drawStatePolar[style={blue,thick}]{psi}{55}{30}
\node[above right] at (psi) {$|\psi\rangle$};
\drawStatePolar[style={red,thick}]{phi}{55}{125}
\node[above left] at (phi) {$R_z(\varphi)|\psi\rangle$};
\drawRotationLeft[style={red}]{0}{0}{0.35}{35}
\end{blochsphere}`);
    note(figure, R`$|\psi\rangle=\cos(\theta/2)|0\rangle+e^{i\varphi}\sin(\theta/2)|1\rangle$`);
  });
  example('TCP active-open connection lifecycle', 'An annotated subset of the RFC state machine follows active open, established communication and orderly close. State nodes, curved transitions and loop labels are edited in the automata editor.', () => {
    const figure = block('automata', R`\begin{tikzpicture}[->,>=Stealth,shorten >=1pt,auto,node distance=3cm]
\node[state,initial] (closed) at (0,0) {$C$};
\node[state] (syn) at (4,0) {$S$};
\node[state] (est) at (8,0) {$E$};
\node[state] (fin1) at (8,-3) {$F_1$};
\node[state] (fin2) at (4,-3) {$F_2$};
\node[state] (time) at (0,-3) {$W$};
\path (closed) edge node {open / SYN} (syn)
(syn) edge node {SYN+ACK / ACK} (est)
(est) edge [loop above] node {data / ACK} ()
(est) edge node {close / FIN} (fin1)
(fin1) edge node {ACK} (fin2)
(fin2) edge node {FIN / ACK} (time)
(time) edge node {2MSL timeout} (closed)
(syn) edge [bend left=35] node {reset} (closed);
\end{tikzpicture}`);
    note(figure, '$C$: CLOSED · $S$: SYN-SENT · $E$: ESTABLISHED');
    note(figure, '$F_1$: FIN-WAIT-1 · $F_2$: FIN-WAIT-2 · $W$: TIME-WAIT', 80);
  });
  example('Synchronous bus transaction with wait states', 'Seven timing rows show clock, request, ready, address/data buses and a read strobe. Vertical guides and a latency annotation stay in the timing editor’s native source.', () => {
    block('timing', R`\begin{tikztimingtable}[timing/rowdist=3]
CLK & 12{2C} \\
REQ & 2L 16H 6L \\
READY & 8L 2H 4L 2H 8L \\
ADDR & 2U 8D{0x10} 6D{0x14} 8U \\
DATA & 8Z 2D{A} 4Z 2D{B} 8Z \\
RD & 3H 6L 3H 3L 9H \\
VALID & 8L 2H 4L 2H 8L \\
\extracode
\vertlines[help lines]{2,8,10,14,16,18}
\draw[<->] (2,-19) -- node[above] {read latency} (8,-19);
\end{tikztimingtable}`);
  });
  example('Six-variable Karnaugh map with cross-map groups', 'Four submaps display 64 minterms, wraparound implicants and cross-map grouping. Change cells and implicant geometry in the Karnaugh-map editor.', () => {
    const terms = Array.from({ length: 64 }, (_, i) => i).filter(i => (i & 3) === 0 || ((i & 12) === 12 && (i & 32) === 0));
    const figure = block('kmap', R`\begin{karnaugh-map}[4][4][4][$D$][$C$][$B$][$A$][$F$][$E$]
\minterms{` + terms.join(',') + R`}
\autoterms[0]
\implicant{12}{14}[0,1]
\implicantedge{0}{8}{0}{8}[0,1,2,3]
\end{karnaugh-map}`);
    note(figure, 'Gray-code adjacency is preserved across the four submaps');
  });
  example('Complete IPv4 datagram layout', 'The bytefield editor holds all fixed header fields, options/padding and a payload section. Bit boundaries and word-group braces follow the RFC header layout.', () => {
    block('bytefield', R`\begin{bytefield}[bitwidth=1.1em,bitheight=3.8ex]{32}
\bitheader{0,3,4,7,8,15,16,18,19,23,24,31} \\
\begin{rightwordgroup}{IPv4 header}
\bitbox{4}{Version} & \bitbox{4}{IHL} & \bitbox{8}{DSCP / ECN} & \bitbox{16}{Total length} \\
\bitbox{16}{Identification} & \bitbox{3}{Flags} & \bitbox{13}{Fragment offset} \\
\bitbox{8}{TTL} & \bitbox{8}{Protocol} & \bitbox{16}{Header checksum} \\
\wordbox{1}{Source IPv4 address} \\
\wordbox{1}{Destination IPv4 address} \\
\bitbox{24}{Options (if present)} & \bitbox{8}{Padding}
\end{rightwordgroup} \\
\begin{rightwordgroup}{Payload}
\wordbox[lrt]{1}{Transport header and application data} \\
\skippedwords \\
\wordbox[lrb]{1}{}
\end{rightwordgroup}
\end{bytefield}`);
  });
  example('Aromatic chemistry: salicylic acid and aspirin', 'Two native chemfig blocks show aromatic rings, branches, carbonyls and heteroatoms. The arrow and reaction annotation are editable canvas shapes; double-click either structure for the chemistry editor.', () => {
    block('chemfig', R`\chemfig{**6((-OH)-(-C(=[1]O)-[7]OH)-----)}`, { x: 50, y: 100 });
    block('chemfig', R`\chemfig{**6((-O-C(=[2]O)-[7]CH_3)-(-C(=[1]O)-[7]OH)-----)}`, { x: 510, y: 100 });
    arrow(290, 155, 440, 155, { width: 2 }); text(365, 115, 'Acetylation', { size: 15 }); text(365, 200, '$H^+$', { size: 16 });
    text(140, 355, 'Salicylic acid'); text(620, 355, 'Acetylsalicylic acid (aspirin)');
  });
  example('Composite design pattern with interface and ownership', 'A class hierarchy combines an abstract component, leaf and composite implementations, attributes, operations and a collection relationship. The UML editor owns all classes and relations.', () => {
    block('uml', R`\begin{tikzpicture}
\begin{abstractclass}[text width=4.3cm]{Component}{0,0}
\attribute{- name : String}
\operation[0]{+ render() : void}
\operation{+ getName() : String}
\end{abstractclass}
\begin{class}[text width=4cm]{Leaf}{-3.5,-4}
\inherit{Component}
\attribute{- value : double}
\operation{+ render() : void}
\end{class}
\begin{class}[text width=5cm]{Composite}{3.5,-4}
\inherit{Component}
\attribute{- children : List<Component>}
\operation{+ add(c : Component) : void}
\operation{+ remove(c : Component) : void}
\operation{+ render() : void}
\end{class}
\aggregation{Composite}{children}{0..*}{Component}
\end{tikzpicture}`);
  });
  example('Checkout sequence with nested inventory and payment calls', 'Five participants exchange nested synchronous calls, responses and an asynchronous notification. Double-click to edit the sequence’s participants, activations and messages.', () => {
    block('umlsd', R`\begin{sequencediagram}
\newthread{u}{:Customer}
\newinst[1]{web}{:Checkout}
\newinst[1]{stock}{:Inventory}
\newinst[1]{pay}{:Payment}
\newinst[1]{mail}{:Notifier}
\begin{call}{u}{submit(cart)}{web}{confirmation}
\begin{call}{web}{reserve(items)}{stock}{reservationId}
\end{call}
\begin{call}{web}{authorize(total)}{pay}{approved}
\begin{call}{pay}{fraudCheck()}{pay}{clear}
\end{call}
\end{call}
\begin{call}{web}{commit(reservationId)}{stock}{allocated}
\end{call}
\mess{web}{sendReceipt}{mail}
\end{call}
\end{sequencediagram}`);
  });
  example('Circle geometry with tangent, secant and power of a point', 'A 2D geometry block contains a circle, tangent/secant construction, marked points, perpendicular radius and a power-of-a-point equation. Edit its TikZ geometry or drag supported point handles.', () => {
    block('geo2d', R`\begin{tikzpicture}
\coordinate (O) at (0,0);
\coordinate (P) at (5,0);
\coordinate (T) at (0.8,1.833);
\coordinate (A) at (-2,0);
\coordinate (B) at (2,0);
\draw[blue,thick] (O) circle (2);
\draw[gray,dashed] (-2.8,0) -- (5.8,0);
\draw[thick] (P) -- (A);
\draw[red,thick] (P) -- (T);
\draw[blue] (O) -- (T);
\draw[gray,dashed] (P) -- (0.8,-1.833);
\fill (O) circle (1.5pt) node[below] {$O$};
\fill (P) circle (1.5pt) node[right] {$P$};
\fill (T) circle (1.5pt) node[above] {$T$};
\fill (A) circle (1.5pt) node[below left] {$A$};
\fill (B) circle (1.5pt) node[below] {$B$};
\node at (1.2,-2.8) {$PT^2=PA\cdot PB=PO^2-r^2$};
\end{tikzpicture}`);
  });
  example('Spherical position and Cartesian projections', 'The 3D geometry editor contains a spherical position vector, three Cartesian projections, azimuth/polar arcs and a dashed coordinate box. Change the camera or coordinates in the editor.', () => {
    block('geo3d', R`\tdplotsetmaincoords{65}{115}
\begin{tikzpicture}[scale=2.5,tdplot_main_coords]
\coordinate (O) at (0,0,0);
\coordinate (P) at (2,1.5,2.4);
\draw[->] (O) -- (3,0,0) node[right] {$x$};
\draw[->] (O) -- (0,3,0) node[right] {$y$};
\draw[->] (O) -- (0,0,3.2) node[above] {$z$};
\draw[red,thick,->] (O) -- (P) node[above] {$\mathbf r$};
\draw[blue,dashed] (O) -- (2,1.5,0) -- (P);
\draw[gray,dashed] (2,0,0) -- (2,1.5,0) -- (0,1.5,0);
\draw[gray,dashed] (2,0,0) -- (2,0,2.4) -- (P) -- (0,1.5,2.4) -- (0,0,2.4) -- (2,0,2.4);
\draw[gray,dashed] (0,1.5,0) -- (0,1.5,2.4);
\draw[gray,dashed] (0,0,2.4) -- (O);
\tdplotdrawarc{(O)}{0.7}{0}{36.87}{anchor=north}{$\phi$}
\tdplotsetthetaplanecoords{36.87}
\tdplotdrawarc[tdplot_rotated_coords]{(O)}{1.2}{0}{46.17}{anchor=south west}{$\theta$}
\node at (2,-1,0) {$\mathbf r=(r\sin\theta\cos\phi,r\sin\theta\sin\phi,r\cos\theta)$};
\end{tikzpicture}`);
  });
  example('Computed Atwood machine and a four-bar linkage', 'Two separate mechanics blocks demonstrate computed tension/acceleration and constrained linkage geometry. Double-click either to edit its parameters; the accompanying values are computed from those parameters.', () => {
    block('physics', R`\physics{mechanics}
\atwood[m1=2,m2=3,r=0.6,l1=2.5,l2=3.5,forces=true](0,0)`, { x: 30, y: 60 });
    block('physics', R`\physics{mechanics}
\fourbar[a=1,b=3,c=2.2,d=3,theta=60,labels=true](0,0)`, { x: 450, y: 100 });
    text(170, 410, '$a=\\frac{m_2-m_1}{m_1+m_2}g$'); text(170, 455, '$T=\\frac{2m_1m_2}{m_1+m_2}g$');
    text(600, 410, '$a=1,\\ b=3,\\ c=2.2,\\ d=3$'); text(600, 455, 'Closed-chain geometric constraint');
  });
  example('Scientific results table with grouped headers', 'A native Table model demonstrates merged header cells, booktabs rules, mathematical headings, uncertainty notation, aligned numerical columns and highlighted best values.', () => {
    const data = [
      ['Method', 'Mesh', 'Accuracy', '', 'Runtime', ''],
      ['', '$N$', '$L^2$ error', 'Order', 'Mean (s)', 'Std (s)'],
      ['Finite difference', '32', '0.0128', '2.01', '0.104(8)', '0.008'],
      ['Finite difference', '64', '0.0032', '2.00', '0.421', '0.015'],
      ['Finite element', '32', '0.0081', '2.12', '0.187', '0.011'],
      ['Finite element', '64', '0.0019', '2.09', '0.706', '0.023'],
      ['Spectral', '32', '0.00004', '5.31', '0.238', '0.014'],
      ['Spectral', '64', '0.000001', '5.32', '0.897(32)', '0.032'],
    ];
    const table = TD.table.create(data.length, 6, 'booktabs'); table.head = 2; table.size = 'small'; table.stretch = 1.3;
    data.forEach((row, i) => row.forEach((t, j) => { table.cells[i][j].t = t; if (i < 2) table.cells[i][j].bg = '#e8f0fb'; if (i > 1 && j > 1) table.cells[i][j].al = 'r'; }));
    TD.table.merge(table, { r0: 0, c0: 2, r1: 0, c1: 3 }); TD.table.merge(table, { r0: 0, c0: 4, r1: 0, c1: 5 });
    table.cols[2].num = { sig: 3, exp: 'sci' }; table.cols[4].num = { dp: 3, unc: 'paren' };
    table.cells[7][2].b = true; table.cells[7][2].fg = '#2459a6';
    const figure = add('table', 'table', { x: 30, y: 60, table }); note(figure, 'Illustrative convergence data, not benchmark measurements');
  });
  example('Damped oscillation: fit, envelope and sample points', 'Four function series and a scatter series combine a damped signal, positive/negative envelopes, an undamped reference and synthetic sample points with a legend and grid. All series are native plot data.', () => {
    const p = add('plot', 'plot:function', { x: 80, y: 70, w: 620, h: 340, xmin: '0', xmax: '10', ymin: '-1.2', ymax: '1.2', grid: true, axisLines: 'box', xlabel: '$t$ (s)', ylabel: '$x(t)$', legendPos: 'north east' });
    const ser = (expr: string, color: string, legend: string, dash = 'solid') => TD.newSeries({ expr, color, legend, dash, domain: ['0', '10'], samples: 180, width: 1.5 });
    p.series = [ser('exp(-0.22*x)*cos(2.8*x)', blue, 'Damped response'), ser('exp(-0.22*x)', red, 'Envelope', 'dashed'), ser('-exp(-0.22*x)', red, '', 'dashed'), ser('cos(2.8*x)', '#aaaaaa', 'Undamped', 'dotted'), TD.newSeries({ kind: 'scatter', source: 'data', color: '#000000', mark: '*', legend: 'Samples', data: Array.from({ length: 16 }, (_, i) => { const x = i * 0.6; return x + ' ' + (Math.exp(-0.22 * x) * Math.cos(2.8 * x) + Math.sin(i * 7) * 0.025); }).join('\n') })];
    text(390, 475, '$x(t)=Ae^{-\\zeta\\omega_n t}\\cos(\\omega_d t+\\varphi)$');
  });
  example('Peaks surface and its contour map', 'A multi-extremum surface is paired with a contour plot of the same function. The two native plots expose camera, colormap, mesh resolution, levels and colour-bar controls.', () => {
    const expr = '3*(1-x)^2*exp(-x^2-(y+1)^2)-10*(x/5-x^3-y^5)*exp(-x^2-y^2)-exp(-(x+1)^2-y^2)/3';
    const p = add('plot', 'plot:surface3d', { x: 55, y: 60, w: 380, h: 330, colormap: 'viridis', view: [32, 35], grid: true });
    p.series = [TD.newSeries({ kind: 'surface', expr, domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 35 })];
    const q = add('plot', 'plot:contour', { x: 535, y: 60, w: 300, h: 300, colormap: 'viridis', colorbar: true, title: 'Level sets' });
    q.series = [TD.newSeries({ kind: 'contour', expr, domain: ['-3', '3'], ydomain: ['-3', '3'], samples: 60, levels: 12 })];
    text(220, 445, 'Surface with multiple extrema'); text(685, 445, 'Contours of the same scalar field');
  });
  example('Washer and shell constructions for a volume', 'Two native solids of revolution show a cutaway washer and a cylindrical shell, each with a differential slice and adjustable generating curves, limits, sweep and camera.', () => {
    add('revolve', 'revolve:washer', { x: 20, y: 40, w: 340, h: 290, showSlice: true, showCurve: true, x0: '1.8', dx: '0.15', sliceLabel: '$dx$', sweep: '270' });
    add('revolve', 'revolve:shell', { x: 460, y: 40, w: 340, h: 290, showSlice: true, x0: '1.8', dx: '0.15', sliceLabel: '$dx$', sweep: '270' });
    text(185, 410, '$dV=\\pi(R^2-r^2)\\,dx$'); text(635, 410, '$dV=2\\pi x\\,h(x)\\,dx$');
    text(185, 455, 'Washer method'); text(635, 455, 'Shell method');
  });
}
