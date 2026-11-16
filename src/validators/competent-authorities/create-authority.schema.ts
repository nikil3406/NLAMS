import { z } from 'zod';

export const COMPETENT_AUTHORITY_DESIGNATIONS = [
  'District Collector',
  'Deputy Commissioner',
  'Special Land Acquisition Officer (SLAO)',
  'Land Acquisition Officer (LAO)',
  'Additional District Magistrate (ADM)',
  'Sub-Divisional Magistrate (SDM)',
  'Divisional Commissioner',
  'Designated State Government Authority',
  'Designated Central Government Authority',
  'Special Deputy Collector (Land Acquisition)',
] as const;

export type CompetentAuthorityDesignation =
  (typeof COMPETENT_AUTHORITY_DESIGNATIONS)[number];

export const createAuthoritySchema = z
  .object({
    authorityCode: z
      .string()
      .trim()
      .min(2, { message: 'Authority code must be at least 2 characters' })
      .max(50, { message: 'Authority code must not exceed 50 characters' }),
    authorityName: z
      .string()
      .trim()
      .min(2, { message: 'Authority name must be at least 2 characters' })
      .max(255, { message: 'Authority name must not exceed 255 characters' }),
    designation: z.enum(COMPETENT_AUTHORITY_DESIGNATIONS, {
      errorMap: () => ({
        message: 'Invalid designation. Must be one of the supported Competent Authority designations',
      }),
    }),
    authorityLevel: z.enum(['DISTRICT', 'REGIONAL', 'STATE', 'CENTRAL'], {
      errorMap: () => ({
        message: 'Authority level must be DISTRICT, REGIONAL, STATE, or CENTRAL',
      }),
    }),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective from date must be YYYY-MM-DD' }),
    effectiveUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Effective until date must be YYYY-MM-DD' })
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveUntil) {
        return new Date(data.effectiveUntil) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: 'Effective until date cannot be earlier than effective from date',
      path: ['effectiveUntil'],
    }
  );

export type CreateAuthorityInput = z.infer<typeof createAuthoritySchema>;

