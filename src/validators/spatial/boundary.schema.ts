import { z } from 'zod';
import { ESTIMATED_AREA_UNITS } from '../../../db/schema/project-boundary-versions';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

function isValidCoordinate(coord: unknown): coord is [number, number] {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat < -90 || lat > 90) return false;
  return true;
}

function isValidLinearRing(ring: unknown): ring is number[][] {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  for (const pt of ring) {
    if (!isValidCoordinate(pt)) return false;
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  // Ring must be closed
  return first[0] === last[0] && first[1] === last[1];
}

export const geoJsonPolygonSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(z.array(z.array(z.number())))
      .min(1, { message: 'Polygon must have at least one ring (outer ring)' }),
  })
  .refine(
    (val) => {
      for (const ring of val.coordinates) {
        if (!isValidLinearRing(ring)) return false;
      }
      return true;
    },
    {
      message:
        'Invalid polygon geometry: rings must have at least 4 coordinates, valid lat/long (-180 to 180, -90 to 90), and be closed (first and last coordinate identical).',
    }
  );

export const geoJsonMultiPolygonSchema = z
  .object({
    type: z.literal('MultiPolygon'),
    coordinates: z
      .array(z.array(z.array(z.array(z.number()))))
      .min(1, { message: 'MultiPolygon must have at least one polygon' }),
  })
  .refine(
    (val) => {
      for (const poly of val.coordinates) {
        if (!Array.isArray(poly) || poly.length === 0) return false;
        for (const ring of poly) {
          if (!isValidLinearRing(ring)) return false;
        }
      }
      return true;
    },
    {
      message:
        'Invalid MultiPolygon geometry: all polygon rings must have at least 4 coordinates, valid lat/long (-180 to 180, -90 to 90), and be closed.',
    }
  );

export const geoJsonGeometrySchema = z.union([
  geoJsonPolygonSchema,
  geoJsonMultiPolygonSchema,
]);

export const projectBoundaryInputSchema = z.object({
  geometry: geoJsonGeometrySchema,
  estimatedLandArea: z
    .union([
      z.number().positive({ message: 'Estimated land area must be a positive number' }),
      z.string().regex(/^\d+(\.\d{1,4})?$/, {
        message: 'Estimated land area must be a valid positive number with up to 4 decimal places',
      }),
    ])
    .transform((val) => {
      const num = typeof val === 'number' ? val : parseFloat(val);
      if (num <= 0 || isNaN(num)) throw new Error('Estimated land area must be greater than 0');
      return num.toFixed(2);
    }),
  estimatedAreaUnit: z
    .string({ required_error: 'Estimated area unit is required' })
    .trim()
    .toUpperCase()
    .transform((val) => {
      if (val === 'SQ_METERS' || val === 'SQM' || val === 'SQUARE_METERS') return 'SQ_M';
      if (val === 'HECTARES' || val === 'HA') return 'HECTARE';
      if (val === 'ACRES' || val === 'AC') return 'ACRE';
      if (val === 'SQKM' || val === 'SQUARE_KILOMETERS') return 'SQ_KM';
      return val;
    })
    .refine(
      (val): val is (typeof ESTIMATED_AREA_UNITS)[number] =>
        (ESTIMATED_AREA_UNITS as readonly string[]).includes(val),
      {
        message: `Estimated area unit must be one of: ${ESTIMATED_AREA_UNITS.join(', ')}`,
      }
    ),
  changeReason: z
    .string()
    .trim()
    .max(500, { message: 'Change reason cannot exceed 500 characters' })
    .optional()
    .nullable(),
});

export type ProjectBoundaryInput = z.infer<typeof projectBoundaryInputSchema>;
