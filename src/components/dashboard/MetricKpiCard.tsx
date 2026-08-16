import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricKpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  colorScheme?: 'indigo' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'rose';
  onClick?: () => void;
}

export default function MetricKpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  colorScheme = 'indigo',
  onClick
}: MetricKpiCardProps) {

  const schemeStyles = {
    indigo: {
      border: 'border-indigo-500/20 hover:border-indigo-500/40',
      iconBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      gradient: 'from-indigo-950/20 to-slate-900/80',
      shadow: 'hover:shadow-indigo-500/10'
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      gradient: 'from-emerald-950/20 to-slate-900/80',
      shadow: 'hover:shadow-emerald-500/10'
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      gradient: 'from-amber-950/20 to-slate-900/80',
      shadow: 'hover:shadow-amber-500/10'
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/40',
      iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      gradient: 'from-purple-950/20 to-slate-900/80',
      shadow: 'hover:shadow-purple-500/10'
    },
    cyan: {
      border: 'border-cyan-500/20 hover:border-cyan-500/40',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      gradient: 'from-cyan-950/20 to-slate-900/80',
      shadow: 'hover:shadow-cyan-500/10'
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      gradient: 'from-rose-950/20 to-slate-900/80',
      shadow: 'hover:shadow-rose-500/10'
    }
  };

  const style = schemeStyles[colorScheme];

  return (
    <div
      onClick={onClick}
      className={`relative p-5 rounded-2xl bg-gradient-to-br ${style.gradient} border ${style.border} shadow-xl ${style.shadow} transition-all duration-200 group ${
        onClick ? 'cursor-pointer hover:-translate-y-1' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            {title}
          </span>
          <div className="text-3xl font-black text-white mt-1.5 tracking-tight font-mono">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
        </div>

        <div className={`p-3 rounded-2xl border ${style.iconBg} shrink-0 group-hover:scale-110 transition-transform`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-800/60 pt-3">
        {subtitle && (
          <span className="text-xs text-slate-400 font-medium truncate">
            {subtitle}
          </span>
        )}

        {trend && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
            trend.isNeutral
              ? 'bg-slate-800 text-slate-400 border-slate-700'
              : trend.isPositive
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}>
            {trend.isNeutral ? (
              <Minus className="w-3 h-3" />
            ) : trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{trend.value}</span>
          </span>
        )}
      </div>
    </div>
  );
}
