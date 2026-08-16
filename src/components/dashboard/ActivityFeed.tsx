import React from 'react';
import { 
  UserPlus, 
  Printer, 
  Clock, 
  FileSpreadsheet, 
  CheckCircle2, 
  Activity,
  ArrowRight
} from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'register' | 'print' | 'attendance' | 'excel' | 'clearance';
  title: string;
  user: string;
  time: string;
  status: 'Completed' | 'Success' | 'Logged';
}

interface ActivityFeedProps {
  activities?: ActivityItem[];
  onViewAll?: () => void;
}

export default function ActivityFeed({ activities, onViewAll }: ActivityFeedProps) {

  const defaultActivities: ActivityItem[] = [
    {
      id: '1',
      type: 'register',
      title: 'Registered new student NAIGAGA CHRISTINE (S.2 A)',
      user: 'System Administrator',
      time: '10 mins ago',
      status: 'Success'
    },
    {
      id: '2',
      type: 'clearance',
      title: 'Cleared 14 S.4 students for Term 3 Clearance Cards',
      user: 'Bursar Office',
      time: '25 mins ago',
      status: 'Completed'
    },
    {
      id: '3',
      type: 'print',
      title: 'Batch PDF Clearance Cards generated (50 students)',
      user: 'System Administrator',
      time: '1 hour ago',
      status: 'Completed'
    },
    {
      id: '4',
      type: 'attendance',
      title: 'Gate Entry scan verified at Main Gate (Gate 1)',
      user: 'Gate Scanner',
      time: '2 hours ago',
      status: 'Logged'
    },
    {
      id: '5',
      type: 'excel',
      title: 'Database synced with Aiven Cloud MySQL engine',
      user: 'Database Engine',
      time: '3 hours ago',
      status: 'Success'
    }
  ];

  const items = activities && activities.length > 0 ? activities : defaultActivities;

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'register':
        return <UserPlus className="w-4 h-4 text-indigo-400" />;
      case 'print':
        return <Printer className="w-4 h-4 text-purple-400" />;
      case 'attendance':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'clearance':
        return <CheckCircle2 className="w-4 h-4 text-cyan-400" />;
      default:
        return <Activity className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-wider font-mono">
            Recent System Activity
          </h3>
        </div>
        {onViewAll && (
          <button 
            onClick={onViewAll}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/50 hover:border-slate-700/60 transition-all group"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0 group-hover:scale-105 transition-transform">
                {getIcon(item.type)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate group-hover:text-indigo-300 transition-colors">
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">{item.user}</span>
                  <span>•</span>
                  <span className="font-mono text-slate-400">{item.time}</span>
                </div>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
