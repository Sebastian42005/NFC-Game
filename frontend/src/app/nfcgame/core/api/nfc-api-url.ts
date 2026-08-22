import { environment } from '../../../../environments/environment';

const normalizedApiOrigin = trimTrailingSlash(environment.apiOrigin);
const normalizedApiBasePath = ensureLeadingSlash(environment.apiBasePath);

export const apiOrigin = normalizedApiOrigin;
export const apiBaseUrl = `${normalizedApiOrigin}${normalizedApiBasePath}`;

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${ensureLeadingSlash(path)}`;
}

export function resolveBackendAssetUrl(url: string | null | undefined): string | null | undefined {
  if (!url?.startsWith('/api/')) {
    return url;
  }

  return `${apiOrigin}${url}`;
}

export function stripBackendOrigin(url: string): string {
  if (!apiOrigin || !url.startsWith(apiOrigin)) {
    return url;
  }

  return url.slice(apiOrigin.length);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}
