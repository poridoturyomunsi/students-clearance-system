import { Student } from '../types.ts';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  gradeClass: string;
  gender: string;
  boardingStatus: string;
  photoUrl?: string;
  date: string; // YYYY-MM-DD
  timeIn?: string; // e.g. "07:15 AM"
  timeOut?: string; // e.g. "05:30 PM"
  status: 'PRESENT' | 'CHECKED OUT';
  timestamp: number;
}

const STORAGE_KEY = 'stpaul_attendance_records_v1';

export function getStoredAttendance(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load attendance records:", e);
    return [];
  }
}

export function saveAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("Failed to save attendance records:", e);
  }
}

export function formatCurrentTime(dateObj = new Date()): string {
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function formatTodayDate(dateObj = new Date()): string {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // YYYY-MM-DD
}

export function formatDisplayDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

export interface ScanResult {
  verified: boolean;
  student?: Student;
  record?: AttendanceRecord;
  status: 'PRESENT' | 'CHECKED OUT' | 'INVALID' | 'DUPLICATE_WARNING';
  message: string;
  timeIn?: string;
  timeOut?: string;
  dateStr: string;
  isDuplicate?: boolean;
}

export function processQRScan(
  query: string,
  studentsList: Student[],
  actionMode: 'AUTO' | 'CHECK_IN' | 'CHECK_OUT' = 'AUTO'
): ScanResult {
  const todayStr = formatTodayDate();
  const nowTime = formatCurrentTime();

  if (!query || !query.trim()) {
    return {
      verified: false,
      status: 'INVALID',
      message: 'Invalid or empty QR Code scanned.',
      dateStr: todayStr
    };
  }

  // Clean query text (extract student number or ID if embedded in URL or prefix)
  let cleaned = query.trim();
  if (cleaned.includes('/verify/student/')) {
    const parts = cleaned.split('/verify/student/');
    cleaned = decodeURIComponent(parts[parts.length - 1]);
  } else if (cleaned.includes('/verify/')) {
    const parts = cleaned.split('/verify/');
    cleaned = decodeURIComponent(parts[parts.length - 1]);
  }
  
  cleaned = cleaned.replace(/^Student ID:\s*/i, '').replace(/^STUDENT:\s*/i, '').trim();

  // Find matching student by studentNo, adminNo, or ID
  const student = studentsList.find(s => {
    const stdNo = (s.studentNo || s.adminNo || '').toLowerCase();
    const stdId = (s.id || '').toLowerCase();
    const target = cleaned.toLowerCase();
    return stdNo === target || stdId === target || stdNo.includes(target) || target.includes(stdNo);
  });

  if (!student) {
    return {
      verified: false,
      status: 'INVALID',
      message: '❌ INVALID QR CODE - Student record not found.',
      dateStr: todayStr
    };
  }

  // Fetch current attendance history
  const allRecords = getStoredAttendance();
  const todayRecords = allRecords.filter(r => r.date === todayStr);
  const existingRecordIndex = todayRecords.findIndex(r => r.studentId === student.id || r.studentNo === (student.studentNo || student.adminNo));

  let finalStatus: 'PRESENT' | 'CHECKED OUT' = 'PRESENT';
  let timeIn = nowTime;
  let timeOut: string | undefined = undefined;
  let isDuplicate = false;
  let message = '✔ VERIFIED - Attendance recorded successfully.';

  if (existingRecordIndex >= 0) {
    const existing = todayRecords[existingRecordIndex];

    if (actionMode === 'CHECK_IN') {
      if (existing.status === 'PRESENT') {
        isDuplicate = true;
        message = `⚠️ Student already checked in today at ${existing.timeIn}.`;
        return {
          verified: true,
          student,
          record: existing,
          status: 'DUPLICATE_WARNING',
          message,
          timeIn: existing.timeIn,
          timeOut: existing.timeOut,
          dateStr: todayStr,
          isDuplicate: true
        };
      } else {
        // Re-entry
        finalStatus = 'PRESENT';
        timeIn = existing.timeIn || nowTime;
        message = `✔ VERIFIED - Re-entered school at ${nowTime}.`;
      }
    } else if (actionMode === 'CHECK_OUT') {
      if (existing.status === 'CHECKED OUT') {
        isDuplicate = true;
        message = `⚠️ Student already checked out today at ${existing.timeOut}.`;
        return {
          verified: true,
          student,
          record: existing,
          status: 'DUPLICATE_WARNING',
          message,
          timeIn: existing.timeIn,
          timeOut: existing.timeOut,
          dateStr: todayStr,
          isDuplicate: true
        };
      } else {
        finalStatus = 'CHECKED OUT';
        timeIn = existing.timeIn || nowTime;
        timeOut = nowTime;
        message = `✔ CHECK OUT - Student checked out at ${nowTime}.`;
      }
    } else {
      // AUTO mode: Toggle between Check In and Check Out
      if (existing.status === 'PRESENT') {
        finalStatus = 'CHECKED OUT';
        timeIn = existing.timeIn || nowTime;
        timeOut = nowTime;
        message = `✔ CHECK OUT - Student checked out at ${nowTime}.`;
      } else {
        finalStatus = 'PRESENT';
        timeIn = existing.timeIn || nowTime;
        timeOut = existing.timeOut;
        isDuplicate = true;
        message = `⚠️ Student already checked out today at ${existing.timeOut}.`;
      }
    }
  } else {
    // Brand new check in for today
    finalStatus = actionMode === 'CHECK_OUT' ? 'CHECKED OUT' : 'PRESENT';
    if (finalStatus === 'CHECKED OUT') {
      timeOut = nowTime;
    }
  }

  // Construct new or updated record
  const newRecord: AttendanceRecord = {
    id: `att-${student.id}-${todayStr}`,
    studentId: student.id,
    studentNo: student.studentNo || student.adminNo || student.id,
    studentName: student.name,
    gradeClass: student.gradeClass,
    gender: student.gender || 'Male',
    boardingStatus: student.boardingStatus || 'Day Scholar',
    photoUrl: student.photo,
    date: todayStr,
    timeIn,
    timeOut,
    status: finalStatus,
    timestamp: Date.now()
  };

  // Save to stored records
  const updatedRecords = allRecords.filter(r => !(r.date === todayStr && (r.studentId === student.id || r.studentNo === newRecord.studentNo)));
  updatedRecords.unshift(newRecord);
  saveAttendanceRecords(updatedRecords);

  return {
    verified: true,
    student,
    record: newRecord,
    status: finalStatus,
    message,
    timeIn: newRecord.timeIn,
    timeOut: newRecord.timeOut,
    dateStr: todayStr,
    isDuplicate
  };
}

export function getAttendanceStats(studentsList: Student[], dateStr: string = formatTodayDate()) {
  const allRecords = getStoredAttendance();
  const todayRecords = allRecords.filter(r => r.date === dateStr);

  const presentRecords = todayRecords.filter(r => r.status === 'PRESENT');
  const checkedOutRecords = todayRecords.filter(r => r.status === 'CHECKED OUT');

  const totalStudents = studentsList.length;
  const presentCount = presentRecords.length;
  const checkedOutCount = checkedOutRecords.length;
  
  // Students who have not scanned in today
  const scannedStudentIds = new Set(todayRecords.map(r => r.studentId || r.studentNo));
  const notArrivedCount = Math.max(0, totalStudents - scannedStudentIds.size);

  return {
    totalStudents,
    presentCount,
    checkedOutCount,
    notArrivedCount,
    todayRecords
  };
}
