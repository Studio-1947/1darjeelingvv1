import type { Request } from 'express';

/**
 * One route parameter, as a string.
 *
 * Express 5 types `req.params.x` as `string | string[]`, because a repeated or wildcard pattern
 * can yield several values. Every route here declares a single `:id`-style parameter, so the
 * array case cannot arise in practice — but the ambiguity was being silenced with `as any` in
 * twenty-three places, all of them feeding the value straight into a SQL `WHERE`. The cast did
 * not make the array impossible; it only stopped the compiler mentioning it.
 *
 * Narrowing once, here, is both truthful about the type and safer than the cast: a value that
 * somehow arrives as an array becomes a lookup that finds nothing — a 404 — rather than an array
 * reaching the query builder.
 */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
