import React from 'react';

interface ModuleCardProps {
  title: string;
  description?: string;
  Icon: any;
  onClick?: () => void;
}

export default function ModuleCard({ title, description, Icon, onClick }: ModuleCardProps) {
  return (
    <button onClick={onClick} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left hover:shadow-lg transition-shadow flex gap-4 items-start">
      <div className="p-3 rounded-lg bg-slate-800/40 text-indigo-400">
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-slate-100">{title}</h4>
        </div>
        {description && <p className="text-[12px] text-slate-400 mt-1">{description}</p>}
        <div className="text-[12px] text-slate-500 mt-3">Quick actions • Summary</div>
      </div>
    </button>
  );
}
