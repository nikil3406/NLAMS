import { z } from 'zod';
import { OBSERVATION_CATEGORIES } from '../../../db/schema/acquisition-proposals';

export const createObservationSchema = z.object({
  observationCategory: z.enum(OBSERVATION_CATEGORIES, {
    errorMap: () => ({
      message: `Observation category must be one of: ${OBSERVATION_CATEGORIES.join(', ')}`,
    }),
  }),
  observationTitle: z
    .string()
    .trim()
    .min(2, { message: 'Observation title must be at least 2 characters' })
    .max(255, { message: 'Observation title must not exceed 255 characters' }),
  observationDescription: z
    .string()
    .trim()
    .min(5, { message: 'Observation description must be at least 5 characters' }),
  relatedSection: z
    .string()
    .trim()
    .max(100, { message: 'Related section must not exceed 100 characters' })
    .optional()
    .nullable(),
  relatedParcelId: z
    .string()
    .uuid({ message: 'Related parcel ID must be a valid UUID' })
    .optional()
    .nullable(),
  relatedDocumentId: z
    .string()
    .trim()
    .max(255, { message: 'Related document ID must not exceed 255 characters' })
    .optional()
    .nullable(),
});

export type CreateObservationInput = z.infer<typeof createObservationSchema>;
