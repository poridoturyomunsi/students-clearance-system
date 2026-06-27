import React from 'react';
import { getApiBaseUrl } from '../utils/api.ts';

export const DEFAULT_SCHOOL_LOGO = '/school_logo.png';

interface SchoolLogoProps {
  className?: string; // custom styling
  logoBase64?: string | null; // optional Base64 uploaded logo
}

// Helper function to resolve logoBase64 to an actual image source synchronously
const resolveLogo = (logo: string | null | undefined): string => {
  if (logo) {
    if (logo.startsWith('data:') || logo.startsWith('http')) {
      return logo;
    } else if (logo.startsWith('/')) {
      const baseUrl = getApiBaseUrl();
      return `${baseUrl}${logo}`;
    } else {
      return logo;
    }
  }
  return DEFAULT_SCHOOL_LOGO;
};

export default function SchoolLogo({ className = 'w-7 h-7', logoBase64 }: SchoolLogoProps) {
  const [imgSrc, setImgSrc] = React.useState<string>(() => resolveLogo(logoBase64));

  React.useEffect(() => {
    setImgSrc(resolveLogo(logoBase64));
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
