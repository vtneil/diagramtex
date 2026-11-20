// The interface's line icons, by name. One drawing per meaning: a toolbar, a menu and a panel that mean "undo" all
// draw this undo. Svelte draws them with <Icon name>; imperative code that still builds HTML strings uses iconSvg().
// Icons are drawn in a 20-unit box with a 1.5 stroke by the surrounding `button svg` rule; `.f` parts are filled.
// An icon with cls 'qe-ic' is drawn in outline (.qo) and solid (.qf) parts at a 1px stroke instead.

// Insert and delete icons for grids of rows and columns (the Table's rows and columns, the quantum editor's wires
// and steps). Three blocks; the one an action makes or removes stands out, filled, offset to where it goes.
// Insert: a filled block first (before / above) or last (after / below). Delete: the middle one with a knocked-out ×.
// Columns are the rows' icons transposed.
function gridBlocks(at: number, del: boolean, cols: boolean) {
  const P = (x: number, y: number) => { const r = (v: number) => +v.toFixed(2); return cols ? `${r(y)},${r(x)}` : `${r(x)},${r(y)}`; };
  const box = (x: number, y: number, w: number, h: number) => `M${P(x, y)}L${P(x + w, y)}L${P(x + w, y + h)}L${P(x, y + h)}Z`;
  const out = (x: number, y: number, w: number, h: number) => `<path class="qo" d="${box(x + 0.5, y + 0.5, w - 1, h - 1)}"/>`;
  const solid = (d: string) => `<path class="qf" fill-rule="evenodd" d="${d}"/>`;
  if (del) {
    const a = 2.6, t = 0.75, k = Math.SQRT1_2, cx = 12, cy = 10;
    const arm = [[t, a], [t, t], [a, t], [a, -t], [t, -t], [t, -a], [-t, -a], [-t, -t], [-a, -t], [-a, t], [-t, t], [-t, a]]
      .map(([x, y], i) => `${i ? 'L' : 'M'}${P(cx + (x - y) * k, cy + (x + y) * k)}`).join('') + 'Z';
    return out(1.5, 1, 12, 4) + out(1.5, 15, 12, 4) + solid(box(5.5, 6.5, 13, 7) + arm);
  }
  return [1.5, 8, 14.5].map((y, i) => (i === at ? solid(box(6.5, y, 12, 4)) : out(1.5, y, 12, 4))).join('');
}

export interface IconDef { d: string; box?: string; cls?: string }

// The tree editor's head icons are drawn growing down with siblings left to right; the editor turns the .fe-turn
// group to follow the tree's direction, so the group is part of the drawing.
export const TREE_CHILD = '<rect class="qo" x="6.5" y="1.5" width="7" height="5"/><path class="qo" d="M10 6.5v6"/><rect class="qf" x="6" y="12.5" width="8" height="6"/>';
export const TREE_SIBLING = '<path class="qo" d="M10 1.5v3M5.5 4.5h9M5.5 4.5v3M14.5 4.5v3"/><rect class="qo" x="2" y="7.5" width="7" height="5"/><rect class="qf" x="10.5" y="7" width="8" height="6"/>';

// the snap modes' drawings: objects and grid keep the lower-right corner for a solid magnet badge; all and off share
// the plain magnet (the button's pressed state tells them apart)
const SNAP_MAGNET = '<g class="snap-magnet"><path d="M10.5 9.5V15a4.5 4.5 0 009 0V9.5H17V15a2 2 0 01-4 0V9.5z" fill="currentColor" stroke="none"/><path d="M10.5 12H13M17 12h2.5" stroke="var(--sheet-raised)" stroke-width="1"/></g>';
const SNAP_ANCHORS = '<g fill="currentColor" stroke="none"><circle cx="2" cy="2" r="1.5"/><circle cx="13" cy="2" r="1.5"/><circle cx="2" cy="13" r="1.5"/></g>';
// a Table border choice: a quiet cell grid, with the borders it applies drawn in ink
const border = (path: string) => `<path d="M3 3h14v14H3zM10 3v14M3 10h14" opacity=".2" stroke-width="1"/>${path ? `<path d="${path}" stroke-width="1.5"/>` : ''}`;

export const ICONS = {
  // files and commands (the "/" search)
  newFile: { d: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M10 9v6M7 12h6"/>' },
  file: { d: '<path d="M5 2.5h6.5l3.5 3.5v11.5H5zM11.5 2.5V6H15"/>' },
  open: { d: '<path d="M2.5 5.5v10h13l2-7h-13l-2 7"/><path d="M2.5 5.5V4h5l1.5 1.5h6v3"/>' },
  importFile: { d: '<path d="M7.5 5.5v-3h6l3 3v12h-9v-3M13.5 2.5v3h3"/><path d="M2.5 10h9M8 6.5l3.5 3.5L8 13.5"/>' },
  save: { d: '<path d="M3.5 3.5h10l3 3v10h-13z"/><path d="M6.5 3.5v4h6v-4M6 16.5v-5h8v5"/>' },
  exportAll: { d: '<path d="M3.5 3.5h10l3 3v10h-13z"/><path d="M6.5 3.5v4h6v-4"/>' },
  print: { d: '<path d="M5.5 7.5V3h9v4.5M5.5 14.5h-3v-7h15v7h-3"/><path d="M5.5 11.5h9v6h-9z"/>' },
  addPage: { d: '<path d="M5 2.5h10v15H5z"/><path d="M10 7.5v5M7.5 10h5"/>' },
  search: { d: '<circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5l4.5 4.5"/>' },
  rename: { d: '<path d="M3 6h9M3 10h6M3 14h5"/><path d="M11 17l.6-2.6L16 10l2 2-4.4 4.4z"/>' },
  sidebar: { d: '<rect x="3" y="4" width="14" height="12"/><path d="M8 4v12"/>' },
  // editing
  delete: { d: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>' },
  close: { d: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>' },
  export: { d: '<path d="M9 4H4v12h12v-5"/><path d="M10 10l6.5-6.5M11.5 3.5h5v5"/>' },
  folder: { d: '<path d="M2.5 5.5v10h15v-8H9L7.5 5.5z"/>' },
  download: { d: '<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 13v3.5h13V13"/>' },
  saveAs: { d: '<path d="M8 3v8M5 8l3 3 3-3"/><path d="M3.5 12v4.5h9"/><path d="M15 11v6M12 14h6"/>' },
  history: { d: '<path d="M3.5 10a6.5 6.5 0 101.9-4.6"/><path d="M3 3v3.5h3.5"/><path d="M10 6.5V10l2.5 1.5"/>' }, // recovery copies
  undo: { d: '<path transform="translate(0 -2)" d="M7 5L3 9l4 4"/><path transform="translate(0 -2)" d="M3 9h9a4.5 4.5 0 010 9H9"/>' },
  redo: { d: '<path transform="translate(0 -2)" d="M13 5l4 4-4 4"/><path transform="translate(0 -2)" d="M17 9H8a4.5 4.5 0 000 9h3"/>' },
  edit: { d: '<path d="M4 16l1-4 8-8 3 3-8 8z"/>' },
  copy: { d: '<path d="M7 7h9v10H7z"/><path d="M4 13V3h9"/>' },
  cut: { d: '<circle cx="5.5" cy="15" r="2.5"/><circle cx="14.5" cy="15" r="2.5"/><path d="M7 13.2L15 3M13 13.2L5 3"/>' },
  paste: { d: '<path d="M6 4H4v14h12V4h-2"/><path d="M7 2.5h6v3H7z"/>' },
  add: { d: '<path d="M10 5v10M5 10h10"/>' },
  moveUp: { d: '<path d="M10 15V5M6 9l4-4 4 4"/>' },
  moveDown: { d: '<path d="M10 5v10M6 11l4 4 4-4"/>' },
  duplicate: { d: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0011.5 3h-7A1.5 1.5 0 003 4.5v7A1.5 1.5 0 004.5 13H7"/>' },
  // page
  portrait: { d: '<path d="M6 3h8v14H6z"/>' },
  landscape: { d: '<path d="M3 6h14v8H3z"/>' },
  // view
  fit: { d: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>' },
  grid: { d: '<path d="M3 6h14M3 14h14M6 3v14M14 3v14"/>' },
  // the shell (ui/AppShell.svelte): the sidebar, the top bar and the tool rail
  sort: { d: '<path d="M3.5 6h8M3.5 10h6M3.5 14h4M15 4.5v11M12.5 13l2.5 2.5 2.5-2.5"/>' },
  code: { d: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11 4.5l-2 11"/>' },
  prev: { d: '<path d="M12 4l-6 6 6 6"/>' },
  next: { d: '<path d="M8 4l6 6-6 6"/>' },
  pencil: { d: '<path d="M4 16l1-4 8.5-8.5 3 3L8 15z M12 5l3 3"/>' },
  renameItem: { d: '<path d="M12 4l4 4M4 12l9-9 4 4-9 9-5 1z"/>' },
  guides: { d: '<path d="M3 3h14v14H3zM7 3v4M11 3v3M15 3v4M3 7h4M3 11h3M3 15h4"/>' },
  guidesLocked: { d: '<path d="M3 17V3h10M3 7h3M3 11h2M7 3v3"/><g class="guide-lock"><path d="M11 10V7.5a2.5 2.5 0 015 0V10"/><rect x="8.5" y="10" width="10" height="8" rx="1.5" fill="currentColor" stroke="none"/><path d="M13.5 13v2" stroke="var(--sheet-raised)" stroke-width="2"/></g>' },
  snap: { d: '<g class="snap-magnet"><path d="M5 3v7a5 5 0 0010 0V3h-3.5v7a1.5 1.5 0 01-3 0V3zM5 6.5h3.5M11.5 6.5H15"/></g>' },
  snapObjects: { d: '<path d="M13 7V2H2v11h5"/>' + SNAP_ANCHORS + SNAP_MAGNET },
  snapGrid: { d: '<path d="M13 8V2H2v11h6M2 7.5h11M7.5 2v11"/>' + SNAP_MAGNET },
  newGroup: { d: '<path d="M2.5 5.5v10h15v-8H9.5L8 5.5z"/><path d="M10 9.5v4M8 11.5h4"/>' },
  ungroup: { d: '<path d="M3 3h7v6H3zM10 11h7v6h-7z"/>' },
  fileClassic: { d: '<path d="M3.5 7.5h10V11a5 5 0 01-10 0zM13.5 8h1.75a2.25 2.25 0 010 4.5H13M2.5 17h13M6 5V3M10 5V3"/>' },
  filePage: { d: '<path d="M5 2.5h10v15H5z"/><path d="M7.5 6h3M7.5 8.5h5"/><path d="M8 15l2-3.5 2 2 1-1.5"/>' },
  fileBoard: { d: '<path d="M2.5 4.5h15v10h-15z"/><path d="M5.5 11c1.6-3.4 3.2-3.4 4.5 0s2.9 3.4 4.5 0"/><path d="M7 17.5l3-3 3 3"/>' },
  fileTable: { d: '<rect x="2.5" y="4" width="15" height="12" rx="1"/><path d="M2.5 8h15M2.5 12h15M8 4v12"/>' },
  fileQuick: { d: '<path d="M2.5 11h2.5l2.5 5.5 4-13h6"/><path d="M12.5 9l4 5M16.5 9l-4 5"/>' },
  viewDocument: { d: '<path d="M5 2.5h10v15H5z"/><path d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3"/>' },
  viewDiagram: { d: '<path d="M3 16L9 5l4 7 4-4"/><circle cx="9" cy="5" r="1.4" class="f"/>' },
  themeSystem: { d: '<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 16.5h6M10 13.5v3"/>' },
  themeLight: { d: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>' },
  themeDark: { d: '<path d="M15.5 12.6A6.5 6.5 0 017.4 4.5a6.5 6.5 0 108.1 8.1z"/>' },
  gridLines: { d: '<path d="M3 3h14v14H3zM3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14"/>' },
  gridDot: { d: '<g fill="currentColor" stroke="none"><circle cx="4" cy="4" r="1.3"/><circle cx="10" cy="4" r="1.3"/><circle cx="16" cy="4" r="1.3"/><circle cx="4" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="16" cy="10" r="1.3"/><circle cx="4" cy="16" r="1.3"/><circle cx="10" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/></g>' },
  gridIsometric: { d: '<path d="M10 3.5L17 16H3Z"/>' },
  gridIsometricDot: { d: '<g fill="currentColor" stroke="none"><circle cx="10" cy="4.5" r="1.7"/><circle cx="4" cy="15" r="1.7"/><circle cx="16" cy="15" r="1.7"/></g>' },
  // the properties panel's switches: text alignment, vertical alignment, a line's route and its direction
  routeStraight: { d: '<path d="M3 16L17 4"/>' },
  routeElbow: { d: '<path d="M3 15h7V5h7"/>' },
  routeCurved: { d: '<path d="M3 15C11 15 9 5 17 5"/>' },
  alignLeft: { d: '<path d="M3 4h14M3 8h9M3 12h14M3 16h9"/>' },
  alignCentre: { d: '<path d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9"/>' },
  alignRight: { d: '<path d="M3 4h14M8 8h9M3 12h14M8 16h9"/>' },
  alignJustify: { d: '<path d="M3 4h14M3 8h14M3 12h14M3 16h14"/>' },
  valignTop: { d: '<path d="M3 3h14M10 17V7M6.5 10.5 10 7l3.5 3.5"/>' },
  valignMiddle: { d: '<path d="M3 10h14M10 2v5M7.5 4.5 10 7l2.5-2.5M10 18v-5M7.5 15.5 10 13l2.5 2.5"/>' },
  valignBottom: { d: '<path d="M3 17h14M10 3v10M6.5 9.5 10 13l3.5-3.5"/>' },
  dirElbowHH: { d: '<path d="M2 15h8V5h8"/>' },
  dirElbowVV: { d: '<path d="M4 2v8h12v8"/>' },
  dirElbowHV: { d: '<path d="M2 4h14v14"/>' },
  dirElbowVH: { d: '<path d="M4 2v14h14"/>' },
  dirCurvedHH: { d: '<path d="M2 15C11 15 9 5 18 5"/>' },
  dirCurvedVV: { d: '<path d="M4 2C4 11 16 9 16 18"/>' },
  dirCurvedHV: { d: '<path d="M2 4C12 4 16 8 16 18"/>' },
  dirCurvedVH: { d: '<path d="M4 2C4 12 8 16 18 16"/>' },
  // list rows: Layers' lock, and the fold of a group or folder (turned a quarter when open)
  lock: { d: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9"/>' },
  unlock: { d: '<rect x="4.5" y="9" width="11" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 015.8-1.1"/>' },
  disclosure: { d: '<path d="M8 6l4 4-4 4"/>' },
  // the tool rail's single tools
  hand: { d: '<path d="M7 10.5V4.8a1.2 1.2 0 012.4 0V9.5M9.4 9V3.7a1.2 1.2 0 012.4 0V9.5M11.8 9.2V4.6a1.2 1.2 0 012.4 0v6.6c0 3.6-2.2 6.3-5.6 6.3-2.1 0-3.4-.9-4.6-2.6L3.6 12.1a1.2 1.2 0 012-1.4L7 12.4"/>' },
  magnify: { d: '<circle cx="8" cy="8" r="5"/><path d="M12 12l5 5M5.5 8h5M8 5.5v5"/>' },
  bucket: { d: '<path d="M7 3l7 7-6 6-7-7zM5 1l5 5M16 11c0 0-2 3-2 4.5a2 2 0 004 0C18 14 16 11 16 11zM2 9h11"/>' },
  toolMath: { d: '<path d="M9.5 4.5c-1.6-.8-3 0-3.3 1.8L4.6 16.2c-.3 1.6-1.6 2.2-2.6 1.5M3.5 9h5M10.5 9.5l5 6M15.5 9.5l-5 6"/>' },
  toolText: { d: '<path d="M4 5h12M10 5v11M7.5 16h5"/>' },
  toolImage: { d: '<rect x="2.5" y="4" width="15" height="12"/><circle cx="7" cy="8" r="1.5"/><path d="M3 15l5-5 3.5 3.5 2-2L17 15"/>' },
  // tools
  select: { d: '<path d="M5 3l10 7-5 1-2 5z" class="f"/>' },
  wire: { d: '<path d="M3 15h6V5h8"/><circle cx="3" cy="15" r="1.6" class="f"/><circle cx="17" cy="5" r="1.6" class="f"/>' },
  // the tool rail's groups (each opens a Flyout)
  groupLines: { d: '<path d="M3 17L17 3"/>' },
  groupShapes: { d: '<rect x="2.5" y="5" width="9" height="9"/><circle cx="13" cy="11" r="4.5"/>' },
  groupElectrical: { d: '<path d="M1.5 10h3l1.5-4 3 8 3-8 3 8 1.5-4h2"/>' },
  groupPhysics: { d: '<ellipse cx="10" cy="10" rx="8" ry="3.2"/><ellipse cx="10" cy="10" rx="8" ry="3.2" transform="rotate(60 10 10)"/><ellipse cx="10" cy="10" rx="8" ry="3.2" transform="rotate(-60 10 10)"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/>' },
  groupMisc: { d: '<path d="M3 3v14h14M3 9h14M3 13h14M7 3v14M11 3v14M15 3v14" style="stroke-width:1.1"/>' },
  groupArrows: { d: '<path d="M2.5 7.5h8.5V4l6.5 6-6.5 6v-3.5H2.5z"/>' },
  groupPlots: { d: '<path d="M3 3v14h14"/><path d="M5 14c3-1 4-8 6-8s3 5 6 4"/>' },
  groupPlots3d: { d: '<path d="M6.5 13.5V2.5M6.5 13.5H18M6.5 13.5l-4 4"/><path d="M9 7.5c2.2-2.4 4.2.6 8.5-2l-1.5 3.8c-4.3 2.6-6.3-.4-8.5 2z"/>' },
  groupFigures3d: { d: '<text x="10" y="15" text-anchor="middle" font-size="14.5" font-weight="800" letter-spacing="-.6" font-family="system-ui,sans-serif" fill="currentColor" stroke="none">3D</text>' },
  groupBlocks: { d: '<path d="M10 2l4 2.3v4.6L10 11.2 6 8.9V4.3zM6 4.3l4 2.3 4-2.3M10 6.6v4.6M6 8.9l4 2.3v4.6L6 18.1 2 15.8v-4.6zM2 11.2l4 2.3 4-2.3M6 13.5v4.6M14 8.9l4 2.3v4.6L14 18.1 10 15.8v-4.6zM10 11.2l4 2.3 4-2.3M14 13.5v4.6"/>' },
  // arrange
  arrange: { d: '<path d="M3 3h9v9H3z" class="f"/><path d="M8 8h9v9H8z"/>' }, // order: one in front of another
  // shapes lined up against one another (text alignment is alignLeft …)
  alignLefts: { d: '<path d="M3 2v16M6 5h10v3.5H6zM6 11.5h6V15H6z"/>' },
  alignCentres: { d: '<path d="M10 2v16M4 5h12v3.5H4zM7 11.5h6V15H7z"/>' },
  alignRights: { d: '<path d="M17 2v16M4 5h10v3.5H4zM8 11.5h6V15H8z"/>' },
  alignTops: { d: '<path d="M2 3h16M5 6v10h3.5V6zM11.5 6v6H15V6z"/>' },
  alignMiddles: { d: '<path d="M2 10h16M5 4v12h3.5V4zM11.5 7v6H15V7z"/>' },
  alignBottoms: { d: '<path d="M2 17h16M5 4v10h3.5V4zM11.5 8v6H15V8z"/>' },
  // combining shapes into one outline
  combineUnite: { d: '<path d="M3 3h9v5h5v9H8v-5H3z" fill="currentColor" stroke="none"/>' },
  combineIntersect: { d: '<path d="M3 3h9v9H3zM8 8h9v9H8z" fill="none"/><path d="M8 8h4v4H8z" fill="currentColor" stroke="none"/>' },
  combineSubtract: { d: '<path d="M3 3h9v5H8v4H3z" fill="currentColor" stroke="none"/><path d="M8 8h9v9H8z" fill="none" stroke-dasharray="2 1.5"/>' },
  combineExclude: { d: '<path d="M3 3h9v5H8v4H3zM12 8h5v9H8v-5h4z" fill="currentColor" stroke="none"/><path d="M8 8h4v4H8z" fill="none"/>' },
  combineDivide: { d: '<path d="M3 3h9v9H3zM8 8h9v9H8z" fill="none"/><path d="M8 8h4v4H8z" fill="currentColor" stroke="none" opacity=".5"/>' },
  distribute: { d: '<path d="M2 3v14M18 3v14"/><path d="M6 6h3v8H6zM11 6h3v8h-3z"/>' },
  rotate: { d: '<path d="M15.5 8.5A6 6 0 1 0 16 12"/><path d="M16.5 4v4.5H12"/>' },
  mirrorH: { d: '<path d="M10 3v14" stroke-dasharray="2 2"/><path d="M7.5 6L3 14h4.5zM12.5 6l4.5 8h-4.5z"/>' },
  mirrorV: { d: '<path d="M3 10h14" stroke-dasharray="2 2"/><path d="M6 7.5L14 3v4.5zM6 12.5l8 4.5v-4.5z"/>' },
  // automatic layout: layers from the initial state, or a spring model spreading nodes by their edges
  layoutLayers: { d: '<circle cx="4.5" cy="10" r="2.2"/><circle cx="15.5" cy="5" r="2.2"/><circle cx="15.5" cy="15" r="2.2"/><path d="M6.6 9l6.8-3.2M6.6 11l6.8 3.2"/>' },
  layoutSpring: { d: '<circle cx="4.5" cy="10" r="2.2"/><circle cx="15.5" cy="5" r="2.2"/><circle cx="15.5" cy="15" r="2.2"/><path d="M6.6 9l6.8-3.2M6.6 11l6.8 3.2M15.5 7.2v5.6"/>' },
  // the block editors' right-click menus: lines and bonds
  straight: { d: '<path d="M3 10h14"/>' },
  bondDouble: { d: '<path d="M3 8h14M3 12h14"/>' },
  bondTriple: { d: '<path d="M3 6.5h14M3 10h14M3 13.5h14"/>' },
  bondWedge: { d: '<path d="M3 10l14-3.5v7z" class="f"/>' },
  bondHash: { d: '<path d="M5 9.5v1M8 8.8v2.4M11 8v4M14 7.3v5.4M17 6.5v7"/>' },
  reverse: { d: '<path d="M3 7h12l-3-3M17 13H5l3 3"/>' },
  bendLeft: { d: '<path d="M3 15C5 6 15 6 17 15"/>' },
  bendRight: { d: '<path d="M3 5c2 9 12 9 14 0"/>' },
  loop: { d: '<circle cx="10" cy="13" r="4"/><path d="M8 9.3C5 3 15 3 12 9.3M12.6 6.6l-.6 2.7-2.5-1"/>' },
  swapLabel: { d: '<path d="M4 10h12"/><path d="M8 6.5h4M8 13.5h4" stroke-dasharray="1.5 1.5"/>' },
  show: { d: '<path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.5"/>' },
  hide: { d: '<path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10zM3.5 16.5l13-13"/>' },
  // states, nodes and links
  stateInitial: { d: '<circle cx="13" cy="10" r="4.5"/><path d="M2 10h5.5M5.5 7.5L8 10l-2.5 2.5"/>' },
  stateAccepting: { d: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="4"/>' },
  nodeCircle: { d: '<circle cx="10" cy="10" r="6"/>' },
  nodeBox: { d: '<rect x="4" y="5.5" width="12" height="9"/>' },
  nodeRounded: { d: '<rect x="4" y="5.5" width="12" height="9" rx="3"/>' },
  nodeEllipse: { d: '<ellipse cx="10" cy="10" rx="7" ry="4.5"/>' },
  nodeText: { d: '<path d="M5 5h10M10 5v11"/>' },
  note: { d: '<circle cx="8" cy="13" r="4"/><path d="M12 6h5M12 3.5h5"/>' },
  addNode: { d: '<circle cx="10" cy="10" r="6"/><path d="M10 7.5v5M7.5 10h5"/>' },
  arrow: { d: '<path d="M3 10h13M12.5 6.5L16 10l-3.5 3.5"/>' },
  arrowBoth: { d: '<path d="M4 10h12M7.5 6.5L4 10l3.5 3.5M12.5 6.5L16 10l-3.5 3.5"/>' },
  arrowTriangle: { d: '<path d="M3 10h9M12 6l5 4-5 4z"/>' },
  arrowDiamond: { d: '<path d="M2 10l3.5-3 3.5 3-3.5 3zM9 10h8"/>' },
  // cells, rows, groups and blocks
  check: { d: '<path d="M4 10.5l4 4 8-9"/>' }, // a check that passed (the K-map's groups)
  attention: { d: '<path d="M10 4v8M10 15.5v.5"/>' }, // a check that did not
  clear: { d: '<path d="M4 4l12 12M16 4L4 16"/>' },
  moveLeft: { d: '<path d="M16 10H4M8.5 5.5L4 10l4.5 4.5"/>' },
  moveRight: { d: '<path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>' },
  insertAbove: { d: '<path d="M4 14h12M10 11V4M7 7l3-3 3 3"/>' },
  insertBelow: { d: '<path d="M4 6h12M10 9v7M7 13l3 3 3-3"/>' },
  split: { d: '<path d="M10 3v14M3 10h4M13 10h4M5 8l-2 2 2 2M15 8l2 2-2 2"/>' },
  group: { d: '<rect x="3" y="5" width="14" height="12" rx="2" stroke-dasharray="2.5 2"/><path d="M6 2.5h8"/>' },
  labelAbove: { d: '<path d="M3 16h14"/><text x="10" y="11" text-anchor="middle" fill="currentColor" stroke="none" font-size="11">A</text>' },
  labelBelow: { d: '<path d="M3 4h14"/><text x="10" y="17" text-anchor="middle" fill="currentColor" stroke="none" font-size="11">A</text>' },
  groupDelete: { d: '<rect x="3" y="5" width="14" height="12" rx="2" stroke-dasharray="2.5 2"/><path d="M7.5 8.5l5 5M12.5 8.5l-5 5"/>' },
  block: { d: '<rect x="3" y="4" width="14" height="12"/><path d="M3 8h5l1.5-1.5V4"/>' },
  fitWidth: { d: '<path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"/>' },
  umlAttributes: { d: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h14M6 11.5h6"/>' },
  umlOperations: { d: '<rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h14M6 14h6"/>' },
  selectAll: { d: '<path d="M3 3h14v14H3z" stroke-dasharray="2.5 2"/>' }, // a marquee round everything (not Fit's corners)
  importText: { d: '<path d="M5 3h7l3 3v11H5z"/><path d="M8 10h5M8 13h5"/>' },
  // the Table: merging and splitting cells, the header rows, and where borders go (a quiet cell grid for context,
  // the borders an action applies in ink)
  mergeCells: { d: '<path d="M3 4h14v12H3z"/><path d="M7 10h6M11 8l2 2-2 2M9 8l-2 2 2 2"/>' },
  splitCells: { d: '<path d="M3 4h14v12H3zM10 4v12"/><path d="M4.5 10h3M6 8.5L7.5 10 6 11.5M15.5 10h-3M14 8.5L12.5 10l1.5 1.5"/>' },
  headerRows: { d: '<path d="M3 3h14v14H3z"/><path d="M3 7.5h14" stroke-width="2.5"/>' },
  ruleThin: { d: '<path d="M3 10h14"/>' },
  ruleThick: { d: '<path d="M3 10h14" stroke-width="3"/>' },
  ruleDouble: { d: '<path d="M3 8h14M3 12h14"/>' },
  borderAll: { d: border('M3 3h14v14H3zM10 3v14M3 10h14') },
  borderOuter: { d: border('M3 3h14v14H3z') },
  borderInner: { d: border('M10 3v14M3 10h14') },
  borderInnerH: { d: border('M3 10h14') },
  borderInnerV: { d: border('M10 3v14') },
  borderTop: { d: border('M3 3h14') },
  borderBottom: { d: border('M3 17h14') },
  borderLeft: { d: border('M3 3v14') },
  borderRight: { d: border('M17 3v14') },
  borderNone: { d: border('') },
  // grids (gridBlocks above): the filled block is the one an action makes, where it goes
  rowAbove: { d: gridBlocks(0, false, false), cls: 'qe-ic' },
  rowBelow: { d: gridBlocks(2, false, false), cls: 'qe-ic' },
  rowDelete: { d: gridBlocks(0, true, false), cls: 'qe-ic' },
  colBefore: { d: gridBlocks(0, false, true), cls: 'qe-ic' },
  colAfter: { d: gridBlocks(2, false, true), cls: 'qe-ic' },
  colDelete: { d: gridBlocks(0, true, true), cls: 'qe-ic' },
  // the Table's and Document's text colour and fill (a SplitButton with `swatch`): the bar (.sw) shows the colour
  textColour: { d: '<path d="M6 14l4-10 4 10M7.4 10.5h5.2"/><path class="sw" d="M3 16.5h14" stroke-width="3"/>' },
  fillColour: { d: '<path d="M4.5 9.5l5-5 5 5-5 5z"/><path d="M15.5 11.5s1.5 1.8 1.5 2.8a1.5 1.5 0 01-3 0c0-1 1.5-2.8 1.5-2.8z"/><path class="sw" d="M3 17.5h14" stroke-width="3"/>' },
  // the Document view: a block's tools, a table's steps, the text bar
  remove: { d: '<path d="M5 10h10"/>' },
  chevronUp: { d: '<path d="M5.5 12.5L10 8l4.5 4.5"/>' },
  chevronDown: { d: '<path d="M5.5 8l4.5 4.5L14.5 8"/>' },
  listBullet: { d: '<path d="M8 5.5h9M8 10h9M8 14.5h9M4 5.5h.01M4 10h.01M4 14.5h.01"/>' },
  listNumber: { d: '<path d="M8 5.5h9M8 10h9M8 14.5h9M3.5 4l1-.5v4M3.2 12.2c.4-.6 1.8-.6 1.8.3 0 .7-1.8 1.4-1.8 2.2H5"/>' },
  checklist: { d: '<path d="M3 4h4v4H3zM3.8 13.5l1.2 1.2 2.2-2.6M10 6h7M10 14h7"/>' },
  link: { d: '<path d="M8.5 11.5l3-3M7 9.5L5.2 11.3a2.5 2.5 0 003.5 3.5L10.5 13M13 10.5l1.8-1.8a2.5 2.5 0 00-3.5-3.5L9.5 7"/>' },
  unlink: { d: '<path d="M8.5 11.5l-2 2a2.5 2.5 0 01-3.5-3.5l2-2M11.5 8.5l2-2a2.5 2.5 0 00-3.5-3.5l-2 2"/><path d="M13 13l3.5 3.5M3.5 3.5L7 7"/>' },
  source: { d: '<path d="M7 5.5L2.5 10 7 14.5M13 5.5l4.5 4.5-4.5 4.5M11 4l-2 12"/>' },
  // trees
  treeChild: { d: `<g class="fe-turn">${TREE_CHILD}</g>`, cls: 'qe-ic' },
  treeSibling: { d: `<g class="fe-turn">${TREE_SIBLING}</g>`, cls: 'qe-ic' },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/** The alignment switches' icons by their one-letter keys (the Table, the Document's text bar and blocks) */
export const ALIGN_ICON = { l: 'alignLeft', c: 'alignCentre', r: 'alignRight', j: 'alignJustify' } as const satisfies Record<string, IconName>;

/** Draws another named icon into an <svg> already on the page (a control whose icon follows its state). */
export function setIcon(svg: SVGElement, name: IconName) {
  const icon: IconDef = ICONS[name];
  svg.setAttribute('viewBox', icon.box ?? '0 0 20 20');
  svg.innerHTML = icon.d;
}

/** The icon as markup, for code that still builds HTML strings. */
export function iconSvg(name: IconName): string {
  const icon: IconDef = ICONS[name];
  return `<svg viewBox="${icon.box ?? '0 0 20 20'}"${icon.cls ? ` class="${icon.cls}"` : ''} aria-hidden="true">${icon.d}</svg>`;
}
