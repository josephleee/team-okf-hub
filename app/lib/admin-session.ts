import 'server-only';
import { cookies } from 'next/headers';
import { readConfig } from '../../lib/config';
import { signSession, verifySession } from '../../lib/secrets';

const COOKIE = 'okf_admin';
const TTL_MS = 12 * 60 * 60 * 1000;

export async function setAdminSession(secure: boolean): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;
  const value = signSession(Date.now() + TTL_MS, cfg.sessionSecret);
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: TTL_MS / 1000,
  });
}

export async function isAdmin(): Promise<boolean> {
  const cfg = readConfig();
  if (!cfg) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  return verifySession(value, cfg.sessionSecret, Date.now());
}

export async function clearAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
