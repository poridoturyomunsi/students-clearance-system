import React, { useEffect, useState, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, Save, X, AlertCircle, CheckCircle2, Upload, Download, FileSpreadsheet, Lock, Camera } from 'lucide-react';
import { Teacher } from '../../types.ts';
import { fetchTeachers, createTeacher, updateTeacher, deleteTeacher, fetchClassTeachers, saveClassTeacher, fetchSettings, importTeachers, fetchTeacherSignature } from '../../utils/api.ts';
import { SCHOOL_CLASSES } from '../../data.ts';
import * as XLSX from 'xlsx';
import { compressStudentPhoto, compressSignatureImage } from '../../utils/imageProcessor.ts';

export default function TeachersModule() {
  const isHeadteacher = (position?: string) => {
    if (!position) return false;
    const pos = position.toLowerCase().replace(/\s+/g, '');
    return pos === 'headteacher';
  };

  const hasSignature = (position?: string) => {
    if (!position) return false;
    const pos = position.toLowerCase().replace(/\s+/g, '');
    return pos === 'classteacher' || pos === 'dos' || pos === 'directorofstudies' || pos === 'headteacher';
  };

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'registry' | 'assignments' | 'streamallocation' | 'upload'>('registry');
  const [settings, setSettings] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Bulk Upload states
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    gender: 'Male',
    subjects: [] as string[],
    classes: [] as string[],
    position: 'Teacher',
    signature: '',
    photo: '',
    status: 'Active'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [teachersList, classTeachersList, settingsData] = await Promise.all([
        fetchTeachers(),
        fetchClassTeachers(),
        fetchSettings()
      ]);
      setTeachers(teachersList);
      setClassTeachers(classTeachersList);
      setSettings(settingsData);
      setError(null);
    } catch (err: any) {
      setError('Failed to load teacher data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.username.trim()) {
      setError('Name and username are required');
      return;
    }

    const payloadSubjects = isHeadteacher(formData.position) ? [] : formData.subjects;
    const payloadClasses = isHeadteacher(formData.position) ? [] : formData.classes;

    try {
      if (editingTeacher) {
        const { assignments, classTeacherFor, ...cleanEditingTeacher } = editingTeacher;
        await updateTeacher(editingTeacher.id, {
          ...cleanEditingTeacher,
          ...formData,
          name: formData.name,
          username: formData.username,
          gender: formData.gender,
          subjects: payloadSubjects,
          classes: payloadClasses,
          position: formData.position,
          photo: formData.photo,
          status: formData.status,
          password: formData.password.trim() || undefined
        });
        setSuccess('Teacher updated successfully');
      } else {
        if (!formData.password.trim()) {
          setError('Password is required for new teachers');
          return;
        }
        await createTeacher({
          username: formData.username,
          password: formData.password,
          name: formData.name,
          gender: formData.gender,
          subjects: payloadSubjects,
          classes: payloadClasses,
          position: formData.position,
          photo: formData.photo,
          signature: formData.signature,
          status: formData.status
        });
        setSuccess('Teacher created successfully');
      }
      setFormData({ username: '', password: '', name: '', gender: 'Male', subjects: [], classes: [], position: 'Teacher', signature: '', photo: '', status: 'Active' });
      setEditingTeacher(null);
      setShowForm(false);
      loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to save teacher: ' + err.message);
    }
  };

  // Direct photo upload shortcut on hover
  const handleDirectPhotoUpload = async (teacherId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      setError('Only JPG, JPEG, and PNG formats are accepted.');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Src = e.target?.result as string;
        const compressed = await compressStudentPhoto(base64Src, 300, 400, 0.8);
        const targetTeacher = teachers.find(t => t.id === teacherId);
        if (targetTeacher) {
          await updateTeacher(teacherId, {
            ...targetTeacher,
            photo: compressed
          });
          setSuccess('Teacher passport photo updated successfully');
          loadData();
          setTimeout(() => setSuccess(null), 3000);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError('Failed to upload photo: ' + err.message);
    }
  };

  // Generate and download Excel Template
  const handleDownloadTemplate = () => {
    try {
      const headers = [
        "Teacher Number",
        "Full Name",
        "Gender",
        "Subject(s) Taught",
        "Username",
        "Password",
        "Class Teacher"
      ];
      const data = [
        headers,
        ["T-101", "Jane Doe", "Female", "Mathematics, English", "janedoe", "password123", "S.1 A"],
        ["T-102", "John Smith", "Male", "Physics", "johnsmith", "pass321", ""]
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Teachers Template");
      
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'teachers_upload_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Failed to generate Excel template: ' + err.message);
    }
  };

  // Bulk Import File Handler
  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportReport(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      setError('Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.');
      return;
    }

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      if (!workbook.SheetNames.length) {
        throw new Error('No worksheet found in the imported file.');
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });
      if (!rawRows.length) {
        throw new Error('The imported file contains no records.');
      }

      // Map spreadsheet columns to payload properties
      const mappedTeachers = rawRows.map((row: any, idx: number) => {
        const norm: any = { rowNumber: idx + 2 };
        Object.keys(row).forEach(key => {
          const cleanKey = key.trim().toLowerCase();
          const val = String(row[key]).trim();
          if (cleanKey.includes('number') || cleanKey.includes('employee')) {
            norm.id = val;
          } else if (cleanKey.includes('full name') || cleanKey === 'name') {
            norm.name = val;
          } else if (cleanKey === 'gender') {
            if (/^f/i.test(val) || /^female/i.test(val)) norm.gender = 'Female';
            else if (/^m/i.test(val) || /^male/i.test(val)) norm.gender = 'Male';
            else norm.gender = val;
          } else if (cleanKey.includes('subject')) {
            norm.subjects = val;
          } else if (cleanKey === 'username') {
            norm.username = val;
          } else if (cleanKey === 'password') {
            norm.password = val;
          } else if (cleanKey.includes('class teacher')) {
            norm.classTeacher = val;
          }
        });
        return norm;
      });

      const response = await importTeachers(mappedTeachers);
      if (response.success && response.report) {
        setImportReport(response.report);
        loadData();
      } else {
        throw new Error(response.error || 'Unknown import error occurred.');
      }
    } catch (err: any) {
      setError('Failed to import file: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this teacher?')) {
      try {
        await deleteTeacher(id);
        setSuccess('Teacher deleted successfully');
        loadData();
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        setError('Failed to delete teacher: ' + err.message);
      }
    }
  };

  const handleClassTeacherChange = async (gradeClass: string, teacherId: string) => {
    try {
      await saveClassTeacher({ gradeClass, teacherId: teacherId || null });
      setSuccess(`${gradeClass} class teacher assigned`);
      loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to assign class teacher: ' + err.message);
    }
  };

  const filteredTeachers = teachers.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSubjectsList = () => {
    try {
      const olevel = settings?.olevel_subjects ? JSON.parse(settings.olevel_subjects) : [];
      const uace = settings?.uace_subjects ? JSON.parse(settings.uace_subjects) : [];
      return [...new Set([...olevel, ...uace])];
    } catch {
      return [];
    }
  };

  const allSubjects = getSubjectsList();

  // Get stream allocations
  const streamAllocations = SCHOOL_CLASSES.map(className => {
    const classTeacher = classTeachers.find(ct => ct.gradeClass === className);
    const teacher = teachers.find(t => t.id === classTeacher?.teacherId);
    const teachersInClass = teachers.filter(t => t.classes?.includes(className));
    return { className, classTeacher: teacher, allTeachers: teachersInClass };
  });

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/25 p-3 rounded-lg flex items-center gap-2 text-sm text-rose-400">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">✕</button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 p-3 rounded-lg flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('registry')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'registry'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Teacher Registry
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'assignments'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Subject Assignments
        </button>
        <button
          onClick={() => setActiveTab('streamallocation')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'streamallocation'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Stream Allocation
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition ${
            activeTab === 'upload'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Teachers Upload
        </button>
      </div>

      {/* Teacher Registry Tab */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex-1 mr-4">
              <input
                type="text"
                placeholder="Search teachers by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => {
                setEditingTeacher(null);
                setFormData({ username: '', password: '', name: '', gender: 'Male', subjects: [], classes: [], position: 'Teacher', signature: '', photo: '', status: 'Active' });
                setShowForm(!showForm);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Teacher
            </button>
          </div>

          {showForm && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
              <h4 className="font-bold text-lg">{editingTeacher ? 'Edit Teacher' : 'New Teacher'}</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Photo Upload Row */}
                <div className="col-span-2 flex items-center gap-4 bg-slate-900/60 p-3 rounded-lg border border-slate-850">
                  <div className="w-16 h-20 rounded bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 relative group">
                    {formData.photo ? (
                      <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-700" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Passport Photo</label>
                    <div className="flex gap-2">
                      <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded cursor-pointer transition flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" /> Select Photo
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
                              setError('Only JPG, JPEG, and PNG formats are accepted.');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = async (evt) => {
                              const base64 = evt.target?.result as string;
                              const compressed = await compressStudentPhoto(base64, 300, 400, 0.8);
                              setFormData(prev => ({ ...prev, photo: compressed }));
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="hidden"
                        />
                      </label>
                      {formData.photo && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, photo: '' }))}
                          className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 text-xs font-bold rounded border border-rose-900/30 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">JPG, JPEG or PNG formats. Auto-resized and optimized.</p>
                  </div>
                </div>

                {/* Signature Upload Row (Visible if Position has signature) */}
                {hasSignature(formData.position) && (
                  <div className="col-span-2 flex items-center gap-4 bg-slate-900/60 p-3 rounded-lg border border-slate-850 animate-fade-in">
                    <div className="h-20 w-40 rounded bg-white overflow-hidden flex items-center justify-center shrink-0 border border-slate-300 p-1">
                      {formData.signature ? (
                        <img src={formData.signature} alt="Signature Preview" className="h-full object-contain" />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold uppercase">No Signature</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Digital Signature Image</label>
                      <div className="flex gap-2">
                        <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded cursor-pointer transition flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" /> Upload Signature
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  const base64 = reader.result as string;
                                  const compressed = await compressSignatureImage(base64);
                                  setFormData(prev => ({ ...prev, signature: compressed }));
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                        {formData.signature && (
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, signature: '' }))}
                            className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 text-xs font-bold rounded border border-rose-900/30 transition"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">PNG with transparent background is recommended.</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200"
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Username</label>
                  <input
                    type="text"
                    placeholder="Username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                    {editingTeacher ? 'Reset Password (Leave blank to keep unchanged)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Position</label>
                  <select
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200 w-full"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Class Teacher">Class Teacher</option>
                    <option value="DOS">DOS</option>
                    <option value="Headteacher">Headteacher</option>
                    <option value="Head of Department">Head of Department</option>
                    <option value="Deputy Head">Deputy Head</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200 w-full"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Account Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200 w-full"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {!isHeadteacher(formData.position) && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400">Subjects</label>
                    <div className="flex flex-wrap gap-2">
                      {allSubjects.map(subj => (
                        <label key={subj} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.subjects.includes(subj)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, subjects: [...formData.subjects, subj] });
                              } else {
                                setFormData({ ...formData, subjects: formData.subjects.filter(s => s !== subj) });
                              }
                            }}
                            className="rounded"
                          />
                          {subj}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400">Classes</label>
                    <div className="flex flex-wrap gap-2">
                      {SCHOOL_CLASSES.map(cls => (
                        <label key={cls} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.classes.includes(cls)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, classes: [...formData.classes, cls] });
                              } else {
                                setFormData({ ...formData, classes: formData.classes.filter(c => c !== cls) });
                              }
                            }}
                            className="rounded"
                          />
                          {cls}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-sm flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingTeacher(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-2">
              {filteredTeachers.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No teachers found</div>
              ) : (
                filteredTeachers.map(teacher => (
                  <div key={teacher.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition">
                    <div className="flex items-center gap-4">
                      {/* Photo upload / avatar container */}
                      <div className="w-12 h-16 rounded bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 relative group">
                        {teacher.photo ? (
                          <img src={teacher.photo} alt={teacher.name} className="w-full h-full object-cover animate-fade-in" />
                        ) : (
                          <svg className="w-6 h-6 text-slate-700" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        )}
                        <label className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-[8px] text-white font-bold select-none text-center p-1">
                          <Camera className="w-3.5 h-3.5 mb-0.5 text-indigo-400" />
                          <span>Change</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={(e) => handleDirectPhotoUpload(teacher.id, e)}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-100 text-sm truncate">{teacher.name}</h4>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            teacher.status === 'Inactive'
                              ? 'bg-rose-500/10 text-rose-455 border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {teacher.status || 'Active'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {!isHeadteacher(teacher.position) && (
                            <>ID: <span className="font-mono text-slate-300 font-bold">{teacher.id}</span> • </>
                          )}@{teacher.username} • {teacher.position || 'Teacher'} • {teacher.gender || 'Male'}
                        </p>
                        {!isHeadteacher(teacher.position) && teacher.subjects && teacher.subjects.length > 0 && (
                          <p className="text-[11px] text-indigo-400 font-medium">Subjects: {teacher.subjects.join(', ')}</p>
                        )}
                        {!isHeadteacher(teacher.position) && teacher.classes && teacher.classes.length > 0 && (
                          <p className="text-[11px] text-violet-400 font-medium">Classes: {teacher.classes.join(', ')}</p>
                        )}
                        {(teacher.hasSignature || teacher.signature) && (
                          <div className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/20 px-1.5 py-0.5 rounded mt-1.5 w-max">
                            ✍️ Signature Uploaded
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end self-end sm:self-center">
                      <button
                        onClick={async () => {
                          setEditingTeacher(teacher);
                          setFormData({
                            username: teacher.username,
                            password: '',
                            name: teacher.name,
                            gender: teacher.gender || 'Male',
                            subjects: teacher.subjects || [],
                            classes: teacher.classes || [],
                            position: teacher.position || 'Teacher',
                            signature: teacher.signature || '',
                            photo: teacher.photo || '',
                            status: teacher.status || 'Active'
                          });
                          setShowForm(true);

                          if (teacher.hasSignature && !teacher.signature) {
                            try {
                              const res = await fetchTeacherSignature(teacher.id);
                              if (res && res.signature) {
                                setFormData(prev => ({ ...prev, signature: res.signature }));
                                setTeachers(prevTeachers => prevTeachers.map(t => t.id === teacher.id ? { ...t, signature: res.signature } : t));
                              }
                            } catch (e) {
                              console.warn("Failed to load teacher signature lazily:", e);
                            }
                          }
                        }}
                        className="p-2 hover:bg-slate-800 rounded transition flex items-center justify-center border border-slate-800 hover:border-slate-700 bg-slate-900/50"
                        title="Edit teacher details"
                      >
                        <Edit2 className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(teacher.id)}
                        className="p-2 hover:bg-slate-800 rounded transition flex items-center justify-center border border-slate-800 hover:border-slate-700 bg-slate-900/50"
                        title="Delete teacher"
                      >
                        <Trash2 className="w-4 h-4 text-rose-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Manage which subjects teachers teach to which classes.</p>
          <div className="space-y-2">
            {filteredTeachers.filter(t => !isHeadteacher(t.position)).map(teacher => (
              <div key={teacher.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <h4 className="font-bold text-slate-100 mb-2">{teacher.name}</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-slate-400 mb-1">Subjects:</p>
                    <div className="flex flex-wrap gap-1">
                      {teacher.subjects?.map(s => (
                        <span key={s} className="bg-indigo-600/30 text-indigo-300 px-2 py-1 rounded text-xs">{s}</span>
                      )) || <span className="text-slate-500">None assigned</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-1">Classes:</p>
                    <div className="flex flex-wrap gap-1">
                      {teacher.classes?.map(c => (
                        <span key={c} className="bg-violet-600/30 text-violet-300 px-2 py-1 rounded text-xs">{c}</span>
                      )) || <span className="text-slate-500">None assigned</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stream Allocation Tab */}
      {activeTab === 'streamallocation' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Allocate class teachers to streams and classes.</p>
          <div className="space-y-3">
            {streamAllocations.map(({ className, classTeacher, allTeachers }) => (
              <div key={className} className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-100">{className}</h4>
                  {classTeacher && (
                    <span className="text-xs bg-emerald-600/30 text-emerald-300 px-2 py-1 rounded">Class Teacher: {classTeacher.name}</span>
                  )}
                </div>
                <select
                  value={classTeacher?.id || ''}
                  onChange={(e) => handleClassTeacherChange(className, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-sm text-slate-200 mb-2"
                >
                  <option value="">-- Unassigned --</option>
                  {allTeachers.filter(t => !isHeadteacher(t.position)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                  {teachers.filter(t => !isHeadteacher(t.position) && !t.classes?.includes(className)).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <div className="text-xs text-slate-400">
                  {allTeachers.length} teacher(s) assigned to this class
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teachers Upload Tab */}
      {activeTab === 'upload' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Template Card */}
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black uppercase text-slate-200 tracking-wider">Spreadsheet Roster Import</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add multiple teachers at once using a CSV or Excel spreadsheet. Make sure your file follows the standard template format.
              </p>
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-355 tracking-wider font-bold">Expected Columns:</h4>
                <ul className="text-[11px] text-slate-400 space-y-1.5 font-medium list-disc list-inside">
                  <li><strong className="text-indigo-300 font-mono">Teacher Number</strong> (required, unique identifier)</li>
                  <li><strong className="text-indigo-300 font-mono">Full Name</strong> (required, display name)</li>
                  <li><strong className="text-indigo-300 font-mono">Gender</strong> (required, Male or Female)</li>
                  <li><strong className="text-indigo-300 font-mono">Subject(s) Taught</strong> (required, comma-separated list)</li>
                  <li><strong className="text-indigo-300 font-mono">Username</strong> (required, unique login ID)</li>
                  <li><strong className="text-indigo-300 font-mono">Password</strong> (required, default login password)</li>
                  <li><strong className="text-indigo-300 font-mono">Class Teacher</strong> (optional, e.g. S.1 A)</li>
                </ul>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-sm w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" /> Download Excel Template
                </button>
              </div>
            </div>

            {/* Upload Area Card */}
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl flex flex-col justify-between space-y-4">
              <div className="flex items-center gap-3 border-b border-slate-850 pb-3">
                <Upload className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black uppercase text-slate-200 tracking-wider">File Dropzone</h3>
              </div>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 border-2 border-dashed border-slate-850 hover:border-indigo-500/50 bg-slate-900/10 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition text-center group min-h-[160px]"
              >
                <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-8 h-8 text-indigo-500" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Select or drag & drop teacher roster file</span>
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">.xlsx, .xls, or .csv formats</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
              {isImporting && (
                <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 font-bold py-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                  <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Importing records, please wait...
                </div>
              )}
            </div>
          </div>

          {/* Import Results Report */}
          {importReport && (
            <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-6 animate-fade-in">
              <div className="flex justify-between items-center border-b border-slate-850 pb-3">
                <h3 className="text-sm font-black uppercase text-slate-200 tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Import Summary Report
                </h3>
                <button 
                  onClick={() => setImportReport(null)}
                  className="text-xs text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  Clear Report
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl text-center space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">Success</span>
                  <span className="text-2xl font-black text-emerald-405">{importReport.success.length}</span>
                </div>
                <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-xl text-center space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Skipped (Dup)</span>
                  <span className="text-2xl font-black text-amber-400">{importReport.skipped.length}</span>
                </div>
                <div className="bg-rose-950/20 border border-rose-900/30 p-4 rounded-xl text-center space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">Failed / Errors</span>
                  <span className="text-2xl font-black text-rose-405">{importReport.errors.length}</span>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div className="space-y-4">
                {/* Success List */}
                {importReport.success.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-wider font-bold">Successfully Imported Teachers</h4>
                    <div className="max-h-40 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-3 text-xs space-y-1.5 font-medium text-slate-300">
                      {importReport.success.map((t: any) => (
                        <div key={t.id} className="flex justify-between items-center py-1 border-b border-slate-950 last:border-0">
                          <span>{t.name}</span>
                          <span className="font-mono text-[10px] text-slate-500">ID: {t.id} (@{t.username})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skipped List */}
                {importReport.skipped.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-amber-400 tracking-wider font-bold">Skipped Duplicates</h4>
                    <div className="max-h-40 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-3 text-xs space-y-1.5 font-medium text-slate-300">
                      {importReport.skipped.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center py-1 border-b border-slate-950 last:border-0">
                          <span>{t.name || 'Unknown'} <span className="text-[10px] text-slate-500 font-mono">(@{t.username || 'N/A'})</span></span>
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{t.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors List */}
                {importReport.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-rose-400 tracking-wider font-bold">Import Errors & Failures</h4>
                    <div className="max-h-40 overflow-y-auto bg-slate-900/40 rounded-xl border border-slate-900 p-3 text-xs space-y-1.5 font-medium text-slate-300">
                      {importReport.errors.map((t: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-start py-1 border-b border-slate-950 last:border-0 gap-2">
                          <span className="text-[10px] font-bold text-slate-500 font-mono shrink-0">Row {t.rowNum}</span>
                          <span className="flex-1">{t.name || 'N/A'}</span>
                          <span className="text-[10px] text-rose-450 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">{t.error}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
