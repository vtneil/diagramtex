// A submenu's safe area. Leaving a row whose submenu is open, the pointer on its way to the submenu often crosses
// the rows below or above it. While it stays inside the triangle from where it left the row to the submenu's near
// edge, those rows neither take the highlight nor open their own submenus, and the open one stays. Reaching the
// submenu ends this; so does leaving the triangle or resting in it for 300ms, and then the open submenu closes and
// the row under the pointer has its turn.

type Pt = [number, number];
interface Aim { row: HTMLElement; shell: HTMLElement; sub: HTMLElement; tri: [Pt, Pt, Pt]; close: () => void; pending?: () => void; timer: number; stop: () => void }
let aim: Aim | null = null;

const side = (p: Pt, a: Pt, b: Pt) => (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
function inside(p: Pt, [a, b, c]: [Pt, Pt, Pt]) {
  const d1 = side(p, a, b), d2 = side(p, b, c), d3 = side(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
const within = (p: Pt, r: DOMRect) => p[0] >= r.left && p[0] <= r.right && p[1] >= r.top && p[1] <= r.bottom;

function end(reached: boolean) {
  const a = aim;
  if (!a) return;
  aim = null;
  a.stop();
  a.shell.classList.remove('aiming');
  if (reached) return;
  a.close();
  a.pending?.();
}

/** The pointer left a row (row) whose submenu (sub) is open at (x, y): keep it open while the pointer heads for it.
 *  False when it isn't heading that way (it left from the submenu itself, or away from it): close it now. */
export function aimAt(row: HTMLElement, sub: HTMLElement, x: number, y: number, close: () => void): boolean {
  end(false);
  const r = sub.getBoundingClientRect(), shell = row.closest<HTMLElement>('.ctx');
  if (!shell || !r.width || within([x, y], r)) return false;
  const right = r.left >= x; // the submenu opens to the right of the pointer
  const edge = right ? r.left : r.right, back = right ? -2 : 2;
  const tri: [Pt, Pt, Pt] = [[x + back, y], [edge, r.top - 4], [edge, r.bottom + 4]];
  const move = (e: PointerEvent) => {
    const p: Pt = [e.clientX, e.clientY];
    if (within(p, sub.getBoundingClientRect())) end(true);
    else if (!inside(p, tri)) end(false);
    else { clearTimeout(a.timer); a.timer = window.setTimeout(() => end(false), 300); }
  };
  document.addEventListener('pointermove', move, true);
  const a: Aim = { row, shell, sub, tri, close, timer: window.setTimeout(() => end(false), 300), stop: () => { clearTimeout(a.timer); document.removeEventListener('pointermove', move, true); } };
  aim = a;
  shell.classList.add('aiming');
  return true;
}

/** Whether a row being entered (row) should wait: the pointer is on its way to another row's submenu. Its own
 *  opening (open) runs once that is over, if the pointer is still on it. */
export function aimingPast(row: HTMLElement, open: () => void): boolean {
  if (!aim || row === aim.row || !aim.shell.contains(row) || aim.sub.contains(row)) return false;
  aim.pending = () => { if (row.isConnected && row.matches(':hover')) open(); };
  return true;
}
