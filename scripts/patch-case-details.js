const fs = require('fs');
let content = fs.readFileSync('src/app/(dashboard)/acquisition-cases/[id]/acquisition-case-details-client.tsx', 'utf8');

// 1. Add import
if (!content.includes('CaseVerificationReviewsSection')) {
  content = content.replace(
    "import { DiscrepanciesSection } from './discrepancies-section';",
    "import { DiscrepanciesSection } from './discrepancies-section';\r\nimport { CaseVerificationReviewsSection } from './case-verification-reviews-section';"
  );
}

// 2. Props interface
content = content.replace(
  'isSuperAdmin: boolean;',
  'isSuperAdmin: boolean;\r\n  isVerifiedLandOfficer?: boolean;'
);

// 3. Component signature
content = content.replace(
  'isSuperAdmin,\r\n}: AcquisitionCaseDetailsClientProps',
  'isSuperAdmin,\r\n  isVerifiedLandOfficer = true,\r\n}: AcquisitionCaseDetailsClientProps'
);

// 4. TabType
content = content.replace(
  "type TabType = 'OVERVIEW' | 'PARCELS' | 'DISCREPANCIES';",
  "type TabType = 'OVERVIEW' | 'PARCELS' | 'VERIFICATION' | 'DISCREPANCIES';"
);

// 5. Tab buttons - add VERIFICATION tab
const parcelsTabBtnEnd = 'id="tab-btn-parcels"\r\n        >\r\n          <span>Land Parcels</span>\r\n          <span\r\n            style={{\r\n              background: activeTab === \'PARCELS\' ? \'rgba(59, 130, 246, 0.25)\' : \'rgba(255, 255, 255, 0.08)\',\r\n              color: activeTab === \'PARCELS\' ? \'#93c5fd\' : \'#cbd5e1\',\r\n              borderRadius: \'9999px\',\r\n              padding: \'0.1rem 0.5rem\',\r\n              fontSize: \'0.6875rem\',\r\n              fontWeight: 700,\r\n            }}\r\n            id=\"tab-parcels-count\"\r\n          >\r\n            {parcelCount}\r\n          </span>\r\n        </button>';

const verificationTabBtn = '\r\n\r\n        <button\r\n          type="button"\r\n          onClick={() => setActiveTab(\'VERIFICATION\')}\r\n          style={{\r\n            padding: \'0.625rem 1.25rem\',\r\n            background: \'transparent\',\r\n            border: \'none\',\r\n            borderBottom: activeTab === \'VERIFICATION\' ? \'2px solid #3b82f6\' : \'2px solid transparent\',\r\n            color: activeTab === \'VERIFICATION\' ? \'#60a5fa\' : \'#94a3b8\',\r\n            fontWeight: 600,\r\n            fontSize: \'0.875rem\',\r\n            cursor: \'pointer\',\r\n            display: \'flex\',\r\n            alignItems: \'center\',\r\n            gap: \'0.5rem\',\r\n          }}\r\n          id="tab-btn-verification"\r\n        >\r\n          <span>Report Verification</span>\r\n          {verificationSummary && verificationSummary.reportsAwaitingReview > 0 && (\r\n            <span\r\n              style={{\r\n                background: activeTab === \'VERIFICATION\' ? \'rgba(59, 130, 246, 0.25)\' : \'rgba(255, 255, 255, 0.08)\',\r\n                color: activeTab === \'VERIFICATION\' ? \'#93c5fd\' : \'#cbd5e1\',\r\n                borderRadius: \'9999px\',\r\n                padding: \'0.1rem 0.5rem\',\r\n                fontSize: \'0.6875rem\',\r\n                fontWeight: 700,\r\n              }}\r\n              id="tab-verification-count"\r\n            >\r\n              {verificationSummary.reportsAwaitingReview}\r\n            </span>\r\n          )}\r\n        </button>';

content = content.replace(parcelsTabBtnEnd, parcelsTabBtnEnd + verificationTabBtn);

// 6. Review Awaiting Reports link -> button
content = content.replace(
  '<Link\r\n              href={`/verification-reviews?caseId=${caseId}`}\r\n              style={{\r\n                display: \'inline-flex\',\r\n                alignItems: \'center\',\r\n                gap: \'0.4rem\',\r\n                fontSize: \'0.8125rem\',\r\n                fontWeight: 600,\r\n                color: \'#60a5fa\',\r\n                background: \'rgba(59, 130, 246, 0.12)\',\r\n                border: \'1px solid rgba(59, 130, 246, 0.3)\',\r\n                borderRadius: \'6px\',\r\n                padding: \'0.4rem 0.75rem\',\r\n                textDecoration: \'none\',\r\n              }}\r\n              id="case-summary-review-queue-link"\r\n            >\r\n              Review Awaiting Reports ({verificationSummary.reportsAwaitingReview}) →\r\n            </Link>',
  '<button\r\n              type="button"\r\n              onClick={() => setActiveTab(\'VERIFICATION\')}\r\n              style={{\r\n                display: \'inline-flex\',\r\n                alignItems: \'center\',\r\n                gap: \'0.4rem\',\r\n                fontSize: \'0.8125rem\',\r\n                fontWeight: 600,\r\n                color: \'#60a5fa\',\r\n                background: \'rgba(59, 130, 246, 0.12)\',\r\n                border: \'1px solid rgba(59, 130, 246, 0.3)\',\r\n                borderRadius: \'6px\',\r\n                padding: \'0.4rem 0.75rem\',\r\n                cursor: \'pointer\',\r\n              }}\r\n              id="case-summary-review-queue-link"\r\n            >\r\n              Review Awaiting Reports ({verificationSummary.reportsAwaitingReview}) →\r\n            </button>'
);

// 7. Update ParcelsSection props and add CaseVerificationReviewsSection render
content = content.replace(
  'onCountChange={(cnt) => setParcelCount(cnt)}\r\n        />',
  'isVerifiedLandOfficer={isVerifiedLandOfficer}\r\n          onCountChange={(cnt) => setParcelCount(cnt)}\r\n        />'
);

const renderVerifSection = '\r\n\r\n      {activeTab === \'VERIFICATION\' && (\r\n        <CaseVerificationReviewsSection\r\n          caseId={caseId}\r\n          caseStatus={acqCase.status}\r\n          currentUserId={currentUserId}\r\n          userRoles={userRoles}\r\n          isSuperAdmin={isSuperAdmin}\r\n          isVerifiedLandOfficer={isVerifiedLandOfficer}\r\n          verificationSummary={verificationSummary}\r\n          onReviewDecisionRecorded={() => {\r\n            fetchVerificationSummary();\r\n            fetchParcelsCount();\r\n          }}\r\n        />\r\n      )}';

content = content.replace(
  'onCountChange={(cnts) => setDiscrepancyCounts(cnts)}\r\n        />\r\n      )}',
  'onCountChange={(cnts) => setDiscrepancyCounts(cnts)}\r\n        />\r\n      )}' + renderVerifSection
);

// 8. Update Summary Metrics Grid to explicitly show all 7 metrics clearly
const oldGrid = '<span style={{ fontSize: \'0.6875rem\', color: \'#94a3b8\', display: \'block\', textTransform: \'uppercase\', fontWeight: 600 }}>Parcels Submitted</span>\r\n            <span style={{ fontSize: \'1.25rem\', fontWeight: 700, color: \'#60a5fa\' }} id=\"summary-parcels-submitted\">\r\n              {verificationSummary?.parcelsWithSubmittedReports ?? 0}\r\n            </span>';

const newGrid = '<span style={{ fontSize: \'0.6875rem\', color: \'#94a3b8\', display: \'block\', textTransform: \'uppercase\', fontWeight: 600 }}>Awaiting Submission</span>\r\n            <span style={{ fontSize: \'1.25rem\', fontWeight: 700, color: \'#94a3b8\' }} id=\"summary-parcels-awaiting-sub\">\r\n              {verificationSummary?.parcelsAwaitingSubmission ?? ((verificationSummary?.totalParcels ?? parcelCount) - (verificationSummary?.parcelsWithSubmittedReports ?? 0))}\r\n            </span>\r\n          </div>\r\n\r\n          <div style={{ background: \'rgba(0,0,0,0.25)\', padding: \'0.75rem\', borderRadius: \'8px\', border: \'1px solid rgba(255,255,255,0.05)\' }}>\r\n            <span style={{ fontSize: \'0.6875rem\', color: \'#94a3b8\', display: \'block\', textTransform: \'uppercase\', fontWeight: 600 }}>Parcels Submitted</span>\r\n            <span style={{ fontSize: \'1.25rem\', fontWeight: 700, color: \'#60a5fa\' }} id=\"summary-parcels-submitted\">\r\n              {verificationSummary?.parcelsWithSubmittedReports ?? 0}\r\n            </span>';

content = content.replace(oldGrid, newGrid);

fs.writeFileSync('src/app/(dashboard)/acquisition-cases/[id]/acquisition-case-details-client.tsx', content, 'utf8');
console.log('Successfully patched acquisition-case-details-client.tsx');

