import React, { useMemo } from 'react';

interface BarcodeProps {
  value: string;
  height?: number;
  width?: number;
  showText?: boolean;
}

// Official Code 39 specification lookup table: 'W' for wide, 'N' for narrow.
// There are 5 bars and 4 spaces, interleaved: Bar 1, Space 1, Bar 2, Space 2, Bar 3, Space 3, Bar 4, Space 4, Bar 5
const CODE39_PATTERNS: Record<string, string> = {
  '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
  '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW',
  '8': 'WNNWNNWNN', '9': 'NNWWNNWNN', 'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW',
  'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN',
  'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
  'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
  'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
  'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN', 'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW',
  'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN', 'Z': 'NWWNWNNNN',
  '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '*': 'NWNNWNNWN',
  '$': 'NWNWNWNNN', '/': 'NWNWNNNWN', '+': 'NWNNWNWNN', '%': 'NNWNWNWNN'
};

export default function Barcode({
  value,
  height = 55,
  width = 1.3, // Scale factor for bar width
  showText = true,
}: BarcodeProps) {
  // Process the input string
  const cleanInput = useMemo(() => {
    const formatted = value.toUpperCase().trim();
    // Filter characters to only those supported by Code 39
    let res = '';
    for (let i = 0; i < formatted.length; i++) {
        const char = formatted[i];
        if (CODE39_PATTERNS[char] !== undefined) {
            res += char;
        } else {
            res += '-'; // Substitute unsupported characters
        }
    }
    return `*${res}*`; // Code 39 requires start/stop character '*'
  }, [value]);

  const svgBars = useMemo(() => {
    const narrowWidth = 1;
    const wideWidth = 3;
    const interCharacterGap = 1.5;

    let xPosition = 10; // Start with some margin
    const bars: React.ReactNode[] = [];

    for (let i = 0; i < cleanInput.length; i++) {
      const char = cleanInput[i];
      const codePattern = CODE39_PATTERNS[char];

      if (!codePattern) continue;

      // Draw the 9 elements (5 bars, 4 spaces)
      for (let j = 0; j < 9; j++) {
        const isBar = j % 2 === 0;
        const sizeType = codePattern[j]; // 'W' or 'N'
        const currentElementWidth = (sizeType === 'W' ? wideWidth : narrowWidth) * width;

        if (isBar) {
          // Add black bar SVG element
          bars.push(
            <rect
              key={`bar-${i}-${j}`}
              x={xPosition}
              y={5}
              width={currentElementWidth}
              height={height}
              fill="black"
              shapeRendering="crispEdges"
            />
          );
        }

        // Advance progress x-position
        xPosition += currentElementWidth;
      }

      // Add inter-character gap
      xPosition += interCharacterGap * width;
    }

    return {
      elements: bars,
      totalWidth: xPosition + 10, // Add padding margin
    };
  }, [cleanInput, height, width]);

  return (
    <div className="flex flex-col items-center justify-center p-1 bg-white border border-gray-100 rounded shadow-xs" id={`barcode-container-${value}`}>
      <svg
        width="100%"
        height={height + (showText ? 24 : 10)}
        viewBox={`0 0 ${svgBars.totalWidth} ${height + (showText ? 24 : 10)}`}
        preserveAspectRatio="xMidYMid meet"
        className="max-w-full"
      >
        {svgBars.elements}
        {showText && (
          <text
            x={svgBars.totalWidth / 2}
            y={height + 20}
            textAnchor="middle"
            fill="black"
            fontFamily="monospace"
            fontSize="11"
            className="tracking-[0.1em] select-none"
          >
            {value.toUpperCase()}
          </text>
        )}
      </svg>
    </div>
  );
}
