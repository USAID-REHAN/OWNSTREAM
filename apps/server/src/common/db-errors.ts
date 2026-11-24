/** True when Postgres refused an insert because of a unique constraint (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } } | null;
  return e?.driverError?.code === '23505' || e?.code === '23505';
}
