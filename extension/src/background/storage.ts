import type { StoredAuthSession } from '@/shared/types';

const AUTH_KEY = 'strava:auth';
const CACHE_PREFIX = 'strava:cache:';

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

async function getLocal<T>(key: string): Promise<T | null> {
  const value = await chrome.storage.local.get(key);
  return (value[key] as T | undefined) ?? null;
}

export async function getStoredAuth(): Promise<StoredAuthSession | null> {
  return getLocal<StoredAuthSession>(AUTH_KEY);
}

export async function setStoredAuth(auth: StoredAuthSession): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await getLocal<CacheEntry<T>>(`${CACHE_PREFIX}${key}`);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.data;
}

export async function setCached<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlMs,
  };

  await chrome.storage.local.set({
    [`${CACHE_PREFIX}${key}`]: entry,
  });
}
