/** A length or coordinate as TeX code is written: to 3 decimal places, without trailing zeros, and never -0. */
export const num3 = (n: unknown) => String(Math.round(Number(n) * 1000) / 1000);
