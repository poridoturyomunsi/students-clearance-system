import React, { useState, useEffect } from 'react';
import { User, Shield, Key, Database, LogOut, CheckCircle2, AlertCircle, RefreshCw, Settings, Sparkles, Eye, EyeOff, Trash2, Download, Play, Save, FileSpreadsheet } from 'lucide-react';
import { 
  saveSettings, 
  fetchSettings, 
  saveGeminiApiKey, 
  testAiConnection,
  fetchBackups,
  runBackup,
  restoreBackup,
  deleteBackup,
  fetchBackupConfig,
  saveBackupConfig,
  calculateRankingsTask,
  getApiBaseUrl
} from '../utils/api.ts';

interface AdminSettingsViewProps {
  authSession: any;
  setAuthSession: React.Dispatch<React.SetStateAction<any>>;
  dbConfig: any;
  handleOpenDbSettings: () => void;
  handleLogout: () => void;
  schoolLogo: string | null;
  handleAddTask: (task: {
    type: 'pdf' | 'report' | 'import' | 'ranking' | 'backup' | 'restore';
    name: string;
    taskId: string;
    total: number;
    targetStudentIds?: string[];
  }) => void;
}

export default function AdminSettingsView({
  authSession,
  setAuthSession,
  dbConfig,
  handleOpenDbSettings,
  handleLogout,
  schoolLogo,
  handleAddTask
}: AdminSettingsViewProps) {
  const [profileForm, setProfileForm] = useState({
    name: authSession?.user?.name || 'System Administrator',
    username: authSession?.user?.username || 'admin',
    password: 'admin123' // Default fallback password representation
  });

  // Database backups states
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [retentionDays, setRetentionDays] = useState(7);
  const [backupConfigSaving, setBackupConfigSaving] = useState(false);
  
  // Rankings states
  const [rankTerm, setRankTerm] = useState('Term 1');
  const [rankYear, setRankYear] = useState(new Date().getFullYear());
  const [rankCompiling, setRankCompiling] = useState(false);

  const loadBackupsData = async () => {
    setBackupsLoading(true);
    try {
      const res = await fetchBackups();
      if (res && res.success) {
        setBackups(res.backups);
      }
    } catch (err) {
      console.warn('Failed to load database backups:', err);
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadBackupConfig = async () => {
    try {
      const res = await fetchBackupConfig();
      if (res) {
        setAutoBackupEnabled(res.autoBackupEnabled);
        setRetentionDays(res.retentionDays);
      }
    } catch (err) {
      console.warn('Failed to load backup config:', err);
    }
  };

  const handleSaveBackupConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackupConfigSaving(true);
    try {
      const res = await saveBackupConfig({ autoBackupEnabled, retentionDays });
      if (res && res.success) {
        setSuccessMsg('Backup configuration saved successfully.');
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save backup config.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setBackupConfigSaving(false);
    }
  };

  const handleRunBackup = async () => {
    try {
      const res = await runBackup();
      if (res && res.success) {
        handleAddTask({
          type: 'backup',
          name: 'Creating database backup (.sql.gz)',
          taskId: res.taskId,
          total: 100
        });
        setSuccessMsg('Backup started in the background.');
        setTimeout(() => setSuccessMsg(null), 4000);
        
        // Wait and refresh backup list
        setTimeout(() => {
          loadBackupsData();
        }, 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start backup.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmed = window.confirm(`WARNING: Restoring backup "${filename}" will overwrite all current database tables. Ensure you have backed up current data if needed. Continue?`);
    if (!confirmed) return;
    try {
      const res = await restoreBackup(filename);
      if (res && res.success) {
        handleAddTask({
          type: 'restore',
          name: `Restoring database from ${filename}`,
          taskId: res.taskId,
          total: 100
        });
        setSuccessMsg('Database restore started in the background.');
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to restore backup.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete backup file "${filename}"?`);
    if (!confirmed) return;
    try {
      const res = await deleteBackup(filename);
      if (res && res.success) {
        setSuccessMsg('Backup file deleted successfully.');
        setTimeout(() => setSuccessMsg(null), 4000);
        loadBackupsData();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete backup.');
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleCalculateRankings = async (e: React.FormEvent) => {
    e.preventDefault();
    setRankCompiling(true);
    try {
      const res = await calculateRankingsTask(rankTerm, rankYear);
      if (res && res.success) {
        handleAddTask({
          type: 'ranking',
          name: `Compiling rankings (Term ${rankTerm}, ${rankYear})`,
          taskId: res.taskId,
          total: 100
        });
        setSuccessMsg('Rankings compilation started in the background.');
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start rankings compilation.');
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setRankCompiling(false);
    }
  };

  // Load backups on mount
  useEffect(() => {
    loadBackupsData();
    loadBackupConfig();
  }, []);
  
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [assessmentText, setAssessmentText] = useState<string>('');
  const [assessmentSaving, setAssessmentSaving] = useState<boolean>(false);

  // AI assistant settings states
  const [aiApiKey, setAiApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<'connected' | 'not_connected' | 'testing' | 'unchecked'>('unchecked');
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);

  const checkAiConnectionStatus = async (key: string) => {
    if (!key) {
      setAiStatus('not_connected');
      setAiStatusMsg('API Key is missing');
      return;
    }
    setAiStatus('testing');
    setAiStatusMsg('Testing API Key connectivity...');
    try {
      const res = await testAiConnection(key);
      if (res && res.success) {
        setAiStatus('connected');
        setAiStatusMsg('Connected to Google Gemini API');
      } else {
        setAiStatus('not_connected');
        setAiStatusMsg(res?.message || 'Connection test failed');
      }
    } catch (err: any) {
      setAiStatus('not_connected');
      setAiStatusMsg(err.message || 'Verification failed');
    }
  };

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    await checkAiConnectionStatus(aiApiKey);
    setAiTesting(false);
  };

  const handleSaveAiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiApiKey.trim()) {
      setErrorMsg('Please enter a valid Gemini API Key.');
      return;
    }
    setAiSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await saveGeminiApiKey(aiApiKey.trim());
      if (res && res.success) {
        setSuccessMsg('Gemini API Key saved successfully to settings.');
        checkAiConnectionStatus(aiApiKey.trim());
      } else {
        setErrorMsg(res?.message || 'Failed to save Gemini API Key.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save Gemini API Key.');
    } finally {
      setAiSaving(false);
    }
  };

  // Load existing profile if any
  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const settingsRes = await fetchSettings();
        if (settingsRes && settingsRes.admin_profile) {
          const profile = JSON.parse(settingsRes.admin_profile);
          if (active) {
            setProfileForm({
              name: profile.name || 'System Administrator',
              username: profile.username || 'admin',
              password: profile.password || 'admin123'
            });
          }
        }
        if (settingsRes && settingsRes.assessment_limits) {
          try {
            const al = typeof settingsRes.assessment_limits === 'string' ? JSON.parse(settingsRes.assessment_limits) : settingsRes.assessment_limits;
            if (active) setAssessmentText(JSON.stringify(al, null, 2));
          } catch (e) {
            if (active) setAssessmentText(String(settingsRes.assessment_limits));
          }
        }
        if (settingsRes && settingsRes.gemini_api_key) {
          if (active) {
            setAiApiKey(settingsRes.gemini_api_key);
            checkAiConnectionStatus(settingsRes.gemini_api_key);
          }
        }
      } catch (err) {
        console.warn('Could not load current admin profile settings:', err);
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, []);

    const handleAssessmentSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAssessmentSaving(true);
      setSuccessMsg(null);
      setErrorMsg(null);
      try {
        let parsed: any = assessmentText;
        try {
          parsed = JSON.parse(assessmentText);
        } catch (err) {
          throw new Error('Assessment limits must be valid JSON.');
        }
        // Basic structure validation
        if (!parsed.olevel || !parsed.uace) {
          throw new Error('Assessment limits must contain `olevel` and `uace` keys.');
        }

        // Enforce maximum boundaries
        if (parsed.olevel) {
          if (parsed.olevel.integration_max > 3) parsed.olevel.integration_max = 3;
          if (parsed.olevel.exam_max > 100) parsed.olevel.exam_max = 100;
        }
        if (parsed.uace) {
          if (parsed.uace.score_max > 100) parsed.uace.score_max = 100;
        }

        await saveSettings({ assessment_limits: JSON.stringify(parsed) });
        setSuccessMsg('Assessment limits saved successfully.');
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to save assessment limits.');
      } finally {
        setAssessmentSaving(false);
      }
    };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name.trim() || !profileForm.username.trim() || !profileForm.password.trim()) {
      setErrorMsg('All profile fields are required.');
      return;
    }

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload = {
        name: profileForm.name.trim(),
        username: profileForm.username.trim().toLowerCase().replace(/\s+/g, ''),
        password: profileForm.password
      };

      // Save to database
      await saveSettings({
        admin_profile: JSON.stringify(payload)
      });

      // Update current active React session
      const updatedSession = {
        ...authSession,
        user: {
          ...authSession.user,
          name: payload.name,
          username: payload.username
        }
      };
      setAuthSession(updatedSession);
      localStorage.setItem('spss_session', JSON.stringify(updatedSession));

      setSuccessMsg('Administrator profile and credentials updated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update credentials. Database may be offline.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-4xl px-4 mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="text-lg font-black uppercase tracking-wider text-slate-200">System Profile &amp; Settings</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Manage administrative credentials, database connection, and local session profiles</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Profile Summary Card */}
        <div className="md:col-span-1 bg-slate-950 border border-slate-850 p-6 rounded-2xl flex flex-col justify-between items-center text-center shadow-lg relative overflow-hidden h-fit">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
          
          <div className="space-y-4 w-full mt-2">
            <div className="w-20 h-20 bg-indigo-950/60 border border-indigo-900/40 rounded-full flex items-center justify-center mx-auto text-3xl font-black text-indigo-400 shadow-inner">
              A
            </div>
            
            <div>
              <h3 className="text-sm font-black text-slate-200 uppercase tracking-tight truncate max-w-full px-2">
                {authSession?.user?.name || 'Administrator'}
              </h3>
              <span className="text-[10px] text-indigo-400 font-mono font-bold tracking-wider uppercase block mt-0.5">
                Role: System Admin
              </span>
              <span className="text-[9px] text-slate-500 font-mono block mt-1">
                @{authSession?.user?.username || 'admin'}
              </span>
            </div>

            <div className="border-t border-slate-850 pt-3 text-left space-y-2 text-[10px] font-semibold text-slate-400">
              <div className="flex justify-between">
                <span>Account Status:</span>
                <span className="text-emerald-400 font-bold uppercase">Active</span>
              </div>
              <div className="flex justify-between">
                <span>Login Level:</span>
                <span className="text-indigo-400 font-bold uppercase">Superuser</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-6 py-2.5 bg-rose-950/45 hover:bg-rose-900 border border-rose-900/30 text-rose-400 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out of Admin
          </button>
        </div>

        {/* Right Side: Configuration & Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Admin Profile Form */}
          <form onSubmit={handleProfileSubmit} className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-indigo-400" /> Admin Credentials Configuration
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Full Display Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                  placeholder="e.g. Principal Headteacher"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Admin Username</label>
                <input
                  type="text"
                  required
                  value={profileForm.username}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                  placeholder="e.g. admin"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Access Password</label>
              <input
                type="password"
                required
                value={profileForm.password}
                onChange={(e) => setProfileForm(prev => ({ ...prev, password: e.target.value }))}
                className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
                placeholder="••••••••••••"
              />
            </div>

            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-550/20 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400 font-semibold animate-fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-550/20 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-rose-400 font-semibold animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end pt-2 border-t border-slate-850">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" /> Save Credentials
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Database Info Card */}
          <div className="bg-slate-955 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-indigo-400" /> Database Connection Information
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[10.5px] font-mono font-semibold text-slate-400">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850">
                <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Database Mode</span>
                <span className="text-indigo-400 font-sans uppercase font-black">
                  Cloud Production
                </span>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-850">
                <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Server URL</span>
                <span className="text-slate-200">
                  {window.location.origin}
                </span>
              </div>
            </div>
          </div>

          {/* Database Backup & Maintenance Card */}
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-6">
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
              <Database className="w-4 h-4 text-indigo-400" /> Database Backup &amp; Recovery
            </h3>

            {/* Config Form */}
            <form onSubmit={handleSaveBackupConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-slate-900/40 p-4 rounded-xl border border-slate-850/60">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Daily Auto-Backup</label>
                <div className="flex items-center gap-3 h-10">
                  <button
                    type="button"
                    onClick={() => setAutoBackupEnabled(!autoBackupEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                      autoBackupEnabled
                        ? 'bg-indigo-650 hover:bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {autoBackupEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <span className="text-[10px] text-slate-500">Back up MySQL database automatically every day</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Retention Period (Days)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 7)}
                    className="w-20 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono text-center focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={backupConfigSaving}
                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-750 disabled:opacity-50 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Settings
                  </button>
                </div>
              </div>
            </form>

            {/* Backups List and manual trigger */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Backup Snapshots (.sql.gz)</span>
                <button
                  type="button"
                  onClick={handleRunBackup}
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-1.5 shadow"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Backup Now
                </button>
              </div>

              {backupsLoading ? (
                <div className="text-center py-6 text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> Loading backups...
                </div>
              ) : backups.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 bg-slate-900/20 rounded-xl border border-dashed border-slate-850">
                  No database backup snapshots found in exports/backups directory.
                </p>
              ) : (
                <div className="border border-slate-850 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-850 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                        <th className="p-3">Filename</th>
                        <th className="p-3">Created</th>
                        <th className="p-3">Size</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/50">
                      {backups.map((backup, idx) => {
                        const dateStr = new Date(backup.createdAt).toLocaleString();
                        const kbSize = (backup.sizeBytes / 1024).toFixed(1);
                        return (
                          <tr key={idx} className="hover:bg-slate-900/30 text-slate-350">
                            <td className="p-3 font-mono text-[10px] truncate max-w-[150px]" title={backup.filename}>
                              {backup.filename}
                            </td>
                            <td className="p-3 text-[10px]">{dateStr}</td>
                            <td className="p-3 text-[10px] font-mono text-indigo-400">{kbSize} KB</td>
                            <td className="p-3 text-right flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleRestoreBackup(backup.filename)}
                                className="p-1 px-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded text-[9px] font-black uppercase cursor-pointer"
                                title="Restore database to this state"
                              >
                                Restore
                              </button>
                              <a
                                href={`${getApiBaseUrl()}/api/admin/backups/download/${backup.filename}`}
                                download={backup.filename}
                                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded cursor-pointer"
                                title="Download backup file"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteBackup(backup.filename)}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-455 border border-rose-550/20 rounded cursor-pointer"
                                title="Delete backup file"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Academic Rankings Pre-Compilation Card */}
          <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" /> Academic Rankings Pre-Compiler
            </h3>
            
            <p className="text-[10px] text-slate-500 leading-normal">
              Pre-calculate student rankings for classes and streams based on their marks score averages. Pre-compiling positions shifts heavy class operations to background processing, enabling O(1) query speeds in portals.
            </p>

            <form onSubmit={handleCalculateRankings} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end bg-slate-900/40 p-4 rounded-xl border border-slate-850/60">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Select Term</label>
                <select
                  value={rankTerm}
                  onChange={(e) => setRankTerm(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Select Year</label>
                <input
                  type="number"
                  value={rankYear}
                  onChange={(e) => setRankYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={rankCompiling}
                className="w-full px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow animate-pulse-slow"
              >
                {rankCompiling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Compiling...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Pre-Compile Ranks
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Gemini AI Settings Card */}
          <form onSubmit={handleSaveAiKey} className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" /> AI Settings &amp; Gemini Configuration
              </h3>
              <div className="flex items-center gap-2">
                {aiStatus === 'connected' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    Connected
                  </span>
                ) : aiStatus === 'testing' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 animate-pulse">
                    Testing...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8.5px] uppercase font-bold tracking-wider bg-rose-500/10 border border-rose-500/25 text-rose-400">
                    Not Connected
                  </span>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-normal">
              Provide a Google Gemini API Key from Google AI Studio to power the St.Paul Intelligence Assistant. The key allows query execution, photo diagnostics, and automated passport enhancement.
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Gemini API Key</label>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 pr-10 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="Paste AI Studio API Key (AIzaSy...)"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 text-slate-500 hover:text-slate-350 cursor-pointer flex items-center justify-center h-full"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {aiStatusMsg && (
              <p className={`text-[9.5px] font-mono font-bold uppercase tracking-wide ${
                aiStatus === 'connected' ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {aiStatus === 'testing' ? 'Testing connection...' : `Status: ${aiStatusMsg}`}
              </p>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2 border-t border-slate-850">
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={aiTesting || !aiApiKey.trim()}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 disabled:opacity-50 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
              >
                {aiTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" /> Test Connection
                  </>
                )}
              </button>
              
              <button
                type="submit"
                disabled={aiSaving || !aiApiKey.trim()}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                {aiSaving ? 'Saving...' : 'Save API Key'}
              </button>
            </div>
          </form>

          {/* Assessment Limits Editor */}
          <form onSubmit={handleAssessmentSubmit} className="bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4 mt-4">
            <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <Settings className="w-4 h-4 text-indigo-400" /> Assessment Limits (JSON)
            </h3>

            <p className="text-[10px] text-slate-500">Edit the `assessment_limits` JSON used for frontend and backend validation. Example keys: <span className="font-mono">olevel</span>, <span className="font-mono">uace</span>.</p>

            <textarea
              value={assessmentText}
              onChange={(e) => setAssessmentText(e.target.value)}
              rows={10}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  // Reset to last loaded
                  (async () => {
                    try {
                      const res = await fetchSettings();
                      if (res && res.assessment_limits) {
                        const al = typeof res.assessment_limits === 'string' ? JSON.parse(res.assessment_limits) : res.assessment_limits;
                        setAssessmentText(JSON.stringify(al, null, 2));
                      } else {
                        setAssessmentText('');
                      }
                    } catch (err) {
                      setAssessmentText('');
                    }
                  })();
                }}
                className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-bold uppercase"
              >
                Reset
              </button>

              <button
                type="submit"
                disabled={assessmentSaving}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white border border-indigo-500 text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer flex items-center gap-2"
              >
                {assessmentSaving ? 'Saving...' : 'Save Assessment Limits'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
