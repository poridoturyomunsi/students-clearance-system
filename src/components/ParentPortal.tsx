import React, { useEffect, useState } from 'react';
import { 
  GraduationCap, LogOut, Download, CheckCircle2, XCircle, DollarSign, 
  CalendarDays, Award, AlertCircle, RefreshCw, Megaphone, Users, 
  Layers, Clock, MessageSquare, Phone, MapPin, Mail, Sparkles 
} from 'lucide-react';
import SchoolLogo from './SchoolLogo.tsx';
import { fetchParentPortalData } from '../utils/api.ts';

interface ParentPortalProps {
  studentId: string;
  studentName: string;
  adminNo: string;
  schoolLogo: string | null;
  onLogout: () => void;
}

export default function ParentPortal({ studentId, studentName, adminNo, schoolLogo, onLogout }: ParentPortalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'academic' | 'fees' | 'announcements'>('overview');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchParentPortalData(studentId);
      setData(response);
    } catch (err: any) {
      console.error('Error fetching parent portal data:', err);
      setError(err.message || 'Failed to sync child records from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [studentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Syncing child dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-955 border border-slate-850 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-xl">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-sm font-black uppercase text-slate-200">Sync Failed</h3>
          <p className="text-xs text-slate-500">{error || 'Unable to sync records'}</p>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
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

  const { student, parentContacts, attendance, announcements = [], fees = [], olevelMarks = [], uaceMarks = [], notifications = [] } = data;

  const totalAttendance = attendance.length;
  const presentDays = attendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length;
  const lateDays = attendance.filter((a: any) => a.status === 'Late' || a.status === 'Very Late').length;
  const absentDays = attendance.filter((a: any) => a.status === 'Absent').length;
  const attendancePct = totalAttendance > 0 ? Math.round((presentDays / totalAttendance) * 100) : 100;

  // Active fee summary
  const activeFee = fees[0] || { amount_due: 0, amount_paid: 0, balance: 0, payment_status: 'Pending' };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-850 px-4 md:px-6 py-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <SchoolLogo logo={schoolLogo} size="w-9 h-9" />
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-100">ST. PAUL SCHOOLS</h1>
            <p className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest leading-none">Parent Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-200">{parentContacts ? (parentContacts.father_name || parentContacts.mother_name || parentContacts.guardian_name || 'Parent Profile') : 'Parent Profile'}</p>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Child: {studentName}</p>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 hover:text-rose-200 text-xs font-black uppercase tracking-wider rounded border border-rose-900/60 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 overflow-y-auto">
        {/* Child Profile Banner */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-center gap-5 shadow-lg shadow-black/20">
          <div className="w-20 h-24 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
            {student.photo ? (
              <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
            ) : (
              <GraduationCap className="w-10 h-10 text-slate-750" />
            )}
          </div>
          <div className="text-center md:text-left flex-1 space-y-1">
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-2">
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">{student.name}</h2>
              <span className="px-2 py-0.5 bg-indigo-950 border border-indigo-900/50 text-indigo-400 text-[10px] font-bold rounded-full uppercase tracking-wider font-mono">
                {student.adminNo}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Class: <span className="font-bold text-slate-200">{student.gradeClass}</span> Stream &bull; Gender: <span className="font-bold text-slate-200">{student.gender}</span> &bull; Status: <span className="font-bold text-slate-200">{student.boardingStatus}</span>
            </p>
            <div className="pt-2 flex flex-wrap justify-center md:justify-start gap-2.5">
              <div className="px-2.5 py-1 bg-slate-950/80 border border-slate-850 rounded text-[10px] font-bold text-slate-400 flex items-center gap-1.5 font-mono">
                <MapPin className="w-3.5 h-3.5 text-slate-500" /> {parentContacts?.home_address || 'Address Not Registered'}
              </div>
              <div className="px-2.5 py-1 bg-slate-950/80 border border-slate-850 rounded text-[10px] font-bold text-slate-400 flex items-center gap-1.5 font-mono">
                <Mail className="w-3.5 h-3.5 text-slate-500" /> {parentContacts?.email || 'Email Not Registered'}
              </div>
            </div>
          </div>
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-2 w-full md:w-auto shrink-0 select-none">
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-center min-w-[90px]">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Attendance</p>
              <p className="text-xl font-black mt-0.5 text-indigo-400">{attendancePct}%</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-center min-w-[90px]">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Late Arrivals</p>
              <p className="text-xl font-black mt-0.5 text-amber-500">{lateDays}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-3 text-center min-w-[90px]">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider font-mono">Fees Balance</p>
              <p className="text-xs font-black mt-2 text-rose-500 font-mono">
                {activeFee.balance > 0 ? `UGX ${(activeFee.balance).toLocaleString()}` : 'Cleared'}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800/80 shadow-inner overflow-x-auto w-full md:w-max">
          {(['overview', 'attendance', 'academic', 'fees', 'announcements'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider whitespace-nowrap transition cursor-pointer flex-1 md:flex-initial text-center ${
                activeTab === tab 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-md">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Announcements Preview */}
                <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                      <Megaphone className="w-4 h-4" /> Bulletins & Announcements
                    </h3>
                    <button onClick={() => setActiveTab('announcements')} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase">
                      View All
                    </button>
                  </div>
                  <div className="space-y-3">
                    {announcements.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No announcement bulletins posted this week.</p>
                    ) : (
                      announcements.slice(0, 3).map((ann: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-900 rounded-lg border border-slate-850/40 hover:border-slate-800 transition">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-bold text-slate-200 uppercase">{ann.title}</h4>
                            <span className="text-[9px] font-mono text-slate-500 font-bold uppercase shrink-0">{new Date(ann.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{ann.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Gate Log Snapshot */}
                <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> Today's Gate Entry / Exit Logs
                    </h3>
                    <button onClick={() => setActiveTab('attendance')} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold uppercase">
                      View Calendar
                    </button>
                  </div>
                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto">
                    {attendance.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-4">No gate logs recorded this week.</p>
                    ) : (
                      attendance.slice(0, 4).map((log: any, idx: number) => (
                        <div key={idx} className="p-2.5 bg-slate-900 rounded-lg border border-slate-850/40 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            {log.status === 'Present' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : log.status === 'Late' || log.status === 'Very Late' ? (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                            <div>
                              <p className="font-bold text-slate-200">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                              <p className="text-[10px] text-slate-500 font-mono">In: {log.time_in || '--:--'} &bull; Out: {log.time_out || '--:--'}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider font-mono ${
                              log.status === 'Present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' :
                              log.status === 'Late' || log.status === 'Very Late' ? 'bg-amber-950 text-amber-400 border border-amber-900/60' :
                              'bg-rose-950 text-rose-400 border border-rose-900/60'
                            }`}>
                              {log.status}
                            </span>
                            {log.departure_status && (
                              <p className="text-[9px] text-slate-500 uppercase font-bold mt-1">{log.departure_status}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Parent Info Registry Overview */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2.5 mb-4">
                  <Users className="w-4 h-4" /> Parent Registry & Emergency Contacts
                </h3>
                {parentContacts ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed">
                    <div className="p-3 bg-slate-900/60 border border-slate-850/50 rounded-lg space-y-1.5">
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Father Details</p>
                      <p className="font-bold text-slate-200">{parentContacts.father_name || 'Not Registered'}</p>
                      <p className="text-slate-450 font-mono flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" /> {parentContacts.father_phone || 'None'}</p>
                      <p className="text-slate-450 font-mono flex items-center gap-1"><MessageSquare className="w-3 h-3 text-emerald-500" /> {parentContacts.father_whatsapp || 'None'}</p>
                    </div>
                    <div className="p-3 bg-slate-900/60 border border-slate-850/50 rounded-lg space-y-1.5">
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Mother Details</p>
                      <p className="font-bold text-slate-200">{parentContacts.mother_name || 'Not Registered'}</p>
                      <p className="text-slate-450 font-mono flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" /> {parentContacts.mother_phone || 'None'}</p>
                      <p className="text-slate-450 font-mono flex items-center gap-1"><MessageSquare className="w-3 h-3 text-emerald-500" /> {parentContacts.mother_whatsapp || 'None'}</p>
                    </div>
                    <div className="p-3 bg-slate-900/60 border border-slate-850/50 rounded-lg space-y-1.5">
                      <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Emergency / Guardian</p>
                      <p className="font-bold text-slate-200">{parentContacts.guardian_name || 'Not Registered'} ({parentContacts.relationship || 'Guardian'})</p>
                      <p className="text-slate-450 font-mono flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" /> {parentContacts.guardian_phone || 'None'}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mt-2">
                        Preferred Alerts: <span className="text-slate-200 font-mono font-bold bg-slate-950 px-1.5 py-0.5 rounded">{parentContacts.preferred_notification || 'SMS'}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">No parent profile exists. Please contact system admin to register contacts.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {/* Daily status calendar */}
              <div>
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-3">Attendance History Calendar</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {attendance.slice(0, 28).map((log: any, idx: number) => {
                    const dateObj = new Date(log.date);
                    return (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border text-center space-y-1.5 transition hover:scale-[1.02] ${
                          log.status === 'Present' ? 'bg-emerald-950/20 border-emerald-900/40 hover:border-emerald-800/80' :
                          log.status === 'Late' || log.status === 'Very Late' ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-800/80' :
                          'bg-rose-950/20 border-rose-900/40 hover:border-rose-800/80'
                        }`}
                      >
                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-wider font-mono">
                          {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                        </p>
                        <p className="text-xs font-black text-slate-200 font-mono">
                          {dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <div className="inline-block px-2 py-0.5 text-[8px] font-black uppercase rounded tracking-wider font-mono">
                          <span className={
                            log.status === 'Present' ? 'text-emerald-400' :
                            log.status === 'Late' || log.status === 'Very Late' ? 'text-amber-400' :
                            'text-rose-400'
                          }>
                            {log.status}
                          </span>
                        </div>
                        <p className="text-[8.5px] text-slate-500 font-mono leading-none">In: {log.time_in ? log.time_in.substring(0, 5) : '--:--'}</p>
                        <p className="text-[8.5px] text-slate-500 font-mono leading-none">Out: {log.time_out ? log.time_out.substring(0, 5) : '--:--'}</p>
                      </div>
                    );
                  })}
                  {attendance.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 text-xs">No daily calendar entries recorded yet.</div>
                  )}
                </div>
              </div>

              {/* Detailed logs table */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850 pb-2.5 mb-4">Gate Scan Activity Logs</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs leading-normal">
                    <thead>
                      <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Direction</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Gate</th>
                        <th className="py-2.5 px-3">Device</th>
                        <th className="py-2.5 px-3">Operator</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Departure Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {attendance.map((log: any, idx: number) => (
                        <React.Fragment key={idx}>
                          {/* Clock In row */}
                          {log.time_in && (
                            <tr className="hover:bg-slate-900/60 font-mono">
                              <td className="py-3 px-3 text-slate-200">{new Date(log.date).toLocaleDateString()}</td>
                              <td className="py-3 px-3"><span className="text-emerald-400 font-bold">▲ CLOCK IN</span></td>
                              <td className="py-3 px-3 text-slate-350">{log.time_in}</td>
                              <td className="py-3 px-3 text-slate-450">{log.gate_in_name || 'Main Gate'}</td>
                              <td className="py-3 px-3 text-slate-500">{log.device_in || 'QR Reader'}</td>
                              <td className="py-3 px-3 text-slate-450">{log.operator_in || 'Officer'}</td>
                              <td className="py-3 px-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                  log.status === 'Present' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' :
                                  'bg-amber-950 text-amber-400 border border-amber-900/40'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-500">--</td>
                            </tr>
                          )}
                          {/* Clock Out row */}
                          {log.time_out && (
                            <tr className="hover:bg-slate-900/60 font-mono border-t border-slate-900/20">
                              <td className="py-3 px-3 text-slate-200">{new Date(log.date).toLocaleDateString()}</td>
                              <td className="py-3 px-3"><span className="text-rose-400 font-bold">▼ CLOCK OUT</span></td>
                              <td className="py-3 px-3 text-slate-350">{log.time_out}</td>
                              <td className="py-3 px-3 text-slate-450">{log.gate_out_name || 'Main Gate'}</td>
                              <td className="py-3 px-3 text-slate-500">{log.device_out || 'QR Reader'}</td>
                              <td className="py-3 px-3 text-slate-450">{log.operator_out || 'Officer'}</td>
                              <td className="py-3 px-3"><span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 text-slate-350">Left</span></td>
                              <td className="py-3 px-3 text-amber-300 font-bold uppercase tracking-tight text-[9px]">{log.departure_status || 'Normal'}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {attendance.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">No gate logs recorded.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notifications records */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850 pb-2.5 mb-4">
                  WhatsApp &amp; SMS Broadcast Alerts
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs leading-normal">
                    <thead>
                      <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                        <th className="py-2.5 px-3">Sent Date</th>
                        <th className="py-2.5 px-3">Recipient</th>
                        <th className="py-2.5 px-3">Channel</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Message Snippet</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {notifications.map((notif: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/60 font-mono">
                          <td className="py-2.5 px-3 text-slate-200">{new Date(notif.sent_at).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-slate-350">{notif.recipient_type}</td>
                          <td className="py-2.5 px-3 text-slate-400">
                            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase ${
                              notif.channel === 'WhatsApp' ? 'bg-emerald-950 text-emerald-400' : 'bg-blue-950 text-blue-400'
                            }`}>
                              {notif.channel}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{notif.recipient_phone}</td>
                          <td className="py-2.5 px-3 text-slate-450 max-w-[250px] truncate" title={notif.message}>{notif.message}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                              notif.status === 'Delivered' || notif.status === 'Sent' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                              'bg-rose-950 text-rose-400 border border-rose-900/30'
                            }`}>
                              {notif.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {notifications.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">No alert notifications logged.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="space-y-6">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5">
                <Award className="w-4.5 h-4.5" /> Child Term Academic Performance Sheet
              </h3>
              
              {/* O-Level Competency marks */}
              {olevelMarks.length > 0 && (
                <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-450 tracking-wider mb-3">Lower Secondary Competency Scores (CBA)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs leading-normal">
                      <thead>
                        <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                          <th className="py-2.5 px-3">Subject</th>
                          <th className="py-2.5 px-3 text-center">Proj 1</th>
                          <th className="py-2.5 px-3 text-center">Proj 2</th>
                          <th className="py-2.5 px-3 text-center">Proj 3</th>
                          <th className="py-2.5 px-3 text-center">Exam Score</th>
                          <th className="py-2.5 px-3">Term</th>
                          <th className="py-2.5 px-3">Year</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50">
                        {olevelMarks.map((m: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-900/60 font-mono">
                            <td className="py-3 px-3 text-slate-200 font-bold">{m.subject}</td>
                            <td className="py-3 px-3 text-center text-slate-350">{m.integration1 || '--'}</td>
                            <td className="py-3 px-3 text-center text-slate-350">{m.integration2 || '--'}</td>
                            <td className="py-3 px-3 text-center text-slate-350">{m.integration3 || '--'}</td>
                            <td className="py-3 px-3 text-center text-indigo-400 font-bold">{m.exam_score ? `${m.exam_score}%` : '--'}</td>
                            <td className="py-3 px-3 text-slate-400">Term {m.term}</td>
                            <td className="py-3 px-3 text-slate-400">{m.year}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* UACE sheet */}
              {uaceMarks.length > 0 && (
                <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                  <h4 className="text-[10px] font-black uppercase text-slate-450 tracking-wider mb-3">Advanced Secondary Combination Scores</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs leading-normal">
                      <thead>
                        <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                          <th className="py-2.5 px-3">Subject</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3 text-center">Paper</th>
                          <th className="py-2.5 px-3 text-center">BOT</th>
                          <th className="py-2.5 px-3 text-center">MOT</th>
                          <th className="py-2.5 px-3 text-center">EOT</th>
                          <th className="py-2.5 px-3 text-center">Grade</th>
                          <th className="py-2.5 px-3 text-center">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50">
                        {uaceMarks.map((m: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-900/60 font-mono">
                            <td className="py-3 px-3 text-slate-200 font-bold">{m.subject}</td>
                            <td className="py-3 px-3 text-slate-450 text-[10px] uppercase font-bold">{m.subject_type}</td>
                            <td className="py-3 px-3 text-center text-slate-350">Paper {m.paper}</td>
                            <td className="py-3 px-3 text-center text-slate-400">{m.bot || '--'}</td>
                            <td className="py-3 px-3 text-center text-slate-400">{m.mot || '--'}</td>
                            <td className="py-3 px-3 text-center text-indigo-400 font-bold">{m.eot || '--'}</td>
                            <td className="py-3 px-3 text-center text-emerald-400 font-bold">{m.grade || '--'}</td>
                            <td className="py-3 px-3 text-center text-indigo-300 font-bold">{m.points || '0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {olevelMarks.length === 0 && uaceMarks.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">No academic report cards have been compiled for this term yet.</p>
              )}
            </div>
          )}

          {activeTab === 'fees' && (
            <div className="space-y-6">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4.5 h-4.5" /> Child Financial Statement Ledger
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 space-y-1">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Total Term Bill</p>
                  <p className="text-xl font-black text-slate-100 font-mono">UGX {(activeFee.amount_due).toLocaleString()}</p>
                  <p className="text-[9px] text-slate-550 font-bold">Inclusive of tuition and primary school activities</p>
                </div>
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 space-y-1">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Amount Paid (St. Paul Bank Slips)</p>
                  <p className="text-xl font-black text-emerald-400 font-mono">UGX {(activeFee.amount_paid).toLocaleString()}</p>
                  <p className="text-[9px] text-emerald-500/80 font-bold font-mono">Receipts synchronized successfully</p>
                </div>
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 space-y-1">
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Remaining Balance due</p>
                  <p className={`text-xl font-black font-mono ${activeFee.balance > 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                    UGX {(activeFee.balance).toLocaleString()}
                  </p>
                  <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider font-mono mt-1 ${
                    activeFee.payment_status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' :
                    'bg-rose-950 text-rose-400 border border-rose-900/40'
                  }`}>
                    Payment: {activeFee.payment_status}
                  </span>
                </div>
              </div>

              {/* Fees list history */}
              <div className="bg-slate-950/40 border border-slate-850/80 rounded-xl p-4">
                <h4 className="text-[10px] font-black uppercase text-slate-450 tracking-wider mb-3">Fees Invoicing & Receipts History</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs leading-normal">
                    <thead>
                      <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                        <th className="py-2.5 px-3">Term / Year</th>
                        <th className="py-2.5 px-3">Amount Due</th>
                        <th className="py-2.5 px-3">Amount Paid</th>
                        <th className="py-2.5 px-3">Balance</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {fees.map((f: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/60 font-mono">
                          <td className="py-3 px-3 text-slate-200 font-bold">Term {f.term} ({f.year})</td>
                          <td className="py-3 px-3 text-slate-300">UGX {f.amount_due.toLocaleString()}</td>
                          <td className="py-3 px-3 text-emerald-400">UGX {f.amount_paid.toLocaleString()}</td>
                          <td className="py-3 px-3 text-rose-400 font-bold">UGX {f.balance.toLocaleString()}</td>
                          <td className="py-3 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              f.payment_status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' :
                              f.payment_status === 'Overdue' ? 'bg-rose-950 text-rose-400 border border-rose-900/40' :
                              'bg-amber-950 text-amber-400 border border-amber-900/40'
                            }`}>
                              {f.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {fees.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">No invoicing records exist.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5">
                <Megaphone className="w-4.5 h-4.5" /> School Announcements & Official Bulletins
              </h3>
              
              <div className="space-y-4">
                {announcements.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No bulletins have been posted.</p>
                ) : (
                  announcements.map((ann: any, idx: number) => (
                    <div key={idx} className="bg-slate-950/60 border border-slate-850 p-5 rounded-2xl space-y-2">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-850/50 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="p-1 bg-indigo-950 border border-indigo-900/30 rounded">
                            <Megaphone className="w-4 h-4 text-indigo-400" />
                          </span>
                          <h4 className="text-sm font-black text-slate-100 uppercase tracking-tight">{ann.title}</h4>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 font-bold uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                          Posted: {new Date(ann.createdAt).toLocaleString()} &bull; By: {ann.author || 'Admin'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pt-1.5 whitespace-pre-wrap">{ann.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-850/80 px-4 md:px-6 py-4 text-center text-[10px] text-slate-550 font-bold uppercase tracking-wider shrink-0 mt-auto">
        &copy; 2026 St Paul Senior Secondary School &bull; Gate Clearance &amp; Attendance Management Module
      </footer>
    </div>
  );
}
