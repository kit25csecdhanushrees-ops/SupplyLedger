import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  TrendingDown,
  XCircle,
} from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import { SystemAlert } from '../../types';

export const AlertsPopover: React.FC = () => {
  const { alerts, navigateToEntity } = useStockTrack();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const getAlertIcon = (category: SystemAlert['category']) => {
    switch (category) {
      case 'OUT_OF_STOCK':
        return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />;
      case 'OVERDUE_PO':
        return <Clock className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />;
      case 'LOW_STOCK':
        return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
      case 'POOR_SUPPLIER':
        return <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Alerts and notifications (${alerts.length})`}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      >
        <Bell className="w-4 h-4" />
        {alerts.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-mono font-semibold tabular-nums bg-red-600 text-white rounded-full">
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
              Actionable Alerts
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {alerts.length} active
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200/75 dark:divide-slate-800">
            {alerts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  All clear
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  No stock shortages, overdue purchase orders, or supplier delays.
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => {
                    navigateToEntity({
                      tab: alert.targetTab,
                      entityId: alert.targetEntityId,
                      action: 'view',
                    });
                    setOpen(false);
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                >
                  {getAlertIcon(alert.category)}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                      {alert.description}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
