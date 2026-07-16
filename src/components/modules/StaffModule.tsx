import React, { useEffect, useState, useRef } from 'react';
import { 
  Plus, Edit2, Trash2, Search, Save, X, AlertCircle, CheckCircle2, 
  Upload, Download, FileSpreadsheet, Lock, Camera, Check, RefreshCw, BarChart2, Calendar, FileText, CheckCircle, HelpCircle, User
} from 'lucide-react';
import { Staff, LeaveRequest, TimetableSlot } from '../../types.ts';
import { 
  fetchStaffList, createStaffMember, updateStaffMember, deleteStaffMember, 
  resetStaffPassword, updateStaffStatus, importStaffBulk, fetchAllLeaveRequestsAdmin, 
  updateLeaveRequestAdmin, fetchClassTeachers, saveClassTeacher, fetchSettings
} from '../../utils/api.ts';
import { generateStaffIdCardsPdf } from '../../utils/pdfGenerator.ts';
import * as XLSX from 'xlsx';
import { compressStudentPhoto, compressSignatureImage } from '../../utils/imageProcessor.ts';

export default function StaffModule() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection and Print States
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [printSide, setPrintSide] = useState<'both' | 'front' | 'back'>('both');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printingMembers, setPrintingMembers] = useState<Staff[]>([]);

  const triggerPrintFlow = (members: Staff[]) => {
    setPrintingMembers(members);
    setShowPrintModal(true);
  };

  const handlePrintCards = async () => {
    if (printingMembers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await generateStaffIdCardsPdf({
        staffMembers: printingMembers,
        schoolLogoBase64: settings.schoolLogo,
        printSide: printSide
      });
      doc.save(`staff_id_cards_${printSide}.pdf`);
      setSuccess('PDF Staff ID cards generated successfully.');
      setShowPrintModal(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError('Failed to generate PDF cards: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Tab Management
  const [activeTab, setActiveTab] = useState<'registry' | 'leave' | 'assignments' | 'streamallocation' | 'upload' | 'reports'>('registry');
  
  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterDepartment, setFilterDepartment] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');

  // Reports Summary State
  const [reportsData, setReportsData] = useState<any>({
    totals: [], gender: [], departments: [], status: [], newThisYear: 0
  });

  const [settings, setSettings] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Bulk Upload states
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    employeeNumber: '',
    gender: 'Male',
    dob: '',
    nationalId: '',
    phone: '',
    email: '',
    residentialAddress: '',
    district: '',
    nationality: 'Ugandan',
    religion: '',
    category: 'Teaching' as 'Teaching' | 'Non-Teaching',
    department: 'Science',
    dateAppointed: '',
    employmentStatus: 'Permanent' as 'Permanent' | 'Contract' | 'Temporary' | 'Part-time',
    salaryScale: '',
    qualification: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    position: 'Teacher',
    photo: '',
    signature: '',
    status: 'Active'
  });

  // Selected subjects and classes for Teaching category
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [classList, setClassList] = useState<string[]>([]);
  const [streamList, setStreamList] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  useEffect(() => {
    loadData();
    loadReports();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [staffList, classTeachersList, leaveList, settingsData] = await Promise.all([
        fetchStaffList(),
        fetchClassTeachers(),
        fetchAllLeaveRequestsAdmin(),
        fetchSettings()
      ]);
      setStaff(staffList);
      setClassTeachers(classTeachersList);
      setLeaveRequests(leaveList);
      setSettings(settingsData);
      
      const olevel = settingsData.olevel_subjects ? JSON.parse(settingsData.olevel_subjects) : [];
      const uace = settingsData.uace_subjects ? JSON.parse(settingsData.uace_subjects) : [];
      setSubjectsList(Array.from(new Set([...olevel, ...uace])) as string[]);
      
      setClassList(['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6']);
      setStreamList(['A', 'B', 'C', 'Arts', 'Sciences']);
      setError(null);
    } catch (err: any) {
      setError('Failed to load staff management data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      const res = await fetch('/api/reports/staff');
      if (res.ok) {
        const data = await res.json();
        setReportsData(data);
      }
    } catch (e) {
      console.warn('Failed to load staff reports: ', e);
    }
  };

  const handleOpenCreateForm = () => {
    setEditingStaff(null);
    setFormData({
      firstName: '', middleName: '', lastName: '', employeeNumber: '', gender: 'Male', dob: '',
      nationalId: '', phone: '', email: '', residentialAddress: '', district: '', nationality: 'Ugandan',
      religion: '', category: 'Teaching', department: 'Science', dateAppointed: '',
      employmentStatus: 'Permanent', salaryScale: '', qualification: '', emergencyContactName: '',
      emergencyContactPhone: '', position: 'Teacher', photo: '', signature: '', status: 'Active'
    });
    setSelectedSubjects([]);
    setSelectedClasses([]);
    setShowForm(true);
  };

  const handleOpenEditForm = (item: Staff) => {
    setEditingStaff(item);
    setFormData({
      firstName: item.firstName || '',
      middleName: item.middleName || '',
      lastName: item.lastName || '',
      employeeNumber: item.employeeNumber || '',
      gender: item.gender || 'Male',
      dob: item.dob ? new Date(item.dob).toISOString().split('T')[0] : '',
      nationalId: item.nationalId || '',
      phone: item.phone || '',
      email: item.email || '',
      residentialAddress: item.residentialAddress || '',
      district: item.district || '',
      nationality: item.nationality || 'Ugandan',
      religion: item.religion || '',
      category: item.category,
      department: item.department || '',
      dateAppointed: item.dateAppointed ? new Date(item.dateAppointed).toISOString().split('T')[0] : '',
      employmentStatus: item.employmentStatus || 'Permanent',
      salaryScale: item.salaryScale || '',
      qualification: item.qualification || '',
      emergencyContactName: item.emergencyContactName || '',
      emergencyContactPhone: item.emergencyContactPhone || '',
      position: item.position || '',
      photo: item.photo || '',
      signature: item.signature || '',
      status: item.status || 'Active'
    });
    setSelectedSubjects(item.subjects || []);
    setSelectedClasses(item.classes || []);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Partial<Staff> = {
        ...formData,
        subjects: formData.category === 'Teaching' ? selectedSubjects : [],
        classes: formData.category === 'Teaching' ? selectedClasses : []
      };

      if (editingStaff) {
        await updateStaffMember(editingStaff.id, payload);
        setSuccess('Staff record updated successfully.');
      } else {
        await createStaffMember(payload);
        setSuccess('New staff member registered successfully.');
      }
      setShowForm(false);
      loadData();
      loadReports();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save staff member.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this staff member? This will clear credentials, leave requests, and timetables.')) return;
    try {
      await deleteStaffMember(id);
      setSuccess('Staff member deleted successfully.');
      loadData();
      loadReports();
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError('Delete failed: ' + err.message);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (!window.confirm('Reset password to default "123"? A password change will be forced on their next login.')) return;
    try {
      const res = await resetStaffPassword(id);
      setSuccess(res.message || 'Password reset successfully.');
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError('Password reset failed: ' + err.message);
    }
  };

  const handleLeaveDecision = async (id: number, decision: 'Approved' | 'Rejected') => {
    const remarks = window.prompt(`Add comments / remarks for this ${decision.toLowerCase()} leave request:`);
    if (remarks === null) return; // cancelled
    try {
      await updateLeaveRequestAdmin(id, {
        status: decision,
        remarks: remarks || 'Processed by Administrator'
      });
      setSuccess(`Leave request ${decision.toLowerCase()} successfully.`);
      loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Action failed: ' + err.message);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const compressed = await compressStudentPhoto(base64, 300, 400, 0.85);
      setFormData(prev => ({ ...prev, photo: compressed }));
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const compressed = await compressSignatureImage(base64);
      setFormData(prev => ({ ...prev, signature: compressed }));
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "First Name",
      "Last Name",
      "Category (Teaching/Non-Teaching)",
      "Gender (Male/Female)",
      "Email Address",
      "Phone Number",
      "Position / Job Title",
      "Department",
      "Subject(s) Taught (Teaching Only, comma-split)",
      "Class Teacher (e.g. S.1 A)"
    ];
    const data = [
      headers,
      ["John", "Doe", "Teaching", "Male", "johndoe@spss.edu", "+256701234567", "Senior Tutor", "Mathematics", "Mathematics, Physics", "S.1 A"],
      ["Sarah", "Nansubuga", "Non-Teaching", "Female", "sarah@spss.edu", "+256707654321", "Librarian", "Registry", "", ""]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Staff Template");
    XLSX.writeFile(workbook, "staff_upload_template.xlsx");
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportReport(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const rawRows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      
      const mapped = rawRows.map((row: any, idx: number) => {
        const norm: any = { rowNumber: idx + 2 };
        Object.keys(row).forEach(key => {
          const cleanKey = key.trim().toLowerCase();
          const val = String(row[key]).trim();
          if (cleanKey.includes('first name') || cleanKey === 'first') {
            norm.firstName = val;
          } else if (cleanKey.includes('last name') || cleanKey === 'last') {
            norm.lastName = val;
          } else if (cleanKey.includes('category')) {
            norm.category = /^non/i.test(val) ? 'Non-Teaching' : 'Teaching';
          } else if (cleanKey.includes('gender')) {
            norm.gender = /^f/i.test(val) || /^female/i.test(val) ? 'Female' : 'Male';
          } else if (cleanKey.includes('email')) {
            norm.email = val;
          } else if (cleanKey.includes('phone') || cleanKey.includes('contact')) {
            norm.phone = val;
          } else if (cleanKey.includes('position') || cleanKey.includes('title')) {
            norm.position = val;
          } else if (cleanKey.includes('department') || cleanKey.includes('dept')) {
            norm.department = val;
          } else if (cleanKey.includes('subject')) {
            norm.subjects = val;
          } else if (cleanKey.includes('class teacher') || cleanKey.includes('stream')) {
            norm.classTeacher = val;
          }
        });
        return norm;
      });

      const res = await importStaffBulk(mapped);
      if (res.success) {
        setImportReport(res.report);
        setSuccess('Bulk spreadsheet processed successfully!');
        loadData();
        loadReports();
      } else {
        setError('Failed to process bulk import.');
      }
    } catch (e: any) {
      setError('Import failed: ' + e.message);
    } finally {
      setIsImporting(false);
    }
  };

  const getDepartmentsList = () => {
    return ['Science', 'Humanities', 'Languages', 'Mathematics', 'Administration', 'Registry', 'Sanitation', 'Security', 'Library'];
  };

  // Filter list
  const filteredStaff = staff.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.employeeNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesCategory = filterCategory === 'All' || item.category === filterCategory;
    const matchesDepartment = filterDepartment === 'All' || item.department === filterDepartment;
    const matchesStatus = filterStatus === 'All' || item.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesDepartment && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Tab Menu Header */}
      <div className="bg-slate-950 border border-slate-850 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('registry')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'registry' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Staff Registry</button>
          <button onClick={() => setActiveTab('leave')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'leave' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Leave Registry</button>
          <button onClick={() => setActiveTab('streamallocation')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'streamallocation' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Stream Allocation</button>
          <button onClick={() => setActiveTab('upload')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'upload' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Bulk Import</button>
          <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'reports' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-slate-200'}`}>Reports &amp; Metrics</button>
        </div>

        <button onClick={handleOpenCreateForm} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5">+ Register Staff</button>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-xl flex items-start gap-3 text-rose-350 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-455 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-950/45 border border-emerald-900/60 p-4 rounded-xl flex items-start gap-3 text-emerald-355 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-455 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {/* REGISTRY TAB */}
      {activeTab === 'registry' && !showForm && (
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-6">
          
          {/* Filters Area */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search staff..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none">
              <option value="All">All Categories</option>
              <option value="Teaching">Teaching Staff</option>
              <option value="Non-Teaching">Non-Teaching Staff</option>
            </select>

            <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none">
              <option value="All">All Departments</option>
              {getDepartmentsList().map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none">
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Leave">On Leave</option>
              <option value="Suspended">Suspended</option>
              <option value="Retired">Retired</option>
              <option value="Resigned">Resigned</option>
            </select>
          </div>

          {/* Bulk Selection Actions Banner */}
          {selectedStaffIds.length > 0 && (
            <div className="bg-indigo-950/40 border border-indigo-900/60 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in">
              <span className="text-indigo-300 font-bold font-mono">{selectedStaffIds.length} staff members selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const members = staff.filter(s => selectedStaffIds.includes(s.id));
                    triggerPrintFlow(members);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  Print Selected Cards
                </button>
                <button
                  onClick={() => setSelectedStaffIds([])}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-350 hover:text-slate-200 rounded-lg text-xs font-bold uppercase transition cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Grid list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs leading-normal">
              <thead>
                <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={filteredStaff.length > 0 && selectedStaffIds.length === filteredStaff.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStaffIds(filteredStaff.map(s => s.id));
                        else setSelectedStaffIds([]);
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">Photo</th>
                  <th className="py-3 px-3">Staff Details</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Employment Details</th>
                  <th className="py-3 px-3">Registry Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50">
                {filteredStaff.map(item => (
                  <tr key={item.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedStaffIds.includes(item.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedStaffIds(prev => [...prev, item.id]);
                          else setSelectedStaffIds(prev => prev.filter(id => id !== item.id));
                        }}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-10 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow">
                        {item.photo ? (
                          <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-slate-700" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <p className="text-slate-200 font-bold uppercase">{item.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.id} | {item.username}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                        item.category === 'Teaching' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/40' : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-350">
                      <p className="font-bold text-slate-300">{item.position}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{item.department || 'N/A'} | {item.employmentStatus}</p>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                        item.status === 'Active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/30' :
                        item.status === 'On Leave' ? 'bg-amber-955 bg-amber-950 text-amber-400 border border-amber-900/30' :
                        'bg-rose-950 text-rose-400 border border-rose-900/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex justify-end gap-1.5 font-sans">
                        <button onClick={() => triggerPrintFlow([item])} className="px-2.5 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-400 border border-indigo-900/40 rounded text-[9px] font-bold uppercase transition">
                          Print Card
                        </button>
                        <button onClick={() => handleOpenEditForm(item)} className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded text-[9px] font-bold uppercase transition">
                          Edit
                        </button>
                        <button onClick={() => handleResetPassword(item.id)} className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-amber-500 hover:text-amber-450 border border-slate-800 rounded text-[9px] font-bold uppercase transition">
                          Reset PW
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-950 text-rose-400 border border-rose-900/30 rounded text-[9px] font-bold uppercase transition">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-black uppercase tracking-wider text-xs">No staff member records matching query.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORM CREATE/EDIT VIEW */}
      {showForm && (
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <h3 className="text-base font-black text-indigo-400 uppercase tracking-wide">
              {editingStaff ? `Edit Staff Profile: ${editingStaff.id}` : 'Register New Staff Member'}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left Upload Image & Signature */}
            <div className="md:col-span-1 space-y-6 text-center">
              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Passport Photo</span>
                <div className="w-32 h-40 bg-slate-900 border border-slate-800 rounded-2xl mx-auto overflow-hidden flex items-center justify-center relative group shadow-inner">
                  {formData.photo ? (
                    <img src={formData.photo} alt="Passport photo" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-slate-700" />
                  )}
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                    <Camera className="w-6 h-6 text-white" />
                    <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Authorized Signature</span>
                <div className="w-32 h-16 bg-slate-900 border border-slate-800 rounded-xl mx-auto overflow-hidden flex items-center justify-center relative group shadow-inner">
                  {formData.signature ? (
                    <img src={formData.signature} alt="Authorized signature" className="w-full h-full object-contain p-1" />
                  ) : (
                    <FileText className="w-6 h-6 text-slate-700" />
                  )}
                  <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-pointer">
                    <Camera className="w-4 h-4 text-white" />
                    <input type="file" accept="image/*" onChange={handleSignatureSelect} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {/* Right Fields Grid */}
            <div className="md:col-span-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">First Name</label>
                  <input type="text" value={formData.firstName} onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Middle Name</label>
                  <input type="text" value={formData.middleName} onChange={e => setFormData(prev => ({ ...prev, middleName: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Last Name</label>
                  <input type="text" value={formData.lastName} onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Staff Category</label>
                  <select value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as any }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    <option value="Teaching">Teaching Staff</option>
                    <option value="Non-Teaching">Non-Teaching Staff</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Position / Job Title</label>
                  <input type="text" value={formData.position} onChange={e => setFormData(prev => ({ ...prev, position: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Department</label>
                  <select value={formData.department} onChange={e => setFormData(prev => ({ ...prev, department: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    {getDepartmentsList().map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Gender</label>
                  <select value={formData.gender} onChange={e => setFormData(prev => ({ ...prev, gender: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Date of Birth</label>
                  <input type="date" value={formData.dob} onChange={e => setFormData(prev => ({ ...prev, dob: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">National ID / NIN</label>
                  <input type="text" value={formData.nationalId} onChange={e => setFormData(prev => ({ ...prev, nationalId: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Employee Number (Optional)</label>
                  <input type="text" value={formData.employeeNumber} onChange={e => setFormData(prev => ({ ...prev, employeeNumber: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Phone Number</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Email Address</label>
                  <input type="email" value={formData.email} onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Employment Status</label>
                  <select value={formData.employmentStatus} onChange={e => setFormData(prev => ({ ...prev, employmentStatus: e.target.value as any }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                    <option value="Temporary">Temporary</option>
                    <option value="Part-time">Part-time</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Date Appointed</label>
                  <input type="date" value={formData.dateAppointed} onChange={e => setFormData(prev => ({ ...prev, dateAppointed: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">District</label>
                  <input type="text" value={formData.district} onChange={e => setFormData(prev => ({ ...prev, district: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-850 pt-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Residential Address</label>
                  <input type="text" value={formData.residentialAddress} onChange={e => setFormData(prev => ({ ...prev, residentialAddress: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Qualification</label>
                  <input type="text" value={formData.qualification} onChange={e => setFormData(prev => ({ ...prev, qualification: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="e.g. Master of Education" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Emergency Contact Name</label>
                  <input type="text" value={formData.emergencyContactName} onChange={e => setFormData(prev => ({ ...prev, emergencyContactName: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Emergency Phone</label>
                  <input type="text" value={formData.emergencyContactPhone} onChange={e => setFormData(prev => ({ ...prev, emergencyContactPhone: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Username</label>
                  <input type="text" value={formData.username} onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider block">Default Password {editingStaff ? '(Leave empty to keep current)' : '(Required)'}</label>
                  <input type="password" value={formData.password} onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" placeholder={editingStaff ? 'Enter to reset password' : 'Default password is 123'} />
                </div>
              </div>

              {/* Teaching Staff subjects selection */}
              {formData.category === 'Teaching' && (
                <div className="space-y-3 border-t border-slate-850 pt-4">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Subjects and Classes Assigned</span>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Classes Assigned</span>
                      <div className="max-h-32 overflow-y-auto bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1">
                        {classList.map(cls => (
                          <label key={cls} className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={selectedClasses.includes(cls)}
                              onChange={e => {
                                if (e.target.checked) setSelectedClasses(prev => [...prev, cls]);
                                else setSelectedClasses(prev => prev.filter(c => c !== cls));
                              }}
                            />
                            {cls}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[9px] text-slate-400 font-bold uppercase block">Subjects Assigned</span>
                      <div className="max-h-32 overflow-y-auto bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1">
                        {subjectsList.map(sub => (
                          <label key={sub} className="flex items-center gap-2 text-xs text-slate-350">
                            <input
                              type="checkbox"
                              checked={selectedSubjects.includes(sub)}
                              onChange={e => {
                                if (e.target.checked) setSelectedSubjects(prev => [...prev, sub]);
                                else setSelectedSubjects(prev => prev.filter(s => s !== sub));
                              }}
                            />
                            {sub}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-850">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-850 rounded-xl text-xs font-bold uppercase transition">Cancel</button>
                <button type="button" onClick={handleSave} disabled={loading} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition">Save Record</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE REGISTRY TAB */}
      {activeTab === 'leave' && (
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-4">
          <div>
            <h3 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> Pending Leave of Absence Requests
            </h3>
            <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Approve or reject leave requests with administrative reviews</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs leading-normal">
              <thead>
                <tr className="text-slate-500 font-bold uppercase text-[9px] font-mono border-b border-slate-850">
                  <th className="py-2.5 px-3">Staff Details</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Leave Type</th>
                  <th className="py-2.5 px-3">Date Range</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Current Status</th>
                  <th className="py-2.5 px-3 text-center">Admin action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50">
                {leaveRequests.map((lr) => (
                  <tr key={lr.id} className="hover:bg-slate-900/40 transition font-mono">
                    <td className="py-3.5 px-3">
                      <p className="font-bold text-slate-200 font-sans uppercase">{lr.staff_name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{lr.staff_id} | {lr.staff_position}</p>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                        lr.staff_category === 'Teaching' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/30' : 'bg-slate-900 text-slate-450 border border-slate-800'
                      }`}>
                        {lr.staff_category}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-200 font-sans font-bold uppercase">{lr.leave_type}</td>
                    <td className="py-3.5 px-3 text-indigo-400 font-bold">{new Date(lr.start_date).toLocaleDateString()} - {new Date(lr.end_date).toLocaleDateString()}</td>
                    <td className="py-3.5 px-3 text-slate-350 font-sans max-w-xs truncate" title={lr.reason}>{lr.reason}</td>
                    <td className="py-3.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border ${
                        lr.status === 'Approved' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/30' :
                        lr.status === 'Rejected' ? 'bg-rose-950 text-rose-400 border-rose-900/30' :
                        'bg-slate-900 text-slate-450 border-slate-850 animate-pulse'
                      }`}>
                        {lr.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {lr.status === 'Pending' ? (
                        <div className="flex justify-center gap-1.5 font-sans">
                          <button onClick={() => handleLeaveDecision(lr.id!, 'Approved')} className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-450 border border-emerald-900/50 rounded text-[9.5px] font-bold uppercase transition">Approve</button>
                          <button onClick={() => handleLeaveDecision(lr.id!, 'Rejected')} className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 text-rose-450 border border-rose-900/50 rounded text-[9.5px] font-bold uppercase transition">Reject</button>
                        </div>
                      ) : (
                        <span className="text-slate-600 font-sans italic text-[11px]">{lr.remarks || 'Reviewed.'}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {leaveRequests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-bold uppercase">No leave request logs registered.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STREAM ALLOCATION TAB */}
      {activeTab === 'streamallocation' && (
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-6">
          <div>
            <h3 className="text-base font-black text-indigo-400 uppercase tracking-tight">Stream Class Teacher Allocation</h3>
            <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Assign primary classroom advisors to specific class streams</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['S.1', 'S.2', 'S.3', 'S.4', 'S.5', 'S.6'].map((grade) => {
              const streams = grade.startsWith('S.5') || grade.startsWith('S.6') ? ['Sciences', 'Arts'] : ['A', 'B', 'C'];
              return (
                <div key={grade} className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-3">
                  <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850 pb-2">{grade} Streams</h4>
                  <div className="space-y-3">
                    {streams.map((stream) => {
                      const streamClass = `${grade} ${stream}`;
                      const currentAssign = classTeachers.find(ct => ct.grade_class === streamClass);
                      return (
                        <div key={stream} className="flex flex-col gap-1 text-xs">
                          <span className="text-[10px] font-bold text-slate-550 block font-mono">{streamClass} Class Teacher</span>
                          <select
                            value={currentAssign?.teacher_id || ''}
                            onChange={async (e) => {
                              try {
                                await saveClassTeacher(streamClass, e.target.value || null);
                                setSuccess(`Updated stream ${streamClass} class teacher.`);
                                loadData();
                                setTimeout(() => setSuccess(null), 3000);
                              } catch (err: any) {
                                setError('Update failed: ' + err.message);
                              }
                            }}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 text-slate-200"
                          >
                            <option value="">No Class Teacher Assigned</option>
                            {staff.filter(s => s.category === 'Teaching').map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BULK IMPORT TAB */}
      {activeTab === 'upload' && (
        <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <div>
              <h3 className="text-base font-black text-indigo-400 uppercase tracking-tight flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Excel Spreadsheet Bulk Import
              </h3>
              <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Register dozens of teaching and administrative staff simultaneously</p>
            </div>
            
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-200 hover:border-slate-700 rounded-xl text-xs font-bold uppercase transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Download Template
            </button>
          </div>

          <div className="bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4">
            <Upload className="w-12 h-12 text-indigo-500/80" />
            <div>
              <h4 className="text-sm font-bold text-slate-200">Drag &amp; drop Excel template or browse files</h4>
              <p className="text-[10px] text-slate-500 mt-1 max-w-sm">Accepted extensions: Excel workbook (.xlsx, .xls) and CSV (.csv). Ensure column headings match the template layout.</p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-lg shadow-indigo-500/20"
            >
              {isImporting ? 'Processing File...' : 'Upload Excel Sheet'}
            </button>
            <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          </div>

          {importReport && (
            <div className="bg-slate-900/50 border border-slate-850 p-5 rounded-2xl space-y-4">
              <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Spreadsheet Processing Report</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Registered</span>
                  <span className="text-xl font-black text-emerald-450 block mt-1">{importReport.success.length}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Skipped / Duplicates</span>
                  <span className="text-xl font-black text-amber-500 block mt-1">{importReport.skipped.length}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Validation Errors</span>
                  <span className="text-xl font-black text-rose-500 block mt-1">{importReport.errors.length}</span>
                </div>
              </div>

              {importReport.errors.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] text-rose-400 font-black block uppercase">Validation Errors Log:</span>
                  <div className="max-h-32 overflow-y-auto bg-slate-950 p-3 rounded-xl border border-slate-850 text-[10px] text-slate-400 font-mono space-y-1">
                    {importReport.errors.map((e: any, idx: number) => (
                      <p key={idx}><span className="text-rose-500">Row {e.rowNum}:</span> {e.error} ({e.name})</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-fade-in">
          {/* Stats Counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-550 font-black uppercase tracking-wider block font-mono">Teaching Staff</span>
                <span className="text-2xl font-black text-slate-200 block mt-1">
                  {reportsData.totals.find((t: any) => t.category === 'Teaching')?.count || 0}
                </span>
              </div>
              <BarChart2 className="w-8 h-8 text-indigo-500/20" />
            </div>

            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-550 font-black uppercase tracking-wider block font-mono">Non-Teaching Staff</span>
                <span className="text-2xl font-black text-slate-200 block mt-1">
                  {reportsData.totals.find((t: any) => t.category === 'Non-Teaching')?.count || 0}
                </span>
              </div>
              <BarChart2 className="w-8 h-8 text-emerald-500/20" />
            </div>

            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-550 font-black uppercase tracking-wider block font-mono">On Leave Status</span>
                <span className="text-2xl font-black text-amber-500 block mt-1 font-mono">
                  {reportsData.status.find((t: any) => t.status === 'On Leave')?.count || 0}
                </span>
              </div>
              <Calendar className="w-8 h-8 text-amber-500/20" />
            </div>

            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-xl flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-550 font-black uppercase tracking-wider block font-mono">Joined This Year</span>
                <span className="text-2xl font-black text-indigo-400 block mt-1 font-mono">{reportsData.newThisYear}</span>
              </div>
              <Plus className="w-8 h-8 text-indigo-400/20" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Gender Breakdown Card */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-4">
              <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850 pb-2">Gender Demographics</h4>
              <div className="space-y-3 text-xs">
                {reportsData.gender.map((g: any) => (
                  <div key={g.gender} className="flex justify-between items-center bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <span className="font-bold text-slate-350">{g.gender || 'Unknown'}</span>
                    <span className="font-black text-slate-200">{g.count} Members</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Department Breakdown Card */}
            <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl shadow-xl space-y-4">
              <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider border-b border-slate-850 pb-2">Department Allocation</h4>
              <div className="max-h-48 overflow-y-auto space-y-2.5 text-xs pr-1">
                {reportsData.departments.map((d: any) => (
                  <div key={d.department} className="flex justify-between items-center bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                    <span className="font-bold text-slate-350">{d.department || 'Not Assigned'}</span>
                    <span className="font-black text-slate-200">{d.count} Members</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* PRINT SIDE SELECTION MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in no-print">
          <div className="w-full max-w-sm bg-[#0a0f24] border border-white/10 p-6 rounded-2xl shadow-2xl relative">
            <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider mb-4">Print ID Cards Layout</h3>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase font-black tracking-wider block">Print Side(s)</label>
                <select 
                  value={printSide} 
                  onChange={e => setPrintSide(e.target.value as any)} 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                >
                  <option value="both">Front &amp; Back Paired Sheets</option>
                  <option value="front">Front Side Only</option>
                  <option value="back">Back Side Only</option>
                </select>
              </div>

              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/60 text-[10px] text-slate-400 space-y-1.5 font-medium">
                <p>• Renders as standard CR80 size (90mm x 58mm).</p>
                <p>• Includes Code 39 Barcodes and QR verification code tags.</p>
                <p>• Generates standard crop guides separating rows/columns.</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowPrintModal(false)} 
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-xl text-xs font-bold uppercase transition"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handlePrintCards} 
                  disabled={loading} 
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                >
                  {loading ? 'Generating...' : 'Download PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
