import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { fetchStudentsFromDb, fetchClassesFromDb, fetchStreamsFromDb } from '../../utils/api.ts';

interface StudentsModuleProps {
  onOpenStudent?: (id: string) => void;
}

export default function StudentsModule({ onOpenStudent }: StudentsModuleProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('All');
  const [streamFilter, setStreamFilter] = useState<string>('All');
  const [genderFilter, setGenderFilter] = useState<string>('All');
  const [boardingFilter, setBoardingFilter] = useState<string>('All');
  const [clearanceFilter, setClearanceFilter] = useState<string>('All');
  const [classes, setClasses] = useState<string[]>([]);
  const [streams, setStreams] = useState<string[]>([]);
  const [groupedView, setGroupedView] = useState<boolean>(true);
  const [groupPreviewLimit] = useState<number>(5);
  const [groupedData, setGroupedData] = useState<Record<string, { students: any[]; total: number }>>({});
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [streamCounts, setStreamCounts] = useState<Record<string, number>>({});

  const loadPage = async (p: number, l: number, s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentsFromDb({ page: p, limit: l, search: s, gradeClass: classFilter !== 'All' ? classFilter : undefined, stream: streamFilter !== 'All' ? streamFilter : undefined, gender: genderFilter !== 'All' ? genderFilter : undefined, boardingStatus: boardingFilter !== 'All' ? boardingFilter : undefined, isCleared: clearanceFilter !== 'All' ? (clearanceFilter === 'Cleared' ? 'Cleared' : 'Not Cleared') : undefined, sortBy: 'gradeClass' });
      const fetched = res.data || [];
      setStudents(sortStudents(fetched));
      setTotal(res.total || 0);
      setPage(res.page || p);
    } catch (err: any) {
      console.error('Failed to load students page:', err);
      setError(err?.message || 'Database connection failed. Please ensure the host server is running.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!groupedView) loadPage(page, limit, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  // Load classes/streams and counts
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const cls = await fetchClassesFromDb();
        const str = await fetchStreamsFromDb();
        const classNames = cls.map((c: any) => c.name);
        const streamNames = str.map((s: any) => s.name);
        setClasses(classNames);
        setStreams(streamNames);

        // Get quick counts per class and per stream (limit=1 returns total)
        const cCounts: Record<string, number> = {};
        for (const cn of classNames) {
          try {
            const r = await fetchStudentsFromDb({ gradeClass: cn, limit: 1 });
            cCounts[cn] = r.total || 0;
          } catch (e) {
            cCounts[cn] = 0;
          }
        }
        setClassCounts(cCounts);

        const sCounts: Record<string, number> = {};
        for (const sn of streamNames) {
          try {
            const r = await fetchStudentsFromDb({ stream: sn, limit: 1 });
            sCounts[sn] = r.total || 0;
          } catch (e) {
            sCounts[sn] = 0;
          }
        }
        setStreamCounts(sCounts);
      } catch (err: any) {
        console.error('Failed to load classes/streams:', err);
        setError(err?.message || 'Database connection failed. Please ensure the host server is running.');
      }
    };
    loadMeta();
  }, []);

  // Grouped preview: fetch small preview per class+stream
  useEffect(() => {
    if (!groupedView) return;
    const loadGrouped = async () => {
      const map: Record<string, { students: any[]; total: number }> = {};
      // For each class and stream combination, request a small sample and total
      const classListToUse = classes.length > 0 ? classes : ['S.1','S.2','S.3','S.4','S.5','S.6'];
      const streamsToUse = streams.length > 0 ? streams : ['A','B','C','Arts','Sciences'];

      for (const cn of classListToUse) {
        for (const sn of streamsToUse) {
          const key = `${cn} ${sn}`;
          try {
            const res = await fetchStudentsFromDb({ gradeClass: cn, stream: sn, limit: groupPreviewLimit });
            map[key] = { students: res.data || [], total: res.total || 0 };
          } catch (e: any) {
            map[key] = { students: [], total: 0 };
            setError(e?.message || 'Database connection failed. Please ensure the host server is running.');
          }
        }
      }
      setGroupedData(map);
    };
    loadGrouped();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedView, classes, streams]);

  const onSearch = () => {
    setPage(1);
    if (groupedView) {
      // refresh grouped data filtered by search - simplest approach: switch to list
      setGroupedView(false);
    }
    loadPage(1, limit, search);
  };

  const handleClassClick = (cls: string, stream?: string) => {
    setClassFilter(cls || 'All');
    setStreamFilter(stream || 'All');
    setGroupedView(false);
    setPage(1);
    loadPage(1, limit, search);
  };

  // When filters change, reload list or grouped preview
  useEffect(() => {
    setPage(1);
    if (groupedView) {
      // switching to grouped refresh will trigger grouped effect
    } else {
      loadPage(1, limit, search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, streamFilter, genderFilter, boardingFilter, clearanceFilter, groupedView]);

  // Helper to sort by gradeClass (class, stream) then name
  const sortStudents = (list: any[]) => {
    return list.sort((a, b) => {
      const aParts = (a.gradeClass || '').split(' ');
      const bParts = (b.gradeClass || '').split(' ');
      const aClass = aParts[0] || '';
      const bClass = bParts[0] || '';
      const aStream = aParts.slice(1).join(' ') || '';
      const bStream = bParts.slice(1).join(' ') || '';
      if (aClass < bClass) return -1;
      if (aClass > bClass) return 1;
      if (aStream < bStream) return -1;
      if (aStream > bStream) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  return (
    <div>
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/25 p-4 rounded-xl flex items-center gap-3 text-xs text-rose-400 mb-4 font-semibold">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-xl font-black">Students</h4>
          <p className="text-sm text-slate-400">Manage student registry, admissions and profiles.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or admno" className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm" />
          <button onClick={onSearch} className="px-3 py-2 bg-indigo-600 rounded text-sm">Search</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="All">All Classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="All">All Streams</option>
          {streams.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="All">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <select value={boardingFilter} onChange={(e) => setBoardingFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="All">All Boarding</option>
          <option value="Hosteller">Hostellers</option>
          <option value="Day Scholar">Day Scholar</option>
        </select>

        <select value={clearanceFilter} onChange={(e) => setClearanceFilter(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="All">All Clearance</option>
          <option value="Cleared">Cleared</option>
          <option value="Not Cleared">Not Cleared</option>
        </select>

        <label className="text-sm text-slate-400 ml-2">View:</label>
        <select value={groupedView ? 'grouped' : 'list'} onChange={(e) => setGroupedView(e.target.value === 'grouped')} className="bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm">
          <option value="grouped">Grouped</option>
          <option value="list">List (paginated)</option>
        </select>
      </div>

      <div className="mb-3 text-sm text-slate-400">Showing {students.length} of {total} students (page {page})</div>

      {/* Summary cards per class */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {classes.map((c) => (
          <button key={c} onClick={() => handleClassClick(c)} className="bg-slate-900 p-3 rounded-lg text-left hover:shadow-lg">
            <div className="text-sm text-slate-400">{c}</div>
            <div className="text-xl font-black text-emerald-400">{classCounts[c] || 0}</div>
          </button>
        ))}
      </div>

      {/* Summary cards per stream */}
      <div className="flex gap-2 mb-4 overflow-auto">
        {streams.map((s) => (
          <button key={s} onClick={() => handleClassClick('All', s)} className="bg-slate-900 p-2 rounded-lg text-sm hover:shadow">
            <div className="text-slate-400">{s}</div>
            <div className="font-bold">{streamCounts[s] || 0}</div>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto bg-slate-900 p-2 rounded">
        {loading ? (
          <div className="p-6 text-center">Loading students...</div>
        ) : groupedView ? (
          <div className="space-y-6">
            {Object.keys(groupedData).map((groupKey) => {
              const g = groupedData[groupKey];
              if (!g) return null;
              const [clsName, streamName] = groupKey.split(' ');
              // If there are no students in the group, skip rendering
              if (!g.total || g.total === 0) return null;
              return (
                <div key={groupKey} className="bg-slate-950 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <button onClick={() => handleClassClick(clsName, streamName)} className="font-black text-slate-100">{groupKey}</button>
                      <div className="text-sm text-slate-400">{g.total} students</div>
                    </div>
                    <div className="text-sm text-slate-400">Preview</div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Array.isArray(g.students) && g.students.map((s: any) => (
                      <div key={s.id} onClick={() => onOpenStudent?.(s.id)} className="p-2 bg-slate-900 rounded flex items-center gap-3 cursor-pointer hover:shadow-md">
                        <div className="flex-1">
                          <div className="font-bold text-slate-100">{s.name}</div>
                          <div className="text-sm text-slate-400">{s.adminNo} • {s.gender}</div>
                        </div>
                        <div className="text-sm text-slate-400">{s.isCleared ? 'Cleared' : 'Pending'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="text-slate-400 text-[12px] uppercase">
                <th className="p-2">No</th>
                <th className="p-2">AdminNo</th>
                <th className="p-2">Name</th>
                <th className="p-2">Gender</th>
                <th className="p-2">Class</th>
                <th className="p-2">Boarding</th>
                <th className="p-2">Cleared</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(students) && students.map((s, idx) => (
                <tr key={s.id} onClick={() => onOpenStudent?.(s.id)} className="border-t border-slate-850 cursor-pointer hover:bg-slate-900">
                  <td className="p-2">{(page - 1) * limit + idx + 1}</td>
                  <td className="p-2 font-mono">{s.adminNo}</td>
                  <td className="p-2">{s.name}</td>
                  <td className="p-2">{s.gender}</td>
                  <td className="p-2">{s.gradeClass}</td>
                  <td className="p-2">{s.boardingStatus}</td>
                  <td className="p-2">{s.isCleared ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} className="px-3 py-2 bg-slate-900 rounded">Prev</button>
          <button onClick={() => setPage(page + 1)} className="px-3 py-2 bg-slate-900 rounded">Next</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Per page:</label>
          <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
    </div>
  );
}
