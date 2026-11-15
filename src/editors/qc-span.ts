// Curved SWAP always exchanges two wires, irrespective of a stale wires option.
export function isSwapGate(it: any, opts: any): boolean {
  return it.name === 'gate' && opts(it.o[0] || '').list.includes('swap');
}

// Stop at circuit boundaries and at the first occupied cell. Existing covered
// cells may be retained when resizing an imported multi-wire gate.
export function boundedSpan(top: number, requested: number, current: number, rows: number, free: (r: number) => boolean): number {
  let end = top;
  const target = Math.min(rows - 1, top + Math.max(1, requested) - 1);
  while (end < target && (end + 1 < top + current || free(end + 1))) end++;
  return end - top + 1;
}
