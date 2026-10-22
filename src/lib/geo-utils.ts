/**
 * Geodesic calculation and conversion utilities for project boundaries.
 */

/**
 * Computes the geodesic area of a GeoJSON Polygon or MultiPolygon in square meters
 * using the spherical excess formula on WGS84 ellipsoid mean radius (R = 6,378,137m).
 */
export function calculateGeodesicAreaSqm(
  geometry: { type: string; coordinates: unknown } | null | undefined
): number {
  if (!geometry || !geometry.coordinates) return 0;

  const RADIUS = 6378137;

  function calculateRingArea(ring: number[][]): number {
    if (!ring || ring.length < 3) return 0;
    let total = 0;
    const len = ring.length;

    for (let i = 0; i < len; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % len];
      if (!p1 || !p2) continue;

      const lon1 = (p1[0] * Math.PI) / 180;
      const lat1 = (p1[1] * Math.PI) / 180;
      const lon2 = (p2[0] * Math.PI) / 180;
      const lat2 = (p2[1] * Math.PI) / 180;

      total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    return Math.abs((total * RADIUS * RADIUS) / 2.0);
  }

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as number[][][];
    if (!coords || coords.length === 0) return 0;
    // Outer ring positive, interior holes subtracted
    let area = calculateRingArea(coords[0]);
    for (let i = 1; i < coords.length; i++) {
      area -= calculateRingArea(coords[i]);
    }
    return Math.max(0, area);
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    let total = 0;
    for (const poly of polys) {
      if (poly && poly.length > 0) {
        let polyArea = calculateRingArea(poly[0]);
        for (let i = 1; i < poly.length; i++) {
          polyArea -= calculateRingArea(poly[i]);
        }
        total += Math.max(0, polyArea);
      }
    }
    return total;
  }

  return 0;
}

/**
 * Converts area in square meters to specified unit.
 */
export function convertAreaFromSqm(
  areaSqm: number,
  targetUnit: string
): number {
  switch (targetUnit) {
    case 'HECTARE':
    case 'HECTARES':
      return areaSqm / 10000;
    case 'ACRE':
    case 'ACRES':
      return areaSqm / 4046.8564224;
    case 'SQ_KM':
      return areaSqm / 1000000;
    case 'SQ_M':
    default:
      return areaSqm;
  }
}

/**
 * Formats area value with appropriate unit suffix and decimal places.
 */
export function formatAreaWithUnit(
  areaSqm: number,
  unit: string = 'SQ_M'
): string {
  const converted = convertAreaFromSqm(areaSqm, unit);
  const precision = unit === 'SQ_M' ? 2 : 4;
  const numStr = converted.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: precision,
  });

  switch (unit) {
    case 'HECTARE':
      return `${numStr} ha`;
    case 'ACRE':
      return `${numStr} acres`;
    case 'SQ_KM':
      return `${numStr} sq km`;
    case 'SQ_M':
    default:
      return `${numStr} sq m`;
  }
}
