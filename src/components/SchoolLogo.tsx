import React from 'react';
import { getApiBaseUrl } from '../utils/api.ts';

// Highly-polished SVG string representing the true St. Paul S.S. Nasuti official logo crest from the uploaded image
const SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">
  <!-- 1. The main outer brown body (comprises both shield top and support pedestal bottom) -->
  <path d="M 10 13 
           C 25 21, 75 21, 90 13
           C 93 38, 88 53, 76 60
           L 84 81 
           L 72 81
           L 66 76
           L 34 76
           L 28 81
           L 16 81
           L 24 60
           C 12 53, 7 38, 10 13 Z" 
         fill="#7C3A2D" stroke="#1E1B4B" stroke-width="1.8" stroke-linejoin="round" />

  <!-- 2. Pedestal internal cutout/support beams (creating the hourglass white triangular negative space) -->
  <path d="M 50 62 L 68 76 L 32 76 Z" fill="#F8FAFC" stroke="#1E1B4B" stroke-width="1.5" stroke-linejoin="round" />
  <!-- Horizontal connector beam of pedestal -->
  <path d="M 28 76 L 72 76" stroke="#1E1B4B" stroke-width="1.8" />
  <path d="M 16 81 L 84 81" stroke="#1E1B4B" stroke-width="2.2" />

  <!-- 3. Inner White Shield (fits in the top part of the brown canvas) -->
  <path d="M 14 17 
           C 25,24 75,24 86 17
           C 87 38, 81 50, 50 63
           C 19 50, 13 38, 14 17 Z" 
         fill="#FFFFFF" stroke="#1E1B4B" stroke-width="1.5" stroke-linejoin="round" />

  <!-- 4. Top Arched Banner inside White Shield for "ST. PAUL S.S NASUTI" -->
  <path d="M 15 19.5 
           C 25,26.5 75,26.5 85 19.5 
           L 83.5 28.5 
           C 74,34.5 26,34.5 16.5 28.5 Z" 
         fill="#1E1B4B" stroke="#1E1B4B" stroke-width="0.5" />
  
  <text x="50" y="27.0" fill="#FFFFFF" font-family="'Inter', system-ui, sans-serif" font-weight="950" font-size="4.2" text-anchor="middle" letter-spacing="0.1">ST. PAUL S.S NASUTI</text>

  <!-- 5. Left Element: Chunky Blue Maltese/Pattee Cross -->
  <g transform="translate(30, 44.5) scale(0.72)">
    <path d="M -2 -1 C -1 -4, -3 -6, -6 -6 L -6 -8 C -3 -8, -1 -10, -2 -13 L 2 -13 C 1 -10, 3 -8, 6 -8 L 6 -6 C 3 -6, 1 -4, 2 -1 L 2 1 C 1 4, 3 6, 6 6 L 6 8 C 3 8, 1 10, 2 13 L -2 13 C -1 10, -3 8, -6 8 L -6 6 C -3 6, -1 4, -2 1 Z" fill="#1E1B4B" />
  </g>

  <!-- 6. Center Element: Open Book with Lit Candle -->
  <g transform="translate(0, -1)">
    <!-- Book pages background white, outline blue -->
    <path d="M 40 55 C 43 52.5, 47 52.5, 50 54.7 C 53 52.5, 57 52.5, 60 55 L 59 47 C 56 45.2, 53 45.2, 50 48 C 47 45.2, 43 45.2, 40 47 Z" fill="#F1F5F9" stroke="#1E1B4B" stroke-width="0.9" stroke-linejoin="round" />
    <line x1="50" y1="48" x2="50" y2="54.7" stroke="#1E1B4B" stroke-width="0.9" />
    
    <!-- Candle stand vertical -->
    <rect x="49" y="38" width="2" height="9.5" fill="#1E1B4B" rx="0.5" />
    <rect x="49.6" y="39" width="0.8" height="6.5" fill="#FFFFFF" rx="0.2" />
    
    <!-- Candle wick and flame -->
    <line x1="50" y1="38" x2="50" y2="36" stroke="#1E1B4B" stroke-width="0.5" />
    <path d="M 50 32 C 48.5 34.2, 50 36, 50 36 C 50 36, 51.5 34.2, 50 32 Z" fill="#F59E0B" stroke="#1E1B4B" stroke-width="0.4" />
    
    <!-- Light rays around flame -->
    <line x1="45.5" y1="33.5" x2="47.5" y2="34.5" stroke="#F59E0B" stroke-width="0.5" stroke-linecap="round" />
    <line x1="54.5" y1="33.5" x2="52.5" y2="34.5" stroke="#F59E0B" stroke-width="0.5" stroke-linecap="round" />
    <line x1="50" y1="29.5" x2="50" y2="31" stroke="#F59E0B" stroke-width="0.5" stroke-linecap="round" />
  </g>

  <!-- 7. Right Element: Diagonal Pen Quill -->
  <path d="M 70 41 L 62.2 54.9 L 60.8 56 L 60.4 54.3 L 62 52.5 M 63 50.3 L 68.5 40.5" stroke="#1E1B4B" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M 70 41 L 64.5 50.7" stroke="#FFFFFF" stroke-width="0.4" />

  <!-- 8. Bottom Scroll Banner with "GOD IS MY GUIDE" -->
  <!-- Banner shadow/folds -->
  <path d="M 9.5 76 L 14.5 85 L 21 80.5 Z" fill="#0B0924" />
  <path d="M 90.5 76 L 85.5 85 L 79 80.5 Z" fill="#0B0924" />

  <!-- Main Scroll path, curving elegantly -->
  <path d="M 6 74 C 28 82, 72 82, 94 74 L 91 84.5 C 72 90.5, 28 90.5, 9 84.5 Z" fill="#1E1B4B" stroke="#F59E0B" stroke-width="1.4" stroke-linejoin="round" />
  <text x="50" y="82.2" fill="#FFFFFF" font-family="'Inter', sans-serif" font-weight="950" font-size="5.2" text-anchor="middle" letter-spacing="0.3">GOD IS MY GUIDE</text>
</svg>`;

// Safely convert SVG string to Base64 in either web browser environment or Node environment
const encodeSvgToBase64 = (svg: string): string => {
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svg)));
    } else if (typeof Buffer !== 'undefined') {
      return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    }
  } catch (e) {
    console.error('Failed to encode default SVG logo:', e);
  }
  // Safe dynamic fallback to keep it working
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
};

export const DEFAULT_SCHOOL_LOGO = encodeSvgToBase64(SVG_MARKUP);

interface SchoolLogoProps {
  className?: string; // custom styling
  logoBase64?: string | null; // optional Base64 uploaded logo
}

export default function SchoolLogo({ className = 'w-7 h-7', logoBase64 }: SchoolLogoProps) {
  const [imgSrc, setImgSrc] = React.useState<string>(DEFAULT_SCHOOL_LOGO);

  React.useEffect(() => {
    if (logoBase64) {
      if (logoBase64.startsWith('data:') || logoBase64.startsWith('http')) {
        setImgSrc(logoBase64);
      } else if (logoBase64.startsWith('/')) {
        const baseUrl = getApiBaseUrl();
        setImgSrc(`${baseUrl}${logoBase64}`);
      } else {
        setImgSrc(logoBase64);
      }
    } else {
      setImgSrc(DEFAULT_SCHOOL_LOGO);
    }
  }, [logoBase64]);

  const handleError = () => {
    if (imgSrc !== DEFAULT_SCHOOL_LOGO) {
      setImgSrc(DEFAULT_SCHOOL_LOGO);
    }
  };

  return (
    <img
      src={imgSrc}
      alt="St. Paul Secondary School Logo"
      referrerPolicy="no-referrer"
      onError={handleError}
      className={`${className} object-contain aspect-square inline-block shrink-0`}
      style={{ 
        imageRendering: 'auto',
        WebkitFontSmoothing: 'antialiased',
        contentVisibility: 'auto'
      } as React.CSSProperties}
      id="school-logo-img"
    />
  );
}
