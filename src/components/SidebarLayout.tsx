import React, { useState, useEffect } from 'react';
import { Menu, X, LogOut, User } from 'lucide-react';

interface SidebarLayoutProps {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
  currentModule?: string | null;
  onModuleChange?: (module: string | null) => void;
}

export default function SidebarLayout({ children, title, currentModule, onModuleChange }: SidebarLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem('spss_session');
      if (s) setSession(JSON.parse(s));
    } catch (e) {
      setSession(null);
    }
  }, []);

  const handleLogout = () => {
    // clear all known session keys and redirect to login
    localStorage.removeItem('spss_session');
    localStorage.removeItem('spss_token');
    localStorage.removeItem('clearance_printer_school_logo');
    // additional cleanup if other keys exist
    try { sessionStorage.clear(); } catch (e) {}
    window.location.href = '/';
  };

  const modules = [
    { key: 'clearance', label: 'Clearance Cards Workspace' }
  ];

  return (
    <div className="min-h-screen flex bg-slate-900 text-slate-100">
      {/* Mobile header */}
      <div className="w-full sm:hidden bg-slate-950 border-b border-slate-850 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button aria-label="Open menu" className="p-2 rounded-md touch-target" onClick={() => setMobileOpen(true)}>
            <Menu className="w-6 h-6 text-indigo-400" />
          </button>
          <div className="font-black text-sm">{title ? title : 'School Dashboard'}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-300 mr-2 hidden sm:block">{session?.user?.name || ''}</div>
          <button className="p-2 rounded-md touch-target" onClick={() => setShowLogoutConfirm(true)} aria-label="Profile">
            <User className="w-5 h-5 text-slate-300" />
          </button>
        </div>
      </div>

      <aside className="w-64 hidden sm:flex bg-slate-950 border-r border-slate-850 p-4 flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900/45 p-2 rounded-md">
            <Menu className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="font-black">{title ? title : 'School Dashboard'}</div>
            <div className="text-[11px] text-slate-500">Admin Portal</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 text-sm">
          {modules.map(mod => (
            <button
              key={mod.key || 'dashboard'}
              onClick={() => onModuleChange?.(mod.key)}
              className={`w-full text-left px-3 py-2 rounded-md transition ${
                currentModule === mod.key
                  ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-semibold'
                  : 'hover:bg-slate-900/40 text-slate-300'
              }`}
            >
              {mod.label}
            </button>
          ))}
        </nav>

        <div className="text-[12px] text-slate-500">© School</div>
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black">Menu</div>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded-md touch-target"><X className="w-5 h-5 text-slate-300" /></button>
            </div>
            <nav className="space-y-1 text-sm">
              {modules.map(mod => (
                <button
                  key={mod.key || 'dashboard-mobile'}
                  onClick={() => { onModuleChange?.(mod.key); setMobileOpen(false); }}
                  className={`w-full text-left px-3 py-2 rounded-md transition ${
                    currentModule === mod.key
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-semibold'
                      : 'hover:bg-slate-900/40 text-slate-300'
                  }`}
                >
                  {mod.label}
                </button>
              ))}
            </nav>
            <div className="mt-6 border-t border-slate-850 pt-4 text-sm text-slate-400">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{session?.user?.name || 'Guest'}</div>
                  <div className="text-xs mt-0.5">{session?.role || 'Role'}</div>
                </div>
                <button className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-600/10 hover:bg-red-600/20 touch-target" onClick={() => setShowLogoutConfirm(true)}>
                  <LogOut className="w-4 h-4 text-red-400" /> Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6"> 
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 min-h-[70vh]">
          {title && <h3 className="text-lg font-black mb-3">{title}</h3>}
          {children}
        </div>
      </main>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLogoutConfirm(false)} />
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 z-50 w-[92%] max-w-md">
            <div className="flex items-start gap-3">
              <LogOut className="w-6 h-6 text-red-400" />
              <div>
                <div className="font-bold">Are you sure you want to logout?</div>
                <div className="text-sm text-slate-400 mt-1">You will be returned to the login screen.</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button className="px-4 py-2 rounded-md bg-transparent border border-slate-700 text-slate-200 touch-target" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
              <button className="px-4 py-2 rounded-md bg-red-600 text-white touch-target" onClick={handleLogout}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
