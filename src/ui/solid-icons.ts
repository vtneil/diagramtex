// Pictures for a 3D solid's Shape menu (a form select's `pictures`, drawn as the kit's picture Tiles by Select):
// drawn like the Blocks menu tiles (32×24, line icons; .a1 = the solid's silhouette in the blue-pen wash,
// .d = hidden edges dashed, .h = a hole).
import { message as msg, type Message } from '../i18n';
const P = (d: string) => `<svg viewBox="0 0 32 24" aria-hidden="true">${d}</svg>`;
export const SOLID_ICONS: Record<string, [Message, string]> = {
  box: [msg('solid.box', 'Box'), P('<path d="M5 9l9-4 13 3v11l-9 4-13-3z" class="a1"/><path d="M5 9l13 3 9-4M18 12v11"/>')],
  cube: [msg('solid.cube', 'Cube'), P('<path d="M8 8l5-4h12v12l-5 4H8z" class="a1"/><path d="M8 8h12l5-4M20 8v12"/>')],
  cylinder: [msg('solid.cylinder', 'Cylinder'), P('<path d="M9 5a7 2.5 0 0114 0v14a7 2.5 0 01-14 0z" class="a1"/><path d="M9 5a7 2.5 0 0014 0"/>')],
  cone: [msg('solid.cone', 'Cone'), P('<path d="M16 3l7 16a7 2.5 0 01-14 0z" class="a1"/><path d="M9 19a7 2.5 0 0114 0" class="d"/>')],
  frustum: [msg('solid.frustum', 'Frustum'), P('<path d="M11 5a5 2 0 0110 0l3 14a8 2.5 0 01-16 0z" class="a1"/><path d="M11 5a5 2 0 0010 0"/><path d="M8 19a8 2.5 0 0116 0" class="d"/>')],
  tube: [msg('solid.tube', 'Tube'), P('<path d="M9 5a7 2.5 0 0114 0v14a7 2.5 0 01-14 0z" class="a1"/><path d="M9 5a7 2.5 0 0014 0"/><ellipse cx="16" cy="5" rx="3.5" ry="1.2" class="h"/>')],
  sphere: [msg('solid.sphere', 'Sphere'), P('<circle cx="16" cy="12" r="9" class="a1"/><path d="M7 12a9 3 0 0018 0"/><path d="M7 12a9 3 0 0118 0" class="d"/>')],
  hemisphere: [msg('solid.hemisphere', 'Hemisphere'), P('<path d="M6 17a10 10 0 0120 0a10 3.2 0 01-20 0z" class="a1"/><path d="M6 17a10 3.2 0 0120 0" class="d"/>')],
  cap: [msg('solid.cap', 'Spherical cap'), P('<path d="M5 16a12.5 12.5 0 0122 0a11 3.2 0 01-22 0z" class="a1"/><path d="M5 16a11 3.2 0 0122 0" class="d"/>')],
  ellipsoid: [msg('solid.ellipsoid', 'Ellipsoid'), P('<ellipse cx="16" cy="12" rx="12" ry="7" class="a1"/><path d="M4 12a12 3 0 0024 0"/><path d="M4 12a12 3 0 0124 0" class="d"/>')],
  torus: [msg('solid.torus', 'Torus'), P('<ellipse cx="16" cy="12" rx="12" ry="7" class="a1"/><path d="M9.5 11c3.5 3 9.5 3 13 0M11.5 12.6c2.5-1.8 6.5-1.8 9 0"/>')],
  prism: [msg('solid.prism', 'Prism'), P('<path d="M5 19l7-13 8-3 7 13-8 3z" class="a1"/><path d="M12 6l7 13"/><path d="M5 19l8-3 7-13M13 16h14" class="d"/>')],
  hexprism: [msg('solid.hexprism', 'Hex prism'), P('<path d="M7 5l4.5-3h9L25 5v14l-4.5 3h-9L7 19z" class="a1"/><path d="M7 5l4.5 3h9L25 5M11.5 8v14M20.5 8v14"/>')],
  pyramid: [msg('solid.pyramid', 'Pyramid'), P('<path d="M16 2L5 18l8 4 14-4z" class="a1"/><path d="M16 2l-3 20"/><path d="M5 18l14-4 8 4M16 2l3 12" class="d"/>')],
  tetra: [msg('solid.tetra', 'Tetrahedron'), P('<path d="M15 2L5 19l13 3 9-7z" class="a1"/><path d="M15 2l3 20"/><path d="M5 19l22-4" class="d"/>')],
  octa: [msg('solid.octa', 'Octahedron'), P('<path d="M16 2L5 12l11 10 11-10z" class="a1"/><path d="M5 12l8 3 14-3M16 2l-3 13 3 7"/><path d="M5 12l14-3 8 3M16 2l3 7-3 13" class="d"/>')],
  swedge: [msg('solid.swedge', 'Wedge'), P('<path d="M16 12V3a9 9 0 109 9z" class="a1"/><path d="M7 12a9 3 0 0018 0"/><path d="M16 3v9h9"/>')],
};
