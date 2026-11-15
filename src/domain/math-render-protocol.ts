export interface MathJob { id: number; engine: 'katex' | 'temml'; tex: string; display: boolean; macros: Record<string, string> }
export interface MathResult { id: number; html: string; error?: string }
