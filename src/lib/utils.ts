import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function normalizeToken(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().toLowerCase();
}

export function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

export function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const clamped = clamp(quantile, 0, 1);
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
