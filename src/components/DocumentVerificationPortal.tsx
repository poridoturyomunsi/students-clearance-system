import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Award, Calendar, User, Briefcase, FileText, CheckCircle, RefreshCw } from 'lucide-react';
import { verifyDocumentToken } from '../utils/api.ts';
import ParticleBackground from './ParticleBackground.tsx';

interface VerificationResult {
  success: boolean;
  status: string;
  documentType?: string;
  error?: string;
  metadata?: {
    name: string;
    photo: string | null;
    category?: string;
    department?: string;
    position?: string;
    employmentStatus?: string;
    issueDate?: string;
    expiryDate?: string;
    status?: string;
    [key: string]: any;
  };
}

export default function DocumentVerificationPortal() {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    // Extract token from path: /verify/:token
    const path = window.location.pathname;
    const parts = path.split('/');
    const tokenFromPath = parts[parts.length - 1] || '';
    setToken(tokenFromPath);

    if (tokenFromPath) {
      performVerification(tokenFromPath);
    } else {
      setLoading(false);
    }
  }, []);

  const performVerification = async (verifyToken: string) => {
    setLoading(true);
    try {
      const response = await verifyDocumentToken(verifyToken);
      setResult(response);
    } catch (err: any) {
      setResult({
        success: false,
        status: 'Error',
        error: err.message || 'Failed to complete verification.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen w-full bg-[#05070f] flex flex-col items-center justify-center p-4 font-sans select-none antialiased overflow-hidden">
        <ParticleBackground />
        <div className="z-10 flex flex-col items-center gap-4 bg-[#0a0f24]/50 border border-white/10 backdrop-blur-xl p-8 rounded-2xl shadow-2xl shadow-blue-500/5">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
          <h2 className="text-xl font-semibold text-white/90">Authenticating Document...</h2>
          <p className="text-white/40 text-sm">Verifying digital cryptographic signature</p>
        </div>
      </div>
    );
  }

  const isVerified = result?.success && (result?.status === 'Verified' || result?.status === 'Active');
  const statusLabel = result?.status || 'Unknown';

  return (
    <div className="relative min-h-screen w-full bg-[#05070f] flex flex-col items-center justify-center p-4 font-sans antialiased overflow-y-auto py-12">
      <ParticleBackground />

      <div className="z-10 w-full max-w-lg bg-[#0a0f24]/60 border border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/10">
        
        {/* Status Header */}
        <div className={`p-8 text-center border-b border-white/5 relative overflow-hidden flex flex-col items-center justify-center gap-3 ${
          isVerified 
            ? 'bg-gradient-to-b from-green-500/10 to-transparent' 
            : 'bg-gradient-to-b from-red-500/10 to-transparent'
        }`}>
          {isVerified ? (
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 shadow-lg shadow-green-500/20 animate-pulse">
              <ShieldCheck className="w-12 h-12" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
              <ShieldAlert className="w-12 h-12" />
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">
              {isVerified ? 'VERIFIED DOCUMENT' : 'VERIFICATION FAILED'}
            </h1>
            <p className={`text-xs uppercase tracking-widest font-semibold mt-1 px-3 py-1 rounded-full inline-block ${
              isVerified ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            }`}>
              Status: {statusLabel}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-8 space-y-6">
          {!result || !result.metadata ? (
            <div className="text-center py-6">
              <p className="text-red-400/90 font-medium mb-2">{result?.error || 'Invalid Verification Token'}</p>
              <p className="text-white/40 text-sm max-w-xs mx-auto">
                The QR code scanned does not match any digital credentials registered at SPSS. Please verify the document source.
              </p>
            </div>
          ) : (
            <>
              {/* Photo & Identity Banner */}
              <div className="flex flex-col items-center sm:flex-row sm:items-start gap-5 bg-white/5 border border-white/5 p-5 rounded-2xl">
                {result.metadata.photo ? (
                  <img
                    src={result.metadata.photo}
                    alt={result.metadata.name}
                    className="w-24 h-24 object-cover rounded-xl border border-white/10 bg-[#0d1330] shadow-md"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-white/30">
                    <User className="w-10 h-10" />
                  </div>
                )}
                <div className="text-center sm:text-left space-y-1 py-1">
                  <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">
                    {result.documentType || 'Staff Credential'}
                  </span>
                  <h2 className="text-xl font-bold text-white leading-tight">
                    {result.metadata.name}
                  </h2>
                  <p className="text-white/60 text-sm font-medium">
                    {result.metadata.position || 'N/A'}
                  </p>
                  <p className="text-white/40 text-xs">
                    {result.metadata.department || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Credential Data List */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase font-bold text-white/30 tracking-wider border-b border-white/5 pb-2">
                  Document Metadata
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Award className="w-3.5 h-3.5 text-blue-400" />
                      Category
                    </div>
                    <p className="text-white/90 text-sm font-medium">
                      {result.metadata.category || 'Staff'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                      Status
                    </div>
                    <p className="text-white/90 text-sm font-medium">
                      {result.metadata.employmentStatus || 'Permanent'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      Issue Date
                    </div>
                    <p className="text-white/90 text-sm font-medium">
                      {result.metadata.issueDate || 'N/A'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      Expiry Date
                    </div>
                    <p className="text-white/90 text-sm font-medium">
                      {result.metadata.expiryDate || 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <div className="flex items-center gap-1.5 text-white/40 text-xs">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    Cryptographic Token
                  </div>
                  <p className="text-white/50 text-[10px] font-mono break-all bg-black/30 p-2.5 rounded-lg border border-white/5 select-all">
                    {token}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Card Footer Stamp */}
        <div className="bg-white/5 px-8 py-5 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-white/60">
              Authentic Credential
            </span>
          </div>
          <span className="text-[10px] text-white/30 font-medium">
            SPSS Verification Portal
          </span>
        </div>
      </div>
      
      {/* Branding Link */}
      <p className="z-10 mt-6 text-white/30 text-xs text-center">
        Powered by St Paul Senior Secondary School Digital Clearance Registry System
      </p>
    </div>
  );
}
