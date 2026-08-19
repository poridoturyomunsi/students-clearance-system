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
        className={`fixed left-0 top-16 bottom-0 z-40 bg-[#121C29] border-r border-[#26374B] transition-all duration-300 flex flex-col ${
          collapsed ? 'md:w-20' : 'md:w-64'
        } ${
          mobileOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className={`p-4 border-b border-[#26374B] flex items-center gap-3 ${collapsed ? 'md:justify-center' : ''}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A227] via-[#E6C866] to-[#C9A227] flex items-center justify-center font-serif font-bold text-[#0D1520] text-base shrink-0 shadow-[0_0_0_3px_rgba(201,162,39,0.2)]">
            SP
          </div>
          <div className={`flex flex-col min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
            <span className="font-serif font-semibold text-[#EDEFF2] text-sm leading-tight truncate">St. Paul Secondary</span>
            <span className="text-[10px] text-[#6C7A90] uppercase tracking-wider font-mono">Nasuti · Iganga</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.key;

            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer min-h-[40px] ${
                  isActive
                    ? 'bg-gradient-to-r from-[rgba(201,162,39,0.16)] to-[rgba(201,162,39,0.03)] text-[#EDEFF2] border-l-2 border-[#C9A227] font-semibold'
                    : 'text-[#9BAAC0] hover:text-[#EDEFF2] hover:bg-[#152030] border-l-2 border-transparent'
                } ${collapsed ? 'md:justify-center md:px-0' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-[#C9A227]' : 'bg-[#6C7A90]'}`} />
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#E6C866]' : 'text-[#9BAAC0]'}`} />
                
                <div className={`flex-1 flex items-center justify-between min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                      isActive 
                        ? 'bg-[#1B2839] text-[#E6C866] border border-[#C9A227]/30' 
                        : 'bg-[#1B2839] text-[#9BAAC0]'
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
