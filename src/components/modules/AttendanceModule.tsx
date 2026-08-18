import React, { useEffect, useState, useRef } from 'react';
import { 
  Plus, Search, Save, X, AlertCircle, CheckCircle2, 
  Trash2, SlidersHorizontal, Users, ShieldAlert,
  Clock, FileText, ArrowUpDown, Play, RefreshCw, 
  MapPin, Radio, Settings, Calendar, UserCheck, MessageSquare, Volume2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { 
  fetchStudentsFromDb, fetchClassesFromDb, fetchStreamsFromDb,
  scanGateCard, fetchAttendanceDashboard, fetchAttendanceLogs, 
  fetchGatePermissions, saveGatePermission, returnStudentPermission, 
  fetchGateLocations, saveGateLocation, deleteGateLocation,
  fetchGateDevices, saveGateDevice, deleteGateDevice,
  fetchAttendanceSettings, saveAttendanceSettings, fetchNotificationAuditLogs
} from '../../utils/api.ts';
import QRAttendanceSystem from '../QRAttendanceSystem.tsx';
import { INITIAL_STUDENTS } from '../../data.ts';
import { announceScan } from '../../utils/speechService.ts';
import { TTSSettingsPanel } from '../TTSSettingsPanel.tsx';

export default function AttendanceModule() {
  const [activeTab, setActiveTab] = useState<'qr-guard' | 'dashboard' | 'gate' | 'monitor' | 'permissions' | 'reports' | 'audit-logs' | 'setup'>('qr-guard');
  
  // Dashboard states
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashLoading, setDashLoading] = useState(true);

  // Gate Console states
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('spss_operator') || 'Gate Officer');
  const [selectedGate, setSelectedGate] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [directionMode, setDirectionMode] = useState<'auto' | 'clock-in' | 'clock-out'>('auto');
  const [scanValue, setScanValue] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [departureReason, setDepartureReason] = useState('Normal Departure');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Live Monitor states
  const [liveScans, setLiveScans] = useState<any[]>([]);
  const [sseConnected, setSseConnected] = useState(false);

  // Permissions states
  const [permissions, setPermissions] = useState<any[]>([]);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [allStudentsList, setAllStudentsList] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [permReason, setPermReason] = useState('');
  const [permTimeOut, setPermTimeOut] = useState('');
  const [permExpectedReturn, setPermExpectedReturn] = useState('');
  const [permRemarks, setPermRemarks] = useState('');
  const [permLoading, setPermLoading] = useState(false);

  // Reports states
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [streams, setStreams] = useState<string[]>([]);
  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    gradeClass: 'All',
    stream: 'All',
    status: 'All',
    boardingStatus: 'All',
    gender: 'All',
    search: ''
  });

  // Notification Audit Logs states
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditStatusFilter, setAuditStatusFilter] = useState('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  // Setup states
  const [gates, setGates] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [newGateName, setNewGateName] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('QR');
  const [timings, setTimings] = useState({
    school_start_time: '07:30',
    late_threshold: '08:00',
    very_late_threshold: '08:30'
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Initial Loaders
  useEffect(() => {
    loadRegistries();
    loadDashboard();
    initSSE();
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save operator name
  useEffect(() => {
    localStorage.setItem('spss_operator', operatorName);
  }, [operatorName]);

  const loadRegistries = async () => {
    try {
      const [gList, dList, settingsList] = await Promise.all([
        fetchGateLocations(),
        fetchGateDevices(),
        fetchAttendanceSettings()
      ]);
      setGates(gList);
      setDevices(dList);
      if (gList.length > 0) setSelectedGate(gList[0].id);
      if (dList.length > 0) setSelectedDevice(dList[0].id);
      if (settingsList) {
        setTimings({
          school_start_time: settingsList.school_start_time || '07:30',
          late_threshold: settingsList.late_threshold || '08:00',
          very_late_threshold: settingsList.very_late_threshold || '08:30'
        });
      }
    } catch (e) {
      console.error('Failed to load setup registries', e);
    }
  };

  const loadDashboard = async () => {
    setDashLoading(true);
    try {
      const data = await fetchAttendanceDashboard();
      setDashboardData(data);
    } catch (e) {
      console.error('Failed to fetch dashboard statistics', e);
    } finally {
      setDashLoading(false);
    }
  };

  const loadMeta = async () => {
    try {
      const [cls, str] = await Promise.all([fetchClassesFromDb(), fetchStreamsFromDb()]);
      setClasses(cls.map((c: any) => c.name));
      setStreams(str.map((s: any) => s.name));
      
      const stRes = await fetchStudentsFromDb({ limit: 10000 });
      setAllStudentsList(stRes.data || []);
    } catch (e) {
      console.error('Failed to load classes/streams', e);
    }
  };

  const initSSE = () => {
    try {
      // Connect to SSE stream
      const sse = new EventSource('/api/attendance/live-stream');
      
      sse.onopen = () => {
        setSseConnected(true);
      };
      
      sse.onmessage = (event) => {
        const newScan = JSON.parse(event.data);
        setLiveScans(prev => [newScan, ...prev.slice(0, 29)]);
        // Automatically refresh dashboard on new scan if tab is dashboard
        loadDashboard();
      };

      sse.onerror = () => {
        setSseConnected(false);
      };

      return () => {
        sse.close();
      };
    } catch (e) {
      console.error('SSE connection failed', e);
    }
  };

  // Beep & Voice Alerts
  const triggerAudioFeedback = (name: string, isWelcome: boolean) => {
    try {
      // Audio synth beep
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.value = isWelcome ? 660 : 440;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }

      // Voice synthesis
      if ('speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        const phrase = isWelcome 
          ? `Welcome ${name}. Clock In Successful.` 
          : `Goodbye ${name}. Have a safe journey.`;
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        synth.speak(utterance);
      }
    } catch (e) {
      console.warn('Audio feedback failed', e);
    }
  };

  // Scan Action
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanValue.trim()) return;
    
    setScanLoading(true);
    setScanError(null);
    setScanResult(null);

    try {
      const response = await scanGateCard({
        scanValue: scanValue.trim(),
        gateId: selectedGate,
        deviceId: selectedDevice,
        operatorName,
        direction: directionMode,
        departureReason: directionMode === 'clock-out' ? departureReason : 'Normal Departure'
      });

      if (response.success) {
        setScanResult(response);
        const isClockIn = response.direction === 'in';
        const scanTime = response.log ? (response.log.time_in || response.log.time_out) : undefined;
        announceScan(
          response.student.name, 
          isClockIn ? 'clock-in' : 'clock-out', 
          scanTime, 
          response.student.id || response.student.adminNo
        );
        setScanValue('');
        // Focus scan input back
        setTimeout(() => scanInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      setScanError(err.message || 'Verification failed. Please review credentials.');
    } finally {
      setScanLoading(false);
    }
  };

  // Load Permissions
  const loadPermissionsList = async () => {
    try {
      const data = await fetchGatePermissions();
      setPermissions(data);
    } catch (e) {
      console.error('Failed to load permission slips', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'permissions') {
      loadPermissionsList();
    }
  }, [activeTab]);

  const handleCreatePermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId || !permReason || !permTimeOut || !permExpectedReturn) {
      alert('All fields are required.');
      return;
    }
    setPermLoading(true);
    try {
      const res = await saveGatePermission({
        student_id: selectedStudentId,
        reason: permReason,
        approved_by: operatorName,
        time_out: permTimeOut.replace('T', ' '),
        expected_return: permExpectedReturn.replace('T', ' '),
        remarks: permRemarks
      });
      if (res.success) {
        alert('Early leave permission slip created successfully.');
        setShowPermissionModal(false);
        loadPermissionsList();
        setSelectedStudentId('');
        setPermReason('');
        setPermTimeOut('');
        setPermExpectedReturn('');
        setPermRemarks('');
      }
    } catch (err: any) {
      alert('Error creating permission slip: ' + err.message);
    } finally {
      setPermLoading(false);
    }
  };

  const handleReturnStudent = async (id: number) => {
    const confirm = window.confirm('Verify that this student has returned to campus?');
    if (!confirm) return;
    try {
      const res = await returnStudentPermission(id, {
        actual_return: new Date().toISOString().replace('T', ' ').substring(0, 19),
        status: 'Returned'
      });
      if (res.success) {
        loadPermissionsList();
      }
    } catch (e: any) {
      alert('Failed to mark return: ' + e.message);
    }
  };

  // Load Reports logs
  const loadLogsList = async () => {
    setLogsLoading(true);
    try {
      const data = await fetchAttendanceLogs(filters);
      setLogs(data);
    } catch (e) {
      console.error('Failed to load report logs', e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports') {
      loadLogsList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters.startDate, filters.endDate, filters.gradeClass, filters.stream, filters.status, filters.boardingStatus, filters.gender]);

  // Load Notification Audit Logs
  const loadAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const data = await fetchNotificationAuditLogs({
        status: auditStatusFilter,
        search: auditSearch,
        startDate: filters.startDate,
        endDate: filters.endDate
      });
      setAuditLogs(data || []);
    } catch (e) {
      console.error('Failed to load notification audit logs', e);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit-logs') {
      loadAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, auditStatusFilter, auditSearch, filters.startDate, filters.endDate]);

  // Export Suite
  const handleExportCSV = () => {
    if (logs.length === 0) return alert('No records to export.');
    const headers = ['Student Name', 'Admin No', 'Class', 'Gender', 'Boarding Status', 'Date', 'Clock In', 'Clock Out', 'Status', 'Gate In', 'Gate Out', 'Operator'];
    const rows = logs.map(l => [
      l.name, l.adminNo, l.gradeClass, l.gender, l.boardingStatus,
      new Date(l.date).toLocaleDateString(),
      l.time_in || '--', l.time_out || '--', l.status,
      l.gate_in_name || '--', l.gate_out_name || '--', l.operator_in || '--'
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `St_Paul_Attendance_Report_${filters.startDate}_to_${filters.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (logs.length === 0) return alert('No records to export.');
    const dataToExport = logs.map(l => ({
      'Student Name': l.name,
      'Admin No': l.adminNo,
      'Class': l.gradeClass,
      'Gender': l.gender,
      'Boarding Status': l.boardingStatus,
      'Date': new Date(l.date).toLocaleDateString(),
      'Clock In': l.time_in || '--',
      'Clock Out': l.time_out || '--',
      'Status': l.status,
      'Gate In': l.gate_in_name || '--',
      'Gate Out': l.gate_out_name || '--',
      'Operator': l.operator_in || '--'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Logs");
    XLSX.writeFile(wb, `St_Paul_Attendance_Report_${filters.startDate}_to_${filters.endDate}.xlsx`);
  };

  const handleExportPDF = () => {
    if (logs.length === 0) return alert('No records to export.');
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("St Paul Senior Secondary School", 14, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Student Attendance Log Report: ${filters.startDate} to ${filters.endDate}`, 14, 26);

    let y = 35;
    doc.setFillColor(79, 70, 229);
    doc.rect(14, y, 182, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("STUDENT NAME", 16, y + 5);
    doc.text("ADMIN NO", 65, y + 5);
    doc.text("CLASS", 95, y + 5);
    doc.text("DATE", 120, y + 5);
    doc.text("IN", 145, y + 5);
    doc.text("OUT", 160, y + 5);
    doc.text("STATUS", 175, y + 5);

    y += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    logs.slice(0, 50).forEach((l, idx) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
        doc.setFillColor(79, 70, 229);
        doc.rect(14, y, 182, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("STUDENT NAME", 16, y + 5);
        doc.text("ADMIN NO", 65, y + 5);
        doc.text("CLASS", 95, y + 5);
        doc.text("DATE", 120, y + 5);
        doc.text("IN", 145, y + 5);
        doc.text("OUT", 160, y + 5);
        doc.text("STATUS", 175, y + 5);
        y += 7;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");
      }

      if (idx % 2 === 1) {
        doc.setFillColor(243, 244, 246);
        doc.rect(14, y, 182, 6, "F");
      }

      doc.text(l.name.substring(0, 28), 16, y + 4.5);
      doc.text(l.adminNo, 65, y + 4.5);
      doc.text(l.gradeClass, 95, y + 4.5);
      doc.text(new Date(l.date).toLocaleDateString(), 120, y + 4.5);
      doc.text(l.time_in ? l.time_in.substring(0, 5) : '--', 145, y + 4.5);
      doc.text(l.time_out ? l.time_out.substring(0, 5) : '--', 160, y + 4.5);
      doc.text(l.status, 175, y + 4.5);
      y += 6;
    });

    if (logs.length > 50) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text(`* Report contains ${logs.length} records. Showing first 50 rows in PDF printable format. Use CSV/Excel for full datasets.`, 14, y + 6);
    }

    doc.save(`St_Paul_Gate_Report_${filters.startDate}_to_${filters.endDate}.pdf`);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>St Paul Schools Gate Attendance Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { bg-color: #f2f2f2; }
            .header { text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>St Paul Senior Secondary School</h2>
            <p><strong>Gate Scans Activity Report: ${filters.startDate} to ${filters.endDate}</strong></p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Admin No</th>
                <th>Class</th>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Status</th>
                <th>Gate Used</th>
                <th>Operator</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${l.name}</td>
                  <td>${l.adminNo}</td>
                  <td>${l.gradeClass}</td>
                  <td>${new Date(l.date).toLocaleDateString()}</td>
                  <td>${l.time_in || '--'}</td>
                  <td>${l.time_out || '--'}</td>
                  <td>${l.status}</td>
                  <td>${l.gate_in_name || l.gate_out_name || 'Main Gate'}</td>
                  <td>${l.operator_in || 'Officer'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Gates Configs Actions
  const handleAddGate = async () => {
    if (!newGateName.trim()) return;
    try {
      const res = await saveGateLocation({ name: newGateName.trim() });
      if (res.success) {
        alert('Gate location registered.');
        setNewGateName('');
        loadRegistries();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteGate = async (id: number) => {
    if (!window.confirm('Delete this gate location?')) return;
    try {
      const res = await deleteGateLocation(id);
      if (res.success) {
        loadRegistries();
      }
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  const handleAddDevice = async () => {
    if (!newDeviceName.trim() || !newDeviceId.trim()) {
      alert('ID and Name are required.');
      return;
    }
    try {
      const res = await saveGateDevice({
        id: newDeviceId.trim(),
        name: newDeviceName.trim(),
        device_type: newDeviceType
      });
      if (res.success) {
        alert('Scanner device registered.');
        setNewDeviceId('');
        setNewDeviceName('');
        loadRegistries();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!window.confirm('Delete this device?')) return;
    try {
      const res = await deleteGateDevice(id);
      if (res.success) {
        loadRegistries();
      }
    } catch (err: any) {
      alert('Error deleting: ' + err.message);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await saveAttendanceSettings(timings);
      if (res.success) {
        alert('Gate timing configurations saved successfully.');
      }
    } catch (err: any) {
      alert('Error saving timings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-6">
      {/* Module Title */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-800 pb-4 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-indigo-950 border border-indigo-900/50 rounded-lg">
              <Clock className="w-5 h-5 text-indigo-400" />
            </span>
            <h2 className="text-base font-black text-slate-100 uppercase tracking-wider">Student Attendance &amp; Gate Control</h2>
          </div>
          <p className="text-xs text-slate-450 leading-none">Automated RFID, NFC, and QR scanning gate clearance module.</p>
        </div>
        
        {/* SSE Pulse Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-center font-mono">
          <span className={`w-2.5 h-2.5 rounded-full ${sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'}`} />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {sseConnected ? 'SSE Live Feed Active' : 'Connecting to Server...'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 overflow-x-auto gap-1">
        {(['qr-guard', 'dashboard', 'gate', 'monitor', 'permissions', 'reports', 'audit-logs', 'setup'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'dashboard') loadDashboard();
              if (tab === 'audit-logs') loadAuditLogs();
            }}
            className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all duration-200 cursor-pointer flex-1 text-center ${
              activeTab === tab 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/50 scale-[1.02]' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            {tab === 'qr-guard' ? '📷 Guard QR Scanner' :
             tab === 'dashboard' ? 'Dashboard & Charts' :
             tab === 'gate' ? 'Gate Console' :
             tab === 'monitor' ? 'Live Gate Monitor' :
             tab === 'permissions' ? 'Permissions & Slips' :
             tab === 'reports' ? 'Reports & Exports' :
             tab === 'audit-logs' ? '🔔 Notification Audit Logs' :
             'Gate Setup'}
          </button>
        ))}
      </div>

      {/* Contents */}
      <div>
        {activeTab === 'qr-guard' && (
          <div className="bg-slate-900 p-2 md:p-4 rounded-2xl border border-slate-800">
            <QRAttendanceSystem students={allStudentsList.length > 0 ? allStudentsList : INITIAL_STUDENTS} />
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {dashLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing database counters...</p>
              </div>
            ) : dashboardData ? (
              <div className="space-y-6 animate-fade-in">
                {/* Metrics Bento Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Total Roster</p>
                    <p className="text-2xl font-black mt-2 text-slate-200">{dashboardData.metrics.totalStudents}</p>
                    <p className="text-[9px] text-slate-500 mt-1 font-mono">Registered St. Paul Students</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Inside Campus</p>
                    <p className="text-2xl font-black mt-2 text-emerald-400">{dashboardData.metrics.insideSchool}</p>
                    <p className="text-[9px] text-emerald-500/80 mt-1 font-mono">Clocked In &amp; In Classrooms</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Clocked Out</p>
                    <p className="text-2xl font-black mt-2 text-indigo-400">{dashboardData.metrics.clockedOut}</p>
                    <p className="text-[9px] text-indigo-400/80 mt-1 font-mono">Departed for Today</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Absentees</p>
                    <p className="text-2xl font-black mt-2 text-rose-500">{dashboardData.metrics.absentToday}</p>
                    <p className="text-[9px] text-rose-500/80 mt-1 font-mono">No scans logged today</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Late Arrivals</p>
                    <p className="text-xl font-black mt-2 text-amber-500">{dashboardData.metrics.lateToday}</p>
                    <p className="text-[9px] text-amber-500/80 mt-1 font-mono">Clocked In after {timings.school_start_time}</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Early Leaves</p>
                    <p className="text-xl font-black mt-2 text-violet-400">{dashboardData.metrics.earlyDepartures}</p>
                    <p className="text-[9px] text-violet-400/80 mt-1 font-mono">Departures with permission</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Visitors</p>
                    <p className="text-xl font-black mt-2 text-slate-350">{dashboardData.metrics.visitorsToday}</p>
                    <p className="text-[9px] text-slate-500 mt-1 font-mono">Registered log entries</p>
                  </div>
                  <div className="bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono">Teachers On Duty</p>
                    <p className="text-xl font-black mt-2 text-emerald-400">{dashboardData.metrics.teachersPresent}</p>
                    <p className="text-[9px] text-emerald-500/80 mt-1 font-mono">Staff logged on campus</p>
                  </div>
                </div>

                {/* SVG Charts section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Hourly scans */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Hourly Arrival Distribution (Today)</h3>
                    <div className="h-48 flex items-end justify-between gap-1 pt-6 font-mono text-[9px] text-slate-500">
                      {dashboardData.charts.hourlyData.map((h: any, idx: number) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <span className="text-[8.5px] text-indigo-300 font-bold">{h.value || ''}</span>
                          <div 
                            style={{ height: `${h.value > 0 ? Math.max(10, Math.min(80, (h.value / dashboardData.metrics.totalStudents) * 500)) : 2}%` }}
                            className="w-full bg-gradient-to-t from-indigo-700 to-indigo-500 rounded-t border-t border-indigo-400/40 min-h-[3px] transition-all duration-300"
                          />
                          <span className="text-[7.5px] tracking-tighter truncate w-full text-center">{h.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Daily Trends */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Daily Campus Attendance Rate (%)</h3>
                    <div className="h-48 flex items-end justify-between gap-2 pt-6 font-mono text-[9px] text-slate-500">
                      {dashboardData.charts.dailyData.map((d: any, idx: number) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                          <span className="text-[9px] text-emerald-400 font-bold">{d.value}%</span>
                          <div 
                            style={{ height: `${d.value}%` }}
                            className="w-full bg-gradient-to-t from-emerald-700 to-emerald-500 rounded-t border-t border-emerald-400/40 transition-all duration-300"
                          />
                          <span className="text-[8px] tracking-tight">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Boarding vs Day splits */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 space-y-3">
                      <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Boarding vs Day Scholar Present</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Boarders Present:</span>
                          <span className="font-bold text-slate-200 font-mono">{dashboardData.charts.boardingSplits.boarders}</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-2">
                          <div 
                            style={{ width: `${dashboardData.metrics.insideSchool > 0 ? (dashboardData.charts.boardingSplits.boarders / (dashboardData.metrics.insideSchool + dashboardData.metrics.clockedOut)) * 100 : 0}%` }}
                            className="bg-indigo-600 h-full rounded-full"
                          />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Day Scholars Present:</span>
                          <span className="font-bold text-slate-200 font-mono">{dashboardData.charts.boardingSplits.dayscholars}</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-2">
                          <div 
                            style={{ width: `${dashboardData.metrics.insideSchool > 0 ? (dashboardData.charts.boardingSplits.dayscholars / (dashboardData.metrics.insideSchool + dashboardData.metrics.clockedOut)) * 100 : 0}%` }}
                            className="bg-violet-600 h-full rounded-full"
                          />
                        </div>
                      </div>
                    </div>
                    {/* Gender split summary */}
                    <div className="flex-1 space-y-3 w-full border-t md:border-t-0 md:border-l border-slate-850/80 pt-4 md:pt-0 md:pl-6">
                      <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Male vs Female Scans Today</h3>
                      <div className="grid grid-cols-2 gap-4 text-center select-none pt-2">
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Boys</p>
                          <p className="text-lg font-black text-blue-400 font-mono">{dashboardData.charts.genderSplits.male}</p>
                        </div>
                        <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Girls</p>
                          <p className="text-lg font-black text-pink-400 font-mono">{dashboardData.charts.genderSplits.female}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Class comparisons */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Top 6 Classes Present (Today)</h3>
                    <div className="space-y-2.5">
                      {dashboardData.charts.classComparison.map((cls: any, idx: number) => (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-300">{cls.label}</span>
                            <span className="font-mono text-indigo-300 font-bold">{cls.value} Scanned</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-2">
                            <div 
                              style={{ width: `${dashboardData.metrics.insideSchool > 0 ? (cls.value / (dashboardData.metrics.insideSchool + dashboardData.metrics.clockedOut)) * 100 : 0}%` }}
                              className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-full rounded-full"
                            />
                          </div>
                        </div>
                      ))}
                      {dashboardData.charts.classComparison.length === 0 && (
                        <p className="text-slate-500 text-xs text-center py-6">No scans logged from any class today.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs font-bold uppercase">Unable to compile stats. Check server connection.</div>
            )}
          </div>
        )}

        {activeTab === 'gate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            {/* Control scanning parameters */}
            <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 space-y-5">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850/80 pb-2.5 flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4" /> Scanner Parameters
              </h3>
              
              <div className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Operator Name</label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Active Gate Location</label>
                  <select
                    value={selectedGate || ''}
                    onChange={(e) => setSelectedGate(Number(e.target.value) || null)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none transition cursor-pointer"
                  >
                    {gates.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                    {gates.length === 0 && <option value="">No Gates Registered</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Scanned Device</label>
                  <select
                    value={selectedDevice || ''}
                    onChange={(e) => setSelectedDevice(e.target.value || null)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none transition cursor-pointer"
                  >
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.device_type})</option>
                    ))}
                    {devices.length === 0 && <option value="">No Devices Registered</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Scan Direction</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 font-bold uppercase text-[9px] text-center select-none">
                    <button
                      type="button"
                      onClick={() => setDirectionMode('auto')}
                      className={`py-1.5 rounded transition cursor-pointer ${directionMode === 'auto' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Auto Detect
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectionMode('clock-in')}
                      className={`py-1.5 rounded transition cursor-pointer ${directionMode === 'clock-in' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Clock In
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectionMode('clock-out')}
                      className={`py-1.5 rounded transition cursor-pointer ${directionMode === 'clock-out' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      Clock Out
                    </button>
                  </div>
                </div>

                {directionMode === 'clock-out' && (
                  <div className="space-y-1 animate-fade-in">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Departure Status Reason</label>
                    <select
                      value={departureReason}
                      onChange={(e) => setDepartureReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none transition cursor-pointer font-bold"
                    >
                      <option value="Normal Departure">Normal Departure</option>
                      <option value="Permission">Permission</option>
                      <option value="Medical">Medical</option>
                      <option value="Sports">Sports</option>
                      <option value="Trip">Trip</option>
                      <option value="Suspension">Suspension</option>
                      <option value="Emergency">Emergency</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Scanning Scan Center */}
            <div className="lg:col-span-2 space-y-6">
              {/* Form Scan */}
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 text-center space-y-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Gate Scans Receiver</h3>
                <form onSubmit={handleScanSubmit} className="max-w-md mx-auto relative">
                  <input
                    ref={scanInputRef}
                    type="text"
                    autoFocus
                    placeholder="Scan Student QR / RFID / Admin ID Number..."
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    disabled={scanLoading}
                    className="w-full pl-4 pr-12 py-3 bg-slate-900 border-2 border-slate-800 hover:border-slate-750 focus:border-indigo-600 rounded-xl text-sm text-slate-200 outline-none transition font-mono tracking-wide placeholder-slate-500"
                  />
                  <button 
                    type="submit" 
                    disabled={scanLoading || !scanValue.trim()}
                    className="absolute right-2 top-2 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white disabled:text-slate-500 text-[10px] font-black uppercase rounded-lg transition cursor-pointer"
                  >
                    {scanLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'SCAN'}
                  </button>
                </form>
                <div className="flex justify-center items-center gap-1.5 text-[9px] text-slate-500 leading-normal font-medium">
                  <Volume2 className="w-3.5 h-3.5 text-slate-650 shrink-0" />
                  <span>Real-time audio scan status and speech feedback are fully enabled.</span>
                </div>
              </div>

              {/* Scanning Results banner */}
              {scanResult && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 animate-scale-up space-y-5">
                  <div className={`px-4 py-3 rounded-xl border flex items-center gap-3 text-xs font-bold ${
                    scanResult.direction === 'in'
                      ? 'bg-emerald-950/50 border-emerald-900/60 text-emerald-400'
                      : 'bg-amber-950/50 border-amber-900/60 text-amber-400'
                  }`}>
                    {scanResult.direction === 'in' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <Clock className="w-5 h-5 shrink-0" />}
                    <div>
                      <p className="text-sm font-black uppercase tracking-tight">{scanResult.message}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Direction: {scanResult.direction === 'in' ? 'CLOCK IN (Campus Arrival)' : 'CLOCK OUT (Departure)'} &bull; Time: {scanResult.log.time_in || scanResult.log.time_out} &bull; Status: {scanResult.log.status}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <div className="w-24 h-28 bg-slate-950 border border-slate-850 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                      {scanResult.student.photo ? (
                        <img src={scanResult.student.photo} alt={scanResult.student.name} className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-10 h-10 text-slate-800" />
                      )}
                    </div>
                    <div className="text-center sm:text-left text-xs leading-normal flex-1 space-y-1.5">
                      <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2">
                        <h4 className="text-base font-black text-slate-200 uppercase tracking-tight">{scanResult.student.name}</h4>
                        <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-900 text-indigo-400 rounded text-[9px] font-bold font-mono">
                          {scanResult.student.adminNo}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 pt-1 text-slate-400">
                        <p>Class: <span className="font-bold text-slate-200">{scanResult.student.gradeClass}</span></p>
                        <p>Gender: <span className="font-bold text-slate-200">{scanResult.student.gender}</span></p>
                        <p>Boarding: <span className="font-bold text-slate-200">{scanResult.student.boardingStatus}</span></p>
                        <p>House: <span className="font-bold text-slate-200">{scanResult.student.remarks?.includes('House') ? scanResult.student.remarks : 'St Paul House'}</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {scanError && (
                <div className="bg-rose-950/20 border border-rose-900/60 text-rose-400 p-4 rounded-xl flex items-center gap-3 text-xs font-bold animate-fade-in">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-rose-500" />
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight">Access / Verification Rejected</p>
                    <p className="text-[10px] text-slate-450 mt-0.5">{scanError}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'monitor' && (
          <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" /> Real-Time Gate Monitor
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Displaying scans as they trigger.</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs leading-normal">
                <thead>
                  <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                    <th className="py-2.5 px-3 w-[60px]">Photo</th>
                    <th className="py-2.5 px-3">Student Details</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Scan Type</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Gate</th>
                    <th className="py-2.5 px-3">Notification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/40">
                  {liveScans.map((log: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-900/40 transition font-mono animate-scale-up">
                      <td className="py-2 px-3">
                        <div className="w-8 h-10 bg-slate-900 rounded overflow-hidden flex items-center justify-center border border-slate-850 shrink-0">
                          {log.photo ? (
                            <img src={log.photo} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-4 h-4 text-slate-750" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <p className="font-bold text-slate-200 font-sans text-xs uppercase leading-snug">{log.name}</p>
                        <p className="text-[10px] text-slate-500 leading-none mt-0.5">{log.adminNo}</p>
                      </td>
                      <td className="py-2 px-3 text-slate-350 text-xs font-sans">{log.gradeClass} ({log.boardingStatus})</td>
                      <td className="py-2 px-3">
                        {log.time_out ? (
                          <span className="text-rose-400 font-bold text-[10px]">▼ CLOCK OUT</span>
                        ) : (
                          <span className="text-emerald-400 font-bold text-[10px]">▲ CLOCK IN</span>
                        )}
                        {log.departure_status && log.departure_status !== 'Normal Departure' && (
                          <span className="block text-[8.5px] text-amber-500/80 font-bold uppercase leading-none mt-0.5">{log.departure_status}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-350">{log.time_out || log.time_in}</td>
                      <td className="py-2 px-3 text-slate-450 text-xs font-sans">{log.gate_out_name || log.gate_in_name || 'Main Gate'}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-emerald-950 text-emerald-400 border border-emerald-900/30">
                            Delivered
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {liveScans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-2 py-4">
                          <Radio className="w-6 h-6 text-slate-750 animate-pulse" />
                          <p className="text-xs uppercase font-bold tracking-wider">Awaiting scans on active gates...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Early Leave Permission Slips</h3>
              <button
                onClick={() => setShowPermissionModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-lg transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Issue Slip
              </button>
            </div>

            {/* List permissions */}
            <div className="overflow-x-auto bg-slate-950/40 border border-slate-850 rounded-xl p-4">
              <table className="w-full text-left text-xs leading-normal">
                <thead>
                  <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Issued Time</th>
                    <th className="py-2.5 px-3">Expected Return</th>
                    <th className="py-2.5 px-3">Actual Return</th>
                    <th className="py-2.5 px-3">Approved By</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/50">
                  {permissions.map((p: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-900/60 transition font-mono">
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-200 font-sans text-xs uppercase leading-snug">{p.student_name}</p>
                        <p className="text-[10px] text-slate-500 leading-none mt-0.5">{p.student_adminNo} ({p.student_gradeClass})</p>
                      </td>
                      <td className="py-3 px-3 text-slate-350 text-xs font-sans max-w-[200px] truncate" title={p.reason}>{p.reason}</td>
                      <td className="py-3 px-3 text-slate-450">{new Date(p.time_out).toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-450">{new Date(p.expected_return).toLocaleString()}</td>
                      <td className="py-3 px-3 text-slate-450">{p.actual_return ? new Date(p.actual_return).toLocaleString() : '--'}</td>
                      <td className="py-3 px-3 text-slate-400 text-xs font-sans">{p.approved_by}</td>
                      <td className="py-3 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase ${
                          p.status === 'Returned' 
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' 
                            : 'bg-rose-950 text-rose-400 border border-rose-900/30'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {p.status === 'Not Returned' && (
                          <button
                            onClick={() => handleReturnStudent(p.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 hover:text-emerald-300 border border-emerald-900 text-[8.5px] font-black uppercase tracking-wider rounded transition cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3" /> Mark Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {permissions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">No issued early leave permissions.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Permission modal */}
            {showPermissionModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 max-w-md w-full space-y-4 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-black uppercase text-slate-100 tracking-wider">Issue Early Leave Permission</h3>
                    <button onClick={() => setShowPermissionModal(false)} className="text-slate-500 hover:text-slate-300 font-bold font-mono text-xs cursor-pointer">[ CLOSE ]</button>
                  </div>
                  <form onSubmit={handleCreatePermission} className="space-y-3.5 text-xs text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Select Student</label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="">-- Choose Student --</option>
                        {allStudentsList.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.adminNo} - {s.gradeClass})</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Reason For Leaving</label>
                      <textarea
                        rows={2}
                        value={permReason}
                        onChange={(e) => setPermReason(e.target.value)}
                        placeholder="e.g. Medical referral, sports trip, home suspension"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded focus:border-indigo-500 text-slate-200 outline-none resize-none transition"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Time Out</label>
                        <input
                          type="datetime-local"
                          value={permTimeOut}
                          onChange={(e) => setPermTimeOut(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded focus:border-indigo-500 text-slate-200 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Expected Return</label>
                        <input
                          type="datetime-local"
                          value={permExpectedReturn}
                          onChange={(e) => setPermExpectedReturn(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded focus:border-indigo-500 text-slate-200 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Remarks (Optional)</label>
                      <input
                        type="text"
                        value={permRemarks}
                        onChange={(e) => setPermRemarks(e.target.value)}
                        placeholder="Any additional remarks..."
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded focus:border-indigo-500 text-slate-200 outline-none transition"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex gap-2">
                      <button
                        type="submit"
                        disabled={permLoading}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer transition text-center"
                      >
                        {permLoading ? 'ISSUING...' : 'CONFIRM ISSUE'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filters Bar */}
            <div className="bg-slate-950/45 border border-slate-850 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Class Filter</label>
                <select
                  value={filters.gradeClass}
                  onChange={(e) => setFilters(prev => ({ ...prev, gradeClass: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                >
                  <option value="All">All Classes</option>
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Stream Filter</label>
                <select
                  value={filters.stream}
                  onChange={(e) => setFilters(prev => ({ ...prev, stream: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                >
                  <option value="All">All Streams</option>
                  {streams.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Arrival Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Very Late">Very Late</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Boarding Status</label>
                <select
                  value={filters.boardingStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, boardingStatus: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                >
                  <option value="All">All</option>
                  <option value="Boarder">Boarders</option>
                  <option value="Day Scholar">Day Scholars</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Gender Filter</label>
                <select
                  value={filters.gender}
                  onChange={(e) => setFilters(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none cursor-pointer"
                >
                  <option value="All">All</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">Name / Admin No Search</label>
                <input
                  type="text"
                  placeholder="Type name or ID..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* Export Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/20 border border-slate-850 p-3 rounded-xl">
              <span className="text-xs text-slate-400 font-bold font-mono">Compiled: {logs.length} Log Records matching filters</span>
              <div className="flex flex-wrap gap-2 text-xs">
                <button onClick={handleExportExcel} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 hover:text-emerald-250 font-black uppercase tracking-wider rounded border border-emerald-900/60 transition cursor-pointer">
                  Excel Export
                </button>
                <button onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 hover:text-cyan-250 font-black uppercase tracking-wider rounded border border-cyan-900/60 transition cursor-pointer">
                  CSV Export
                </button>
                <button onClick={handleExportPDF} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 hover:text-rose-250 font-black uppercase tracking-wider rounded border border-rose-900/60 transition cursor-pointer">
                  PDF Printable
                </button>
                <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-slate-200 font-black uppercase tracking-wider rounded border border-slate-800 transition cursor-pointer">
                  Layout Print
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 overflow-x-auto">
              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Compiling logs report...</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs leading-normal">
                  <thead>
                    <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Admin No</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Boarding</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">In</th>
                      <th className="py-2.5 px-3">Out</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Departure Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/50">
                    {logs.map((log: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition font-mono">
                        <td className="py-2.5 px-3 text-slate-200 font-bold font-sans">{log.name}</td>
                        <td className="py-2.5 px-3 text-slate-450">{log.adminNo}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-sans">{log.gradeClass}</td>
                        <td className="py-2.5 px-3 text-slate-450 font-sans">{log.boardingStatus}</td>
                        <td className="py-2.5 px-3 text-slate-350">{new Date(log.date).toLocaleDateString()}</td>
                        <td className="py-2.5 px-3 text-slate-350">{log.time_in || '--'}</td>
                        <td className="py-2.5 px-3 text-slate-350">{log.time_out || '--'}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                            log.status === 'Present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                            log.status === 'Late' || log.status === 'Very Late' ? 'bg-amber-950 text-amber-400 border border-amber-900/30' :
                            'bg-rose-950 text-rose-400 border border-rose-900/30'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-amber-400 font-black uppercase text-[9px]">{log.departure_status || '--'}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">No logs found matching filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in text-xs">
            {/* Gate locations and devices setups */}
            <div className="space-y-6">
              {/* Gate Locations */}
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 space-y-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Campus Gates Registry
                </h3>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Main Gate, East Gate"
                    value={newGateName}
                    onChange={(e) => setNewGateName(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none"
                  />
                  <button
                    onClick={handleAddGate}
                    disabled={!newGateName.trim()}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-wider rounded transition cursor-pointer"
                  >
                    ADD
                  </button>
                </div>

                <div className="divide-y divide-slate-850/40 max-h-[200px] overflow-y-auto pr-1">
                  {gates.map(g => (
                    <div key={g.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                        <span className="font-bold text-slate-300 uppercase">{g.name}</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteGate(g.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold uppercase transition"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {gates.length === 0 && <p className="text-slate-500 py-2">No gates registered.</p>}
                </div>
              </div>

              {/* Scanner Devices */}
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 space-y-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                  <Radio className="w-4 h-4" /> Scanner Devices Configuration
                </h3>
                
                <div className="space-y-3.5 bg-slate-900/60 p-3 rounded-lg border border-slate-850/80">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Device ID (e.g. DEV-001)"
                      value={newDeviceId}
                      onChange={(e) => setNewDeviceId(e.target.value)}
                      className="px-3 py-1.5 bg-slate-950 border border-slate-850 rounded text-slate-200 outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Device Name (e.g. Front RFID)"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      className="px-3 py-1.5 bg-slate-950 border border-slate-850 rounded text-slate-200 outline-none"
                    />
                  </div>
                  <div className="flex justify-between items-center gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Reader Type:</span>
                      <select
                        value={newDeviceType}
                        onChange={(e) => setNewDeviceType(e.target.value)}
                        className="px-2 py-1 bg-slate-955 border border-slate-850 rounded text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="QR">QR Scanner</option>
                        <option value="RFID">RFID Card Reader</option>
                        <option value="NFC">NFC Sensor</option>
                        <option value="Biometric">Fingerprint Scanner</option>
                        <option value="Manual">Manual Entry Console</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddDevice}
                      disabled={!newDeviceId.trim() || !newDeviceName.trim()}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-wider rounded transition cursor-pointer"
                    >
                      REGISTER DEVICE
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-850/40 max-h-[220px] overflow-y-auto pr-1">
                  {devices.map(d => (
                    <div key={d.id} className="py-2.5 flex items-center justify-between gap-3 font-mono">
                      <div>
                        <p className="font-bold text-slate-350 text-xs font-sans uppercase">{d.name}</p>
                        <p className="text-[10px] text-slate-500">ID: {d.id} &bull; Type: {d.device_type} &bull; Status: {d.status}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteDevice(d.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold uppercase transition"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {devices.length === 0 && <p className="text-slate-500 py-2">No devices configured.</p>}
                </div>
              </div>
            </div>

            {/* Audio Speech Settings Panel */}
            <TTSSettingsPanel />

            {/* School timings settings */}
            <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 md:p-5 space-y-4">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                <Settings className="w-4 h-4" /> Arrival Thresholds Setup
              </h3>
              
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Official Start Time</label>
                    <input
                      type="time"
                      value={timings.school_start_time}
                      onChange={(e) => setTimings(prev => ({ ...prev, school_start_time: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none font-mono"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 leading-normal">Scans before this time are flagged <strong>Present</strong>.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Late Threshold</label>
                    <input
                      type="time"
                      value={timings.late_threshold}
                      onChange={(e) => setTimings(prev => ({ ...prev, late_threshold: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none font-mono"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 leading-normal">Scans after start time up to this are flagged <strong>Late</strong>.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-black uppercase tracking-wider block">Very Late Threshold</label>
                    <input
                      type="time"
                      value={timings.very_late_threshold}
                      onChange={(e) => setTimings(prev => ({ ...prev, very_late_threshold: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded focus:border-indigo-500 text-slate-200 outline-none font-mono"
                    />
                    <p className="text-[9px] text-slate-500 mt-1 leading-normal">Scans after this threshold are flagged <strong>Very Late</strong>.</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-850 flex justify-end">
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-black uppercase tracking-wider rounded-lg transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> {savingSettings ? 'SAVING...' : 'SAVE TIMING SETTINGS'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit-logs' && (
          <div className="space-y-6 animate-fade-in">
            {/* Filter Bar */}
            <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Notification Status</label>
                  <select
                    value={auditStatusFilter}
                    onChange={(e) => setAuditStatusFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="ALL">All Delivery Statuses</option>
                    <option value="Sent">Sent / Delivered</option>
                    <option value="Failed">Failed Alerts</option>
                    <option value="Not Attempted">Not Attempted (No WhatsApp #)</option>
                  </select>
                </div>

                <div className="space-y-1 flex-1 md:w-64">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Search Student / Phone</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search student name, admin no, or phone..."
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              <button
                onClick={loadAuditLogs}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${auditLogsLoading ? 'animate-spin' : ''}`} />
                Refresh Audit Logs
              </button>
            </div>

            {/* Audit Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Audit Records</p>
                <p className="text-xl font-black text-white mt-1">{auditLogs.length}</p>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-400 uppercase">Sent / Delivered</p>
                <p className="text-xl font-black text-emerald-400 mt-1">
                  {auditLogs.filter(a => a.status === 'Sent' || a.status === 'Delivered').length}
                </p>
              </div>
              <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-rose-400 uppercase">Failed Notifications</p>
                <p className="text-xl font-black text-rose-400 mt-1">
                  {auditLogs.filter(a => a.status === 'Failed').length}
                </p>
              </div>
              <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl">
                <p className="text-[10px] font-bold text-amber-400 uppercase">Not Attempted (No #)</p>
                <p className="text-xl font-black text-amber-400 mt-1">
                  {auditLogs.filter(a => a.status === 'Not Attempted').length}
                </p>
              </div>
            </div>

            {/* Audit Logs Table with Pictures */}
            <div className="bg-slate-950/40 border border-slate-850 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-850">
                    <tr>
                      <th className="px-4 py-3">Student Photo &amp; Info</th>
                      <th className="px-4 py-3">Event Type</th>
                      <th className="px-4 py-3">Recipient &amp; Phone</th>
                      <th className="px-4 py-3">WhatsApp Message</th>
                      <th className="px-4 py-3">Notification Status</th>
                      <th className="px-4 py-3">Kampala Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60 font-medium">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/50 transition">
                        {/* Student Photo */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-12 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shrink-0 flex items-center justify-center">
                              {log.student_photo ? (
                                <img src={log.student_photo} alt={log.student_name} className="w-full h-full object-cover" />
                              ) : (
                                <Users className="w-5 h-5 text-slate-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-white uppercase text-xs">{log.student_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{log.student_adminNo} &bull; {log.gradeClass}</p>
                            </div>
                          </div>
                        </td>

                        {/* Event Type */}
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            log.type === 'ClockIn' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {log.type === 'ClockIn' ? '✔ Clock In' : '🚪 Clock Out'}
                          </span>
                        </td>

                        {/* Recipient Phone */}
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {log.recipient_phone ? (
                            <div>
                              <span className="text-white font-bold">{log.recipient_phone}</span>
                              <span className="text-[9px] text-slate-400 block uppercase font-sans">{log.recipient_type}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">No Phone Registered</span>
                          )}
                        </td>

                        {/* Message Body */}
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-[11px] text-slate-300 line-clamp-2" title={log.message}>
                            {log.message}
                          </p>
                        </td>

                        {/* Notification Status */}
                        <td className="px-4 py-3">
                          {log.status === 'Sent' || log.status === 'Delivered' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {log.status}
                            </span>
                          ) : log.status === 'Failed' ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-950 text-rose-400 border border-rose-800">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> Failed
                              </span>
                              {log.error_message && (
                                <p className="text-[9px] text-rose-400 max-w-xs truncate" title={log.error_message}>
                                  {log.error_message}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-950 text-amber-400 border border-amber-800" title="Attendance recorded, WhatsApp not attempted as no number was registered">
                              ⚪ Not Attempted
                            </span>
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {log.sent_at ? new Date(log.sent_at).toLocaleString('en-US', { timeZone: 'Africa/Kampala' }) : '-'}
                        </td>
                      </tr>
                    ))}

                    {auditLogs.length === 0 && !auditLogsLoading && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 uppercase font-bold text-xs">
                          No notification audit logs found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
