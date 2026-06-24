import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, AlertCircle, RefreshCw, CheckCircle2, LogOut } from 'lucide-react';
import { changeStudentPassword } from '../utils/api.ts';
import SchoolLogo from './SchoolLogo.tsx';

interface StudentForcePasswordChangeProps {
  studentId: string;
  studentName: string;
  adminNo: string;
  schoolLogo: string | null;
  onPasswordChanged: () => void;
  onLogout: () => void;
}

export default function StudentForcePasswordChange({
  studentId,
  studentName,
  adminNo,
  schoolLogo,
  onPasswordChanged,
  onLogout,
}: StudentForcePasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError('Please fill in all password fields.');
      return;
    }
    if (newPassword === '123') {
      setError('You cannot reuse the default password. Please choose a different password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }
    if (newPassword.length < 4) {
      setError('New password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await changeStudentPassword({
        studentId,
        currentPassword,
        newPassword
      });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          onPasswordChanged();
        }, 1500);
      } else {
        setError('Failed to change password.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while changing password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black flex items-center justify-center p-4 font-sans select-none antialiased">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 opacity-80" />

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative p-2 bg-slate-950/80 rounded-2xl border border-slate-850 shadow-inner">
            <SchoolLogo className="w-16 h-16" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100 uppercase tracking-tight">Security Action Required</h1>
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mt-1">Mandatory Password Change</p>
            <div className="mt-2 text-xs text-slate-400">
              Welcome, <span className="text-slate-200 font-semibold">{studentName}</span> ({adminNo})
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              For security, you must change your default password before accessing your student portal.
            </p>
          </div>
        </div>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/25 p-6 rounded-2xl flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
            <div>
              <span className="font-bold text-sm text-emerald-400">Password Changed Successfully!</span>
              <p className="text-xs text-slate-400 mt-1">Redirecting you to the student portal...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl flex items-start gap-2 text-xs text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  placeholder="Enter current password (default: 123)"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">New Password</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onLogout}
                className="w-1/3 py-3 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-250 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-850 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-amber-500 shadow-orange-950/40 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" /> Change Password
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="text-center">
          <span className="text-[9px] text-slate-600 font-mono">ST. PAUL SMS • Mandatory Security Policies</span>
        </div>
      </div>
    </div>
  );
}
