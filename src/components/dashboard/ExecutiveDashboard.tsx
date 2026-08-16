import React from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Printer, 
  GraduationCap, 
  DollarSign, 
  ShieldCheck, 
  Sparkles,
  ArrowRight,
  Database,
  Building2,
  TrendingUp,
  FileSpreadsheet,
  Zap,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.tsx';
import ActivityFeed from './ActivityFeed.tsx';
import { Student } from '../../types.ts';

interface ExecutiveDashboardProps {
  students: Student[];
  onNavigateModule: (module: string) => void;
  onAddStudent: () => void;
  onImportExcel: () => void;
  onGenerateCards: () => void;
  dbStats?: any;
}

export default function ExecutiveDashboard({
  students = [],
  onNavigateModule,
  onAddStudent,
  onImportExcel,
  onGenerateCards,
  dbStats
}: ExecutiveDashboardProps) {

  const totalStudents = students.length;
  const clearedStudents = students.filter(s => s.isCleared).length;
  const pendingClearance = totalStudents - clearedStudents;
  const printedCards = students.filter(s => s.printStatus === 'Printed').length;
  const clearanceRate = totalStudents > 0 ? Math.round((clearedStudents / totalStudents) * 100) : 0;
  const printedRate = totalStudents > 0 ? Math.round((printedCards / totalStudents) * 100) : 0;

  // Breakdown by level
  const oLevelCount = students.filter(s => s.gradeClass?.startsWith('S.1') || s.gradeClass?.startsWith('S.2') || s.gradeClass?.startsWith('S.3') || s.gradeClass?.startsWith('S.4')).length;
  const aLevelCount = students.filter(s => s.gradeClass?.startsWith('S.5') || s.gradeClass?.startsWith('S.6')).length;

  return (
    <div className="space-y-6 pb-8">
      
      {/* Executive Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 border border-indigo-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5 fill-current text-yellow-300" />
              <span>ST. PAUL SECONDARY SCHOOL EXECUTIVE ERP</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              School Operations & Management Portal
            </h2>
            <p className="text-sm text-slate-300 font-medium leading-relaxed">
              Real-time student clearance management, smart card generation, attendance tracking, and academic record operations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={onAddStudent}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Register Student</span>
            </button>

            <button
              onClick={onGenerateCards}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-purple-600/30 border border-purple-400/30 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Batch Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* 8 Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <MetricKpiCard
          title="Total Roster Population"
          value={totalStudents}
          subtitle={`O-Level: ${oLevelCount} | A-Level: ${aLevelCount}`}
          icon={Users}
          colorScheme="indigo"
          trend={{ value: 'Active Term 3', isPositive: true }}
          onClick={() => onNavigateModule('students')}
        />

        <MetricKpiCard
          title="Cleared Students"
          value={clearedStudents}
          subtitle={`${clearanceRate}% of total registered roster`}
          icon={ShieldCheck}
          colorScheme="emerald"
          trend={{ value: `${clearanceRate}% Rate`, isPositive: true }}
          onClick={() => onNavigateModule('students')}
        />

        <MetricKpiCard
          title="Clearance Pending / Hold"
          value={pendingClearance}
          subtitle="Students awaiting fees or clearance validation"
          icon={Clock}
          colorScheme="amber"
          trend={{ value: `${100 - clearanceRate}% Pending`, isNeutral: true }}
          onClick={() => onNavigateModule('students')}
        />

        <MetricKpiCard
          title="Printed Smart Cards"
          value={printedCards}
          subtitle={`${printedRate}% of cards generated & issued`}
          icon={Printer}
          colorScheme="purple"
          trend={{ value: `${printedRate}% Complete`, isPositive: true }}
          onClick={() => onNavigateModule('clearance')}
        />

        <MetricKpiCard
          title="Attendance Rate Today"
          value="96.4%"
          subtitle="Gate scanner & class verifications"
          icon={UserCheck}
          colorScheme="cyan"
          trend={{ value: '+2.1% vs yesterday', isPositive: true }}
          onClick={() => onNavigateModule('attendance')}
        />

        <MetricKpiCard
          title="Teaching & Staff Members"
          value="55"
          subtitle="Active academic teachers & support staff"
          icon={GraduationCap}
          colorScheme="indigo"
          trend={{ value: 'Full Roster', isPositive: true }}
          onClick={() => onNavigateModule('staff')}
        />

        <MetricKpiCard
          title="Fees & Revenue Collection"
          value="UGX 142.5M"
          subtitle="Term 3 clearance fees verified"
          icon={DollarSign}
          colorScheme="emerald"
          trend={{ value: '+14.2% collected', isPositive: true }}
          onClick={() => onNavigateModule('fees')}
        />

        <MetricKpiCard
          title="Gate Entries Today"
          value="1,482"
          subtitle="Total verified turnstile & gate scans"
          icon={Building2}
          colorScheme="purple"
          trend={{ value: 'Normal Traffic', isPositive: true }}
          onClick={() => onNavigateModule('attendance')}
        />

      </div>

      {/* Main Split Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Core Modules Overview & Quick Launchers */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Clearance & Cards Progress Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
                  Term 3 Smart Clearance Roster Progress
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Live database validation rate for student clearance and physical identity card distribution.
                </p>
              </div>

              <button 
                onClick={() => onNavigateModule('clearance')}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Clearance Suite</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Clearance Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono font-bold">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cleared Roster: {clearedStudents} Students ({clearanceRate}%)
                </span>
                <span className="text-amber-400">
                  On Hold: {pendingClearance} Students
                </span>
              </div>
              <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" 
                  style={{ width: `${clearanceRate}%` }}
                />
                <div 
                  className="h-full bg-amber-500/40 transition-all duration-500" 
                  style={{ width: `${100 - clearanceRate}%` }}
                />
              </div>
            </div>

            {/* Printing Progress Bar */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex justify-between text-xs font-mono font-bold">
                <span className="text-purple-400 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" />
                  Printed Cards: {printedCards} Cards ({printedRate}%)
                </span>
                <span className="text-slate-400">
                  Unprinted: {totalStudents - printedCards} Cards
                </span>
              </div>
              <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500" 
                  style={{ width: `${printedRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Workspaces Module Launcher Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <div 
              onClick={() => onNavigateModule('students')}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 transition-all hover:-translate-y-1 cursor-pointer group shadow-lg"
            >
              <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 w-fit mb-3 group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors">
                Students Workspace
              </h4>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Manage all {totalStudents} student profiles, form classes, & passport photos.
              </p>
            </div>

            <div 
              onClick={() => onNavigateModule('attendance')}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 transition-all hover:-translate-y-1 cursor-pointer group shadow-lg"
            >
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit mb-3 group-hover:scale-110 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">
                Gate & Attendance
              </h4>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Monitor turnstile QR scans, clock-in logs, and SMS notifications.
              </p>
            </div>

            <div 
              onClick={() => onNavigateModule('clearance')}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/50 transition-all hover:-translate-y-1 cursor-pointer group shadow-lg"
            >
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 w-fit mb-3 group-hover:scale-110 transition-transform">
                <Printer className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">
                Card Printing Suite
              </h4>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Generate high-resolution front/back smart clearance cards.
              </p>
            </div>

          </div>

        </div>

        {/* Right 1 Column: System Activity Feed & Cloud Engine Health */}
        <div className="space-y-6">
          
          <ActivityFeed onViewAll={() => onNavigateModule('students')} />

          {/* Database Engine Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider font-mono">
                  Cloud Engine Health
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                CONNECTED
              </span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800/40">
                <span className="text-slate-400">Database Host:</span>
                <span className="text-slate-200 font-semibold truncate max-w-[140px]">Aiven Cloud MySQL</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/40">
                <span className="text-slate-400">Total Student Rows:</span>
                <span className="text-indigo-400 font-bold">{totalStudents}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/40">
                <span className="text-slate-400">SSL Mode:</span>
                <span className="text-emerald-400 font-semibold">REQUIRED</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Backend Server:</span>
                <span className="text-purple-400 font-semibold">Render Live API</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
