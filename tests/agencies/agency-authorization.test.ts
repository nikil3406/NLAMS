import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NextRequest } from 'next/server';

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnv();

import { db, client } from '../../db';
import { users } from '../../db/schema/users';
import { userRoles } from '../../db/schema/user-roles';
import { userAssignments } from '../../db/schema/user-assignments';
import { userImplementingAgencyAssignments } from '../../db/schema/user-implementing-agencies';
import { administrativeUnits } from '../../db/schema/administrative-units';
import { implementingAgencies } from '../../db/schema/implementing-agencies';
import { projects } from '../../db/schema/projects';
import { acquisitionCases, acquisitionCaseWorkflowHistory } from '../../db/schema/acquisition-cases';
import { roles } from '../../db/schema/roles';
import { eq, inArray } from 'drizzle-orm';
import { sessionService } from '../../src/services/auth/session.service';
import { passwordService } from '../../src/services/auth/password.service';
import { authConfig } from '../../src/config/auth';

// Route Handlers
import { POST as usersPostHandler } from '../../src/app/api/users/route';
import {
  GET as userAgencyGetHandler,
  POST as userAgencyPostHandler,
} from '../../src/app/api/users/[id]/implementing-agency/route';
import { DELETE as userRoleDeleteHandler } from '../../src/app/api/users/[id]/roles/[roleId]/route';
import { GET as projectsGetHandler, POST as projectsPostHandler } from '../../src/app/api/projects/route';
import { GET as projectDetailGetHandler, PATCH as projectDetailPatchHandler } from '../../src/app/api/projects/[id]/route';
import { POST as projectRegisterHandler } from '../../src/app/api/projects/[id]/register/route';
import { POST as projectReviewHandler } from '../../src/app/api/projects/[id]/review/route';
import { GET as casesGetHandler, POST as casesPostHandler } from '../../src/app/api/acquisition-cases/route';
import { GET as caseDetailGetHandler } from '../../src/app/api/acquisition-cases/[id]/route';
import { GET as inventoryDashboardHandler } from '../../src/app/api/verified-land-inventories/dashboard/route';
import { GET as proposalsGetHandler } from '../../src/app/api/acquisition-proposals/route';

function makeRequest(url: string, method: string, cookie: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = {
    cookie,
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Implementing Agency Association & Organization-Scoped Authorization', () => {
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCaseIds: string[] = [];
  const createdAgencyIds: string[] = [];

  let superAdminId: string;
  let superAdminCookie: string;

  let ministryAdminId: string;
  let ministryAdminCookie: string;

  let nhaiOfficerId: string;
  let nhaiOfficerCookie: string;

  let nhaiOfficer2Id: string;
  let nhaiOfficer2Cookie: string;

  let kpwdOfficerId: string;
  let kpwdOfficerCookie: string;

  let noAgencyOfficerId: string;
  let noAgencyOfficerCookie: string;

  let inactiveOfficerId: string;
  let inactiveOfficerCookie: string;

  let landOfficerId: string;
  let landOfficerCookie: string;

  let unitINDId: string;
  let unitKAId: string;
  let unitMHId: string;

  let nhaiAgencyId: string;
  let kpwdAgencyId: string;
  let inactiveAgencyId: string;

  let roleProjectOfficerId: string;
  let roleLandOfficerId: string;

  let ministryNhaiProjectId: string;
  let poNhaiProjectId: string;
  let nhaiCaseId: string;

  before(async () => {
    const [sa] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, process.env.SEED_ADMIN_EMAIL ?? 'admin@nlams.gov.in'))
      .limit(1);
    if (!sa) throw new Error('Super admin not found');
    superAdminId = sa.id;
    superAdminCookie = `${authConfig.cookieName}=${(await sessionService.createSession(superAdminId)).token}`;

    const [ind] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'IND')).limit(1);
    const [ka] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'KA')).limit(1);
    const [mh] = await db.select().from(administrativeUnits).where(eq(administrativeUnits.code, 'MH')).limit(1);
    unitINDId = ind.id;
    unitKAId = ka.id;
    unitMHId = mh.id;

    const [nhai] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'NHAI')).limit(1);
    const [kpwd] = await db.select().from(implementingAgencies).where(eq(implementingAgencies.code, 'KPWD')).limit(1);
    nhaiAgencyId = nhai.id;
    kpwdAgencyId = kpwd.id;

    const [inactiveAgency] = await db
      .insert(implementingAgencies)
      .values({
        code: `INACT-AG-${ts}`,
        name: `Inactive Agency ${ts}`,
        normalizedName: `inactiveagency${ts}`,
        agencyType: 'OTHER',
        status: 'INACTIVE',
        sourceUrl: 'https://example.gov.in',
        sourceVerifiedAt: new Date(),
      })
      .returning({ id: implementingAgencies.id });
    inactiveAgencyId = inactiveAgency.id;
    createdAgencyIds.push(inactiveAgencyId);

    const [maRole] = await db.select().from(roles).where(eq(roles.name, 'MINISTRY_ADMIN')).limit(1);
    const [poRole] = await db.select().from(roles).where(eq(roles.name, 'PROJECT_OFFICER')).limit(1);
    const [loRole] = await db.select().from(roles).where(eq(roles.name, 'LAND_OFFICER')).limit(1);
    roleProjectOfficerId = poRole.id;
    roleLandOfficerId = loRole.id;

    const pwdHash = await passwordService.hashPassword('TestPass@12345');

    async function createActor(
      name: string,
      email: string,
      roleId: string,
      unitId: string,
      agencyId?: string,
      status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'
    ) {
      const [u] = await db
        .insert(users)
        .values({ name, email, passwordHash: pwdHash, status })
        .returning({ id: users.id });
      createdUserIds.push(u.id);
      await db.insert(userRoles).values({ userId: u.id, roleId, assignedBy: superAdminId });
      await db.insert(userAssignments).values({
        userId: u.id,
        administrativeUnitId: unitId,
        assignedBy: superAdminId,
        startDate: '2026-01-01',
        status: 'ACTIVE',
      });
      if (agencyId) {
        await db.insert(userImplementingAgencyAssignments).values({
          userId: u.id,
          implementingAgencyId: agencyId,
          assignedBy: superAdminId,
          effectiveFrom: '2026-01-01',
          status: 'ACTIVE',
        });
      }
      const { token } = await sessionService.createSession(u.id);
      return { id: u.id, cookie: `${authConfig.cookieName}=${token}` };
    }

    const ma = await createActor(`Ministry Admin ${ts}`, `ma.${ts}@nlams.test`, maRole.id, unitINDId);
    ministryAdminId = ma.id;
    ministryAdminCookie = ma.cookie;

    const nhai1 = await createActor(`NHAI PO 1 ${ts}`, `nhai1.${ts}@nlams.test`, poRole.id, unitINDId, nhaiAgencyId);
    nhaiOfficerId = nhai1.id;
    nhaiOfficerCookie = nhai1.cookie;

    const nhai2 = await createActor(`NHAI PO 2 ${ts}`, `nhai2.${ts}@nlams.test`, poRole.id, unitINDId, nhaiAgencyId);
    nhaiOfficer2Id = nhai2.id;
    nhaiOfficer2Cookie = nhai2.cookie;

    const kpwd1 = await createActor(`KPWD PO ${ts}`, `kpwd.${ts}@nlams.test`, poRole.id, unitINDId, kpwdAgencyId);
    kpwdOfficerId = kpwd1.id;
    kpwdOfficerCookie = kpwd1.cookie;

    const noAg = await createActor(`No Agency PO ${ts}`, `noag.${ts}@nlams.test`, poRole.id, unitINDId);
    noAgencyOfficerId = noAg.id;
    noAgencyOfficerCookie = noAg.cookie;

    const inactPo = await createActor(
      `Inactive PO ${ts}`,
      `inact.${ts}@nlams.test`,
      poRole.id,
      unitINDId,
      nhaiAgencyId,
      'INACTIVE'
    );
    inactiveOfficerId = inactPo.id;
    inactiveOfficerCookie = inactPo.cookie;

    const lo = await createActor(`KA Land Officer ${ts}`, `lo.${ts}@nlams.test`, loRole.id, unitKAId);
    landOfficerId = lo.id;
    landOfficerCookie = lo.cookie;
  });

  after(async () => {
    if (createdCaseIds.length > 0) {
      await db.delete(acquisitionCaseWorkflowHistory).where(inArray(acquisitionCaseWorkflowHistory.caseId, createdCaseIds));
      await db.delete(acquisitionCases).where(inArray(acquisitionCases.id, createdCaseIds));
    }
    if (createdProjectIds.length > 0) {
      await db.delete(projects).where(inArray(projects.id, createdProjectIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdAgencyIds.length > 0) {
      await db.delete(implementingAgencies).where(inArray(implementingAgencies.id, createdAgencyIds));
    }
    await client.end();
  });

  // ── 1. User & Agency Association ──────────────────────────────────────────

  it('1.1 Project Officer creation with a valid active agency succeeds', async () => {
    const res = await usersPostHandler(
      makeRequest('http://localhost/api/users', 'POST', superAdminCookie, {
        name: `Created PO ${ts}`,
        email: `created.po.${ts}@nlams.test`,
        roleId: roleProjectOfficerId,
        administrativeUnitId: unitKAId,
        implementingAgencyId: nhaiAgencyId,
      })
    );
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.success, true);
    assert.equal(json.data.activeImplementingAgency.id, nhaiAgencyId);
    createdUserIds.push(json.data.id);
  });

  it('1.2 Project Officer creation without an agency fails (400)', async () => {
    const res = await usersPostHandler(
      makeRequest('http://localhost/api/users', 'POST', superAdminCookie, {
        name: `Missing Agency PO ${ts}`,
        email: `missing.po.${ts}@nlams.test`,
        roleId: roleProjectOfficerId,
        administrativeUnitId: unitKAId,
      })
    );
    assert.equal(res.status, 400);
  });

  it('1.3 Project Officer creation with an invalid or inactive agency fails (400)', async () => {
    const res = await usersPostHandler(
      makeRequest('http://localhost/api/users', 'POST', superAdminCookie, {
        name: `Inactive Agency PO ${ts}`,
        email: `inact.ag.po.${ts}@nlams.test`,
        roleId: roleProjectOfficerId,
        administrativeUnitId: unitKAId,
        implementingAgencyId: inactiveAgencyId,
      })
    );
    assert.equal(res.status, 400);
  });

  it('1.4 Non-Project Officer roles do not require an agency', async () => {
    const res = await usersPostHandler(
      makeRequest('http://localhost/api/users', 'POST', superAdminCookie, {
        name: `Created LO ${ts}`,
        email: `created.lo.${ts}@nlams.test`,
        roleId: roleLandOfficerId,
        administrativeUnitId: unitKAId,
      })
    );
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.success, true);
    createdUserIds.push(json.data.id);
  });

  it('1.5 Unauthorized agency self-reassignment fails (403)', async () => {
    const res = await userAgencyPostHandler(
      makeRequest(`http://localhost/api/users/${nhaiOfficerId}/implementing-agency`, 'POST', nhaiOfficerCookie, {
        implementingAgencyId: kpwdAgencyId,
      }),
      { params: Promise.resolve({ id: nhaiOfficerId }) }
    );
    assert.equal(res.status, 403);
  });

  it('1.6 Admin agency reassignment preserves historical records', async () => {
    const res = await userAgencyPostHandler(
      makeRequest(`http://localhost/api/users/${nhaiOfficer2Id}/implementing-agency`, 'POST', superAdminCookie, {
        implementingAgencyId: kpwdAgencyId,
      }),
      { params: Promise.resolve({ id: nhaiOfficer2Id }) }
    );
    assert.equal(res.status, 201);

    const histRes = await userAgencyGetHandler(
      makeRequest(`http://localhost/api/users/${nhaiOfficer2Id}/implementing-agency`, 'GET', superAdminCookie),
      { params: Promise.resolve({ id: nhaiOfficer2Id }) }
    );
    const histJson = await histRes.json();
    assert.equal(histRes.status, 200);
    assert.equal(histJson.data.length, 2);
    assert.equal(histJson.data.filter((a: { status: string }) => a.status === 'ACTIVE').length, 1);
    assert.equal(histJson.data.filter((a: { status: string }) => a.status === 'INACTIVE').length, 1);

    // Reassign back to NHAI for subsequent review tests
    await userAgencyPostHandler(
      makeRequest(`http://localhost/api/users/${nhaiOfficer2Id}/implementing-agency`, 'POST', superAdminCookie, {
        implementingAgencyId: nhaiAgencyId,
      }),
      { params: Promise.resolve({ id: nhaiOfficer2Id }) }
    );
  });

  // ── 2. Project Creation & Ownership ───────────────────────────────────────

  it('2.1 Ministry Admin can create a project with a valid selected agency', async () => {
    const res = await projectsPostHandler(
      makeRequest('http://localhost/api/projects', 'POST', ministryAdminCookie, {
        name: `Ministry NHAI Highway ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: nhaiAgencyId,
        administrativeUnitId: unitKAId,
      })
    );
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.implementingAgencyId, nhaiAgencyId);
    assert.equal(json.data.createdBy, ministryAdminId);
    ministryNhaiProjectId = json.data.id;
    createdProjectIds.push(ministryNhaiProjectId);
  });

  it('2.2 Ministry Admin cannot create a project with an inactive agency', async () => {
    const res = await projectsPostHandler(
      makeRequest('http://localhost/api/projects', 'POST', ministryAdminCookie, {
        name: `Ministry Inactive Agency ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: inactiveAgencyId,
        administrativeUnitId: unitKAId,
      })
    );
    assert.equal(res.status, 400);
  });

  it('2.3 Project Officer automatically uses their associated agency when omitted', async () => {
    const res = await projectsPostHandler(
      makeRequest('http://localhost/api/projects', 'POST', nhaiOfficerCookie, {
        name: `PO NHAI Highway ${ts}`,
        projectType: 'Highway',
        administrativeUnitId: unitKAId,
      })
    );
    const json = await res.json();
    assert.equal(res.status, 201);
    assert.equal(json.data.implementingAgencyId, nhaiAgencyId);
    assert.equal(json.data.createdBy, nhaiOfficerId);
    poNhaiProjectId = json.data.id;
    createdProjectIds.push(poNhaiProjectId);
  });

  it('2.4 Project Officer cannot override their agency using a manipulated request (403)', async () => {
    const res = await projectsPostHandler(
      makeRequest('http://localhost/api/projects', 'POST', nhaiOfficerCookie, {
        name: `PO Spoofed KPWD ${ts}`,
        projectType: 'Highway',
        implementingAgencyId: kpwdAgencyId,
        administrativeUnitId: unitKAId,
      })
    );
    assert.equal(res.status, 403);
  });

  it('2.5 Project Officer without agency cannot create a project (403)', async () => {
    const res = await projectsPostHandler(
      makeRequest('http://localhost/api/projects', 'POST', noAgencyOfficerCookie, {
        name: `No Agency Project ${ts}`,
        projectType: 'Highway',
        administrativeUnitId: unitKAId,
      })
    );
    assert.equal(res.status, 403);
  });

  it('2.6 Ordinary project editing cannot reassign implementingAgencyId (403)', async () => {
    const res = await projectDetailPatchHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}`, 'PATCH', nhaiOfficerCookie, {
        implementingAgencyId: kpwdAgencyId,
      }),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    assert.equal(res.status, 403);
  });

  // ── 3. Agency-Specific Project Review ─────────────────────────────────────

  it('3.1 Register both projects for review', async () => {
    const r1 = await projectRegisterHandler(
      makeRequest(`http://localhost/api/projects/${ministryNhaiProjectId}/register`, 'POST', ministryAdminCookie),
      { params: Promise.resolve({ id: ministryNhaiProjectId }) }
    );
    assert.equal(r1.status, 200);

    const r2 = await projectRegisterHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}/register`, 'POST', nhaiOfficerCookie),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    assert.equal(r2.status, 200);
  });

  it('3.2 KPWD Project Officer cannot review Ministry-created NHAI project (403)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${ministryNhaiProjectId}/review`, 'POST', kpwdOfficerCookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: ministryNhaiProjectId }) }
    );
    assert.equal(res.status, 403);
  });

  it('3.3 Same-agency Project Officer cannot review another Project Officer-created project (403)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}/review`, 'POST', nhaiOfficer2Cookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    assert.equal(res.status, 403);
  });

  it('3.4 Inactive Project Officer cannot review Ministry-created NHAI project (401/403)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${ministryNhaiProjectId}/review`, 'POST', inactiveOfficerCookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: ministryNhaiProjectId }) }
    );
    assert.ok(res.status === 401 || res.status === 403, `Expected 401 or 403, got ${res.status}`);
  });

  it('3.5 Original creator cannot review their own project (403)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${ministryNhaiProjectId}/review`, 'POST', ministryAdminCookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: ministryNhaiProjectId }) }
    );
    assert.equal(res.status, 403);
  });

  it('3.6 NHAI Project Officer can review eligible Ministry-created NHAI project (200)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${ministryNhaiProjectId}/review`, 'POST', nhaiOfficerCookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: ministryNhaiProjectId }) }
    );
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.status, 'ACCEPTED');
  });

  it('3.7 Authorized Ministry Admin can review Project Officer-created project (200)', async () => {
    const res = await projectReviewHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}/review`, 'POST', ministryAdminCookie, {
        decision: 'ACCEPT',
      }),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data.status, 'ACCEPTED');
  });

  // ── 4. Downstream Organization-Scoped Authorization ───────────────────────

  it('4.1 Land Officer creates acquisition case on NHAI project; cross-agency PO is blocked from case and project', async () => {
    const caseRes = await casesPostHandler(
      makeRequest('http://localhost/api/acquisition-cases', 'POST', landOfficerCookie, {
        projectId: poNhaiProjectId,
        title: `NHAI Acq Case ${ts}`,
      })
    );
    const caseJson = await caseRes.json();
    assert.equal(caseRes.status, 201);
    nhaiCaseId = caseJson.data.id;
    createdCaseIds.push(nhaiCaseId);

    // NHAI PO can view project & case
    const nhaiProjRes = await projectDetailGetHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}`, 'GET', nhaiOfficerCookie),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    assert.equal(nhaiProjRes.status, 200);

    const nhaiCaseRes = await caseDetailGetHandler(
      makeRequest(`http://localhost/api/acquisition-cases/${nhaiCaseId}`, 'GET', nhaiOfficerCookie),
      { params: Promise.resolve({ id: nhaiCaseId }) }
    );
    assert.equal(nhaiCaseRes.status, 200);

    // KPWD PO cannot view NHAI project or NHAI case (404 anti-enumeration)
    const kpwdProjRes = await projectDetailGetHandler(
      makeRequest(`http://localhost/api/projects/${poNhaiProjectId}`, 'GET', kpwdOfficerCookie),
      { params: Promise.resolve({ id: poNhaiProjectId }) }
    );
    assert.equal(kpwdProjRes.status, 404);

    const kpwdCaseRes = await caseDetailGetHandler(
      makeRequest(`http://localhost/api/acquisition-cases/${nhaiCaseId}`, 'GET', kpwdOfficerCookie),
      { params: Promise.resolve({ id: nhaiCaseId }) }
    );
    assert.equal(kpwdCaseRes.status, 404);
  });

  it('4.2 List endpoints return only authorized agency records (and empty for agency-less PO)', async () => {
    const noAgProjRes = await projectsGetHandler(
      makeRequest('http://localhost/api/projects', 'GET', noAgencyOfficerCookie)
    );
    const noAgProjJson = await noAgProjRes.json();
    assert.equal(noAgProjRes.status, 200);
    assert.equal(noAgProjJson.data.length, 0);

    const kpwdCasesRes = await casesGetHandler(
      makeRequest('http://localhost/api/acquisition-cases', 'GET', kpwdOfficerCookie)
    );
    const kpwdCasesJson = await kpwdCasesRes.json();
    assert.equal(kpwdCasesRes.status, 200);
    assert.equal(kpwdCasesJson.data.some((c: { id: string }) => c.id === nhaiCaseId), false);

    const noAgInvRes = await inventoryDashboardHandler(
      makeRequest('http://localhost/api/verified-land-inventories/dashboard', 'GET', noAgencyOfficerCookie)
    );
    const noAgInvJson = await noAgInvRes.json();
    assert.equal(noAgInvRes.status, 200);
    assert.equal(noAgInvJson.data.length, 0);
    assert.equal(noAgInvJson.summary.total, 0);

    const noAgPropRes = await proposalsGetHandler(
      makeRequest('http://localhost/api/acquisition-proposals', 'GET', noAgencyOfficerCookie)
    );
    const noAgPropJson = await noAgPropRes.json();
    assert.equal(noAgPropRes.status, 200);
    assert.equal(noAgPropJson.data.length, 0);
  });

  it('4.3 Revoking PROJECT_OFFICER role deactivates agency assignment without deleting history', async () => {
    // Assign LAND_OFFICER role to nhaiOfficer2 first so they retain >= 1 role, then revoke PROJECT_OFFICER
    const [u] = await db
      .insert(users)
      .values({
        name: `MultiRole PO ${ts}`,
        email: `multirole.${ts}@nlams.test`,
        passwordHash: await passwordService.hashPassword('TestPass@12345'),
        status: 'ACTIVE',
      })
      .returning({ id: users.id });
    createdUserIds.push(u.id);
    await db.insert(userRoles).values([
      { userId: u.id, roleId: roleProjectOfficerId, assignedBy: superAdminId },
      { userId: u.id, roleId: roleLandOfficerId, assignedBy: superAdminId },
    ]);
    await db.insert(userAssignments).values({
      userId: u.id,
      administrativeUnitId: unitKAId,
      assignedBy: superAdminId,
      startDate: '2026-01-01',
      status: 'ACTIVE',
    });
    await db.insert(userImplementingAgencyAssignments).values({
      userId: u.id,
      implementingAgencyId: nhaiAgencyId,
      assignedBy: superAdminId,
      effectiveFrom: '2026-01-01',
      status: 'ACTIVE',
    });

    const delRes = await userRoleDeleteHandler(
      makeRequest(`http://localhost/api/users/${u.id}/roles/${roleProjectOfficerId}`, 'DELETE', superAdminCookie),
      { params: Promise.resolve({ id: u.id, roleId: roleProjectOfficerId }) }
    );
    assert.equal(delRes.status, 200);

    const hist = await db
      .select()
      .from(userImplementingAgencyAssignments)
      .where(eq(userImplementingAgencyAssignments.userId, u.id));
    assert.equal(hist.length, 1);
    assert.equal(hist[0].status, 'INACTIVE');
  });
});
