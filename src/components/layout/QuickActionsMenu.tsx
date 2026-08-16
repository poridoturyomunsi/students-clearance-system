import React from 'react';
import { 
  UserPlus, 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Image, 
  CopyX, 
  FileText,
  X
} from 'lucide-react';

interface QuickActionsMenuProps {
  onClose: () => void;
  onAddStudent: () => void;
  onImportExcel: () => void;
  onExportData: () => void;
  onGenerateCards: () => void;
  onMatchPhotos: () => void;
  onRemoveDuplicates: () => void;
  onGenerateReports: () => void;
}

export default function QuickActionsMenu({
  onClose,
  onAddStudent,
  onImportExcel,
  onExportData,
  onGenerateCards,
  onMatchPhotos,
  onRemoveDuplicates,
  onGenerateReports
}: QuickActionsMenuProps) {

  const actions = [
    {
      label: 'Add New Student',
      description: 'Register a single student manually into roster',
      icon: UserPlus,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      action: onAddStudent
    },
    {
      label: 'Upload Excel File',
      description: 'Import student roster from .xlsx spreadsheet',
      icon: FileSpreadsheet,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: onImportExcel
    },
    {
      label: 'Export Roster Data',
      description: 'Download student list to Excel format',
      icon: Download,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      action: onExportData
    },
    {
      label: 'Generate Clearance Cards',
      description: 'Batch process PDF smart clearance cards',
      icon: Printer,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      action: onGenerateCards
    },
    {
      label: 'Match Photos ZIP',
      description: 'Auto-match student passport photos from ZIP archive',
      icon: Image,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      action: onMatchPhotos
    },
    {
      label: 'Remove Duplicates',
      description: 'Scan and merge duplicate student records',
      icon: CopyX,
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      action: onRemoveDuplicates
    },
    {
      label: 'Generate ERP Reports',
      description: 'Compile academic performance & clearance sheets',
      icon: FileText,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      action: onGenerateReports
    }
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 mb-1">
          <span className="text-xs font-black text-slate-300 uppercase tracking-wider font-mono">Quick Actions Hub</span>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1 max-h-[75vh] overflow-y-auto pr-1">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            return (
              <button
                key={idx}
                onClick={() => {
                  act.action();
                  onClose();
                }}
                className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-800/70 border border-transparent hover:border-slate-700/60 transition-all text-left group cursor-pointer"
              >
                <div className={`p-2 rounded-xl border ${act.color} shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                    {act.label}
                  </div>
                  <div className="text-[10px] text-slate-400 line-clamp-1">
                    {act.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
