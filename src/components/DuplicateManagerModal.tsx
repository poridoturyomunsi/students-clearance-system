import React, { useState, useEffect } from 'react';
import { X, Trash2, ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, Image as ImageIcon, Sparkles, Layers, ArrowRight, CheckSquare, Square } from 'lucide-react';
import { Student } from '../types.ts';
import { fetchSuspectedDuplicates, mergeDuplicateStudentsInDb, deleteStudentInDb, deleteStudentsBulkInDb } from '../utils/api.ts';

interface DuplicateGroup {
  id: string;
  name: string;
  gradeClass: string;
  candidates: Student[];
  recommendedKeepId: string;
}

interface DuplicateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onRefreshData: () => Promise<void>;
}

export default function DuplicateManagerModal({
  isOpen,
  onClose,
  students,
  onRefreshData
}: DuplicateManagerModalProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [keepSelections, setKeepSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      scanForDuplicates();
    }
  }, [isOpen, students]);

  const scanForDuplicates = async () => {
    setLoading(true);
    setStatusMessage('Scanning active database for duplicate student entries...');
    try {
      // 1. Try server endpoint first
      let serverGroups: any[] = [];
      try {
        const res = await fetchSuspectedDuplicates();
        if (res && res.success && Array.isArray(res.groups)) {
          serverGroups = res.groups;
        }
      } catch (e) {
        console.warn('Backend duplicate scan fallback to client logic:', e);
      }

      // 2. Build local duplicate groups by normalized name
      const groupedMap = new Map<string, Student[]>();
      (students || []).forEach(s => {
        const normName = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!normName) return;
        if (!groupedMap.has(normName)) {
          groupedMap.set(normName, []);
        }
        groupedMap.get(normName)!.push(s);
      });

      const parsedGroups: DuplicateGroup[] = [];
      const initKeepMap: Record<string, string> = {};
      let groupIdCounter = 1;

      for (const [normName, candidateList] of groupedMap.entries()) {
        if (candidateList.length > 1) {
          // Determine best candidate to keep:
          // Priority 1: Has photo
          // Priority 2: AdminNo present
          // Priority 3: First entry
          let bestIdx = 0;
          for (let i = 1; i < candidateList.length; i++) {
            const currentKeep = candidateList[bestIdx];
            const candidate = candidateList[i];
            const currentHasPhoto = !!(currentKeep.photo || currentKeep.hasPhoto);
            const candidateHasPhoto = !!(candidate.photo || candidate.hasPhoto);

            if (!currentHasPhoto && candidateHasPhoto) {
              bestIdx = i;
            } else if (currentHasPhoto === candidateHasPhoto) {
              if (!currentKeep.adminNo && candidate.adminNo) {
                bestIdx = i;
              }
            }
          }

          const groupId = `group-${groupIdCounter++}`;
          const recommendedId = candidateList[bestIdx].id;

          parsedGroups.push({
            id: groupId,
            name: candidateList[0].name,
            gradeClass: candidateList[0].gradeClass,
            candidates: candidateList,
            recommendedKeepId: recommendedId
          });

          initKeepMap[groupId] = recommendedId;
        }
      }

      setDuplicateGroups(parsedGroups);
      setKeepSelections(initKeepMap);
      setSelectedGroupIds(new Set(parsedGroups.map(g => g.id)));
      setStatusMessage(null);
    } catch (err: any) {
      console.error('Failed to scan duplicates:', err);
      setStatusMessage(`Scanning error: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalAffectedRecords = duplicateGroups.reduce((sum, g) => sum + g.candidates.length, 0);
  const totalDuplicatesToRemove = duplicateGroups.reduce((sum, g) => sum + (g.candidates.length - 1), 0);

  const handleSetKeepId = (groupId: string, candidateId: string) => {
    setKeepSelections(prev => ({
      ...prev,
      [groupId]: candidateId
    }));
  };

  const toggleSelectGroup = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedGroupIds.size === duplicateGroups.length) {
      setSelectedGroupIds(new Set());
    } else {
      setSelectedGroupIds(new Set(duplicateGroups.map(g => g.id)));
    }
  };

  const handleMergeSingleGroup = async (group: DuplicateGroup) => {
    const keepId = keepSelections[group.id] || group.recommendedKeepId;
    const dupIds = group.candidates.filter(c => c.id !== keepId).map(c => c.id);

    if (dupIds.length === 0) return;

    setProcessing(true);
    setStatusMessage(`Merging ${group.name} (${dupIds.length} duplicate(s))...`);

    try {
      const keepStudent = group.candidates.find(c => c.id === keepId);
      await mergeDuplicateStudentsInDb(keepId, dupIds, keepStudent?.adminNo);
      
      // Update UI state
      setDuplicateGroups(prev => prev.filter(g => g.id !== group.id));
      await onRefreshData();
      alert(`Successfully merged duplicate entry for "${group.name}". Maintained entry ID: ${keepId}.`);
    } catch (err: any) {
      console.error('Merge failed:', err);
      alert(`Merge failed: ${err.message || err}`);
    } finally {
      setProcessing(false);
      setStatusMessage(null);
    }
  };

  const handleDeleteSingleStudent = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete duplicate record for "${studentName}" (ID: ${studentId})?`)) {
      return;
    }
    setProcessing(true);
    setStatusMessage(`Deleting student entry ${studentId}...`);
    try {
      await deleteStudentInDb(studentId);
      await onRefreshData();
      scanForDuplicates();
    } catch (err: any) {
      alert(`Failed to delete student: ${err.message || err}`);
    } finally {
      setProcessing(false);
      setStatusMessage(null);
    }
  };

  const handleMergeAllSelected = async () => {
    const activeGroups = duplicateGroups.filter(g => selectedGroupIds.has(g.id));
    if (activeGroups.length === 0) {
      alert('Please select at least one duplicate group to process.');
      return;
    }

    const confirmMsg = `Are you sure you want to merge ${activeGroups.length} duplicate group(s)?\n\nThis will keep 1 primary entry with passport photo/data for each student, transfer all gate logs & marks, and delete ${activeGroups.reduce((acc, g) => acc + g.candidates.length - 1, 0)} duplicate record(s).`;
    if (!window.confirm(confirmMsg)) return;

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < activeGroups.length; i++) {
      const group = activeGroups[i];
      const keepId = keepSelections[group.id] || group.recommendedKeepId;
      const dupIds = group.candidates.filter(c => c.id !== keepId).map(c => c.id);

      setStatusMessage(`Merging duplicate group ${i + 1} of ${activeGroups.length}: ${group.name}...`);

      try {
        const keepStudent = group.candidates.find(c => c.id === keepId);
        await mergeDuplicateStudentsInDb(keepId, dupIds, keepStudent?.adminNo);
        successCount++;
      } catch (err) {
        console.error(`Failed merging group ${group.id}:`, err);
        failCount++;
      }
    }

    await onRefreshData();
    setProcessing(false);
    setStatusMessage(null);

    alert(`Batch Duplicate Cleanup Finished:\n- Merged ${successCount} duplicate group(s) successfully.\n${failCount > 0 ? `- Failed to merge ${failCount} group(s).` : ''}`);
    scanForDuplicates();
  };

  const handleDeleteAllSelectedDuplicates = async () => {
    const activeGroups = duplicateGroups.filter(g => selectedGroupIds.has(g.id));
    if (activeGroups.length === 0) {
      alert('Please select at least one duplicate group.');
      return;
    }

    const idsToDelete: string[] = [];
    activeGroups.forEach(group => {
      const keepId = keepSelections[group.id] || group.recommendedKeepId;
      group.candidates.forEach(c => {
        if (c.id !== keepId) {
          idsToDelete.push(c.id);
        }
      });
    });

    if (idsToDelete.length === 0) {
      alert('No duplicate records to remove in the selected groups.');
      return;
    }

    const confirmMsg = `WARNING: Are you sure you want to PERMANENTLY DELETE ${idsToDelete.length} duplicate student record(s) across ${activeGroups.length} group(s)?\n\nOne master record with photo will be retained for each student.`;
    if (!window.confirm(confirmMsg)) return;

    setProcessing(true);
    setStatusMessage(`Deleting ${idsToDelete.length} duplicate student records...`);

    try {
      // First attempt backend merge to preserve any logs/marks, falling back to bulk delete
      for (const group of activeGroups) {
        const keepId = keepSelections[group.id] || group.recommendedKeepId;
        const dupIds = group.candidates.filter(c => c.id !== keepId).map(c => c.id);
        if (dupIds.length > 0) {
          try {
            await mergeDuplicateStudentsInDb(keepId, dupIds);
          } catch (e) {
            await deleteStudentsBulkInDb(dupIds);
          }
        }
      }
      await onRefreshData();
      alert(`Successfully deleted ${idsToDelete.length} duplicate student record(s).`);
      scanForDuplicates();
    } catch (err: any) {
      console.error('Bulk deletion error:', err);
      alert(`Bulk deletion error: ${err.message || err}`);
    } finally {
      setProcessing(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto font-sans select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-white tracking-wider font-mono flex items-center gap-2">
                Student Duplicate Roster Cleanup & Deletion
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Detect, select all duplicates, and delete redundant student records while preserving 1 master entry with photo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={processing}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Loading Bar */}
        {(loading || processing || statusMessage) && (
          <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3.5 flex items-center gap-3 text-xs text-indigo-300 animate-pulse shrink-0">
            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <span className="font-mono font-semibold">{statusMessage || 'Processing duplicate records...'}</span>
          </div>
        )}

        {/* Action Toolbar */}
        {!loading && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/60 p-3.5 border border-slate-850 rounded-2xl shrink-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-3 py-1 rounded-full font-bold">
                {duplicateGroups.length} Duplicate Group{duplicateGroups.length !== 1 ? 's' : ''}
              </span>
              <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full font-bold">
                {totalDuplicatesToRemove} Duplicate Record{totalDuplicatesToRemove !== 1 ? 's' : ''} to Delete
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              {duplicateGroups.length > 0 && (
                <>
                  {/* Select All Duplicates Button */}
                  <button
                    onClick={toggleSelectAll}
                    disabled={processing}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-mono transition cursor-pointer border border-slate-700"
                    title="Select or deselect all duplicate groups"
                  >
                    {selectedGroupIds.size === duplicateGroups.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    {selectedGroupIds.size === duplicateGroups.length ? 'Deselect All' : `Select All Duplicates (${duplicateGroups.length})`}
                  </button>

                  {/* Delete All Selected Duplicates Button */}
                  <button
                    onClick={handleDeleteAllSelectedDuplicates}
                    disabled={processing || selectedGroupIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-rose-950/50 transition cursor-pointer disabled:opacity-50 border border-rose-500"
                    title="Permanently delete all duplicate entries, keeping 1 photo master record per student"
                  >
                    <Trash2 className="w-4 h-4" /> Delete All Duplicates ({selectedGroupIds.size} Sets)
                  </button>

                  {/* Merge Selected Button */}
                  <button
                    onClick={handleMergeAllSelected}
                    disabled={processing || selectedGroupIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-950/50 transition cursor-pointer disabled:opacity-50 border border-indigo-500"
                  >
                    <Sparkles className="w-4 h-4" /> Merge Selected
                  </button>
                </>
              )}

              <button
                onClick={scanForDuplicates}
                disabled={processing}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer border border-slate-700"
                title="Re-scan database"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Group Cards Container */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {!loading && duplicateGroups.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-200">No Duplicate Records Found</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Your student registry database is clean. All active students have distinct, unique names and administrative records.
              </p>
            </div>
          ) : (
            duplicateGroups.map((group) => {
              const isGroupSelected = selectedGroupIds.has(group.id);
              const currentKeepId = keepSelections[group.id] || group.recommendedKeepId;

              return (
                <div
                  key={group.id}
                  className={`border rounded-2xl p-4 transition-all ${
                    isGroupSelected
                      ? 'bg-slate-900/90 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/20'
                      : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-850 mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isGroupSelected}
                        onChange={() => toggleSelectGroup(group.id)}
                        className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0 cursor-pointer"
                        title="Select this duplicate set"
                      />
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
                          <span>{group.name}</span>
                          <span className="text-xs font-normal font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-900/50 px-2.5 py-0.5 rounded-full">
                            {group.gradeClass}
                          </span>
                        </h4>
                        <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">
                          {group.candidates.length} Candidate Records Found
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleMergeSingleGroup(group)}
                        disabled={processing}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Merge Set
                      </button>
                    </div>
                  </div>

                  {/* Candidate Entries Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.candidates.map((cand) => {
                      const isKeepMaster = cand.id === currentKeepId;
                      const hasPhoto = !!(cand.photo || cand.hasPhoto);

                      return (
                        <div
                          key={cand.id}
                          onClick={() => handleSetKeepId(group.id, cand.id)}
                          className={`p-3 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                            isKeepMaster
                              ? 'bg-indigo-950/50 border-indigo-500/60 ring-2 ring-indigo-500/30'
                              : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Photo Thumbnail */}
                            <div className="w-12 h-14 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shrink-0 flex items-center justify-center shadow-sm relative">
                              {hasPhoto ? (
                                <img
                                  src={cand.photo || `/api/students/${cand.id}/photo`}
                                  alt={cand.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="text-center p-1 text-slate-600">
                                  <ImageIcon className="w-5 h-5 mx-auto mb-0.5" />
                                  <span className="text-[7px] font-mono block leading-none">NO PHOTO</span>
                                </div>
                              )}
                              {hasPhoto && (
                                <span className="absolute top-1 right-1 bg-emerald-500 w-2 h-2 rounded-full shadow-[0_0_6px_rgba(16,185,129,0.8)]" title="Has Passport Photo" />
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0 space-y-1 text-xs">
                              <div className="flex justify-between items-start gap-1">
                                <span className="font-mono font-bold text-slate-200 truncate">{cand.adminNo || 'No Admin ID'}</span>
                                <div className="flex items-center gap-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono ${cand.isCleared ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' : 'bg-rose-950 text-rose-400 border border-rose-900/40'}`}>
                                    {cand.isCleared ? 'Cleared' : 'Hold'}
                                  </span>

                                  {!isKeepMaster && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSingleStudent(cand.id, cand.name);
                                      }}
                                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
                                      title="Delete this specific duplicate entry"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <p className="text-[10px] text-slate-400 font-mono">
                                Class: <strong className="text-slate-200">{cand.gradeClass}</strong>
                              </p>

                              <p className="text-[9.5px] text-slate-500 font-mono truncate">
                                ID: {cand.id}
                              </p>
                            </div>
                          </div>

                          {/* Keep Selection Radio Button */}
                          <div className="pt-2 border-t border-slate-850/80 flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-[10.5px] font-bold cursor-pointer font-mono">
                              <input
                                type="radio"
                                name={`keep-${group.id}`}
                                checked={isKeepMaster}
                                onChange={() => handleSetKeepId(group.id, cand.id)}
                                className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer"
                              />
                              <span className={isKeepMaster ? 'text-indigo-400 font-black' : 'text-slate-400'}>
                                {isKeepMaster ? '★ KEEP THIS ENTRY' : 'Select to Keep'}
                              </span>
                            </label>

                            {isKeepMaster && (
                              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded font-black uppercase tracking-wider font-mono">
                                MASTER RECORD
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between shrink-0 text-xs text-slate-400 font-mono">
          <span>Tip: The system automatically selects student entries with passport photos as the Master Record.</span>
          <button
            onClick={onClose}
            disabled={processing}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
