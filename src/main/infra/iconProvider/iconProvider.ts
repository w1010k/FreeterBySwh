/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import Electron from 'electron';
import { IconProvider } from '@/application/interfaces/iconProvider';

const FETCH_TIMEOUT_MS = 4000;
const FAVICON_MAX_BYTES = 256 * 1024;
const HTML_MAX_BYTES = 64 * 1024;
const FALLBACK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

function getUserAgent(): string {
  try {
    const ua = Electron.app?.userAgentFallback;
    return ua && ua.length > 0 ? ua : FALLBACK_UA;
  } catch {
    return FALLBACK_UA;
  }
}

export function isImageContentType(ct: string | null): boolean {
  if (!ct) {
    return false;
  }
  return ct.toLowerCase().startsWith('image/');
}

/**
 * Sniff the MIME type from the first bytes of a buffer. Some servers lie in
 * `Content-Type` (returning `text/html` for a genuine favicon, or serving an
 * HTML error page for a 404/WAF block), so we don't trust the header alone.
 */
export function extractMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && (bytes[2] === 0x01 || bytes[2] === 0x02) && bytes[3] === 0x00) {
    return 'image/x-icon';
  }
  // SVG: scan the first 512 bytes for an actual `<svg` tag. Don't gate on
  // `bytes[0] === 0x3c` — real SVGs can start with BOM, whitespace, or an
  // `<?xml ...?>` preamble before the root tag.
  if (bytes.length >= 5) {
    try {
      const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 512)));
      if (/<svg\b[^>]*>/i.test(head)) {
        return 'image/svg+xml';
      }
    } catch {
      // fall through
    }
  }
  return null;
}

function toBase64DataUri(mime: string, bytes: Uint8Array): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function fetchBytes(url: string, accept: string, maxBytes: number): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': accept,
        'User-Agent': getUserAgent()
      }
    });
    if (!res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type');
    const contentLength = Number(res.headers.get('content-length') || '0');
    if (contentLength > maxBytes) {
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return null;
    }
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  const result = await fetchBytes(url, 'image/*,*/*;q=0.8', FAVICON_MAX_BYTES);
  if (!result || result.bytes.length === 0) {
    return null;
  }
  const mimeFromBytes = extractMimeFromBytes(result.bytes);
  const mime = mimeFromBytes ?? (isImageContentType(result.contentType) ? result.contentType! : null);
  if (!mime) {
    return null;
  }
  return toBase64DataUri(mime, result.bytes);
}

export interface FaviconCandidate {
  href: string;
  relKind: 'apple-touch-icon' | 'icon' | 'shortcut-icon';
  maxSize: number;
}

export function parseFaviconCandidates(html: string): FaviconCandidate[] {
  const linkRegex = /<link\b([^>]*)>/gi;
  const out: FaviconCandidate[] = [];
  for (const match of html.matchAll(linkRegex)) {
    const attrs = match[1];
    const relMatch = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!relMatch) {
      continue;
    }
    const rel = relMatch[1].toLowerCase().trim();
    const parts = rel.split(/\s+/);
    // Order of the branches matters: `shortcut icon` must be checked before
    // the plain `parts.includes('icon')` branch — otherwise "shortcut icon"
    // would fall through to the `icon` category instead of `shortcut-icon`.
    let relKind: FaviconCandidate['relKind'] | null = null;
    if (parts.includes('apple-touch-icon') || parts.includes('apple-touch-icon-precomposed')) {
      relKind = 'apple-touch-icon';
    } else if (parts.length === 2 && parts[0] === 'shortcut' && parts[1] === 'icon') {
      relKind = 'shortcut-icon';
    } else if (parts.includes('icon')) {
      relKind = 'icon';
    }
    if (!relKind) {
      continue;
    }
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!hrefMatch) {
      continue;
    }
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith('#')) {
      continue;
    }
    let maxSize = 0;
    const sizesMatch = /\bsizes\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (sizesMatch) {
      const sizes = sizesMatch[1].toLowerCase().trim();
      if (sizes === 'any') {
        maxSize = 9999;
      } else {
        for (const part of sizes.split(/\s+/)) {
          const dim = /^(\d+)x(\d+)$/.exec(part);
          if (dim) {
            const val = Math.max(parseInt(dim[1], 10), parseInt(dim[2], 10));
            if (val > maxSize) {
              maxSize = val;
            }
          }
        }
      }
    }
    out.push({ href, relKind, maxSize });
  }
  return out;
}

function relRank(kind: FaviconCandidate['relKind']): number {
  if (kind === 'apple-touch-icon') {
    return 1;
  }
  if (kind === 'icon') {
    return 2;
  }
  return 3;
}

export function sortFaviconCandidates(candidates: FaviconCandidate[]): FaviconCandidate[] {
  return [...candidates].sort((a, b) => {
    const ra = relRank(a.relKind);
    const rb = relRank(b.relKind);
    if (ra !== rb) {
      return ra - rb;
    }
    return b.maxSize - a.maxSize;
  });
}

/**
 * Register `work()` as the current in-flight fetch for `key`. On completion,
 * clear the map entry only if it still points at our promise — a concurrent
 * `bypassCache` call may have overwritten it with a fresher promise, and we
 * must not evict that sibling's advertised entry.
 */
function dedupeInflight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>
): Promise<T> {
  const promise = work();
  map.set(key, promise);
  void promise.finally(() => {
    if (map.get(key) === promise) {
      map.delete(key);
    }
  });
  return promise;
}

export function createIconProvider(): IconProvider {
  // Session-scoped in-memory cache. Results (positive or null) persist until
  // app quit; an explicit `bypassCache` from a user-initiated action is the
  // only way to re-attempt. Keeps background noise minimal — failed sites
  // aren't silently retried every N minutes.
  const fileIconCache = new Map<string, string | null>();
  const faviconCache = new Map<string, string | null>();
  const inflightFileIcon = new Map<string, Promise<string | null>>();
  const inflightFavicon = new Map<string, Promise<string | null>>();

  const getFileIcon = async (path: string, bypassCache?: boolean): Promise<string | null> => {
    if (!path) {
      return null;
    }
    if (!bypassCache) {
      const cached = fileIconCache.get(path);
      if (cached !== undefined) {
        return cached;
      }
      const existing = inflightFileIcon.get(path);
      if (existing) {
        return existing;
      }
    }
    return dedupeInflight(inflightFileIcon, path, async () => {
      try {
        const nativeImage = await Electron.app.getFileIcon(path, { size: 'normal' });
        if (!nativeImage || nativeImage.isEmpty()) {
          fileIconCache.set(path, null);
          return null;
        }
        const dataUri = nativeImage.toDataURL();
        const result = dataUri || null;
        fileIconCache.set(path, result);
        return result;
      } catch {
        fileIconCache.set(path, null);
        return null;
      }
    });
  };

  const resolveFaviconFromHtml = async (origin: string): Promise<string | null> => {
    const htmlResult = await fetchBytes(`${origin}/`, 'text/html,application/xhtml+xml,*/*;q=0.8', HTML_MAX_BYTES);
    if (!htmlResult || htmlResult.bytes.length === 0) {
      return null;
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(htmlResult.bytes);
    const candidates = parseFaviconCandidates(html);
    if (candidates.length === 0) {
      return null;
    }
    for (const cand of sortFaviconCandidates(candidates)) {
      let resolved: URL;
      try {
        resolved = new URL(cand.href, `${origin}/`);
      } catch {
        continue;
      }
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        continue;
      }
      const dataUri = await fetchImageAsDataUri(resolved.toString());
      if (dataUri) {
        return dataUri;
      }
    }
    return null;
  };

  const getFavicon = async (url: string, bypassCache?: boolean): Promise<string | null> => {
    if (!url) {
      return null;
    }
    let origin: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      origin = parsed.origin;
    } catch {
      return null;
    }
    if (!bypassCache) {
      const cached = faviconCache.get(origin);
      if (cached !== undefined) {
        return cached;
      }
      const existing = inflightFavicon.get(origin);
      if (existing) {
        return existing;
      }
    }
    return dedupeInflight(inflightFavicon, origin, async () => {
      try {
        const direct = await fetchImageAsDataUri(`${origin}/favicon.ico`);
        if (direct) {
          faviconCache.set(origin, direct);
          return direct;
        }
        const fromHtml = await resolveFaviconFromHtml(origin);
        faviconCache.set(origin, fromHtml);
        return fromHtml;
      } catch {
        faviconCache.set(origin, null);
        return null;
      }
    });
  };

  return { getFileIcon, getFavicon };
}
