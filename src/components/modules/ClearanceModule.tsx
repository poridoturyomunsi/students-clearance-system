import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Loading from '../Loading.tsx';
import { Printer, FileSpreadsheet, Search, Plus, Download, ShieldAlert, AlertCircle } from 'lucide-react';
import {
  fetchStudentsFromDb,
  fetchStatsFromDb,
  saveStudentInDb,
  updateStudentInDb,
  saveStudentsBulkInDb,
  generatePdfOnServer,
  fetchPdfTaskStatus,
  getApiBaseUrl,
  triggerFileDownload
} from '../../utils/api.ts';

const DEFAULT_ADD_FORM = {
  adminNo: '',
  name: '',
  gender: 'Male',
  gradeClass: '',
  boardingStatus: 'Hosteller',
  isCleared: true,
  remarks: ''
};

type AddForm = typeof DEFAULT_ADD_FORM;

export default function ClearanceModule() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ ...DEFAULT_ADD_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [filterClass, setFilterClass] = useState<string>('All');
  const [filterStream, setFilterStream] = useState<string>('All');
  const [filterBoarding, setFilterBoarding] = useState<string>('All');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [duplicatePrompt, setDuplicatePrompt] = useState<any>(null);
  const [applyToAllAction, setApplyToAllAction] = useState<'update' | 'skip' | 'create' | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  const CLASS_ORDER = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];
  const STREAM_ORDER = ['A', 'B', 'C', 'Arts', 'Sciences'];

  const parseGradeClass = (gradeClass: string) => {
    const raw = (gradeClass || '').trim();
    const normalized = raw.replace(/S\.?([1-6])/i, 'S.$1').trim();
    const parts = normalized.split(/\s+/);
    if (parts.length >= 2) {
      return { className: parts[0], streamName: parts.slice(1).join(' ') };
    }
    const match = normalized.match(/^(S\.[1-6])\s*(Arts|Sciences|A|B|C)$/i);
    if (match) {
      return { className: match[1], streamName: match[2] };
    }
    return { className: normalized, streamName: '' };
  };

  const uniqueClasses = useMemo(() => {
    const classes = new Set<string>();
    students.forEach((student) => {
      const { className } = parseGradeClass(student.gradeClass);
      if (className) classes.add(className);
    });
    const ordered = CLASS_ORDER.filter((cls) => classes.has(cls));
    const extra = Array.from(classes).filter((cls) => !CLASS_ORDER.includes(cls)).sort();
    return ['All', ...ordered, ...extra];
  }, [students]);

  const uniqueStreams = useMemo(() => {
    const streams = new Set<string>();
    students.forEach((student) => {
      const { streamName } = parseGradeClass(student.gradeClass);
      if (streamName) streams.add(streamName);
    });
    const ordered = STREAM_ORDER.filter((stream) => streams.has(stream));
    const extra = Array.from(streams).filter((stream) => !STREAM_ORDER.includes(stream)).sort();
    return ['All', ...ordered, ...extra];
  }, [students]);

  const filteredStudents = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return students.filter((student) => {
      const gradeClass = student.gradeClass || '';
      const { className, streamName } = parseGradeClass(gradeClass);
      if (filterClass !== 'All' && className !== filterClass) return false;
      if (filterStream !== 'All' && streamName !== filterStream) return false;
      if (filterClass !== 'All' && filterBoarding !== 'All') {
        const studentBoarding = student.boardingStatus;
        if (filterBoarding === 'Hosteller' && (studentBoarding !== 'Hosteller' && studentBoarding !== 'Boarder')) return false;
        if (filterBoarding === 'Day Scholar' && studentBoarding !== 'Day Scholar') return false;
      }

      if (!search) return true;
      const haystack = [student.name, student.adminNo, student.gradeClass, student.remarks]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [students, searchTerm, filterClass, filterStream, filterBoarding]);

  const filteredStats = useMemo(() => {
    const total = filteredStudents.length;
    const clearedCount = filteredStudents.filter((student) => student.isCleared).length;
    const balanceCount = filteredStudents.filter((student) => !student.isCleared).length;
    const printQueue = filteredStudents.filter((student) => student.printStatus === 'Queued').length;
    return { total, clearedCount, balanceCount, printQueue };
  }, [filteredStudents]);

  const loadClearanceData = async () => {
    setLoading(true);
    try {
      const s = await fetchStudentsFromDb();
      const st = await fetchStatsFromDb();
      const fetchedStudents = Array.isArray(s?.data) ? s.data : [];
      const queuedCount = fetchedStudents.filter((student: any) => student.printStatus === 'Queued').length;
      setStudents(fetchedStudents);
      setStats({
        total: st?.total ?? fetchedStudents.length,
        clearedCount: st?.cleared ?? 0,
        balanceCount: st?.pending ?? 0,
        photoCount: st?.withPhoto ?? 0,
        photoPct: st?.photoPct ?? 0,
        clearedPct: st?.clearedPct ?? 0,
        printQueue: queuedCount
      });
    } catch (err) {
      console.warn('Failed to load clearance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    try {
      localStorage.removeItem('legacy_clearance_route');
      localStorage.removeItem('old_clearance_page');
    } catch (e) {}

    if (mounted) {
      loadClearanceData();
    }

    return () => { mounted = false; };
  }, []);

  const safeValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };

  const normalizeRow = (row: Record<string, unknown>) => {
    return Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[String(key).trim().toLowerCase()] = safeValue(value);
      return acc;
    }, {});
  };

  const findField = (row: Record<string, string>, keys: string[]) => {
    for (const key of keys) {
      const normalized = key.toLowerCase();
      if (row[normalized]) {
        return row[normalized];
      }
    }
    return '';
  };

  const createIdFromAdminNo = (adminNo: string, index: number) => {
    const cleaned = adminNo.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `student-${index}`;
    return `stud-${cleaned}-${Date.now()}-${index}`;
  };

  const handleOpenAddModal = () => {
    setAddForm({ ...DEFAULT_ADD_FORM });
    setShowAddModal(true);
  };

  const handleSaveStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!addForm.adminNo.trim() || !addForm.name.trim() || !addForm.gradeClass.trim()) {
      alert('Please provide student name, student number and class.');
      return;
    }

    setIsSaving(true);
    try {
      const student = {
        id: createIdFromAdminNo(addForm.adminNo, students.length),
        adminNo: addForm.adminNo.trim(),
        name: addForm.name.trim(),
        gender: addForm.gender as 'Male' | 'Female',
        gradeClass: addForm.gradeClass.trim(),
        boardingStatus: addForm.boardingStatus as 'Hosteller' | 'Day Scholar',
        isCleared: addForm.isCleared,
        remarks: addForm.remarks.trim(),
        printStatus: 'Not Printed' as const,
        gateClearanceDate: addForm.isCleared ? new Date().toISOString().split('T')[0] : undefined,
        mealsClearanceDate: addForm.isCleared ? new Date().toISOString().split('T')[0] : undefined
      };

      await saveStudentInDb(student);
      await loadClearanceData();
      setShowAddModal(false);
      setAddForm({ ...DEFAULT_ADD_FORM });
      setImportSummary(null);
      alert('Student added successfully.');
    } catch (err: any) {
      console.error('Failed to save student:', err);
      alert('Unable to save student: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const getSortedTokens = (nameStr: string) => {
    return (nameStr || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  };

  const isSimilarName = (nameA: string, nameB: string) => {
    if (!nameA || !nameB) return false;
    const cleanA = nameA.trim().toLowerCase();
    const cleanB = nameB.trim().toLowerCase();
    if (cleanA === cleanB) return true;
    
    const tokensA = getSortedTokens(nameA);
    const tokensB = getSortedTokens(nameB);
    return tokensA && tokensA === tokensB;
  };

  const handleImportButton = () => {
    setImportSummary(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportSummary(null);
    setApplyToAllAction(null); // Reset bulk choice
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      if (!workbook.SheetNames.length) {
        throw new Error('No worksheet found in the imported file.');
      }
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      if (!rawRows.length) {
        throw new Error('The imported file contains no student records.');
      }

      // Require exact columns: StudentNo, Name, Class, Stream, Gender, BoardingStatus (case-insensitive)
      const required = ['studentno', 'name', 'class', 'stream', 'gender', 'boardingstatus'];
      const headerRow = rawRows[0] ? Object.keys(rawRows[0]).map(h => String(h).trim().toLowerCase()) : [];
      const missing = required.filter(r => !headerRow.includes(r));
      if (missing.length) {
        throw new Error('Imported file is missing required columns. Expected columns: StudentNo, Name, Class, Stream, Gender, BoardingStatus');
      }

      const seenStudentNos = new Set<string>();
      let skipped = 0;
      let updated = 0;
      let created = 0;
      let failed = 0;

      // Process each row
      for (let index = 0; index < rawRows.length; index++) {
        const row = rawRows[index];
        const normalizedRow = normalizeRow(row);
        const studentNo = normalizedRow['studentno'] || '';
        const name = normalizedRow['name'] || '';
        const classValue = normalizedRow['class'] || '';
        const streamValue = normalizedRow['stream'] || '';
        const genderValue = normalizedRow['gender'] || '';
        const boardingValue = normalizedRow['boardingstatus'] || '';

        if (!studentNo || !name) {
          failed += 1;
          continue;
        }

        const normalizedStudentNo = studentNo.toLowerCase();
        if (seenStudentNos.has(normalizedStudentNo)) {
          skipped += 1;
          continue;
        }

        // Convert codes
        let gender: 'Male' | 'Female' = 'Male';
        if (/^f$/i.test(genderValue) || /^female/i.test(genderValue)) gender = 'Female';
        if (/^m$/i.test(genderValue) || /^male/i.test(genderValue)) gender = 'Male';

        let boardingStatus: 'Hosteller' | 'Day Scholar' = 'Hosteller';
        if (/^d$/i.test(boardingValue) || /day/i.test(boardingValue)) boardingStatus = 'Day Scholar';
        if (/^b$/i.test(boardingValue) || /boarder/i.test(boardingValue) || /host/i.test(boardingValue)) boardingStatus = 'Hosteller';

        // Check if a duplicate already exists (same number or similar name in same class/stream)
        const existingSimilar = students.find((s: any) => {
          const adminMatch = s.adminNo && s.adminNo.trim().toLowerCase() === studentNo.trim().toLowerCase();
          const nameMatch = isSimilarName(s.name, name);
          const aliasMatch = Array.isArray(s.aliases) && s.aliases.some((alias: string) => isSimilarName(alias, name));

          const studentGrade = (s.gradeClass || '').toLowerCase();
          let sameClass = true;
          if (classValue && classValue.trim()) {
            sameClass = studentGrade.includes(classValue.trim().toLowerCase());
          }
          let sameStream = true;
          if (streamValue && streamValue.trim()) {
            sameStream = studentGrade.includes(streamValue.trim().toLowerCase());
          }
          const nameAndClassMatch = (nameMatch || aliasMatch) && sameClass && sameStream;

          return adminMatch || nameAndClassMatch;
        });

        let action: 'update' | 'skip' | 'create' = 'create';

        if (existingSimilar) {
          if (applyToAllAction) {
            action = applyToAllAction;
          } else {
            // Wait for user modal resolution
            action = await new Promise<'update' | 'skip' | 'create'>((resolve) => {
              setDuplicatePrompt({
                rowStudent: {
                  adminNo: studentNo.trim(),
                  name: name.trim(),
                  gender,
                  gradeClass: (classValue || '').toString().trim() + (streamValue ? ` ${streamValue.toString().trim()}` : ''),
                  boardingStatus
                },
                existingStudent: existingSimilar,
                resolve: (decision: 'update' | 'skip' | 'create', applyToAll: boolean) => {
                  if (applyToAll) {
                    setApplyToAllAction(decision);
                  }
                  setDuplicatePrompt(null);
                  resolve(decision);
                }
              });
            });
          }
        } else {
          action = 'create';
        }

        if (action === 'update' && existingSimilar) {
          try {
            const updatedStudent = {
              ...existingSimilar,
              adminNo: studentNo.trim(),
              studentNo: studentNo.trim(),
              gender,
              boardingStatus
            };
            await updateStudentInDb(existingSimilar.id, updatedStudent as any);
            updated += 1;
          } catch (err) {
            console.error('Failed to update existing student during import:', err);
            failed += 1;
          }
        } else if (action === 'create') {
          try {
            const newStudent = {
              id: createIdFromAdminNo(studentNo, index),
              adminNo: studentNo.trim(),
              studentNo: studentNo.trim(),
              name: name.trim(),
              gender,
              gradeClass: (classValue || '').toString().trim() + (streamValue ? ` ${streamValue.toString().trim()}` : ''),
              boardingStatus,
              isCleared: false,
              remarks: '',
              printStatus: 'Not Printed',
              gateClearanceDate: undefined,
              mealsClearanceDate: undefined
            };
            await saveStudentInDb(newStudent as any);
            created += 1;
          } catch (err) {
            console.error('Failed to create student during import:', err);
            failed += 1;
          }
        } else {
          // action === 'skip'
          skipped += 1;
        }

        seenStudentNos.add(normalizedStudentNo);
      }

      await loadClearanceData();
      setImportSummary(`Imported: ${created} created, ${updated} updated. ${skipped} duplicate record(s) skipped, ${failed} invalid/failed row(s).`);

    } catch (err: any) {
      console.error('Import failed:', err);
      alert('Import failed: ' + (err?.message || 'Unable to read the file.'));
    } finally {
      setIsImporting(false);
    }
  };

  const handlePrintAll = async () => {
    if (students.length === 0) {
      alert('No students available to print.');
      return;
    }
    setIsPrinting(true);
    setPrintProgress({ current: 0, total: students.length });

    try {
      const response = await generatePdfOnServer({
        layoutMode: 'front-back-paired',
        studentIds: students.map((s) => s.id),
        printSide: 'both',
        increasePdfBrightness: true,
        showWatermark: false,
        watermarkOpacity: 25,
        schoolLogoBase64: null
      });

      if (!response.success || !response.taskId) {
        throw new Error('Unable to start print job.');
      }

      let done = false;
      const baseUrl = getApiBaseUrl() || 'http://localhost:3000';
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const statusRes = await fetchPdfTaskStatus(response.taskId);
        setPrintProgress({ current: statusRes.progress, total: statusRes.total });
        if (statusRes.status === 'completed') {
          done = true;
          await triggerFileDownload(`${baseUrl}/api/pdf/download/${statusRes.filename}`, statusRes.filename!);
          
          // Mark all students as printed locally in the state to reflect immediately in the UI
          const printedIds = students.map((s) => s.id);
          setStudents((prev) =>
            prev.map((s) => (printedIds.includes(s.id) ? { ...s, printStatus: 'Printed' as const } : s))
          );
        } else if (statusRes.status === 'failed') {
          throw new Error(statusRes.error || 'PDF generation failed.');
        }
      }
    } catch (err: any) {
      console.error('Printing failed:', err);
      alert('Printing failed: ' + (err?.message || 'Unable to generate the PDF.'));
    } finally {
      setIsPrinting(false);
      setPrintProgress(null);
    }
  };

  const handleExportData = async () => {
    if (students.length === 0) {
      alert('No students available for export.');
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = filteredStudents.map((s) => ({
        'Student Name': s.name,
        'Student Number': s.adminNo,
        'Class/Form': s.gradeClass,
        'Gender': s.gender,
        'Boarding Status': s.boardingStatus,
        'Clearance Status': s.isCleared ? 'Cleared' : 'On Hold',
        'Print Status': s.printStatus || 'Not Printed',
        Remarks: s.remarks || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ClearanceRoster');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `clearance-roster-${dateStr}.xlsx`;
      const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });

      if (typeof window !== 'undefined' && (window as any).electron?.saveFileBase64) {
        const result = await (window as any).electron.saveFileBase64(filename, base64Data, [
          { name: 'Excel Spreadsheet', extensions: ['xlsx'] }
        ]);
        if (!result?.success && result?.error !== 'Cancelled') {
          throw new Error(result?.error || 'Unable to save file.');
        }
      } else {
        XLSX.writeFile(workbook, filename);
      }
      alert('Export completed successfully.');
    } catch (err: any) {
      console.error('Export failed:', err);
      alert('Export failed: ' + (err?.message || 'Unable to generate the export file.'));
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) return <Loading message="Loading students..." />;

  return (
    <div className="p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-black uppercase">THE MIGHTY SYSTEM</h1>
        <div className="text-indigo-400 font-black text-sm mt-1">CLEARANCE CARDS WORKSPACE</div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
          <div className="text-xs text-slate-400 uppercase font-mono">Roster Total</div>
          <div className="text-xl font-black mt-2">{filteredStats.total}</div>
        </div>
        <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
          <div className="text-xs text-slate-400 uppercase font-mono">Cleared</div>
          <div className="text-xl font-black mt-2">{filteredStats.clearedCount}</div>
        </div>
        <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
          <div className="text-xs text-slate-400 uppercase font-mono">Hold</div>
          <div className="text-xl font-black mt-2">{filteredStats.balanceCount}</div>
        </div>
        <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
          <div className="text-xs text-slate-400 uppercase font-mono">Queued</div>
          <div className="text-xl font-black mt-2">{filteredStats.printQueue}</div>
        </div>
      </section>

      <section className="mb-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search students"
              className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm w-full md:w-64"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <select
              value={filterClass}
              onChange={(e) => {
                setFilterClass(e.target.value);
                setFilterBoarding('All');
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
            >
              {uniqueClasses.map((c) => (
                <option key={c} value={c}>{c === 'All' ? 'All Classes' : c}</option>
              ))}
            </select>
            <select
              value={filterStream}
              onChange={(e) => setFilterStream(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
            >
              {uniqueStreams.map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All Streams' : s}</option>
              ))}
            </select>
            {filterClass !== 'All' && (
              <select
                value={filterBoarding}
                onChange={(e) => setFilterBoarding(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none uppercase font-semibold"
              >
                <option value="All">All Students</option>
                <option value="Hosteller">Hostellers</option>
                <option value="Day Scholar">Day Scholars</option>
              </select>
            )}
          </div>
        </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
            <button
              type="button"
              onClick={handleImportButton}
              className="px-3 py-2 rounded-lg bg-emerald-700 text-white flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" /> Import
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              className="px-3 py-2 rounded-lg bg-indigo-500 text-white flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> {isPrinting ? 'Printing...' : 'Print'}
            </button>
            <button
              type="button"
              onClick={handleExportData}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>

        {importSummary && (
          <div className="mb-3 rounded-lg bg-slate-950 border border-emerald-700/20 p-3 text-sm text-slate-200">
            {importSummary}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImportFile}
          className="hidden"
        />

        {printProgress && (
          <div className="mb-3 rounded-lg bg-slate-950 border border-indigo-500/20 p-3 text-sm text-slate-200">
            Printing progress: {printProgress.current} / {printProgress.total}
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2">
          {filteredStudents.length === 0 ? (
            <div className="p-4 text-slate-400">No students match the current search or selected filters.</div>
          ) : (
            <div className="space-y-4">
              {CLASS_ORDER.map((className) => {
                const classGroup = filteredStudents
                  .filter((student) => parseGradeClass(student.gradeClass).className === className)
                  .sort((a, b) => a.name.localeCompare(b.name));
                if (!classGroup.length) return null;

                return (
                  <section key={className} className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                    <div className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-300 bg-slate-950/90 border-b border-slate-800">
                      {className}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 p-3">
                      {STREAM_ORDER.map((streamName) => {
                        const streamGroup = classGroup.filter((student) => parseGradeClass(student.gradeClass).streamName === streamName);

                        return (
                          <div key={`${className}-${streamName}`} className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 bg-slate-900/80 border-b border-slate-800">
                              {streamName}
                            </div>
                            <div className="divide-y divide-slate-800">
                              {streamGroup.length === 0 ? (
                                <div className="p-3 text-center text-slate-500 text-xs">No students</div>
                              ) : (
                                streamGroup.map((student: any) => (
                                  <div key={student.id} className="py-2 px-3 text-sm text-slate-200 last:border-none">
                                    <div className="font-semibold truncate">{student.name}</div>
                                    <div className="text-[11px] text-slate-500 truncate">{student.adminNo}</div>
                                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">
                                      {student.isCleared ? 'Cleared' : 'Hold'}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-black uppercase text-slate-100">Add Clearance Student</h2>
                <p className="text-xs text-slate-500">Enter student details and save directly to the clearance roster.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSaveStudent} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-slate-300 text-sm">
                  Student Number
                  <input
                    value={addForm.adminNo}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, adminNo: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="block text-slate-300 text-sm">
                  Full Name
                  <input
                    value={addForm.name}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-slate-300 text-sm">
                  Class / Form
                  <input
                    value={addForm.gradeClass}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, gradeClass: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </label>
                <label className="block text-slate-300 text-sm">
                  Gender
                  <select
                    value={addForm.gender}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, gender: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </label>
                <label className="block text-slate-300 text-sm">
                  Boarding Status
                  <select
                    value={addForm.boardingStatus}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, boardingStatus: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  >
                    <option value="Hosteller">Hosteller</option>
                    <option value="Day Scholar">Day Scholar</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 items-center">
                <label className="flex items-center gap-3 text-slate-300 text-sm">
                  <input
                    type="checkbox"
                    checked={addForm.isCleared}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, isCleared: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500"
                  />
                  Mark student as cleared
                </label>
                <label className="block text-slate-300 text-sm">
                  Remarks
                  <input
                    value={addForm.remarks}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, remarks: e.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-2xl border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-2xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {duplicatePrompt && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center text-amber-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-slate-100 tracking-wide">Duplicate Student Warning</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">A similar student record was found in the database.</p>
              </div>
            </div>

            {/* Comparison card */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800/80">
              <div className="grid grid-cols-2 p-3 text-[10px] uppercase font-black text-slate-500 tracking-wider bg-slate-950/30">
                <div>Importing Row</div>
                <div>Existing Registry Record</div>
              </div>
              <div className="grid grid-cols-2 p-3 text-xs gap-3">
                <div className="space-y-1.5 font-medium">
                  <div className="text-slate-100 font-bold">{duplicatePrompt.rowStudent.name}</div>
                  <div className="text-slate-400 font-mono">No: {duplicatePrompt.rowStudent.adminNo}</div>
                  <div className="text-slate-400">Class: {duplicatePrompt.rowStudent.gradeClass}</div>
                  <div className="text-slate-400">Boarding: {duplicatePrompt.rowStudent.boardingStatus}</div>
                  <div className="text-slate-400">Gender: {duplicatePrompt.rowStudent.gender}</div>
                </div>
                <div className="space-y-1.5 font-medium border-l border-slate-800/50 pl-3">
                  <div className="text-slate-100 font-bold">{duplicatePrompt.existingStudent.name}</div>
                  <div className="text-slate-400 font-mono">No: {duplicatePrompt.existingStudent.adminNo || 'None'}</div>
                  <div className="text-slate-400">Class: {duplicatePrompt.existingStudent.gradeClass}</div>
                  <div className="text-slate-400">Boarding: {duplicatePrompt.existingStudent.boardingStatus}</div>
                  <div className="text-slate-400">Gender: {duplicatePrompt.existingStudent.gender}</div>
                </div>
              </div>
            </div>

            {/* Remember decision checkbox */}
            <label className="flex items-center gap-2.5 text-xs text-slate-400 font-medium select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-slate-700 bg-slate-950 text-indigo-500 cursor-pointer"
              />
              Apply this choice to all remaining duplicates in this file
            </label>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  duplicatePrompt.resolve('update', rememberChoice);
                  setRememberChoice(false);
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-550 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex-1"
              >
                Update Existing Student
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicatePrompt.resolve('create', rememberChoice);
                  setRememberChoice(false);
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex-1 border border-slate-700"
              >
                Create New Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicatePrompt.resolve('skip', rememberChoice);
                  setRememberChoice(false);
                }}
                className="px-4 py-2.5 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex-1 border border-rose-900/40"
              >
                Skip Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
