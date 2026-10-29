/** The API names its session cookie `__Host-session` over HTTPS and `session` in development. */
const SESSION_COOKIES = ['__Host-session', 'session'] as const;

interface CookieJar {
  get(name: string): { value: string } | undefined;
}

export function hasSessionCookie(jar: CookieJar): boolean {
  return SESSION_COOKIES.some((name) => jar.get(name) !== undefined);
}

/** Only the session cookie, as a `Cookie` header, for a server-side call to the API. */
export function sessionCookieHeader(jar: CookieJar): string {
  return SESSION_COOKIES.flatMap((name) => {
    const cookie = jar.get(name);
    return cookie ? [`${name}=${encodeURIComponent(cookie.value)}`] : [];
  }).join('; ');
}
