import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema/index';

export interface AgencySeedDefinition {
  code: string;
  name: string;
  agencyType: 'CENTRAL_MINISTRY' | 'CENTRAL_PSU' | 'STATUTORY_AUTHORITY' | 'STATE_DEPARTMENT' | 'STATE_PSU' | 'OTHER';
  parentCode: string | null;
  adminUnitCode: string | null;
  officialWebsite: string | null;
  sourceUrl: string;
  sourceVerifiedAt: Date;
}

/**
 * Initial authoritative catalogue of government implementing agencies
 * verified against official Government of India and State of Karnataka portals.
 */
export const INITIAL_AGENCIES: AgencySeedDefinition[] = [
  {
    code: 'MORTH',
    name: 'Ministry of Road Transport and Highways',
    agencyType: 'CENTRAL_MINISTRY',
    parentCode: null,
    adminUnitCode: 'IND',
    officialWebsite: 'https://morth.gov.in/',
    sourceUrl: 'https://morth.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'NHAI',
    name: 'National Highways Authority of India',
    agencyType: 'STATUTORY_AUTHORITY',
    parentCode: 'MORTH',
    adminUnitCode: 'IND',
    officialWebsite: 'https://nhai.gov.in/',
    sourceUrl: 'https://nhai.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'NHIDCL',
    name: 'National Highways and Infrastructure Development Corporation Limited',
    agencyType: 'CENTRAL_PSU',
    parentCode: 'MORTH',
    adminUnitCode: 'IND',
    officialWebsite: 'https://nhidcl.com/',
    sourceUrl: 'https://nhidcl.com/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'MOR',
    name: 'Ministry of Railways',
    agencyType: 'CENTRAL_MINISTRY',
    parentCode: null,
    adminUnitCode: 'IND',
    officialWebsite: 'https://indianrailways.gov.in/',
    sourceUrl: 'https://indianrailways.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'RVNL',
    name: 'Rail Vikas Nigam Limited',
    agencyType: 'CENTRAL_PSU',
    parentCode: 'MOR',
    adminUnitCode: 'IND',
    officialWebsite: 'https://rvnl.org/',
    sourceUrl: 'https://rvnl.org/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'DFCCIL',
    name: 'Dedicated Freight Corridor Corporation of India Limited',
    agencyType: 'CENTRAL_PSU',
    parentCode: 'MOR',
    adminUnitCode: 'IND',
    officialWebsite: 'https://dfccil.com/',
    sourceUrl: 'https://dfccil.com/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'KPWD',
    name: 'Public Works Department, Government of Karnataka',
    agencyType: 'STATE_DEPARTMENT',
    parentCode: null,
    adminUnitCode: 'KA',
    officialWebsite: 'https://kpwd.karnataka.gov.in/',
    sourceUrl: 'https://www.karnataka.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'KRDCL',
    name: 'Karnataka Road Development Corporation Limited',
    agencyType: 'STATE_PSU',
    parentCode: 'KPWD',
    adminUnitCode: 'KA',
    officialWebsite: 'https://krdcl.karnataka.gov.in/',
    sourceUrl: 'https://krdcl.karnataka.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
  {
    code: 'BMRCL',
    name: 'Bangalore Metro Rail Corporation Limited',
    agencyType: 'STATE_PSU',
    parentCode: null,
    adminUnitCode: 'KA-BLR',
    officialWebsite: 'https://english.bmrc.co.in/',
    sourceUrl: 'https://www.karnataka.gov.in/',
    sourceVerifiedAt: new Date('2026-10-19T00:00:00.000Z'),
  },
];

export interface SeedResult {
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

export function normalizeAgencyName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Idempotently seeds the initial government implementing agencies catalogue.
 */
export async function seedImplementingAgencies(
  db: PostgresJsDatabase<typeof schema>
): Promise<SeedResult> {
  const result: SeedResult = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };

  // Step 1: Resolve administrative unit codes to IDs
  const adminUnits = await db
    .select({ id: schema.administrativeUnits.id, code: schema.administrativeUnits.code })
    .from(schema.administrativeUnits);

  const unitMap = new Map<string, string>();
  for (const u of adminUnits) {
    unitMap.set(u.code, u.id);
  }

  // Step 2: Seed parent-free agencies first, or insert all without parent foreign key first,
  // then update parentAgencyId to cleanly resolve hierarchy and prevent circular reference issues.
  const agencyIdByCode = new Map<string, string>();

  // Pass 1: Upsert agencies with parentAgencyId as null initially
  for (const item of INITIAL_AGENCIES) {
    const adminUnitId = item.adminUnitCode ? (unitMap.get(item.adminUnitCode) ?? null) : null;
    const normalizedName = normalizeAgencyName(item.name);

    const [existing] = await db
      .select()
      .from(schema.implementingAgencies)
      .where(eq(schema.implementingAgencies.code, item.code))
      .limit(1);

    if (!existing) {
      const [inserted] = await db
        .insert(schema.implementingAgencies)
        .values({
          code: item.code,
          name: item.name,
          normalizedName,
          agencyType: item.agencyType,
          parentAgencyId: null,
          administrativeUnitId: adminUnitId,
          officialWebsite: item.officialWebsite,
          status: 'ACTIVE',
          sourceUrl: item.sourceUrl,
          sourceVerifiedAt: item.sourceVerifiedAt,
        })
        .returning({ id: schema.implementingAgencies.id, code: schema.implementingAgencies.code });

      agencyIdByCode.set(inserted.code, inserted.id);
      result.inserted++;
      console.log(`  ✓ Agency created: ${item.name} (${item.code})`);
    } else {
      agencyIdByCode.set(existing.code, existing.id);

      // Check if update is needed
      const isDifferent =
        existing.name !== item.name ||
        existing.normalizedName !== normalizedName ||
        existing.agencyType !== item.agencyType ||
        existing.officialWebsite !== item.officialWebsite ||
        existing.sourceUrl !== item.sourceUrl ||
        existing.administrativeUnitId !== adminUnitId;

      if (isDifferent) {
        await db
          .update(schema.implementingAgencies)
          .set({
            name: item.name,
            normalizedName,
            agencyType: item.agencyType,
            administrativeUnitId: adminUnitId,
            officialWebsite: item.officialWebsite,
            sourceUrl: item.sourceUrl,
            sourceVerifiedAt: item.sourceVerifiedAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.implementingAgencies.id, existing.id));

        result.updated++;
        console.log(`  ↻ Agency updated: ${item.name} (${item.code})`);
      } else {
        result.unchanged++;
        console.log(`  ℹ Agency unchanged: ${item.name} (${item.code})`);
      }
    }
  }

  // Pass 2: Resolve parent relationships
  for (const item of INITIAL_AGENCIES) {
    if (!item.parentCode) continue;

    const currentId = agencyIdByCode.get(item.code);
    const parentId = agencyIdByCode.get(item.parentCode);

    if (currentId && parentId && currentId !== parentId) {
      await db
        .update(schema.implementingAgencies)
        .set({
          parentAgencyId: parentId,
          updatedAt: new Date(),
        })
        .where(eq(schema.implementingAgencies.id, currentId));
    }
  }

  return result;
}
