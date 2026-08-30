import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, BookOpen, Award, TrendingUp, CreditCard, 
  CheckSquare, FileText, Megaphone, User, Settings, 
  Menu, X, LogOut, Download, CheckCircle2, XCircle, 
  DollarSign, CalendarDays, AlertCircle, RefreshCw, Users, Layers,
  ChevronRight, Sparkles, Printer, UserCheck
} from 'lucide-react';
import SchoolLogo from './SchoolLogo.tsx';
import ClearanceCard from './ClearanceCard.tsx';
import { Student } from '../types.ts';
import { fetchIntegratedStudentData, generateReportCards, getApiBaseUrl, fetchPdfTaskStatus, triggerFileDownload } from '../utils/api.ts';

interface StudentPortalProps {
  studentId: string;
  studentName: string;
  adminNo?: string;
  studentNo?: string;
  schoolLogo: string | null;
  onLogout: () => void;
}

export default function StudentPortal({ studentId, studentName, adminNo, studentNo, schoolLogo, onLogout }: StudentPortalProps) {
  const [data, setData] = useState<{
    student: Student;
    marks: any[];
    attendance: any[];
    fees: any[];
    positions?: {
      classPosition: number;
      totalClassStudents: number;
      streamPosition: number;
      totalStreamStudents: number;
    };
    announcements?: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Tab states: dashboard, subjects, academic-results, performance, fees, clearance, reports, notices, profile, settings
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportCompiling, setReportCompiling] = useState(false);
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null);
  const [clearanceCompiling, setClearanceCompiling] = useState(false);
  const [clearanceProgress, setClearanceProgress] = useState<{ current: number; total: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = adminNo || studentNo || studentId;
      const response = await fetchIntegratedStudentData(id as string);
      setData(response);
    } catch (err: any) {
      console.error('Error fetching student integrated data:', err);
      setError(err.message || 'Failed to retrieve records. Server may be offline.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [adminNo, studentNo]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing Student Portal Records...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-xl">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold uppercase text-slate-200">Retrieval Failed</h3>
          <p className="text-xs text-slate-400">{error || 'Unable to sync records'}</p>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex-1 py-2 bg-violet-650 hover:bg-violet-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
            >
              Retry
            </button>
            <button
              onClick={onLogout}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getSubjectSortIndex = (subjectName: string, gradeClass: string) => {
    const normalized = (subjectName || '').trim().toLowerCase();
    const cls = (gradeClass || '').trim().toUpperCase();
    const isS1orS2 = cls.startsWith('S.1') || cls.startsWith('S.2');
    const isS3orS4 = cls.startsWith('S.3') || cls.startsWith('S.4');

    if (isS1orS2) {
      if (normalized.includes('english') && !normalized.includes('literature')) return 1;
      if (normalized === 'mathematics' || normalized === 'maths' || normalized === 'mtc') return 2;
      if (normalized === 'physics' || normalized === 'phy') return 3;
      if (normalized === 'chemistry' || normalized === 'chem') return 4;
      if (normalized === 'biology' || normalized === 'bio') return 5;
      if (normalized.includes('physical education') || normalized === 'pe') return 6;
      if (normalized.includes('entrepreneurship') || normalized === 'ent') return 7;
      if (normalized === 'geography' || normalized === 'geog' || normalized === 'georg') return 8;
      if (normalized === 'kiswahili') return 9;
      if (normalized.includes('christian religious') || normalized === 'cre') return 10;
      if (normalized.includes('history') || normalized === 'hist') return 11;
    } else if (isS3orS4) {
      if (normalized.includes('english') && !normalized.includes('literature')) return 1;
      if (normalized === 'mathematics' || normalized === 'maths' || normalized === 'mtc') return 2;
      if (normalized === 'physics' || normalized === 'phy') return 3;
      if (normalized === 'chemistry' || normalized === 'chem') return 4;
      if (normalized === 'biology' || normalized === 'bio') return 5;
      if (normalized.includes('history') || normalized === 'hist') return 6;
      if (normalized === 'geography' || normalized === 'geog' || normalized === 'georg') return 7;
    }
    return 100;
  };

  const sortOLevelSubjects = (marksList: any[], gradeClass: string) => {
    return [...marksList].sort((a, b) => {
      const idxA = getSubjectSortIndex(a.subject, gradeClass);
      const idxB = getSubjectSortIndex(b.subject, gradeClass);
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return (a.subject || '').localeCompare(b.subject || '');
    });
  };

  const { student, marks: rawMarks, attendance, fees, positions, announcements } = data;
  const marks = sortOLevelSubjects(rawMarks || [], student.gradeClass);
  const isUACE = student.gradeClass.startsWith('S.5') || student.gradeClass.startsWith('S.6');

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10 % 4] || s[v] || s[0];
  };

  // Calculate stats
  const totalAttendance = attendance.length;
  const presentDays = attendance.filter(a => a.status === 'Present' || a.status === 'Late').length;
  const attendancePct = totalAttendance > 0 ? Math.round((presentDays / totalAttendance) * 100) : 100;

  // Calculate fees balance
  const activeFee = fees && fees.length > 0 ? fees[0] : null;
  const feeDue = activeFee ? parseFloat(activeFee.amount_due) : 0;
  const feePaid = activeFee ? parseFloat(activeFee.amount_paid) : 0;
  const feeBal = feeDue - feePaid;
  const feeStatus = activeFee ? activeFee.payment_status : 'Pending';

  const handleDownloadClearanceCard = async () => {
    setClearanceCompiling(true);
    setClearanceProgress(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/pdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutMode: 'front-back-paired',
          studentIds: [student.id],
          printSide: 'both',
          increasePdfBrightness: true,
          showWatermark: true,
          watermarkOpacity: 25,
          schoolLogoBase64: schoolLogo
        })
      });
      if (!response.ok) throw new Error('PDF failed');
      const res = await response.json();
      if (res.success && res.taskId) {
        const taskId = res.taskId;
        let done = false;
        while (!done) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const statusRes = await fetchPdfTaskStatus(taskId);
          if (statusRes.status === 'processing') {
            setClearanceProgress({ current: statusRes.progress, total: statusRes.total });
          } else if (statusRes.status === 'completed') {
            done = true;
            setClearanceProgress({ current: statusRes.total, total: statusRes.total });
            await triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`, statusRes.filename!);
          } else if (statusRes.status === 'failed') {
            throw new Error(statusRes.error || 'Server PDF card generation failed.');
          }
        }
      }
    } catch (err: any) {
      alert('Could not export clearance card: ' + err.message);
    } finally {
      setClearanceCompiling(false);
      setClearanceProgress(null);
    }
  };

  const handleCompileReport = async () => {
    const totalSubjects = marks.length;
    if (totalSubjects === 0) {
      alert('No academic marks registered for you in the database for this term.');
      return;
    }

    const activeMark = marks && marks.length > 0 ? marks[0] : null;
    const targetTerm = activeMark ? String(activeMark.term) : '3';
    const targetYear = activeMark ? parseInt(activeMark.year, 10) || 2026 : 2026;

    setReportCompiling(true);
    setReportProgress(null);
    try {
      const response = await generateReportCards({
        studentIds: [student.id],
        term: targetTerm,
        year: targetYear
      });

      if (response.success && response.taskId) {
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
            await triggerFileDownload(`${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`, statusRes.filename!);
          } else if (statusRes.status === 'failed') {
            throw new Error(statusRes.error || 'Server PDF report generation failed.');
          }
        }
      }
    } catch (err: any) {
      alert('Failed to generate report card: ' + err.message);
    } finally {
      setReportCompiling(false);
      setReportProgress(null);
    }
  };

  // Helper to calculate student's overall average score
  const getAverageScore = () => {
    if (marks.length === 0) return '0.0';
    let sum = 0;
    let count = 0;
    marks.forEach(m => {
      if (isUACE) {
        const val = parseFloat(m.score);
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      } else {
        const aiScores = [];
        if (m.integration1 !== null && m.integration1 !== undefined) aiScores.push(parseFloat(m.integration1));
        if (m.integration2 !== null && m.integration2 !== undefined) aiScores.push(parseFloat(m.integration2));
        if (m.integration3 !== null && m.integration3 !== undefined) aiScores.push(parseFloat(m.integration3));
        
        let caVal = 0;
        if (aiScores.length > 0) {
          const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
          const caAverage = sumPct / aiScores.length;
          caVal = (caAverage * 20) / 100;
        }
        const examVal = parseFloat(m.exam_score || 0);
        const examW = (examVal * 80) / 100;
        const totalScore = caVal + examW;
        sum += totalScore;
        count++;
      }
    });
    return count > 0 ? (sum / count).toFixed(1) : '0.0';
  };

  // Calculate greetings based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const navGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      title: 'Academics',
      items: [
        { id: 'subjects', label: 'Subjects', icon: BookOpen },
        { id: 'academic-results', label: 'Academic Results', icon: Award },
        { id: 'performance', label: 'Performance', icon: TrendingUp }
      ]
    },
    {
      title: 'Student Services',
      items: [
        { id: 'fees', label: 'Fees', icon: CreditCard },
        { id: 'clearance', label: 'Clearance', icon: CheckSquare },
        { id: 'reports', label: 'Reports', icon: FileText },
        { id: 'notices', label: 'Notices', icon: Megaphone }
      ]
    },
    {
      title: 'Account',
      items: [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'settings', label: 'Settings', icon: Settings }
      ]
    }
  ];

  const renderSidebarContent = () => (
    <div className="flex-1 flex flex-col justify-between p-4 bg-slate-950 border-r border-slate-800">
      <div className="space-y-6">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block px-3">
              {group.title}
            </span>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-3 transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-violet-600/15 text-violet-400 border-l-2 border-violet-500' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-400'}`} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-900 pt-4">
        <button
          onClick={onLogout}
          className="w-full py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-3 text-rose-400 hover:text-rose-350 hover:bg-rose-950/20 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0 text-rose-400" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 px-4 py-3 md:px-6 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 text-slate-400 hover:text-slate-200 md:hidden cursor-pointer rounded-lg hover:bg-slate-900"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <div className="p-1 bg-slate-900/50 border border-slate-800 rounded-lg">
            <SchoolLogo className="w-8 h-8" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-[11px] sm:text-xs md:text-sm font-bold text-slate-100 tracking-tight">ST. PAUL SECONDARY SCHOOL – NASUTI</h1>
            <p className="text-[9px] text-violet-400 font-bold uppercase tracking-wider -mt-0.5">School Management System</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
          {student.photo ? (
            <img src={student.photo} className="w-6 h-6 rounded-full border border-slate-700 object-cover" alt="Student" />
          ) : (
            <div className="w-6 h-6 bg-violet-700 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
              {student.name.charAt(0)}
            </div>
          )}
          <span className="text-[10px] font-bold text-slate-200 hidden sm:inline">{student.name.toUpperCase()}</span>
          <span className="text-[9px] font-semibold text-slate-400 bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-md">
            {student.gradeClass}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-row relative overflow-hidden">
        
        {/* Left Sidebar (Desktop) */}
        <aside className="w-60 border-r border-slate-800 bg-slate-950 hidden md:flex flex-col shrink-0">
          {renderSidebarContent()}
        </aside>

        {/* Left Sidebar (Mobile overlay Drawer) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <aside className="relative w-64 max-w-xs bg-slate-950 flex flex-col h-full animate-slide-in shadow-2xl">
              {renderSidebarContent()}
            </aside>
          </div>
        )}

        {/* Content View Area */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
          
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Welcome Header */}
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
                  {getGreeting()}, {studentName} 👋
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Class: {student.gradeClass} | Stream: {student.gradeClass} | Term: {marks.length > 0 ? marks[0].term : '3'} | Year: {marks.length > 0 ? marks[0].year : '2026'}
                </p>
              </div>

              {/* Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Subjects Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                    Subjects
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-2xl font-bold tracking-tight text-slate-200">
                      {marks.length}
                    </h3>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">Registered subjects</p>
                  </div>
                </div>

                {/* Average Score Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-violet-400" />
                    Term Average
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-2xl font-bold tracking-tight text-slate-200">
                      {getAverageScore()}%
                    </h3>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">Subject Average Marks</p>
                  </div>
                </div>

                {/* Class Position Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-violet-400" />
                    Class Position
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-2xl font-bold tracking-tight text-slate-200">
                      {positions && positions.classPosition > 0 ? (
                        <>
                          {positions.classPosition}
                          <span className="text-xs font-bold text-violet-400 lowercase">{getOrdinal(positions.classPosition)}</span>
                          <span className="text-slate-500 text-xs font-normal"> / {positions.totalClassStudents}</span>
                        </>
                      ) : 'Pending'}
                    </h3>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">Based on grades</p>
                  </div>
                </div>

                {/* Fees Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-violet-400" />
                    Fees Balance
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-2xl font-bold tracking-tight text-slate-200">
                      UGX {feeBal.toLocaleString()}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide ${
                        feeStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                      }`}>
                        {feeStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Clearance Status Card */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
                    Clearance Status
                  </span>
                  <div className="space-y-0.5">
                    <h3 className={`text-2xl font-bold tracking-tight ${student.isCleared ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {student.isCleared ? 'Cleared' : 'On Hold'}
                    </h3>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">Exam entry status</p>
                  </div>
                </div>
              </div>

              {/* Grid: Announcements + Recent Attendance */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Column 1: Announcements */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5 text-violet-400" />
                      Recent Announcements
                    </span>
                    <button 
                      onClick={() => setActiveTab('notices')}
                      className="text-[9px] text-violet-400 hover:text-violet-350 font-bold uppercase tracking-wider flex items-center gap-0.5 cursor-pointer"
                    >
                      View All <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {(!announcements || announcements.length === 0) ? (
                    <div className="text-center py-8 text-xs text-slate-500 font-medium bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                      No announcements posted recently.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {announcements.slice(0, 3).map((ann, idx) => (
                        <div key={idx} className="bg-slate-900/30 border border-slate-850 rounded-xl p-4 space-y-2 relative overflow-hidden hover:border-slate-800 transition-all">
                          <div className="absolute top-0 left-0 bottom-0 w-0.5 bg-violet-650" />
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-tight">{ann.title}</h4>
                            <span className="text-[8px] text-slate-500 font-mono shrink-0">
                              {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A'}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-slate-400 leading-relaxed line-clamp-2">{ann.content}</p>
                          <div className="text-[8.5px] text-slate-500 flex justify-between font-semibold border-t border-slate-900 pt-1.5">
                            <span>By: {ann.author}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Column 2: Attendance Summary & Logs */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-violet-400" />
                      Attendance Logs ({attendancePct}%)
                    </span>
                    <span className="text-[9px] text-slate-400 font-semibold px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
                      {presentDays} / {totalAttendance} Days Present
                    </span>
                  </div>

                  {attendance.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500 font-medium bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                      No attendance logs recorded this term.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500 uppercase text-[9px] font-bold tracking-wider">
                            <th className="py-2 px-1">Date</th>
                            <th className="py-2 px-1">Status</th>
                            <th className="py-2 px-1">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendance.slice(0, 5).map((log, idx) => (
                            <tr key={idx} className="border-b border-slate-850/50 text-slate-355">
                              <td className="py-2 px-1 font-medium">{log.date}</td>
                              <td className="py-2 px-1">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide ${
                                  log.status === 'Present' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  log.status === 'Late' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-2 px-1 text-slate-500 text-[10px]">{log.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Subjects Tab */}
          {activeTab === 'subjects' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 tracking-tight">Registered Subjects</h3>
                <p className="text-xs text-slate-400 mt-1">Official subjects registered under {student.gradeClass}</p>
              </div>

              {marks.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 font-medium bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                  No subjects registered.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/35 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">Subject Name</th>
                        <th className="py-3 px-4">Category / Type</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marks.map((m, idx) => (
                        <tr key={idx} className="border-b border-slate-855 hover:bg-slate-900/20 text-slate-300">
                          <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-4 font-semibold text-slate-100">{m.subject}</td>
                          <td className="py-3 px-4 text-[10px] uppercase text-slate-400">{m.subject_type || 'Compulsory'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Academic Results Tab */}
          {activeTab === 'academic-results' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">Academic Marks & Grades</h3>
                  <p className="text-xs text-slate-400 mt-1">Continuous assessment and term examinations breakdown for {student.gradeClass}</p>
                </div>
                {positions && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-violet-400 font-bold uppercase bg-violet-950 border border-violet-900/60 px-2.5 py-1 rounded-lg">
                      Class Rank: {positions.classPosition > 0 ? `${positions.classPosition}/${positions.totalClassStudents}` : 'Pending'}
                    </span>
                    <span className="text-[9px] text-violet-400 font-bold uppercase bg-violet-950 border border-violet-900/60 px-2.5 py-1 rounded-lg">
                      Stream Rank: {positions.streamPosition > 0 ? `${positions.streamPosition}/${positions.totalStreamStudents}` : 'Pending'}
                    </span>
                  </div>
                )}
              </div>

              {marks.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 font-medium bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                  No academic marks registered for you in the database for this term.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  {isUACE ? (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/35 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                          <th className="py-3 px-4">Subject Name</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4 text-center">Score</th>
                          <th className="py-3 px-4 text-center">Grade</th>
                          <th className="py-3 px-4 text-center">Points</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marks.map((m, idx) => (
                          <tr key={idx} className="border-b border-slate-855 hover:bg-slate-900/20 text-slate-300">
                            <td className="py-3 px-4 font-bold text-slate-100">{m.subject}</td>
                            <td className="py-3 px-4 uppercase text-slate-400 text-[10px]">{m.subject_type || 'Principal'}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-violet-400">{m.score}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-slate-100">{m.grade || 'F'}</td>
                            <td className="py-3 px-4 text-center font-mono text-slate-400">{m.points || 0}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide ${
                                m.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                m.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}>
                                {m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900/35 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                          <th className="py-3 px-4">Subject Name</th>
                          <th className="py-3 px-2 text-center">AI 1 (/3)</th>
                          <th className="py-3 px-2 text-center">AI 2 (/3)</th>
                          <th className="py-3 px-2 text-center">AI 3 (/3)</th>
                          <th className="py-3 px-3 text-center">CA (/20)</th>
                          <th className="py-3 px-3 text-center">Exam (/100)</th>
                          <th className="py-3 px-3 text-center">Total (/100)</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marks.map((m, idx) => {
                          const aiScores = [];
                          if (m.integration1 !== null && m.integration1 !== undefined) aiScores.push(parseFloat(m.integration1));
                          if (m.integration2 !== null && m.integration2 !== undefined) aiScores.push(parseFloat(m.integration2));
                          if (m.integration3 !== null && m.integration3 !== undefined) aiScores.push(parseFloat(m.integration3));
                          
                          let caVal = 0;
                          if (aiScores.length > 0) {
                            const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                            const caAverage = sumPct / aiScores.length;
                            caVal = (caAverage * 20) / 100;
                          }
                          const examVal = parseFloat(m.exam_score || 0);
                          const examW = (examVal * 80) / 100;
                          const totalScore = caVal + examW;

                          return (
                            <tr key={idx} className="border-b border-slate-855 hover:bg-slate-900/20 text-slate-355">
                              <td className="py-3 px-4 font-semibold text-slate-100">{m.subject}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-400">{m.integration1 !== null && m.integration1 !== undefined ? m.integration1 : '-'}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-400">{m.integration2 !== null && m.integration2 !== undefined ? m.integration2 : '-'}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-400">{m.integration3 !== null && m.integration3 !== undefined ? m.integration3 : '-'}</td>
                              <td className="py-3 px-3 text-center font-mono text-violet-400 font-bold">{caVal > 0 ? caVal.toFixed(1) : '0.0'}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-400">{m.exam_score !== null && m.exam_score !== undefined ? m.exam_score : '-'}</td>
                              <td className="py-3 px-3 text-center font-mono text-emerald-400 font-bold">{totalScore > 0 ? totalScore.toFixed(1) : '0.0'}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide ${
                                  m.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  m.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}>
                                  {m.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {!isUACE && marks.length > 0 && (
                <div className="p-4 bg-slate-900/30 border border-slate-850 rounded-xl text-left space-y-1.5">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Grading System Reference (Uganda O-Level CBA)</h4>
                  <p className="text-slate-400 text-[10.5px] leading-relaxed">
                    Continuous Assessment (CA) accounts for **20%** of the term grade, compiled from Activities of Integration (AI 1, 2, and 3). 
                    Term exam score accounts for **80%** of the grade.
                  </p>
                  <p className="text-slate-555 text-[9.5px] italic">
                    Formula: (CA Score ÷ Maximum CA Marks × 20) + (Exam Score ÷ Maximum Exam Marks × 80).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">Academic Performance Summary</h3>
                  <p className="text-xs text-slate-400 mt-1">Analytics based on registered grades and positions</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Performance indicator 1 */}
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Term Grade Average</span>
                    <h4 className="text-3xl font-black text-violet-400 tracking-tight">{getAverageScore()}%</h4>
                    <p className="text-[10px] text-slate-400">Class Performance Status</p>
                  </div>

                  {/* Performance indicator 2 */}
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Subject Load</span>
                    <h4 className="text-3xl font-black text-slate-200 tracking-tight">{marks.length} Subjects</h4>
                    <p className="text-[10px] text-slate-400">Total Enrolled</p>
                  </div>

                  {/* Performance indicator 3 */}
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Class Raking Position</span>
                    <h4 className="text-3xl font-black text-slate-200 tracking-tight">
                      {positions && positions.classPosition > 0 ? `${positions.classPosition}${getOrdinal(positions.classPosition)}` : 'Pending'}
                    </h4>
                    <p className="text-[10px] text-slate-400">Out of {positions?.totalClassStudents || 0} students</p>
                  </div>
                </div>

                {/* Score Progression indicators */}
                <div className="space-y-4">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
                    Subject Performance Distribution
                  </span>
                  
                  {marks.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500 bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                      No records to display.
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      {marks.map((m, idx) => {
                        let scoreVal = 0;
                        if (isUACE) {
                          scoreVal = parseFloat(m.score) || 0;
                        } else {
                          const aiScores = [];
                          if (m.integration1 !== null && m.integration1 !== undefined) aiScores.push(parseFloat(m.integration1));
                          if (m.integration2 !== null && m.integration2 !== undefined) aiScores.push(parseFloat(m.integration2));
                          if (m.integration3 !== null && m.integration3 !== undefined) aiScores.push(parseFloat(m.integration3));
                          
                          let caVal = 0;
                          if (aiScores.length > 0) {
                            const sumPct = aiScores.map(score => (score / 3) * 100).reduce((a, b) => a + b, 0);
                            const caAverage = sumPct / aiScores.length;
                            caVal = (caAverage * 20) / 100;
                          }
                          const examVal = parseFloat(m.exam_score || 0);
                          const examW = (examVal * 80) / 100;
                          scoreVal = caVal + examW;
                        }

                        // Determine color
                        const barColor = scoreVal >= 75 ? 'bg-emerald-500' : scoreVal >= 50 ? 'bg-violet-500' : scoreVal >= 35 ? 'bg-amber-500' : 'bg-rose-500';

                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-355">
                              <span>{m.subject}</span>
                              <span className="font-mono">{scoreVal.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-850">
                              <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${scoreVal}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Fees Tab */}
          {activeTab === 'fees' && (
            <div className="space-y-6">
              {/* Stat panel */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">Fees Ledger & Statement</h3>
                  <p className="text-xs text-slate-400 mt-1">Detailed status of school fees billing and payments</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Total Billed Due</span>
                    <h4 className="text-2xl font-black text-slate-200 tracking-tight">UGX {feeDue.toLocaleString()}</h4>
                  </div>
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Amount Paid</span>
                    <h4 className="text-2xl font-black text-emerald-400 tracking-tight">UGX {feePaid.toLocaleString()}</h4>
                  </div>
                  <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Outstanding Balance</span>
                    <h4 className="text-2xl font-black text-rose-450 tracking-tight">UGX {feeBal.toLocaleString()}</h4>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Billing Ledger History</span>
                  
                  {fees.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500 bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                      No fees statement records found.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-850 rounded-xl">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900/35 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-bold tracking-wider">
                            <th className="py-2.5 px-4">Term / Year</th>
                            <th className="py-2.5 px-4">Account Reference</th>
                            <th className="py-2.5 px-4 text-right">Amount Due</th>
                            <th className="py-2.5 px-4 text-right">Amount Paid</th>
                            <th className="py-2.5 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fees.map((f, idx) => (
                            <tr key={idx} className="border-b border-slate-855 text-slate-300">
                              <td className="py-3 px-4 font-semibold">Term {f.term || '3'}, {f.year || '2026'}</td>
                              <td className="py-3 px-4 font-mono text-[10.5px] text-slate-450">{f.account_no || 'FEE-AC-' + student.adminNo}</td>
                              <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200">UGX {parseFloat(f.amount_due).toLocaleString()}</td>
                              <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">UGX {parseFloat(f.amount_paid).toLocaleString()}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide ${
                                  f.payment_status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-450 border border-rose-500/20'
                                }`}>
                                  {f.payment_status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Clearance Tab */}
          {activeTab === 'clearance' && (
            <div className="bg-slate-950 border border-slate-880 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100 tracking-tight">Student Clearance Cards</h3>
                  <p className="text-xs text-slate-400 mt-1">Dual-side school clearance card preview and compiler</p>
                </div>
                <button
                  onClick={handleDownloadClearanceCard}
                  disabled={clearanceCompiling}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {clearanceCompiling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Download PDF Card
                    </>
                  )}
                </button>
              </div>

              {!student.isCleared && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-start gap-3 text-xs text-rose-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <h5 className="font-bold uppercase tracking-wide">Clearance Pending / On Hold</h5>
                    <p className="mt-0.5 text-slate-400">
                      Your clearance credential status is currently set to On Hold. You must clear all pending tuition balance or requirements with school administrators to obtain exam clearance.
                    </p>
                  </div>
                </div>
              )}

              {clearanceCompiling && clearanceProgress && (
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col gap-2 text-[10px] font-mono">
                  <div className="flex justify-between font-semibold text-violet-400 uppercase tracking-wider">
                    <span>Compiling clearance card PDF...</span>
                    <span>{clearanceProgress.current} / {clearanceProgress.total} Complete</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                    <div className="h-full bg-violet-500 transition-all duration-100" style={{ width: `${(clearanceProgress.current / clearanceProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Cards Grid Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-slate-900/20 border border-slate-850 rounded-xl justify-items-center">
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-3 shadow-md flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Card Front Side</span>
                  <ClearanceCard student={student} side="front" logoBase64={schoolLogo} showWatermark={true} watermarkOpacity={0.25} />
                </div>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-3 shadow-md flex flex-col items-center">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-2">Card Back Side</span>
                  <ClearanceCard student={student} side="back" logoBase64={schoolLogo} showWatermark={true} watermarkOpacity={0.25} />
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 tracking-tight">Academic Report Card Compiler</h3>
                <p className="text-xs text-slate-400 mt-1">Compile and export official Uganda O-Level CBA or UACE terminal report sheets</p>
              </div>

              <div className="p-6 bg-slate-900/30 border border-slate-855 rounded-xl flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex gap-4 items-center">
                  <div className="p-3 bg-violet-950 border border-violet-900/60 rounded-xl text-violet-400 shrink-0">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase text-slate-200 tracking-wider">
                      Term {marks && marks.length > 0 ? marks[0].term : '3'}, {marks && marks.length > 0 ? marks[0].year : '2026'} Academic Report
                    </h4>
                    <p className="text-[10.5px] text-slate-400 leading-relaxed max-w-md">
                      Official terminal progress report card sheet containing marks, averages, class teacher comment sections, and school headteacher stamp endorsements.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCompileReport}
                  disabled={reportCompiling}
                  className="px-5 py-3 bg-violet-650 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2 shadow-sm transition-all shrink-0"
                >
                  {reportCompiling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling Report...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" /> Download Report Card
                    </>
                  )}
                </button>
              </div>

              {reportCompiling && reportProgress && (
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex flex-col gap-2 text-[10px] font-mono">
                  <div className="flex justify-between font-semibold text-violet-400 uppercase tracking-wider">
                    <span>Generating academic report sheets...</span>
                    <span>{reportProgress.current} / {reportProgress.total} Completed</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                    <div className="h-full bg-violet-500 transition-all duration-100" style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Checks */}
              <div className="border border-slate-850 rounded-xl p-5 bg-slate-900/10 space-y-3">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Report Compiler Validation Checks
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-lg border border-slate-850 font-semibold text-slate-350">
                    {marks.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span>
                      {marks.length > 0 ? `Registered Marks (${marks.length} Subjects)` : 'No academic marks in registry'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 bg-slate-950 p-3 rounded-lg border border-slate-850 font-semibold text-slate-350">
                    {marks.length > 0 && !marks.some(m => m.status !== 'Approved') ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span>
                      {marks.length > 0 && !marks.some(m => m.status !== 'Approved') ? 'All Subject Marks Approved' : 'Marks Pending Approval (Download Allowed)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notices Tab */}
          {activeTab === 'notices' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 tracking-tight">School Notice Board</h3>
                <p className="text-xs text-slate-400 mt-1">Official circulars, notifications, and school announcements</p>
              </div>

              {(!announcements || announcements.length === 0) ? (
                <div className="text-center py-12 text-xs text-slate-500 font-medium bg-slate-900/10 border border-dashed border-slate-800 rounded-xl">
                  No notifications or circulars found on the notice board.
                </div>
              ) : (
                <div className="space-y-4">
                  {announcements.map((ann, idx) => (
                    <div key={idx} className="bg-slate-900/20 border border-slate-850 rounded-xl p-5 space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-violet-600" />
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-100 uppercase tracking-tight">{ann.title}</h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {ann.createdAt ? new Date(ann.createdAt).toLocaleString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-305 leading-relaxed whitespace-pre-wrap font-medium">{ann.content}</p>
                      <div className="text-[9px] text-slate-500 flex justify-between font-bold uppercase tracking-wider border-t border-slate-900 pt-2">
                        <span>Author: {ann.author}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 tracking-tight">Student Registration Profile</h3>
                <p className="text-xs text-slate-400 mt-1">Official identity and academic registration details</p>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-start">
                {student.photo ? (
                  <img src={student.photo} className="w-32 h-36 rounded-xl border border-slate-800 object-cover shadow" alt="Photo" />
                ) : (
                  <div className="w-32 h-36 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-4xl text-slate-700">
                    👤
                  </div>
                )}

                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Full Name</span>
                    <span className="text-slate-200 uppercase">{student.name}</span>
                  </div>

                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Admission Number</span>
                    <span className="text-slate-200 uppercase font-mono">{student.adminNo}</span>
                  </div>

                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Grade & Class Stream</span>
                    <span className="text-slate-200 uppercase">{student.gradeClass}</span>
                  </div>

                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Boarding Status</span>
                    <span className="text-slate-200 uppercase">{student.boardingStatus || 'Day Scholar'}</span>
                  </div>

                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Gender</span>
                    <span className="text-slate-200 uppercase">{student.gender || 'Male'}</span>
                  </div>

                  <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Exam Clearance</span>
                    <span className={`uppercase font-bold ${student.isCleared ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {student.isCleared ? 'Cleared' : 'Pending Clearance'}
                    </span>
                  </div>

                  {student.parentName && (
                    <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Guardian Name</span>
                      <span className="text-slate-200 uppercase">{student.parentName}</span>
                    </div>
                  )}

                  {student.parentContact && (
                    <div className="bg-slate-900/30 p-3 rounded-lg border border-slate-850 space-y-1">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Guardian Phone Contact</span>
                      <span className="text-slate-200 font-mono">{student.parentContact}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-bold text-slate-100 tracking-tight">Portal & Account Settings</h3>
                <p className="text-xs text-slate-400 mt-1">Manage system preferences and check security configurations</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-900/20 border border-slate-850 rounded-xl space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wide">Account Status</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-500 uppercase block">Account ID</span>
                      <span className="text-slate-300 font-mono">{student.id}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-500 uppercase block">System Permission Role</span>
                      <span className="text-slate-300">Student Portal access</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/20 border border-slate-850 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wide">Portal Security</h4>
                  <p className="text-slate-400 text-xs leading-relaxed max-w-lg">
                    Your password credentials are managed securely in the school's central database server. If you require a password reset or want to configure multi-factor logins, please contact St. Paul Secondary School IT administrators or your Class Teacher.
                  </p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
