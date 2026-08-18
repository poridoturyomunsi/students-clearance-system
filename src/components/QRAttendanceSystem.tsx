import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Camera, 
  RefreshCw, 
  Users, 
  UserCheck, 
  Clock, 
  LogOut, 
  UserX, 
  ShieldCheck, 
  Smartphone,
  Calendar,
  Check,
  Zap,
  Info
} from 'lucide-react';
import { Student } from '../types.ts';
import { 
  processQRScan, 
  getAttendanceStats, 
  getStoredAttendance, 
  AttendanceRecord, 
  ScanResult,
  formatTodayDate,
  formatCurrentTime,
  formatDisplayDate,
  getFirstName
} from '../lib/attendanceStore.ts';
import { Html5Qrcode } from 'html5-qrcode';
import * as XLSX from 'xlsx';
import { LiveAttendanceDashboard } from './LiveAttendanceDashboard.tsx';
import { announceScan } from '../utils/speechService.ts';
import { TTSSettingsPanel } from './TTSSettingsPanel.tsx';

interface QRAttendanceSystemProps {
  students: Student[];
  onSelectStudent?: (student: Student) => void;
}

export default function QRAttendanceSystem({ students, onSelectStudent }: QRAttendanceSystemProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'dashboard' | 'guide'>('scanner');
  const [scanMode, setScanMode] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT'>('AUTO');
  
  // Scanner States
  const [manualInput, setManualInput] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  // Dashboard Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>(formatTodayDate());

  // Scanner HTML5 element ref
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-reader-container';

  // Stats for selected date
  const stats = getAttendanceStats(students, selectedDate);

  // Initialize camera scanner
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (html5QrCodeRef.current) {
        await stopCamera();
      }

      const containerEl = document.getElementById(scannerContainerId);
      if (!containerEl) {
        setCameraError("Camera container element not ready. Please try again.");
        return;
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = html5QrCode;

      const qrConfig = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.max(160, Math.floor(minDim * 0.75)),
            height: Math.max(160, Math.floor(minDim * 0.75))
          };
        }
      };

      const qrCallback = (decodedText: string) => {
        handleQRScanTrigger(decodedText);
      };

      // Attempt 1: Try rear environment camera
      try {
        await html5QrCode.start({ facingMode: 'environment' }, qrConfig, qrCallback, () => {});
        setIsCameraActive(true);
        return;
      } catch (e1) {
        console.warn("Rear camera failed, attempting front/user camera:", e1);
      }

      // Attempt 2: Try front user camera
      try {
        await html5QrCode.start({ facingMode: 'user' }, qrConfig, qrCallback, () => {});
        setIsCameraActive(true);
        return;
      } catch (e2) {
        console.warn("User camera failed, querying camera list:", e2);
      }

      // Attempt 3: Query camera device list
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        const cameraId = cameras[0].id;
        await html5QrCode.start(cameraId, qrConfig, qrCallback, () => {});
        setIsCameraActive(true);
      } else {
        throw new Error("No camera device found on this computer or phone. Please connect a camera or enter student ID manually.");
      }
    } catch (err: any) {
      console.warn("Camera scanner error:", err);
      setCameraError(err?.message || 'Could not access camera. Please allow camera permissions or enter ID manually.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && isCameraActive) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn("Error stopping camera:", e);
      }
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Handle Scan Logic
  const handleQRScanTrigger = (rawQuery: string) => {
    if (!rawQuery) return;
    const result = processQRScan(rawQuery, students, scanMode);
    setLastScanResult(result);
    setScanHistory(prev => [result, ...prev.slice(0, 19)]);
    setManualInput('');

    // Audio speech feedback
    if (result.verified && result.student) {
      const isClockIn = result.status === 'PRESENT';
      announceScan(
        result.student.name,
        isClockIn ? 'clock-in' : 'clock-out',
        result.timeIn || result.timeOut,
        result.student.id || result.student.studentNo
      );
    } else {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(300, audioCtx.currentTime); // Low note (invalid)
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } catch (e) {}
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleQRScanTrigger(manualInput);
    }
  };

  // Filtered Students for Dashboard
  const filteredDashboardRecords = stats.todayRecords.filter(rec => {
    const matchesSearch = 
      rec.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.studentNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.gradeClass.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClass = selectedClass === 'ALL' || rec.gradeClass === selectedClass;
    const matchesStatus = selectedStatus === 'ALL' || rec.status === selectedStatus;

    return matchesSearch && matchesClass && matchesStatus;
  });

  // Students who have NOT arrived today
  const scannedIds = new Set(stats.todayRecords.map(r => r.studentId || r.studentNo));
  const notArrivedStudents = students.filter(s => {
    const stdNo = s.studentNo || s.adminNo || s.id;
    return !scannedIds.has(s.id) && !scannedIds.has(stdNo);
  }).filter(s => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.studentNo || s.adminNo || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClass === 'ALL' || s.gradeClass === selectedClass;
    return matchesSearch && matchesClass;
  });

  // Export Attendance to Excel
  const exportToExcel = () => {
    const exportData = stats.todayRecords.map(r => ({
      'Student Number': r.studentNo,
      'Student Name': r.studentName,
      'Class': r.gradeClass,
      'Gender': r.gender,
      'Status': r.status,
      'Time In': r.timeIn || '-',
      'Time Out': r.timeOut || '-',
      'Date': formatDisplayDate(r.date)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${selectedDate}`);
    XLSX.writeFile(wb, `Student_Attendance_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* PROMINENT LIVE ATTENDANCE DASHBOARD OVERVIEW */}
      <LiveAttendanceDashboard students={students} />

      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden border border-blue-700/40">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/30 rounded-xl border border-blue-400/30 backdrop-blur-sm">
              <QrCode className="w-8 h-8 text-blue-300" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-wide uppercase">
                Secure QR Attendance & Verification System
              </h1>
              <p className="text-xs text-blue-200 font-medium tracking-wider mt-0.5">
                Instant student verification, automated time-in/out tracking & real-time gate security dashboard.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex items-center gap-2 bg-blue-950/60 p-1.5 rounded-xl border border-blue-700/50 relative z-10">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'scanner'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-200 hover:text-white hover:bg-blue-800/40'
            }`}
          >
            <Camera className="w-4 h-4" />
            Guard Scanner
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-200 hover:text-white hover:bg-blue-800/40'
            }`}
          >
            <Users className="w-4 h-4" />
            Attendance Dashboard
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'guide'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-200 hover:text-white hover:bg-blue-800/40'
            }`}
          >
            <Info className="w-4 h-4" />
            How It Works
          </button>
        </div>
      </div>

      {/* VIEW 1: SECURITY GUARD SCANNER VIEW */}
      {activeTab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Phone Scanner Frame */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full max-w-sm bg-slate-900 rounded-[36px] p-4 shadow-2xl border-4 border-slate-700 relative overflow-hidden flex flex-col items-center">
              {/* Phone Speaker Notch */}
              <div className="w-24 h-4 bg-slate-800 rounded-b-xl mb-3 flex items-center justify-center">
                <div className="w-8 h-1 bg-slate-600 rounded-full" />
              </div>

              {/* Header inside Phone */}
              <div className="w-full bg-blue-900 text-white py-2.5 px-4 rounded-xl flex justify-between items-center mb-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-300" />
                  <span className="text-xs font-black uppercase tracking-wider">QR SCANNER</span>
                </div>
                <span className="text-[10px] font-mono font-bold bg-blue-800/60 px-2 py-0.5 rounded text-blue-200">
                  LIVE
                </span>
              </div>

              {/* Mode Selector Buttons inside Phone */}
              <div className="w-full grid grid-cols-3 gap-1 mb-3 bg-slate-800 p-1 rounded-xl text-[10px] font-bold">
                <button
                  onClick={() => setScanMode('AUTO')}
                  className={`py-1.5 rounded-lg font-black uppercase transition-all ${
                    scanMode === 'AUTO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Auto Mode
                </button>
                <button
                  onClick={() => setScanMode('CHECK_IN')}
                  className={`py-1.5 rounded-lg font-black uppercase transition-all ${
                    scanMode === 'CHECK_IN' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Time In
                </button>
                <button
                  onClick={() => setScanMode('CHECK_OUT')}
                  className={`py-1.5 rounded-lg font-black uppercase transition-all ${
                    scanMode === 'CHECK_OUT' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Time Out
                </button>
              </div>

              {/* Camera Scanner Viewfinder */}
              <div className="w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden relative border-2 border-slate-800 flex items-center justify-center">
                <div id={scannerContainerId} className="w-full h-full object-cover" />

                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-xs">
                    <QrCode className="w-16 h-16 text-blue-500 mb-3 animate-pulse" />
                    <p className="text-xs font-bold text-slate-300 mb-4">
                      Click below to activate live camera feed or enter student number manually.
                    </p>
                    <button
                      onClick={startCamera}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg flex items-center gap-2 transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      Start Camera Scanner
                    </button>
                  </div>
                )}

                {/* Viewfinder Target Reticle Overlay */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400/40 rounded-2xl flex flex-col items-center justify-between p-6">
                    <div className="w-full flex justify-between">
                      <div className="w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                    </div>
                    <p className="text-[10px] font-bold text-white bg-slate-900/80 px-3 py-1 rounded-full border border-emerald-400/40 tracking-wider">
                      Align QR code within the frame to scan
                    </p>
                    <div className="w-full flex justify-between">
                      <div className="w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                    </div>
                  </div>
                )}
              </div>

              {/* Stop Camera Toggle */}
              {isCameraActive && (
                <button
                  onClick={stopCamera}
                  className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition-all"
                >
                  Stop Camera Scanner
                </button>
              )}

              {cameraError && (
                <div className="mt-2 text-[10px] text-rose-400 bg-rose-950/60 p-2 rounded-lg text-center border border-rose-800">
                  {cameraError}
                </div>
              )}

              {/* Manual Input / Hardware Scanner Bar inside Phone */}
              <form onSubmit={handleManualSubmit} className="w-full mt-3">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Enter or scan Admin No (e.g. ADM-2026-9008766)..."
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-xs rounded-xl focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="absolute right-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all"
                  >
                    Scan
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column: Verification Result Panel */}
          <div className="lg:col-span-7 space-y-6">
            {!lastScanResult ? (
              <div className="bg-white rounded-2xl p-10 border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center min-h-[420px]">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-blue-600">
                  <ShieldCheck className="w-10 h-10" />
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">
                  Ready to Scan Student QR Code
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Point the camera at the student clearance card QR code or type the student number to perform instant verification and record attendance.
                </p>
              </div>
            ) : (
              <div className="space-y-4 animate-scale-in">
                {/* Result Card: VERIFIED (PRESENT) */}
                {lastScanResult.verified && lastScanResult.status === 'PRESENT' && (
                  <div className="space-y-4">
                    {/* Student-Facing Welcome Message Banner */}
                    <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-5 rounded-2xl shadow-lg border border-emerald-400 animate-bounce-once">
                      <div className="flex items-center gap-4">
                        <div className="text-4xl shrink-0">👋</div>
                        <div>
                          <h2 className="text-2xl font-black tracking-wide">
                            Welcome, <span className="underline decoration-amber-300 decoration-4">{getFirstName(lastScanResult.student?.name)}</span>!
                          </h2>
                          <p className="text-sm font-semibold text-emerald-100 mt-1 leading-snug">
                            Good morning!<br />
                            You have successfully checked in.<br />
                            Have a wonderful and productive day!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border-2 border-emerald-500 overflow-hidden shadow-xl">
                      {/* Header Banner */}
                      <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-7 h-7 text-emerald-100" />
                          <div>
                            <h3 className="text-base font-black uppercase tracking-wider">VERIFIED</h3>
                            <p className="text-xs text-emerald-100 font-medium">This is a registered student.</p>
                          </div>
                        </div>
                        <span className="bg-emerald-800 text-emerald-100 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                          ✔ CHECK IN
                        </span>
                      </div>

                      {/* Student Info Details */}
                      <div className="p-6 flex flex-col md:flex-row gap-6 items-center md:items-start">
                        {/* Photo */}
                        <div className="w-32 h-36 shrink-0 border-2 border-emerald-400 rounded-xl overflow-hidden bg-slate-100 shadow-md">
                          {lastScanResult.student?.photo ? (
                            <img
                              src={lastScanResult.student.photo}
                              alt={lastScanResult.student.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                              <Users className="w-10 h-10" />
                              <span className="text-[8px] font-extrabold uppercase mt-1">NO PHOTO</span>
                            </div>
                          )}
                        </div>

                        {/* Details Grid */}
                        <div className="flex-1 space-y-3 w-full">
                          <div>
                            <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">STUDENT NUMBER</span>
                            <p className="text-lg font-black text-slate-950 uppercase">{lastScanResult.student?.studentNo || lastScanResult.student?.adminNo}</p>
                          </div>

                          <div>
                            <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">NAME</span>
                            <p className="text-lg font-black text-slate-950 uppercase">{lastScanResult.student?.name}</p>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">CLASS</span>
                              <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.gradeClass}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">GENDER</span>
                              <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.gender || 'MALE'}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">STATUS</span>
                              <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.boardingStatus || 'DAY SCHOLAR'}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">CARD VALIDITY</span>
                              <p className="text-xs font-black text-emerald-700 uppercase">✔ ACTIVE / VALID</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Attendance Record Footer Band */}
                      <div className="bg-emerald-50 px-6 py-4 border-t border-emerald-200 flex flex-wrap justify-between items-center gap-4">
                        <div>
                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">ATTENDANCE STATUS</span>
                          <p className="text-base font-black text-emerald-700 uppercase flex items-center gap-1.5">
                            <Check className="w-5 h-5 stroke-[3]" /> PRESENT
                          </p>
                        </div>

                        <div>
                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">TIME IN</span>
                          <p className="text-base font-black text-slate-900 font-mono">{lastScanResult.timeIn || formatCurrentTime()}</p>
                        </div>

                        <div>
                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">DATE</span>
                          <p className="text-xs font-bold text-slate-700 font-mono">{formatDisplayDate(lastScanResult.dateStr)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Result Card: CHECK OUT */}
                {lastScanResult.verified && lastScanResult.status === 'CHECKED OUT' && (
                  <div className="space-y-4">
                    {/* Student-Facing Goodbye Message Banner */}
                    <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-5 rounded-2xl shadow-lg border border-amber-400 animate-bounce-once">
                      <div className="flex items-center gap-4">
                        <div className="text-4xl shrink-0">👋</div>
                        <div>
                          <h2 className="text-2xl font-black tracking-wide">
                            Goodbye, <span className="underline decoration-yellow-200 decoration-4">{getFirstName(lastScanResult.student?.name)}</span>!
                          </h2>
                          <p className="text-sm font-semibold text-amber-100 mt-1 leading-snug">
                            You have successfully checked out.<br />
                            Have a safe journey home!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border-2 border-amber-500 overflow-hidden shadow-xl">
                      {/* Header Banner */}
                      <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <LogOut className="w-7 h-7 text-amber-100" />
                          <div>
                            <h3 className="text-base font-black uppercase tracking-wider">CHECK OUT</h3>
                            <p className="text-xs text-amber-100 font-medium">Student departing campus.</p>
                          </div>
                        </div>
                        <span className="bg-amber-800 text-amber-100 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                          CHECK OUT
                        </span>
                      </div>

                      {/* Student Info Details */}
                      <div className="p-6 flex flex-col md:flex-row gap-6 items-center md:items-start">
                        <div className="w-32 h-36 shrink-0 border-2 border-amber-400 rounded-xl overflow-hidden bg-slate-100 shadow-md">
                          {lastScanResult.student?.photo ? (
                            <img
                              src={lastScanResult.student.photo}
                              alt={lastScanResult.student.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                              <Users className="w-10 h-10" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-3 w-full">
                          <div>
                            <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">STUDENT NUMBER</span>
                            <p className="text-lg font-black text-slate-950 uppercase">{lastScanResult.student?.studentNo || lastScanResult.student?.adminNo}</p>
                          </div>

                        <div>
                          <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">NAME</span>
                          <p className="text-lg font-black text-slate-950 uppercase">{lastScanResult.student?.name}</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">CLASS</span>
                            <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.gradeClass}</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">GENDER</span>
                            <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.gender || 'MALE'}</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">STATUS</span>
                            <p className="text-xs font-black text-slate-900 uppercase">{lastScanResult.student?.boardingStatus || 'DAY SCHOLAR'}</p>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-blue-700 uppercase tracking-wider">CARD VALIDITY</span>
                            <p className="text-xs font-black text-emerald-700 uppercase">✔ ACTIVE / VALID</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Record Footer Band */}
                    <div className="bg-amber-50 px-6 py-4 border-t border-amber-200 flex flex-wrap justify-between items-center gap-4">
                      <div>
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">ATTENDANCE STATUS</span>
                        <p className="text-base font-black text-amber-700 uppercase">CHECKED OUT</p>
                      </div>

                      <div>
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">TIME OUT</span>
                        <p className="text-base font-black text-slate-900 font-mono">{lastScanResult.timeOut || formatCurrentTime()}</p>
                      </div>

                      <div>
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">DATE</span>
                        <p className="text-xs font-bold text-slate-700 font-mono">{formatDisplayDate(lastScanResult.dateStr)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Result Card: DUPLICATE WARNING */}
                {lastScanResult.verified && lastScanResult.status === 'DUPLICATE_WARNING' && (
                  <div className="bg-amber-50 rounded-2xl border-2 border-amber-400 p-6 text-amber-900 flex items-center gap-4 shadow-md">
                    <AlertTriangle className="w-10 h-10 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-base font-black uppercase">DUPLICATE SCAN WARNING</h4>
                      <p className="text-xs font-medium mt-0.5">{lastScanResult.message}</p>
                    </div>
                  </div>
                )}

                {/* Result Card: INVALID QR CODE */}
                {!lastScanResult.verified && (
                  <div className="bg-white rounded-2xl border-2 border-rose-500 overflow-hidden shadow-xl p-8 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 mb-4 animate-bounce">
                      <XCircle className="w-12 h-12" />
                    </div>
                    <h3 className="text-xl font-black text-rose-600 uppercase tracking-wide">
                      INVALID QR CODE
                    </h3>
                    <p className="text-sm font-bold text-slate-700 mt-1">
                      Student record not found.
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mt-2">
                      The scanned QR code is invalid or does not match any registered student in the database.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: ATTENDANCE DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Top 4 Hero Stat Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. TOTAL CLOCKED IN TODAY */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">TOTAL CLOCKED IN TODAY</span>
                <p className="text-3xl font-black text-emerald-600 mt-1">{stats.totalClockedIn}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Students who entered campus</p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>

            {/* 2. CURRENTLY ON CAMPUS */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">CURRENTLY ON CAMPUS</span>
                <p className="text-3xl font-black text-blue-600 mt-1">{stats.currentlyInside}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Active inside school grounds</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                <Users className="w-6 h-6" />
              </div>
            </div>

            {/* 3. CLOCKED OUT */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">CLOCKED OUT</span>
                <p className="text-3xl font-black text-amber-600 mt-1">{stats.checkedOutCount}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Departed campus today</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            {/* 4. NOT YET ARRIVED */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">NOT YET ARRIVED</span>
                <p className="text-3xl font-black text-purple-600 mt-1">{stats.notArrivedCount}</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Out of {stats.totalStudents} registered</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-600">
                <UserX className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Class & Stream Attendance Breakdown Matrix Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase">Class & Stream Attendance Breakdown</h3>
                <p className="text-xs text-slate-500 font-medium">Real-time attendance numbers by Class and Stream for {formatDisplayDate(selectedDate)}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-200">
                    <th className="p-3">CLASS</th>
                    <th className="p-3">STREAM</th>
                    <th className="p-3 text-center">CLOCKED IN TODAY</th>
                    <th className="p-3 text-center">CURRENTLY INSIDE</th>
                    <th className="p-3 text-center">CLOCKED OUT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stats.streamBreakdown && stats.streamBreakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-black text-slate-900">{row.grade}</td>
                      <td className="p-3 font-bold text-slate-700">STREAM {row.stream}</td>
                      <td className="p-3 text-center font-black text-emerald-700">{row.clockedIn}</td>
                      <td className="p-3 text-center font-black text-blue-700">{row.inside}</td>
                      <td className="p-3 text-center font-black text-amber-700">{row.clockedOut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Gate Activity Feed & Detailed Log Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase">Recent Gate Activity & Attendance Log</h3>
                <p className="text-xs text-slate-500 font-medium">Real-time gate scan records for {formatDisplayDate(selectedDate)}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
                >
                  <Download className="w-4 h-4" />
                  Export Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {/* Search */}
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                <input
                  type="text"
                  placeholder="Search student or admin no..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Class Filter */}
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Classes</option>
                <option value="S.1 A">S.1 A</option>
                <option value="S.1 B">S.1 B</option>
                <option value="S.1 C">S.1 C</option>
                <option value="S.2 A">S.2 A</option>
                <option value="S.2 B">S.2 B</option>
                <option value="S.2 C">S.2 C</option>
                <option value="S.3 A">S.3 A</option>
                <option value="S.3 B">S.3 B</option>
                <option value="S.3 C">S.3 C</option>
                <option value="S.4 A">S.4 A</option>
                <option value="S.4 B">S.4 B</option>
                <option value="S.4 C">S.4 C</option>
                <option value="S.5 A (ARTS)">S.5 A (ARTS)</option>
                <option value="S.5 B (SCIENCES)">S.5 B (SCIENCES)</option>
                <option value="S.6 A (ARTS)">S.6 A (ARTS)</option>
                <option value="S.6 B (SCIENCES)">S.6 B (SCIENCES)</option>
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PRESENT">PRESENT</option>
                <option value="CHECKED OUT">CHECKED OUT</option>
              </select>

              {/* Date Filter */}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-slate-700 focus:outline-none"
              />
            </div>

            {/* Attendance Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-200">
                    <th className="p-3">Student</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Time In</th>
                    <th className="p-3">Time Out</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredDashboardRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                        No scan records found for the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDashboardRecords.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {rec.photoUrl ? (
                              <img src={rec.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                                {rec.studentName[0]}
                              </div>
                            )}
                            <div>
                              <p className="font-black text-slate-900 uppercase">{rec.studentName}</p>
                              <p className="text-[10px] text-slate-500 font-mono">{rec.studentNo}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-bold text-slate-700">{rec.gradeClass}</td>
                        <td className="p-3">
                          {rec.status === 'PRESENT' ? (
                            <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1">
                              ✔ PRESENT
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1">
                              CHECKED OUT
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">{rec.timeIn || '-'}</td>
                        <td className="p-3 font-mono font-bold text-slate-800">{rec.timeOut || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: SYSTEM GUIDE & BENEFITS (Exact match to screenshot mockup right panel!) */}
      {activeTab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* HOW IT WORKS */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="bg-blue-900 text-white p-4 rounded-xl font-black text-sm uppercase tracking-wider text-center">
              HOW IT WORKS
            </div>

            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md">
                  1
                </div>
                <div>
                  <h4 className="text-base font-black text-blue-900 uppercase">SCAN</h4>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Security guard scans the QR code on the student clearance card using the smartphone scanner app or USB camera.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md">
                  2
                </div>
                <div>
                  <h4 className="text-base font-black text-blue-900 uppercase">VERIFY</h4>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    The system verifies the student details instantly, showing student photo, name, class, gender, and status.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md">
                  3
                </div>
                <div>
                  <h4 className="text-base font-black text-blue-900 uppercase">RECORD ATTENDANCE</h4>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Attendance is recorded with timestamp and date automatically in the system database.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* BENEFITS */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="bg-blue-900 text-white p-4 rounded-xl font-black text-sm uppercase tracking-wider text-center">
              BENEFITS
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <span className="text-sm font-bold text-slate-800">Fast and secure verification</span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <span className="text-sm font-bold text-slate-800">Accurate attendance tracking</span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <span className="text-sm font-bold text-slate-800">Prevent duplicate check-in/out</span>
              </div>

              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <span className="text-sm font-bold text-slate-800">Real-time student monitoring</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
