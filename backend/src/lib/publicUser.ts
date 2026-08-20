/**
 * The user object as it is allowed to leave this server.
 *
 * Every auth route used to answer with the raw Drizzle row, which carries the `password` column.
 * For a tourist that column is null and nothing happened; for a DB-backed admin it is a real
 * PBKDF2 hash, and it was being handed back on every /auth/me poll — into client state, into
 * whatever the client logs, and into any front-end error reporter. An allowlist rather than a
 * `delete user.password`, so a column added to the schema later is excluded by default instead
 * of exposed because nobody remembered to redact it.
 */

export interface UserRowLike {
  id: string;
  phone: string;
  name: string;
  role: string;
  providerPaid?: boolean | null;
  email?: string | null;
  language?: string | null;
  avatar?: string | null;
  createdAt: string;
  supportExpiresAt?: string | null;
  [key: string]: unknown;
}

export interface PublicUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  providerPaid: boolean;
  email: string | null;
  language: string | null;
  avatar: string | null;
  createdAt: string;
  supportExpiresAt: string | null;
}

export function toPublicUser(user: UserRowLike): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    providerPaid: user.providerPaid === true,
    email: user.email ?? null,
    language: user.language ?? null,
    avatar: user.avatar ?? null,
    createdAt: user.createdAt,
    supportExpiresAt: user.supportExpiresAt ?? null,
  };
}
