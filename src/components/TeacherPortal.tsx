import React, { useEffect, useState } from 'react';
import { BookOpen, LogOut, CheckCircle2, Save, AlertCircle, RefreshCw, ClipboardList, Search, ChevronDown, Check, Upload, User, Smile, Award, Clock, ChevronRight, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import SchoolLogo from './SchoolLogo.tsx';
import { 
  fetchTeacherStudents, 
  fetchTeacherMarks, 
  saveTeacherMarks, 
  submitTeacherMarks,
  fetchClassesFromDb,
  fetchStreamsFromDb,
  fetchSettings
} from '../utils/api.ts';

interface TeacherPortalProps {
  teacherId: string;
  teacherName: string;
  teacherUsername?: string;
  assignedClasses: string[];
  assignedSubjects: string[];
  teacherAssignments?: { subject: string, grade_class: string }[];
  schoolLogo: string | null;
  gender?: string;
  photo?: string;
  classTeacherFor?: string[];
  onLogout: () => void;
}

export default function TeacherPortal({
  teacherId,
  teacherName,
  teacherUsername,
  assignedClasses = [],
  assignedSubjects = [],
  teacherAssignments = [],
  schoolLogo,
  gender = '',
  photo = '',
  classTeacherFor = [],
  onLogout
}: TeacherPortalProps) {
  const [activeView, setActiveView] = useState<'dashboard' | 'marks'>('dashboard');
  const [allSubjects, setAllSubjects] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>('');
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState<boolean>(false);

  const [classList, setClassList] = useState<string[]>([]);
  const [streamList, setStreamList] = useState<string[]>([]);
  const [selectedClassVal, setSelectedClassVal] = useState<string>('');
  const [selectedStreamVal, setSelectedStreamVal] = useState<string>('');

  const [term, setTerm] = useState('2');
  const [year, setYear] = useState(2026);
  const [selectedPaper, setSelectedPaper] = useState<number>(1);

  const [students, setStudents] = useState<any[]>([]);
  const [marksMap, setMarksMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({});
  const [excelUploadErrors, setExcelUploadErrors] = useState<string[]>([]);
  const [assessmentLimits, setAssessmentLimits] = useState<any>({
    olevel: { integration_max: 3, exam_max: 100 },
    uace: { score_max: 100 }
  });

  const isUACE = selectedClassVal.startsWith('S.5') || selectedClassVal.startsWith('S.6');

  const STREAM_ORDER = ['A', 'B', 'C', 'Arts', 'Sciences'];
  const orderStreams = (streams: string[]) => {
    const uniqueStreams = Array.from(new Set(streams));
    return uniqueStreams.sort((a, b) => {
      const aIndex = STREAM_ORDER.indexOf(a);
      const bIndex = STREAM_ORDER.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  };

  // Helper function to parse class and stream from combined values like "S2C" or "S2 Arts"
  const parseClassAndStream = (combined: string): { class: string; stream: string } => {
    if (!combined) return { class: '', stream: '' };
    
    // Normalize format (remove dots if present)
    const normalized = combined.replace('S.', 'S');
    
    // Common patterns:
    // "S2C" -> class: "S2", stream: "C"
    // "S2 Arts" -> class: "S2", stream: "Arts"
    // "S2 Sciences" -> class: "S2", stream: "Sciences"
    // "S2A" -> class: "S2", stream: "A"
    
    const streamMatch = combined.match(/\s*(Arts|Sciences|A|B|C)$/i);
    if (streamMatch) {
      const stream = streamMatch[1];
      const classVal = combined.substring(0, combined.length - stream.length).trim();
      return { class: classVal, stream };
    }
    
    // If no stream pattern found, treat as just class
    return { class: combined, stream: '' };
  };

  // Load all subjects, classes and streams on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [settings, dbClasses, dbStreams] = await Promise.all([
          fetchSettings(),
          fetchClassesFromDb(),
          fetchStreamsFromDb()
        ]);

        const olevel = settings.olevel_subjects ? JSON.parse(settings.olevel_subjects) : [];
        const uace = settings.uace_subjects ? JSON.parse(settings.uace_subjects) : [];
        const combined = Array.from(new Set([...olevel, ...uace])) as string[];
        setAllSubjects(combined);

        setClassList(dbClasses.map((c: any) => c.name));
        setStreamList(orderStreams(dbStreams.map((s: any) => s.name)));
        // Load assessment limits from settings if present
        try {
          if (settings && settings.assessment_limits) {
            const al = typeof settings.assessment_limits === 'string' ? JSON.parse(settings.assessment_limits) : settings.assessment_limits;
            setAssessmentLimits(al);
          }
        } catch (err) {
          console.warn('Failed to parse assessment_limits from settings:', err);
        }
      } catch (err) {
        console.error('Failed to load settings metadata:', err);
        // Fallback default lists
        setAllSubjects([
          "English Language", "Mathematics", "Biology", "Chemistry", "Physics",
          "History and Political Education", "Geography", "Kiswahili", "Entrepreneurship Education",
          "Physical Education", "Christian Religious Education", "Islamic Religious Education",
          "Agriculture", "Information and Communications Technology (ICT)", "Art and Design",
          "Performing Arts", "Literature in English", "Nutrition and Food Technology",
          "Technology and Design", "Local Languages", "Foreign Languages",
          "Economics", "General Paper", "Subsidiary Mathematics", "Subsidiary ICT"
        ]);
        setClassList(['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6']);
        setStreamList(orderStreams(['A', 'B', 'C', 'Arts', 'Sciences']));
      }
    };
    loadMetadata();
  }, []);

  const availableSubjects = (assignedSubjects && assignedSubjects.length > 0) ? assignedSubjects : allSubjects;
  const filteredSubjects = availableSubjects.filter(sub =>
    sub.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const toggleSubject = (sub: string) => {
    setSelectedSubjects(prev => {
      const exists = prev.includes(sub);
      const next = exists ? prev.filter(s => s !== sub) : [...prev, sub];
      // if no activeSubject set and one selected, set it
      if (!activeSubject && next.length > 0) setActiveSubject(next[0]);
      // if activeSubject was removed, clear it or pick another
      if (activeSubject && !next.includes(activeSubject)) setActiveSubject(next[0] || '');
      return next;
    });
  };

  const selectAllSubjects = (all: boolean) => {
    if (all) {
      setSelectedSubjects(availableSubjects.slice());
      setActiveSubject(availableSubjects[0] || '');
    } else {
      setSelectedSubjects([]);
      setActiveSubject('');
    }
  };

  // Load students and marks worksheet
  const loadData = async () => {
    if (!selectedSubjects || selectedSubjects.length === 0 || !selectedClassVal || !selectedStreamVal) return;
    const combinedClass = `${selectedClassVal} ${selectedStreamVal}`;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const studentList = await fetchTeacherStudents(combinedClass);
      // Load marks for the currently active subject only
      const marksList = activeSubject ? await fetchTeacherMarks({
        gradeClass: combinedClass,
        subject: activeSubject,
        term,
        year,
        paper: selectedPaper
      }) : [];

      const map: Record<string, any> = {};
      marksList.forEach((m) => {
        map[m.student_id] = m;
      });

      studentList.forEach((s) => {
          if (!map[s.id]) {
            if (isUACE) {
              let defaultType: 'Principal' | 'Subsidiary' | 'General Paper' = 'Principal';
              if (activeSubject === 'General Paper') defaultType = 'General Paper';
              else if (activeSubject && activeSubject.toLowerCase().includes('subsidiary') || (activeSubject && activeSubject.toLowerCase().includes('ict'))) {
                defaultType = 'Subsidiary';
              }
              map[s.id] = {
                student_id: s.id,
                subject: activeSubject,
                subject_type: defaultType,
                paper: selectedPaper,
                bot: null,
                mot: null,
                eot: null,
                score: null,
                grade: null,
                points: null,
                term,
                year,
                status: 'Draft'
              };
            } else {
              map[s.id] = {
                student_id: s.id,
                subject: activeSubject,
                integration1: null,
                integration2: null,
                integration3: null,
                exam_score: null,
                term,
                year,
                status: 'Draft'
              };
            }
          }
      });

      setStudents(studentList);
      setMarksMap(map);
    } catch (err: any) {
      console.error('Error loading teacher marks worksheet:', err);
      setError(err.message || 'Failed to fetch student data for worksheet.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load student list when subject, class, and stream are selected
  useEffect(() => {
    if (selectedSubjects && selectedSubjects.length > 0 && selectedClassVal && selectedStreamVal) {
      loadData();
    } else {
      setStudents([]);
      setMarksMap({});
    }
  }, [selectedSubjects, activeSubject, selectedClassVal, selectedStreamVal, term, year, selectedPaper]);

  // Auto-clear success and error message banners
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (activeSubject === 'General Paper' || (activeSubject && activeSubject.toLowerCase().includes('subsidiary')) || (activeSubject && activeSubject.toLowerCase().includes('ict'))) {
      setSelectedPaper(1);
    }
  }, [activeSubject]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error]);


  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        if (!workbook.SheetNames.length) {
          setError('Uploaded workbook contains no sheets.');
          return;
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (sheetData.length === 0) {
          setError('The uploaded sheet is empty.');
          return;
        }

        // Find header row (search first 10 rows)
        let headerRowIdx = -1;
        let nameColIdx = -1;
        
        // O-Level Marks Columns
        let ai1ColIdx = -1;
        let ai2ColIdx = -1;
        let ai3ColIdx = -1;
        let examColIdx = -1;

        // UACE Marks Columns
        let scoreColIdx = -1;
        let typeColIdx = -1;
        let botColIdx = -1;
        let motColIdx = -1;
        let eotColIdx = -1;
        let paperColIdx = -1;

        for (let r = 0; r < Math.min(10, sheetData.length); r++) {
          const row = sheetData[r];
          if (!row) continue;
          const isHeader = row.some(cell => {
            if (cell === undefined || cell === null) return false;
            const s = String(cell).toLowerCase().trim();
            return s.includes('name') || s.includes('student') || s.includes('mark') || s.includes('score') || s.includes('exam') || s.includes('ai') || s.includes('integration');
          });
          if (isHeader) {
            headerRowIdx = r;
            break;
          }
        }

        if (headerRowIdx !== -1) {
          const headerRow = sheetData[headerRowIdx];
          headerRow.forEach((cell, idx) => {
            if (cell === undefined || cell === null) return;
            const s = String(cell).toLowerCase().trim();
            
            // Name column matching
            if (s.includes('name') || s.includes('student')) {
              nameColIdx = idx;
            }
            // AI/Integration columns (O-Level)
            else if ((s.includes('integration') && s.includes('1')) || (s.includes('ai') && s.includes('1')) || (s.includes('ca') && s.includes('1'))) {
              ai1ColIdx = idx;
            }
            else if ((s.includes('integration') && s.includes('2')) || (s.includes('ai') && s.includes('2')) || (s.includes('ca') && s.includes('2'))) {
              ai2ColIdx = idx;
            }
            else if ((s.includes('integration') && s.includes('3')) || (s.includes('ai') && s.includes('3')) || (s.includes('ca') && s.includes('3'))) {
              ai3ColIdx = idx;
            }
            // Exam score (O-Level) or Score (UACE)
            else if (s.includes('exam') || s.includes('final')) {
              examColIdx = idx;
            }
            else if (s.includes('score') || s.includes('mark')) {
              scoreColIdx = idx;
            }
            else if (s.includes('bot')) {
              botColIdx = idx;
            }
            else if (s.includes('mot')) {
              motColIdx = idx;
            }
            else if (s.includes('eot')) {
              eotColIdx = idx;
            }
            // Paper Type (UACE)
            else if (s.includes('type') || s.includes('paper') || s === 'p') {
              typeColIdx = idx;
              paperColIdx = idx;
            }
          });
        }

        // Fallback column indexing if not detected or partially detected
        if (nameColIdx === -1) {
          nameColIdx = 0;
        }

        if (isUACE && scoreColIdx === -1 && examColIdx !== -1) {
          scoreColIdx = examColIdx;
        } else if (!isUACE && examColIdx === -1 && scoreColIdx !== -1) {
          examColIdx = scoreColIdx;
        }

        // Helper to normalize names for strict name-only matching
        const normalizeName = (nameStr: string) => {
          return nameStr ? nameStr.toString().toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        };

        // Build a map of normalized loaded student name or alias -> student object
        const activeStudentsByName = new Map<string, any>();
        students.forEach(s => {
          const norm = normalizeName(s.name);
          if (norm) {
            activeStudentsByName.set(norm, s);
          }
          if (Array.isArray(s.aliases)) {
            s.aliases.forEach((alias) => {
              const aliasNorm = normalizeName(alias);
              if (aliasNorm) {
                activeStudentsByName.set(aliasNorm, s);
              }
            });
          }
        });

        let matchCount = 0;
        let skippedCount = 0;
        let invalidMarksCount = 0;
        const invalidRows: string[] = [];
        const unmatchedNames: string[] = [];

        const nextMarksMap = { ...marksMap };

        const startRowIdx = headerRowIdx === -1 ? 0 : headerRowIdx + 1;
        for (let i = startRowIdx; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (!row || row.length === 0) continue;

          const rawName = row[nameColIdx];
          if (rawName === undefined || rawName === null) continue;
          const name = String(rawName).trim();
          if (!name) continue;

          const norm = normalizeName(name);
          const matchedStudent = activeStudentsByName.get(norm);

          if (!matchedStudent) {
            unmatchedNames.push(name);
            skippedCount++;
            continue;
          }

          const rowNumber = i + 1;
          const studentId = matchedStudent.id;
          const currentRecord = { ...nextMarksMap[studentId] };
          let hasUpdates = false;
          let rowRejected = false;
          const rowErrors: string[] = [];

          if (isUACE) {
            let newBotVal = currentRecord.bot;
            let newMotVal = currentRecord.mot;
            let newEotVal = currentRecord.eot;
            let newScoreVal = currentRecord.score;
            let newTypeVal = currentRecord.subject_type;
            let newPaperVal = currentRecord.paper || selectedPaper;

            const parseUACEVal = (colIdx: number, label: string) => {
              if (colIdx !== -1 && row[colIdx] !== undefined && row[colIdx] !== null && row[colIdx] !== '') {
                const val = parseFloat(row[colIdx]);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                  return val;
                } else {
                  rowRejected = true;
                  rowErrors.push(`${label} must be between 0 and 100`);
                }
              }
              return null;
            };

            const botResult = parseUACEVal(botColIdx, 'BOT');
            if (botResult !== null) { newBotVal = botResult; hasUpdates = true; }

            const motResult = parseUACEVal(motColIdx, 'MOT');
            if (motResult !== null) { newMotVal = motResult; hasUpdates = true; }

            const eotResult = parseUACEVal(eotColIdx, 'EOT');
            if (eotResult !== null) { newEotVal = eotResult; hasUpdates = true; }

            if (botResult !== null || motResult !== null || eotResult !== null) {
              const b = newBotVal !== null && newBotVal !== undefined ? parseFloat(newBotVal) : 0;
              const m = newMotVal !== null && newMotVal !== undefined ? parseFloat(newMotVal) : 0;
              const e = newEotVal !== null && newEotVal !== undefined ? parseFloat(newEotVal) : 0;
              newScoreVal = Math.round(b * 0.3 + m * 0.3 + e * 0.4);
              hasUpdates = true;
            } else if (scoreColIdx !== -1 && row[scoreColIdx] !== undefined && row[scoreColIdx] !== null && row[scoreColIdx] !== '') {
              const val = parseFloat(row[scoreColIdx]);
              if (!isNaN(val) && val >= 0 && val <= 100) {
                newScoreVal = val;
                hasUpdates = true;
              } else {
                rowRejected = true;
                rowErrors.push('Score must be between 0 and 100');
              }
            }

            if (paperColIdx !== -1 && row[paperColIdx] !== undefined && row[paperColIdx] !== null && row[paperColIdx] !== '') {
              const val = parseInt(row[paperColIdx], 10);
              if (!isNaN(val) && val >= 1 && val <= 3) {
                newPaperVal = val;
                hasUpdates = true;
              }
            }

            if (typeColIdx !== -1 && row[typeColIdx] !== undefined && row[typeColIdx] !== null && row[typeColIdx] !== '') {
              const rawType = String(row[typeColIdx]).trim().toLowerCase();
              if (rawType.includes('principal')) {
                newTypeVal = 'Principal';
                hasUpdates = true;
              } else if (rawType.includes('sub') || rawType.includes('ict')) {
                newTypeVal = 'Subsidiary';
                hasUpdates = true;
              } else if (rawType.includes('general') || rawType.includes('gp') || rawType.includes('paper')) {
                newTypeVal = 'General Paper';
                hasUpdates = true;
              }
            }

            if (!rowRejected && hasUpdates) {
              currentRecord.bot = newBotVal;
              currentRecord.mot = newMotVal;
              currentRecord.eot = newEotVal;
              currentRecord.score = newScoreVal;
              currentRecord.subject_type = newTypeVal;
              currentRecord.paper = newPaperVal;

              const scoreNum = parseFloat(newScoreVal) || 0;
              let grInfo = { grade: 'F', points: 0 };
              if (newTypeVal === 'General Paper' || newTypeVal === 'Subsidiary') {
                grInfo = getUACESubGPGrade(scoreNum);
              } else {
                grInfo = getUACEPrincipalGrade(scoreNum);
              }
              currentRecord.grade = grInfo.grade;
              currentRecord.points = grInfo.points;
            }
          } else {
            let updatedAI1 = currentRecord.integration1;
            let updatedAI2 = currentRecord.integration2;
            let updatedAI3 = currentRecord.integration3;
            let updatedExam = currentRecord.exam_score;

            const parseOLevelAI = (val: any, label: string) => {
              if (val === undefined || val === null || val === '') return null;
              const num = parseFloat(val);
              const max = 3; // Strictly capped at 3
              if (isNaN(num) || num < 0 || num > max) {
                rowErrors.push(`${label} must be between 0 and ${max}`);
                rowRejected = true;
                return undefined;
              }
              return num;
            };

            const parseOLevelExam = (val: any) => {
              if (val === undefined || val === null || val === '') return null;
              const num = parseFloat(val);
              const max = 100; // Strictly capped at 100
              if (isNaN(num) || num < 0 || num > max) {
                rowErrors.push('Exam score must be between 0 and 100');
                rowRejected = true;
                return undefined;
              }
              return num;
            };

            if (ai1ColIdx !== -1 && row[ai1ColIdx] !== undefined) {
              const val = parseOLevelAI(row[ai1ColIdx], 'AI1');
              if (val !== undefined) { updatedAI1 = val; hasUpdates = true; }
            }
            if (ai2ColIdx !== -1 && row[ai2ColIdx] !== undefined) {
              const val = parseOLevelAI(row[ai2ColIdx], 'AI2');
              if (val !== undefined) { updatedAI2 = val; hasUpdates = true; }
            }
            if (ai3ColIdx !== -1 && row[ai3ColIdx] !== undefined) {
              const val = parseOLevelAI(row[ai3ColIdx], 'AI3');
              if (val !== undefined) { updatedAI3 = val; hasUpdates = true; }
            }
            if (examColIdx !== -1 && row[examColIdx] !== undefined) {
              const val = parseOLevelExam(row[examColIdx]);
              if (val !== undefined) { updatedExam = val; hasUpdates = true; }
            }

            if (!rowRejected && hasUpdates) {
              currentRecord.integration1 = updatedAI1;
              currentRecord.integration2 = updatedAI2;
              currentRecord.integration3 = updatedAI3;
              currentRecord.exam_score = updatedExam;
            }
          }

          if (rowRejected) {
            invalidMarksCount++;
            invalidRows.push(`Row ${rowNumber}: ${rowErrors.join('; ')}`);
            continue;
          }

          if (hasUpdates) {
            nextMarksMap[studentId] = currentRecord;
            matchCount++;
          }
        }

        setMarksMap(nextMarksMap);
        setExcelUploadErrors(invalidRows);

        let summary = `Excel import finished: ${matchCount} students updated.`;
        if (skippedCount > 0) {
          summary += ` ${skippedCount} rows in Excel could not be matched to any student by name.`;
        }
        if (invalidMarksCount > 0) {
          summary += ` Skipped ${invalidMarksCount} out-of-range marks.`;
        }
        setSuccessMessage(summary);
        if (invalidRows.length > 0) {
          setError('Some rows were rejected due to invalid marks. Please review the details below.');
        } else {
          setError(null);
        }

        if (unmatchedNames.length > 0) {
          console.log('Unmatched student names in uploaded Excel:', unmatchedNames);
        }
      } catch (err: any) {
        console.error('Error processing Excel upload:', err);
        setError('Error reading Excel spreadsheet content.');
        setExcelUploadErrors([]);
      } finally {
        if (e.target) e.target.value = '';
      }
    };

    reader.onerror = () => {
      setError('Failed to read Excel file.');
      setExcelUploadErrors([]);
      if (e.target) e.target.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  const getFieldLabel = (field: string) => {
    if (field === 'integration1') return 'AI1';
    if (field === 'integration2') return 'AI2';
    if (field === 'integration3') return 'AI3';
    if (field === 'exam_score') return 'Exam score';
    if (field === 'score') return 'Score';
    if (field === 'bot') return 'BOT';
    if (field === 'mot') return 'MOT';
    if (field === 'eot') return 'EOT';
    return field;
  };

  const handlePasteMark = (e: React.ClipboardEvent<HTMLInputElement>, field: string, max: number) => {
    const pasted = e.clipboardData.getData('text/plain').trim();
    const num = parseFloat(pasted);
    if (pasted === '' || Number.isNaN(num) || num < 0 || num > max) {
      e.preventDefault();
      setError(`${getFieldLabel(field)} must be between 0 and ${max}`);
    }
  };

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'];
    if (allowed.includes(e.key)) return;
    if (e.key === '.' || (e.key >= '0' && e.key <= '9')) return;
    e.preventDefault();
  };

  const handleMarkChange = (studentId: string, field: string, value: any, target?: HTMLInputElement) => {
    const rawValue = String(value).replace(',', '.');
    const trimmedValue = rawValue.trim();
    const isU = selectedClassVal.startsWith('S.5') || selectedClassVal.startsWith('S.6');
    const maxAI = 3; // Enforced strictly to 3
    const maxExam = 100; // Enforced strictly to 100
    const label = getFieldLabel(field);

    // IMMEDIATELY DENY out-of-range input values to prevent entering invalid marks
    if (trimmedValue !== '' && trimmedValue !== '.' && trimmedValue !== '0.') {
      const num = parseFloat(trimmedValue);
      if (!isNaN(num)) {
        let isInvalid = false;
        if (isU) {
          if (field === 'score') {
            if (num < 0 || num > maxExam) {
              isInvalid = true;
            }
          }
        } else {
          if (field.startsWith('integration')) {
            if (num < 0 || num > maxAI) {
              isInvalid = true;
            }
          } else if (field === 'exam_score') {
            if (num < 0 || num > maxExam) {
              isInvalid = true;
            }
          }
        }

        if (isInvalid) {
          if (target) {
            // Restore previous value in the input field directly
            const prevVal = marksMap[studentId]?.[field];
            target.value = prevVal !== undefined && prevVal !== null ? String(prevVal) : '';
          }
          return; // Deny state update
        }
      }
    }

    setFieldErrors(prevErrs => {
      const next = { ...prevErrs };
      const errsForStudent = { ...(next[studentId] || {}) };

      if (isU) {
        if (field === 'score') {
          if (trimmedValue === '') {
            delete errsForStudent['score'];
          } else if (isNaN(parseFloat(trimmedValue)) || parseFloat(trimmedValue) < 0 || parseFloat(trimmedValue) > maxExam) {
            errsForStudent['score'] = `${label} must be between 0 and ${maxExam}`;
          } else {
            delete errsForStudent['score'];
          }
        }
      } else {
        if (field.startsWith('integration')) {
          if (trimmedValue === '') {
            delete errsForStudent[field];
          } else if (isNaN(parseFloat(trimmedValue)) || parseFloat(trimmedValue) < 0 || parseFloat(trimmedValue) > maxAI) {
            errsForStudent[field] = `${label} must be between 0 and ${maxAI}`;
          } else {
            delete errsForStudent[field];
          }
        } else if (field === 'exam_score') {
          if (trimmedValue === '') {
            delete errsForStudent['exam_score'];
          } else if (isNaN(parseFloat(trimmedValue)) || parseFloat(trimmedValue) < 0 || parseFloat(trimmedValue) > maxExam) {
            errsForStudent['exam_score'] = `${label} must be between 0 and ${maxExam}`;
          } else {
            delete errsForStudent['exam_score'];
          }
        }
      }

      if (Object.keys(errsForStudent).length === 0) delete next[studentId]; else next[studentId] = errsForStudent;
      return next;
    });

    setMarksMap((prev) => {
      const current = { ...prev[studentId] };
      current[field] = trimmedValue === '' ? '' : trimmedValue;
      current.status = 'Draft'; // Revert back to Draft on any edit

      if (isUACE) {
        const score = parseFloat(current.score) || 0;
        const type = current.subject_type || 'Principal';
        let grInfo = { grade: 'F', points: 0 };
        if (type === 'General Paper' || type === 'Subsidiary') {
          grInfo = getUACESubGPGrade(score);
        } else {
          grInfo = getUACEPrincipalGrade(score);
        }
        current.grade = grInfo.grade;
        current.points = grInfo.points;
      }

      return {
        ...prev,
        [studentId]: current
      };
    });
  };

  // Validate on blur (typing may temporarily be incomplete). Keeps inline errors and prevents save.
  const handleMarkBlur = (studentId: string, field: string, value: any) => {
    const isU = selectedClassVal.startsWith('S.5') || selectedClassVal.startsWith('S.6');
    const trimmedValue = String(value).replace(',', '.').trim();
    const maxAI = 3; // Enforced strictly to 3
    const maxExam = 100; // Enforced strictly to 100
    const label = getFieldLabel(field);

    const updateMarkState = (newValue: number | null) => {
      setMarksMap(prev => {
        const current = prev[studentId] || {};
        const oldVal = current[field];
        const normalizedOld = (oldVal === undefined || oldVal === null || oldVal === '') ? null : parseFloat(oldVal);
        const normalizedNew = newValue;
        const isChanged = normalizedOld !== normalizedNew;
        const targetStatus = isChanged ? 'Draft' : (current.status || 'Draft');

        const updatedRecord = {
          ...current,
          [field]: newValue,
          status: targetStatus
        };

        if (isUACE && field === 'score') {
          const score = newValue;
          const type = current.subject_type || 'Principal';
          let grInfo = { grade: 'F', points: 0 };
          if (score !== null) {
            if (type === 'General Paper' || type === 'Subsidiary') {
              grInfo = getUACESubGPGrade(score);
            } else {
              grInfo = getUACEPrincipalGrade(score);
            }
          }
          updatedRecord.grade = score !== null ? grInfo.grade : null;
          updatedRecord.points = score !== null ? grInfo.points : null;
        }

        return {
          ...prev,
          [studentId]: updatedRecord
        };
      });
    };

    if (isU) {
      if (field === 'score') {
        if (trimmedValue === '') {
          setFieldErrors(prev => {
            const next = { ...prev };
            if (next[studentId]) { delete next[studentId].score; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
            return next;
          });
          updateMarkState(null);
          return;
        }
        const num = parseFloat(trimmedValue);
        if (isNaN(num) || num < 0 || num > maxExam) {
          setFieldErrors(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), score: `${label} must be between 0 and ${maxExam}` } }));
        } else {
          setFieldErrors(prev => {
            const next = { ...prev };
            if (next[studentId]) { delete next[studentId].score; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
            return next;
          });
          updateMarkState(num);
        }
      }
    } else if (field.startsWith('integration')) {
      if (trimmedValue === '') {
        setFieldErrors(prev => {
          const next = { ...prev };
          if (next[studentId]) { delete next[studentId][field]; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
          return next;
        });
        updateMarkState(null);
        return;
      }
      const num = parseFloat(trimmedValue);
      if (isNaN(num) || num < 0 || num > maxAI) {
        setFieldErrors(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), [field]: `${label} must be between 0 and ${maxAI}` } }));
      } else {
        setFieldErrors(prev => {
          const next = { ...prev };
          if (next[studentId]) { delete next[studentId][field]; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
          return next;
        });
        updateMarkState(num);
      }
    } else if (field === 'exam_score') {
      if (trimmedValue === '') {
        setFieldErrors(prev => {
          const next = { ...prev };
          if (next[studentId]) { delete next[studentId].exam_score; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
          return next;
        });
        updateMarkState(null);
        return;
      }
      const num = parseFloat(trimmedValue);
      if (isNaN(num) || num < 0 || num > maxExam) {
        setFieldErrors(prev => ({ ...prev, [studentId]: { ...(prev[studentId] || {}), exam_score: `${label} must be between 0 and ${maxExam}` } }));
      } else {
        setFieldErrors(prev => {
          const next = { ...prev };
          if (next[studentId]) { delete next[studentId].exam_score; if (Object.keys(next[studentId]).length === 0) delete next[studentId]; }
          return next;
        });
        updateMarkState(num);
      }
    }
  };

  const validateMarks = (): boolean => {
    for (const studentId of Object.keys(marksMap)) {
      const record = marksMap[studentId];
      const student = students.find(s => s.id === studentId);
      const studentName = student ? student.name : 'Student';

      if (isUACE) {
        const checkRange = (val: any, label: string) => {
          if (val !== undefined && val !== null && val !== '') {
            const num = parseFloat(val);
            if (isNaN(num) || num < 0 || num > 100) {
              return `${label} must be between 0 and 100.`;
            }
          }
          return null;
        };
        let err = checkRange(record.bot, 'BOT');
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
        err = checkRange(record.mot, 'MOT');
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
        err = checkRange(record.eot, 'EOT');
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
      } else {
        const maxAI = 3; // Strictly capped at 3
        const maxExam = 100; // Strictly capped at 100
        const checkRange = (val: any, label: string, maxVal: number) => {
          if (val !== undefined && val !== null && val !== '') {
            const num = parseFloat(val);
            if (isNaN(num) || num < 0 || num > maxVal) {
              return `${label} must be between 0 and ${maxVal}.`;
            }
          }
          return null;
        };

        let err = checkRange(record.integration1, 'AI1', maxAI);
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
        err = checkRange(record.integration2, 'AI2', maxAI);
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
        err = checkRange(record.integration3, 'AI3', maxAI);
        if (err) { setError(`${err} (Student: "${studentName}")`); return false; }

        if (record.exam_score !== undefined && record.exam_score !== null && record.exam_score !== '') {
          const exam = parseFloat(record.exam_score);
          if (isNaN(exam) || exam < 0 || exam > maxExam) {
            setError(`Exam score must be between 0 and ${maxExam} (Student: "${studentName}")`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const handleSave = async (targetStatus: 'Draft' | 'Approved' = 'Approved') => {
    if ((!selectedSubjects || selectedSubjects.length === 0) || !selectedClassVal || !selectedStreamVal) {
      setError('Please select a subject, class, and stream first.');
      return;
    }

    if (!validateMarks()) return;
    if (Object.keys(fieldErrors).length > 0) {
      setError('Please fix validation errors before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    const combinedClass = `${selectedClassVal} ${selectedStreamVal}`;
    try {
      if (!activeSubject) {
        setError('Please select an active subject to save marks for.');
        setSaving(false);
        return;
      }
      
      // Save all marks directly with Approved status
      const marksList = Object.values(marksMap).map((m: any) => ({ ...m, status: 'Approved' }));
      
      await saveTeacherMarks({
        gradeClass: combinedClass,
        subject: activeSubject,
        term,
        year,
        teacherId,
        marksList,
        paper: selectedPaper,
        status: 'Approved'
      });
      
      // Update local marksMap state to Approved
      const updatedMarksMap = { ...marksMap };
      Object.keys(updatedMarksMap).forEach(key => {
        updatedMarksMap[key] = { ...updatedMarksMap[key], status: 'Approved' };
      });
      setMarksMap(updatedMarksMap);

      setSuccessMessage('All marks saved successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save marks.');
    } finally {
      setSaving(false);
    }
  };

  const validateMarksForStudent = (studentId: string): boolean => {
    const record = marksMap[studentId];
    if (!record) return true;
    const student = students.find(s => s.id === studentId);
    const studentName = student ? student.name : 'Student';

    if (isUACE) {
      const checkRange = (val: any, label: string) => {
        if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > 100) {
            return `${label} must be between 0 and 100.`;
          }
        }
        return null;
      };
      let err = checkRange(record.bot, 'BOT');
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
      err = checkRange(record.mot, 'MOT');
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
      err = checkRange(record.eot, 'EOT');
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
    } else {
      const maxAI = 3;
      const maxExam = 100;
      const checkRange = (val: any, label: string, maxVal: number) => {
        if (val !== undefined && val !== null && val !== '') {
          const num = parseFloat(val);
          if (isNaN(num) || num < 0 || num > maxVal) {
            return `${label} must be between 0 and ${maxVal}.`;
          }
        }
        return null;
      };

      let err = checkRange(record.integration1, 'AI1', maxAI);
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
      err = checkRange(record.integration2, 'AI2', maxAI);
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }
      err = checkRange(record.integration3, 'AI3', maxAI);
      if (err) { setError(`${err} (Student: "${studentName}")`); return false; }

      if (record.exam_score !== undefined && record.exam_score !== null && record.exam_score !== '') {
        const exam = parseFloat(record.exam_score);
        if (isNaN(exam) || exam < 0 || exam > maxExam) {
          setError(`Exam score must be between 0 and ${maxExam} (Student: "${studentName}")`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveSingleStudent = async (studentId: string) => {
    if ((!selectedSubjects || selectedSubjects.length === 0) || !selectedClassVal || !selectedStreamVal) {
      setError('Please select a subject, class, and stream first.');
      return;
    }

    if (!validateMarksForStudent(studentId)) return;
    if (fieldErrors[studentId] && Object.keys(fieldErrors[studentId]).length > 0) {
      setError('Please fix validation errors for this student before saving.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    const combinedClass = `${selectedClassVal} ${selectedStreamVal}`;
    try {
      if (!activeSubject) {
        setError('Please select an active subject to save marks for.');
        setSaving(false);
        return;
      }
      
      const record = marksMap[studentId];
      if (!record) {
        setError('No marks record found for this student.');
        setSaving(false);
        return;
      }

      const updatedRecord = { ...record, status: 'Approved' };

      await saveTeacherMarks({
        gradeClass: combinedClass,
        subject: activeSubject,
        term,
        year,
        teacherId,
        marksList: [updatedRecord],
        paper: selectedPaper,
        status: 'Approved'
      });

      setMarksMap(prev => ({
        ...prev,
        [studentId]: updatedRecord
      }));

      const student = students.find(s => s.id === studentId);
      const studentName = student ? student.name.toUpperCase() : 'Student';
      setSuccessMessage(`Marks for ${studentName} saved successfully.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to save student marks.');
    } finally {
      setSaving(false);
    }
  };

  // Submit flow removed — saving is immediate and approvals are deprecated.

  // Helper grading calculations
  function getOLevelGrade(mark: number) {
    if (mark >= 80) return 'A';
    if (mark >= 70) return 'B';
    if (mark >= 60) return 'C';
    if (mark >= 50) return 'D';
    return 'E';
  }

  function getUACEPrincipalGrade(score: number) {
    if (score >= 80) return { grade: 'D1', points: 6 };
    if (score >= 75) return { grade: 'D2', points: 5 };
    if (score >= 66) return { grade: 'C3', points: 4 };
    if (score >= 60) return { grade: 'C4', points: 3 };
    if (score >= 55) return { grade: 'C5', points: 2 };
    if (score >= 50) return { grade: 'C6', points: 1 };
    if (score >= 45) return { grade: 'P7', points: 0 };
    if (score >= 35) return { grade: 'P8', points: 0 };
    return { grade: 'F9', points: 0 };
  }

  function getUACESubGPGrade(score: number) {
    return getUACEPrincipalGrade(score);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Premium Notification Toast Banner */}
      {(successMessage || error) && (
        <div className="fixed top-6 right-6 z-50 animate-bounce duration-500 max-w-sm w-full">
          {successMessage && (
            <div className="bg-emerald-950/90 border border-emerald-500/35 backdrop-blur-md p-4 rounded-xl shadow-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase text-emerald-300">Action Successful</h4>
                <p className="text-[10px] text-emerald-400/80 font-medium mt-1">{successMessage}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-rose-950/90 border border-rose-500/35 backdrop-blur-md p-4 rounded-xl shadow-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase text-rose-300">Execution Error</h4>
                <p className="text-[10px] text-rose-400/80 font-medium mt-1">{error}</p>
                {excelUploadErrors.length > 0 && (
                  <div className="mt-3 text-[10px] text-rose-200">
                    <div className="font-semibold">Rejected rows:</div>
                    <ul className="list-disc list-inside mt-2 space-y-1 max-h-32 overflow-y-auto text-[10px] text-rose-200">
                      {excelUploadErrors.slice(0, 5).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                      {excelUploadErrors.length > 5 && <li>+ {excelUploadErrors.length - 5} more rejected rows</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navbar */}
      <header className="bg-slate-950 border-b border-slate-800 shrink-0 px-4 py-4 md:px-6 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1 bg-slate-900/50 border border-slate-800 rounded-lg shadow-inner">
            <SchoolLogo className="w-10 h-10" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-100 uppercase tracking-tight">Teacher Portal</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">St. Paul Secondary School</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-200 block">{teacherName.toUpperCase()}</span>
            <span className="text-[8px] text-indigo-400 font-mono font-bold tracking-wider uppercase">
              {teacherUsername ? `INSTRUCTOR (${teacherUsername})` : 'INSTRUCTOR'}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer rounded-md hover:bg-slate-800"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Navigation Sub-header */}
      <div className="bg-slate-950/70 border-b border-slate-850 px-4 md:px-6 py-1.5 flex gap-4 shrink-0 backdrop-blur-md no-print">
        <button
          onClick={() => setActiveView('dashboard')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer ${
            activeView === 'dashboard'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Welcome Dashboard
        </button>
        <button
          onClick={() => setActiveView('marks')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer ${
            activeView === 'marks'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Marks Entry Worksheets
        </button>
      </div>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {activeView === 'dashboard' ? (
          <div className="space-y-6 animate-fade-in text-slate-100">
            {/* Welcome Banner Card */}
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              
              {/* Photo frame */}
              <div className="w-24 h-32 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-lg">
                {photo ? (
                  <img src={photo} alt={teacherName} className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-12 h-12 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="space-y-2 text-center md:text-left flex-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-full">
                  <Smile className="w-3.5 h-3.5" /> Instructor Profile
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">
                  Welcome, {(gender || '').toLowerCase() === 'male' ? 'Mr.' : (gender || '').toLowerCase() === 'female' ? 'Ms.' : 'Mr./Ms.'} {teacherName}.
                </h2>
                <p className="text-sm text-indigo-300 font-bold">Have a great day.</p>
                <p className="text-xs text-slate-500 font-medium">
                  St. Paul SMS Teacher Portal enables you to record marks, view stream performance sheets, and log assessment sheets.
                </p>
                <div className="flex flex-col gap-1 pt-1 text-left border-t border-slate-900/60 mt-1">
                  {assignedSubjects.length > 0 && (
                    <div className="text-[11px] text-slate-400 font-semibold">
                      <span className="text-indigo-400 uppercase tracking-wider text-[9px] font-bold mr-1">Assigned Subjects:</span>
                      {assignedSubjects.join(', ')}
                    </div>
                  )}
                  {assignedClasses.length > 0 && (
                    <div className="text-[11px] text-slate-400 font-semibold">
                      <span className="text-violet-400 uppercase tracking-wider text-[9px] font-bold mr-1">Assigned Classes:</span>
                      {assignedClasses.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-2 gap-3 w-full md:w-auto min-w-[200px]">
                <div className="bg-slate-900/50 border border-slate-850/80 p-3 rounded-xl text-center space-y-1 shadow-inner">
                  <BookOpen className="w-4 h-4 text-indigo-400 mx-auto" />
                  <span className="text-[9px] text-slate-550 font-bold uppercase tracking-wider block">Subjects</span>
                  <span className="text-lg font-black text-slate-202">{assignedSubjects.length}</span>
                </div>
                <div className="bg-slate-900/50 border border-slate-850/80 p-3 rounded-xl text-center space-y-1 shadow-inner">
                  <Award className="w-4 h-4 text-violet-400 mx-auto" />
                  <span className="text-[9px] text-slate-550 font-bold uppercase tracking-wider block">Classes</span>
                  <span className="text-lg font-black text-slate-202">{assignedClasses.length}</span>
                </div>
              </div>
            </div>

            {/* Assigned curriculum view */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Main assignments table */}
              <div className="md:col-span-2 bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
                  <Award className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Your Assigned Worksheets</h3>
                </div>

                {teacherAssignments && teacherAssignments.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-slate-850">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400 uppercase text-[9px] font-black tracking-wider border-b border-slate-850">
                          <th className="p-3">Subject</th>
                          <th className="p-3">Class / Stream</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                        {teacherAssignments.map((a, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40 transition">
                            <td className="p-3">
                              <span className="font-bold text-slate-200 block">{a.subject}</span>
                              <span className="text-[9px] text-indigo-400/80 uppercase font-bold font-mono">
                                {a.grade_class.startsWith('S.5') || a.grade_class.startsWith('S.6') ? 'UACE principal' : 'O-Level CBA'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="bg-slate-900 px-2.5 py-1 rounded-md text-[10px] font-bold border border-slate-850 text-slate-300">
                                {a.grade_class}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => {
                                  const { class: clsVal, stream: streamVal } = parseClassAndStream(a.grade_class);
                                  setActiveSubject(a.subject);
                                  setSelectedClassVal(clsVal);
                                  setSelectedStreamVal(streamVal);
                                  setActiveView('marks');
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition shadow-sm cursor-pointer"
                              >
                                Open Worksheet <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10 bg-slate-900/20 rounded-xl border border-dashed border-slate-850 text-slate-500 text-xs">
                    No class-subject assignments configured. Please contact the administrator.
                  </div>
                )}
              </div>

              {/* Quick Information / Sidebar */}
              <div className="space-y-6">
                {/* Class Teacher Badge Card */}
                <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-3">
                  <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Class Teacher Role</h3>
                  <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-xl space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">Assigned Streams</span>
                    {classTeacherFor && classTeacherFor.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {classTeacherFor.map(cls => (
                          <span key={cls} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded text-[10px] font-bold">
                            {cls}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-slate-500 block">No stream currently assigned.</span>
                    )}
                  </div>
                </div>

                {/* Time / Calendar Card */}
                <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-3 flex flex-col justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-455 tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Portal Summary
                  </h3>
                  <div className="text-xs space-y-2">
                    <div className="flex justify-between border-b border-slate-850/50 pb-1.5">
                      <span className="text-slate-500 font-bold">Academic Year</span>
                      <span className="font-bold text-slate-350">{year}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-850/50 pb-1.5">
                      <span className="text-slate-500 font-bold">Term</span>
                      <span className="font-bold text-slate-350">Term {term}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">Role</span>
                      <span className="font-bold text-indigo-400 font-mono text-[10px] uppercase">Instructor</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Form Selection Card */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
            <ClipboardList className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Worksheet Selectors</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Subjects Grid (responsive) */}
            <div className="w-full">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Subjects</label>
              <div className="flex items-center gap-3 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search subjects..."
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedSubjects.length === availableSubjects.length && availableSubjects.length > 0}
                    onChange={(e) => selectAllSubjects(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Select All
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredSubjects.length === 0 ? (
                  <div className="text-[10px] text-slate-500 py-3">No subjects found</div>
                ) : (
                  filteredSubjects.map((sub) => {
                    const checked = selectedSubjects.includes(sub);
                    const isActive = activeSubject === sub;
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => { toggleSubject(sub); setActiveSubject(sub); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex justify-between items-center transition-colors border ${checked ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-900/80'} ${isActive ? 'ring-2 ring-indigo-500' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={checked} readOnly className="w-4 h-4" />
                          <span className="truncate">{sub}</span>
                        </div>
                        {checked && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Conditional Fields */}
            {selectedSubjects && selectedSubjects.length > 0 && (
              <>
                <div className="w-full md:w-36">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Class</label>
                  <select
                    value={selectedClassVal}
                    onChange={(e) => {
                      const selected = e.target.value;
                      // If selected value contains stream info, parse it
                      const parsed = parseClassAndStream(selected);
                      setSelectedClassVal(parsed.class || selected);
                      // Auto-populate stream if detected in assigned classes
                      if (parsed.stream) {
                        setSelectedStreamVal(parsed.stream);
                      } else {
                        setSelectedStreamVal('');
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Class...</option>
                    {(assignedClasses && assignedClasses.length > 0 ? assignedClasses : classList).map((c) => {
                      const parsed = parseClassAndStream(c);
                      const displayValue = parsed.stream ? `${parsed.class} / ${parsed.stream}` : c;
                      return (
                        <option key={c} value={c}>{displayValue}</option>
                      );
                    })}
                  </select>
                </div>

                {selectedClassVal && (
                  <div className="w-full md:w-36">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Stream</label>
                    <select
                      value={selectedStreamVal}
                      onChange={(e) => setSelectedStreamVal(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select Stream...</option>
                      {streamList.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedClassVal && selectedStreamVal && (
                  <>
                    <div className="w-full md:w-28">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Term</label>
                      <select
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                      >
                        <option value="1">Term 1</option>
                        <option value="Midterm 1">Midterm 1</option>
                        <option value="2">Term 2</option>
                        <option value="Midterm 2">Midterm 2</option>
                        <option value="3">Term 3</option>
                        <option value="Midterm 3">Midterm 3</option>
                      </select>
                    </div>

                    <div className="w-full md:w-28">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Academic Year</label>
                      <select
                        value={year}
                        onChange={(e) => setYear(parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
                      >
                        <option value="2026">2026</option>
                        <option value="2027">2027</option>
                        <option value="2028">2028</option>
                      </select>
                    </div>

                    {isUACE && (
                      <div className="w-full md:w-28">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Paper</label>
                        <select
                          value={selectedPaper}
                          disabled={activeSubject === 'General Paper' || (activeSubject && activeSubject.toLowerCase().includes('subsidiary') || (activeSubject && activeSubject.toLowerCase().includes('ict')))}
                          onChange={(e) => setSelectedPaper(parseInt(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-55"
                        >
                          <option value="1">Paper 1</option>
                          <option value="2">Paper 2</option>
                          <option value="3">Paper 3</option>
                        </select>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Worksheet List Section */}
        {selectedSubjects && selectedSubjects.length > 0 && selectedClassVal && selectedStreamVal ? (
          <div className="bg-slate-950 border border-slate-850 rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-850 bg-slate-950 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-200 tracking-tight">
                  Marks Entry Worksheet
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Class: <span className="text-indigo-400 font-bold">{selectedClassVal}</span> {selectedStreamVal && <span>| Stream: <span className="text-emerald-400 font-bold">{selectedStreamVal}</span></span>} | Subjects: <span className="text-indigo-400 font-bold">{selectedSubjects.join(', ')}</span>{activeSubject ? <span> (Active: <span className="font-bold text-emerald-400">{activeSubject}</span>)</span> : null} | Term: <span className="text-indigo-400 font-bold">{term}</span> | Year: <span className="text-indigo-400 font-bold">{year}</span>
                </p>
              </div>

              <div className="flex flex-col gap-3 md:gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={loadData}
                    disabled={loading}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Reload current list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
                  </button>
                  <label
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm hover:text-white transition-all"
                    title="Upload Excel sheet containing student names and marks"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-400" /> Upload Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleExcelUpload}
                      disabled={loading}
                    />
                  </label>
                </div>
                {excelUploadErrors.length > 0 && (
                  <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-[10px] text-rose-200">
                    <div className="font-bold uppercase tracking-wider text-rose-300">Excel validation summary</div>
                    <p className="mt-2">{excelUploadErrors.length} invalid row{excelUploadErrors.length === 1 ? '' : 's'} were skipped due to out-of-range marks.</p>
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing Student Worksheet...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="py-20 text-center text-slate-500 font-medium text-xs">
                No students enrolled in {selectedClassVal}{selectedStreamVal && <span> {selectedStreamVal}</span>} were found.
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1300px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                        <th className="p-4 w-16 text-center">No</th>
                        <th className="p-4 w-80 min-w-[280px]">Student Details</th>
                        {isUACE ? (
                          <>
                            <th className="p-4 w-44 text-center">Paper Type</th>
                            <th className="p-4 w-28 text-center">BOT (0-100)</th>
                            <th className="p-4 w-28 text-center">MOT (0-100)</th>
                            <th className="p-4 w-28 text-center">EOT (0-100)</th>
                            <th className="p-4 w-28 text-center">Total</th>
                            <th className="p-4 w-24 text-center">Grade</th>
                            <th className="p-4 w-24 text-center">Points</th>
                          </>
                        ) : (
                          <>
                            <th className="p-4 w-28 text-center">AI 1 (0-3)</th>
                            <th className="p-4 w-28 text-center">AI 2 (0-3)</th>
                            <th className="p-4 w-28 text-center">AI 3 (0-3)</th>
                            <th className="p-4 w-28 text-center">Exam (0-100)</th>
                            <th className="p-4 w-28 text-center">CA Avg (20%)</th>
                            <th className="p-4 w-28 text-center">Exam W (80%)</th>
                            <th className="p-4 w-28 text-center">Final Score</th>
                            <th className="p-4 w-28 text-center">Grade</th>
                          </>
                        )}
                        <th className="p-4 w-32 text-center">Status</th>
                        <th className="p-4 w-28 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {Array.isArray(students) && students.map((student, idx) => {
                        const record = marksMap[student.id] || {};
                        let isLocked = false; // Locks disabled. Teachers can edit marks at any time.

                        // Calculate metrics for display if O-Level
                        let ca = 0;
                        let examW = 0;
                        let finalMark = 0;
                        let finalGrade = '-';
                        let hasSomeMarks = false;
                        const hasValidationError = fieldErrors[student.id] && Object.keys(fieldErrors[student.id]).length > 0;

                        if (!isUACE && !hasValidationError) {
                          const aiScores = [];
                          if (record.integration1 !== undefined && record.integration1 !== null && record.integration1 !== '') {
                            aiScores.push(parseFloat(record.integration1));
                            hasSomeMarks = true;
                          }
                          if (record.integration2 !== undefined && record.integration2 !== null && record.integration2 !== '') {
                            aiScores.push(parseFloat(record.integration2));
                            hasSomeMarks = true;
                          }
                          if (record.integration3 !== undefined && record.integration3 !== null && record.integration3 !== '') {
                            aiScores.push(parseFloat(record.integration3));
                            hasSomeMarks = true;
                          }

                          let caAverage = 0;
                          if (aiScores.length > 0) {
                            const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                            caAverage = sumPct / aiScores.length;
                          }
                          ca = (caAverage * 20) / 100;

                          if (record.exam_score !== undefined && record.exam_score !== null && record.exam_score !== '') {
                            const exam = parseFloat(record.exam_score || 0);
                            examW = (exam * 80) / 100;
                            hasSomeMarks = true;
                          }
                          finalMark = ca + examW;
                          finalGrade = hasSomeMarks ? getOLevelGrade(finalMark) : '-';
                        }

                        return (
                          <tr key={student.id} className="hover:bg-slate-900/30 transition-colors font-medium text-slate-200">
                            <td className="p-4 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="p-4 w-80 min-w-[280px] break-normal">
                              <div className="font-bold text-slate-200 whitespace-nowrap">{student.name.toUpperCase()}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{student.adminNo}</div>
                            </td>

                            {isUACE ? (
                              <>
                                <td className="p-4 text-center">
                                  <select
                                    value={record.subject_type || 'Principal'}
                                    disabled={isLocked}
                                    onChange={(e) => handleMarkChange(student.id, 'subject_type', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-indigo-500 disabled:opacity-55"
                                  >
                                    <option value="Principal">Principal Subject</option>
                                    <option value="Subsidiary">Subsidiary</option>
                                    <option value="General Paper">General Paper</option>
                                  </select>
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    disabled={isLocked}
                                    value={record.bot !== undefined && record.bot !== null ? record.bot : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'bot', 100)}
                                    onChange={(e) => handleMarkChange(student.id, 'bot', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'bot', e.target.value)}
                                    placeholder="0-100"
                                    className={`w-20 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.bot ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.bot ? (
                                    <div className="text-rose-400 text-[10px] mt-1">{fieldErrors[student.id].bot}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    disabled={isLocked}
                                    value={record.mot !== undefined && record.mot !== null ? record.mot : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'mot', 100)}
                                    onChange={(e) => handleMarkChange(student.id, 'mot', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'mot', e.target.value)}
                                    placeholder="0-100"
                                    className={`w-20 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.mot ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.mot ? (
                                    <div className="text-rose-400 text-[10px] mt-1">{fieldErrors[student.id].mot}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    disabled={isLocked}
                                    value={record.eot !== undefined && record.eot !== null ? record.eot : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'eot', 100)}
                                    onChange={(e) => handleMarkChange(student.id, 'eot', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'eot', e.target.value)}
                                    placeholder="0-100"
                                    className={`w-20 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.eot ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.eot ? (
                                    <div className="text-rose-400 text-[10px] mt-1">{fieldErrors[student.id].eot}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center text-slate-300 font-bold font-mono">{record.score !== undefined && record.score !== null ? record.score : '-'}</td>
                                <td className="p-4 text-center text-emerald-400 font-black font-mono">{record.grade || 'F'}</td>
                                <td className="p-4 text-center text-indigo-400 font-black font-mono">{record.points || 0}</td>
                              </>
                            ) : (
                              <>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="3"
                                    step="0.5"
                                    inputMode="decimal"
                                    disabled={isLocked}
                                    value={record.integration1 !== undefined && record.integration1 !== null ? record.integration1 : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'integration1', 3)}
                                    onChange={(e) => handleMarkChange(student.id, 'integration1', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'integration1', e.target.value)}
                                    placeholder="0-3"
                                    className={`w-16 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.integration1 ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.integration1 ? (
                                    <div className="text-rose-400 text-[11px] mt-1">{fieldErrors[student.id].integration1}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="3"
                                    step="0.5"
                                    inputMode="decimal"
                                    disabled={isLocked}
                                    value={record.integration2 !== undefined && record.integration2 !== null ? record.integration2 : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'integration2', 3)}
                                    onChange={(e) => handleMarkChange(student.id, 'integration2', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'integration2', e.target.value)}
                                    placeholder="0-3"
                                    className={`w-16 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.integration2 ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.integration2 ? (
                                    <div className="text-rose-400 text-[11px] mt-1">{fieldErrors[student.id].integration2}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="3"
                                    step="0.5"
                                    inputMode="decimal"
                                    disabled={isLocked}
                                    value={record.integration3 !== undefined && record.integration3 !== null ? record.integration3 : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'integration3', 3)}
                                    onChange={(e) => handleMarkChange(student.id, 'integration3', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'integration3', e.target.value)}
                                    placeholder="0-3"
                                    className={`w-16 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.integration3 ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.integration3 ? (
                                    <div className="text-rose-400 text-[11px] mt-1">{fieldErrors[student.id].integration3}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    inputMode="decimal"
                                    disabled={isLocked}
                                    value={record.exam_score !== undefined && record.exam_score !== null ? record.exam_score : ''}
                                    onKeyDown={handleNumericKeyDown}
                                    onPaste={(e) => handlePasteMark(e, 'exam_score', 100)}
                                    onChange={(e) => handleMarkChange(student.id, 'exam_score', e.target.value, e.target)}
                                    onBlur={(e) => handleMarkBlur(student.id, 'exam_score', e.target.value)}
                                    placeholder="0-100"
                                    className={`w-20 mx-auto bg-slate-900 border rounded px-2 py-1.5 text-xs text-slate-200 font-bold text-center focus:outline-none focus:border-indigo-500 disabled:opacity-55 ${fieldErrors[student.id]?.exam_score ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-800'}`}
                                  />
                                  {fieldErrors[student.id]?.exam_score ? (
                                    <div className="text-rose-400 text-[11px] mt-1">{fieldErrors[student.id].exam_score}</div>
                                  ) : null}
                                </td>
                                <td className="p-4 text-center text-slate-400 font-mono">{hasSomeMarks ? ca.toFixed(1) : '-'}</td>
                                <td className="p-4 text-center text-slate-400 font-mono">{hasSomeMarks ? examW.toFixed(1) : '-'}</td>
                                <td className="p-4 text-center text-indigo-400 font-black font-mono">{hasSomeMarks ? finalMark.toFixed(1) : '-'}</td>
                                <td className="p-4 text-center text-emerald-400 font-black font-mono">{finalGrade}</td>
                              </>
                            )}

                            <td className="p-4 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                                record.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                record.status === 'Submitted' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse' :
                                'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}>
                                {record.status || 'Draft'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleSaveSingleStudent(student.id)}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition shadow-sm cursor-pointer"
                                title="Save marks for this student"
                              >
                                <Save className="w-3.5 h-3.5" /> Save
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-4 border-t border-slate-850 bg-slate-950 flex justify-between items-center gap-3">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    Total: {students.length} Students listed
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleSave('Approved')}
                      disabled={saving || Object.keys(fieldErrors).length > 0}
                      className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      <Save className="w-4 h-4 text-white" /> Save All Marks
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-950 border border-dashed border-slate-800 py-24 rounded-2xl flex flex-col items-center justify-center text-center gap-3 shadow-md">
            <BookOpen className="w-12 h-12 text-slate-600 animate-pulse" />
            <h3 className="text-sm font-black uppercase text-slate-300">Worksheet Locked</h3>
            <p className="text-xs text-slate-500 max-w-sm font-medium">
              Please select a subject from the curriculum to unlock stream and class inputs. Student lists and entry sheets will open automatically.
            </p>
          </div>
        )}
        </>)}
      </main>
    </div>
  );
}



