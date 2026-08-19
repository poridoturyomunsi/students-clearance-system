import React, { useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Upload,
  Download,
  Filter,
  Eye,
  ShieldCheck,
  FileSpreadsheet,
  Cloud,
  Database
} from 'lucide-react';
import { fetchStudentsFromDb, updateStudentInDb } from '../../utils/api.ts';
import { Student } from '../../types.ts';

export default function PhotoRecoveryDashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'linked' | 'missing' | 'stats'>('linked');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('All');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const res = await fetchStudentsFromDb({ limit: -1 });
      if (res && Array.isArray(res.data)) {
        setStudents(res.data);
      }
    } catch (err) {
      console.error('Failed to load students for photo recovery:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalStudents = students.length;
  const linkedStudents = students.filter(s => s.photo || s.hasPhoto);
  const missingStudents = students.filter(s => !s.photo && !s.hasPhoto);

  const base64Count = students.filter(s => s.photo && s.photo.startsWith('data:image')).length;
  const cloudinaryCount = students.filter(s => s.photo && (s.photo.includes('cloudinary') || s.photo.startsWith('http'))).length;

  const filteredLinked = linkedStudents.filter(s => {
    const matchesSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.adminNo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = filterClass === 'All' || s.gradeClass === filterClass;
    return matchesSearch && matchesClass;
  });

  const filteredMissing = missingStudents.filter(s => {
    const matchesSearch = !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.adminNo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = filterClass === 'All' || s.gradeClass === filterClass;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="flex flex-col gap-6 h-full min-h-[80vh] p-2">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase text-slate-100 tracking-wide flex items-center gap-2">
              <span>Photo Recovery &amp; Storage Audit Console</span>
            </h2>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Inspect Database Photo References, Base64 Data URIs, Cloudinary CDN Links &amp; Batch Photo Matcher
            </p>
          </div>
        </div>

        <button
          onClick={loadStudents}
          className="px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-[10px] font-bold uppercase font-mono rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Re-Scan Storage
        </button>
      </div>

      {/* SUMMARY STATS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950 border border-slate-850 p-3.5 rounded-2xl space-y-1">
          <span className="text-[9px] font-mono font-bold uppercase text-slate-500">Total Roster</span>
          <div className="text-xl font-black font-mono text-slate-100">{totalStudents}</div>
          <span className="text-[8.5px] text-slate-500">Active Students</span>
        </div>

        <div className="bg-slate-950 border border-emerald-900/40 p-3.5 rounded-2xl space-y-1">
          <span className="text-[9px] font-mono font-bold uppercase text-emerald-400">Found &amp; Linked</span>
          <div className="text-xl font-black font-mono text-emerald-400">{linkedStudents.length}</div>
          <span className="text-[8.5px] text-emerald-300/80">Valid Passport Photos</span>
        </div>

        <div className="bg-slate-950 border border-amber-900/40 p-3.5 rounded-2xl space-y-1">
          <span className="text-[9px] font-mono font-bold uppercase text-amber-400">Missing Photos</span>
          <div className="text-xl font-black font-mono text-amber-400">{missingStudents.length}</div>
          <span className="text-[8.5px] text-amber-300/80">Awaiting Upload</span>
        </div>

        <div className="bg-slate-950 border border-indigo-900/40 p-3.5 rounded-2xl space-y-1">
          <span className="text-[9px] font-mono font-bold uppercase text-indigo-400">Storage Types</span>
          <div className="text-xs font-mono font-bold text-slate-200">
            {base64Count} Base64 | {cloudinaryCount} Cloud
          </div>
          <span className="text-[8.5px] text-indigo-300/80">MySQL DB + Cloud CDN</span>
        </div>
      </div>

      {actionMsg && (
        <div className="px-4 py-2 bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 text-xs font-bold rounded-xl flex items-center justify-between">
          <span>ℹ️ {actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* CONTROLS & TABS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-850 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('linked')}
            className={`px-4 py-1.5 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
              activeTab === 'linked'
                ? 'bg-indigo-600 text-white font-black'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            🖼️ Linked Photos ({linkedStudents.length})
          </button>
          <button
            onClick={() => setActiveTab('missing')}
            className={`px-4 py-1.5 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
              activeTab === 'missing'
                ? 'bg-indigo-600 text-white font-black'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            ⚠️ Missing Photos ({missingStudents.length})
          </button>
        </div>

        {/* Search & Filter Inputs */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search name or admin..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 pl-9 pr-3 py-1.5 text-xs rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 px-3 py-1.5 text-xs rounded-xl focus:outline-none focus:border-indigo-500 font-mono"
          >
            <option value="All">All Classes</option>
            {['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* LINKED PHOTOS TAB */}
      {activeTab === 'linked' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 overflow-y-auto max-h-[60vh] p-1">
          {filteredLinked.slice(0, 120).map(s => {
            const photoSrc = s.photo || '';
            const isBase64 = photoSrc.startsWith('data:image');
            const isCloud = photoSrc.includes('cloudinary') || photoSrc.startsWith('http');

            return (
              <div
                key={s.id}
                className="bg-slate-950 border border-slate-850 rounded-2xl p-2.5 flex flex-col items-center text-center space-y-2 hover:border-indigo-500/40 transition-all group relative"
              >
                <div className="w-16 h-20 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
                  {photoSrc ? (
                    <img src={photoSrc} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  )}
                  <span
                    className={`absolute bottom-0 left-0 right-0 text-[7.5px] font-mono font-bold uppercase py-0.5 ${
                      isBase64 ? 'bg-indigo-950/90 text-indigo-300' : 'bg-emerald-950/90 text-emerald-300'
                    }`}
                  >
                    {isBase64 ? 'Base64 DB' : 'Cloud CDN'}
                  </span>
                </div>

                <div className="w-full space-y-0.5">
                  <h4 className="text-[10.5px] font-bold text-slate-200 truncate">{s.name}</h4>
                  <p className="text-[9px] font-mono text-indigo-400 font-bold">{s.adminNo} • {s.gradeClass}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MISSING PHOTOS TAB */}
      {activeTab === 'missing' && (
        <div className="overflow-x-auto border border-slate-850 rounded-2xl bg-slate-950 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-850 text-slate-400 font-mono text-[9px] uppercase sticky top-0">
                <th className="p-3">Admin No</th>
                <th className="p-3">Full Name</th>
                <th className="p-3">Class</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
              {filteredMissing.slice(0, 100).map(s => (
                <tr key={s.id} className="hover:bg-slate-900/50">
                  <td className="p-3 text-indigo-400 font-bold">{s.adminNo}</td>
                  <td className="p-3 font-bold font-sans">{s.name}</td>
                  <td className="p-3">{s.gradeClass}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[9px]">
                      Missing Photo
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <label className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-[9.5px] uppercase font-bold rounded-lg cursor-pointer inline-flex items-center gap-1">
                      <Upload className="w-3 h-3 text-indigo-400" /> Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const base64 = reader.result as string;
                              await updateStudentInDb(s.id, { ...s, photo: base64, hasPhoto: true });
                              setActionMsg(`Uploaded and saved photo for ${s.name} (${s.adminNo}).`);
                              loadStudents();
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
