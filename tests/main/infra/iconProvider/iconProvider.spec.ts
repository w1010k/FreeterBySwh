/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import {
  extractMimeFromBytes,
  isImageContentType,
  parseFaviconCandidates,
  sortFaviconCandidates,
  FaviconCandidate
} from '@/infra/iconProvider/iconProvider';

function bytes(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('isImageContentType', () => {
  it.each([
    ['image/png', true],
    ['image/jpeg', true],
    ['image/x-icon', true],
    ['image/svg+xml', true],
    ['IMAGE/PNG', true],
    ['image/png; charset=utf-8', true],
    ['text/html', false],
    ['text/plain', false],
    ['application/json', false],
    ['', false],
    [null, false],
  ])('isImageContentType(%j) === %j', (input, expected) => {
    expect(isImageContentType(input)).toBe(expected);
  });
});

describe('extractMimeFromBytes', () => {
  it('detects PNG from magic bytes', () => {
    expect(extractMimeFromBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });

  it('detects JPEG from magic bytes', () => {
    expect(extractMimeFromBytes(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
  });

  it('detects GIF from magic bytes', () => {
    expect(extractMimeFromBytes(bytes([0x47, 0x49, 0x46, 0x38, 0x39]))).toBe('image/gif');
  });

  it('detects WebP (RIFF + WEBP) from magic bytes', () => {
    // "RIFF" size×4 "WEBP"
    expect(extractMimeFromBytes(bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
    ]))).toBe('image/webp');
  });

  it('does not match RIFF container when body is not WEBP', () => {
    // RIFF but WAVE fourCC
    expect(extractMimeFromBytes(bytes([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45
    ]))).toBeNull();
  });

  it('detects ICO from magic bytes', () => {
    expect(extractMimeFromBytes(bytes([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]))).toBe('image/x-icon');
  });

  it('detects cursor (.cur) as x-icon too', () => {
    expect(extractMimeFromBytes(bytes([0x00, 0x00, 0x02, 0x00, 0x01, 0x00]))).toBe('image/x-icon');
  });

  it('detects plain SVG by tag presence', () => {
    expect(extractMimeFromBytes(textBytes('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))).toBe('image/svg+xml');
  });

  it('detects SVG with XML preamble', () => {
    expect(extractMimeFromBytes(textBytes('<?xml version="1.0"?>\n<svg xmlns="...">...</svg>'))).toBe('image/svg+xml');
  });

  it('detects SVG after leading whitespace', () => {
    expect(extractMimeFromBytes(textBytes('  \n<svg width="16" height="16"></svg>'))).toBe('image/svg+xml');
  });

  it('does NOT mistake <script> for SVG', () => {
    expect(extractMimeFromBytes(textBytes('<script>alert(1)</script>'))).toBeNull();
  });

  it('does NOT mistake <style> for SVG', () => {
    expect(extractMimeFromBytes(textBytes('<style>body{}</style>'))).toBeNull();
  });

  it('does NOT mistake <!DOCTYPE html> for SVG', () => {
    expect(extractMimeFromBytes(textBytes('<!DOCTYPE html><html><head></head></html>'))).toBeNull();
  });

  it('does NOT mistake <html> for SVG', () => {
    expect(extractMimeFromBytes(textBytes('<html><body></body></html>'))).toBeNull();
  });

  it('returns null for empty bytes', () => {
    expect(extractMimeFromBytes(bytes([]))).toBeNull();
  });

  it('returns null for unknown binary content', () => {
    expect(extractMimeFromBytes(bytes([0x01, 0x02, 0x03, 0x04, 0x05]))).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(extractMimeFromBytes(textBytes('Not Found'))).toBeNull();
  });
});

describe('parseFaviconCandidates', () => {
  it('extracts a simple <link rel="icon">', () => {
    const out = parseFaviconCandidates('<link rel="icon" href="/favicon.png">');
    expect(out).toEqual([{ href: '/favicon.png', relKind: 'icon', maxSize: 0 }]);
  });

  it('extracts apple-touch-icon', () => {
    const out = parseFaviconCandidates('<link rel="apple-touch-icon" href="/apple.png" sizes="180x180">');
    expect(out).toEqual([{ href: '/apple.png', relKind: 'apple-touch-icon', maxSize: 180 }]);
  });

  it('maps apple-touch-icon-precomposed to the apple-touch-icon kind', () => {
    const out = parseFaviconCandidates('<link rel="apple-touch-icon-precomposed" href="/apple.png">');
    expect(out[0].relKind).toBe('apple-touch-icon');
  });

  it('extracts shortcut icon as its own kind (not plain icon)', () => {
    const out = parseFaviconCandidates('<link rel="shortcut icon" href="/old.ico">');
    expect(out).toEqual([{ href: '/old.ico', relKind: 'shortcut-icon', maxSize: 0 }]);
  });

  it('ignores non-icon rels like stylesheet or preload', () => {
    const html = [
      '<link rel="stylesheet" href="/style.css">',
      '<link rel="preload" href="/hero.jpg" as="image">',
      '<link rel="canonical" href="https://example.com/">',
    ].join('\n');
    expect(parseFaviconCandidates(html)).toEqual([]);
  });

  it('skips tags without href', () => {
    expect(parseFaviconCandidates('<link rel="icon">')).toEqual([]);
  });

  it('skips hrefs that start with #', () => {
    expect(parseFaviconCandidates('<link rel="icon" href="#">')).toEqual([]);
  });

  it('parses sizes attribute with multiple dimensions, picking the largest', () => {
    const out = parseFaviconCandidates('<link rel="icon" href="/x.png" sizes="16x16 32x32 64x64">');
    expect(out[0].maxSize).toBe(64);
  });

  it('treats sizes="any" as effectively infinite', () => {
    const out = parseFaviconCandidates('<link rel="icon" href="/svg.svg" sizes="any">');
    expect(out[0].maxSize).toBeGreaterThan(1000);
  });

  it('handles non-square sizes by taking max dim', () => {
    const out = parseFaviconCandidates('<link rel="icon" href="/x.png" sizes="32x64">');
    expect(out[0].maxSize).toBe(64);
  });

  it('works when attributes are in href-first order', () => {
    const out = parseFaviconCandidates('<link href="/x.png" rel="icon">');
    expect(out).toEqual([{ href: '/x.png', relKind: 'icon', maxSize: 0 }]);
  });

  it('collects multiple link tags from the same document', () => {
    const html = [
      '<link rel="icon" href="/16.png" sizes="16x16">',
      '<link rel="icon" href="/32.png" sizes="32x32">',
      '<link rel="apple-touch-icon" href="/180.png" sizes="180x180">',
    ].join('\n');
    expect(parseFaviconCandidates(html)).toHaveLength(3);
  });

  it('is case-insensitive on tag, attribute, and rel value', () => {
    const out = parseFaviconCandidates('<LINK REL="ICON" HREF="/X.PNG">');
    expect(out).toEqual([{ href: '/X.PNG', relKind: 'icon', maxSize: 0 }]);
  });

  it('accepts single-quoted attributes', () => {
    const out = parseFaviconCandidates("<link rel='icon' href='/x.png'>");
    expect(out).toEqual([{ href: '/x.png', relKind: 'icon', maxSize: 0 }]);
  });

  it('ignores icon rels with spurious additional tokens only (alternate icon is still icon)', () => {
    // rel="alternate icon" is an icon; rel="alternate" alone is not.
    expect(parseFaviconCandidates('<link rel="alternate icon" href="/x.ico">')).toHaveLength(1);
    expect(parseFaviconCandidates('<link rel="alternate" href="/x.html">')).toHaveLength(0);
  });
});

describe('sortFaviconCandidates', () => {
  const mk = (relKind: FaviconCandidate['relKind'], maxSize: number, href = `/${relKind}-${maxSize}`): FaviconCandidate => ({
    relKind, maxSize, href
  });

  it('orders apple-touch-icon before icon before shortcut-icon', () => {
    const sorted = sortFaviconCandidates([
      mk('shortcut-icon', 0),
      mk('icon', 32),
      mk('apple-touch-icon', 180),
    ]);
    expect(sorted.map(c => c.relKind)).toEqual(['apple-touch-icon', 'icon', 'shortcut-icon']);
  });

  it('within the same rel kind, larger declared sizes come first', () => {
    const sorted = sortFaviconCandidates([
      mk('icon', 16),
      mk('icon', 64),
      mk('icon', 32),
    ]);
    expect(sorted.map(c => c.maxSize)).toEqual([64, 32, 16]);
  });

  it('prefers any larger apple-touch-icon over bigger generic icon', () => {
    const sorted = sortFaviconCandidates([
      mk('icon', 512),
      mk('apple-touch-icon', 180),
    ]);
    expect(sorted[0].relKind).toBe('apple-touch-icon');
  });

  it('does not mutate the input array', () => {
    const input = [mk('icon', 32), mk('apple-touch-icon', 180)];
    const snapshot = [...input];
    sortFaviconCandidates(input);
    expect(input).toEqual(snapshot);
  });

  it('returns an empty array unchanged', () => {
    expect(sortFaviconCandidates([])).toEqual([]);
  });
});
