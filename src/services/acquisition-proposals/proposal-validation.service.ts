import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../../db';
import { acquisitionProposalRepository } from '../../repositories/acquisition-proposal.repository';
import { verifiedLandInventoryRepository } from '../../repositories/verified-land-inventory.repository';
import { inventoryParcelSnapshots } from '../../../db/schema/verified-land-inventories';
import { acquisitionCases } from '../../../db/schema/acquisition-cases';
import { projects } from '../../../db/schema/projects';
import { administrativeUnits } from '../../../db/schema/administrative-units';
import { landParcels } from '../../../db/schema/land-parcels';
import {
  competentAuthorities,
  authorityJurisdictions,
  authorityUserAssignments,
  proposalAuthorityAssignments,
} from '../../../db/schema/competent-authorities';
import {
  type AcquisitionProposalVersion,
  type ProposalSupportingDocument,
} from '../../../db/schema/acquisition-proposals';
import { NotFoundError } from '../../types/errors';

export type ValidationStatus = 'PASSED' | 'FAILED' | 'WARNING';

export type ValidationCategory =
  | 'COMPLETENESS'
  | 'INVENTORY_CONSISTENCY'
  | 'AREA_AND_PARCEL'
  | 'DOCUMENTS'
  | 'COMPETENT_AUTHORITY';

export interface ValidationCheck {
  id: string;
  category: ValidationCategory;
  name: string;
  description: string;
  status: ValidationStatus;
  message: string;
  correctiveAction?: string;
  isBlocking: boolean;
}

export interface ProposalValidationReport {
  overallResult: ValidationStatus;
  timestamp: string;
  proposalId: string;
  proposalNumber: string;
  versionNumber: number;
  hasBlockingErrors: boolean;
  checks: ValidationCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    blockingErrors: number;
  };
  missingInformation: string[];
  recommendedActions: string[];
}

export class ProposalValidationService {
  /**
   * Deterministically validates an acquisition proposal and its specified (or current) version.
   *
   * Rules enforced across 4 categories:
   * A. Completeness: Substantive justification, public purpose, legal framework, land requirement, admin approvals, documents.
   * B. Inventory Consistency: Approved status, case & project matching, exact version link, snapshots exist.
   * C. Area & Parcel Consistency: Non-negative, unit consistency, affected <= recorded, sum == aggregate.
   * D. Document Validation: Document structure, valid references, required categories.
   */
  async validateProposal(
    proposalId: string,
    targetVersionId?: string
  ): Promise<ProposalValidationReport> {
    const proposal = await acquisitionProposalRepository.findProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Acquisition proposal with ID '${proposalId}' not found`);
    }

    // Determine which version to validate
    let version: AcquisitionProposalVersion | null = null;
    if (targetVersionId) {
      const v = await acquisitionProposalRepository.findProposalVersionById(targetVersionId);
      if (!v || v.proposalId !== proposalId) {
        throw new NotFoundError(
          `Proposal version with ID '${targetVersionId}' does not belong to proposal '${proposalId}'`
        );
      }
      version = v;
    } else {
      version = proposal.currentVersion;
      if (!version) {
        const v = await acquisitionProposalRepository.findProposalVersionByNumber(
          proposalId,
          proposal.currentVersionNumber
        );
        version = v;
      }
    }

    if (!version) {
      throw new NotFoundError(
        `No proposal version found for validation on proposal '${proposal.proposalNumber}'`
      );
    }

    // Load linked inventory & parcel snapshots
    const inventory = await verifiedLandInventoryRepository.findInventoryWithDetails(
      proposal.linkedInventoryId
    );

    const snapshots = inventory
      ? await db
          .select()
          .from(inventoryParcelSnapshots)
          .where(eq(inventoryParcelSnapshots.inventoryId, inventory.id))
      : [];

    // Load case and project
    const [acqCase] = await db
      .select()
      .from(acquisitionCases)
      .where(eq(acquisitionCases.id, proposal.acquisitionCaseId))
      .limit(1);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, proposal.projectId))
      .limit(1);

    const checks: ValidationCheck[] = [];
    const missingInformation: string[] = [];
    const recommendedActions: string[] = [];

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY A: PROPOSAL COMPLETENESS
    // ────────────────────────────────────────────────────────────────────────

    // 1. Acquisition Justification
    const justification = version.acquisitionJustification?.trim() || '';
    if (!justification || justification.length < 20) {
      checks.push({
        id: 'COMPL-JUSTIFICATION',
        category: 'COMPLETENESS',
        name: 'Acquisition Justification',
        description: 'Verifies comprehensive justification for the proposed land acquisition',
        status: 'FAILED',
        message:
          justification.length === 0
            ? 'Acquisition justification is missing.'
            : 'Acquisition justification is too brief (minimum 20 characters required).',
        correctiveAction:
          'Provide a detailed acquisition justification explaining necessity, alignment, and lack of viable alternatives.',
        isBlocking: true,
      });
      missingInformation.push('Acquisition Justification');
      recommendedActions.push('Elaborate the substantive justification for land acquisition.');
    } else {
      checks.push({
        id: 'COMPL-JUSTIFICATION',
        category: 'COMPLETENESS',
        name: 'Acquisition Justification',
        description: 'Verifies comprehensive justification for the proposed land acquisition',
        status: 'PASSED',
        message: 'Acquisition justification is adequately documented.',
        isBlocking: true,
      });
    }

    // 2. Public Purpose
    const publicPurpose = version.publicPurpose?.trim() || '';
    if (!publicPurpose || publicPurpose.length < 10) {
      checks.push({
        id: 'COMPL-PUBLIC-PURPOSE',
        category: 'COMPLETENESS',
        name: 'Public Purpose',
        description: 'Verifies articulation of the statutory public purpose',
        status: 'FAILED',
        message:
          publicPurpose.length === 0
            ? 'Public purpose statement is missing.'
            : 'Public purpose statement is too brief (minimum 10 characters required).',
        correctiveAction:
          'Specify the statutory public purpose in accordance with the applicable acquisition legislation.',
        isBlocking: true,
      });
      missingInformation.push('Public Purpose');
      recommendedActions.push('Define the statutory public purpose clearly.');
    } else {
      checks.push({
        id: 'COMPL-PUBLIC-PURPOSE',
        category: 'COMPLETENESS',
        name: 'Public Purpose',
        description: 'Verifies articulation of the statutory public purpose',
        status: 'PASSED',
        message: 'Public purpose is adequately documented.',
        isBlocking: true,
      });
    }

    // 3. Applicable Legal Framework
    const legalFramework = version.legalFramework?.trim() || '';
    if (!legalFramework || legalFramework.length < 3) {
      checks.push({
        id: 'COMPL-LEGAL-FRAMEWORK',
        category: 'COMPLETENESS',
        name: 'Legal Framework',
        description: 'Verifies the governing statutory Act or legal framework',
        status: 'FAILED',
        message: 'Applicable legal framework is not specified.',
        correctiveAction:
          'Specify the statutory governing Act (e.g. RFCTLARR Act 2013 or applicable State/Sectoral Act).',
        isBlocking: true,
      });
      missingInformation.push('Legal Framework');
      recommendedActions.push('Select or specify the applicable governing Land Acquisition Act.');
    } else {
      checks.push({
        id: 'COMPL-LEGAL-FRAMEWORK',
        category: 'COMPLETENESS',
        name: 'Legal Framework',
        description: 'Verifies the governing statutory Act or legal framework',
        status: 'PASSED',
        message: `Applicable legal framework specified: ${legalFramework}.`,
        isBlocking: true,
      });
    }

    // 4. Land Requirement Explanation
    const landReq = version.landRequirementExplanation?.trim() || '';
    if (!landReq || landReq.length < 20) {
      checks.push({
        id: 'COMPL-LAND-REQUIREMENT',
        category: 'COMPLETENESS',
        name: 'Land Requirement Explanation',
        description: 'Verifies explanation of the land quantum and spatial requirements',
        status: 'FAILED',
        message:
          landReq.length === 0
            ? 'Land requirement explanation is missing.'
            : 'Land requirement explanation is too brief (minimum 20 characters required).',
        correctiveAction:
          'Provide a technical explanation of the land extent, right-of-way width, or site layout requirements.',
        isBlocking: true,
      });
      missingInformation.push('Land Requirement Explanation');
      recommendedActions.push('Detail the land quantum, layout, and right-of-way requirements.');
    } else {
      checks.push({
        id: 'COMPL-LAND-REQUIREMENT',
        category: 'COMPLETENESS',
        name: 'Land Requirement Explanation',
        description: 'Verifies explanation of the land quantum and spatial requirements',
        status: 'PASSED',
        message: 'Land requirement explanation is adequately documented.',
        isBlocking: true,
      });
    }

    // 5. Administrative Approval References
    const adminRef = version.administrativeApprovalRef?.trim();
    const adminDate = version.administrativeApprovalDate;
    if (adminRef) {
      if (!adminDate) {
        checks.push({
          id: 'COMPL-ADMIN-APPROVAL',
          category: 'COMPLETENESS',
          name: 'Administrative Approval Reference',
          description: 'Verifies administrative sanction order reference and approval date',
          status: 'WARNING',
          message: `Administrative approval reference '${adminRef}' provided, but approval date is missing.`,
          correctiveAction: 'Specify the date of the administrative sanction order.',
          isBlocking: false,
        });
        recommendedActions.push('Add the administrative sanction date.');
      } else {
        checks.push({
          id: 'COMPL-ADMIN-APPROVAL',
          category: 'COMPLETENESS',
          name: 'Administrative Approval Reference',
          description: 'Verifies administrative sanction order reference and approval date',
          status: 'PASSED',
          message: `Administrative approval '${adminRef}' dated ${new Date(adminDate).toLocaleDateString()} verified.`,
          isBlocking: false,
        });
      }
    } else {
      checks.push({
        id: 'COMPL-ADMIN-APPROVAL',
        category: 'COMPLETENESS',
        name: 'Administrative Approval Reference',
        description: 'Verifies administrative sanction order reference and approval date',
        status: 'WARNING',
        message: 'No administrative approval reference recorded.',
        correctiveAction:
          'Attach or record administrative sanction order reference if formal government clearance has been issued.',
        isBlocking: false,
      });
      recommendedActions.push('Record administrative approval reference if available.');
    }

    // 6. Supporting Documents Attached
    const docs = (version.supportingDocuments as ProposalSupportingDocument[]) || [];
    if (!docs || docs.length === 0) {
      checks.push({
        id: 'COMPL-SUPPORTING-DOCS',
        category: 'COMPLETENESS',
        name: 'Supporting Documents Presence',
        description: 'Verifies presence of required supporting documentation',
        status: 'FAILED',
        message: 'No supporting documents are attached to this proposal version.',
        correctiveAction:
          'Attach at least one supporting document (e.g. Administrative Sanction, Feasibility Report, Alignment Map).',
        isBlocking: true,
      });
      missingInformation.push('Supporting Documents');
      recommendedActions.push('Upload required supporting documents.');
    } else {
      checks.push({
        id: 'COMPL-SUPPORTING-DOCS',
        category: 'COMPLETENESS',
        name: 'Supporting Documents Presence',
        description: 'Verifies presence of required supporting documentation',
        status: 'PASSED',
        message: `${docs.length} supporting document(s) attached to proposal version.`,
        isBlocking: true,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY B: INVENTORY CONSISTENCY
    // ────────────────────────────────────────────────────────────────────────

    // 7. Linked Inventory Approval Status
    if (!inventory) {
      checks.push({
        id: 'INV-EXISTS',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Linked Inventory Existence',
        description: 'Verifies the referenced verified land inventory exists in the system',
        status: 'FAILED',
        message: `Referenced verified land inventory '${proposal.linkedInventoryId}' not found.`,
        correctiveAction: 'Relink a valid Ministry-approved land inventory.',
        isBlocking: true,
      });
    } else if (inventory.status !== 'APPROVED') {
      checks.push({
        id: 'INV-STATUS-APPROVED',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Inventory Ministry Approval Status',
        description: 'Verifies that the linked land inventory has Ministry-approved status',
        status: 'FAILED',
        message: `Linked inventory is in '${inventory.status}' status. Only 'APPROVED' inventories are eligible.`,
        correctiveAction:
          'The linked land inventory must be reviewed and approved by the Ministry before proposal submission.',
        isBlocking: true,
      });
    } else {
      checks.push({
        id: 'INV-STATUS-APPROVED',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Inventory Ministry Approval Status',
        description: 'Verifies that the linked land inventory has Ministry-approved status',
        status: 'PASSED',
        message: `Linked verified land inventory is Ministry-approved (version ${inventory.versionNumber}).`,
        isBlocking: true,
      });
    }

    // 8. Inventory Case Association
    if (inventory && inventory.caseId !== proposal.acquisitionCaseId) {
      checks.push({
        id: 'INV-CASE-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Inventory Case Association',
        description: 'Verifies that the linked inventory belongs to the proposal acquisition case',
        status: 'FAILED',
        message: 'The linked verified land inventory belongs to a different acquisition case.',
        correctiveAction:
          'Ensure the proposal links to the verified land inventory belonging to the same acquisition case.',
        isBlocking: true,
      });
    } else if (inventory) {
      checks.push({
        id: 'INV-CASE-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Inventory Case Association',
        description: 'Verifies that the linked inventory belongs to the proposal acquisition case',
        status: 'PASSED',
        message: 'Inventory corresponds to the proposal acquisition case.',
        isBlocking: true,
      });
    }

    // 9. Project Association
    if (acqCase && acqCase.projectId !== proposal.projectId) {
      checks.push({
        id: 'INV-PROJECT-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Project and Case Consistency',
        description: 'Verifies that the acquisition case belongs to the proposal project',
        status: 'FAILED',
        message: 'The acquisition case does not belong to the proposal project.',
        correctiveAction: 'Correct the acquisition case and project association.',
        isBlocking: true,
      });
    } else if (acqCase) {
      checks.push({
        id: 'INV-PROJECT-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Project and Case Consistency',
        description: 'Verifies that the acquisition case belongs to the proposal project',
        status: 'PASSED',
        message: 'Acquisition case and project associations are consistent.',
        isBlocking: true,
      });
    }

    // 10. Exact Inventory Version Reference
    if (
      inventory &&
      proposal.linkedInventoryVersionId &&
      proposal.linkedInventoryVersionId !== inventory.id
    ) {
      checks.push({
        id: 'INV-VERSION-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Exact Inventory Version Reference',
        description: 'Verifies the proposal references the exact Ministry-approved inventory version',
        status: 'FAILED',
        message:
          'Referenced inventory version does not match the current Ministry-approved inventory version.',
        correctiveAction:
          'Update the proposal to reference the exact Ministry-approved inventory version.',
        isBlocking: true,
      });
    } else if (inventory) {
      checks.push({
        id: 'INV-VERSION-MATCH',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Exact Inventory Version Reference',
        description: 'Verifies the proposal references the exact Ministry-approved inventory version',
        status: 'PASSED',
        message: `Proposal references exact approved inventory version ${inventory.versionNumber}.`,
        isBlocking: true,
      });
    }

    // 11. Inventory Snapshots Availability
    if (snapshots.length === 0) {
      checks.push({
        id: 'INV-PARCELS-VERIFIED',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Verified Parcel Snapshots',
        description: 'Verifies the approved inventory contains verified parcel snapshots',
        status: 'FAILED',
        message: 'No verified parcel snapshots exist in the linked inventory.',
        correctiveAction:
          'The linked inventory must contain verified parcel records before proceeding.',
        isBlocking: true,
      });
    } else {
      checks.push({
        id: 'INV-PARCELS-VERIFIED',
        category: 'INVENTORY_CONSISTENCY',
        name: 'Verified Parcel Snapshots',
        description: 'Verifies the approved inventory contains verified parcel snapshots',
        status: 'PASSED',
        message: `Inventory contains ${snapshots.length} verified parcel snapshot(s).`,
        isBlocking: true,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY C: AREA AND PARCEL CONSISTENCY
    // ────────────────────────────────────────────────────────────────────────

    // 12. Non-negative Areas
    if (inventory) {
      const recordedAreaNum = Number(inventory.aggregateRecordedArea);
      const affectedAreaNum = Number(inventory.aggregateAffectedArea);

      if (isNaN(affectedAreaNum) || affectedAreaNum <= 0) {
        checks.push({
          id: 'AREA-NON-NEGATIVE',
          category: 'AREA_AND_PARCEL',
          name: 'Valid Acquisition Area Extent',
          description: 'Verifies aggregate acquisition area is non-zero and positive',
          status: 'FAILED',
          message: `Aggregate affected area (${inventory.aggregateAffectedArea}) is invalid or non-positive.`,
          correctiveAction: 'Verify and regenerate land inventory with valid parcel areas.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AREA-NON-NEGATIVE',
          category: 'AREA_AND_PARCEL',
          name: 'Valid Acquisition Area Extent',
          description: 'Verifies aggregate acquisition area is non-zero and positive',
          status: 'PASSED',
          message: `Aggregate affected area is valid: ${inventory.aggregateAffectedArea} ${inventory.areaUnit}.`,
          isBlocking: true,
        });
      }

      // 13. Parcel-level Affected <= Recorded Check
      let parcelAreaViolations = 0;
      let unitMismatchCount = 0;
      let calculatedSumAffected = 0;

      for (const snap of snapshots) {
        const pRecorded = Number(snap.recordedArea);
        const pAffected = Number(snap.proposedAffectedArea);

        if (pAffected > pRecorded) {
          parcelAreaViolations++;
        }

        if (
          snap.proposedAffectedAreaUnit !== inventory.areaUnit ||
          snap.recordedAreaUnit !== inventory.areaUnit
        ) {
          unitMismatchCount++;
        }

        calculatedSumAffected += pAffected;
      }

      if (parcelAreaViolations > 0) {
        checks.push({
          id: 'AREA-PARCEL-EXCEEDS-RECORDED',
          category: 'AREA_AND_PARCEL',
          name: 'Parcel Affected vs Recorded Area',
          description: 'Verifies proposed affected area does not exceed total recorded parcel area',
          status: 'FAILED',
          message: `${parcelAreaViolations} parcel(s) have proposed affected area exceeding total recorded area.`,
          correctiveAction:
            'Adjust proposed affected areas on case parcels so they do not exceed recorded areas.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AREA-PARCEL-EXCEEDS-RECORDED',
          category: 'AREA_AND_PARCEL',
          name: 'Parcel Affected vs Recorded Area',
          description: 'Verifies proposed affected area does not exceed total recorded parcel area',
          status: 'PASSED',
          message: 'All parcel-level affected areas are within recorded area boundaries.',
          isBlocking: true,
        });
      }

      // 14. Unit of Measurement Consistency
      if (unitMismatchCount > 0) {
        checks.push({
          id: 'AREA-UNIT-CONSISTENCY',
          category: 'AREA_AND_PARCEL',
          name: 'Unit of Measurement Consistency',
          description: 'Verifies all parcel area units are standardized with the inventory unit',
          status: 'WARNING',
          message: `${unitMismatchCount} parcel snapshot(s) have area unit differing from inventory (${inventory.areaUnit}).`,
          correctiveAction: 'Standardize area units across all parcels to ensure consistency.',
          isBlocking: false,
        });
        recommendedActions.push('Standardize parcel area measurement units.');
      } else {
        checks.push({
          id: 'AREA-UNIT-CONSISTENCY',
          category: 'AREA_AND_PARCEL',
          name: 'Unit of Measurement Consistency',
          description: 'Verifies all parcel area units are standardized with the inventory unit',
          status: 'PASSED',
          message: `All parcels use consistent area unit: ${inventory.areaUnit}.`,
          isBlocking: false,
        });
      }

      // 15. Aggregate Sum Consistency
      const diff = Math.abs(calculatedSumAffected - affectedAreaNum);
      if (diff > 0.01) {
        checks.push({
          id: 'AREA-AGGREGATE-SUM',
          category: 'AREA_AND_PARCEL',
          name: 'Aggregate Area Mathematical Consistency',
          description: 'Verifies aggregate affected area equals sum of parcel-level affected areas',
          status: 'FAILED',
          message: `Aggregate affected area (${affectedAreaNum}) differs from parcel sum (${calculatedSumAffected.toFixed(4)}).`,
          correctiveAction:
            'Recalculate and synchronize parcel snapshots with aggregate inventory figures.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AREA-AGGREGATE-SUM',
          category: 'AREA_AND_PARCEL',
          name: 'Aggregate Area Mathematical Consistency',
          description: 'Verifies aggregate affected area equals sum of parcel-level affected areas',
          status: 'PASSED',
          message: `Aggregate affected area matches sum of parcel snapshots (${affectedAreaNum.toFixed(4)} ${inventory.areaUnit}).`,
          isBlocking: true,
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY D: DOCUMENT VALIDATION
    // ────────────────────────────────────────────────────────────────────────

    // 16. Document Structure and Integrity
    let invalidDocCount = 0;
    let missingDocRef = 0;

    for (const doc of docs) {
      if (!doc.documentType || !doc.title || doc.title.trim().length === 0) {
        invalidDocCount++;
      }
      if (!doc.fileUrl && !doc.documentNumber) {
        missingDocRef++;
      }
    }

    if (invalidDocCount > 0) {
      checks.push({
        id: 'DOC-STRUCTURE',
        category: 'DOCUMENTS',
        name: 'Supporting Document Structure',
        description: 'Verifies all attached documents have valid type and title definitions',
        status: 'FAILED',
        message: `${invalidDocCount} supporting document(s) have missing document type or title.`,
        correctiveAction: 'Ensure all documents specify valid document type and descriptive title.',
        isBlocking: true,
      });
    } else if (docs.length > 0) {
      checks.push({
        id: 'DOC-STRUCTURE',
        category: 'DOCUMENTS',
        name: 'Supporting Document Structure',
        description: 'Verifies all attached documents have valid type and title definitions',
        status: 'PASSED',
        message: 'All supporting documents have valid structural definitions.',
        isBlocking: true,
      });
    }

    // 17. Document Reference/URL
    if (missingDocRef > 0) {
      checks.push({
        id: 'DOC-REFERENCE',
        category: 'DOCUMENTS',
        name: 'Document Reference Identifiers',
        description: 'Verifies supporting documents include file links or formal order numbers',
        status: 'WARNING',
        message: `${missingDocRef} document(s) do not have a file reference URL or document number.`,
        correctiveAction:
          'Provide a document order number or file upload reference for each supporting document.',
        isBlocking: false,
      });
      recommendedActions.push('Add file references or order numbers to supporting documents.');
    } else if (docs.length > 0) {
      checks.push({
        id: 'DOC-REFERENCE',
        category: 'DOCUMENTS',
        name: 'Document Reference Identifiers',
        description: 'Verifies supporting documents include file links or formal order numbers',
        status: 'PASSED',
        message: 'All supporting documents contain valid file references or document numbers.',
        isBlocking: false,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // CATEGORY E: COMPETENT AUTHORITY VALIDATIONS
    // ────────────────────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const selectedAuthId = version.selectedAuthorityId;

    // Check whether any active competent authorities exist in the database
    const [existingAuthCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competentAuthorities)
      .where(eq(competentAuthorities.status, 'ACTIVE'));
    const systemHasAuthorities = (existingAuthCountRow?.count ?? 0) > 0;

    let authRecord: typeof competentAuthorities.$inferSelect | null = null;
    let activeJurisdictions: typeof authorityJurisdictions.$inferSelect[] = [];
    let activeAssignments: typeof authorityUserAssignments.$inferSelect[] = [];
    let activeProposalAuthAssign: typeof proposalAuthorityAssignments.$inferSelect | null = null;

    if (selectedAuthId) {
      const [auth] = await db
        .select()
        .from(competentAuthorities)
        .where(eq(competentAuthorities.id, selectedAuthId))
        .limit(1);
      authRecord = auth ?? null;

      if (authRecord) {
        activeJurisdictions = await db
          .select()
          .from(authorityJurisdictions)
          .where(
            and(
              eq(authorityJurisdictions.authorityId, authRecord.id),
              eq(authorityJurisdictions.status, 'ACTIVE'),
              sql`${authorityJurisdictions.effectiveFrom} <= ${today}::date`,
              or(
                sql`${authorityJurisdictions.effectiveUntil} IS NULL`,
                sql`${authorityJurisdictions.effectiveUntil} >= ${today}::date`
              )
            )
          );

        activeAssignments = await db
          .select()
          .from(authorityUserAssignments)
          .where(
            and(
              eq(authorityUserAssignments.authorityId, authRecord.id),
              eq(authorityUserAssignments.status, 'ACTIVE'),
              sql`${authorityUserAssignments.effectiveFrom} <= ${today}::date`,
              or(
                sql`${authorityUserAssignments.effectiveUntil} IS NULL`,
                sql`${authorityUserAssignments.effectiveUntil} >= ${today}::date`
              )
            )
          );
      }

      const [pAssign] = await db
        .select()
        .from(proposalAuthorityAssignments)
        .where(
          and(
            eq(proposalAuthorityAssignments.proposalId, proposal.id),
            eq(proposalAuthorityAssignments.proposalVersionId, version.id),
            eq(proposalAuthorityAssignments.authorityId, selectedAuthId),
            eq(proposalAuthorityAssignments.assignmentStatus, 'ACTIVE')
          )
        )
        .limit(1);
      activeProposalAuthAssign = pAssign ?? null;
    }

    // Resolve parcel geography for jurisdiction coverage check
    const allUnits = await db.select().from(administrativeUnits);
    const unitById = new Map(allUnits.map((u) => [u.id, u]));
    const unitByNameAndType = new Map<string, typeof allUnits[0]>();
    const unitByCode = new Map<string, typeof allUnits[0]>();

    for (const u of allUnits) {
      unitByNameAndType.set(`${u.type}:${u.name.trim().toLowerCase()}`, u);
      unitByCode.set(u.code.trim().toUpperCase(), u);
    }

    const parcelIds = Array.from(new Set(snapshots.map((s) => s.parcelId)));
    const parcelRows = parcelIds.length > 0
      ? await db.select().from(landParcels).where(inArray(landParcels.id, parcelIds))
      : [];
    const parcelMap = new Map(parcelRows.map((p) => [p.id, p]));

    interface ParcelGeo {
      stateId?: string;
      stateName: string;
      districtId?: string;
      districtName: string;
      talukId?: string;
      talukName?: string;
    }

    const resolvedParcels: ParcelGeo[] = [];
    const districtNames = new Set<string>();

    for (const snap of snapshots) {
      const physicalParcel = parcelMap.get(snap.parcelId);
      let stateId: string | undefined;
      let districtId: string | undefined;
      let talukId: string | undefined;

      if (physicalParcel?.administrativeUnitId) {
        let curr = unitById.get(physicalParcel.administrativeUnitId);
        while (curr) {
          if (curr.type === 'TALUK' && !talukId) talukId = curr.id;
          if (curr.type === 'DISTRICT' && !districtId) districtId = curr.id;
          if (curr.type === 'STATE' && !stateId) stateId = curr.id;
          if (!curr.parentId) break;
          curr = unitById.get(curr.parentId);
        }
      }

      if (!districtId && snap.district) {
        const found =
          unitByNameAndType.get(`DISTRICT:${snap.district.trim().toLowerCase()}`) ||
          unitByCode.get(snap.district.trim().toUpperCase());
        if (found) {
          districtId = found.id;
          if (!stateId && found.parentId) {
            stateId = found.parentId;
          }
        }
      }

      if (!stateId && snap.state) {
        const found =
          unitByNameAndType.get(`STATE:${snap.state.trim().toLowerCase()}`) ||
          unitByCode.get(snap.state.trim().toUpperCase());
        if (found) stateId = found.id;
      }

      districtNames.add(snap.district?.trim() || districtId || 'Unknown');

      resolvedParcels.push({
        stateId,
        stateName: snap.state,
        districtId,
        districtName: snap.district,
        talukId,
        talukName: snap.taluk,
      });
    }

    const isMultiDistrict = districtNames.size > 1;

    // 1. Check: AUTH-SELECTION (A Competent Authority must be selected)
    if (!selectedAuthId) {
      if (systemHasAuthorities) {
        checks.push({
          id: 'AUTH-SELECTION',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Selection',
          description: 'Verifies that a Competent Authority is selected during proposal preparation',
          status: 'FAILED',
          message: 'A Competent Authority has not been selected for this acquisition proposal version.',
          correctiveAction: 'Select an authorized Competent Authority whose jurisdiction covers the affected acquisition area.',
          isBlocking: true,
        });
        missingInformation.push('Competent Authority Selection');
        recommendedActions.push('Select an eligible Competent Authority before submitting the proposal.');
      } else {
        checks.push({
          id: 'AUTH-SELECTION',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Selection',
          description: 'Verifies that a Competent Authority is selected during proposal preparation',
          status: 'PASSED',
          message: 'No Competent Authorities configured in the system. Legacy authority validation bypassed.',
          isBlocking: false,
        });
      }
    } else {
      checks.push({
        id: 'AUTH-SELECTION',
        category: 'COMPETENT_AUTHORITY',
        name: 'Competent Authority Selection',
        description: 'Verifies that a Competent Authority is selected during proposal preparation',
        status: 'PASSED',
        message: 'A Competent Authority has been selected for this proposal version.',
        isBlocking: true,
      });
    }

    // 2. Check: AUTH-EXISTS (The selected authority must exist in the database)
    if (selectedAuthId) {
      if (!authRecord) {
        checks.push({
          id: 'AUTH-EXISTS',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Record',
          description: 'Verifies the selected Competent Authority exists in the database',
          status: 'FAILED',
          message: `Selected Competent Authority with ID '${selectedAuthId}' does not exist in the database.`,
          correctiveAction: 'Select a valid, registered Competent Authority.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-EXISTS',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Record',
          description: 'Verifies the selected Competent Authority exists in the database',
          status: 'PASSED',
          message: `Competent Authority '${authRecord.authorityName}' (${authRecord.authorityCode}) exists.`,
          isBlocking: true,
        });
      }
    }

    // 3. Check: AUTH-ACTIVE-STATUS (The authority must be active)
    if (authRecord) {
      if (authRecord.status !== 'ACTIVE') {
        checks.push({
          id: 'AUTH-ACTIVE-STATUS',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Status',
          description: 'Verifies the selected Competent Authority is active',
          status: 'FAILED',
          message: `Selected Competent Authority '${authRecord.authorityName}' is currently ${authRecord.status}. Only ACTIVE authorities may be selected.`,
          correctiveAction: 'Select an active Competent Authority or request administrator to activate this authority.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-ACTIVE-STATUS',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Status',
          description: 'Verifies the selected Competent Authority is active',
          status: 'PASSED',
          message: `Competent Authority '${authRecord.authorityName}' is in ACTIVE status.`,
          isBlocking: true,
        });
      }
    }

    // 4. Check: AUTH-EFFECTIVE-DATES (The authority must have valid effective dates)
    if (authRecord) {
      const isDateValid =
        authRecord.effectiveFrom <= today &&
        (!authRecord.effectiveUntil || authRecord.effectiveUntil >= today);

      if (!isDateValid) {
        checks.push({
          id: 'AUTH-EFFECTIVE-DATES',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Effective Dates',
          description: 'Verifies the authority effective period covers the current submission date',
          status: 'FAILED',
          message: `Selected Competent Authority '${authRecord.authorityName}' is not currently effective (Effective from ${authRecord.effectiveFrom} to ${authRecord.effectiveUntil || 'indefinite'}).`,
          correctiveAction: 'Select a currently effective Competent Authority.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-EFFECTIVE-DATES',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Effective Dates',
          description: 'Verifies the authority effective period covers the current submission date',
          status: 'PASSED',
          message: `Competent Authority effective period is valid (Effective from ${authRecord.effectiveFrom}).`,
          isBlocking: true,
        });
      }
    }

    // 5. Check: AUTH-JURISDICTION-CONFIG (The authority must have an active jurisdiction configuration)
    if (authRecord) {
      if (activeJurisdictions.length === 0) {
        checks.push({
          id: 'AUTH-JURISDICTION-CONFIG',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Jurisdiction Configuration',
          description: 'Verifies the authority has at least one active jurisdiction configuration',
          status: 'FAILED',
          message: `Selected Competent Authority '${authRecord.authorityName}' has no active jurisdiction configured.`,
          correctiveAction: 'Configure active jurisdictions for this authority before submitting the proposal.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-JURISDICTION-CONFIG',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Jurisdiction Configuration',
          description: 'Verifies the authority has at least one active jurisdiction configuration',
          status: 'PASSED',
          message: `Competent Authority has ${activeJurisdictions.length} active jurisdiction configuration(s).`,
          isBlocking: true,
        });
      }
    }

    // 6. Check: AUTH-JURISDICTION-COVERAGE (Jurisdiction covers all geographical areas; Option A for multi-district)
    if (authRecord && activeJurisdictions.length > 0 && resolvedParcels.length > 0) {
      if (isMultiDistrict && authRecord.authorityLevel === 'DISTRICT') {
        checks.push({
          id: 'AUTH-JURISDICTION-COVERAGE',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Jurisdiction Coverage',
          description: 'Verifies authority jurisdiction covers all affected parcels (Option A for multi-district cases)',
          status: 'FAILED',
          message: `Option A Violation: The acquisition case spans multiple districts (${Array.from(districtNames).join(', ')}). District-level authorities (${authRecord.authorityName}) are strictly excluded. A common higher authority (Regional, State, or Central) must be selected.`,
          correctiveAction: 'Select a common higher Competent Authority covering all affected districts, or seek administrative resolution.',
          isBlocking: true,
        });
      } else {
        const uncoveredParcels: string[] = [];
        for (const parcel of resolvedParcels) {
          const covered = activeJurisdictions.some((j) => {
            if (j.stateId && parcel.stateId && j.stateId !== parcel.stateId) {
              return false;
            }
            if (j.districtId) {
              if (!parcel.districtId || j.districtId !== parcel.districtId) {
                return false;
              }
              if (j.talukId && parcel.talukId && j.talukId !== parcel.talukId) {
                return false;
              }
            }
            return true;
          });

          if (!covered) {
            uncoveredParcels.push(`${parcel.districtName} (${parcel.talukName ?? 'all'})`);
          }
        }

        if (uncoveredParcels.length > 0) {
          const uniqueUncovered = Array.from(new Set(uncoveredParcels));
          checks.push({
            id: 'AUTH-JURISDICTION-COVERAGE',
            category: 'COMPETENT_AUTHORITY',
            name: 'Competent Authority Jurisdiction Coverage',
            description: 'Verifies authority jurisdiction covers all affected parcels',
            status: 'FAILED',
            message: `Selected Competent Authority '${authRecord.authorityName}' does not cover all affected areas. Missing coverage for: ${uniqueUncovered.join(', ')}. The case requires authorized administrative resolution.`,
            correctiveAction: 'Select a Competent Authority with comprehensive jurisdiction over all affected parcels, or request administrative jurisdiction assignment.',
            isBlocking: true,
          });
        } else {
          checks.push({
            id: 'AUTH-JURISDICTION-COVERAGE',
            category: 'COMPETENT_AUTHORITY',
            name: 'Competent Authority Jurisdiction Coverage',
            description: 'Verifies authority jurisdiction covers all affected parcels',
            status: 'PASSED',
            message: `Competent Authority jurisdiction fully covers all ${resolvedParcels.length} approved inventory parcel(s) across affected geography.`,
            isBlocking: true,
          });
        }
      }
    }

    // 7. Check: AUTH-USER-ASSIGNMENT (At least one active user assignment)
    if (authRecord) {
      if (activeAssignments.length === 0) {
        checks.push({
          id: 'AUTH-USER-ASSIGNMENT',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority User Assignment',
          description: 'Verifies the authority has at least one active authorized user assigned',
          status: 'FAILED',
          message: `Selected Competent Authority '${authRecord.authorityName}' has no active user assignments. At least one designated authority user is required for scrutiny routing.`,
          correctiveAction: 'Assign an active authorized officer to this Competent Authority in the administration panel.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-USER-ASSIGNMENT',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority User Assignment',
          description: 'Verifies the authority has at least one active authorized user assigned',
          status: 'PASSED',
          message: `Competent Authority has ${activeAssignments.length} active authorized user assignment(s).`,
          isBlocking: true,
        });
      }
    }

    // 8. Check: AUTH-SUBMISSION-VALIDITY (Authority remains valid at time of submission)
    if (authRecord) {
      const isConfigValid =
        authRecord.status === 'ACTIVE' &&
        authRecord.effectiveFrom <= today &&
        (!authRecord.effectiveUntil || authRecord.effectiveUntil >= today) &&
        activeJurisdictions.length > 0 &&
        activeAssignments.length > 0;

      if (!isConfigValid) {
        checks.push({
          id: 'AUTH-SUBMISSION-VALIDITY',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Submission Validity',
          description: 'Verifies the selected authority remains valid and ready for submission routing',
          status: 'FAILED',
          message: `Selected Competent Authority '${authRecord.authorityName}' has configuration or status deficiencies preventing formal submission.`,
          correctiveAction: 'Ensure the authority is active, has valid dates, active jurisdiction, and assigned users.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-SUBMISSION-VALIDITY',
          category: 'COMPETENT_AUTHORITY',
          name: 'Competent Authority Submission Validity',
          description: 'Verifies the selected authority remains valid and ready for submission routing',
          status: 'PASSED',
          message: `Competent Authority '${authRecord.authorityName}' configuration is fully verified and valid for submission.`,
          isBlocking: true,
        });
      }
    }

    // 9. Check: AUTH-PROPOSAL-ASSIGNMENT (Authority assignment must belong to proposal and version)
    if (selectedAuthId && authRecord) {
      if (!activeProposalAuthAssign) {
        checks.push({
          id: 'AUTH-PROPOSAL-ASSIGNMENT',
          category: 'COMPETENT_AUTHORITY',
          name: 'Proposal Authority Assignment Record',
          description: 'Verifies active proposal authority assignment record is present in the database',
          status: 'FAILED',
          message: `No ACTIVE proposal authority assignment record found for proposal version ${version.versionNumber}.`,
          correctiveAction: 'Re-select and save the Competent Authority on the proposal draft.',
          isBlocking: true,
        });
      } else {
        checks.push({
          id: 'AUTH-PROPOSAL-ASSIGNMENT',
          category: 'COMPETENT_AUTHORITY',
          name: 'Proposal Authority Assignment Record',
          description: 'Verifies active proposal authority assignment record is present in the database',
          status: 'PASSED',
          message: `Active proposal authority assignment record verified for version ${version.versionNumber}.`,
          isBlocking: true,
        });
      }
    }

    // 10. Check: AUTH-VERSION-SUBMISSION-STATE (Proposal must not have been submitted already in the same version)
    if (version.status !== 'DRAFT') {
      checks.push({
        id: 'AUTH-VERSION-SUBMISSION-STATE',
        category: 'COMPETENT_AUTHORITY',
        name: 'Proposal Version Submission State',
        description: 'Verifies proposal version has not been submitted previously',
        status: 'FAILED',
        message: `Proposal version ${version.versionNumber} has already been submitted (current status: '${version.status}'). The proposal cannot be resubmitted in the same version.`,
        correctiveAction: 'Use "Make Changes" to create the next proposal version if corrections were requested.',
        isBlocking: true,
      });
    } else {
      checks.push({
        id: 'AUTH-VERSION-SUBMISSION-STATE',
        category: 'COMPETENT_AUTHORITY',
        name: 'Proposal Version Submission State',
        description: 'Verifies proposal version has not been submitted previously',
        status: 'PASSED',
        message: `Proposal version ${version.versionNumber} is in editable DRAFT status ready for initial submission.`,
        isBlocking: true,
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // COMPUTE OVERALL SUMMARY & STATUS
    // ────────────────────────────────────────────────────────────────────────
    const passedCount = checks.filter((c) => c.status === 'PASSED').length;
    const failedCount = checks.filter((c) => c.status === 'FAILED').length;
    const warningCount = checks.filter((c) => c.status === 'WARNING').length;
    const blockingErrors = checks.filter(
      (c) => c.status === 'FAILED' && c.isBlocking
    ).length;

    const hasBlockingErrors = blockingErrors > 0;

    let overallResult: ValidationStatus = 'PASSED';
    if (hasBlockingErrors || failedCount > 0) {
      overallResult = 'FAILED';
    } else if (warningCount > 0) {
      overallResult = 'WARNING';
    }

    return {
      overallResult,
      timestamp: new Date().toISOString(),
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      versionNumber: version.versionNumber,
      hasBlockingErrors,
      checks,
      summary: {
        total: checks.length,
        passed: passedCount,
        failed: failedCount,
        warnings: warningCount,
        blockingErrors,
      },
      missingInformation: Array.from(new Set(missingInformation)),
      recommendedActions: Array.from(new Set(recommendedActions)),
    };
  }
}

export const proposalValidationService = new ProposalValidationService();

