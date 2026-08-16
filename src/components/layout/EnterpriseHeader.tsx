import React, { useState } from 'react';
import { 
  Menu, 
  Search, 
  Bell, 
  User, 
  Sparkles, 
  LogOut, 
  ChevronDown,
  Building2,
  Calendar,
  Zap
} from 'lucide-react';
import SchoolLogo from '../SchoolLogo.tsx';
import QuickActionsMenu from './QuickActionsMenu.tsx';

interface EnterpriseHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  schoolLogo: string | null;
  authSession: any;
  handleLogout: () => void;
  // Quick actions handlers
  onAddStudent: () => void;
  onImportExcel: () => void;
  onExportData: () => void;
  onGenerateCards: () => void;
  onMatchPhotos: () => void;
  onRemoveDuplicates: () => void;
  onGenerateReports: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function EnterpriseHeader({
  sidebarCollapsed,
  onToggleSidebar,
  schoolLogo,
  authSession,
  handleLogout,
  onAddStudent,
  onImportExcel,
  onExportData,
  onGenerateCards,
  onMatchPhotos,
  onRemoveDuplicates,
  onGenerateReports,
  searchQuery,
  onSearchChange
}: EnterpriseHeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);

  const userName = authSession?.user?.name || 'System Administrator';
  const userRole = authSession?.role || 'Admin Portal';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 transition-all">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Section: Sidebar Toggle & Branding */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer"
            title={sidebarCollapsed ? "Expand Navigation" : "Collapse Navigation"}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <SchoolLogo logoBase64={schoolLogo} className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 p-1" />
            <div className="hidden sm:block min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black text-slate-100 tracking-wide uppercase truncate">
                  ST. PAUL SECONDARY SCHOOL
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE ERP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate flex items-center gap-2">
                <span>NASUTI • P.O.BOX 678, IGANGA</span>
                <span className="text-slate-600">•</span>
                <span className="text-indigo-400 font-mono font-semibold flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Term 3 2026
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Center Section: Global Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search students, admission no, form class..."
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
              ⌘K
            </span>
          </div>
        </div>

        {/* Right Section: Quick Actions, Notifications & Profile */}
        <div className="flex items-center gap-2.5">
          
          {/* Quick Actions Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 border border-indigo-400/30 transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-current text-yellow-300" />
              <span>Quick Actions</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showQuickActions ? 'rotate-180' : ''}`} />
            </button>

            {showQuickActions && (
              <QuickActionsMenu
                onClose={() => setShowQuickActions(false)}
                onAddStudent={onAddStudent}
                onImportExcel={onImportExcel}
                onExportData={onExportData}
                onGenerateCards={onGenerateCards}
                onMatchPhotos={onMatchPhotos}
                onRemoveDuplicates={onRemoveDuplicates}
                onGenerateReports={onGenerateReports}
              />
            )}
          </div>

          {/* Notifications Trigger */}
          <button className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 border border-slate-950"></span>
          </button>

          {/* User Profile Controller */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 p-1 pl-2 pr-2.5 rounded-xl hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xs shadow-md">
                {userName.charAt(0)}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-200 leading-tight">{userName}</div>
                <div className="text-[10px] text-slate-400 leading-tight uppercase font-mono">{userRole}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                  <div className="text-xs font-black text-white">{userName}</div>
                  <div className="text-[11px] text-indigo-400 font-mono">{userRole}</div>
                </div>
                <button
                  onClick={() => { setShowProfileMenu(false); handleLogout(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors font-semibold cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out of ERP</span>
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
