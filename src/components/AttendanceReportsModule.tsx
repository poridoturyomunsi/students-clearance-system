import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Calendar, 
  Search, 
  Filter, 
  Printer, 
  Download, 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  ShieldCheck, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  Award, 
  AlertTriangle,
  BarChart2,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { Student } from '../types.ts';
import { fetchAttendanceLogs, apiCall } from '../utils/api.ts';
import { getStoredAttendance, formatTodayDate, formatDisplayDate } from '../lib/attendanceStore.ts';

interface AttendanceReportsModuleProps {
  students: Student[];
}

export default function AttendanceReportsModule({ students }: AttendanceReportsModuleProps) {
  // Report Period Tab
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');

  // Time & Filter Controls
  const [selectedDate, setSelectedDate] = useState<string>(formatTodayDate());
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  });
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>(formatTodayDate());
  const [customEndDate, setCustomEndDate] = useState<string>(formatTodayDate());

  // Structural Filters
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [streamFilter, setStreamFilter] = useState<string>('ALL');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [boardingFilter, setBoardingFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data & Loading States
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<any | null>(null);

  // -------------------------------------------------------------
  // DATA FETCHING & SYNCHRONIZATION
  // -------------------------------------------------------------
  const loadReportData = async () => {
    setLoading(true);
    try {
      let startDateStr = selectedDate;
      let endDateStr = selectedDate;

      if (reportPeriod === 'weekly') {
        startDateStr = selectedWeekStart;
        const wEnd = new Date(selectedWeekStart);
        wEnd.setDate(wEnd.getDate() + 6);
        endDateStr = wEnd.toISOString().split('T')[0];
      } else if (reportPeriod === 'monthly') {
        const mStr = String(selectedMonth).padStart(2, '0');
        startDateStr = `${selectedYear}-${mStr}-01`;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        endDateStr = `${selectedYear}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      } else if (reportPeriod === 'custom') {
        startDateStr = customStartDate;
        endDateStr = customEndDate;
      }

      // Try API fetch first
      const serverLogs = await fetchAttendanceLogs({
        startDate: startDateStr,
        endDate: endDateStr,
        gradeClass: classFilter === 'ALL' ? undefined : classFilter,
        stream: streamFilter === 'ALL' ? undefined : streamFilter,
        gender: genderFilter === 'ALL' ? undefined : genderFilter,
        boardingStatus: boardingFilter === 'ALL' ? undefined : boardingFilter,
        search: searchTerm.trim() || undefined
      });

      if (Array.isArray(serverLogs)) {
        setLogs(serverLogs);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('[Reports] API logs fetch fallback to local store:', err);
    }

    // Local Store Fallback
    try {
      const allStored = getStoredAttendance();
      let startDateStr = selectedDate;
      let endDateStr = selectedDate;

      if (reportPeriod === 'weekly') {
        startDateStr = selectedWeekStart;
        const wEnd = new Date(selectedWeekStart);
        wEnd.setDate(wEnd.getDate() + 6);
        endDateStr = wEnd.toISOString().split('T')[0];
      } else if (reportPeriod === 'monthly') {
        const mStr = String(selectedMonth).padStart(2, '0');
        startDateStr = `${selectedYear}-${mStr}-01`;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        endDateStr = `${selectedYear}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      } else if (reportPeriod === 'custom') {
        startDateStr = customStartDate;
        endDateStr = customEndDate;
      }

      const filtered = allStored.filter(r => r.date >= startDateStr && r.date <= endDateStr);
      setLogs(filtered);
    } catch (e) {
      console.error('[Reports] Error loading local report logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [reportPeriod, selectedDate, selectedWeekStart, selectedMonth, selectedYear, customStartDate, customEndDate, classFilter, streamFilter, genderFilter, boardingFilter, searchTerm]);

  // -------------------------------------------------------------
  // MASTER STUDENT ROSTER FILTERING
  // -------------------------------------------------------------
  const filteredMasterStudents = useMemo(() => {
    return students.filter(st => {
      if (classFilter !== 'ALL') {
        const cls = (st.gradeClass || '').toUpperCase();
        if (!cls.includes(classFilter.toUpperCase())) return false;
      }
      if (streamFilter !== 'ALL') {
        const cls = (st.gradeClass || '').toUpperCase();
        if (!cls.includes(streamFilter.toUpperCase())) return false;
      }
      if (genderFilter !== 'ALL' && st.gender && !st.gender.toLowerCase().startsWith(genderFilter.toLowerCase().charAt(0))) {
        return false;
      }
      if (boardingFilter !== 'ALL' && st.boardingStatus) {
        if (!st.boardingStatus.toLowerCase().startsWith(boardingFilter.toLowerCase().slice(0, 3))) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mName = st.name.toLowerCase().includes(q);
        const mAdmin = (st.adminNo || st.studentNo || '').toLowerCase().includes(q);
        return mName || mAdmin;
      }
      return true;
    });
  }, [students, classFilter, streamFilter, genderFilter, boardingFilter, searchTerm]);

  // Map student ID/adminNo to Student details
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(st => {
      map.set(String(st.id), st);
      if (st.adminNo) map.set(String(st.adminNo), st);
      if (st.studentNo) map.set(String(st.studentNo), st);
    });
    return map;
  }, [students]);

  // -------------------------------------------------------------
  // DAILY METRICS COMPUTATION
  // -------------------------------------------------------------
  const dailyMetrics = useMemo(() => {
    const totalReg = filteredMasterStudents.length;
    const todayLogs = logs.filter(l => (typeof l.date === 'string' ? l.date.split('T')[0] : l.date) === selectedDate);
    
    const uniquePresentIds = new Set<string>();
    let insideCount = 0;
    let clockedOutCount = 0;
    let lateCount = 0;

    todayLogs.forEach(l => {
      const student = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
      const sId = student ? student.id : String(l.student_id || l.studentId || l.studentNo);
      
      if (!uniquePresentIds.has(sId)) {
        uniquePresentIds.add(sId);
        
        const isOut = Boolean(l.time_out || l.timeOut || l.status === 'CHECKED OUT' || l.status === 'Checked Out');
        if (isOut) {
          clockedOutCount++;
        } else {
          insideCount++;
        }

        const isLate = l.status === 'Late' || l.status === 'Very Late' || (l.time_in && l.time_in > '08:00');
        if (isLate) lateCount++;
      }
    });

    const presentTotal = uniquePresentIds.size;
    const notCheckedIn = Math.max(0, totalReg - presentTotal);
    const rate = totalReg > 0 ? ((presentTotal / totalReg) * 100).toFixed(1) : '0.0';

    return {
      totalRegistered: totalReg,
      presentToday: presentTotal,
      currentlyOnCampus: insideCount,
      clockedOut: clockedOutCount,
      notCheckedIn,
      attendanceRate: rate,
      lateStudents: lateCount
    };
  }, [filteredMasterStudents, logs, selectedDate, studentMap]);

  // -------------------------------------------------------------
  // DAILY FULL STUDENT ROSTER TABLE GENERATOR
  // -------------------------------------------------------------
  const dailyRosterTable = useMemo(() => {
    const todayLogsMap = new Map<string, any>();
    logs.filter(l => (typeof l.date === 'string' ? l.date.split('T')[0] : l.date) === selectedDate).forEach(l => {
      const st = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
      const sId = st ? st.id : String(l.student_id || l.studentId || l.studentNo);
      todayLogsMap.set(sId, l);
      if (l.studentNo) todayLogsMap.set(String(l.studentNo), l);
    });

    return filteredMasterStudents.map(st => {
      const log = todayLogsMap.get(st.id) || todayLogsMap.get(st.adminNo || '') || todayLogsMap.get(st.studentNo || '');
      const timeIn = log ? (log.time_in || log.timeIn || '—') : '—';
      const timeOut = log ? (log.time_out || log.timeOut || '—') : '—';
      
      let status = 'ABSENT / NOT CHECKED IN';
      if (log) {
        const isOut = Boolean(log.time_out || log.timeOut || log.status === 'CHECKED OUT' || log.status === 'Checked Out');
        if (isOut) {
          status = 'CHECKED OUT';
        } else if (log.status === 'Late' || log.status === 'Very Late') {
          status = 'LATE';
        } else {
          status = 'PRESENT';
        }
      }

      return {
        student: st,
        studentNo: st.adminNo || st.studentNo || st.id,
        name: st.name,
        gradeClass: st.gradeClass,
        gender: st.gender || 'Male',
        timeIn,
        timeOut,
        status,
        rawLog: log
      };
    });
  }, [filteredMasterStudents, logs, selectedDate, studentMap]);

  // -------------------------------------------------------------
  // WEEKLY MATRIX COMPUTATION (MON to FRI)
  // -------------------------------------------------------------
  const weeklyMatrixData = useMemo(() => {
    const days: string[] = [];
    const mon = new Date(selectedWeekStart);
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    const logLookup = new Map<string, any>(); // key: `${studentId}_${date}`
    logs.forEach(l => {
      const dateStr = typeof l.date === 'string' ? l.date.split('T')[0] : l.date;
      const st = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
      const sId = st ? st.id : String(l.student_id || l.studentId || l.studentNo);
      logLookup.set(`${sId}_${dateStr}`, l);
    });

    const rows = filteredMasterStudents.map(st => {
      let presentDays = 0;
      const dayStatuses = days.map(dStr => {
        const log = logLookup.get(`${st.id}_${dStr}`);
        if (!log) return { symbol: '—', label: 'Not Checked In', class: 'text-slate-500' };
        
        presentDays++;
        if (log.status === 'Late' || log.status === 'Very Late' || (log.time_in && log.time_in > '08:00')) {
          return { symbol: 'L', label: 'Late', class: 'text-amber-400 font-black' };
        }
        return { symbol: '✓', label: 'Present', class: 'text-emerald-400 font-black' };
      });

      const rate = ((presentDays / 5) * 100).toFixed(0);

      return {
        student: st,
        name: st.name,
        adminNo: st.adminNo || st.studentNo || st.id,
        gradeClass: st.gradeClass,
        days: dayStatuses,
        totalPresent: presentDays,
        rate
      };
    });

    // Date summaries
    const dateSummaries = days.map(dStr => {
      const logsForDay = logs.filter(l => (typeof l.date === 'string' ? l.date.split('T')[0] : l.date) === dStr);
      const uniquePresent = new Set<string>();
      let outCount = 0;

      logsForDay.forEach(l => {
        const st = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
        const sId = st ? st.id : String(l.student_id || l.studentId || l.studentNo);
        uniquePresent.add(sId);
        if (l.time_out || l.timeOut || l.status === 'CHECKED OUT' || l.status === 'Checked Out') outCount++;
      });

      const totalReg = filteredMasterStudents.length;
      const presCount = uniquePresent.size;
      const notInCount = Math.max(0, totalReg - presCount);
      const rate = totalReg > 0 ? ((presCount / totalReg) * 100).toFixed(1) : '0.0';

      return {
        dateStr: dStr,
        dayName: new Date(dStr).toLocaleDateString('en-US', { weekday: 'short' }),
        present: presCount,
        notCheckedIn: notInCount,
        clockedOut: outCount,
        rate
      };
    });

    return { days, rows, dateSummaries };
  }, [filteredMasterStudents, logs, selectedWeekStart, studentMap]);

  // -------------------------------------------------------------
  // MONTHLY AGGREGATION & METRICS
  // -------------------------------------------------------------
  const monthlyData = useMemo(() => {
    const mStr = String(selectedMonth).padStart(2, '0');
    const prefix = `${selectedYear}-${mStr}`;
    const monthlyLogs = logs.filter(l => {
      const dStr = typeof l.date === 'string' ? l.date.split('T')[0] : l.date;
      return dStr && dStr.startsWith(prefix);
    });

    // Unique school days with logs
    const activeDates = Array.from(new Set(monthlyLogs.map(l => typeof l.date === 'string' ? l.date.split('T')[0] : l.date))).sort();
    const totalSchoolDays = activeDates.length || 1;

    // Student attendance counters
    const studentAttendanceCounts = new Map<string, number>();
    let totalLate = 0;

    monthlyLogs.forEach(l => {
      const st = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
      const sId = st ? st.id : String(l.student_id || l.studentId || l.studentNo);
      studentAttendanceCounts.set(sId, (studentAttendanceCounts.get(sId) || 0) + 1);

      if (l.status === 'Late' || l.status === 'Very Late' || (l.time_in && l.time_in > '08:00')) {
        totalLate++;
      }
    });

    const totalStudents = filteredMasterStudents.length;
    const avgDailyAttendance = (monthlyLogs.length / totalSchoolDays).toFixed(0);
    const overallRate = totalStudents > 0 ? ((monthlyLogs.length / (totalStudents * totalSchoolDays)) * 100).toFixed(1) : '0.0';

    // Top attendees & low attendance alert
    const studentStatsList = filteredMasterStudents.map(st => {
      const daysAttended = studentAttendanceCounts.get(st.id) || 0;
      const rate = parseFloat(((daysAttended / totalSchoolDays) * 100).toFixed(1));
      return { student: st, daysAttended, rate };
    });

    const topAttendees = [...studentStatsList].sort((a, b) => b.daysAttended - a.daysAttended).slice(0, 5);
    const lowAttendees = [...studentStatsList].filter(s => s.rate < 75).sort((a, b) => a.rate - b.rate).slice(0, 5);

    // Daily breakdown table
    const dailyBreakdown = activeDates.map(dStr => {
      const dayLogs = monthlyLogs.filter(l => (typeof l.date === 'string' ? l.date.split('T')[0] : l.date) === dStr);
      const uniquePres = new Set<string>();
      let outCount = 0;

      dayLogs.forEach(l => {
        const st = studentMap.get(String(l.student_id || l.studentId || l.studentNo));
        const sId = st ? st.id : String(l.student_id || l.studentId || l.studentNo);
        uniquePres.add(sId);
        if (l.time_out || l.timeOut || l.status === 'CHECKED OUT' || l.status === 'Checked Out') outCount++;
      });

      const pres = uniquePres.size;
      const abs = Math.max(0, totalStudents - pres);
      const rate = totalStudents > 0 ? ((pres / totalStudents) * 100).toFixed(1) : '0.0';

      return { date: dStr, present: pres, absent: abs, clockedOut: outCount, rate };
    });

    return {
      totalSchoolDays,
      avgDailyAttendance,
      overallRate,
      totalLogsRecorded: monthlyLogs.length,
      totalLate,
      topAttendees,
      lowAttendees,
      dailyBreakdown
    };
  }, [logs, selectedMonth, selectedYear, filteredMasterStudents, studentMap]);

  // -------------------------------------------------------------
  // EXPORT HANDLERS
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    const exportData = dailyRosterTable.map((r, idx) => ({
      '#': idx + 1,
      'Student No': r.studentNo,
      'Student Name': r.name,
      'Class': r.gradeClass,
      'Gender': r.gender,
      'Time In': r.timeIn,
      'Time Out': r.timeOut,
      'Attendance Status': r.status,
      'Date': selectedDate
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_Report_${selectedDate}`);
    XLSX.writeFile(wb, `StPaul_Attendance_Report_${selectedDate}.xlsx`);
  };

  const handleExportCSV = () => {
    let csv = `ST. PAUL SECONDARY SCHOOL - ATTENDANCE REPORT\n`;
    csv += `Date: ${selectedDate} | Class: ${classFilter} | Stream: ${streamFilter}\n\n`;
    csv += `Student No,Student Name,Class,Gender,Time In,Time Out,Status\n`;

    dailyRosterTable.forEach(r => {
      csv += `"${r.studentNo}","${r.name}","${r.gradeClass}","${r.gender}","${r.timeIn}","${r.timeOut}","${r.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StPaul_Attendance_Report_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('ST. PAUL SECONDARY SCHOOL', 14, 15);
    doc.setFontSize(12);
    doc.text(`ATTENDANCE REPORT — ${reportPeriod.toUpperCase()}`, 14, 23);
    doc.setFontSize(9);
    doc.text(`Period: ${selectedDate} | Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Registered: ${dailyMetrics.totalRegistered} | Present Today: ${dailyMetrics.presentToday} | Rate: ${dailyMetrics.attendanceRate}%`, 14, 36);

    let y = 46;
    doc.setFontSize(8);
    doc.text('#  Student No    Student Name                   Class      Time In   Time Out   Status', 14, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 5;

    dailyRosterTable.slice(0, 35).forEach((r, idx) => {
      const line = `${String(idx + 1).padEnd(3)} ${r.studentNo.padEnd(12)} ${r.name.slice(0, 24).padEnd(26)} ${(r.gradeClass || '').padEnd(10)} ${(r.timeIn || '—').padEnd(9)} ${(r.timeOut || '—').padEnd(9)} ${r.status}`;
      doc.text(line, 14, y);
      y += 6;
    });

    doc.save(`StPaul_Attendance_Report_${selectedDate}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans text-slate-100">
      
      {/* 1. OFFICIAL SCHOOL REPORT HEADER BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-2xl">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-wider font-mono">
              ST. PAUL SECONDARY SCHOOL
            </h1>
            <p className="text-xs text-indigo-300 font-bold uppercase tracking-widest mt-0.5">
              OFFICIAL ATTENDANCE REPORT MODULE
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono mt-2">
              <span>Term: <strong className="text-slate-200">Term II</strong></span>
              <span>•</span>
              <span>Year: <strong className="text-slate-200">2026</strong></span>
              <span>•</span>
              <span>Timezone: <strong className="text-emerald-400 font-bold">Africa/Kampala</strong></span>
            </div>
          </div>
        </div>

        {/* EXPORT & PRINT BUTTON TOOLBAR */}
        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto justify-end no-print">
          <button
            onClick={handlePrint}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition border border-slate-700 cursor-pointer shadow-md"
          >
            <Printer className="w-4 h-4 text-indigo-400" /> Print
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            <Download className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            <Download className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-md"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* 2. REPORT PERIOD TABS & STRUCTURAL FILTERS BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl no-print">
        
        {/* Period Selector Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          {(['daily', 'weekly', 'monthly', 'custom'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setReportPeriod(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                reportPeriod === tab
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tab === 'daily' ? 'Daily Report' : tab === 'weekly' ? 'Weekly Matrix' : tab === 'monthly' ? 'Monthly Summary' : 'Custom Range'}
            </button>
          ))}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          
          {/* Time Filter based on tab */}
          {reportPeriod === 'daily' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {reportPeriod === 'weekly' && (
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Week Starting (Mon)</label>
              <input
                type="date"
                value={selectedWeekStart}
                onChange={(e) => setSelectedWeekStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {reportPeriod === 'monthly' && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Select Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-slate-200 focus:outline-none cursor-pointer"
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                    <option key={idx} value={idx + 1}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Academic Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                </select>
              </div>
            </>
          )}

          {reportPeriod === 'custom' && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">From Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-200 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">To Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-slate-200 focus:outline-none"
                />
              </div>
            </>
          )}

          {/* Class Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Class Filter</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Classes (S.1 - S.6)</option>
              <option value="S.1">S.1</option>
              <option value="S.2">S.2</option>
              <option value="S.3">S.3</option>
              <option value="S.4">S.4</option>
              <option value="S.5">S.5</option>
              <option value="S.6">S.6</option>
            </select>
          </div>

          {/* Stream Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Stream Filter</label>
            <select
              value={streamFilter}
              onChange={(e) => setStreamFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Streams</option>
              <option value="A">Stream A</option>
              <option value="B">Stream B</option>
              <option value="C">Stream C</option>
              <option value="ARTS">Arts</option>
              <option value="SCIENCES">Sciences</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="space-y-1 col-span-1 sm:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">Search Student / Admin No</label>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-500 absolute left-3" />
              <input
                type="text"
                placeholder="Type student name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. DAILY ATTENDANCE REPORT VIEW */}
      {reportPeriod === 'daily' && (
        <div className="space-y-6">
          
          {/* Summary KPI 7 Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider font-mono">TOTAL REGISTERED</span>
              <p className="text-2xl font-black text-slate-100 mt-1 font-mono">{dailyMetrics.totalRegistered}</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-4 rounded-2xl border border-indigo-500/30 shadow-xl">
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-wider font-mono">PRESENT TODAY</span>
              <p className="text-2xl font-black text-indigo-400 mt-1 font-mono">{dailyMetrics.presentToday}</p>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider font-mono">ON CAMPUS</span>
              <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{dailyMetrics.currentlyOnCampus}</p>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-wider font-mono">CLOCKED OUT</span>
              <p className="text-2xl font-black text-amber-400 mt-1 font-mono">{dailyMetrics.clockedOut}</p>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-purple-400 uppercase tracking-wider font-mono">NOT CHECKED IN</span>
              <p className="text-2xl font-black text-purple-400 mt-1 font-mono">{dailyMetrics.notCheckedIn}</p>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-wider font-mono">ATTENDANCE RATE</span>
              <p className="text-2xl font-black text-indigo-300 mt-1 font-mono">{dailyMetrics.attendanceRate}%</p>
            </div>
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider font-mono">LATE ARRIVALS</span>
              <p className="text-2xl font-black text-rose-400 mt-1 font-mono">{dailyMetrics.lateStudents}</p>
            </div>
          </div>

          {/* Roster Detailed Student Table */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
                  DAILY ATTENDANCE ROSTER DETAILS — {formatDisplayDate(selectedDate)}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Showing {dailyRosterTable.length} master student records matching active filters.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-black uppercase text-[10px] border-b border-slate-800">
                    <th className="p-3">STUDENT NO</th>
                    <th className="p-3">STUDENT NAME</th>
                    <th className="p-3">CLASS &amp; STREAM</th>
                    <th className="p-3">GENDER</th>
                    <th className="p-3 text-center">TIME IN</th>
                    <th className="p-3 text-center">TIME OUT</th>
                    <th className="p-3 text-center">ATTENDANCE STATUS</th>
                    <th className="p-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {dailyRosterTable.map((row, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedStudentHistory(row.student)}
                      className="hover:bg-slate-800/50 transition cursor-pointer group"
                    >
                      <td className="p-3 font-bold text-slate-300">{row.studentNo}</td>
                      <td className="p-3 font-black text-white group-hover:text-indigo-400 transition">{row.name}</td>
                      <td className="p-3 text-slate-300 font-bold">{row.gradeClass}</td>
                      <td className="p-3 text-slate-400">{row.gender}</td>
                      <td className="p-3 text-center font-bold text-emerald-400">{row.timeIn}</td>
                      <td className="p-3 text-center font-bold text-amber-400">{row.timeOut}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          row.status === 'CHECKED OUT'
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                            : row.status === 'PRESENT'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                            : row.status === 'LATE'
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="inline-flex items-center text-[10px] font-bold text-indigo-400 hover:underline gap-1">
                          History <ChevronRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. WEEKLY ATTENDANCE REPORT MATRIX */}
      {reportPeriod === 'weekly' && (
        <div className="space-y-6">
          
          {/* Weekly Summary by Day */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
              WEEKLY SUMMARY BY DAY ({formatDisplayDate(selectedWeekStart)} - {formatDisplayDate(weeklyMatrixData.days[4] || '')})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weeklyMatrixData.dateSummaries.map((s, idx) => (
                <div key={idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
                  <div className="flex justify-between items-center text-xs font-black text-indigo-400 font-mono uppercase">
                    <span>{s.dayName}</span>
                    <span className="text-[10px] text-slate-500">{formatDisplayDate(s.dateStr)}</span>
                  </div>
                  <div className="text-xl font-black text-white font-mono mt-1">{s.present} Present</div>
                  <div className="text-[11px] text-slate-400 font-mono">Clocked Out: {s.clockedOut}</div>
                  <div className="text-[11px] text-emerald-400 font-mono font-bold">Rate: {s.rate}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Weekly Student Matrix */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
              STUDENT WEEKLY ATTENDANCE MATRIX (MON - FRI)
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-black uppercase text-[10px] border-b border-slate-800">
                    <th className="p-3">STUDENT NAME</th>
                    <th className="p-3">CLASS</th>
                    <th className="p-3 text-center">MON</th>
                    <th className="p-3 text-center">TUE</th>
                    <th className="p-3 text-center">WED</th>
                    <th className="p-3 text-center">THU</th>
                    <th className="p-3 text-center">FRI</th>
                    <th className="p-3 text-center">TOTAL PRESENT</th>
                    <th className="p-3 text-right">ATTENDANCE RATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {weeklyMatrixData.rows.map((row, idx) => (
                    <tr key={idx} onClick={() => setSelectedStudentHistory(row.student)} className="hover:bg-slate-800/50 transition cursor-pointer">
                      <td className="p-3 font-black text-white">{row.name}</td>
                      <td className="p-3 font-bold text-slate-300">{row.gradeClass}</td>
                      {row.days.map((d, dIdx) => (
                        <td key={dIdx} className={`p-3 text-center text-sm font-black ${d.class}`}>
                          {d.symbol}
                        </td>
                      ))}
                      <td className="p-3 text-center font-black text-emerald-400">{row.totalPresent} / 5</td>
                      <td className="p-3 text-right font-black text-indigo-300">{row.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. MONTHLY ATTENDANCE REPORT VIEW */}
      {reportPeriod === 'monthly' && (
        <div className="space-y-6">
          
          {/* Monthly KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[10px] font-black text-indigo-300 uppercase tracking-wider font-mono">MONTHLY ATTENDANCE RATE</span>
              <p className="text-3xl font-black text-indigo-400 mt-2 font-mono">{monthlyData.overallRate}%</p>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">SCHOOL DAYS RECORDED</span>
              <p className="text-3xl font-black text-slate-100 mt-2 font-mono">{monthlyData.totalSchoolDays}</p>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider font-mono">AVG DAILY ATTENDANCE</span>
              <p className="text-3xl font-black text-emerald-400 mt-2 font-mono">{monthlyData.avgDailyAttendance}</p>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider font-mono">TOTAL LOGS RECORDED</span>
              <p className="text-3xl font-black text-amber-400 mt-2 font-mono">{monthlyData.totalLogsRecorded}</p>
            </div>
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider font-mono">TOTAL LATE ARRIVALS</span>
              <p className="text-3xl font-black text-rose-400 mt-2 font-mono">{monthlyData.totalLate}</p>
            </div>
          </div>

          {/* Top Attendees & Low Attendance Alert Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Attendees */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-emerald-400 font-mono font-black uppercase text-sm">
                <Award className="w-5 h-5 text-emerald-400" />
                HIGHEST ATTENDANCE STUDENTS
              </div>
              <div className="space-y-2">
                {monthlyData.topAttendees.map((item, idx) => (
                  <div key={idx} onClick={() => setSelectedStudentHistory(item.student)} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 cursor-pointer hover:border-emerald-500/40 transition">
                    <div>
                      <p className="font-bold text-white text-xs">{item.student.name}</p>
                      <p className="text-[10px] text-slate-400">{item.student.gradeClass}</p>
                    </div>
                    <span className="text-xs font-black text-emerald-400 font-mono">{item.daysAttended} Days ({item.rate}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Low Attendance Alert */}
            <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center gap-2 text-rose-400 font-mono font-black uppercase text-sm">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                LOW ATTENDANCE ALERTS (&lt; 75%)
              </div>
              <div className="space-y-2">
                {monthlyData.lowAttendees.length > 0 ? monthlyData.lowAttendees.map((item, idx) => (
                  <div key={idx} onClick={() => setSelectedStudentHistory(item.student)} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 cursor-pointer hover:border-rose-500/40 transition">
                    <div>
                      <p className="font-bold text-white text-xs">{item.student.name}</p>
                      <p className="text-[10px] text-slate-400">{item.student.gradeClass}</p>
                    </div>
                    <span className="text-xs font-black text-rose-400 font-mono">{item.daysAttended} Days ({item.rate}%)</span>
                  </div>
                )) : (
                  <p className="text-xs text-slate-500 italic p-4 text-center">No students below 75% attendance threshold this month.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. INDIVIDUAL STUDENT ATTENDANCE HISTORY DRILL-DOWN MODAL */}
      {selectedStudentHistory && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest font-mono">STUDENT ATTENDANCE DOSSIER</span>
                <h2 className="text-xl font-black text-white uppercase font-mono mt-0.5">{selectedStudentHistory.name}</h2>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedStudentHistory.gradeClass} • Admin No: {selectedStudentHistory.adminNo || selectedStudentHistory.studentNo || selectedStudentHistory.id}
                </p>
              </div>
              <button 
                onClick={() => setSelectedStudentHistory(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Individual Student Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] text-slate-500 font-black uppercase font-mono">RECORDED DAYS</span>
                <p className="text-2xl font-black text-slate-100 font-mono mt-1">20</p>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] text-emerald-400 font-black uppercase font-mono">DAYS PRESENT</span>
                <p className="text-2xl font-black text-emerald-400 font-mono mt-1">18</p>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] text-rose-400 font-black uppercase font-mono">DAYS ABSENT</span>
                <p className="text-2xl font-black text-rose-400 font-mono mt-1">2</p>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center">
                <span className="text-[9px] text-indigo-400 font-black uppercase font-mono">ATTENDANCE RATE</span>
                <p className="text-2xl font-black text-indigo-400 font-mono mt-1">90.0%</p>
              </div>
            </div>

            {/* Attendance Timeline History */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-300 uppercase font-mono tracking-wider">Recent Gate Activity Log</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {logs.filter(l => {
                  const sId = String(l.student_id || l.studentId || l.studentNo);
                  return sId === selectedStudentHistory.id || sId === selectedStudentHistory.adminNo;
                }).map((log, lIdx) => (
                  <div key={lIdx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono">
                    <div>
                      <p className="font-bold text-white">{formatDisplayDate(log.date)}</p>
                      <p className="text-[10px] text-slate-400">Time In: {log.time_in || log.timeIn || '—'} | Time Out: {log.time_out || log.timeOut || '—'}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-indigo-950 text-indigo-400 border border-indigo-800">
                      {log.status || 'Present'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedStudentHistory(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
