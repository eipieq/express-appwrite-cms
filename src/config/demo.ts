'use client';

/**
 * Demo mode configuration and helpers.
 *
 * The demo user is allowed to explore the UI but write operations
 * should be blocked so that no shared data is modified.
 */

const rawDemoEmail = (process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '').trim();

export const DEMO_EMAIL = rawDemoEmail;
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? '';

const normalizedDemoEmail = rawDemoEmail.toLowerCase();

export const DEMO_MODE_COOKIE = 'express-appwrite-demo-mode';
export const DEMO_MODE_EVENT = 'express-appwrite-demo-mode-change';

export function isDemoUserEmail(email?: string | null): boolean {
  if (!email || !normalizedDemoEmail) {
    return false;
  }
  return email.trim().toLowerCase() === normalizedDemoEmail;
}

export function parseDemoModeCookie(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.cookie
    .split('; ')
    .some((part) => part === `${DEMO_MODE_COOKIE}=1`);
}

export function setDemoModeCookie(enabled: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  if (!enabled) {
    document.cookie = `${DEMO_MODE_COOKIE}=0; path=/; max-age=0; SameSite=Lax`;
  } else {
    const maxAgeSeconds = 60 * 60 * 12; // 12 hours is plenty for a demo session
    document.cookie = `${DEMO_MODE_COOKIE}=1; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DEMO_MODE_EVENT));
  }
}

export function alertDemoReadOnly(message?: string) {
  const text = message ?? 'Demo mode is read-only. Changes are not saved.';

  if (typeof window === 'undefined') {
    console.warn(text);
    return;
  }

  window.alert(text);
}
