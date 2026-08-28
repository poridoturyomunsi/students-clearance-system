import React, { useEffect, useState } from 'react';
import { 
  BookOpen, LogOut, CheckCircle2, Save, AlertCircle, RefreshCw, ClipboardList, 
  Search, ChevronDown, Check, Upload, User, Smile, Award, Clock, ChevronRight, 
  Calendar, MessageSquare, Phone, Lock, Eye, EyeOff, ShieldCheck, MapPin, Briefcase, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import SchoolLogo from './SchoolLogo.tsx';
import AttendanceModule from './modules/AttendanceModule.tsx';
import StaffCard from './StaffCard.tsx';
import { generateStaffIdCardsPdf } from '../utils/pdfGenerator.ts';
import { generateStaffIdCardPng } from '../utils/pngGenerator.ts';
import { 
  fetchTeacherStudents, 
  fetchTeacherMarks, 
  saveTeacherMarks, 
  submitTeacherMarks,
  fetchClassesFromDb,
  fetchStreamsFromDb,
  fetchStudentsFromDb,
  fetchSettings,
  fetchAttendanceLogs,
  fetchParentContacts,
  fetchStaffLeaveRequests,
  submitLeaveRequest,
  fetchStaffTimetable,
  saveStaffTimetable,
  changeStaffPassword,
  fetchStaffProfile
} from '../utils/api.ts';
import ParticleBackground from './ParticleBackground.tsx';
import { Staff, LeaveRequest, TimetableSlot } from '../types';

interface StaffPortalProps {
  staffId: string;
  staffName: string;
  staffUsername?: string;
  category: 'Teaching' | 'Non-Teaching';
  assignedClasses: string[];
  assignedSubjects: string[];
  teacherAssignments?: { subject: string, grade_class: string }[];
  schoolLogo: string | null;
  authorizedSignature?: string | null;
  gender?: string;
  photo?: string;
  classTeacherFor?: string[];
  onLogout: () => void;
  position?: string;
  forcePasswordChange?: boolean;
}

export default function StaffPortal({
  staffId,
  staffName,
  staffUsername,
  category = 'Teaching',
  assignedClasses = [],
  assignedSubjects = [],
  teacherAssignments = [],
  schoolLogo,
  authorizedSignature = null,
  gender = '',
  photo = '',
  classTeacherFor = [],
  onLogout,
  position = 'Staff Member',
  forcePasswordChange = false
}: StaffPortalProps) {
  // Navigation
  const [activeView, setActiveView] = useState<'dashboard' | 'marks' | 'class-attendance' | 'gate-attendance' | 'timetable' | 'leave-requests' | 'change-password'>('dashboard');

  // Forced password change state
  const [showForcedReset, setShowForcedReset] = useState(forcePasswordChange);
  const [resetOldPassword, setResetOldPassword] = useState('123');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Profile details & metadata
  const [staffProfile, setStaffProfile] = useState<any>(null);

  // Leave Requests state
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveSuccess, setLeaveSuccess] = useState<string | null>(null);

  // Timetable state
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>([]);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableSaving, setTimetableSaving] = useState(false);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [newSlotDay, setNewSlotDay] = useState('Monday');
  const [newSlotPeriod, setNewSlotPeriod] = useState('Period 1');
  const [newSlotStart, setNewSlotStart] = useState('08:00');
  const [newSlotEnd, setNewSlotEnd] = useState('08:45');
  const [newSlotClass, setNewSlotClass] = useState('');
  const [newSlotSubject, setNewSlotSubject] = useState('');
  const [newSlotRoom, setNewSlotRoom] = useState('');

  // Self change-password state (non-forced)
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // --- Legacy Teacher Module States ---
  const DEFAULT_CLASSES = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];
  const DEFAULT_STREAMS = ['A', 'B', 'C', 'D', 'E', 'North', 'South', 'Sciences', 'Arts'];
  const DEFAULT_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Language', 'History and Political Education', 'Geography', 'Entrepreneurship', 'ICT', 'General Paper'];

  const [allSubjects, setAllSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(
    assignedSubjects && assignedSubjects.length > 0 ? assignedSubjects : DEFAULT_SUBJECTS
  );
  const [activeSubject, setActiveSubject] = useState<string>(
    assignedSubjects && assignedSubjects.length > 0 ? assignedSubjects[0] : 'Mathematics'
  );
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [isSubjectDropdownOpen, setIsSubjectDropdownOpen] = useState<boolean>(false);
  const [classList, setClassList] = useState<string[]>(DEFAULT_CLASSES);
  const [streamList, setStreamList] = useState<string[]>(DEFAULT_STREAMS);
  const [selectedClassVal, setSelectedClassVal] = useState<string>('S.1');
  const [selectedStreamVal, setSelectedStreamVal] = useState<string>('A');
  const [term, setTerm] = useState('3');
  const [year, setYear] = useState(2026);
  const [selectedPaper, setSelectedPaper] = useState<number>(1);
  const [students, setStudents] = useState<any[]>([]);
  const [boardingFilter, setBoardingFilter] = useState<'All' | 'Hosteller' | 'Day Scholar'>('All');
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
  const [classAttendanceList, setClassAttendanceList] = useState<any[]>([]);
  const [classAttendanceLoading, setClassAttendanceLoading] = useState<boolean>(false);

  // Load staff profile details (including new clearance database columns)
  const loadProfileDetails = async () => {
    try {
      const data = await fetchStaffProfile(staffId);
      if (data) {
        setStaffProfile(data);
      }
    } catch (e) {
      console.warn('Failed to load full staff profile metadata:', e);
    }
  };

  // Load leave requests
  const loadLeaveRequests = async () => {
    setLeaveLoading(true);
    try {
      const data = await fetchStaffLeaveRequests(staffId);
      setLeaveRequests(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLeaveLoading(false);
    }
  };

  // Load timetable
  const loadTimetable = async () => {
    setTimetableLoading(true);
    try {
      const data = await fetchStaffTimetable(staffId);
      setTimetableSlots(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setTimetableLoading(false);
    }
  };

  useEffect(() => {
    loadProfileDetails();
    loadLeaveRequests();
    loadTimetable();
  }, [staffId]);

  // Handle leave submit
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError(null);
    setLeaveSuccess(null);
    if (!leaveStartDate || !leaveEndDate || !leaveReason) {
      setLeaveError('Please fill in all leave request fields.');
      return;
    }
    try {
      const res = await submitLeaveRequest(staffId, {
        leave_type: leaveType,
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        reason: leaveReason
      });
      if (res.success) {
        setLeaveSuccess('Leave request submitted successfully.');
        setLeaveStartDate('');
        setLeaveEndDate('');
        setLeaveReason('');
        setShowLeaveForm(false);
        loadLeaveRequests();
      } else {
        setLeaveError('Failed to submit leave request.');
      }
    } catch (err: any) {
      setLeaveError(err.message || 'Error occurred.');
    }
  };

  // Handle timetable slot submit
  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotClass || !newSlotSubject) {
      alert('Class and Subject are required fields.');
      return;
    }
    const newSlot: TimetableSlot = {
      dayOfWeek: newSlotDay,
      periodName: newSlotPeriod,
      startTime: newSlotStart,
      endTime: newSlotEnd,
      gradeClass: newSlotClass,
      subject: newSlotSubject,
      room: newSlotRoom || undefined
    };
    const updated = [...timetableSlots, newSlot];
    setTimetableSaving(true);
    try {
      const res = await saveStaffTimetable(staffId, updated);
      if (res.success) {
        setTimetableSlots(updated);
        setShowAddSlotModal(false);
        setNewSlotClass('');
        setNewSlotSubject('');
        setNewSlotRoom('');
      } else {
        alert('Failed to save timetable slot.');
      }
    } catch (err: any) {
      alert('Error saving timetable: ' + err.message);
    } finally {
      setTimetableSaving(false);
    }
  };

  const handleDeleteSlot = async (index: number) => {
    if (!window.confirm('Are you sure you want to remove this timetable slot?')) return;
    const updated = timetableSlots.filter((_, idx) => idx !== index);
    setTimetableSaving(true);
    try {
      const res = await saveStaffTimetable(staffId, updated);
      if (res.success) {
        setTimetableSlots(updated);
      } else {
        alert('Failed to update timetable.');
      }
    } catch (err: any) {
      alert('Error updating timetable: ' + err.message);
    } finally {
      setTimetableSaving(false);
    }
  };

  // Handle password reset forced
  const handleForcedResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (!resetNewPassword || !resetConfirmPassword) {
      setResetError('New password and confirmation are required.');
      return;
    }
    if (resetNewPassword === '123') {
      setResetError('Please choose a password different from the default "123".');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    try {
      const res = await changeStaffPassword({
        oldPassword: resetOldPassword,
        newPassword: resetNewPassword
      });
      if (res.success) {
        setResetSuccess(true);
        setTimeout(() => {
          setShowForcedReset(false);
        }, 1500);
      } else {
        setResetError('Failed to change password. Ensure old password is correct.');
      }
    } catch (err: any) {
      setResetError(err.message || 'Error occurred changing password.');
    }
  };

  // Self change password
  const handleSelfPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPwError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    try {
      const res = await changeStaffPassword({ oldPassword, newPassword });
      if (res.success) {
        setPwSuccess(true);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwError('Failed to update password. Verify current password.');
      }
    } catch (err: any) {
      setPwError(err.message || 'Error occurred.');
    }
  };

  // --- Legacy Teacher Module Functions ---
  const loadClassAttendance = async () => {
    if (!classTeacherFor || classTeacherFor.length === 0) return;
    setClassAttendanceLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const studentsRes = await fetchTeacherStudents(classTeacherFor[0]);
      const roster = Array.isArray(studentsRes) ? studentsRes : [];
      const logsRes = await fetchAttendanceLogs({ gradeClass: classTeacherFor[0], startDate: today, endDate: today });
      
      const compiled = [];
      for (const student of roster) {
        const log = logsRes.find((l: any) => l.student_id === student.id) || null;
        let pContacts = null;
        try {
          pContacts = await fetchParentContacts(student.id);
        } catch (e) {
          console.warn('Failed to load parent contacts for student', student.id, e);
        }
        compiled.push({
          ...student,
          time_in: log?.time_in || null,
          time_out: log?.time_out || null,
          status: log ? log.status : 'Absent',
          parent: pContacts
        });
      }
      setClassAttendanceList(compiled);
    } catch (err) {
      console.error('Failed to load class attendance logs', err);
    } finally {
      setClassAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === 'class-attendance') {
      loadClassAttendance();
    }
  }, [activeView]);

  const isUACE = selectedClassVal.startsWith('S.5') || selectedClassVal.startsWith('S.6');

  const filteredStudents = Array.isArray(students) ? students.filter(student => {
    if (boardingFilter === 'Hosteller') {
      return student.boardingStatus === 'Boarder' || student.boardingStatus === 'Hosteller';
    }
    if (boardingFilter === 'Day Scholar') {
      return student.boardingStatus === 'Day Scholar' || student.boardingStatus === 'Day Scholars';
    }
    return true;
  }) : [];

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

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [settings, dbClasses, dbStreams] = await Promise.all([
          fetchSettings().catch(() => ({})),
          fetchClassesFromDb().catch(() => []),
          fetchStreamsFromDb().catch(() => [])
        ]);
        const olevel = settings?.olevel_subjects ? JSON.parse(settings.olevel_subjects) : [];
        const uace = settings?.uace_subjects ? JSON.parse(settings.uace_subjects) : [];
        const fetchedSubjects = Array.from(new Set([...olevel, ...uace])) as string[];
        if (fetchedSubjects.length > 0) {
          setAllSubjects(Array.from(new Set([...fetchedSubjects, ...DEFAULT_SUBJECTS])));
        }

        const classNames = Array.isArray(dbClasses) ? dbClasses.map((c: any) => typeof c === 'string' ? c : c.name).filter(Boolean) : [];
        if (classNames.length > 0) {
          setClassList(Array.from(new Set([...classNames, ...DEFAULT_CLASSES])));
        }

        const streamNames = Array.isArray(dbStreams) ? dbStreams.map((s: any) => typeof s === 'string' ? s : s.name).filter(Boolean) : [];
        if (streamNames.length > 0) {
          setStreamList(orderStreams(Array.from(new Set([...streamNames, ...DEFAULT_STREAMS]))));
        }

        if (settings && settings.assessment_limits) {
          setAssessmentLimits(typeof settings.assessment_limits === 'string' ? JSON.parse(settings.assessment_limits) : settings.assessment_limits);
        }
      } catch (err) {
        console.error('Failed to load settings metadata:', err);
      }
    };
    loadMetadata();
  }, []);

  const loadData = async () => {
    if (!selectedClassVal || !selectedStreamVal) return;
    const combinedClass = `${selectedClassVal} ${selectedStreamVal}`;
    const currSubject = activeSubject || (selectedSubjects && selectedSubjects.length > 0 ? selectedSubjects[0] : allSubjects[0]);

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const rawRes = await fetchTeacherStudents(combinedClass).catch(() => []);
      let studentList: any[] = Array.isArray(rawRes) ? rawRes : (rawRes && Array.isArray((rawRes as any).data) ? (rawRes as any).data : []);

      // Fallback: If specific teacher class query returned 0 students, query general database
      if (!studentList || studentList.length === 0) {
        const allStudents = await fetchStudentsFromDb().catch(() => []);
        if (Array.isArray(allStudents) && allStudents.length > 0) {
          studentList = allStudents.filter((s: any) => {
            const cls = String(s.gradeClass || s.grade_class || '').toLowerCase();
            return cls.includes(selectedClassVal.toLowerCase()) && cls.includes(selectedStreamVal.toLowerCase());
          });
          if (studentList.length === 0) {
            studentList = allStudents.filter((s: any) => String(s.gradeClass || s.grade_class || '').toLowerCase().includes(selectedClassVal.toLowerCase()));
          }
        }
      }

      const marksList = currSubject ? await fetchTeacherMarks({
        gradeClass: combinedClass,
        subject: currSubject,
        term,
        year,
        paper: selectedPaper
      }).catch(() => []) : [];

      const map: Record<string, any> = {};
      if (Array.isArray(marksList)) {
        marksList.forEach((m) => { if (m && m.student_id) map[m.student_id] = m; });
      }

      studentList.forEach((s) => {
        if (s && s.id && !map[s.id]) {
          if (isUACE) {
            let defaultType: 'Principal' | 'Subsidiary' | 'General Paper' = 'Principal';
            if (currSubject === 'General Paper') defaultType = 'General Paper';
            else if (currSubject && (currSubject.toLowerCase().includes('subsidiary') || currSubject.toLowerCase().includes('ict'))) {
              defaultType = 'Subsidiary';
            }
            map[s.id] = {
              student_id: s.id,
              subject: currSubject,
              subject_type: defaultType,
              paper: selectedPaper,
              bot: null, bot_grade: null,
              mot: null, mot_grade: null,
              eot: null, eot_grade: null,
              score: null, grade: null, points: null,
              term, year, status: 'Draft'
            };
          } else {
            map[s.id] = {
              student_id: s.id,
              subject: currSubject,
              integration1: null,
              integration2: null,
              integration3: null,
              exam_score: null,
              term, year, status: 'Draft'
            };
          }
        }
      });
      setStudents(studentList);
      setMarksMap(map);
    } catch (err: any) {
      console.warn('Non-fatal error loading worksheet student data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassVal && selectedStreamVal) {
      loadData();
    }
  }, [selectedSubjects, activeSubject, selectedClassVal, selectedStreamVal, term, year, selectedPaper]);

  const handleCellChange = (studentId: string, field: string, val: string) => {
    if (val === '') {
      setMarksMap(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: null
        }
      }));
      return;
    }

    let numVal: number | null = Number(val);
    if (isNaN(numVal)) return;

    // Validation according to assessment limits (0-3 for Integration, 0-100 for Exam/UACE)
    const limits = isUACE ? assessmentLimits.uace : assessmentLimits.olevel;
    if (isUACE) {
      const maxVal = limits?.score_max ?? 100;
      if (numVal < 0 || numVal > maxVal) return;
    } else {
      if (field.startsWith('integration')) {
        const maxVal = limits?.integration_max ?? 3;
        if (numVal < 0 || numVal > maxVal) return;
      }
      if (field === 'exam_score') {
        const maxVal = limits?.exam_max ?? 100;
        if (numVal < 0 || numVal > maxVal) return;
      }
    }

    setMarksMap(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: numVal
      }
    }));
  };

  const handleMarksKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colField: string,
    totalRows: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = rowIndex + 1 < totalRows ? rowIndex + 1 : 0;
      const nextEl = document.getElementById(`mark-input-${nextRow}-${colField}`);
      if (nextEl) {
        nextEl.focus();
        (nextEl as HTMLInputElement).select?.();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = rowIndex - 1 >= 0 ? rowIndex - 1 : totalRows - 1;
      const prevEl = document.getElementById(`mark-input-${prevRow}-${colField}`);
      if (prevEl) {
        prevEl.focus();
        (prevEl as HTMLInputElement).select?.();
      }
    }
  };

  const handleSaveMarks = async (submitFlag = false) => {
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const records = Object.values(marksMap).map((r: any) => ({
        ...r,
        status: submitFlag ? 'Approved' : 'Draft',
        teacher_id: staffId
      }));

      const fullClass = selectedStreamVal ? `${selectedClassVal} ${selectedStreamVal}` : selectedClassVal;
      const payload = {
        gradeClass: fullClass,
        subject: activeSubject,
        term: term.startsWith('Term') ? term : `Term ${term}`,
        year: Number(year),
        teacherId: staffId,
        marksList: records,
        paper: selectedPaper,
        status: submitFlag ? 'Approved' : 'Draft',
        expectedCount: students.length
      };

      let res;
      if (submitFlag) {
        res = await submitTeacherMarks(payload);
      } else {
        res = await saveTeacherMarks(payload);
      }

      if (res.success) {
        setSuccessMessage(submitFlag ? 'Marks sheets finalized and published successfully!' : 'Draft saved successfully.');
        loadData();
      } else {
        setError('Failed to write marksheets to database.');
      }
    } catch (err: any) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const downloadExcelTemplate = () => {
    if (!students.length) return;
    const dataRows = students.map((s, index) => {
      if (isUACE) {
        return {
          "Row #": index + 1,
          "Student ID": s.id,
          "Admin Number": s.adminNo,
          "Student Name": s.name,
          "Beginning Of Term (BOT)": marksMap[s.id]?.bot ?? '',
          "Mid Of Term (MOT)": marksMap[s.id]?.mot ?? '',
          "End Of Term (EOT)": marksMap[s.id]?.eot ?? ''
        };
      } else {
        return {
          "Row #": index + 1,
          "Student ID": s.id,
          "Admin Number": s.adminNo,
          "Student Name": s.name,
          "Activity of Integration 1 (Max 3)": marksMap[s.id]?.integration1 ?? '',
          "Activity of Integration 2 (Max 3)": marksMap[s.id]?.integration2 ?? '',
          "Activity of Integration 3 (Max 3)": marksMap[s.id]?.integration3 ?? '',
          "End of Term Exam (Max 100)": marksMap[s.id]?.exam_score ?? ''
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MarksSheet");
    XLSX.writeFile(workbook, `${activeSubject || 'Marks'}_${selectedClassVal}_${selectedStreamVal}_Term_${term}.xlsx`);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as any[][];
        if (!sheetData.length) return;

        // Parse row header
        let idIdx = 1, botIdx = 4, motIdx = 5, eotIdx = 6;
        let ai1Idx = 4, ai2Idx = 5, ai3Idx = 6, examIdx = 7;

        const uploadErrors: string[] = [];
        const newMap = { ...marksMap };

        // Start from row 1
        for (let r = 1; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || !row[idIdx]) continue;
          const sId = String(row[idIdx]).trim();
          if (newMap[sId]) {
            if (isUACE) {
              newMap[sId].bot = row[botIdx] !== undefined && row[botIdx] !== '' ? Number(row[botIdx]) : null;
              newMap[sId].mot = row[motIdx] !== undefined && row[motIdx] !== '' ? Number(row[motIdx]) : null;
              newMap[sId].eot = row[eotIdx] !== undefined && row[eotIdx] !== '' ? Number(row[eotIdx]) : null;
            } else {
              newMap[sId].integration1 = row[ai1Idx] !== undefined && row[ai1Idx] !== '' ? Number(row[ai1Idx]) : null;
              newMap[sId].integration2 = row[ai2Idx] !== undefined && row[ai2Idx] !== '' ? Number(row[ai2Idx]) : null;
              newMap[sId].integration3 = row[ai3Idx] !== undefined && row[ai3Idx] !== '' ? Number(row[ai3Idx]) : null;
              newMap[sId].exam_score = row[examIdx] !== undefined && row[examIdx] !== '' ? Number(row[examIdx]) : null;
            }
          }
        }
        setMarksMap(newMap);
        setSuccessMessage('Excel templates parsed and updated successfully!');
      } catch (err: any) {
        setError('Error uploading template: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const getDayList = () => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const getPeriods = () => ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7', 'Period 8'];

  // Render Forced Password Reset Modal Check
  if (showForcedReset) {
    return (
      <div className="relative min-h-screen w-full bg-[#05070f] flex items-center justify-center p-4 font-sans select-none antialiased overflow-hidden">
        <ParticleBackground />
        <div className="z-10 w-full max-w-md bg-[#0a0f24]/90 border border-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl shadow-blue-500/10">
          <div className="text-center space-y-3 mb-6">
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight">Security Check</h2>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
              You are using a default system password. You MUST choose a new secure password before you can access the staff portal.
            </p>
          </div>

          {resetSuccess ? (
            <div className="bg-emerald-950 border border-emerald-900/50 p-4 rounded-xl text-center text-emerald-400 text-xs font-bold uppercase tracking-wider space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 animate-bounce" />
              <p>Password changed successfully!</p>
              <p className="text-[10px] text-slate-500">Redirecting to portal...</p>
            </div>
          ) : (
            <form onSubmit={handleForcedResetSubmit} className="space-y-4">
              {resetError && (
                <div className="bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg flex items-start gap-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <p>{resetError}</p>
                </div>
              )}

              <div className="space-y-1 relative">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Current Password</label>
                <div className="relative">
                  <input
                    type={showOldPass ? 'text' : 'password'}
                    value={resetOldPassword}
                    onChange={e => setResetOldPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-400"
                  >
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1 relative">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">New Secure Password</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={e => setResetNewPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="Min 6 characters recommended"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-400"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1 relative">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={resetConfirmPassword}
                    onChange={e => setResetConfirmPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    placeholder="Verify new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-400"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-lg shadow-indigo-500/20"
              >
                Change Password &amp; Login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070f] text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Navbar */}
      <header className="bg-slate-950 border-b border-slate-850 shrink-0 px-4 py-4 md:px-6 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1 bg-slate-900/50 border border-slate-800 rounded-lg shadow-inner">
            <SchoolLogo className="w-10 h-10" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-100 uppercase tracking-tight">Staff Portal</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">St. Paul Secondary School</p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-200 block">{staffName.toUpperCase()}</span>
            <span className="text-[8px] text-indigo-400 font-mono font-bold tracking-wider uppercase">
              {staffUsername ? `${category.toUpperCase()} STAFF (${staffUsername})` : `${category.toUpperCase()} STAFF`}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer rounded-md hover:bg-slate-805 bg-slate-850"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Navigation subheader */}
      <div className="bg-slate-950/70 border-b border-slate-850 px-4 md:px-6 py-1.5 flex gap-4 shrink-0 backdrop-blur-md no-print overflow-x-auto">
        <button
          onClick={() => setActiveView('dashboard')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
            activeView === 'dashboard' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
          }`}
        >
          My Profile Dashboard
        </button>

        {category === 'Teaching' && (
          <>
            <button
              onClick={() => setActiveView('marks')}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
                activeView === 'marks' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
              }`}
            >
              Marks Entry
            </button>
            {classTeacherFor && classTeacherFor.length > 0 && (
              <button
                onClick={() => setActiveView('class-attendance')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
                  activeView === 'class-attendance' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
                }`}
              >
                Class Attendance ({classTeacherFor[0]})
              </button>
            )}
            <button
              onClick={() => setActiveView('gate-attendance')}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
                activeView === 'gate-attendance' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
              }`}
            >
              Gate Workspace
            </button>
          </>
        )}

        <button
          onClick={() => setActiveView('timetable')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
            activeView === 'timetable' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
          }`}
        >
          My Timetable
        </button>

        <button
          onClick={() => setActiveView('leave-requests')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
            activeView === 'leave-requests' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
          }`}
        >
          Leave Requests
        </button>

        <button
          onClick={() => setActiveView('change-password')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer shrink-0 ${
            activeView === 'change-password' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-350'
          }`}
        >
          Change Password
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* DASHBOARD VIEW */}
        {activeView === 'dashboard' && (
          <div className="space-y-6 animate-fade-in text-slate-100">
            {/* Welcome Frame Banner */}
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              
              {/* Photo frame */}
              <div className="w-24 h-32 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-lg relative">
                {photo ? (
                  <img src={photo} alt={staffName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-slate-700" />
                )}
              </div>

              <div className="space-y-2 text-center md:text-left flex-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-full">
                  <Smile className="w-3.5 h-3.5" /> Staff Profile
                </div>
                <h2 className="text-xl md:text-2xl font-black text-slate-100 tracking-tight">
                  Welcome, {(gender || '').toLowerCase() === 'male' ? 'Mr.' : (gender || '').toLowerCase() === 'female' ? 'Ms.' : 'Mr./Ms.'} {staffName}.
                </h2>
                <p className="text-sm text-indigo-300 font-bold">Category: {category} Staff ({position})</p>
              </div>
            </div>

            {/* Profile fields card grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Detail fields info */}
              <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl md:col-span-2 space-y-6">
                <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 border-b border-slate-850 pb-2 flex items-center gap-2">
                  <Award className="w-4 h-4" /> Personal Profile Record
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium text-slate-300">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">STAFF ID</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffId}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">EMPLOYEE NO</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.employee_number || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">NATIONAL ID NUMBER</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.national_id || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">PHONE NUMBER</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.phone || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">EMAIL ADDRESS</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg break-all">{staffProfile?.email || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">DEPARTMENT / ROLE</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.department || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">EMPLOYMENT STATUS</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.employment_status || 'Permanent'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">DATE APPOINTED</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
                      {staffProfile?.date_appointed ? new Date(staffProfile.date_appointed).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">QUALIFICATION</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.qualification || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-550 block font-mono">RESIDENTIAL DISTRICT</span>
                    <p className="text-slate-200 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">{staffProfile?.district || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* QR ID card scanner details card */}
              <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl space-y-6 flex flex-col justify-between">
                <div className="space-y-4 flex flex-col items-stretch">
                  <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400 border-b border-slate-850 pb-2 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-400" /> Digital Credentials
                  </h3>
                  
                  {/* Premium ID Card Preview Container - centered horizontally and vertically, responsive */}
                  <div className="flex flex-col items-center justify-center p-3 bg-slate-900/30 border border-slate-850 rounded-2xl min-h-[260px] w-full relative gap-4">
                    <div className="w-[90%] flex flex-col gap-6 items-center justify-center">
                      <div className="flex flex-col items-center gap-1.5 w-full">
                        <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Front Side</span>
                        <StaffCard 
                          staff={{
                            id: staffId,
                            name: staffName,
                            username: staffUsername || '',
                            category: category,
                            position: position || staffProfile?.position || 'Staff Member',
                            department: staffProfile?.department || 'General',
                            employeeNumber: staffProfile?.employee_number || '',
                            gender: gender || staffProfile?.gender || '',
                            photo: staffProfile?.photo || photo || '',
                            signature: staffProfile?.signature || '',
                            activeCard: staffProfile?.activeCard || null,
                            status: staffProfile?.status || 'Active',
                            forcePasswordChange: forcePasswordChange,
                            subjects: assignedSubjects,
                            classes: assignedClasses,
                            employmentStatus: staffProfile?.employment_status || 'Permanent'
                          }} 
                          side="front"
                          logoBase64={schoolLogo} 
                          authorizedSignatureBase64={authorizedSignature}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1.5 w-full">
                        <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">Back Side</span>
                        <StaffCard 
                          staff={{
                            id: staffId,
                            name: staffName,
                            username: staffUsername || '',
                            category: category,
                            position: position || staffProfile?.position || 'Staff Member',
                            department: staffProfile?.department || 'General',
                            employeeNumber: staffProfile?.employee_number || '',
                            gender: gender || staffProfile?.gender || '',
                            photo: staffProfile?.photo || photo || '',
                            signature: staffProfile?.signature || '',
                            activeCard: staffProfile?.activeCard || null,
                            status: staffProfile?.status || 'Active',
                            forcePasswordChange: forcePasswordChange,
                            subjects: assignedSubjects,
                            classes: assignedClasses,
                            employmentStatus: staffProfile?.employment_status || 'Permanent'
                          }} 
                          side="back"
                          logoBase64={schoolLogo} 
                          authorizedSignatureBase64={authorizedSignature}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <a
                  href={window.location.origin + '/verify/' + (staffProfile?.id || '')}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-2.5 bg-slate-900 hover:bg-slate-850 text-indigo-400 border border-indigo-500/25 rounded-xl text-xs font-bold uppercase tracking-wider block transition"
                >
                  View Verification Page
                </a>

                <button
                  onClick={async () => {
                    try {
                      const doc = await generateStaffIdCardsPdf({
                        staffMembers: [{
                          id: staffId,
                          firstName: staffName.split(' ')[0] || '',
                          middleName: staffName.split(' ').slice(1, -1).join(' ') || '',
                          lastName: staffName.split(' ').slice(-1)[0] || '',
                          name: staffName,
                          username: staffUsername || '',
                          category: category,
                          position: position || staffProfile?.position || 'Staff Member',
                          department: staffProfile?.department || 'General',
                          employeeNumber: staffProfile?.employee_number || '',
                          gender: gender || staffProfile?.gender || '',
                          photo: staffProfile?.photo || photo || '',
                          signature: staffProfile?.signature || '',
                          activeCard: staffProfile?.activeCard || null,
                          status: staffProfile?.status || 'Active',
                          forcePasswordChange: forcePasswordChange,
                          subjects: assignedSubjects,
                          classes: assignedClasses,
                          employmentStatus: staffProfile?.employment_status || 'Permanent'
                        }],
                        schoolLogoBase64: schoolLogo,
                        authorizedSignatureBase64: authorizedSignature,
                        printSide: 'front'
                      });
                      doc.save(`staff_id_card_${staffId}.pdf`);
                    } catch (e: any) {
                      alert('Failed to download PDF card: ' + e.message);
                    }
                  }}
                  className="w-full text-center py-2.5 mt-2 bg-[#003E7E] hover:bg-indigo-650 text-white border border-[#EAF5FF]/10 rounded-xl text-xs font-bold uppercase tracking-wider block transition"
                >
                  Download PDF Card
                </button>

                <button
                  onClick={async () => {
                    try {
                      const dataUrl = await generateStaffIdCardPng({
                        id: staffId,
                        firstName: staffName.split(' ')[0] || '',
                        middleName: staffName.split(' ').slice(1, -1).join(' ') || '',
                        lastName: staffName.split(' ').slice(-1)[0] || '',
                        name: staffName,
                        username: staffUsername || '',
                        category: category,
                        position: position || staffProfile?.position || 'Staff Member',
                        department: staffProfile?.department || 'General',
                        employeeNumber: staffProfile?.employee_number || '',
                        gender: gender || staffProfile?.gender || '',
                        photo: staffProfile?.photo || photo || '',
                        signature: staffProfile?.signature || '',
                        activeCard: staffProfile?.activeCard || null,
                        status: staffProfile?.status || 'Active',
                        forcePasswordChange: forcePasswordChange,
                        subjects: assignedSubjects,
                        classes: assignedClasses,
                        employmentStatus: staffProfile?.employment_status || 'Permanent'
                      }, schoolLogo, authorizedSignature);
                      
                      const link = document.createElement('a');
                      link.href = dataUrl;
                      link.download = `staff_id_${staffId}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } catch (e: any) {
                      alert('Failed to download PNG card: ' + e.message);
                    }
                  }}
                  className="w-full text-center py-2.5 mt-2 bg-[#0B6CB8] hover:bg-[#003E7E] text-white border border-[#EAF5FF]/10 rounded-xl text-xs font-bold uppercase tracking-wider block transition"
                >
                  Download PNG Card
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MARKS ENTRY WORKVIEW */}
        {activeView === 'marks' && category === 'Teaching' && (
          <div className="space-y-6 animate-fade-in text-slate-100 no-print">
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2 border-b border-slate-850 pb-2">
                <BookOpen className="w-5 h-5 text-indigo-400" /> Subject Marks Entry Worksheet
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Term</label>
                  <select value={term} onChange={e => setTerm(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200">
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Class / Stream</label>
                  <div className="flex gap-2">
                    <select value={selectedClassVal} onChange={e => setSelectedClassVal(e.target.value)} className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200">
                      <option value="">Class</option>
                      {classList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={selectedStreamVal} onChange={e => setSelectedStreamVal(e.target.value)} className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200">
                      <option value="">Stream</option>
                      {streamList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1 relative">
                  <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Active Subject</label>
                  <select value={activeSubject} onChange={e => { setActiveSubject(e.target.value); setSelectedSubjects([e.target.value]); }} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200">
                    <option value="">Select Subject</option>
                    {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {isUACE && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Paper Number</label>
                    <select value={selectedPaper} onChange={e => setSelectedPaper(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200">
                      <option value={1}>Paper 1</option>
                      <option value={2}>Paper 2</option>
                      <option value={3}>Paper 3</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className={error.includes('Cannot reach') || error.includes('network connectivity') ? "bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-xl flex items-center justify-between text-amber-300 text-xs font-medium" : "bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-start gap-3 text-rose-300 text-xs"}>
                <div className="flex items-center gap-2.5">
                  <AlertCircle className={`w-4 h-4 shrink-0 ${error.includes('Cannot reach') ? 'text-amber-400' : 'text-rose-400'}`} />
                  <div>
                    <p className="font-bold">{error.includes('Cannot reach') ? 'Offline Mode Active' : 'Error occurred'}</p>
                    <p className="mt-0.5 text-[11px] opacity-90">{error.includes('Cannot reach') ? 'Server unreachable. Operating seamlessly on local offline worksheet data.' : error}</p>
                  </div>
                </div>
                {error.includes('Cannot reach') && (
                  <button onClick={() => setError(null)} className="px-2.5 py-1 bg-amber-900/50 hover:bg-amber-800/60 text-amber-200 rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer">Dismiss</button>
                )}
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-950/45 border border-emerald-900/60 p-4 rounded-xl flex items-start gap-3 text-emerald-300 text-xs">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="font-bold">Worksheet Sync Successful</p>
                  <p className="mt-0.5">{successMessage}</p>
                </div>
              </div>
            )}

            {loading ? (
              <div className="bg-slate-950/45 border border-slate-850 rounded-2xl py-16 text-center text-indigo-400 font-bold tracking-wider text-xs flex flex-col items-center justify-center gap-3 animate-pulse">
                <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                <span>Loading students for {selectedClassVal} Stream {selectedStreamVal}...</span>
              </div>
            ) : selectedClassVal && selectedStreamVal && activeSubject ? (
              filteredStudents.length > 0 ? (
                <div className="bg-slate-950/45 border border-slate-850 p-6 rounded-2xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-850">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">
                        Student Marks Table - {activeSubject} ({selectedClassVal} {selectedStreamVal})
                      </h3>
                      <p className="text-[10px] text-slate-500 font-mono">TERM: {term} | YEAR: {year}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={downloadExcelTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-200 hover:border-slate-700 rounded-lg text-xs font-bold uppercase transition cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" /> Download Template
                      </button>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 text-indigo-400 hover:text-indigo-350 hover:border-slate-700 rounded-lg text-xs font-bold uppercase transition cursor-pointer">
                        <Upload className="w-3.5 h-3.5" /> Upload Excel
                        <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                      </label>
                    </div>
                  </div>

                  {/* Mark Entry Guidance Legend */}
                  <div className="bg-indigo-950/40 border border-indigo-500/30 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
                    <div className="flex items-center gap-2.5 text-indigo-200 font-bold">
                      <span className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse shadow-sm shadow-indigo-400"></span>
                      <span className="text-xs uppercase tracking-wider font-extrabold text-indigo-300">Enter marks in the highlighted boxes:</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-slate-200">
                      <span className="bg-slate-900 border border-indigo-500/50 px-3 py-1 rounded-lg shadow-sm">
                        <strong className="text-indigo-400 font-sans uppercase text-[10px] tracking-wider mr-1.5">Integration:</strong> 0 – 3
                      </span>
                      <span className="bg-slate-900 border border-indigo-500/50 px-3 py-1 rounded-lg shadow-sm">
                        <strong className="text-indigo-400 font-sans uppercase text-[10px] tracking-wider mr-1.5">Exam:</strong> 0 – 100
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-[550px] border border-slate-850 rounded-xl">
                    <table className="w-full text-left text-xs leading-normal">
                      <thead>
                        <tr className="bg-slate-900/80 text-slate-400 font-bold uppercase text-[10px] font-mono border-b border-slate-850 sticky top-0 z-10 backdrop-blur-md">
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4">Admin No</th>
                          {isUACE ? (
                            <>
                              <th className="py-3 px-4 text-center">BOT Score (0-100)</th>
                              <th className="py-3 px-4 text-center">MOT Score (0-100)</th>
                              <th className="py-3 px-4 text-center">EOT Score (0-100)</th>
                            </>
                          ) : (
                            <>
                              <th className="py-3 px-4 text-center">Integration 1 (0–3)</th>
                              <th className="py-3 px-4 text-center">Integration 2 (0–3)</th>
                              <th className="py-3 px-4 text-center">Integration 3 (0–3)</th>
                              <th className="py-3 px-4 text-center">Exam Score (0–100)</th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50 bg-slate-950">
                        {filteredStudents.map((st, idx) => {
                          const rec = marksMap[st.id] || {};
                          return (
                            <tr key={st.id} className="hover:bg-indigo-950/20 transition-colors">
                              <td className="py-3 px-4 text-slate-200 font-bold uppercase tracking-tight">
                                {st.name || st.full_name || st.studentName || st.student_name || 'STUDENT NAME'}
                              </td>
                              <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                                {st.adminNo || st.admin_no || st.student_id || st.id || 'N/A'}
                              </td>
                              {isUACE ? (
                                <>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-bot`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-100"
                                      value={rec.bot ?? ''}
                                      onChange={e => handleCellChange(st.id, 'bot', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'bot', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-mot`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-100"
                                      value={rec.mot ?? ''}
                                      onChange={e => handleCellChange(st.id, 'mot', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'mot', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-eot`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-100"
                                      value={rec.eot ?? ''}
                                      onChange={e => handleCellChange(st.id, 'eot', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'eot', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-integration1`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-3"
                                      value={rec.integration1 ?? ''}
                                      onChange={e => handleCellChange(st.id, 'integration1', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'integration1', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-integration2`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-3"
                                      value={rec.integration2 ?? ''}
                                      onChange={e => handleCellChange(st.id, 'integration2', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'integration2', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-integration3`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-3"
                                      value={rec.integration3 ?? ''}
                                      onChange={e => handleCellChange(st.id, 'integration3', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'integration3', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      id={`mark-input-${idx}-exam_score`}
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0-100"
                                      value={rec.exam_score ?? ''}
                                      onChange={e => handleCellChange(st.id, 'exam_score', e.target.value)}
                                      onKeyDown={e => handleMarksKeyDown(e, idx, 'exam_score', filteredStudents.length)}
                                      className="w-20 md:w-24 h-11 bg-[#0c1329] border-2 border-indigo-500/60 hover:border-indigo-400 hover:bg-[#131d3d] focus:bg-[#162248] focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/30 focus:shadow-xl focus:shadow-indigo-500/25 focus:outline-none rounded-xl px-2 text-base font-bold font-mono text-slate-100 text-center transition-all cursor-text placeholder:text-slate-600 placeholder:font-normal placeholder:text-xs tracking-wider shadow-inner select-all"
                                    />
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-850">
                    <button
                      onClick={() => handleSaveMarks(false)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-bold uppercase transition cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Draft
                    </button>
                    <button
                      onClick={() => handleSaveMarks(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Publish Marks Sheets
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/45 border border-slate-850 rounded-2xl py-16 text-center text-amber-400 font-bold uppercase tracking-wider text-xs space-y-1">
                  <p>No students found in {selectedClassVal} Stream {selectedStreamVal}.</p>
                  <p className="text-[10px] text-slate-500 font-normal">Please check class stream assignments or select another stream.</p>
                </div>
              )
            ) : (
              <div className="bg-slate-950/45 border border-slate-850 rounded-2xl py-16 text-center text-slate-500 uppercase font-black tracking-wider text-xs">
                Please select class, stream and active subject above.
              </div>
            )}
          </div>
        )}

        {/* CLASS ATTENDANCE WORKVIEW */}
        {activeView === 'class-attendance' && category === 'Teaching' && (
          <div className="space-y-6 animate-fade-in text-slate-100">
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex items-center justify-between no-print">
              <div>
                <h2 className="text-base font-black text-indigo-400 uppercase tracking-tight">Class Stream Attendance Dashboard</h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Monitoring: Class stream {classTeacherFor[0]}</p>
              </div>
              <button
                onClick={loadClassAttendance}
                disabled={classAttendanceLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${classAttendanceLoading ? 'animate-spin' : ''}`} /> Sync logs
              </button>
            </div>

            {classAttendanceLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing class attendance logs...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block font-mono">Class Roster</span>
                    <span className="text-xl font-black text-slate-200 block mt-1">{classAttendanceList.length}</span>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block font-mono">Present Today</span>
                    <span className="text-xl font-black text-emerald-400 block mt-1">
                      {classAttendanceList.filter(s => s.status === 'Present' || s.status === 'Late' || s.status === 'Very Late').length}
                    </span>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block font-mono">Late Arrivals</span>
                    <span className="text-xl font-black text-amber-500 block mt-1 font-mono">
                      {classAttendanceList.filter(s => s.status === 'Late' || s.status === 'Very Late').length}
                    </span>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider block font-mono">Absentees</span>
                    <span className="text-xl font-black text-rose-500 block mt-1">{classAttendanceList.filter(s => s.status === 'Absent').length}</span>
                  </div>
                </div>

                <div className="bg-slate-950/45 border border-slate-850 rounded-xl p-4 md:p-5">
                  <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-4">Roster Scans &amp; Parent Contact Links</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs leading-normal">
                      <thead>
                        <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-3">Admin No</th>
                          <th className="py-2.5 px-3">Gate In</th>
                          <th className="py-2.5 px-3">Gate Out</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Parent Details</th>
                          <th className="py-2.5 px-3 text-center">Alert Parent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50">
                        {classAttendanceList.map((st: any, idx: number) => {
                          const parentPhone = st.parent?.father_phone || st.parent?.mother_phone || st.parent?.guardian_phone || '';
                          const parentName = st.parent?.father_name || st.parent?.mother_name || st.parent?.guardian_name || 'Parent';
                          
                          let alertMsg = '';
                          if (st.status === 'Absent') {
                            alertMsg = `Dear Parent, your child ${st.name} has not checked in at the school gate today. Please verify if they are at home. Thank you. St Paul Secondary School`;
                          } else if (st.status === 'Late' || st.status === 'Very Late') {
                            alertMsg = `Dear Parent, your child ${st.name} arrived late at school today at ${st.time_in}. Thank you. St Paul Secondary School`;
                          }
                          
                          const waLink = `https://wa.me/${parentPhone.replace(/\D/g, '')}?text=${encodeURIComponent(alertMsg)}`;
                          const smsLink = `sms:${parentPhone}?body=${encodeURIComponent(alertMsg)}`;

                          return (
                            <tr key={idx} className="hover:bg-slate-900/40 transition font-mono">
                              <td className="py-3 px-3 text-slate-200 font-bold font-sans uppercase">{st.name}</td>
                              <td className="py-3 px-3 text-slate-450">{st.adminNo}</td>
                              <td className="py-3 px-3 text-slate-350">{st.time_in || '--:--'}</td>
                              <td className="py-3 px-3 text-slate-350">{st.time_out || '--:--'}</td>
                              <td className="py-3 px-3">
                                <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                                  st.status === 'Present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                                  st.status === 'Late' || st.status === 'Very Late' ? 'bg-amber-950 text-amber-400 border border-amber-900/30' :
                                  'bg-rose-950 text-rose-400 border border-rose-900/30'
                                }`}>
                                  {st.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-400 font-sans text-[11px]">
                                {st.parent ? (
                                  <div>
                                    <p className="font-bold text-slate-300">{parentName}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">{parentPhone}</p>
                                  </div>
                                ) : (
                                  <span className="text-slate-550">Not Registered</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {st.parent && parentPhone && (st.status === 'Absent' || st.status === 'Late' || st.status === 'Very Late') ? (
                                  <div className="flex justify-center gap-1.5 font-sans">
                                    <a href={waLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 hover:text-emerald-300 border border-emerald-900/60 rounded text-[9px] font-black uppercase tracking-wider transition cursor-pointer font-bold animate-pulse">
                                      <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                                    </a>
                                    <a href={smsLink} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-950 hover:bg-blue-900 text-blue-400 hover:text-blue-300 border border-blue-900/60 rounded text-[9px] font-black uppercase tracking-wider transition cursor-pointer font-bold">
                                      <Phone className="w-3.5 h-3.5" /> SMS
                                    </a>
                                  </div>
                                ) : (
                                  <span className="text-slate-650 font-sans font-bold">--</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'gate-attendance' && category === 'Teaching' && (
          <div className="animate-fade-in text-slate-100">
            <AttendanceModule />
          </div>
        )}

        {/* TIMETABLE VIEW */}
        {activeView === 'timetable' && (
          <div className="space-y-6 animate-fade-in text-slate-100">
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex items-center justify-between no-print">
              <div>
                <h2 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-400" /> My Duty &amp; Lesson Timetable
                </h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Manage classes, streams, and period schedules</p>
              </div>
              <button
                onClick={() => setShowAddSlotModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                + Add Class Slot
              </button>
            </div>

            {timetableLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing timetable slots...</p>
              </div>
            ) : (
              <div className="bg-slate-950/45 border border-slate-850 p-6 rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs leading-normal">
                    <thead>
                      <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                        <th className="py-2.5 px-3">Day of Week</th>
                        <th className="py-2.5 px-3">Period</th>
                        <th className="py-2.5 px-3">Time Range</th>
                        <th className="py-2.5 px-3">Class/Stream</th>
                        <th className="py-2.5 px-3">Subject / Duty</th>
                        <th className="py-2.5 px-3">Room / Venue</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {timetableSlots.map((slot, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40 transition font-mono">
                          <td className="py-3.5 px-3 text-slate-200 font-bold font-sans uppercase">{slot.dayOfWeek}</td>
                          <td className="py-3.5 px-3 text-slate-350">{slot.periodName}</td>
                          <td className="py-3.5 px-3 text-indigo-400 font-bold">{slot.startTime} - {slot.endTime}</td>
                          <td className="py-3.5 px-3 text-slate-200 font-sans uppercase">{slot.gradeClass}</td>
                          <td className="py-3.5 px-3 text-slate-200 font-sans uppercase">{slot.subject}</td>
                          <td className="py-3.5 px-3 text-slate-450">{slot.room || 'N/A'}</td>
                          <td className="py-3.5 px-3 text-center">
                            <button
                              onClick={() => handleDeleteSlot(idx)}
                              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-950 text-rose-400 border border-rose-900/30 rounded text-[9px] font-bold uppercase transition"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                      {timetableSlots.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 font-bold uppercase">No slots scheduled in timetable. Click "Add Class Slot" above to write assignments.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Timetable slot Modal */}
            {showAddSlotModal && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print">
                <div className="w-full max-w-md bg-[#0a0f24] border border-white/10 p-6 rounded-2xl shadow-2xl relative">
                  <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider mb-4">Add Timetable Assignment</h3>
                  
                  <form onSubmit={handleAddSlot} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Day of Week</label>
                        <select value={newSlotDay} onChange={e => setNewSlotDay(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200">
                          {getDayList().map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Period</label>
                        <select value={newSlotPeriod} onChange={e => setNewSlotPeriod(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200">
                          {getPeriods().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Start Time</label>
                        <input type="time" value={newSlotStart} onChange={e => setNewSlotStart(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" required />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">End Time</label>
                        <input type="time" value={newSlotEnd} onChange={e => setNewSlotEnd(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" required />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Class stream (e.g. S.1 A)</label>
                      <input type="text" value={newSlotClass} onChange={e => setNewSlotClass(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" placeholder="e.g. S.3 B" required />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Subject / Duty name</label>
                      <input type="text" value={newSlotSubject} onChange={e => setNewSlotSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" placeholder="e.g. Mathematics" required />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Room / Location (Optional)</label>
                      <input type="text" value={newSlotRoom} onChange={e => setNewSlotRoom(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200" placeholder="e.g. Room 4" />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button type="button" onClick={() => setShowAddSlotModal(false)} className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-xl text-xs font-bold uppercase transition">
                        Cancel
                      </button>
                      <button type="submit" disabled={timetableSaving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition">
                        Save slot
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEAVE REQUESTS VIEW */}
        {activeView === 'leave-requests' && (
          <div className="space-y-6 animate-fade-in text-slate-100">
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex items-center justify-between no-print">
              <div>
                <h2 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-400" /> Staff Leave Registry
                </h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Submit and review leave of absence requests</p>
              </div>
              <button
                onClick={() => setShowLeaveForm(!showLeaveForm)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                {showLeaveForm ? 'View Leave Log' : 'Request Leave'}
              </button>
            </div>

            {leaveError && (
              <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-start gap-3 text-rose-300 text-xs">
                <AlertCircle className="w-5 h-5 text-rose-450 shrink-0" />
                <p>{leaveError}</p>
              </div>
            )}

            {leaveSuccess && (
              <div className="bg-emerald-950/45 border border-emerald-900/60 p-4 rounded-xl flex items-start gap-3 text-emerald-300 text-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-450 shrink-0" />
                <p>{leaveSuccess}</p>
              </div>
            )}

            {showLeaveForm ? (
              <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl max-w-xl mx-auto shadow-xl">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-4 border-b border-slate-850 pb-2">
                  New Leave Request Form
                </h3>
                <form onSubmit={handleLeaveSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Leave Type</label>
                    <select value={leaveType} onChange={e => setLeaveType(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Maternity Leave">Maternity Leave</option>
                      <option value="Paternity Leave">Paternity Leave</option>
                      <option value="Study Leave">Study Leave</option>
                      <option value="Compassionate Leave">Compassionate Leave</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Start Date</label>
                      <input type="date" value={leaveStartDate} onChange={e => setLeaveStartDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">End Date</label>
                      <input type="date" value={leaveEndDate} onChange={e => setLeaveEndDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Detailed Reason</label>
                    <textarea rows={4} value={leaveReason} onChange={e => setLeaveReason(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="Please state reasons for leave..." required />
                  </div>

                  <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-indigo-500/20 cursor-pointer">
                    Submit Leave Request
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-slate-950/45 border border-slate-850 p-6 rounded-2xl">
                {leaveLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing leave history...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs leading-normal">
                      <thead>
                        <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                          <th className="py-2.5 px-3">Date Filed</th>
                          <th className="py-2.5 px-3">Leave Type</th>
                          <th className="py-2.5 px-3">Duration (Start - End)</th>
                          <th className="py-2.5 px-3">Reason</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50">
                        {leaveRequests.map((lr, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40 transition font-mono">
                            <td className="py-3.5 px-3 text-slate-350">{lr.createdAt ? new Date(lr.createdAt).toLocaleDateString() : 'N/A'}</td>
                            <td className="py-3.5 px-3 text-slate-200 font-sans font-bold uppercase">{lr.leave_type}</td>
                            <td className="py-3.5 px-3 text-indigo-450 font-bold">{new Date(lr.start_date).toLocaleDateString()} - {new Date(lr.end_date).toLocaleDateString()}</td>
                            <td className="py-3.5 px-3 text-slate-300 font-sans max-w-xs truncate" title={lr.reason}>{lr.reason}</td>
                            <td className="py-3.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border ${
                                lr.status === 'Approved' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/30' :
                                lr.status === 'Rejected' ? 'bg-rose-950 text-rose-400 border-rose-900/30' :
                                'bg-slate-900 text-slate-450 border-slate-850'
                              }`}>
                                {lr.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-slate-450 font-sans italic">{lr.remarks || 'No remarks.'}</td>
                          </tr>
                        ))}
                        {leaveRequests.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500 font-bold uppercase">No leave request records found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CHANGE PASSWORD VIEW */}
        {activeView === 'change-password' && (
          <div className="space-y-6 animate-fade-in text-slate-100">
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl max-w-md mx-auto">
              <h2 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2 border-b border-slate-850 pb-3 mb-4">
                <Lock className="w-5 h-5 text-indigo-400" /> Change Security Password
              </h2>

              {pwError && (
                <div className="bg-rose-950/40 border border-rose-900/60 p-3 rounded-lg text-rose-350 text-xs flex items-start gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-455" />
                  <p>{pwError}</p>
                </div>
              )}

              {pwSuccess && (
                <div className="bg-emerald-950/45 border border-emerald-900/60 p-3 rounded-lg text-emerald-350 text-xs flex items-start gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-455" />
                  <p>Password changed successfully!</p>
                </div>
              )}

              <form onSubmit={handleSelfPasswordChange} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-550 uppercase font-black block font-mono">Current Password</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-550 uppercase font-black block font-mono">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-550 uppercase font-black block font-mono">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-lg shadow-indigo-500/20"
                >
                  Change Password
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
