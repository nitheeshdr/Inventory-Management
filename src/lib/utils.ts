import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Mongoose docs carry ObjectIds and Dates that can't cross the server/client
 *  boundary. Plain-JSON them once, at the edge of every page. */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (pick(row) || 0), 0);
}

export function groupBy<T, K extends string | number>(
  rows: readonly T[],
  key: (row: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}
