/**
 * St. Paul AI System Auditor & Safe Self-Healing Engine
 * Inspects, diagnoses, and safely maintains application integrity.
 * Detects errors, prevents duplicate insertions, manages soft-deletions, and generates auditable repair plans.
 */

import { apiCall } from './api.ts';

export type OperatingMode = 'OBSERVE' | 'ASSIST' | 'AUTONOMOUS';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditFinding {
  id: string;
  severity: SeverityLevel;
  title: string;
  category: string;
  affectedCount: number;
  details: string;
  repairable: boolean;
  proposedAction?: string;
}

export interface ProposedRepairPlan {
  id: string;
  findingId: string;
  title: string;
  severity: SeverityLevel;
  riskLevel: 'LOW' | 'HIGH';
  impactSummary: string;
  beforeState: string;
  proposedChange: string;
  afterState: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'ROLLED_BACK';
  appliedAt?: string;
}

export interface TrashRecord {
  id: string;
  adminNo: string;
  name: string;
  gender: string;
  gradeClass: string;
  boardingStatus: string;
  deleted_at: string;
  deleted_by: string;
  deletion_reason: string;
}

/**
 * 1. Run Full System Audit
 */
export async function runFullSystemAudit(): Promise<{
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  findings: AuditFinding[];
}> {
  try {
    const res = await apiCall('/api/admin/system-audit');
    return {
      status: res.status || 'HEALTHY',
      findings: res.findings || []
    };
  } catch (err: any) {
    return {
      status: 'WARNING',
      findings: [
        {
          id: 'audit-api-error',
          severity: 'MEDIUM',
          title: 'Audit service communication warning',
          category: 'System Diagnostics',
          affectedCount: 1,
          details: `Unable to complete live database scan: ${err.message}`,
          repairable: false
        }
      ]
    };
  }
}

/**
 * 2. Pre-Insert Duplicate Check
 */
export async function checkStudentDuplicate(studentData: {
  adminNo?: string;
  name?: string;
  gradeClass?: string;
  dob?: string;
}): Promise<{
  duplicateFound: boolean;
  classification: 'Definitely duplicate' | 'Likely duplicate' | 'Possibly duplicate' | 'Not duplicate';
  reason?: string;
  existingStudent?: any;
}> {
  try {
    const res = await apiCall('/api/students/check-duplicate', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
    return res;
  } catch (err: any) {
    return {
      duplicateFound: false,
      classification: 'Not duplicate'
    };
  }
}

/**
 * 3. Generate Proposed Repair Plan (with Before/After State)
 */
export function generateProposedRepairPlan(finding: AuditFinding): ProposedRepairPlan {
  const isLowRisk = finding.severity === 'LOW';
  
  return {
    id: `repair-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    findingId: finding.id,
    title: `Repair: ${finding.title}`,
    severity: finding.severity,
    riskLevel: isLowRisk ? 'LOW' : 'HIGH',
    impactSummary: `Will affect ${finding.affectedCount} record(s) in category "${finding.category}".`,
    beforeState: `Current State:\n- Severity: ${finding.severity}\n- Issue: ${finding.details}\n- Affected Entries: ${finding.affectedCount}`,
    proposedChange: `Action Plan:\n- Safe cleanup & index recalculation\n- Record audit log entry\n- Verify post-change status`,
    afterState: `Expected Result:\n- Issue resolved\n- ${finding.affectedCount} record(s) normalized\n- Zero active data loss`,
    status: 'PENDING'
  };
}

/**
 * 4. Fetch Soft-Deleted Trash Records
 */
export async function fetchTrashRecords(): Promise<TrashRecord[]> {
  try {
    const res = await apiCall('/api/admin/trash');
    return res.trash || [];
  } catch (err) {
    return [];
  }
}

/**
 * 5. Restore Record from Trash
 */
export async function restoreTrashRecord(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await apiCall(`/api/admin/trash/restore/${id}`, { method: 'POST' });
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to restore record.'
    };
  }
}
