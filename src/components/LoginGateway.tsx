import React, { useState } from 'react';
import { Shield, BookOpen, GraduationCap, RefreshCw, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react';
import SchoolLogo from './SchoolLogo.tsx';
import { loginUser } from '../utils/api.ts';

interface LoginGatewayProps {
  onLogin: (session: { role: 'admin' | 'teacher' | 'student'; user: any }) => void;
  schoolLogo: string | null;
  dbConnectionError: boolean;
}

export default function LoginGateway({ onLogin, schoolLogo, dbConnectionError }: LoginGatewayProps) {
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Online login
      const response = await loginUser({ username, password, role });
      if (response.success) {
        if (response.token) {
          localStorage.setItem('spss_token', response.token);
        }
        setLoginSuccess(true);
        setError(null);
        setTimeout(() => {
          onLogin({
            role: response.role,
            user: response.user
          });
        }, 1200);
      } else {
        setError(response.error || 'Login failed.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Server did not respond. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black flex items-center justify-center p-4 font-sans select-none antialiased">
      {/* Background glowing rings */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/40 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-8 relative overflow-hidden">
        {/* Glow effect at the top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 opacity-60" />

        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative p-2 bg-slate-950/80 rounded-2xl border border-slate-850 shadow-inner">
            <SchoolLogo className="w-20 h-20" logoBase64={schoolLogo} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-100 uppercase tracking-tight">ST. PAUL NASUTI</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-0.5">School Management System</p>
          </div>
        </div>

        {/* Roles Selector tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/65 rounded-xl border border-slate-850">
          <button
            type="button"
            onClick={() => { setRole('admin'); setError(null); }}
            className={`py-2 px-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex flex-col items-center gap-1 transition-all cursor-pointer ${
              role === 'admin' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Admin
          </button>
          <button
            type="button"
            onClick={() => { setRole('teacher'); setError(null); }}
            className={`py-2 px-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex flex-col items-center gap-1 transition-all cursor-pointer ${
              role === 'teacher' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Teacher
          </button>
          <button
            type="button"
            onClick={() => { setRole('student'); setError(null); }}
            className={`py-2 px-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex flex-col items-center gap-1 transition-all cursor-pointer ${
              role === 'student' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Student
          </button>
        </div>



        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {role === 'student' ? 'Student Number' : 'Username'}
            </label>
            <input
              type="text"
              placeholder={role === 'student' ? 'e.g. STU-2026-001 or student' : 'e.g. admin or teacher'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 pr-10 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-350 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/25 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loginSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 p-3 rounded-xl flex items-center gap-2 text-xs text-emerald-400 animate-pulse">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Login Successful! Redirecting...</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg border border-indigo-500 shadow-indigo-950/40 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Loggin In...
              </>
            ) : (
              'Access Portal'
            )}
          </button>
        </form>

        <div className="text-center">
          <span className="text-[9px] text-slate-600 font-mono">ST. PAUL SMS • Version 2.0 • EMIS Uganda Standard</span>
        </div>
      </div>
    </div>
  );
}
