import React, { useEffect, useState } from 'react';
import { RefreshCw, Users, AlertCircle, ShieldAlert, Check } from 'lucide-react';
import { fetchSuspectedDuplicates, mergeDuplicateStudentsInDb } from '../utils/api.ts';

interface AdminDuplicatesTabProps {
  approvedBy: string;
}

export default function AdminDuplicatesTab({ approvedBy }: AdminDuplicatesTabProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mergingGroupId, setMergingGroupId] = useState<string | null>(null);

  // Merge form selections
  // Maps groupId -> selected primaryStudentId
  const [primarySelections, setPrimarySelections] = useState<Record<string, string>>({});
  // Maps groupId -> override newAdminNo
  const [adminNoOverrides, setAdminNoOverrides] = useState<Record<string, string>>({});

  const loadDuplicates = async () => {
    setLoading(true);
    try {
      const res = await fetchSuspectedDuplicates();
      if (res.success) {
        setGroups(res.groups || []);
        
        // Auto-select the first student or student with most data as primary by default
        const initialSelections: Record<string, string> = {};
        const initialOverrides: Record<string, string> = {};
        
        res.groups.forEach((g: any) => {
          // Sort suspects by data weight (marks + attendance + fees) desc
          const sorted = [...g.suspects].sort((a, b) => {
            const weightA = (a.marksCount || 0) + (a.attendanceCount || 0) + (a.feesCount || 0);
            const weightB = (b.marksCount || 0) + (b.attendanceCount || 0) + (b.feesCount || 0);
            return weightB - weightA;
          });
          
          const primary = sorted[0] || g.suspects[0];
          if (primary) {
            initialSelections[g.id] = primary.id;
            initialOverrides[g.id] = primary.adminNo || '';
          }
        });
        
        setPrimarySelections(initialSelections);
        setAdminNoOverrides(initialOverrides);
      }
    } catch (err: any) {
      console.error('Failed to load duplicates:', err);
      alert(err.message || 'Failed to load duplicate student records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDuplicates();
  }, []);

  const handleMerge = async (groupId: string) => {
    const primaryId = primarySelections[groupId];
    const newAdminNo = adminNoOverrides[groupId]?.trim();
    const group = groups.find(g => g.id === groupId);
    
    if (!group || !primaryId) return;
    
    const primaryStudent = group.suspects.find((s: any) => s.id === primaryId);
    const duplicates = group.suspects.filter((s: any) => s.id !== primaryId);
    const duplicateIds = duplicates.map((s: any) => s.id);
    
    if (!primaryStudent) return;
    
    const confirmMessage = 
      `Are you sure you want to merge these student records?\n\n` +
      `PRIMARY RECORD to KEEP:\n` +
      `- ${primaryStudent.name} (${primaryStudent.adminNo || 'No Number'}) [${primaryStudent.gradeClass}]\n\n` +
      `DUPLICATE RECORD(S) to MERGE and DELETE:\n` +
      duplicates.map((s: any) => `- ${s.name} (${s.adminNo || 'No Number'}) [${s.gradeClass}]`).join('\n') +
      `\n\nAll marks, attendance, and fee history from the duplicate records will be merged into the primary record, and duplicate entries will be permanently deleted.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setMergingGroupId(groupId);
    try {
      const res = await mergeDuplicateStudentsInDb(primaryId, duplicateIds, newAdminNo || undefined);
      if (res.success) {
        alert(`Successfully merged duplicate records! ${res.mergedCount} duplicate(s) removed.`);
        loadDuplicates();
      }
    } catch (err: any) {
      console.error('Merge failed:', err);
      alert(err.message || 'Error occurred while merging records.');
      setMergingGroupId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 backdrop-blur-md">
        <div>
          <h2 className="text-lg font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Duplicate Student Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review and clean up duplicate student records created through overlapping imports or name variations.
          </p>
        </div>
        <button
          onClick={loadDuplicates}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Scan
        </button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-xs text-slate-400 mt-3 font-semibold font-mono">Scanning registry for duplicate sets...</span>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-center px-4">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mb-4">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wide">Registry Clean</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-2">
            No suspected duplicate student records detected in the active registry. The database is clean!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-amber-300 uppercase tracking-wide">Suspected Duplicates Found</h4>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                The scanner has identified <strong>{groups.length} duplicate set(s)</strong> based on similar name permutations, Date of Birth matching, and duplicate Admission Numbers. Choose the primary record to keep, check the resulting student number, and click merge.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {groups.map((group) => {
              const selectedPrimary = primarySelections[group.id];
              const isMerging = mergingGroupId === group.id;

              return (
                <div key={group.id} className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
                  {/* Group Header */}
                  <div className="p-4 bg-slate-900/80 border-b border-slate-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono">
                        Duplicate Set: {group.suspects[0]?.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Matches found in {group.suspects[0]?.gradeClass || 'N/A'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                      <div className="flex items-center gap-2 flex-1 md:flex-initial">
                        <label className="text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider shrink-0">
                          Student No:
                        </label>
                        <input
                          type="text"
                          value={adminNoOverrides[group.id] || ''}
                          onChange={(e) => setAdminNoOverrides({ ...adminNoOverrides, [group.id]: e.target.value })}
                          disabled={isMerging}
                          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 flex-1 md:w-40"
                          placeholder="Admission/Student No"
                        />
                      </div>
                      <button
                        onClick={() => handleMerge(group.id)}
                        disabled={isMerging || !selectedPrimary}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer w-full md:w-auto"
                      >
                        {isMerging ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Merging...
                          </>
                        ) : (
                          'Merge Records'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Suspects Side-By-Side Comparison Grid */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.suspects.map((suspect: any) => {
                      const isSelected = selectedPrimary === suspect.id;
                      const weight = (suspect.marksCount || 0) + (suspect.attendanceCount || 0) + (suspect.feesCount || 0);

                      return (
                        <div
                          key={suspect.id}
                          onClick={() => {
                            if (!isMerging) {
                              setPrimarySelections({ ...primarySelections, [group.id]: suspect.id });
                              setAdminNoOverrides({ ...adminNoOverrides, [group.id]: suspect.adminNo || '' });
                            }
                          }}
                          className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                            isSelected
                              ? 'bg-indigo-950/20 border-indigo-500/80 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                              : 'bg-slate-950/40 border-slate-800/85 hover:border-slate-700/80 hover:bg-slate-950/60'
                          }`}
                        >
                          {/* Selection Checkmark */}
                          <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-indigo-500 border-indigo-500 text-white'
                              : 'border-slate-800 text-transparent bg-slate-900/40'
                          }`}>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>

                          <div className="space-y-3.5">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 font-mono">
                                Student Details
                              </span>
                              <h4 className="text-xs font-bold text-slate-200 mt-1 pr-6 leading-tight">
                                {suspect.name}
                              </h4>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                ID: {suspect.id}
                              </p>
                            </div>

                            {/* Bio details */}
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-900 pt-3 text-[10.5px]">
                              <div>
                                <span className="text-slate-500 block">Student No:</span>
                                <span className="text-slate-300 font-mono font-medium">{suspect.adminNo || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Class/Stream:</span>
                                <span className="text-slate-300 font-medium">{suspect.gradeClass}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Date of Birth:</span>
                                <span className="text-slate-300 font-medium">
                                  {suspect.dob ? new Date(suspect.dob).toLocaleDateString() : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Boarding Status:</span>
                                <span className="text-slate-300 font-medium">{suspect.boardingStatus}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Photo Attached:</span>
                                <span className={suspect.hasPhoto ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                                  {suspect.hasPhoto ? 'Yes (Passport)' : 'No'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Clearance Status:</span>
                                <span className={suspect.isCleared ? 'text-emerald-400 font-medium' : 'text-rose-455 font-medium'}>
                                  {suspect.isCleared ? 'Cleared' : 'Hold'}
                                </span>
                              </div>
                            </div>

                            {/* Data weight indicators */}
                            <div className="border-t border-slate-900 pt-3">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 font-mono">
                                Associated Records weight ({weight})
                              </span>
                              <div className="grid grid-cols-3 gap-2 mt-1.5 text-center text-[10px]">
                                <div className="p-1.5 bg-slate-950/60 rounded-lg border border-slate-900">
                                  <span className="block text-slate-500">Marks</span>
                                  <span className="text-slate-200 font-bold font-mono">{suspect.marksCount || 0}</span>
                                </div>
                                <div className="p-1.5 bg-slate-950/60 rounded-lg border border-slate-900">
                                  <span className="block text-slate-500">Attendance</span>
                                  <span className="text-slate-200 font-bold font-mono">{suspect.attendanceCount || 0}</span>
                                </div>
                                <div className="p-1.5 bg-slate-950/60 rounded-lg border border-slate-900">
                                  <span className="block text-slate-500">Fees</span>
                                  <span className="text-slate-200 font-bold font-mono">{suspect.feesCount || 0}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider font-mono ${
                              isSelected
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-900/60 text-slate-400 border border-slate-800'
                            }`}>
                              {isSelected ? '★ Keep Primary' : 'Delete & Merge'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
