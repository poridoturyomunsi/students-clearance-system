import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Sliders, Settings, Clock, Check } from 'lucide-react';
import { 
  loadTTSSettings, 
  saveTTSSettings, 
  getAvailableVoices, 
  speechQueue, 
  TTSSettings 
} from '../utils/speechService.ts';

export function TTSSettingsPanel() {
  const [settings, setSettings] = useState<TTSSettings>(loadTTSSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      const vList = getAvailableVoices();
      setVoices(vList);
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const handleChange = <K extends keyof TTSSettings>(key: K, value: TTSSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveTTSSettings({ [key]: value });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestAudio = () => {
    speechQueue.testVoice('Welcome Kato! Audio text to speech is functioning cleanly.');
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-6 shadow-xl text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-850 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
            {settings.enabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </div>
          <div>
            <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
              Audio Speech &amp; Voice Settings
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">Configure Text-to-Speech announcements, voice speed, and late threshold time.</p>
          </div>
        </div>

        {savedSuccess && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400 bg-emerald-950 border border-emerald-800 px-3 py-1 rounded-full animate-fade-in">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enable / Disable Toggle */}
        <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-850">
          <div>
            <label className="text-xs font-black uppercase text-slate-300 block">Enable Audio Voice</label>
            <p className="text-[10px] text-slate-400">Announce student names upon scan</p>
          </div>
          <button
            onClick={() => handleChange('enabled', !settings.enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              settings.enabled ? 'bg-indigo-600' : 'bg-slate-800'
            }`}
          >
            <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              settings.enabled ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Voice Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Speech Voice</label>
          <select
            value={settings.voiceURI || ''}
            onChange={(e) => handleChange('voiceURI', e.target.value || null)}
            disabled={!settings.enabled}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
          >
            <option value="">Default System Voice</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>

        {/* Speech Rate */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-bold uppercase text-slate-400 text-[10px]">Speech Rate (Speed)</label>
            <span className="font-mono text-indigo-400 font-bold">{settings.rate}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={settings.rate}
            onChange={(e) => handleChange('rate', parseFloat(e.target.value))}
            disabled={!settings.enabled}
            className="w-full accent-indigo-500 bg-slate-800 rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-bold uppercase text-slate-400 text-[10px]">Volume Level</label>
            <span className="font-mono text-emerald-400 font-bold">{Math.round(settings.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.05"
            value={settings.volume}
            onChange={(e) => handleChange('volume', parseFloat(e.target.value))}
            disabled={!settings.enabled}
            className="w-full accent-emerald-500 bg-slate-800 rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {/* Pitch */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-bold uppercase text-slate-400 text-[10px]">Pitch</label>
            <span className="font-mono text-amber-400 font-bold">{settings.pitch}</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={settings.pitch}
            onChange={(e) => handleChange('pitch', parseFloat(e.target.value))}
            disabled={!settings.enabled}
            className="w-full accent-amber-500 bg-slate-800 rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {/* Announcement Delay */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-bold uppercase text-slate-400 text-[10px]">Queue Delay Between Scans</label>
            <span className="font-mono text-indigo-400 font-bold">{settings.announcementDelayMs} ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="2000"
            step="50"
            value={settings.announcementDelayMs}
            onChange={(e) => handleChange('announcementDelayMs', parseInt(e.target.value, 10))}
            disabled={!settings.enabled}
            className="w-full accent-indigo-500 bg-slate-800 rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {/* Late Arrival Audio Threshold Time */}
        <div className="space-y-1.5 md:col-span-2 bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-black uppercase text-rose-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Late Check-in Audio Threshold Time
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Students checking in after this time (default <strong>07:45 PM / 19:45</strong>) will trigger the late audio alert: <em>"Welcome [Name]! You have checked in late."</em>
              </p>
            </div>
            <input
              type="time"
              value={settings.lateThresholdTime || '19:45'}
              onChange={(e) => handleChange('lateThresholdTime', e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs outline-none focus:border-rose-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Test Audio Button */}
      <div className="pt-2 border-t border-slate-850 flex justify-end">
        <button
          onClick={handleTestAudio}
          disabled={!settings.enabled}
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-lg flex items-center gap-2 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-white" /> Test Voice Audio
        </button>
      </div>
    </div>
  );
}
