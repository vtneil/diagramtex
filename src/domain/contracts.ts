/** Shared scientific values; source coordinates and edits are never rounded here. */
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export interface SourceSpan { s: number; e: number }
export interface TextSpan extends SourceSpan { t: string }
export interface QuantityParameter { dim?: string; unit?: string; dp?: number }
