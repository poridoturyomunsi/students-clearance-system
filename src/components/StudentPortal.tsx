import React, { useEffect, useState } from 'react';
import { GraduationCap, LogOut, Download, CheckCircle2, XCircle, DollarSign, CalendarDays, Award, AlertCircle, RefreshCw, Megaphone, Users, Layers } from 'lucide-react';
import SchoolLogo from './SchoolLogo.tsx';
import ClearanceCard from './ClearanceCard.tsx';
import { Student } from '../types.ts';
import { fetchIntegratedStudentData, generateReportCards, getApiBaseUrl, fetchPdfTaskStatus } from '../utils/api.ts';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'academic' | 'clearance' | 'report'>('overview');
  const [reportCompiling, setReportCompiling] = useState(false);
  const [reportProgress, setReportProgress] = useState<{ current: number; total: number } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = studentNo || adminNo;
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
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading student files...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-xl">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-black uppercase text-slate-200">Retrieval Failed</h3>
          <p className="text-xs text-slate-500">{error || 'Unable to sync records'}</p>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex-1 py-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={onLogout}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { student, marks, attendance, fees, positions, announcements } = data;
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
      if (res.success && res.filename) {
        window.open(`${getApiBaseUrl()}/api/pdf/download/${res.filename}`, '_blank');
      }
    } catch (err) {
      alert('Could not export clearance card: ' + err);
    }
  };

  const handleCompileReport = async () => {
    // Check if marks are approved
    const totalSubjects = marks.length;
    if (totalSubjects === 0) {
      alert('No academic marks registered for you in the database for this term.');
      return;
    }

    const unapproved = marks.some(m => m.status !== 'Approved');
    if (unapproved) {
      alert('Your subject marks have not been fully approved by the school administrator yet. Please check back later.');
      return;
    }

    // Determine active term & year from first marks record if available, fallback to '2' / 2026
    const activeMark = marks && marks.length > 0 ? marks[0] : null;
    const targetTerm = activeMark ? String(activeMark.term) : '2';
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
            window.open(`${getApiBaseUrl()}/api/pdf/download/${statusRes.filename}`, '_blank');
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Navbar */}
      <header className="bg-slate-950 border-b border-slate-800 shrink-0 px-4 py-4 md:px-6 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1 bg-slate-900/50 border border-slate-800 rounded-lg shadow-inner">
            <SchoolLogo className="w-10 h-10" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-100 uppercase tracking-tight">Student Portal</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">St. Paul Secondary School</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
          {student.photo ? (
            <img src={student.photo} className="w-6 h-6 rounded-full border border-slate-700 object-cover" alt="Student" />
          ) : (
            <div className="w-6 h-6 bg-indigo-650 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">
              {student.name.charAt(0)}
            </div>
          )}
          <span className="text-[10px] font-black text-slate-200 hidden md:inline">{student.name.toUpperCase()}</span>
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-red-400 transition-colors cursor-pointer rounded-md hover:bg-slate-800"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar info */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl text-center space-y-4 shadow-md">
            {student.photo ? (
              <img src={student.photo} className="w-24 h-28 mx-auto rounded-xl border border-slate-800 object-cover shadow" alt="Photo" />
            ) : (
              <div className="w-24 h-28 mx-auto bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-4xl text-slate-650">
                👤
              </div>
            )}

            <div>
              <h2 className="text-sm font-black uppercase text-slate-200 tracking-tight">{student.name}</h2>
              <span className="text-[10px] text-slate-500 font-bold tracking-wider block mt-1 uppercase">{student.adminNo}</span>
              <span className="inline-block mt-2 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-indigo-950 border border-indigo-900/60 text-indigo-400 rounded-full">
                {student.gradeClass}
              </span>
            </div>

            <div className="border-t border-slate-850 pt-3 text-left space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500 font-bold uppercase">Gender:</span>
                <span className="text-slate-300 font-medium uppercase">{student.gender || 'Male'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500 font-bold uppercase">Boarding:</span>
                <span className="text-slate-300 font-medium uppercase">{student.boardingStatus || 'Day Scholar'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500 font-bold uppercase">Clearance:</span>
                <span className={`font-bold uppercase ${student.isCleared ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {student.isCleared ? 'Cleared' : 'On Hold'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Tabs Selector */}
          <div className="bg-slate-950 border border-slate-850 p-2.5 rounded-2xl flex flex-col gap-1 shadow-md">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full py-2.5 px-4 rounded-xl text-left text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" /> Overview Dashboard
            </button>
            <button
              onClick={() => setActiveTab('academic')}
              className={`w-full py-2.5 px-4 rounded-xl text-left text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'academic' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Award className="w-4 h-4" /> Academic Record
            </button>
            <button
              onClick={() => setActiveTab('clearance')}
              className={`w-full py-2.5 px-4 rounded-xl text-left text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'clearance' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> Clearance Card preview
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`w-full py-2.5 px-4 rounded-xl text-left text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'report' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Award className="w-4 h-4" /> Report Card Compiler
            </button>
          </div>
        </div>

        {/* Tab content panel */}
        <div className="md:col-span-3 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats & Rank Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Class Rank Card */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md flex items-start justify-between">
                  <div className="space-y-2.5 w-full">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      Class Position
                    </span>
                    <div className="space-y-0.5">
                      <h3 className="text-xl font-black tracking-tight text-slate-200">
                        {positions && positions.classPosition > 0 ? (
                          <>
                            {positions.classPosition}
                            <span className="text-xs font-bold text-indigo-400 lowercase">{getOrdinal(positions.classPosition)}</span>
                            <span className="text-slate-550 text-xs font-normal"> / {positions.totalClassStudents}</span>
                          </>
                        ) : 'Pending'}
                      </h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Based on Subject Average</p>
                    </div>
                  </div>
                </div>

                {/* Stream Rank Card */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md flex items-start justify-between">
                  <div className="space-y-2.5 w-full">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Stream Position
                    </span>
                    <div className="space-y-0.5">
                      <h3 className="text-xl font-black tracking-tight text-slate-200">
                        {positions && positions.streamPosition > 0 ? (
                          <>
                            {positions.streamPosition}
                            <span className="text-xs font-bold text-violet-400 lowercase">{getOrdinal(positions.streamPosition)}</span>
                            <span className="text-slate-550 text-xs font-normal"> / {positions.totalStreamStudents}</span>
                          </>
                        ) : 'Pending'}
                      </h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Within {student.gradeClass}</p>
                    </div>
                  </div>
                </div>

                {/* Fees Card */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md flex items-start justify-between">
                  <div className="space-y-2.5 w-full">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                      Fees Account
                    </span>
                    <div className="space-y-0.5">
                      <h3 className="text-base font-black tracking-tight text-slate-200">
                        UGX {feeBal.toLocaleString()}
                      </h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                        Status: <span className={feeStatus === 'Paid' ? 'text-emerald-400' : 'text-rose-400'}>{feeStatus}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Attendance Card */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md flex items-start justify-between">
                  <div className="space-y-2.5 w-full">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
                      Attendance Rate
                    </span>
                    <div className="space-y-0.5">
                      <h3 className="text-xl font-black tracking-tight text-slate-200">
                        {attendancePct}%
                      </h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{presentDays} of {totalAttendance} Days</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* School Announcements */}
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md space-y-4">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-indigo-400 animate-bounce" />
                  School Announcements & Notices
                </span>
                {(!announcements || announcements.length === 0) ? (
                  <div className="text-center py-6 text-xs text-slate-500 font-medium bg-slate-900/20 border border-dashed border-slate-850 rounded-xl">
                    No official announcements posted recently.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {announcements.map((ann, idx) => (
                      <div key={idx} className="bg-slate-900/40 border border-slate-850 rounded-xl p-4 space-y-2 relative overflow-hidden transition-all hover:border-slate-850">
                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-500" />
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-tight">{ann.title}</h4>
                          <span className="text-[9px] text-slate-500 font-mono shrink-0">
                            {ann.createdAt ? new Date(ann.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium whitespace-pre-wrap">{ann.content}</p>
                        <div className="text-[9px] text-slate-500 flex justify-between font-bold uppercase tracking-wider border-t border-slate-850/50 pt-1.5">
                          <span>Posted By: {ann.author}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attendance Registry Logs */}
              <div className="bg-slate-950 border border-slate-850 rounded-2xl p-5 shadow-md">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-4">
                  Recent Attendance Register Logs
                </span>
                {attendance.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500 font-medium bg-slate-900/20 border border-dashed border-slate-850 rounded-xl">
                    No attendance logs recorded this term.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider">
                          <th className="py-2.5">Date</th>
                          <th className="py-2.5">Status</th>
                          <th className="py-2.5">Remarks / Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendance.slice(0, 5).map((log, idx) => (
                          <tr key={idx} className="border-b border-slate-850 font-medium text-slate-200">
                            <td className="py-2.5">{log.date}</td>
                            <td className="py-2.5">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                                log.status === 'Present' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                log.status === 'Late' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-slate-500">{log.remarks || 'None'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 shadow-md space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-200">Academic Marks & Grades</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Continuous assessment and terminal exam records for {student.gradeClass}
                  </p>
                </div>
                {positions && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase bg-indigo-950 border border-indigo-900/60 px-2.5 py-1 rounded-lg">
                      Class Rank: {positions.classPosition > 0 ? `${positions.classPosition}/${positions.totalClassStudents}` : 'Pending'}
                    </span>
                    <span className="text-[10px] text-violet-400 font-bold uppercase bg-violet-950 border border-violet-900/60 px-2.5 py-1 rounded-lg">
                      Stream Rank: {positions.streamPosition > 0 ? `${positions.streamPosition}/${positions.totalStreamStudents}` : 'Pending'}
                    </span>
                  </div>
                )}
              </div>

              {marks.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 font-medium bg-slate-900/20 border border-dashed border-slate-850 rounded-xl">
                  No academic marks registered for you in the database for this term.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-850 rounded-xl bg-slate-900/10">
                  {isUACE ? (
                    <table className="w-full min-w-[800px] text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider">
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
                          <tr key={idx} className="border-b border-slate-850/50 hover:bg-slate-900/20 font-medium text-slate-200 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-100">{m.subject}</td>
                            <td className="py-3 px-4 uppercase text-slate-400 text-[10px]">{m.subject_type || 'Principal'}</td>
                            <td className="py-3 px-4 text-center font-mono text-indigo-300 font-bold">{m.score}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-slate-200">{m.grade || 'F'}</td>
                            <td className="py-3 px-4 text-center font-mono text-slate-400">{m.points || 0}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
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
                    <table className="w-full min-w-[800px] text-[11px] text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider">
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
                            <tr key={idx} className="border-b border-slate-850/50 hover:bg-slate-900/20 font-medium text-slate-200 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-100">{m.subject}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-350">{m.integration1 !== null && m.integration1 !== undefined ? m.integration1 : '-'}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-350">{m.integration2 !== null && m.integration2 !== undefined ? m.integration2 : '-'}</td>
                              <td className="py-3 px-2 text-center font-mono text-slate-350">{m.integration3 !== null && m.integration3 !== undefined ? m.integration3 : '-'}</td>
                              <td className="py-3 px-3 text-center font-mono text-indigo-400 font-bold">{caVal > 0 ? caVal.toFixed(1) : '0.0'}</td>
                              <td className="py-3 px-3 text-center font-mono text-slate-400">{m.exam_score !== null && m.exam_score !== undefined ? m.exam_score : '-'}</td>
                              <td className="py-3 px-3 text-center font-mono text-emerald-400 font-bold">{totalScore > 0 ? totalScore.toFixed(1) : '0.0'}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
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
                <div className="p-4 mt-4 bg-slate-900/20 border border-slate-850 rounded-xl space-y-1.5 text-left" style={{ fontSize: '9.5pt' }}>
                  <h4 className="font-black uppercase text-slate-300 tracking-wider">How Final Percentage is Computed</h4>
                  <p className="text-slate-400 leading-relaxed font-medium">
                    Final Percentage = (CA Score ÷ Maximum CA Marks × CA Weight) + (Exam Score ÷ Maximum Exam Marks × Exam Weight)
                  </p>
                  <p className="text-slate-500 font-medium italic text-[8.5pt]">
                    Example:<br />
                    If CA Weight = 20% and Exam Weight = 80%:<br />
                    Final Percentage = (CA Score ÷ Maximum CA Marks × 20) + (Exam Score ÷ Maximum Exam Marks × 80).
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'clearance' && (
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 shadow-md space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase text-slate-200">Clearance Cards Preview</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Dual-side student clearance credential</p>
                </div>
                <button
                  onClick={handleDownloadClearanceCard}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" /> Download PDF Card
                </button>
              </div>

              {/* Cards Grid Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 bg-slate-900/30 border border-slate-850 rounded-xl overflow-auto justify-items-center">
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-2 shadow-lg">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-2 text-center">Card Front Side</span>
                  <ClearanceCard student={student} side="front" logoBase64={schoolLogo} showWatermark={true} watermarkOpacity={0.25} />
                </div>
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 p-2 shadow-lg">
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-2 text-center">Card Back Side</span>
                  <ClearanceCard student={student} side="back" logoBase64={schoolLogo} showWatermark={true} watermarkOpacity={0.25} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="bg-slate-950 border border-slate-850 rounded-2xl p-6 shadow-md space-y-6">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-200">Academic Report Cards Compiler</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Download your official Uganda O-Level CBA or UACE report sheets</p>
              </div>

              <div className="p-6 bg-slate-900/30 border border-slate-850 rounded-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex gap-4 items-center">
                  <div className="p-3 bg-indigo-950 border border-indigo-900/60 rounded-xl text-indigo-400 shrink-0">
                    <Award className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase text-slate-200 tracking-wider">
                      {marks && marks.length > 0 ? ((marks[0].term === '1' || marks[0].term === '2' || marks[0].term === '3') ? `Term ${marks[0].term}` : marks[0].term) : 'Term 2'}, {marks && marks.length > 0 ? marks[0].year : '2026'} Academic Report
                    </h4>
                    <p className="text-[10.5px] text-slate-500 leading-normal max-w-md font-medium">
                      Contains marks, continuous assessment weights, rank, averages, and signatures. Available once subject teachers submit and admin approves.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCompileReport}
                  disabled={reportCompiling}
                  className="px-5 py-3 bg-indigo-650 hover:bg-indigo-650/80 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-2 shadow"
                >
                  {reportCompiling ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Compiling PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> Download Report Card
                    </>
                  )}
                </button>
              </div>

              {reportCompiling && reportProgress && (
                <div className="mt-3 bg-indigo-950/40 p-3.5 rounded-2xl border border-indigo-900/30 flex flex-col gap-2 text-[10px] font-mono animate-fade-in">
                  <div className="flex justify-between font-bold text-indigo-300">
                    <span>COMPILING ACADEMIC REPORT CARD...</span>
                    <span>{reportProgress.current} / {reportProgress.total} COMPLETED</span>
                  </div>
                  <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-100" style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Status indicators */}
              <div className="border border-slate-850 rounded-xl p-4 space-y-3 bg-slate-900/10">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                  Report Compilation Pre-checks
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 font-semibold">
                    {marks.length > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span className="text-slate-350">
                      {marks.length > 0 ? `Registered Marks (${marks.length} Subjects)` : 'No marks registered yet'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 font-semibold">
                    {marks.length > 0 && !marks.some(m => m.status !== 'Approved') ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span className="text-slate-350">
                      {marks.length > 0 && !marks.some(m => m.status !== 'Approved') ? 'All marks Approved by Admin' : 'Pending Admin Approval'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
