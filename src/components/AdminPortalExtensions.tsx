import React, { useEffect, useState } from 'react';
import { Users, FileSpreadsheet, RefreshCw, Plus, Edit2, Trash2, Check, X, ShieldAlert, TrendingUp, BarChart3, Settings, Upload, Download, CheckCircle2, Search, KeyRound, Camera } from 'lucide-react';
import { Teacher, Student } from '../types.ts';
import AdminStudentAccountsTab from './AdminStudentAccountsTab.tsx';
import AdminDuplicatesTab from './AdminDuplicatesTab.tsx';
import { SCHOOL_CLASSES } from '../data.ts';
import { 
  fetchTeachers, createTeacher, updateTeacher, deleteTeacher, 
  promoteStudents, generateReportCards, triggerFileDownload,
  fetchSettings, saveSettings, fetchStudentsFromDb, fetchStatsFromDb,
  fetchClassTeachers, saveClassTeacher, fetchPdfTaskStatus, getApiBaseUrl,
  fetchAllWorksheets, searchStudentsWithMarks, importTeachers
} from '../utils/api.ts';
import { compressStudentPhoto, compressSignatureImage } from '../utils/imageProcessor.ts';
import * as XLSX from 'xlsx';


interface AdminPortalExtensionsProps {
  schoolLogo: string | null;
  onLogoRefresh: () => void;
  authSession: any;
  onAddTask?: (task: {
    type: 'pdf' | 'report';
    name: string;
    taskId: string;
    total: number;
  }) => void;
}

export default function AdminPortalExtensions({ schoolLogo, onLogoRefresh, authSession, onAddTask }: AdminPortalExtensionsProps) {
  const isHeadteacher = (position?: string) => {
    if (!position) return false;
    const pos = position.toLowerCase().replace(/\s+/g, '');
    return pos === 'headteacher';
  };

  const hasSignature = (position?: string) => {
    if (!position) return false;
    const pos = position.toLowerCase().replace(/\s+/g, '');
    return pos === 'classteacher' || pos === 'dos' || pos === 'directorofstudies' || pos === 'headteacher';
  };

  const [activeSubTab, setActiveSubTab] = useState<'teachers' | 'reports' | 'promotions' | 'emis' | 'studentsearch' | 'studentaccounts' | 'duplicates'>('teachers');
  
  // Teachers Management State
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherForm, setTeacherForm] = useState({
    username: '',
    password: '',
    name: '',
    subjects: [] as string[],
    classes: [] as string[],
    assignments: [] as { subject: string; grade_class: string }[],
    position: 'Teacher',
    signature: '',
    gender: 'Male',
    photo: '',
    status: 'Active'
  });
  const [classTeachers, setClassTeachers] = useState<any[]>([]);

  // Bulk Upload states
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedSubjectToAdd, setSelectedSubjectToAdd] = useState('');
  const [selectedClassToAdd, setSelectedClassToAdd] = useState('S.1 A');

  // Report cards state
  const [compilingReports, setCompilingReports] = useState(false);
  const [reportParams, setReportParams] = useState({
    gradeClass: 'S.1',
    stream: 'All',
    term: '2',
    year: 2026,
    boardingStatus: 'All'
  });
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null);
  const [matchingStudents, setMatchingStudents] = useState<Student[]>([]);
  const [loadingMatching, setLoadingMatching] = useState(false);
  const [worksheets, setWorksheets] = useState<any[]>([]);
  const [loadingWorksheets, setLoadingWorksheets] = useState(false);

  // Promotions State
  const [promoForm, setPromoForm] = useState({
    sourceClass: 'S.1',
    targetClass: 'S.2'
  });
  const [sourceCount, setSourceCount] = useState(0);

  // EMIS Analytics & Settings State
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [stats, setStats] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Approvals workflow removed - administrators can view and correct marks via reports and student accounts

  // Student Search & Printing State
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentSearchFilters, setStudentSearchFilters] = useState({
    term: '2',
    year: 2026,
    gradeClass: 'All',
    stream: 'All',
    gender: 'All',
    performanceGrade: 'All',
    reportStatus: 'All'
  });
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedSearchStudentIds, setSelectedSearchStudentIds] = useState<string[]>([]);
  const [printingSelected, setPrintingSelected] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number } | null>(null);

  // Preview State
  const [previewStudent, setPreviewStudent] = useState<any | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Load worksheets
  const loadWorksheets = async () => {
    setLoadingWorksheets(true);
    try {
      const list = await fetchAllWorksheets();
      setWorksheets(list);
    } catch (err) {
      console.error('Failed to load worksheets:', err);
    } finally {
      setLoadingWorksheets(false);
    }
  };

  // Execute student search
  const executeStudentSearch = async () => {
    setSearchingStudents(true);
    try {
      const res = await searchStudentsWithMarks({
        term: studentSearchFilters.term,
        year: studentSearchFilters.year,
        search: studentSearchQuery || undefined,
        gradeClass: studentSearchFilters.gradeClass === 'All' ? undefined : studentSearchFilters.gradeClass,
        stream: studentSearchFilters.stream === 'All' ? undefined : studentSearchFilters.stream,
        gender: studentSearchFilters.gender === 'All' ? undefined : studentSearchFilters.gender,
        performanceGrade: studentSearchFilters.performanceGrade === 'All' ? undefined : studentSearchFilters.performanceGrade,
        reportStatus: studentSearchFilters.reportStatus === 'All' ? undefined : studentSearchFilters.reportStatus
      });
      setSearchResults(res.data || []);
      // Reset selected IDs
      setSelectedSearchStudentIds([]);
    } catch (err) {
      console.error('Failed to search students:', err);
    } finally {
      setSearchingStudents(false);
    }
  };

  // Approval-related actions removed; administrators can directly edit marks where needed.

  // Print/Download Selected Reports
  const handlePrintSelected = async (action: 'preview' | 'download' | 'print', studentId?: string) => {
    const targetIds = studentId ? [studentId] : selectedSearchStudentIds;
    if (targetIds.length === 0) {
      alert('Please select at least one student.');
      return;
    }

    if (action === 'preview') {
      if (targetIds.length !== 1) {
        alert('Inline preview is only supported for one student at a time.');
        return;
      }
      setPreviewLoading(true);
      setShowPreviewModal(true);
      const studentObj = searchResults.find(s => s.id === targetIds[0]);
      setPreviewStudent(studentObj);
      setPreviewPdfUrl(null);
      try {
        const response = await generateReportCards({
          studentIds: targetIds,
          term: studentSearchFilters.term,
          year: studentSearchFilters.year
        });

        if (response.success && response.taskId) {
          const taskId = response.taskId;
          let done = false;
          while (!done) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const statusRes = await fetchPdfTaskStatus(taskId);
            if (statusRes.status === 'completed') {
              done = true;
              const url = `${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}?preview=true`;
              setPreviewPdfUrl(url);
            } else if (statusRes.status === 'failed') {
              throw new Error(statusRes.error || 'Preview PDF generation failed.');
            }
          }
        }
      } catch (err: any) {
        alert('Failed to generate preview: ' + err.message);
        setShowPreviewModal(false);
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    setPrintingSelected(true);
    setPrintProgress({ current: 0, total: targetIds.length });
    try {
      const response = await generateReportCards({
        studentIds: targetIds,
        term: studentSearchFilters.term,
        year: studentSearchFilters.year
      });

      if (response.success && response.taskId) {
        const taskId = response.taskId;
        let done = false;
        
        while (!done) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const statusRes = await fetchPdfTaskStatus(taskId);
          
          if (statusRes.status === 'processing') {
            setPrintProgress({ current: statusRes.progress, total: statusRes.total });
          } else if (statusRes.status === 'completed') {
            done = true;
            setPrintProgress({ current: statusRes.total, total: statusRes.total });
            alert(`Report cards compiled successfully!`);
            await triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`, statusRes.filename!);
          } else if (statusRes.status === 'failed') {
            throw new Error(statusRes.error || 'PDF compilation failed.');
          }
        }
      }
    } catch (err: any) {
      alert('Compilation failed: ' + err.message);
    } finally {
      setPrintingSelected(false);
      setPrintProgress(null);
    }
  };

  // Load teachers
  const loadTeachersList = async () => {
    setLoadingTeachers(true);
    try {
      const [list, ctList] = await Promise.all([
        fetchTeachers(),
        fetchClassTeachers()
      ]);
      setTeachers(list);
      setClassTeachers(ctList);
    } catch (err) {
      console.error('Failed to load teachers:', err);
    } finally {
      setLoadingTeachers(false);
    }
  };

  const handleClassTeacherChange = async (gradeClass: string, teacherId: string) => {
    try {
      await saveClassTeacher({ gradeClass, teacherId: teacherId || null });
      const ctList = await fetchClassTeachers();
      setClassTeachers(ctList);
      
      const list = await fetchTeachers();
      setTeachers(list);
    } catch (err: any) {
      alert('Failed to save class teacher assignment: ' + err.message);
    }
  };

  // Pending submissions workflow removed (approvals deprecated)

  // Load analytics & settings
  const loadAnalyticsData = async () => {
    setAnalyticsLoading(true);
    try {
      const [settingsRes, statsRes] = await Promise.all([
        fetchSettings(),
        fetchStatsFromDb()
      ]);
      setSettings(settingsRes || {});
      setStats(statsRes || {});
    } catch (err) {
      console.error('Failed to load analytics details:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'teachers') {
      loadTeachersList();
      fetchSettings().then(res => setSettings(res || {})).catch(err => console.error(err));
    }
    if (activeSubTab === 'reports') {
      loadMatchingStudents();
    }
    if (activeSubTab === 'emis') loadAnalyticsData();
    // Approvals view removed; no automatic load required
    if (activeSubTab === 'studentsearch') executeStudentSearch();
  }, [activeSubTab]);

  useEffect(() => {
    if (activeSubTab === 'studentsearch') {
      const timer = setTimeout(() => {
        executeStudentSearch();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [
    studentSearchFilters.term,
    studentSearchFilters.year,
    studentSearchFilters.gradeClass,
    studentSearchFilters.stream,
    studentSearchFilters.gender,
    studentSearchFilters.performanceGrade,
    studentSearchFilters.reportStatus,
    studentSearchQuery,
    activeSubTab
  ]);


  const loadMatchingStudents = async () => {
    setLoadingMatching(true);
    try {
      const streamVal = reportParams.stream === 'All' ? undefined : reportParams.stream;
      const boardingVal = reportParams.boardingStatus === 'All' ? undefined : 
        (reportParams.boardingStatus === 'Hostellers' ? 'Boarder' : 'Day Scholar');
      
      const res = await fetchStudentsFromDb({
        gradeClass: reportParams.gradeClass,
        stream: streamVal,
        boardingStatus: boardingVal,
        limit: -1
      });
      const sorted = (res.data || []).sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      setMatchingStudents(sorted);
    } catch (err) {
      console.error('Failed to load matching students:', err);
    } finally {
      setLoadingMatching(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'reports') {
      loadMatchingStudents();
    }
  }, [reportParams.gradeClass, reportParams.stream, reportParams.boardingStatus, activeSubTab]);

  // Load student count for promotions source class
  useEffect(() => {
    if (activeSubTab === 'promotions' && promoForm.sourceClass) {
      fetchStudentsFromDb({ gradeClass: promoForm.sourceClass, limit: 1 })
        .then(res => setSourceCount(res.total))
        .catch(err => console.error(err));
    }
  }, [promoForm.sourceClass, activeSubTab]);

  // Handle Teacher Create/Update
  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.username || !teacherForm.name || (!editingTeacher && !teacherForm.password)) {
      alert('Please fill in all required fields.');
      return;
    }

    const isHead = isHeadteacher(teacherForm.position);
    const payloadSubjects = isHead ? [] : teacherForm.subjects;
    const payloadClasses = isHead ? [] : teacherForm.classes;
    const payloadAssignments = isHead ? [] : teacherForm.assignments;

    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher.id, {
          username: teacherForm.username,
          name: teacherForm.name,
          password: teacherForm.password || undefined,
          subjects: payloadSubjects,
          classes: payloadClasses,
          assignments: payloadAssignments,
          position: teacherForm.position,
          signature: teacherForm.signature,
          gender: teacherForm.gender,
          photo: teacherForm.photo,
          status: teacherForm.status
        });
        alert('Teacher updated successfully.');
      } else {
        await createTeacher({
          username: teacherForm.username,
          password: teacherForm.password,
          name: teacherForm.name,
          subjects: payloadSubjects,
          classes: payloadClasses,
          assignments: payloadAssignments,
          position: teacherForm.position,
          signature: teacherForm.signature,
          gender: teacherForm.gender,
          photo: teacherForm.photo,
          status: teacherForm.status
        });
        alert('Teacher created successfully.');
      }
      setShowTeacherModal(false);
      loadTeachersList();
    } catch (err: any) {
      alert(err.message || 'Action failed.');
    }
  };

  const handleEditTeacher = (t: Teacher) => {
    setEditingTeacher(t);
    setTeacherForm({
      username: t.username,
      password: '',
      name: t.name,
      subjects: t.subjects || [],
      classes: t.classes || [],
      assignments: t.assignments || [],
      position: t.position || 'Teacher',
      signature: t.signature || '',
      gender: t.gender || 'Male',
      photo: t.photo || '',
      status: t.status || 'Active'
    });
    setShowTeacherModal(true);
  };

  const handleDirectPhotoUpload = async (teacherId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      alert('Only JPG, JPEG, and PNG formats are accepted.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Src = e.target?.result as string;
        const compressed = await compressStudentPhoto(base64Src, 300, 400, 0.8);
        const targetTeacher = teachers.find(t => t.id === teacherId);
        if (targetTeacher) {
          await updateTeacher(teacherId, {
            ...targetTeacher,
            photo: compressed
          });
          alert('Teacher passport photo updated successfully.');
          loadTeachersList();
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert('Failed to upload photo: ' + err.message);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const headers = [
        "Teacher Number",
        "Full Name",
        "Gender",
        "Subject(s) Taught",
        "Username",
        "Password",
        "Class Teacher"
      ];
      const data = [
        headers,
        ["T-101", "Jane Doe", "Female", "Mathematics, English", "janedoe", "password123", "S.1 A"],
        ["T-102", "John Smith", "Male", "Physics", "johnsmith", "pass321", ""]
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Teachers Template");
      
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'teachers_upload_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to generate Excel template: ' + err.message);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportReport(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      alert('Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.');
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
      const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });
      if (!rawRows.length) {
        throw new Error('The imported file contains no records.');
      }

      const mappedTeachers = rawRows.map((row: any, idx: number) => {
        const norm: any = { rowNumber: idx + 2 };
        Object.keys(row).forEach(key => {
          const cleanKey = key.trim().toLowerCase();
          const val = String(row[key]).trim();
          if (cleanKey.includes('number') || cleanKey.includes('employee')) {
            norm.id = val;
          } else if (cleanKey.includes('full name') || cleanKey === 'name') {
            norm.name = val;
          } else if (cleanKey === 'gender') {
            if (/^f/i.test(val) || /^female/i.test(val)) norm.gender = 'Female';
            else if (/^m/i.test(val) || /^male/i.test(val)) norm.gender = 'Male';
            else norm.gender = val;
          } else if (cleanKey.includes('subject')) {
            norm.subjects = val;
          } else if (cleanKey === 'username') {
            norm.username = val;
          } else if (cleanKey === 'password') {
            norm.password = val;
          } else if (cleanKey.includes('class teacher')) {
            norm.classTeacher = val;
          }
        });
        return norm;
      });

      const response = await importTeachers(mappedTeachers);
      if (response.success && response.report) {
        setImportReport(response.report);
        loadTeachersList();
      } else {
        throw new Error(response.error || 'Unknown import error occurred.');
      }
    } catch (err: any) {
      alert('Failed to import file: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const parsedOLevelSubjects = settings.olevel_subjects ? (typeof settings.olevel_subjects === 'string' ? JSON.parse(settings.olevel_subjects) : settings.olevel_subjects) : [];
  const parsedUACESubjects = settings.uace_subjects ? (typeof settings.uace_subjects === 'string' ? JSON.parse(settings.uace_subjects) : settings.uace_subjects) : [];
  const allSubjects = Array.from(new Set([...parsedOLevelSubjects, ...parsedUACESubjects]));
  const standardSubjects = [
    "English Language", "Mathematics", "Biology", "Chemistry", "Physics",
    "History and Political Education", "Geography", "Kiswahili", "Entrepreneurship Education",
    "Physical Education", "Christian Religious Education", "Islamic Religious Education",
    "Agriculture", "Information and Communications Technology (ICT)", "Art and Design",
    "Performing Arts", "Literature in English", "Nutrition and Food Technology",
    "Technology and Design", "Local Languages", "Foreign Languages",
    "Economics", "General Paper", "Subsidiary Mathematics", "Subsidiary ICT"
  ];
  const subjectsDropdownList = allSubjects.length > 0 ? allSubjects : standardSubjects;

  const addAssignmentToForm = () => {
    const subj = selectedSubjectToAdd || subjectsDropdownList[0];
    const cls = selectedClassToAdd;
    if (subj && cls) {
      const exists = teacherForm.assignments.some(a => a.subject === subj && a.grade_class === cls);
      if (!exists) {
        setTeacherForm(prev => ({
          ...prev,
          assignments: [...prev.assignments, { subject: subj, grade_class: cls }]
        }));
      }
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this teacher account?')) return;
    try {
      await deleteTeacher(id);
      loadTeachersList();
    } catch (err) {
      alert('Delete failed.');
    }
  };



  // Approvals deprecated; administrators can edit marks directly where necessary.

  // Bulk promotion execution
  const handlePromoteExecution = async () => {
    if (sourceCount === 0) {
      alert('No students found in source class to promote.');
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to promote all ${sourceCount} students in class ${promoForm.sourceClass} to ${promoForm.targetClass}?`
    );
    if (!confirm) return;

    try {
      await promoteStudents({
        sourceClass: promoForm.sourceClass,
        targetClass: promoForm.targetClass
      });
      alert(`Successfully promoted students from class ${promoForm.sourceClass} to ${promoForm.targetClass}.`);
      setPromoForm({ sourceClass: 'S.1', targetClass: 'S.2' });
      // reload count
      fetchStudentsFromDb({ gradeClass: 'S.1', limit: 1 }).then(res => setSourceCount(res.total));
    } catch (err: any) {
      alert('Promotion failed: ' + err.message);
    }
  };

  // Compile Report Cards
  const handleCompileReports = async (boardingFilterOverride?: 'All' | 'Day Scholar' | 'Boarder') => {
    const boardingStatus = boardingFilterOverride !== undefined ? boardingFilterOverride : 
      (reportParams.boardingStatus === 'All' ? 'All' : (reportParams.boardingStatus === 'Hostellers' ? 'Boarder' : 'Day Scholar'));

    const streamVal = reportParams.stream === 'All' ? undefined : reportParams.stream;
    const boardingVal = boardingStatus === 'All' ? undefined : boardingStatus;

    setCompilingReports(true);
    setReportProgress(null);
    try {
      // 1. Fetch student IDs for this class, stream & boarding status
      const stdRes = await fetchStudentsFromDb({
        gradeClass: reportParams.gradeClass,
        stream: streamVal,
        boardingStatus: boardingVal,
        limit: -1
      });

      // Sort alphabetically by name before printing
      const sortedStudents = (Array.isArray(stdRes.data) ? stdRes.data : []).sort((a: Student, b: Student) => a.name.localeCompare(b.name));
      const studentIds = Array.isArray(sortedStudents) ? sortedStudents.map((s: Student) => s.id) : [];

      if (studentIds.length === 0) {
        const fullClassName = streamVal ? `${reportParams.gradeClass} ${streamVal}` : reportParams.gradeClass;
        const boardingLabel = boardingStatus === 'All' ? 'students' : (boardingStatus === 'Boarder' ? 'hosteller students' : 'day scholar students');
        alert(`No ${boardingLabel} found in ${fullClassName} to compile report cards for.`);
        setCompilingReports(false);
        return;
      }

      // Confirmation message
      const boardingLabelPlural = boardingStatus === 'All' ? 'student(s)' : (boardingStatus === 'Boarder' ? 'hosteller(s)' : 'day scholar(s)');
      const confirmed = window.confirm(`You are about to generate report cards for ${studentIds.length} ${boardingLabelPlural}. Continue?`);
      if (!confirmed) {
        setCompilingReports(false);
        return;
      }

      setReportProgress({ current: 0, total: studentIds.length });

      // 2. Generate PDF reports (Background task)
      const response = await generateReportCards({
        studentIds,
        term: reportParams.term,
        year: reportParams.year
      });

      if (response.success && response.taskId) {
        if (onAddTask) {
          onAddTask({
            type: 'report',
            name: `Report Cards (${reportParams.gradeClass} - Term ${reportParams.term})`,
            taskId: response.taskId,
            total: studentIds.length
          });
          alert('Report card compilation started in the background. You can track progress in the Background Tasks panel (bottom right).');
        } else {
          const taskId = response.taskId;
          let done = false;
          
          while (!done) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const statusRes = await fetchPdfTaskStatus(taskId);
            
            if (statusRes.status === 'processing') {
              setReportProgress({ current: statusRes.progress, total: statusRes.total });
            } else if (statusRes.status === 'completed') {
              done = true;
              setReportProgress({ current: statusRes.total, total: statusRes.total });
              alert(`Successfully compiled report cards for ${statusRes.total} students!`);
              await triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`, statusRes.filename!);
            } else if (statusRes.status === 'failed') {
              throw new Error(statusRes.error || 'Server PDF report generation failed.');
            }
          }
        }
      }
    } catch (err: any) {
      alert('Compilation failed: ' + err.message);
    } finally {
      setCompilingReports(false);
      setReportProgress(null);
      // Refresh matching list
      loadMatchingStudents();
    }
  };

  // Upload HT Signature / Stamp Base64 images
  const handleSettingsImageUpload = (keyName: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await saveSettings({ [keyName]: base64String });
        alert(`${keyName.replace(/_/g, ' ').toUpperCase()} updated successfully.`);
        loadAnalyticsData();
      } catch (err) {
        alert('Failed to save setting image.');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 no-print space-y-6 shadow-xl">
      {/* Sub Tabs selector */}
      <div className="flex flex-col sm:flex-row border-b border-slate-800 pb-3 flex-wrap gap-2.5">
        <button
          onClick={() => setActiveSubTab('teachers')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'teachers' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" /> Teachers &amp; Class Stream Teachers
        </button>
        <button
          onClick={() => setActiveSubTab('reports')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'reports' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Reports compiler
        </button>
        <button
          onClick={() => setActiveSubTab('promotions')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'promotions' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Promotions Tool
        </button>
        <button
          onClick={() => setActiveSubTab('emis')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'emis' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> EMIS & branding Settings
        </button>
        {/* Marks approvals removed from UI */}
        <button
          onClick={() => setActiveSubTab('studentsearch')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'studentsearch' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-4 h-4" /> Student Search & Print
        </button>
        <button
          onClick={() => setActiveSubTab('studentaccounts')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'studentaccounts' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <KeyRound className="w-4 h-4" /> Student Accounts
        </button>
        <button
          onClick={() => setActiveSubTab('duplicates')}
          className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'duplicates' ? 'bg-indigo-600 text-white' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" /> Manage Duplicates
        </button>
      </div>

      {/* --- TEACHERS VIEW --- */}
      {activeSubTab === 'teachers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3 animate-fade-in">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-200">Teacher Registry Accounts</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Define subject teachers and assign classes for worksheet inputs</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowUploadPanel(!showUploadPanel)}
                className="px-3 py-1.5 bg-slate-905 hover:bg-slate-800 text-indigo-400 font-bold text-xs uppercase tracking-wider rounded-lg border border-slate-800 hover:border-slate-700 shadow transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" /> Bulk Upload
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingTeacher(null);
                  setTeacherForm({
                    username: '',
                    password: '',
                    name: '',
                    subjects: [],
                    classes: [],
                    assignments: [],
                    position: 'Teacher',
                    signature: '',
                    gender: 'Male',
                    photo: '',
                    status: 'Active'
                  });
                  setShowTeacherModal(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg border border-indigo-500 shadow transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Teacher Account
              </button>
            </div>
          </div>

          {/* Collapsible Upload Panel */}
          {showUploadPanel && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl animate-fade-in">
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">Spreadsheet Roster Import</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Add multiple teachers at once using a CSV or Excel spreadsheet. Make sure your file follows the standard template format.
                </p>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider font-bold">Expected Columns:</h4>
                  <ul className="text-[10px] text-slate-400 space-y-1.5 font-medium list-disc list-inside">
                    <li><strong className="text-indigo-300 font-mono">Teacher Number</strong> (required, unique identifier)</li>
                    <li><strong className="text-indigo-300 font-mono">Full Name</strong> (required, display name)</li>
                    <li><strong className="text-indigo-300 font-mono">Gender</strong> (required, Male or Female)</li>
                    <li><strong className="text-indigo-300 font-mono">Subject(s) Taught</strong> (required, comma-separated list)</li>
                    <li><strong className="text-indigo-300 font-mono">Username</strong> (required, unique login ID)</li>
                    <li><strong className="text-indigo-300 font-mono">Password</strong> (required, default login password)</li>
                    <li><strong className="text-indigo-300 font-mono">Class Teacher</strong> (optional, e.g. S.1 A)</li>
                  </ul>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center gap-2 cursor-pointer w-full sm:w-auto shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Download Excel Template
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                  <Upload className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider">File Dropzone</h3>
                </div>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 border-2 border-dashed border-slate-850 hover:border-indigo-500/50 bg-slate-900/10 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition text-center min-h-[140px]"
                >
                  <FileSpreadsheet className="w-8 h-8 text-indigo-500" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Select or drag & drop teacher roster file</span>
                    <span className="text-[9px] text-slate-500 font-mono mt-1 block">.xlsx, .xls, or .csv formats</span>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </div>
                {isImporting && (
                  <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 font-bold py-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                    <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    Importing records, please wait...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Import Results Report */}
          {importReport && (
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-5 animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Import Summary Report
                </h3>
                <button 
                  type="button"
                  onClick={() => setImportReport(null)}
                  className="text-[10px] text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  Clear Report
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded-xl text-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">Success</span>
                  <span className="text-xl font-black text-emerald-450">{importReport.success.length}</span>
                </div>
                <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl text-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Skipped</span>
                  <span className="text-xl font-black text-amber-400">{importReport.skipped.length}</span>
                </div>
                <div className="bg-rose-950/20 border border-rose-900/30 p-3 rounded-xl text-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 block">Errors</span>
                  <span className="text-xl font-black text-rose-450">{importReport.errors.length}</span>
                </div>
              </div>

              <div className="space-y-4">
                {importReport.success.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase text-emerald-400 tracking-wider font-bold">Successfully Imported Teachers</h4>
                    <div className="max-h-32 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-2.5 text-[11px] space-y-1.5 font-medium text-slate-300">
                      {importReport.success.map((t: any) => (
                        <div key={t.id} className="flex justify-between items-center py-0.5 border-b border-slate-950 last:border-0">
                          <span>{t.name}</span>
                          <span className="font-mono text-[9px] text-slate-500">ID: {t.id} (@{t.username})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importReport.skipped.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase text-amber-400 tracking-wider font-bold">Skipped Duplicates</h4>
                    <div className="max-h-32 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-2.5 text-[11px] space-y-1.5 font-medium text-slate-300">
                      {importReport.skipped.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-0.5 border-b border-slate-950 last:border-0">
                          <span>{t.name || 'Unknown'} <span className="text-[9px] text-slate-500">(@{t.username || 'N/A'})</span></span>
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 px-2 rounded border border-amber-500/20">{t.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importReport.errors.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase text-rose-400 tracking-wider font-bold">Import Errors & Failures</h4>
                    <div className="max-h-32 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-2.5 text-[11px] space-y-1.5 font-medium text-slate-350">
                      {importReport.errors.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-start py-0.5 border-b border-slate-950 last:border-0 gap-2">
                          <span className="text-[9px] font-bold text-slate-500 shrink-0">Row {t.rowNum}</span>
                          <span className="flex-1">{t.name || 'N/A'}</span>
                          <span className="text-[9px] text-rose-450 bg-rose-500/10 px-2 rounded border border-rose-500/20 shrink-0">{t.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {loadingTeachers ? (
            <div className="text-center py-10">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500">Syncing registry...</span>
            </div>
          ) : (
            <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-xl">
              <table className="w-full min-w-[800px] text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                    <th className="p-3">Name</th>
                    <th className="p-3">Username</th>
                    <th className="p-3" colSpan={2}>Teaching Assignments (Subject &amp; Class)</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id} className="border-b border-slate-850 hover:bg-slate-900/10 font-semibold text-slate-350">
                      <td className="p-3 font-bold text-slate-200 uppercase">
                        <div className="flex items-center gap-3">
                          {/* Photo frame */}
                          <div className="w-10 h-13 rounded bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 relative group">
                            {t.photo ? (
                              <img src={t.photo} alt={t.name} className="w-full h-full object-cover animate-fade-in" />
                            ) : (
                              <svg className="w-5 h-5 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                            )}
                            <label className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-[8px] text-white font-bold select-none text-center p-0.5">
                              <Camera className="w-3 h-3 mb-0.5 text-indigo-400" />
                              <span>Change</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png"
                                onChange={(e) => handleDirectPhotoUpload(t.id, e)}
                                className="hidden"
                              />
                            </label>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="truncate">{t.name}</span>
                              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                t.status === 'Inactive'
                                  ? 'bg-rose-500/10 text-rose-455 border-rose-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}>
                                {t.status || 'Active'}
                              </span>
                            </div>
                            {t.position && t.position !== 'Teacher' && (
                              <div className="text-[9px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">
                                Role: {t.position}
                              </div>
                            )}
                            {!isHeadteacher(t.position) && t.classTeacherFor && t.classTeacherFor.length > 0 && (
                              <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                                Class Teacher: {t.classTeacherFor.join(', ')}
                              </div>
                            )}
                            {t.signature && (
                              <div className="inline-flex items-center gap-1 text-[8.5px] font-bold text-slate-400 bg-slate-900/50 px-1 py-0.5 rounded border border-slate-800 mt-1">
                                ✍️ Signature Uploaded
                              </div>
                            )}
                            <div className="text-[9px] text-slate-500 lowercase mt-0.5">
                              {!isHeadteacher(t.position) && <>id: {t.id} • </>}gender: {t.gender || 'Male'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono">{t.username}</td>
                      <td className="p-3" colSpan={2}>
                        <div className="flex flex-wrap gap-1.5">
                          {isHeadteacher(t.position) ? null : t.assignments && t.assignments.length > 0 ? (
                            t.assignments.map((a, idx) => (
                              <span key={idx} className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-slate-700">
                                {a.subject} ({a.grade_class})
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">No specific teaching assignments</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTeacher(t)}
                            className="p-1.5 text-indigo-400 hover:bg-indigo-950/40 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTeacher(t.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Class Teachers Assignment Panel */}
          <div className="border-t border-slate-800 pt-6 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-200 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-400" /> Stream Class Teachers
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Assign a Class Teacher for each O-Level stream and A-Level discipline. Changes save instantly.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTeacher(null);
                  setTeacherForm({
                    username: '',
                    password: '',
                    name: '',
                    subjects: [],
                    classes: [],
                    assignments: [],
                    position: 'Teacher',
                    signature: '',
                    gender: 'Male',
                    photo: '',
                    status: 'Active'
                  });
                  setShowTeacherModal(true);
                }}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-indigo-400 hover:text-indigo-300 font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all duration-150 cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Register New Teacher
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {SCHOOL_CLASSES.map((gradeClass) => {
                const ctRec = classTeachers.find(ct => ct.grade_class === gradeClass);
                const currentTeacherId = ctRec ? ctRec.teacher_id : '';
                
                return (
                  <div key={gradeClass} className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner space-y-3 flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-400 block">{gradeClass}</span>
                      <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">
                        {gradeClass.startsWith('S.5') || gradeClass.startsWith('S.6') ? 'A-Level Stream' : 'O-Level Stream'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Class Teacher</label>
                      <select
                        value={currentTeacherId}
                        onChange={(e) => handleClassTeacherChange(gradeClass, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer focus:outline-none focus:border-indigo-500 uppercase"
                      >
                        <option value="">-- Unassigned --</option>
                        {teachers.filter(t => !isHeadteacher(t.position)).map(t => (
                          <option key={t.id} value={t.id}>{t.name} (@{t.username})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teacher Form Modal */}
          {showTeacherModal && (
            <div className="fixed inset-0 z-[999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <form onSubmit={handleTeacherSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider">
                    {editingTeacher ? 'Edit Teacher Account' : 'Register New Teacher'}
                  </h4>
                  <button type="button" onClick={() => setShowTeacherModal(false)}>
                    <X className="w-5 h-5 text-slate-500 hover:text-slate-400 cursor-pointer" />
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Photo Upload Row */}
                  <div className="flex items-center gap-4 bg-slate-955 p-3 rounded-lg border border-slate-850">
                    <div className="w-14 h-18 rounded bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 relative group">
                      {teacherForm.photo ? (
                        <img src={teacherForm.photo} alt="Preview" className="w-full h-full object-cover animate-fade-in" />
                      ) : (
                        <Camera className="w-6 h-6 text-slate-700" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passport Photo</label>
                      <div className="flex gap-2">
                        <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-205 text-[10px] font-bold rounded cursor-pointer transition flex items-center gap-1.5 animate-pulse-subtle">
                          <Upload className="w-3 h-3" /> Select Photo
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
                                alert('Only JPG, JPEG, and PNG formats are accepted.');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = async (evt) => {
                                const base64 = evt.target?.result as string;
                                const compressed = await compressStudentPhoto(base64, 300, 400, 0.8);
                                setTeacherForm(prev => ({ ...prev, photo: compressed }));
                              };
                              reader.readAsDataURL(file);
                            }}
                            className="hidden"
                          />
                        </label>
                        {teacherForm.photo && (
                          <button
                            type="button"
                            onClick={() => setTeacherForm(prev => ({ ...prev, photo: '' }))}
                            className="px-3 py-1.5 bg-rose-955/40 hover:bg-rose-900/40 text-rose-400 text-[10px] font-bold rounded border border-rose-900/30 transition"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-500">JPG, JPEG or PNG. Auto-resized and optimized.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mr. Okello Joseph"
                      value={teacherForm.name}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-xs text-slate-202 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Username *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. joseph123"
                      value={teacherForm.username}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                      className="bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-xs text-slate-202 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">
                      {editingTeacher ? 'Password (leave blank to keep unchanged)' : 'Password *'}
                    </label>
                    <input
                      type="password"
                      required={!editingTeacher}
                      placeholder="••••••••"
                      value={teacherForm.password}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, password: e.target.value }))}
                      className="bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-xs text-slate-202 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Gender</label>
                      <select
                        value={teacherForm.gender || 'Male'}
                        onChange={(e) => setTeacherForm(prev => ({ ...prev, gender: e.target.value }))}
                        className="bg-slate-955 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer animate-fade-in"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Account Status</label>
                      <select
                        value={teacherForm.status || 'Active'}
                        onChange={(e) => setTeacherForm(prev => ({ ...prev, status: e.target.value }))}
                        className="bg-slate-955 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer animate-fade-in"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase">Staff Position *</label>
                    <select
                      value={teacherForm.position || 'Teacher'}
                      onChange={(e) => setTeacherForm(prev => ({ ...prev, position: e.target.value }))}
                      className="bg-slate-955 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="Teacher">Teacher</option>
                      <option value="Class Teacher">Class Teacher</option>
                      <option value="DOS">DOS</option>
                      <option value="Headteacher">Headteacher</option>
                      <option value="Head of Department">Head of Department</option>
                      <option value="Deputy Head">Deputy Head</option>
                    </select>
                  </div>

                  {hasSignature(teacherForm.position) && (
                    <div className="flex flex-col gap-1.5 animate-fade-in">
                      <label className="text-[10px] text-slate-400 font-bold uppercase">Digital Signature Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = async () => {
                              const base64 = reader.result as string;
                              const compressed = await compressSignatureImage(base64);
                              setTeacherForm(prev => ({ ...prev, signature: compressed }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-slate-800 file:text-slate-350 hover:file:bg-slate-700 cursor-pointer"
                      />
                      {teacherForm.signature && (
                        <div className="flex items-center gap-3 bg-slate-950 p-2 rounded-lg border border-slate-850 mt-1">
                          <img
                            src={teacherForm.signature}
                            alt="Signature Preview"
                            className="h-10 object-contain bg-white rounded p-1"
                          />
                          <button
                            type="button"
                            onClick={() => setTeacherForm(prev => ({ ...prev, signature: '' }))}
                            className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase cursor-pointer"
                          >
                            Clear Signature
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isHeadteacher(teacherForm.position) && (
                    <div className="space-y-2.5 border-t border-slate-800 pt-3">
                      <label className="text-[10px] text-slate-400 font-bold uppercase block">Assign Subjects &amp; Classes</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] text-slate-500 font-bold uppercase">Class / Stream</label>
                          <select
                            value={selectedClassToAdd}
                            onChange={(e) => setSelectedClassToAdd(e.target.value)}
                            className="bg-slate-950 border border-slate-855 rounded-lg p-2 text-xs text-slate-202 focus:outline-none cursor-pointer uppercase"
                          >
                            {SCHOOL_CLASSES.map(cls => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] text-slate-500 font-bold uppercase">Subject</label>
                          <select
                            value={selectedSubjectToAdd}
                            onChange={(e) => setSelectedSubjectToAdd(e.target.value)}
                            className="bg-slate-955 border border-slate-850 rounded-lg p-2 text-xs text-slate-200 focus:outline-none cursor-pointer uppercase"
                          >
                            <option value="">-- Select Subject --</option>
                            {subjectsDropdownList.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addAssignmentToForm}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold uppercase tracking-wider text-slate-202 rounded-lg border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Add Assignment
                      </button>

                      <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-24 overflow-y-auto bg-slate-950 p-2 rounded-lg border border-slate-855 shadow-inner">
                        {teacherForm.assignments && teacherForm.assignments.length === 0 ? (
                          <span className="text-[10px] text-slate-500 italic">No specific teaching assignments added.</span>
                        ) : (
                          teacherForm.assignments?.map((a, idx) => (
                            <span key={idx} className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1.5 uppercase border border-slate-700">
                              {a.subject} ({a.grade_class})
                              <X className="w-3.5 h-3.5 text-slate-500 hover:text-red-400 cursor-pointer" onClick={() => setTeacherForm(p => ({ ...p, assignments: p.assignments.filter((_, i) => i !== idx) }))} />
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowTeacherModal(false)}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-5 py-2 bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* --- REPORT COMPILER VIEW --- */}
      {activeSubTab === 'reports' && (
        <div className="space-y-6">
          {/* Pending submissions disabled */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-200">Teacher Marksheets Submissions</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Marks approval workflow has been disabled. Teachers' saved marks take effect immediately.</p>
                </div>

                <div className="text-center py-8 text-xs text-slate-500 font-medium bg-slate-950 border border-dashed border-slate-850 rounded-xl">
                  Marks submission queue is no longer used. Administrators can review and correct marks via student accounts or the worksheets listing.
                </div>
              </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-200">Bulk Report Cards Compiler</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Generate and download official school reports in one consolidated PDF booklet</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-inner items-end animate-fade-in">
                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Select Class</label>
                  <select
                    value={reportParams.gradeClass}
                    onChange={(e) => setReportParams(prev => ({ ...prev, gradeClass: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                  >
                    <option value="S.1">S.1</option>
                    <option value="S.2">S.2</option>
                    <option value="S.3">S.3</option>
                    <option value="S.4">S.4</option>
                    <option value="S.5">S.5</option>
                    <option value="S.6">S.6</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Select Stream</label>
                  <select
                    value={reportParams.stream}
                    onChange={(e) => setReportParams(prev => ({ ...prev, stream: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                  >
                    <option value="All">All Streams</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="Arts">Arts</option>
                    <option value="Sciences">Sciences</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Boarding Status</label>
                  <select
                    value={reportParams.boardingStatus}
                    onChange={(e) => setReportParams(prev => ({ ...prev, boardingStatus: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                  >
                    <option value="All">All Students</option>
                    <option value="Day Scholar">Day Scholars</option>
                    <option value="Hostellers">Hostellers</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Term</label>
                  <select
                    value={reportParams.term}
                    onChange={(e) => setReportParams(prev => ({ ...prev, term: e.target.value }))}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer"
                  >
                    <option value="1">Term 1</option>
                    <option value="Midterm 1">Midterm 1</option>
                    <option value="2">Term 2</option>
                    <option value="Midterm 2">Midterm 2</option>
                    <option value="3">Term 3</option>
                    <option value="Midterm 3">Midterm 3</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Academic Year</label>
                  <input
                    type="number"
                    value={reportParams.year}
                    onChange={(e) => setReportParams(prev => ({ ...prev, year: parseInt(e.target.value) || 2026 }))}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold"
                  />
                </div>
              </div>

              {/* Display list of matching students in the queue */}
              <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-inner space-y-3">
                <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                  <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> Enrolled Students Queue ({matchingStudents.length})
                  </span>
                  {loadingMatching && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
                </div>

                {matchingStudents.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic py-5 text-center border border-dashed border-slate-850 rounded-xl bg-slate-900/10">
                    No students match the selected class, stream, and boarding status criteria.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-slate-850 rounded-xl bg-slate-900/40 p-3.5 space-y-1.5 shadow-inner">
                    {Array.isArray(matchingStudents) && matchingStudents.map((st) => (
                      <div key={st.id} className="flex justify-between items-center text-[11px] px-2.5 py-1.5 hover:bg-slate-900/60 rounded-lg font-semibold text-slate-350 transition-colors border border-slate-900">
                        <span className="text-slate-100 uppercase tracking-tight">{st.name}</span>
                        <span className="text-[9px] text-slate-500 font-bold font-mono uppercase bg-slate-950/60 px-2 py-0.5 rounded border border-slate-850">
                          {st.gradeClass} | {st.boardingStatus === 'Boarder' ? 'Hosteller' : 'Day Scholar'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Printing Action Buttons */}
              <div className="flex flex-wrap gap-3 justify-end items-center pt-2">
                <button
                  type="button"
                  onClick={() => handleCompileReports('All')}
                  disabled={compilingReports}
                  className="px-4 py-2.5 bg-slate-850 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" /> Print All Students
                </button>
                <button
                  type="button"
                  onClick={() => handleCompileReports('Day Scholar')}
                  disabled={compilingReports}
                  className="px-4 py-2.5 bg-slate-850 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" /> Print Day Scholars Only
                </button>
                <button
                  type="button"
                  onClick={() => handleCompileReports('Boarder')}
                  disabled={compilingReports}
                  className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" /> Print Hostellers' Report Cards
                </button>
              </div>
            </div>

            {compilingReports && reportProgress && (
              <div className="mt-3 bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-900/30 flex flex-col gap-2 text-[10px] font-mono animate-fade-in">
                <div className="flex justify-between font-bold text-indigo-300">
                  <span>COMPILING ACADEMIC REPORT CARDS...</span>
                  <span>{reportProgress.current} / {reportProgress.total} STUDENTS</span>
                </div>
                <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-100" style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- PROMOTIONS VIEW --- */}
      {activeSubTab === 'promotions' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-200 font-sans tracking-tight">Student Academic Promotions</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Bulk transition student cohorts to the next grade class. Graduating classes will be shifted to Alumni status</p>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl max-w-xl shadow-inner space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">Source Class Cohort</label>
                <select
                  value={promoForm.sourceClass}
                  onChange={(e) => {
                    // Automatically pre-fill matching target class
                    const src = e.target.value;
                    let tgt = 'S.2';
                    if (src === 'S.1') tgt = 'S.2';
                    else if (src === 'S.2') tgt = 'S.3';
                    else if (src === 'S.3') tgt = 'S.4';
                    else if (src === 'S.4') tgt = 'S.5';
                    else if (src === 'S.5') tgt = 'S.6';
                    else if (src === 'S.6') tgt = 'Alumni';

                    setPromoForm({ sourceClass: src, targetClass: tgt });
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                >
                  <option value="S.1">S.1 (Senior 1)</option>
                  <option value="S.2">S.2 (Senior 2)</option>
                  <option value="S.3">S.3 (Senior 3)</option>
                  <option value="S.4">S.4 (Senior 4)</option>
                  <option value="S.5">S.5 (Senior 5)</option>
                  <option value="S.6">S.6 (Senior 6)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-550 font-bold uppercase tracking-wider">Target Class Destination</label>
                <select
                  value={promoForm.targetClass}
                  onChange={(e) => setPromoForm(prev => ({ ...prev, targetClass: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                >
                  <option value="S.2">S.2 (Senior 2)</option>
                  <option value="S.3">S.3 (Senior 3)</option>
                  <option value="S.4">S.4 (Senior 4)</option>
                  <option value="S.5">S.5 (Senior 5)</option>
                  <option value="S.6">S.6 (Senior 6)</option>
                  <option value="Alumni">Graduated State / Alumni</option>
                </select>
              </div>
            </div>

            {/* Impact warning alert */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="text-xs leading-normal">
                <span className="font-bold text-slate-300 uppercase block">Promotion Diagnostics Summary</span>
                <p className="text-slate-500 font-medium mt-1">
                  Enrolled students in source class <strong className="text-slate-300">"{promoForm.sourceClass}"</strong>: <strong className="text-indigo-400">{sourceCount} students</strong>.
                  Upon confirmation, these student accounts will be instantly reassigned to class <strong className="text-slate-300">"{promoForm.targetClass}"</strong>, preserving stream groupings where applicable.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePromoteExecution}
              className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition-colors shadow"
            >
              Promote Class Registry
            </button>
          </div>
        </div>
      )}

      {/* --- EMIS & BRANDING VIEW --- */}
      {activeSubTab === 'emis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* EMIS Summary stats */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-200">EMIS Ugandan School Analytics</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Summary metrics comparing clearances, rosters, and financial status</p>
              </div>

              {stats && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider">Total Enrolled students</span>
                    <h4 className="text-2xl font-black text-slate-100 tracking-tight mt-1">{stats.total}</h4>
                  </div>
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider">Cleared Students</span>
                    <h4 className="text-2xl font-black text-slate-105 tracking-tight mt-1">{stats.cleared} ({stats.clearedPct}%)</h4>
                  </div>
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider">On Hold Clearance</span>
                    <h4 className="text-2xl font-black text-slate-105 tracking-tight mt-1">{stats.pending}</h4>
                  </div>
                  <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider">Students with Photo</span>
                    <h4 className="text-2xl font-black text-slate-105 tracking-tight mt-1">{stats.withPhoto} ({stats.photoPct}%)</h4>
                  </div>
                </div>
              )}
            </div>

            {/* School Branding Signatures & Watermarks */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-200">Branding signatures & Stamp overlay</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Upload vector signature and stamp assets for report card compilation</p>
              </div>

              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-inner space-y-4">

                {/* School Stamp Upload */}
                <div className="flex items-center justify-between gap-4 p-3 bg-slate-900/40 border border-slate-850 rounded-xl">
                  <div>
                    <span className="text-[10.5px] font-black uppercase text-slate-200 tracking-wide block">Official School Seal/Stamp</span>
                    <p className="text-[9px] text-slate-500 mt-0.5 font-semibold">Transparent circular stamp overlay on reports</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.school_stamp && (
                      <img src={settings.school_stamp} className="w-8 h-8 bg-white object-contain border border-slate-700 rounded-full p-0.5" alt="HT Stamp" />
                    )}
                    <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[9px] uppercase tracking-wider rounded border border-slate-700 cursor-pointer">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSettingsImageUpload('school_stamp', file);
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Marks approvals view removed — approval workflow deprecated. Administrators can directly edit marks via student reports and student accounts. */}

      {/* --- STUDENT SEARCH & PRINTING VIEW --- */}
      {activeSubTab === 'studentsearch' && (
        <div className="space-y-6 animate-fade-in">
          <div>
            <h3 className="text-sm font-black uppercase text-slate-200">Student Search & Printing Center</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Search registries, filter performance grades, view card statuses and generate individual or multiple report cards.</p>
          </div>

          {/* Search bar & Advanced filters */}
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-inner space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search student by Name, Student Number, Class, Stream or Index..."
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={executeStudentSearch}
                disabled={searchingStudents}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white border border-indigo-500 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${searchingStudents ? 'animate-spin' : ''}`} />
                Search
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Assessment Term</label>
                <select
                  value={studentSearchFilters.term}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, term: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer"
                >
                  <option value="1">Term 1</option>
                  <option value="Midterm 1">Midterm 1</option>
                  <option value="2">Term 2</option>
                  <option value="Midterm 2">Midterm 2</option>
                  <option value="3">Term 3</option>
                  <option value="Midterm 3">Midterm 3</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Academic Year</label>
                <input
                  type="number"
                  value={studentSearchFilters.year}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, year: parseInt(e.target.value) || 2026 }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Grade/Class</label>
                <select
                  value={studentSearchFilters.gradeClass}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, gradeClass: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                >
                  <option value="All">All Classes</option>
                  <option value="S.1">S.1</option>
                  <option value="S.2">S.2</option>
                  <option value="S.3">S.3</option>
                  <option value="S.4">S.4</option>
                  <option value="S.5">S.5</option>
                  <option value="S.6">S.6</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Stream</label>
                <select
                  value={studentSearchFilters.stream}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, stream: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer uppercase"
                >
                  <option value="All">All Streams</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="Arts">Arts</option>
                  <option value="Sciences">Sciences</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Gender</label>
                <select
                  value={studentSearchFilters.gender}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, gender: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer"
                >
                  <option value="All">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Performance Grade</label>
                <select
                  value={studentSearchFilters.performanceGrade}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, performanceGrade: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer"
                >
                  <option value="All">All Grades</option>
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                  <option value="D">Grade D</option>
                  <option value="E">Grade E</option>
                  <option value="F">Grade F</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">Report Status</label>
                <select
                  value={studentSearchFilters.reportStatus}
                  onChange={(e) => setStudentSearchFilters(prev => ({ ...prev, reportStatus: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-bold cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Approved">Approved & Locked</option>
                  <option value="Pending">Pending Audit</option>
                  <option value="Reopened">Reopened Editing</option>
                  <option value="Draft">Drafting</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bulk printing/downloading floating status bar */}
          {selectedSearchStudentIds.length > 0 && (
            <div className="bg-indigo-950 border border-indigo-850 p-4 rounded-xl flex items-center justify-between gap-4 animate-slide-in shadow-lg">
              <div className="flex items-center gap-2 text-xs text-indigo-200">
                <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                <span>Selected <strong className="text-white">{selectedSearchStudentIds.length}</strong> students for print operations.</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedSearchStudentIds.length === 1 && (
                  <button
                    onClick={() => handlePrintSelected('preview')}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                  >
                    Preview Report
                  </button>
                )}
                <button
                  onClick={() => handlePrintSelected('download')}
                  disabled={printingSelected}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
                >
                  {printingSelected ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Compile Selected ({selectedSearchStudentIds.length})
                </button>
              </div>
            </div>
          )}

          {/* print compilation progress bar */}
          {printingSelected && printProgress && (
            <div className="bg-indigo-950/40 p-4 rounded-2xl border border-indigo-900/30 flex flex-col gap-2 text-[10px] font-mono animate-fade-in">
              <div className="flex justify-between font-bold text-indigo-300">
                <span>GENERATING REPORT BOOKLET FOR SELECTED REGISTRY...</span>
                <span>{printProgress.current} / {printProgress.total} COMPLETED</span>
              </div>
              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-100" style={{ width: `${(printProgress.current / printProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Results table */}
          {searchingStudents ? (
            <div className="text-center py-16">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-500">Querying registry database...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 border border-dashed border-slate-850 rounded-2xl bg-slate-950">
              No student records match the search query and filters.
            </div>
          ) : (
            <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-xl shadow">
              <table className="w-full min-w-[800px] text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedSearchStudentIds.length === searchResults.length && searchResults.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSearchStudentIds(searchResults.map(s => s.id));
                          } else {
                            setSelectedSearchStudentIds([]);
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Adm. Number</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Class &amp; Stream</th>
                    <th className="p-3 text-center">Gender</th>
                    <th className="p-3 text-center">Avg. Mark</th>
                    <th className="p-3 text-center">Perf. Grade</th>
                    <th className="p-3 text-center">Report Status</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((s) => {
                    const isSelected = selectedSearchStudentIds.includes(s.id);
                    const badgeColor = 
                      s.overallStatus === 'Approved' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' :
                      s.overallStatus === 'Pending' ? 'bg-amber-950/60 border-amber-850 text-amber-400' :
                      s.overallStatus === 'Reopened' ? 'bg-sky-950/60 border-sky-850 text-sky-400' :
                      'bg-slate-900 border-slate-800 text-slate-400';

                    return (
                      <tr key={s.id} className={`border-b border-slate-850 hover:bg-slate-900/10 font-semibold text-slate-350 ${isSelected ? 'bg-indigo-950/10' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSearchStudentIds(prev => [...prev, s.id]);
                              } else {
                                setSelectedSearchStudentIds(prev => prev.filter(id => id !== s.id));
                              }
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono text-slate-400">{s.adminNo}</td>
                        <td className="p-3 font-bold text-slate-200 uppercase">{s.name}</td>
                        <td className="p-3 uppercase">{s.gradeClass}</td>
                        <td className="p-3 text-center font-medium">{s.gender}</td>
                        <td className="p-3 text-center font-mono font-bold text-indigo-300">
                          {s.subjectCount > 0 ? `${s.average.toFixed(1)}%` : '-'}
                        </td>
                        <td className="p-3 text-center font-bold font-mono">
                          {s.subjectCount > 0 ? (
                            <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-850">
                              Grade {s.grade}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border ${badgeColor}`}>
                            {s.overallStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => handlePrintSelected('preview', s.id)}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-750 text-slate-300 text-[9px] font-bold uppercase rounded cursor-pointer transition-colors"
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => handlePrintSelected('download', s.id)}
                              className="px-2.5 py-1 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-850 text-indigo-400 text-[9px] font-bold uppercase rounded cursor-pointer transition-colors"
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Inline Report Card Preview Modal */}
          {showPreviewModal && (
            <div className="fixed inset-0 z-[999] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 shadow-2xl space-y-4 flex flex-col h-[90vh]">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider">
                      Report Card Preview: {previewStudent?.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Class {previewStudent?.gradeClass} | Average {previewStudent?.average?.toFixed(1)}% | Term {studentSearchFilters.term}, {studentSearchFilters.year}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setShowPreviewModal(false); setPreviewPdfUrl(null); }}>
                    <X className="w-5 h-5 text-slate-500 hover:text-slate-400 cursor-pointer" />
                  </button>
                </div>

                <div className="flex-1 bg-slate-950 rounded-xl flex items-center justify-center overflow-hidden border border-slate-850 relative">
                  {previewLoading ? (
                    <div className="text-center space-y-3">
                      <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto animate-pulse" />
                      <p className="text-xs text-slate-500 font-mono">COMPILING PDF STREAM ON SERVER...</p>
                    </div>
                  ) : previewPdfUrl ? (
                    <iframe
                      src={previewPdfUrl}
                      className="w-full h-full border-0"
                      title="Report Card Preview"
                    />
                  ) : (
                    <div className="text-xs text-slate-500">Failed to render preview. Please download instead.</div>
                  )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowPreviewModal(false); setPreviewPdfUrl(null); }}
                    className="px-4 py-2 bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-200 rounded-lg font-bold text-xs uppercase cursor-pointer"
                  >
                    Close Preview
                  </button>
                  {previewPdfUrl && (
                    <a
                      href={previewPdfUrl.replace('?preview=true', '')}
                      download={`${previewStudent?.name?.replace(/\s+/g, '_')}_Report.pdf`}
                      className="px-5 py-2 bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 rounded-lg font-bold text-xs uppercase cursor-pointer flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" /> Download PDF File
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'studentaccounts' && (
        <AdminStudentAccountsTab approvedBy={authSession?.user?.name || 'Administrator'} />
      )}

      {activeSubTab === 'duplicates' && (
        <AdminDuplicatesTab approvedBy={authSession?.user?.name || 'Administrator'} />
      )}
    </div>
  );
}

