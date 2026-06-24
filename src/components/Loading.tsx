import React from 'react';

interface LoadingProps {
  message?: string;
}

export default function Loading({ message }: LoadingProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center p-6 gap-3 text-center">
      <div className="spinner" aria-hidden="true" />
      <div className="text-sm text-slate-300">{message || 'Loading...'}</div>
    </div>
  );
}
