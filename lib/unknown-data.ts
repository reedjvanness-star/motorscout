// External JSON stays unknown until its shape has been checked.
export function record(value: unknown): Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
}
export function array(value: unknown): unknown[] {return Array.isArray(value) ? value : [];}
