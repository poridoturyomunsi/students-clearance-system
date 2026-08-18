import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  X, 
  Search, 
  User, 
  BarChart3, 
  Calendar, 
  Layers,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { fetchAttendanceGrid, scanGateCard } from '../utils/api.ts';
import { getStoredAttendance, formatTodayDate, processQRScan } from '../lib/attendanceStore.ts';
import { Student } from '../types.ts';

interface ClassStreamCounts {
  A: number;
  B: number;
  C: number;
  total: number;
}

type MatrixData = Record<string, ClassStreamCounts>;

interface PresentStudentItem {
  id: string;
  adminNo: string;
  name: string;
  gradeClass: string;
  className: string;
  streamName: string;
  photo?: string;
  time_in?: string;
  time_out?: string;
  status?: string;
  date?: string;
}

interface LiveAttendanceDashboardProps {
  students?: Student[];
}

export const LiveAttendanceDashboard: React.FC<LiveAttendanceDashboardProps> = ({ students = [] }) => {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [timeAgo, setTimeAgo] = useState<string>('Just now');

  // Matrix states
  const [registeredMatrix, setRegisteredMatrix] = useState<MatrixData>({
    'S.1': { A: 0, B: 0, C: 0, total: 0 },
    'S.2': { A: 0, B: 0, C: 0, total: 0 },
    'S.3': { A: 0, B: 0, C: 0, total: 0 },
    'S.4': { A: 0, B: 0, C: 0, total: 0 },
    'S.5': { A: 0, B: 0, C: 0, total: 0 },
    'S.6': { A: 0, B: 0, C: 0, total: 0 }
  });

  const [presentMatrix, setPresentMatrix] = useState<MatrixData>({
    'S.1': { A: 0, B: 0, C: 0, total: 0 },
    'S.2': { A: 0, B: 0, C: 0, total: 0 },
    'S.3': { A: 0, B: 0, C: 0, total: 0 },
    'S.4': { A: 0, B: 0, C: 0, total: 0 },
    'S.5': { A: 0, B: 0, C: 0, total: 0 },
    'S.6': { A: 0, B: 0, C: 0, total: 0 }
  });

  const [presentStudentsList, setPresentStudentsList] = useState<PresentStudentItem[]>([]);
  const [totalRegistered, setTotalRegistered] = useState<number>(0);
  const [totalPresent, setTotalPresent] = useState<number>(0);

  // Drill-down Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalFilter, setModalFilter] = useState<{ className?: string; streamName?: string }>({});
  const [modalSearch, setModalSearch] = useState<string>('');

  // -------------------------------------------------------------
  // HELPER: Parse Grade Class into Standard Class (S.1..S.6) and Stream (A, B, C)
  // -------------------------------------------------------------
  const parseClassStream = useCallback((gradeClass: string): { className: string; streamName: 'A' | 'B' | 'C' } => {
    if (!gradeClass) return { className: 'S.1', streamName: 'A' };
    let normalized = String(gradeClass).trim();
    const sMatch = normalized.match(/^[sS]([1-6])(\s.*|$)/);
    if (sMatch) {
      normalized = 'S.' + sMatch[1] + sMatch[2];
    }
    const parts = normalized.split(/\s+/);
    const className = parts[0] || 'S.1';
    let streamRaw = parts.slice(1).join(' ') || '';

    let streamName: 'A' | 'B' | 'C' = 'A';
    if (!streamRaw) {
      streamName = 'A';
    } else if (streamRaw.toUpperCase() === 'A' || streamRaw.toUpperCase().startsWith('ART')) {
      streamName = 'A';
    } else if (streamRaw.toUpperCase() === 'B' || streamRaw.toUpperCase().startsWith('SCI')) {
      streamName = 'B';
    } else if (streamRaw.toUpperCase() === 'C') {
      streamName = 'C';
    } else {
      streamName = 'A';
    }

    return { className, streamName };
  }, []);

  // -------------------------------------------------------------
  // FETCH DATA: Combination of API + Stored Attendance
  // -------------------------------------------------------------
  const loadAttendanceData = useCallback(async () => {
    setError(null);
    try {
      // 1. Try Backend API first
      const data = await fetchAttendanceGrid(period);
      if (data && data.registered && data.present) {
        setRegisteredMatrix(data.registered);
        setPresentMatrix(data.present);
        setPresentStudentsList(data.studentsList || []);
        setTotalRegistered(data.totalRegistered || 0);
        setTotalPresent(data.totalPresent || 0);
        setLastUpdated(new Date());
        setLoading(false);
        setConnectionStatus('connected');
        return;
      }
    } catch (err: any) {
      console.warn('[LiveAttendance] Backend API unreachable, calculating from local store & props:', err.message);
    }

    // 2. Fallback to Local Store & Student Props
    try {
      const allStored = getStoredAttendance();
      const todayStr = formatTodayDate();
      const filteredLogs = period === 'today' 
        ? allStored.filter(r => r.date === todayStr)
        : allStored;

      // Registered Matrix calculation
      const regMat: MatrixData = {
        'S.1': { A: 0, B: 0, C: 0, total: 0 },
        'S.2': { A: 0, B: 0, C: 0, total: 0 },
        'S.3': { A: 0, B: 0, C: 0, total: 0 },
        'S.4': { A: 0, B: 0, C: 0, total: 0 },
        'S.5': { A: 0, B: 0, C: 0, total: 0 },
        'S.6': { A: 0, B: 0, C: 0, total: 0 }
      };

      const studentMap = new Map<string, Student>();
      students.forEach(st => {
        studentMap.set(String(st.id), st);
        if (st.adminNo) studentMap.set(String(st.adminNo), st);
        if (st.studentNo) studentMap.set(String(st.studentNo), st);

        const { className, streamName } = parseClassStream(st.gradeClass);
        if (regMat[className]) {
          regMat[className][streamName] += 1;
          regMat[className].total += 1;
        }
      });

      // Present Matrix calculation (Enforce 1 count per student per date)
      const presMat: MatrixData = {
        'S.1': { A: 0, B: 0, C: 0, total: 0 },
        'S.2': { A: 0, B: 0, C: 0, total: 0 },
        'S.3': { A: 0, B: 0, C: 0, total: 0 },
        'S.4': { A: 0, B: 0, C: 0, total: 0 },
        'S.5': { A: 0, B: 0, C: 0, total: 0 },
        'S.6': { A: 0, B: 0, C: 0, total: 0 }
      };

      const countedKeys = new Set<string>();
      const presentList: PresentStudentItem[] = [];

      const sortedLogs = [...filteredLogs].sort((a, b) => {
        const aIsOut = Boolean((a as any).timeOut || (a as any).time_out || (a.status && String(a.status).toUpperCase().includes('CHECKED OUT')));
        const bIsOut = Boolean((b as any).timeOut || (b as any).time_out || (b.status && String(b.status).toUpperCase().includes('CHECKED OUT')));
        if (aIsOut && !bIsOut) return -1;
        if (!aIsOut && bIsOut) return 1;
        return 0;
      });

      sortedLogs.forEach((log: any) => {
        const st = studentMap.get(String(log.studentId)) || studentMap.get(String(log.studentNo));
        const realStudentId = st ? st.id : log.studentId;
        const uniqueKey = `${realStudentId}_${log.date}`;

        if (!countedKeys.has(uniqueKey)) {
          countedKeys.add(uniqueKey);
          const gradeClass = st ? st.gradeClass : log.gradeClass;
          const { className, streamName } = parseClassStream(gradeClass);

          if (presMat[className]) {
            presMat[className][streamName] += 1;
            presMat[className].total += 1;
          }

          const isCheckedOut = Boolean(log.timeOut || log.time_out || (log.status && String(log.status).toUpperCase().includes('CHECKED OUT')));

          presentList.push({
            id: realStudentId,
            adminNo: log.studentNo || (st ? st.adminNo : ''),
            name: st ? st.name : log.studentName,
            gradeClass,
            className,
            streamName,
            photo: log.photoUrl || (st ? st.photo : undefined),
            time_in: log.timeIn || log.time_in,
            time_out: log.timeOut || log.time_out,
            status: isCheckedOut ? 'Checked Out' : (log.status === 'PRESENT' ? 'Present' : log.status),
            date: log.date
          });
        }
      });

      setRegisteredMatrix(regMat);
      setPresentMatrix(presMat);
      setPresentStudentsList(presentList);
      setTotalRegistered(students.length);
      setTotalPresent(countedKeys.size);
      setLastUpdated(new Date());
      setLoading(false);
      setConnectionStatus('connected');
    } catch (e: any) {
      console.error('[LiveAttendance] Error calculating local attendance stats:', e);
      setError('Unable to load live attendance data.');
      setLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [period, students, parseClassStream]);

  // Initial load and periodic refresh
  useEffect(() => {
    loadAttendanceData();

    // Event listener for clock in events
    const handleUpdateEvent = () => {
      loadAttendanceData();
    };

    window.addEventListener('attendance-updated', handleUpdateEvent);
    window.addEventListener('storage', handleUpdateEvent);

    // Poll every 10 seconds for real-time sync
    const timer = setInterval(() => {
      loadAttendanceData();
    }, 10000);

    return () => {
      window.removeEventListener('attendance-updated', handleUpdateEvent);
      window.removeEventListener('storage', handleUpdateEvent);
      clearInterval(timer);
    };
  }, [loadAttendanceData]);

  // Update "Last updated: X seconds ago" ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      const seconds = Math.floor((new Date().getTime() - lastUpdated.getTime()) / 1000);
      if (seconds < 5) setTimeAgo('Just now');
      else if (seconds < 60) setTimeAgo(`${seconds}s ago`);
      else setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
    }, 2000);

    return () => clearInterval(ticker);
  }, [lastUpdated]);

  // -------------------------------------------------------------
  // CALCULATED COLUMN & GRAND TOTALS
  // -------------------------------------------------------------
  const classesList = ['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'];

  const columnTotals = useMemo(() => {
    let sumA = 0;
    let sumB = 0;
    let sumC = 0;
    let grandTotal = 0;

    classesList.forEach(cls => {
      const counts = presentMatrix[cls] || { A: 0, B: 0, C: 0, total: 0 };
      sumA += counts.A;
      sumB += counts.B;
      sumC += counts.C;
      grandTotal += counts.total;
    });

    return { sumA, sumB, sumC, grandTotal };
  }, [presentMatrix]);

  const registeredColumnTotals = useMemo(() => {
    let regA = 0;
    let regB = 0;
    let regC = 0;
    let grandReg = 0;

    classesList.forEach(cls => {
      const counts = registeredMatrix[cls] || { A: 0, B: 0, C: 0, total: 0 };
      regA += counts.A;
      regB += counts.B;
      regC += counts.C;
      grandReg += counts.total;
    });

    return { regA, regB, regC, grandReg };
  }, [registeredMatrix]);

  const attendanceRate = useMemo(() => {
    const total = totalRegistered || registeredColumnTotals.grandReg;
    if (total === 0) return '0.0';
    return ((columnTotals.grandTotal / total) * 100).toFixed(1);
  }, [columnTotals.grandTotal, totalRegistered, registeredColumnTotals.grandReg]);

  const notClockedIn = useMemo(() => {
    const total = totalRegistered || registeredColumnTotals.grandReg;
    return Math.max(0, total - columnTotals.grandTotal);
  }, [totalRegistered, registeredColumnTotals.grandReg, columnTotals.grandTotal]);

  const currentlyOnCampusCount = useMemo(() => {
    return presentStudentsList.filter(s => {
      const isOut = Boolean(s.time_out || s.status === 'CHECKED OUT' || s.status === 'Checked Out');
      return !isOut;
    }).length;
  }, [presentStudentsList]);

  const clockedOutCount = useMemo(() => {
    return presentStudentsList.filter(s => {
      return Boolean(s.time_out || s.status === 'CHECKED OUT' || s.status === 'Checked Out');
    }).length;
  }, [presentStudentsList]);

  // -------------------------------------------------------------
  // DRILL-DOWN MODAL LIST FILTERING
  // -------------------------------------------------------------
  const filteredModalStudents = useMemo(() => {
    return presentStudentsList.filter(st => {
      const isOut = Boolean(st.time_out || st.status === 'CHECKED OUT' || st.status === 'Checked Out');
      if (modalTitle.includes('Clocked Out') && !isOut) return false;
      if (modalTitle.includes('Currently On Campus') && isOut) return false;
      if (modalFilter.className && st.className !== modalFilter.className) return false;
      if (modalFilter.streamName && st.streamName !== modalFilter.streamName) return false;
      if (modalSearch.trim()) {
        const query = modalSearch.toLowerCase();
        const matchesName = st.name.toLowerCase().includes(query);
        const matchesAdmin = st.adminNo.toLowerCase().includes(query);
        const matchesClass = st.gradeClass.toLowerCase().includes(query);
        return matchesName || matchesAdmin || matchesClass;
      }
      return true;
    });
  }, [presentStudentsList, modalFilter, modalSearch, modalTitle]);

  const openDrillDown = (title: string, className?: string, streamName?: string) => {
    setModalTitle(title);
    setModalFilter({ className, streamName });
    setModalSearch('');
    setModalOpen(true);
  };

  const handleDirectCheckOut = async (st: PresentStudentItem) => {
    try {
      processQRScan(st.adminNo || st.id, students, 'CHECK_OUT');
      await scanGateCard({
        scanValue: st.adminNo || st.id,
        direction: 'clock-out'
      });
    } catch (e) {
      console.warn('[LiveAttendance] Direct check out notice:', e);
    } finally {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendance-updated'));
      }
      loadAttendanceData();
    }
  };

  // Max value for bar chart scaling
  const maxBarValue = useMemo(() => {
    let maxVal = 10;
    classesList.forEach(cls => {
      const m = presentMatrix[cls] || { A: 0, B: 0, C: 0 };
      maxVal = Math.max(maxVal, m.A, m.B, m.C);
    });
    return Math.ceil(maxVal * 1.15);
  }, [presentMatrix]);

  // Render Error UI if broken
  if (error && !loading && totalRegistered === 0) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center shadow-xl my-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-950/50 border border-rose-800 text-rose-400 mb-4 animate-pulse">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-100 uppercase tracking-wider">Unable to load live attendance data</h3>
        <p className="text-slate-400 text-xs mt-2 max-w-md mx-auto">
          {error} Please check network connectivity or backend server status.
        </p>
        <button
          onClick={loadAttendanceData}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> RETRY CONNECTION
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-950/60 rounded-2xl border border-slate-850 p-4 md:p-6 shadow-2xl space-y-6 my-6 select-none no-print">
      
      {/* 1. TOP SECTION HEADER & FILTERS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-400" />
              STUDENTS PRESENT TODAY
            </h2>
            
            {/* Connection Status Badge */}
            {connectionStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                ● LIVE ATTENDANCE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 text-[10px] font-black uppercase tracking-widest">
                <WifiOff className="w-3 h-3" />
                LIVE CONNECTION LOST
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-xs font-mono mt-1.5">
            <span className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-indigo-400" /> Last updated: <strong className="text-slate-200">{timeAgo}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">Real-time gate clock-in database feed</span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Timeframe Selector */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase transition cursor-pointer ${
                period === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase transition cursor-pointer ${
                period === 'week' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase transition cursor-pointer ${
                period === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              30 Days
            </button>
          </div>

          <button
            onClick={() => loadAttendanceData()}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 disabled:opacity-50 cursor-pointer"
            title="Refresh Attendance Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. SUMMARY STATISTICS CARDS (6 CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* TOTAL REGISTERED */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 shadow-xl">
          <div className="flex justify-between items-center text-slate-400 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>TOTAL REGISTERED</span>
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-slate-100 font-mono">
            {(totalRegistered || registeredColumnTotals.grandReg).toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono font-medium truncate">Total master population</p>
        </div>

        {/* PRESENT TODAY */}
        <div 
          onClick={() => openDrillDown('All Present Students Today')}
          className="group rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 p-4 border border-indigo-500/30 hover:border-indigo-400/60 transition-all duration-200 shadow-xl cursor-pointer hover:scale-[1.01]"
        >
          <div className="flex justify-between items-center text-indigo-300 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>PRESENT TODAY</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-white flex items-baseline justify-between font-mono">
            <span>{columnTotals.grandTotal.toLocaleString()}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition" />
          </div>
          <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">Unique students verified today</p>
        </div>

        {/* CURRENTLY ON CAMPUS */}
        <div 
          onClick={() => openDrillDown('Students Currently On Campus', undefined, undefined)}
          className="group rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 p-4 border border-emerald-500/30 hover:border-emerald-400/60 transition-all duration-200 shadow-xl cursor-pointer hover:scale-[1.01]"
        >
          <div className="flex justify-between items-center text-emerald-300 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>CURRENTLY ON CAMPUS</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-emerald-400 font-mono">
            {currentlyOnCampusCount}
          </div>
          <p className="text-[10px] text-emerald-400/80 mt-1 font-mono truncate">Inside gate (not clocked out)</p>
        </div>

        {/* CLOCKED OUT */}
        <div 
          onClick={() => openDrillDown('Clocked Out Students Today')}
          className="group rounded-2xl bg-slate-900 p-4 border border-slate-800 shadow-xl cursor-pointer hover:border-amber-500/40 transition"
        >
          <div className="flex justify-between items-center text-amber-400 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>CLOCKED OUT</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-amber-400 font-mono">
            {clockedOutCount}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">Departed school campus</p>
        </div>

        {/* NOT CLOCKED IN */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 shadow-xl">
          <div className="flex justify-between items-center text-purple-400 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>NOT CLOCKED IN</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-purple-400 font-mono">
            {notClockedIn.toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">Awaiting arrival today</p>
        </div>

        {/* ATTENDANCE RATE */}
        <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 shadow-xl">
          <div className="flex justify-between items-center text-indigo-300 text-[10px] font-black uppercase tracking-wider font-mono">
            <span>ATTENDANCE RATE</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl lg:text-3xl font-black mt-2 text-indigo-300 font-mono">
            {attendanceRate}%
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, parseFloat(attendanceRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. VISUAL GRAPH + TABLES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* GROUPED BAR CHART (Left / Top 7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Stream Attendance Distribution (S.1 – S.6)
            </h3>
            
            {/* Stream Legend */}
            <div className="flex items-center gap-3 text-[10px] font-mono font-bold">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Stream A
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Stream B
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> Stream C
              </span>
            </div>
          </div>

          {/* Grouped Bar Chart Bars Canvas */}
          <div className="w-full flex-1 min-h-[220px] flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-slate-800/80">
            {classesList.map(cls => {
              const counts = presentMatrix[cls] || { A: 0, B: 0, C: 0 };
              const hA = Math.max(4, Math.round((counts.A / maxBarValue) * 180));
              const hB = Math.max(4, Math.round((counts.B / maxBarValue) * 180));
              const hC = Math.max(4, Math.round((counts.C / maxBarValue) * 180));

              return (
                <div key={cls} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer" onClick={() => openDrillDown(`All Students in ${cls}`, cls)}>
                  {/* Bars Container */}
                  <div className="w-full flex items-end justify-center gap-1.5 h-[190px]">
                    {/* Bar A */}
                    <div 
                      title={`${cls} Stream A: ${counts.A} present`}
                      style={{ height: `${hA}px` }} 
                      className="w-3.5 sm:w-5 bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-t-md hover:from-indigo-600 hover:to-indigo-400 transition-all duration-200 relative group/bar shadow-md"
                    >
                      <span className="opacity-0 group-hover/bar:opacity-100 transition absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-950 text-indigo-300 text-[10px] font-mono font-black px-1.5 py-0.5 rounded border border-indigo-500/40 pointer-events-none z-10">
                        {counts.A}
                      </span>
                    </div>

                    {/* Bar B */}
                    <div 
                      title={`${cls} Stream B: ${counts.B} present`}
                      style={{ height: `${hB}px` }} 
                      className="w-3.5 sm:w-5 bg-gradient-to-t from-emerald-700 to-emerald-500 rounded-t-md hover:from-emerald-600 hover:to-emerald-400 transition-all duration-200 relative group/bar shadow-md"
                    >
                      <span className="opacity-0 group-hover/bar:opacity-100 transition absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-950 text-emerald-300 text-[10px] font-mono font-black px-1.5 py-0.5 rounded border border-emerald-500/40 pointer-events-none z-10">
                        {counts.B}
                      </span>
                    </div>

                    {/* Bar C */}
                    <div 
                      title={`${cls} Stream C: ${counts.C} present`}
                      style={{ height: `${hC}px` }} 
                      className="w-3.5 sm:w-5 bg-gradient-to-t from-purple-700 to-purple-500 rounded-t-md hover:from-purple-600 hover:to-purple-400 transition-all duration-200 relative group/bar shadow-md"
                    >
                      <span className="opacity-0 group-hover/bar:opacity-100 transition absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-950 text-purple-300 text-[10px] font-mono font-black px-1.5 py-0.5 rounded border border-purple-500/40 pointer-events-none z-10">
                        {counts.C}
                      </span>
                    </div>
                  </div>

                  {/* Class Label */}
                  <span className="text-xs font-mono font-black text-slate-300 group-hover:text-indigo-400 transition uppercase tracking-wider">
                    {cls}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-500 font-mono mt-3 px-1">
            <span>Hover bars for counts</span>
            <span>Click any class column to view detailed list</span>
          </div>
        </div>

        {/* NOT YET PRESENT SUMMARY TABLE (Right / 5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Attendance & Absentees Summary
              </h3>
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Class Breakdown</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-mono font-black text-slate-400 uppercase tracking-wider">
                    <th className="py-2 px-2">CLASS</th>
                    <th className="py-2 px-2 text-right">PRESENT</th>
                    <th className="py-2 px-2 text-right">NOT PRESENT</th>
                    <th className="py-2 px-2 text-right">RATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                  {classesList.map(cls => {
                    const pres = (presentMatrix[cls]?.total) || 0;
                    const reg = (registeredMatrix[cls]?.total) || 0;
                    const notPres = Math.max(0, reg - pres);
                    const pct = reg > 0 ? ((pres / reg) * 100).toFixed(1) : '0.0';
                    const isLow = reg > 0 && (pres / reg) < 0.4;

                    return (
                      <tr 
                        key={cls} 
                        onClick={() => openDrillDown(`All Students in ${cls}`, cls)}
                        className="hover:bg-slate-850/60 transition cursor-pointer"
                      >
                        <td className="py-2.5 px-2 font-black text-slate-200 flex items-center gap-1.5">
                          <span>{cls}</span>
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 text-[9px] border border-amber-500/40 font-bold" title="Low attendance alert (< 40%)">
                              ⚠️ LOW
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-black text-emerald-400">{pres}</td>
                        <td className="py-2.5 px-2 text-right font-bold text-slate-400">{notPres}</td>
                        <td className="py-2.5 px-2 text-right font-black text-indigo-300">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Total Not Clocked In:</span>
            <strong className="text-slate-200 font-black">{Math.max(0, totalRegistered - columnTotals.grandTotal)} Students</strong>
          </div>
        </div>
      </div>

      {/* 4. MAIN ATTENDANCE TABLE BY CLASS & STREAM */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              LIVE ATTENDANCE MATRIX BY CLASS & STREAM
            </h3>
            <p className="text-slate-400 text-xs font-mono mt-0.5">Click any stream cell, class row, or total to drill down into student records</p>
          </div>

          <div className="text-[11px] font-mono text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 px-3 py-1.5 rounded-xl self-start sm:self-auto font-bold">
            Interactive Live Data Grid
          </div>
        </div>

        {/* MAIN MATRIX TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-mono">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-black">
                <th className="py-3 px-4 rounded-tl-xl">CLASS</th>
                <th className="py-3 px-4 text-right">STREAM A</th>
                <th className="py-3 px-4 text-right">STREAM B</th>
                <th className="py-3 px-4 text-right">STREAM C</th>
                <th className="py-3 px-4 text-right text-indigo-300 rounded-tr-xl">TOTAL PRESENT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {classesList.map(cls => {
                const pRow = presentMatrix[cls] || { A: 0, B: 0, C: 0, total: 0 };
                const rRow = registeredMatrix[cls] || { A: 0, B: 0, C: 0, total: 0 };
                const isLowClass = rRow.total > 0 && (pRow.total / rRow.total) < 0.4;

                return (
                  <tr key={cls} className="hover:bg-slate-850/60 transition">
                    
                    {/* CLASS NAME */}
                    <td 
                      onClick={() => openDrillDown(`All Students Present in ${cls}`, cls)}
                      className="py-3.5 px-4 font-black text-slate-100 cursor-pointer hover:text-indigo-400 flex items-center gap-2"
                    >
                      <span className="text-base">{cls}</span>
                      {isLowClass && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                          ⚠️ Low ({Math.round((pRow.total / (rRow.total || 1)) * 100)}%)
                        </span>
                      )}
                    </td>

                    {/* STREAM A */}
                    <td 
                      onClick={() => openDrillDown(`Students Present in ${cls} Stream A`, cls, 'A')}
                      className="py-3.5 px-4 text-right font-black text-slate-200 cursor-pointer hover:bg-indigo-950/30 hover:text-indigo-400 transition rounded-lg"
                    >
                      {pRow.A > 0 ? pRow.A : <span className="text-slate-600">—</span>}
                    </td>

                    {/* STREAM B */}
                    <td 
                      onClick={() => openDrillDown(`Students Present in ${cls} Stream B`, cls, 'B')}
                      className="py-3.5 px-4 text-right font-black text-slate-200 cursor-pointer hover:bg-emerald-950/30 hover:text-emerald-400 transition rounded-lg"
                    >
                      {pRow.B > 0 ? pRow.B : <span className="text-slate-600">—</span>}
                    </td>

                    {/* STREAM C */}
                    <td 
                      onClick={() => openDrillDown(`Students Present in ${cls} Stream C`, cls, 'C')}
                      className="py-3.5 px-4 text-right font-black text-slate-200 cursor-pointer hover:bg-purple-950/30 hover:text-purple-400 transition rounded-lg"
                    >
                      {pRow.C > 0 ? pRow.C : <span className="text-slate-600">—</span>}
                    </td>

                    {/* CLASS TOTAL PRESENT */}
                    <td 
                      onClick={() => openDrillDown(`All Students Present in ${cls}`, cls)}
                      className="py-3.5 px-4 text-right font-black text-indigo-400 text-base cursor-pointer hover:bg-indigo-900/30 transition rounded-lg"
                    >
                      {pRow.total > 0 ? pRow.total : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                );
              })}

              {/* BOTTOM GRAND TOTAL ROW */}
              <tr className="bg-slate-950/90 border-t-2 border-slate-700 font-black text-slate-100 text-base">
                <td 
                  onClick={() => openDrillDown('All Present Students Today')}
                  className="py-4 px-4 text-indigo-300 font-mono tracking-wider cursor-pointer hover:text-indigo-200 uppercase"
                >
                  TOTAL PRESENT
                </td>

                <td 
                  onClick={() => openDrillDown('All Present Students in Stream A', undefined, 'A')}
                  className="py-4 px-4 text-right text-indigo-400 font-mono cursor-pointer hover:bg-indigo-950/40 rounded-lg"
                >
                  {columnTotals.sumA}
                </td>

                <td 
                  onClick={() => openDrillDown('All Present Students in Stream B', undefined, 'B')}
                  className="py-4 px-4 text-right text-emerald-400 font-mono cursor-pointer hover:bg-emerald-950/40 rounded-lg"
                >
                  {columnTotals.sumB}
                </td>

                <td 
                  onClick={() => openDrillDown('All Present Students in Stream C', undefined, 'C')}
                  className="py-4 px-4 text-right text-purple-400 font-mono cursor-pointer hover:bg-purple-950/40 rounded-lg"
                >
                  {columnTotals.sumC}
                </td>

                <td 
                  onClick={() => openDrillDown('All Present Students Today')}
                  className="py-4 px-4 text-right text-emerald-400 text-xl font-mono cursor-pointer hover:bg-emerald-900/30 rounded-lg"
                >
                  {columnTotals.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. INTERACTIVE DRILL-DOWN POPUP MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 md:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  {modalTitle}
                </h3>
                <p className="text-slate-400 text-xs font-mono mt-0.5">
                  Showing {filteredModalStudents.length} student{filteredModalStudents.length === 1 ? '' : 's'} {modalTitle.includes('Clocked Out') ? 'clocked out' : modalTitle.includes('Currently On Campus') ? 'currently on campus' : 'matched'}
                </p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 bg-slate-900/90 border-b border-slate-850">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="Filter student by name or admin number..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Modal Student List Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {filteredModalStudents.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  {modalTitle.includes('Clocked Out') 
                    ? 'No clocked-out student records match this filter.' 
                    : modalTitle.includes('Currently On Campus')
                    ? 'No students currently on campus match this filter.'
                    : 'No student records match this filter.'}
                </div>
              ) : (
                filteredModalStudents.map((st, idx) => (
                  <div 
                    key={`${st.id}_${idx}`}
                    className="p-3 bg-slate-950/80 border border-slate-850 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Photo or Avatar */}
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                        {st.photo ? (
                          <img src={st.photo} alt={st.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-100 font-mono truncate">{st.name}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span className="text-indigo-400 font-bold">{st.adminNo}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 font-bold border border-slate-800">
                            {st.gradeClass}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-right font-mono">
                      <div>
                        <div className="text-xs font-black text-emerald-400 flex items-center justify-end gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {st.time_in || 'Present'}
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Clock-In Time</span>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                        st.status === 'Checked Out' || st.status === 'CHECKED OUT' || st.time_out
                          ? 'bg-amber-950/60 border-amber-800 text-amber-350'
                          : st.status === 'Very Late' 
                          ? 'bg-rose-950/60 border-rose-800 text-rose-350'
                          : st.status === 'Late'
                          ? 'bg-amber-950/60 border-amber-800 text-amber-350'
                          : 'bg-emerald-950/60 border-emerald-800 text-emerald-350'
                      }`}>
                        {st.time_out || st.status === 'Checked Out' ? 'Checked Out' : (st.status || 'Present')}
                      </span>

                      {!Boolean(st.time_out || st.status === 'Checked Out' || st.status === 'CHECKED OUT') && (
                        <button
                          onClick={() => handleDirectCheckOut(st)}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-md flex items-center gap-1 shrink-0"
                          title="Check out student immediately"
                        >
                          <Clock className="w-3 h-3" />
                          Check Out
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs font-mono">
              <span className="text-slate-400">Total Matched: <strong className="text-slate-200">{filteredModalStudents.length}</strong></span>
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
