import { getFirstName } from '../lib/attendanceStore.ts';

export interface TTSSettings {
  enabled: boolean;
  voiceURI: string | null;
  rate: number; // 0.5 to 2.0
  volume: number; // 0.0 to 1.0
  pitch: number; // 0.5 to 1.5
  announcementDelayMs: number; // 0 to 2000
  lateThresholdTime: string; // e.g. "19:45" (7:45 PM)
}

const DEFAULT_SETTINGS: TTSSettings = {
  enabled: true,
  voiceURI: null,
  rate: 0.90, // Calm, gentle, unhurried rate
  volume: 0.95, // Soft, clear volume
  pitch: 1.08, // Soft, warm feminine pitch
  announcementDelayMs: 300,
  lateThresholdTime: '19:45'
};

const SETTINGS_KEY = 'stpaul_tts_settings_v1';

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load TTS settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveTTSSettings(settings: Partial<TTSSettings>): TTSSettings {
  const current = loadTTSSettings();
  const updated = { ...current, ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save TTS settings to localStorage', e);
  }
  return updated;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.getVoices() || [];
  }
  return [];
}

export function findCalmFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Prioritize calm, soft, natural female voices
  const priorityKeywords = [
    'jenny', 'aria', 'ana', 'zira', 'natural', 
    'google uk english female', 'samantha', 'victoria', 
    'karen', 'moira', 'veena', 'fiona', 'female'
  ];

  for (const kw of priorityKeywords) {
    const found = voices.find(v => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }

  const enFemale = voices.find(v => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira')));
  if (enFemale) return enFemale;

  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

interface QueueItem {
  id: string;
  studentId: string;
  text: string;
  isWelcome: boolean;
  isLate: boolean;
  timestamp: number;
}

class SpeechQueueManager {
  private queue: QueueItem[] = [];
  private isSpeaking = false;
  private recentAnnouncements: Map<string, number> = new Map(); // key -> timestamp

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Chrome requires voice loading callback
      window.speechSynthesis.onvoiceschanged = () => {
        // Voices loaded
      };
    }
  }

  public enqueue(studentId: string, text: string, isWelcome: boolean, isLate: boolean) {
    const now = Date.now();
    const key = `${studentId}:${text}`;

    // Prevent duplicate speech caused by accidental double scans within 5 seconds
    const lastSpoken = this.recentAnnouncements.get(key);
    if (lastSpoken && now - lastSpoken < 5000) {
      console.log(`[TTS] Suppressed duplicate announcement for ${studentId}: "${text}"`);
      return;
    }

    this.recentAnnouncements.set(key, now);

    // Clean up old history entries
    for (const [k, ts] of this.recentAnnouncements.entries()) {
      if (now - ts > 10000) {
        this.recentAnnouncements.delete(k);
      }
    }

    const item: QueueItem = {
      id: Math.random().toString(36).substring(2, 9),
      studentId,
      text,
      isWelcome,
      isLate,
      timestamp: now
    };

    this.queue.push(item);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isSpeaking || this.queue.length === 0) {
      return;
    }

    const settings = loadTTSSettings();
    if (!settings.enabled) {
      this.queue = [];
      return;
    }

    this.isSpeaking = true;
    const item = this.queue.shift()!;

    try {
      await this.speakItem(item, settings);
    } catch (e) {
      console.warn('[TTS] Error speaking item:', e);
    } finally {
      // Delay before next announcement in queue
      setTimeout(() => {
        this.isSpeaking = false;
        this.processQueue();
      }, settings.announcementDelayMs || 300);
    }
  }

  private speakItem(item: QueueItem, settings: TTSSettings): Promise<void> {
    return new Promise((resolve) => {
      // 1. Check Android Native TTS Interface (WebView bridge)
      const win = window as any;
      if (win.AndroidTTS && typeof win.AndroidTTS.speak === 'function') {
        try {
          win.AndroidTTS.speak(item.text);
          setTimeout(resolve, 1500);
          return;
        } catch (err) {
          console.warn('[TTS] AndroidTTS native call failed, falling back to Web Speech API', err);
        }
      }

      // 2. Web Speech API (speechSynthesis)
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel(); // cancel any active low-level browser freeze
          const utterance = new SpeechSynthesisUtterance(item.text);
          utterance.rate = settings.rate;
          utterance.volume = settings.volume;
          utterance.pitch = settings.pitch;

          const voices = getAvailableVoices();
          let targetVoice: SpeechSynthesisVoice | null = null;

          if (settings.voiceURI) {
            targetVoice = voices.find(v => v.voiceURI === settings.voiceURI) || null;
          }

          if (!targetVoice) {
            targetVoice = findCalmFemaleVoice(voices);
          }

          if (targetVoice) {
            utterance.voice = targetVoice;
          }

          let hasResolved = false;
          const finish = () => {
            if (!hasResolved) {
              hasResolved = true;
              resolve();
            }
          };

          utterance.onend = finish;
          utterance.onerror = (e) => {
            console.warn('[TTS] SpeechSynthesis error event:', e);
            this.playFallbackChime(item.isWelcome, item.isLate);
            finish();
          };

          // Timeout safety in case onend never fires
          setTimeout(() => {
            finish();
          }, 6000);

          window.speechSynthesis.speak(utterance);
          return;
        } catch (e) {
          console.warn('[TTS] Web Speech API failed:', e);
        }
      }

      // 3. Fallback Web Audio API chime tone
      this.playFallbackChime(item.isWelcome, item.isLate);
      setTimeout(resolve, 600);
    });
  }

  public playFallbackChime(isWelcome: boolean, isLate: boolean) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isLate) {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
      } else if (isWelcome) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12); // A4
      }

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('[TTS] Fallback chime failed', e);
    }
  }

  public testVoice(sampleText = 'Welcome to St. Paul clearance attendance system.') {
    const settings = loadTTSSettings();
    if (!settings.enabled) return;
    this.enqueue('test_user', sampleText, true, false);
  }
}

export const speechQueue = new SpeechQueueManager();

/**
 * Checks if a given time string or current local Kampala time is beyond lateThresholdTime (default 19:45 / 7:45 PM).
 */
export function isBeyondLateThreshold(timeStr?: string, thresholdStr = '19:45'): boolean {
  try {
    let nowHours = 0;
    let nowMinutes = 0;

    if (timeStr && timeStr.includes(':')) {
      const parts = timeStr.split(':');
      nowHours = parseInt(parts[0], 10);
      nowMinutes = parseInt(parts[1], 10);
    } else {
      const kampalaTimeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Kampala', hour12: false });
      const parts = kampalaTimeStr.split(':');
      nowHours = parseInt(parts[0], 10);
      nowMinutes = parseInt(parts[1], 10);
    }

    const [tHours, tMinutes] = thresholdStr.split(':').map(n => parseInt(n, 10));

    const currentTotalMinutes = nowHours * 60 + nowMinutes;
    const thresholdTotalMinutes = tHours * 60 + tMinutes;

    return currentTotalMinutes > thresholdTotalMinutes;
  } catch (e) {
    return false;
  }
}

/**
 * Formulate and enqueue TTS audio announcement for a student scan.
 */
export function announceScan(
  studentName: string,
  direction: 'clock-in' | 'clock-out' | 'auto',
  timeStr?: string,
  studentId = 'student'
) {
  const settings = loadTTSSettings();
  if (!settings.enabled) return;

  const firstName = getFirstName(studentName);
  const isClockIn = direction === 'clock-in' || direction === 'auto';
  const isLate = isClockIn && isBeyondLateThreshold(timeStr, settings.lateThresholdTime);

  let text = '';
  if (isClockIn) {
    if (isLate) {
      text = `Welcome, ${firstName}! You have checked in late.`;
    } else {
      text = `Welcome, ${firstName}! Have a wonderful and productive day.`;
    }
  } else {
    text = `Goodbye, ${firstName}! Have a safe journey home.`;
  }

  speechQueue.enqueue(studentId, text, isClockIn, isLate);
}
