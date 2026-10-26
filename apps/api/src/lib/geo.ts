const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash. Precision 7 ≈ 153 m × 153 m: the public granularity of community reports. */
export function geohash(lat: number, lng: number, precision = 7): string {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180, hash = "", bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch <<= 1; lngHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

export function geohashCenter(hash: string): { lat: number; lng: number } {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180, even = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) throw new Error("INVALID_GEOHASH");
    for (let b = 4; b >= 0; b--) {
      const bitOn = (idx >> b) & 1;
      if (even) { const mid = (lngLo + lngHi) / 2; if (bitOn) lngLo = mid; else lngHi = mid; }
      else { const mid = (latLo + latHi) / 2; if (bitOn) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2 };
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type BBox = { west: number; south: number; east: number; north: number };
export function parseBBox(value: string | undefined | null, maxSpanDegrees = 1): BBox | null {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  if (east - west > maxSpanDegrees || north - south > maxSpanDegrees) return null;
  return { west, south, east, north };
}

/** Coarsen a coordinate for anything leaving the trust boundary (logs, public responses). */
export function coarsen(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
