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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('attendance-updated', { detail: records }));
      // Request permanent storage persistence from the browser engine
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    }
  } catch (e) {
    console.error("Failed to save attendance records:", e);
  }
}


export function formatCurrentTime(dateObj = new Date()): string {
  return dateObj.toLocaleTimeString('en-US', {
    timeZone: 'Africa/Kampala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

export function formatTodayDate(dateObj = new Date()): string {
  return dateObj.toLocaleDateString('en-CA', {
    timeZone: 'Africa/Kampala'
  }); // YYYY-MM-DD
}

export function getSecondName(fullName?: string): string {
  if (!fullName) return 'Student';
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const secondWord = parts[1];
    return secondWord.charAt(0).toUpperCase() + secondWord.slice(1).toLowerCase();
  }
  const firstWord = parts[0] || 'Student';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

export function getFirstName(fullName?: string): string {
  return getSecondName(fullName);
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
  studentFirstName?: string;
  welcomeMessage?: string;
  goodbyeMessage?: string;
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

  // Clean query text (extract student/staff number or ID if embedded in URL or prefix)
  let cleaned = query.trim();
  cleaned = cleaned.split('?')[0].split('#')[0]; // Strip query parameters and hashes
  
  if (cleaned.includes('/verify/student/')) {
    const parts = cleaned.split('/verify/student/');
    cleaned = decodeURIComponent(parts[parts.length - 1]);
  } else if (cleaned.includes('/staff/verify/')) {
    const parts = cleaned.split('/staff/verify/');
    cleaned = decodeURIComponent(parts[parts.length - 1]);
  } else if (cleaned.includes('/verify/')) {
    const parts = cleaned.split('/verify/');
    cleaned = decodeURIComponent(parts[parts.length - 1]);
  }
  
  cleaned = cleaned.replace(/^Student ID:\s*/i, '').replace(/^Staff ID:\s*/i, '').replace(/^STUDENT:\s*/i, '').replace(/^STAFF:\s*/i, '').trim();

  console.log(`[QR-SCAN-DEBUG] Input raw scan: "${query}", cleaned identifier: "${cleaned}"`);

  // Find matching student by studentNo, adminNo, ID, or verification_token
  const student = studentsList.find(s => {
    const stdNo = (s.studentNo || s.adminNo || '').toLowerCase();
    const stdId = (s.id || '').toLowerCase();
    const vToken = ((s as any).verification_token || '').toLowerCase();
    const target = cleaned.toLowerCase();
    return stdNo === target || stdId === target || (vToken && vToken === target) || stdNo.includes(target) || target.includes(stdNo);
  });

  if (!student) {
    console.warn(`[QR-SCAN-DEBUG] Scan match failed. Student record not found for query "${cleaned}"`);
    return {
      verified: false,
      status: 'INVALID',
      message: '❌ Student record not found. Please register the student first.',
      dateStr: todayStr
    };
  }

  // Check if student is active
  if (student.status === 'Archived' || student.status === 'Inactive') {
    return {
      verified: false,
      status: 'INVALID',
      message: '🚫 STUDENT NOT ACTIVE — This student is currently not active in the school registry.',
      dateStr: todayStr
    };
  }

  const studentFirstName = getFirstName(student.name);

  // Fetch current attendance history
  const allRecords = getStoredAttendance();
  const todayRecords = allRecords.filter(r => r.date === todayStr);
  const existingRecordIndex = todayRecords.findIndex(r => 
    r.studentId === student.id || 
    r.studentId === student.adminNo || 
    r.studentNo === student.id || 
    r.studentNo === (student.studentNo || student.adminNo)
  );

  let finalStatus: 'PRESENT' | 'CHECKED OUT' = 'PRESENT';
  let timeIn = nowTime;
  let timeOut: string | undefined = undefined;
  let isDuplicate = false;

  const welcomeMessage = `Welcome, ${studentFirstName}! 👋\nGood morning!\nYou have successfully checked in.\nHave a wonderful and productive day!`;
  const goodbyeMessage = `Goodbye, ${studentFirstName}! 👋\nYou have successfully checked out.\nHave a safe journey home!`;

  if (existingRecordIndex >= 0) {
    const existing = todayRecords[existingRecordIndex];
    const timeSinceLastScan = Date.now() - (existing.timestamp || 0);
    const DOUBLE_TAP_DEBOUNCE_MS = 3000; // 3 seconds protection against accidental double-taps

    if (actionMode === 'CHECK_IN') {
      if (existing.status === 'PRESENT') {
        // 2nd scan in explicit check in mode -> perform check out
        if (timeSinceLastScan < DOUBLE_TAP_DEBOUNCE_MS) {
          return {
            verified: true,
            student,
            studentFirstName,
            welcomeMessage,
            record: existing,
            status: 'DUPLICATE_WARNING',
            message: `⚠️ ALREADY CHECKED IN — ${student.name} is already checked in today at ${existing.timeIn}.`,
            timeIn: existing.timeIn,
            timeOut: existing.timeOut,
            dateStr: todayStr,
            isDuplicate: true
          };
        }
        finalStatus = 'CHECKED OUT';
        timeIn = existing.timeIn || nowTime;
        timeOut = nowTime;
      } else {
        // Already checked out for today
        return {
          verified: true,
          student,
          studentFirstName,
          record: existing,
          status: 'DUPLICATE_WARNING',
          message: `⚠️ ALREADY CHECKED IN & OUT — ${student.name} has already checked in (at ${existing.timeIn}) and checked out (at ${existing.timeOut}) today.`,
          timeIn: existing.timeIn,
          timeOut: existing.timeOut,
          dateStr: todayStr,
          isDuplicate: true
        };
      }
    } else if (actionMode === 'CHECK_OUT') {
      if (!existing.timeIn) {
        return {
          verified: false,
          student,
          studentFirstName,
          status: 'INVALID',
          message: `🚫 Cannot Check Out ${student.name} before Check In. Student must check in first.`,
          dateStr: todayStr
        };
      }
      if (existing.status === 'CHECKED OUT') {
        return {
          verified: true,
          student,
          studentFirstName,
          goodbyeMessage,
          record: existing,
          status: 'DUPLICATE_WARNING',
          message: `⚠️ ALREADY CHECKED IN & OUT — ${student.name} has already checked in (at ${existing.timeIn}) and checked out (at ${existing.timeOut}) today.`,
          timeIn: existing.timeIn,
          timeOut: existing.timeOut,
          dateStr: todayStr,
          isDuplicate: true
        };
      } else {
        finalStatus = 'CHECKED OUT';
        timeIn = existing.timeIn || nowTime;
        timeOut = nowTime;
      }
    } else {
      // AUTO mode: 1st scan = PRESENT, 2nd scan = CHECKED OUT, 3rd+ scan = ALREADY CHECKED OUT
      if (existing.status === 'PRESENT') {
        if (timeSinceLastScan < DOUBLE_TAP_DEBOUNCE_MS) {
          return {
            verified: true,
            student,
            studentFirstName,
            welcomeMessage,
            record: existing,
            status: 'DUPLICATE_WARNING',
            message: `⚠️ ALREADY CHECKED IN — ${student.name} is already checked in today at ${existing.timeIn}.`,
            timeIn: existing.timeIn,
            timeOut: existing.timeOut,
            dateStr: todayStr,
            isDuplicate: true
          };
        }

        // 2nd scan: update to CHECKED OUT
        finalStatus = 'CHECKED OUT';
        timeIn = existing.timeIn || nowTime;
        timeOut = nowTime;
      } else {
        // 3rd+ scan: Already checked in and checked out
        return {
          verified: true,
          student,
          studentFirstName,
          goodbyeMessage,
          record: existing,
          status: 'DUPLICATE_WARNING',
          message: `⚠️ ALREADY CHECKED IN & OUT — ${student.name} has already checked in (at ${existing.timeIn}) and checked out (at ${existing.timeOut}) today.`,
          timeIn: existing.timeIn,
          timeOut: existing.timeOut,
          dateStr: todayStr,
          isDuplicate: true
        };
      }
    }
  } else {
    // Brand new check in for today (1st scan)
    if (actionMode === 'CHECK_OUT') {
      return {
        verified: false,
        student,
        studentFirstName,
        status: 'INVALID',
        message: `🚫 Cannot Check Out ${student.name} before Check In. Student must check in first.`,
        dateStr: todayStr
      };
    }
    finalStatus = 'PRESENT';
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

  const message = finalStatus === 'PRESENT' ? welcomeMessage : goodbyeMessage;

  return {
    verified: true,
    student,
    studentFirstName,
    welcomeMessage: finalStatus === 'PRESENT' ? welcomeMessage : undefined,
    goodbyeMessage: finalStatus === 'CHECKED OUT' ? goodbyeMessage : undefined,
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

  const studentMap = new Map<string, Student>();
  studentsList.forEach(st => {
    studentMap.set(String(st.id), st);
    if (st.adminNo) studentMap.set(String(st.adminNo), st);
    if (st.studentNo) studentMap.set(String(st.studentNo), st);
  });

  // Count unique students for present, checked out, and inside
  const uniqueClockedInIds = new Set<string>();
  const uniqueCheckedOutIds = new Set<string>();

  todayRecords.forEach(r => {
    const st = studentMap.get(String(r.studentId)) || studentMap.get(String(r.studentNo));
    const sId = st ? st.id : String(r.studentId || r.studentNo);
    uniqueClockedInIds.add(sId);

    const isOut = Boolean(r.timeOut || (r as any).time_out || (r.status && String(r.status).toUpperCase().includes('CHECKED OUT')));
    if (isOut) {
      uniqueCheckedOutIds.add(sId);
    }
  });

  const totalStudents = studentsList.length;
  const totalClockedIn = uniqueClockedInIds.size;
  const clockedOutCount = uniqueCheckedOutIds.size;
  const currentlyInside = Math.max(0, totalClockedIn - clockedOutCount);
  const attendanceRate = totalStudents > 0 ? ((totalClockedIn / totalStudents) * 100).toFixed(1) : '0.0';
  const notArrivedCount = Math.max(0, totalStudents - totalClockedIn);

  // Class and Stream Breakdown Matrix
  const classes = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];
  const streamBreakdown: Array<{ grade: string; stream: string; clockedIn: number; inside: number; clockedOut: number }> = [];
  const classMatrix: Record<string, {
    A: { clockedIn: number; inside: number; clockedOut: number };
    B: { clockedIn: number; inside: number; clockedOut: number };
    C: { clockedIn: number; inside: number; clockedOut: number };
    total: { clockedIn: number; inside: number; clockedOut: number };
  }> = {};

  classes.forEach(grade => {
    classMatrix[grade] = {
      A: { clockedIn: 0, inside: 0, clockedOut: 0 },
      B: { clockedIn: 0, inside: 0, clockedOut: 0 },
      C: { clockedIn: 0, inside: 0, clockedOut: 0 },
      total: { clockedIn: 0, inside: 0, clockedOut: 0 }
    };

    ['A', 'B', 'C'].forEach(stKey => {
      const fullClassName = `${grade} ${stKey}`.toLowerCase();
      
      const streamRecords = todayRecords.filter(r => {
        const st = studentMap.get(String(r.studentId)) || studentMap.get(String(r.studentNo));
        const cls = ((st ? st.gradeClass : r.gradeClass) || '').toLowerCase();
        return cls === fullClassName || cls.startsWith(fullClassName) || (cls.includes(grade.toLowerCase()) && (cls.includes(stKey.toLowerCase()) || (stKey === 'A' && cls.includes('arts')) || (stKey === 'B' && cls.includes('sciences'))));
      });

      const inside = streamRecords.filter(r => r.status === 'PRESENT').length;
      const out = streamRecords.filter(r => r.status === 'CHECKED OUT').length;
      const clockedIn = inside + out;

      const stKeyProp = stKey as 'A' | 'B' | 'C';
      classMatrix[grade][stKeyProp] = { clockedIn, inside, clockedOut: out };
      classMatrix[grade].total.clockedIn += clockedIn;
      classMatrix[grade].total.inside += inside;
      classMatrix[grade].total.clockedOut += out;

      streamBreakdown.push({
        grade,
        stream: grade === 'S.5' || grade === 'S.6' ? (stKey === 'A' ? 'A (ARTS)' : stKey === 'B' ? 'B (SCIENCES)' : 'C') : stKey,
        clockedIn,
        inside,
        clockedOut: out
      });
    });
  });

  return {
    totalStudents,
    totalClockedIn,
    currentlyInside,
    presentCount: currentlyInside,
    checkedOutCount: clockedOutCount,
    notArrivedCount,
    attendanceRate,
    todayRecords,
    streamBreakdown,
    classMatrix
  };
}
