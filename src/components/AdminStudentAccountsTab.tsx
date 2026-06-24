import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, KeyRound, CheckCircle, XCircle, FileSpreadsheet, Printer, AlertCircle, ShieldAlert } from 'lucide-react';
import { 
  fetchAdminStudentAccounts, 
  resetStudentPassword, 
  resetBulkStudentPasswords, 
  updateBulkStudentStatus, 
  createStudentAccountManual, 
  createBulkStudentAccountsManual 
} from '../utils/api.ts';

interface AdminStudentAccountsTabProps {
  approvedBy: string;
}

export default function AdminStudentAccountsTab({ approvedBy }: AdminStudentAccountsTabProps) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [gradeClass, setGradeClass] = useState('All');
  const [stream, setStream] = useState('All');
  const [status, setStatus] = useState('All');
  const [needsPasswordChange, setNeedsPasswordChange] = useState('All');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Recovery tool
  const [recoverySearch, setRecoverySearch] = useState('');
  const [showRecoveryTools, setShowRecoveryTools] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminStudentAccounts({
        search: search.trim() || undefined,
        gradeClass: gradeClass !== 'All' ? gradeClass : undefined,
        stream: stream !== 'All' ? stream : undefined,
        status: status !== 'All' ? status : undefined,
        needsPasswordChange: needsPasswordChange !== 'All' ? needsPasswordChange : undefined
      });
      setAccounts(res.data || []);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Failed to load student accounts:', err);
      alert(err.message || 'Error loading accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [gradeClass, stream, status, needsPasswordChange]);

  const handleResetPassword = async (studentId: string, name: string, adminNo: string) => {
    if (!window.confirm(`Are you sure you want to reset the password for ${name} (${adminNo}) to "123"?`)) {
      return;
    }
    try {
      const res = await resetStudentPassword({ studentId, approvedBy });
      if (res.success) {
        alert(`Password for ${name} has been reset to "123". They must change it on their next login.`);
        loadAccounts();
      }
    } catch (err: any) {
      alert(err.message || 'Reset failed.');
    }
  };

  const handleCreateManual = async (studentId: string, name: string) => {
    try {
      const res = await createStudentAccountManual({ studentId, approvedBy });
      if (res.success) {
        alert(`Login account created successfully for ${name}.`);
        loadAccounts();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create account.');
    }
  };

  // Bulk Operations
  const handleBulkReset = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to reset passwords to "123" for the ${selectedIds.length} selected student(s)?`)) {
      return;
    }
    try {
      const res = await resetBulkStudentPasswords({ studentIds: selectedIds, approvedBy });
      if (res.success) {
        alert(`Passwords reset successfully for ${selectedIds.length} student(s).`);
        loadAccounts();
      }
    } catch (err: any) {
      alert(err.message || 'Bulk reset failed.');
    }
  };

  const handleBulkStatus = async (newStatus: 'Active' | 'Inactive') => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to set status to "${newStatus}" for the ${selectedIds.length} selected account(s)?`)) {
      return;
    }
    try {
      const res = await updateBulkStudentStatus({ studentIds: selectedIds, status: newStatus, approvedBy });
      if (res.success) {
        alert(`Status updated to "${newStatus}" successfully for ${selectedIds.length} student(s).`);
        loadAccounts();
      }
    } catch (err: any) {
      alert(err.message || 'Bulk status update failed.');
    }
  };

  const handleBulkCreate = async () => {
    const toCreate = accounts
      .filter(a => selectedIds.includes(a.id || a.studentId) && a.status === 'Not Created')
      .map(a => a.id || a.studentId)
      .filter(Boolean);

    if (toCreate.length === 0) {
      alert('None of the selected students require account creation (already created).');
      return;
    }

    if (!window.confirm(`Are you sure you want to bulk generate login accounts for the ${toCreate.length} selected student(s)?`)) {
      return;
    }

    try {
      const res = await createBulkStudentAccountsManual({ studentIds: toCreate, approvedBy });
      if (res.success) {
        alert(`Login accounts created successfully for ${toCreate.length} student(s).`);
        loadAccounts();
      }
    } catch (err: any) {
      alert(err.message || 'Bulk creation failed.');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const targetAccounts = selectedIds.length > 0 
      ? accounts.filter(a => selectedIds.includes(a.id || a.studentId))
      : accounts;

    if (targetAccounts.length === 0) {
      alert('No student accounts available to export.');
      return;
    }

    const headers = ['Student Name', 'Student Number', 'Class/Stream', 'Parent Name', 'Parent Contact', 'Account Status', 'Last Login', 'Needs Password Change'];
    const rows = targetAccounts.map(a => [
      a.name,
      a.adminNo,
      a.gradeClass,
      a.parentName || 'N/A',
      a.parentContact || 'N/A',
      a.status,
      a.lastLogin ? new Date(a.lastLogin).toLocaleString() : 'Never',
      a.needsPasswordChange ? 'Yes' : 'No'
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `student_accounts_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Slips
  const handlePrintSlips = (singleAcc?: any) => {
    const targets = singleAcc 
      ? [singleAcc] 
      : accounts.filter(a => selectedIds.includes(a.id || a.studentId) && a.status !== 'Not Created');

    if (targets.length === 0) {
      alert('Please select at least one active student account to print login slips.');
      return;
    }

    const printDiv = document.createElement('div');
    printDiv.id = 'print-section';
    printDiv.style.position = 'absolute';
    printDiv.style.left = '0';
    printDiv.style.top = '0';
    printDiv.style.width = '100%';
    printDiv.style.background = 'white';
    printDiv.style.color = 'black';
    printDiv.style.padding = '20px';
    printDiv.style.fontFamily = 'sans-serif';

    printDiv.innerHTML = targets.map(a => `
      <div style="border: 2px dashed #333; padding: 20px; margin-bottom: 25px; page-break-inside: avoid; border-radius: 8px; max-width: 500px; margin-left: auto; margin-right: auto; background: white; color: black;">
        <div style="text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 800; text-transform: uppercase;">St. Paul Secondary School</h2>
          <span style="font-size: 10px; font-weight: bold; color: #666; letter-spacing: 1px;">STUDENT LOGIN CREDENTIALS SLIP</span>
        </div>
        <div style="font-size: 12px; line-height: 1.6; color: black;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <strong>Student Name:</strong>
            <span>${a.name}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <strong>Class & Stream:</strong>
            <span>${a.gradeClass}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; border-top: 1px dashed #eee; padding-top: 5px; margin-top: 5px;">
            <strong>Username (Student Number):</strong>
            <span style="font-family: monospace; font-weight: bold; font-size: 13px;">${a.adminNo}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <strong>Temporary Password:</strong>
            <span style="font-family: monospace; font-weight: bold; font-size: 13px;">123</span>
          </div>
        </div>
        <div style="margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 9px; text-align: center; color: #555; line-height: 1.4;">
          <strong>SECURITY NOTICE:</strong> For your account safety, you are required to change your default password ("123") upon your first login. Please keep your login credentials private.
        </div>
      </div>
    `).join('');

    document.body.appendChild(printDiv);
    window.print();
    document.body.removeChild(printDiv);
  };

  const handleSelectToggle = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(accounts.map(a => a.id || a.studentId).filter(Boolean));
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">
      <div className="flex justify-between items-start flex-wrap gap-2.5">
        <div>
          <h3 className="text-sm font-black uppercase text-slate-200">Student Account & Login Directory</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Manage student access profiles, trigger password resets, manual account creations, and recover lost details.
          </p>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-inner space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by Name, Adm No, Parent Name or Contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadAccounts()}
              className="w-full bg-slate-900 border border-slate-880 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <select
              value={gradeClass}
              onChange={(e) => setGradeClass(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-550"
            >
              <option value="All">All Classes</option>
              <option value="S.1">S.1</option>
              <option value="S.2">S.2</option>
              <option value="S.3">S.3</option>
              <option value="S.4">S.4</option>
              <option value="S.5">S.5</option>
              <option value="S.6">S.6</option>
            </select>
          </div>

          <div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-880 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-550"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active Accounts</option>
              <option value="Inactive">Inactive Accounts</option>
              <option value="Not Created">Not Created Accounts</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={loadAccounts}
              disabled={loading}
              className="flex-1 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Query
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center justify-between border-t border-slate-900 pt-3 text-[11px] font-medium text-slate-400">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] uppercase font-bold text-slate-500">Needs Pass Change:</span>
              <select
                value={needsPasswordChange}
                onChange={(e) => setNeedsPasswordChange(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300"
              >
                <option value="All">All</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>
          </div>

          <button
            onClick={() => setShowRecoveryTools(!showRecoveryTools)}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-455" />
            {showRecoveryTools ? 'Hide Recovery Tools' : 'Open Account Recovery Assistance'}
          </button>
        </div>
      </div>

      {/* Account Recovery Tool widget */}
      {showRecoveryTools && (
        <div className="bg-slate-950 border border-amber-900/30 p-5 rounded-2xl shadow space-y-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-amber-500 uppercase tracking-wider">Lost Credentials & Recovery Assistant</h4>
              <p className="text-[10.5px] text-slate-400 leading-normal mt-0.5">
                Quickly locate student usernames (Student Numbers) and parent contacts for assistance calls. Print login slip directly or reset the password.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Fuzzy recovery: search Student Name, Parent Name, Parent Contact, or stream..."
                value={recoverySearch}
                onChange={(e) => setRecoverySearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-550 focus:outline-none focus:border-amber-600"
              />
            </div>
          </div>

          {recoverySearch.trim() && (
            <div className="overflow-x-auto bg-slate-900/40 border border-slate-850 rounded-xl max-h-[220px] overflow-y-auto">
              <table className="w-full min-w-[800px] text-[11px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-500 uppercase font-black tracking-wider border-b border-slate-850">
                    <th className="p-2.5">Student Name</th>
                    <th className="p-2.5">Username (Student No)</th>
                    <th className="p-2.5">Class/Stream</th>
                    <th className="p-2.5">Parent Contact Details</th>
                    <th className="p-2.5 text-center">Recovery Action</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts
                    .filter(a => 
                      a.name.toLowerCase().includes(recoverySearch.toLowerCase()) ||
                      a.adminNo.toLowerCase().includes(recoverySearch.toLowerCase()) ||
                      a.parentName.toLowerCase().includes(recoverySearch.toLowerCase()) ||
                      a.parentContact.toLowerCase().includes(recoverySearch.toLowerCase())
                    )
                    .map((a, idx) => (
                      <tr key={idx} className="border-b border-slate-850/50 text-slate-350 font-medium">
                        <td className="p-2.5 font-bold text-slate-200">{a.name}</td>
                        <td className="p-2.5 font-mono text-amber-400 font-bold">{a.adminNo}</td>
                        <td className="p-2.5 uppercase text-slate-450">{a.gradeClass}</td>
                        <td className="p-2.5">
                          <span className="block font-bold text-slate-300">{a.parentName}</span>
                          <span className="text-[10px] text-slate-500">{a.parentContact}</span>
                        </td>
                        <td className="p-2.5 text-center flex items-center justify-center gap-2">
                          <button
                            onClick={() => handlePrintSlips(a)}
                            disabled={a.status === 'Not Created'}
                            className="p-1 text-slate-400 hover:text-indigo-400 disabled:opacity-30 rounded hover:bg-slate-800 cursor-pointer"
                            title="Print Recovery Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(a.id || a.studentId, a.name, a.adminNo)}
                            disabled={a.status === 'Not Created'}
                            className="px-2 py-0.5 bg-amber-600/10 border border-amber-650/20 text-amber-500 rounded text-[9.5px] uppercase font-bold hover:bg-amber-600/20 cursor-pointer"
                          >
                            Reset Password (123)
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bulk Operations Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-indigo-950/20 border border-indigo-900/50 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between animate-slide-down">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
            <span className="text-xs font-black uppercase text-indigo-300 font-mono tracking-wider">
              {selectedIds.length} Account(s) Selected
            </span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={handleBulkReset}
              className="px-3.5 py-1.5 bg-amber-600/15 border border-amber-650/20 hover:bg-amber-600/25 text-amber-400 font-bold uppercase rounded-lg transition-all cursor-pointer"
            >
              Reset Passwords (123)
            </button>
            <button
              onClick={() => handleBulkStatus('Active')}
              className="px-3.5 py-1.5 bg-emerald-600/15 border border-emerald-650/20 hover:bg-emerald-600/25 text-emerald-400 font-bold uppercase rounded-lg transition-all cursor-pointer"
            >
              Activate
            </button>
            <button
              onClick={() => handleBulkStatus('Inactive')}
              className="px-3.5 py-1.5 bg-rose-600/15 border border-rose-650/20 hover:bg-rose-600/25 text-rose-400 font-bold uppercase rounded-lg transition-all cursor-pointer"
            >
              Deactivate
            </button>
            <button
              onClick={handleBulkCreate}
              className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 font-bold uppercase rounded-lg transition-all cursor-pointer"
            >
              Generate Logins
            </button>
            <button
              onClick={() => handlePrintSlips()}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-880 font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slips
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-880 font-bold uppercase rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* Main Accounts Table */}
      {loading ? (
        <div className="text-center py-20 bg-slate-950 border border-slate-850 rounded-2xl">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-2" />
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Querying accounts roster...</span>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 text-xs text-slate-500 border border-dashed border-slate-850 rounded-2xl bg-slate-950">
          No student records found matching the active selection query.
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider px-1">
            <span>Displaying {accounts.length} Student Login Record(s)</span>
            <button
              onClick={handleExportCSV}
              className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export All Filtered to CSV
            </button>
          </div>

          <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-2xl shadow-md">
            <table className="w-full min-w-[1000px] text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                  <th className="p-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={accounts.length > 0 && selectedIds.length === accounts.filter(a => a.id || a.studentId).length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-650 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="p-3.5">Student Details</th>
                  <th className="p-3.5">Student Number (Username)</th>
                  <th className="p-3.5">Class &amp; Stream</th>
                  <th className="p-3.5">Parent Contact Info</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Last Login</th>
                  <th className="p-3.5 text-center">Needs Change</th>
                  <th className="p-3.5 text-center">Account Control</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const id = a.id || a.studentId;
                  const isSelected = selectedIds.includes(id);
                  return (
                    <tr 
                      key={id} 
                      className={`border-b border-slate-850/50 hover:bg-slate-900/10 font-medium transition-colors ${
                        isSelected ? 'bg-indigo-950/5' : ''
                      }`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectToggle(id)}
                          className="rounded border-slate-700 bg-slate-900 text-indigo-650 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="p-3.5">
                        <span className="block font-black text-slate-200">{a.name}</span>
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono bg-slate-900 px-2 py-0.5 border border-slate-850 rounded text-indigo-400 font-bold text-[11px]">
                          {a.adminNo}
                        </span>
                      </td>
                      <td className="p-3.5 uppercase text-slate-350 font-bold">
                        {a.gradeClass}
                      </td>
                      <td className="p-3.5">
                        <div className="text-[11px]">
                          <span className="block text-slate-300 font-bold">{a.parentName}</span>
                          <span className="block text-slate-500 font-mono text-[10px]">{a.parentContact}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase font-black tracking-wider ${
                          a.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          a.status === 'Inactive' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-slate-800 text-slate-450 border border-slate-700'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-450 text-[10px] font-mono">
                        {a.lastLogin ? new Date(a.lastLogin).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </td>
                      <td className="p-3.5 text-center">
                        {a.needsPasswordChange !== null ? (
                          a.needsPasswordChange ? (
                            <CheckCircle className="w-4 h-4 text-amber-500 mx-auto animate-pulse" title="Forced password change active" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-700 mx-auto" />
                          )
                        ) : '-'}
                      </td>
                      <td className="p-3.5 text-center">
                        {a.status === 'Not Created' ? (
                          <button
                            onClick={() => handleCreateManual(id, a.name)}
                            className="px-2.5 py-1 bg-indigo-650 hover:bg-indigo-600 text-white rounded font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                          >
                            Create Account
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handlePrintSlips(a)}
                              className="p-1 text-slate-400 hover:text-indigo-400 rounded hover:bg-slate-900 cursor-pointer"
                              title="Print Login Slip"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(id, a.name, a.adminNo)}
                              className="px-2 py-1 bg-amber-600/10 border border-amber-600/20 text-amber-500 hover:bg-amber-600/20 rounded font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
