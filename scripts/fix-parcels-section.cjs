const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'app', '(dashboard)', 'acquisition-cases', '[id]', 'parcels-section.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the broken td block (lines 425-475) and replace it
// The broken block starts with the td containing the IIFE without JSX braces
const brokenBlock = /(<td style=\{\{ padding: '0\.875rem 1rem', verticalAlign: 'middle' \}\}>\r?\n)\s*\(\(\) => \{[\s\S]*?\}\)\(\)\r?\n(\s*<\/td>)/;

const fixedBlock = `<td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>
                        {(() => {
                          const statusBadge = item.isAccepted
                            ? { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)', label: '\\u2713 Verified & Accepted' }
                            : item.latestReportStatus === 'SUBMITTED'
                            ? { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)', label: '\\uD83D\\uDD12 Awaiting Review' }
                            : item.latestReportStatus === 'RETURNED_FOR_CORRECTION'
                            ? { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', label: '\\u21A9 Returned for Correction' }
                            : item.latestReportStatus === 'DISCREPANCY_FLAGGED'
                            ? { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)', label: '\\u26A0\\uFE0F Discrepancy Flagged' }
                            : item.latestReportStatus === 'DRAFT'
                            ? { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)', label: '\\u270E Draft' }
                            : { bg: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.25)', label: 'Pending Inspection' };
                          return (
                            <span
                              style={{
                                background: statusBadge.bg,
                                color: statusBadge.color,
                                border: \`1px solid \${statusBadge.border}\`,
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.6875rem',
                                fontWeight: 500,
                              }}
                              id={\`parcel-status-badge-\${parcel.parcelId}\`}
                            >
                              {statusBadge.label}
                            </span>
                          );
                        })()}
                      </td>`;

// Find the exact bad block using line numbers approach
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// Find the start of the broken td block - line 425 (0-indexed: 424)
// The broken td starts right after the proposedAffectedArea td
let startIdx = -1;
let endIdx = -1;

for (let i = 420; i < 430; i++) {
  const stripped = lines[i].replace(/\r/, '');
  if (stripped.includes("padding: '0.875rem 1rem', verticalAlign: 'middle'") && !stripped.includes('proposedAffectedArea') && !stripped.includes('textAlign')) {
    // Check if next line is broken IIFE (not JSX expression)
    const nextLine = (lines[i+1] || '').replace(/\r/, '');
    if (nextLine.trim().startsWith('(() =>')) {
      startIdx = i;
      console.log('Found broken td start at line:', i + 1);
      break;
    }
  }
}

if (startIdx === -1) {
  console.error('Could not find broken block start');
  process.exit(1);
}

// Find the end: the </td> after the IIFE
for (let i = startIdx + 1; i < startIdx + 60; i++) {
  const stripped = (lines[i] || '').replace(/\r/, '');
  if (stripped.trim() === '</td>') {
    endIdx = i;
    console.log('Found broken td end at line:', i + 1);
    break;
  }
}

if (endIdx === -1) {
  console.error('Could not find broken block end');
  process.exit(1);
}

// Get the indentation of the original td
const tdLine = lines[startIdx].replace(/\r/, '');
const indentMatch = tdLine.match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : '                      ';

// Build the fixed block with proper indentation and CRLF
const fixedLines = [
  `${indent}<td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle' }}>`,
  `${indent}  {(() => {`,
  `${indent}    const statusBadge = item.isAccepted`,
  `${indent}      ? { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)', label: '✓ Verified & Accepted' }`,
  `${indent}      : item.latestReportStatus === 'SUBMITTED'`,
  `${indent}      ? { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)', label: '🔒 Awaiting Review' }`,
  `${indent}      : item.latestReportStatus === 'RETURNED_FOR_CORRECTION'`,
  `${indent}      ? { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', label: '↩ Returned for Correction' }`,
  `${indent}      : item.latestReportStatus === 'DISCREPANCY_FLAGGED'`,
  `${indent}      ? { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)', label: '⚠️ Discrepancy Flagged' }`,
  `${indent}      : item.latestReportStatus === 'DRAFT'`,
  `${indent}      ? { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)', label: '✎ Draft' }`,
  `${indent}      : { bg: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.25)', label: 'Pending Inspection' };`,
  `${indent}    return (`,
  `${indent}      <span`,
  `${indent}        style={{`,
  `${indent}          background: statusBadge.bg,`,
  `${indent}          color: statusBadge.color,`,
  `${indent}          border: \`1px solid \${statusBadge.border}\`,`,
  `${indent}          padding: '0.2rem 0.5rem',`,
  `${indent}          borderRadius: '4px',`,
  `${indent}          fontSize: '0.6875rem',`,
  `${indent}          fontWeight: 500,`,
  `${indent}        }}`,
  `${indent}        id={\`parcel-status-badge-\${parcel.parcelId}\`}`,
  `${indent}      >`,
  `${indent}        {statusBadge.label}`,
  `${indent}      </span>`,
  `${indent}    );`,
  `${indent}  })()}`,
  `${indent}</td>`,
];

// Determine if file uses CRLF
const usesCRLF = content.includes('\r\n');
const eol = usesCRLF ? '\r\n' : '\n';

// Replace lines from startIdx to endIdx (inclusive)
const newLines = [
  ...lines.slice(0, startIdx),
  ...fixedLines.map(l => l + '\r'), // add \r for CRLF
  ...lines.slice(endIdx + 1),
];

const newContent = newLines.join('\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Fixed! Replaced lines', startIdx + 1, 'to', endIdx + 1);
console.log('New total lines:', newLines.length);

