const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface RequestSource {
  readonly method: string;
  /** The host the client asked for, such as `api.stayflow.example`. */
  readonly host: string | undefined;
  readonly origin: string | undefined;
  readonly secFetchSite: string | undefined;
}

/**
 * Whether a browser sent this state-changing request from a page the API does not trust: the
 * shape of a CSRF attack. Follows Go's http.CrossOriginProtection. Sec-Fetch-Site decides when
 * the browser sends it; older browsers fall back to comparing Origin with Host. A request with
 * neither header does not come from a browser, so it carries no victim's cookies.
 */
export function isUntrustedCrossOrigin(
  request: RequestSource,
  trustedOrigins: ReadonlySet<string>,
): boolean {
  if (SAFE_METHODS.has(request.method)) {
    return false;
  }
  if (request.origin !== undefined && trustedOrigins.has(request.origin)) {
    return false;
  }
  if (request.secFetchSite !== undefined) {
    return request.secFetchSite !== 'same-origin' && request.secFetchSite !== 'none';
  }
  if (request.origin === undefined) {
    return false;
  }
  return hostOf(request.origin) !== request.host;
}

function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    // Browsers send `Origin: null` from sandboxed frames and some redirects.
    return undefined;
  }
}
