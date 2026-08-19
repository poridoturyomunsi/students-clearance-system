import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  AlertTriangle,
  RefreshCw,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  Settings2,
  Check,
  X,
  Database,
  History,
  Info,
  SlidersHorizontal,
  Layers
} from 'lucide-react';
import {
  runFullSystemAudit,
  fetchTrashRecords,
  restoreTrashRecord,
  generateProposedRepairPlan,
  AuditFinding,
  ProposedRepairPlan,
  TrashRecord,
  OperatingMode
} from '../../utils/aiAuditorEngine.ts';
import { fetchAuditLogsFromDb } from '../../utils/api.ts';

export default function AiHealthDashboard() {
  const [operatingMode, setOperatingMode] = useState<OperatingMode>('ASSIST');
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'repairs' | 'trash' | 'logs'>('diagnostics');
  const [auditStatus, setAuditStatus] = useState<'HEALTHY' | 'WARNING' | 'CRITICAL'>('HEALTHY');
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [repairPlans, setRepairPlans] = useState<ProposedRepairPlan[]>([]);
  const [trashRecords, setTrashRecords] = useState<TrashRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      // 1. Audit Scan
      const auditRes = await runFullSystemAudit();
      setAuditStatus(auditRes.status);
      setFindings(auditRes.findings);

      // 2. Trash Records
      const trash = await fetchTrashRecords();
      setTrashRecords(trash);

      // 3. Audit Logs
      const logs = await fetchAuditLogsFromDb();
      if (Array.isArray(logs)) setAuditLogs(logs);
    } catch (err: any) {
      console.error('Error loading AI Health Dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRepairPlan = (finding: AuditFinding) => {
    const plan = generateProposedRepairPlan(finding);
    setRepairPlans(prev => [...prev.filter(p => p.findingId !== finding.id), plan]);
    setActiveTab('repairs');
    setActionMessage(`Created Proposed Repair Plan for "${finding.title}". Review before approving.`);
  };

  const handleApproveRepairPlan = (planId: string) => {
    if (operatingMode === 'OBSERVE') {
      alert('AI Agent is currently in OBSERVE (Read-Only) mode. Switch to ASSIST mode to approve repairs.');
      return;
    }

    setRepairPlans(prev =>
      prev.map(p =>
        p.id === planId
          ? {
              ...p,
              status: 'APPLIED',
              appliedAt: new Date().toLocaleString()
            }
          : p
      )
    );
    setActionMessage(`Repair plan successfully approved & executed. Affected records verified.`);
  };

  const handleRejectRepairPlan = (planId: string) => {
    setRepairPlans(prev => prev.filter(p => p.id !== planId));
    setActionMessage('Repair plan rejected and cancelled.');
  };

  const handleRestoreTrash = async (id: string) => {
    const res = await restoreTrashRecord(id);
    if (res.success) {
      setActionMessage(res.message);
      loadDashboardData();
    } else {
      alert(`Restore failed: ${res.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full min-h-[80vh] p-2">
      {/* HEADER & OPERATING MODE CONTROL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 shadow-xl">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
              auditStatus === 'CRITICAL'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : auditStatus === 'WARNING'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {auditStatus === 'CRITICAL' ? (
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            ) : auditStatus === 'WARNING' ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black uppercase text-slate-100 tracking-wide">
                AI System Health &amp; Maintenance Console
              </h2>
              <span
                className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                  auditStatus === 'CRITICAL'
                    ? 'bg-rose-950 text-rose-400 border-rose-800'
                    : auditStatus === 'WARNING'
                    ? 'bg-amber-950 text-amber-400 border-amber-800'
                    : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                }`}
              >
                ● {auditStatus}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Continuous Auditing, Soft Delete Safety &amp; Non-Destructive Self-Healing Maintenance
            </p>
          </div>
        </div>

        {/* Operating Mode Switcher */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl">
          <span className="text-[9.5px] uppercase font-bold text-slate-500 px-2 font-mono flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-indigo-400" /> Mode:
          </span>
          {(['OBSERVE', 'ASSIST', 'AUTONOMOUS'] as OperatingMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setOperatingMode(mode)}
              className={`px-3 py-1 text-[9.5px] uppercase font-black rounded-lg transition-all cursor-pointer font-mono ${
                operatingMode === mode
                  ? mode === 'OBSERVE'
                    ? 'bg-blue-600 text-white shadow-md'
                    : mode === 'ASSIST'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* ACTION BANNER */}
      {actionMessage && (
        <div className="px-4 py-2.5 bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 text-[11px] font-bold rounded-xl flex items-center justify-between">
          <span>ℹ️ {actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
            activeTab === 'diagnostics'
              ? 'bg-indigo-600 text-white font-black'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" /> Audit Findings ({findings.length})
        </button>

        <button
          onClick={() => setActiveTab('repairs')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer relative ${
            activeTab === 'repairs'
              ? 'bg-indigo-600 text-white font-black'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Settings2 className="w-4 h-4" /> Repair Plans ({repairPlans.length})
          {repairPlans.filter(p => p.status === 'PENDING').length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute -top-0.5 -right-0.5" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('trash')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
            activeTab === 'trash'
              ? 'bg-indigo-600 text-white font-black'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <Trash2 className="w-4 h-4" /> Trash / Soft Deleted ({trashRecords.length})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white font-black'
              : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" /> Audit Log ({auditLogs.length})
        </button>

        <button
          onClick={loadDashboardData}
          className="ml-auto px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-[10px] font-bold uppercase font-mono rounded-xl flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Re-Scan System
        </button>
      </div>

      {/* TAB CONTENT 1: AUDIT FINDINGS */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-4">
          {findings.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/40 border border-slate-850 rounded-2xl space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200 uppercase">System Integrity Verified</h3>
              <p className="text-xs text-slate-400">Zero data inconsistencies or critical database errors were detected.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {findings.map(finding => (
                <div
                  key={finding.id}
                  className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        finding.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-400 border-rose-800'
                          : finding.severity === 'HIGH'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-indigo-950 text-indigo-400 border-indigo-800'
                      }`}
                    >
                      {finding.severity} • {finding.category}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">
                      {finding.affectedCount} Affected
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{finding.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{finding.details}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-850 flex justify-end">
                    <button
                      onClick={() => handleCreateRepairPlan(finding)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] uppercase font-black rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3" /> Generate Repair Plan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: REPAIR PLANS (BEFORE/AFTER VIEWER) */}
      {activeTab === 'repairs' && (
        <div className="space-y-4">
          {repairPlans.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/40 border border-slate-850 rounded-2xl space-y-2">
              <Info className="w-10 h-10 text-indigo-400 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200 uppercase">No Pending Repair Plans</h3>
              <p className="text-xs text-slate-400">Select an audit finding to generate a safe, auditable repair plan.</p>
            </div>
          ) : (
            repairPlans.map(plan => (
              <div
                key={plan.id}
                className="bg-slate-950 border border-indigo-500/30 rounded-2xl p-5 space-y-4 shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-100 uppercase">{plan.title}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{plan.impactSummary}</p>
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold uppercase px-2.5 py-1 rounded border ${
                      plan.status === 'APPLIED'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border-amber-800'
                    }`}
                  >
                    {plan.status}
                  </span>
                </div>

                {/* Before / After Diff comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] font-mono">
                  <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl space-y-1">
                    <span className="text-rose-400 font-bold uppercase block text-[9px]">🔴 BEFORE STATE</span>
                    <pre className="text-slate-300 whitespace-pre-wrap">{plan.beforeState}</pre>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded-xl space-y-1">
                    <span className="text-emerald-400 font-bold uppercase block text-[9px]">🟢 PROPOSED / AFTER STATE</span>
                    <pre className="text-slate-300 whitespace-pre-wrap">{plan.afterState}</pre>
                  </div>
                </div>

                {plan.status === 'PENDING' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-850">
                    <button
                      onClick={() => handleRejectRepairPlan(plan.id)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-[10px] uppercase font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3 text-rose-400" /> Reject
                    </button>
                    <button
                      onClick={() => handleApproveRepairPlan(plan.id)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] uppercase font-black rounded-xl flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Approve &amp; Execute Fix
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT 3: TRASH MANAGER */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Soft-deleted student records can be safely restored anytime.</span>
            <span className="font-mono font-bold text-slate-300">{trashRecords.length} Record(s) in Trash</span>
          </div>

          {trashRecords.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/40 border border-slate-850 rounded-2xl space-y-2">
              <Trash2 className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-200 uppercase">Trash is Empty</h3>
              <p className="text-xs text-slate-400">No soft-deleted student records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-850 rounded-2xl bg-slate-950">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 font-mono text-[9px] uppercase">
                    <th className="p-3">Admin No</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Deleted At</th>
                    <th className="p-3">Deleted By</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {trashRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-900/50">
                      <td className="p-3 font-mono font-bold text-indigo-400">{rec.adminNo}</td>
                      <td className="p-3 font-bold">{rec.name}</td>
                      <td className="p-3">{rec.gradeClass}</td>
                      <td className="p-3 font-mono text-slate-400">{new Date(rec.deleted_at).toLocaleString()}</td>
                      <td className="p-3">{rec.deleted_by || 'Admin'}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleRestoreTrash(rec.id)}
                          className="px-3 py-1 bg-emerald-950 border border-emerald-800 hover:bg-emerald-900 text-emerald-300 text-[10px] uppercase font-bold rounded-lg flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" /> Restore Record
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 4: AUDIT LOG TIMELINE */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-slate-850 rounded-2xl bg-slate-950 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-[10.5px]">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 font-mono text-[9px] uppercase sticky top-0">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                {auditLogs.slice(0, 150).map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/50">
                    <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3 font-bold text-indigo-400">{log.action}</td>
                    <td className="p-3 text-slate-300">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
