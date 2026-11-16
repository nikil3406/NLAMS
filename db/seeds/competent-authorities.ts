import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema/index.js';

interface SeedResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export async function seedCompetentAuthorities(
  db: PostgresJsDatabase<typeof schema>
): Promise<SeedResult> {
  const result: SeedResult = { inserted: 0, updated: 0, skipped: 0 };

  // Fetch admin units to link jurisdictions
  const adminUnits = await db.select().from(schema.administrativeUnits);
  const unitByCode = new Map(adminUnits.map((u) => [u.code, u]));

  const kaState = unitByCode.get('KA');
  const blrDistrict = unitByCode.get('KA-BLR');
  const blrNorthTaluk = unitByCode.get('KA-BLR-N');
  const mysDistrict = unitByCode.get('KA-MYS');

  if (!kaState) {
    console.log('  ⚠ State KA not found, skipping competent authorities seed');
    return result;
  }

  const SEED_AUTHORITIES = [
    {
      authorityCode: 'CA-KA-BLR-DC',
      authorityName: 'Office of the Deputy Commissioner, Bengaluru Urban',
      designation: 'Deputy Commissioner',
      authorityLevel: 'DISTRICT' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: blrDistrict?.id ?? null,
        talukId: null,
      },
    },
    {
      authorityCode: 'CA-KA-BLR-SLAO',
      authorityName: 'Special Land Acquisition Officer, Bengaluru Urban District',
      designation: 'Special Land Acquisition Officer (SLAO)',
      authorityLevel: 'DISTRICT' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: blrDistrict?.id ?? null,
        talukId: blrNorthTaluk?.id ?? null,
      },
    },
    {
      authorityCode: 'CA-KA-MYS-DC',
      authorityName: 'Office of the Deputy Commissioner, Mysuru',
      designation: 'District Collector',
      authorityLevel: 'DISTRICT' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: mysDistrict?.id ?? null,
        talukId: null,
      },
    },
    {
      authorityCode: 'CA-KA-DIV-COMM',
      authorityName: 'Office of the Divisional Commissioner, Bengaluru Division',
      designation: 'Divisional Commissioner',
      authorityLevel: 'REGIONAL' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: blrDistrict?.id ?? null,
        talukId: null,
      },
    },
    {
      authorityCode: 'CA-KA-STATE-LA',
      authorityName: 'Karnataka State Land Acquisition Authority',
      designation: 'Designated State Government Authority',
      authorityLevel: 'STATE' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: null,
        talukId: null,
      },
    },
    {
      authorityCode: 'CA-CENTRAL-LA',
      authorityName: 'Central Land Acquisition & Scrutiny Authority',
      designation: 'Designated Central Government Authority',
      authorityLevel: 'CENTRAL' as const,
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveUntil: null,
      jurisdiction: {
        stateId: kaState.id,
        districtId: null,
        talukId: null,
      },
    },
  ];

  for (const auth of SEED_AUTHORITIES) {
    // Check if authority already exists
    const existing = await db
      .select()
      .from(schema.competentAuthorities)
      .where(eq(schema.competentAuthorities.authorityCode, auth.authorityCode))
      .limit(1);

    let authorityId: string;

    if (existing.length === 0) {
      const [inserted] = await db
        .insert(schema.competentAuthorities)
        .values({
          authorityCode: auth.authorityCode,
          authorityName: auth.authorityName,
          designation: auth.designation,
          authorityLevel: auth.authorityLevel,
          status: auth.status,
          effectiveFrom: auth.effectiveFrom,
          effectiveUntil: auth.effectiveUntil,
        })
        .returning({ id: schema.competentAuthorities.id });

      authorityId = inserted.id;
      result.inserted++;
      console.log(`  ✓ Competent Authority created: ${auth.authorityName} (${auth.authorityCode})`);
    } else {
      authorityId = existing[0].id;
      result.skipped++;
      console.log(`  ℹ Competent Authority exists:  ${auth.authorityName} (${auth.authorityCode})`);
    }

    // Check if jurisdiction already exists for this authority
    const existingJur = await db
      .select()
      .from(schema.authorityJurisdictions)
      .where(eq(schema.authorityJurisdictions.authorityId, authorityId))
      .limit(1);

    if (existingJur.length === 0 && auth.jurisdiction) {
      await db.insert(schema.authorityJurisdictions).values({
        authorityId,
        stateId: auth.jurisdiction.stateId,
        districtId: auth.jurisdiction.districtId,
        talukId: auth.jurisdiction.talukId,
        status: 'ACTIVE',
        effectiveFrom: auth.effectiveFrom,
        effectiveUntil: auth.effectiveUntil,
      });
      console.log(`    ↳ Jurisdiction linked`);
    }
  }

  return result;
}
