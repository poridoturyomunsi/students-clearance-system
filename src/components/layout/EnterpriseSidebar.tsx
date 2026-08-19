import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  Printer, 
  DollarSign, 
  GraduationCap, 
  BookOpen, 
  FileText, 
  Sparkles, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Camera,
  Bot,
  ShieldCheck
} from 'lucide-react';

interface EnterpriseSidebarProps {
  currentModule: string;
  onModuleChange: (module: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  handleLogout: () => void;
  studentCount?: number;
  clearedCount?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function EnterpriseSidebar({
  currentModule,
  onModuleChange,
  collapsed,
  onToggleCollapse,
  handleLogout,
  studentCount = 0,
  clearedCount = 0,
  mobileOpen = false,
  onCloseMobile
}: EnterpriseSidebarProps) {

  const navItems = [
    { key: 'dashboard', label: 'Home Dashboard', icon: LayoutDashboard, badge: null },
    { key: 'students', label: 'Students Roster', icon: Users, badge: studentCount > 0 ? `${studentCount}` : null },
    { key: 'clearance', label: 'Printing & Cards', icon: Printer, badge: clearedCount > 0 ? `${clearedCount}` : null },
    { key: 'attendance', label: 'Gate & Attendance', icon: Clock, badge: 'LIVE' },
    { key: 'staff', label: 'Staff & Teachers', icon: GraduationCap, badge: null },
    { key: 'fees', label: 'Finance & Fees', icon: DollarSign, badge: null },
    { key: 'exams', label: 'Exams & Reports', icon: FileText, badge: null },
    { key: 'photos', label: 'Photo Storage Audit', icon: Camera, badge: 'RECOVERY' },
    { key: 'ai', label: 'ST. PAUL AI Assistant', icon: Bot, badge: 'AI' },
    { key: 'ai-health', label: 'AI Health & Maintenance', icon: ShieldCheck, badge: 'HEALTH' },
    { key: 'settings', label: 'Admin Settings', icon: Settings, badge: null }
  ];

  const handleNavClick = (key: string) => {
    onModuleChange(key);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      <aside 
        className={`fixed left-0 top-16 bottom-0 z-40 bg-slate-950/95 backdrop-blur-md border-r border-slate-800/80 transition-all duration-300 flex flex-col ${
          /* Desktop behavior */
          collapsed ? 'md:w-20' : 'md:w-64'
        } ${
          /* Mobile behavior */
          mobileOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] font-black uppercase font-mono tracking-wider text-slate-500 flex items-center justify-between">
            <span>{collapsed ? 'ERP' : 'MAIN ERP NAVIGATION'}</span>
            <button 
              onClick={onCloseMobile}
              className="md:hidden p-1 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.key;

            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl font-bold text-xs transition-all duration-150 cursor-pointer min-h-[44px] ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-600/25 border border-indigo-400/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80 border border-transparent'
                } ${collapsed ? 'md:justify-center md:px-0' : ''}`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                
                <div className={`flex-1 flex items-center justify-between min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : item.badge === 'LIVE' || item.badge === 'AI'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer / Toggle & Logout */}
        <div className="p-3 border-t border-slate-800/80 space-y-2">
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex w-full items-center justify-center gap-2 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800/80 text-xs font-semibold transition-all cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse Sidebar</span>
              </>
            )}
          </button>

          <button
            onClick={() => { handleLogout(); if (onCloseMobile) onCloseMobile(); }}
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center gap-3 p-3 md:p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent font-bold text-xs transition-all cursor-pointer min-h-[44px] ${
              collapsed ? 'md:justify-center' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
