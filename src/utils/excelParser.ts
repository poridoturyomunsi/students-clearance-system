import { NamingPattern } from '../types.ts';
import { SCHOOL_CLASSES } from '../data.ts';

// Helper to translate text Ganda/English numerals to digits
function englishWordToDigit(word: string): string {
  const clean = word.trim().toLowerCase();
  const mapping: Record<string, string> = {
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6'
  };
  return mapping[clean] || word;
}

// System defaults for Ugandan schools
export const DEFAULT_NAMING_PATTERNS: NamingPattern[] = [
  {
    id: 'sys-dotted',
    name: 'S.1A Format (Dotted/Spaced)',
    pattern: '^(?:s|senior|s\\.)\\s*([1-6])\\s*\\.?\\s*([a-c]|arts|sciences?|science)?$',
    classGroup: 1,
    streamGroup: 2,
    isSystem: true
  },
  {
    id: 'sys-digits',
    name: 'S1A Format (Joined digits)',
    pattern: '^(?:s|senior)\\s*([1-6])\\s*([a-c]|arts|sciences?|science)?$',
    classGroup: 1,
    streamGroup: 2,
    isSystem: true
  },
  {
    id: 'sys-written',
    name: 'Senior One A Format (Spelled word)',
    pattern: '^senior\\s*(one|two|three|four|five|six)\\s*([a-c]|arts|sciences?|science)?$',
    classGroup: 1,
    streamGroup: 2,
    isSystem: true
  }
];

export interface ParsedClassInfo {
  gradeClass: string; // standard class string: e.g. "S.4 C"
  className: string;  // e.g. "S.4"
  streamName: string; // e.g. "C"
}

/**
 * Parses a sheet name using active patterns and returns standardized class details.
 */
export function parseSheetName(
  sheetName: string,
  patterns: NamingPattern[] = []
): ParsedClassInfo | null {
  if (!sheetName) return null;
  const clean = sheetName.trim().toLowerCase().replace(/\s+/g, ' ');

  // Look through custom administrator patterns first, then system defaults
  const allPatterns = [...patterns, ...DEFAULT_NAMING_PATTERNS];

  for (const pat of allPatterns) {
    try {
      const regex = new RegExp(pat.pattern, 'i');
      const match = clean.match(regex);
      if (match) {
        let rawClass = match[pat.classGroup] || '';
        let rawStream = match[pat.streamGroup] || '';

        // Translate S-class group (e.g. "One" -> "1")
        const classDigit = englishWordToDigit(rawClass);
        if (!['1', '2', '3', '4', '5', '6'].includes(classDigit)) {
          continue; // Match invalid digit, try next pattern
        }

        // Translate and clean stream group
        const streamClean = rawStream.trim().toLowerCase();
        let stream = '';
        if (streamClean.includes('art')) {
          stream = 'Arts';
        } else if (streamClean.includes('science')) {
          stream = 'Sciences';
        } else {
          stream = streamClean.toUpperCase();
        }

        // Construct standardized name based on O/A level stream definitions
        let standardName = '';
        if (['1', '2', '3', '4'].includes(classDigit)) {
          if (!stream || !['A', 'B', 'C'].includes(stream)) {
            stream = 'A'; // default stream fallback
          }
          standardName = `S.${classDigit} ${stream}`;
        } else {
          if (!stream || !['Arts', 'Sciences'].includes(stream)) {
            stream = 'Sciences'; // default stream fallback
          }
          standardName = `S.${classDigit} ${stream}`;
        }

        if (SCHOOL_CLASSES.includes(standardName)) {
          return {
            gradeClass: standardName,
            className: `S.${classDigit}`,
            streamName: stream
          };
        }
      }
    } catch (e) {
      console.error(`Invalid regex naming pattern: ${pat.pattern}`, e);
    }
  }

  return null;
}
