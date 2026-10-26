import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  tone?: 'default' | 'warning' | 'critical' | 'positive';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = 'default',
  onClick,
}) => {
  const valueToneClass =
    tone === 'critical'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-900 dark:text-slate-50';

  const content = (
    <div className="flex flex-col justify-between h-full">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
        {label}
      </span>
      <div className={`mt-2 text-2xl font-display font-bold tracking-tight tabular-nums ${valueToneClass}`}>
        {value}
      </div>
      {subtext && (
        <span className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
          {subtext}
        </span>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
      {content}
    </div>
  );
};
