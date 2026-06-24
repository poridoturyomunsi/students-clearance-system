import React from 'react';

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-800 rounded-lg p-4 ${className}`}>
      <div className="h-6 bg-slate-700 rounded w-3/4 mb-3" />
      <div className="h-3 bg-slate-700 rounded w-1/2 mb-2" />
      <div className="h-24 bg-slate-700 rounded" />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse bg-slate-900 p-3 rounded-lg">
          <div className="h-4 bg-slate-700 rounded w-1/3 mb-2" />
          <div className="h-3 bg-slate-700 rounded w-full" />
        </div>
      ))}
    </div>
  );
}

export default { CardSkeleton, ListSkeleton };
