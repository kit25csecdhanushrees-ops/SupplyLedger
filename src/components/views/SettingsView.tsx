import React, { useRef, useState } from 'react';
import { Download, Moon, RotateCcw, Save, Sun, Upload } from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import { SupportedCurrency } from '../../types';
import { formatCurrency } from '../../domain/businessRules';
import { downloadTextFile } from '../../utils/download';
import { ConfirmDialog } from '../ui/Modal';

export const SettingsView: React.FC = () => {
  const {
    data,
    updateSettings,
    toggleTheme,
    resetDemoData,
    restoreBackupJson,
    addToast,
  } = useStockTrack();

  const { settings } = data;

  const [companyName, setCompanyName] = useState(settings.companyName);
  const [currency, setCurrency] = useState<SupportedCurrency>(settings.currency);
  const [threshold, setThreshold] = useState(String(settings.defaultLowStockThreshold));
  const [backupError, setBackupError] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedThreshold = Math.max(0, Math.floor(Number(threshold) || 0));
    updateSettings({
      companyName: companyName.trim() || 'StockTrack SMB Operations',
      currency,
      defaultLowStockThreshold: parsedThreshold,
    });
  };

  const handleExportBackupJson = () => {
    const jsonString = JSON.stringify(data, null, 2);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `stocktrack_backup_${dateStamp}.json`,
      jsonString,
      'application/json;charset=utf-8;'
    );
    addToast('success', 'JSON backup downloaded', 'Full workspace state exported.');
  };

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const res = restoreBackupJson(reader.result);
        if (!res.ok) {
          setBackupError(res.error || 'Could not restore JSON backup.');
        } else {
          setCompanyName(data.settings.companyName);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure organization identity, currency formatting, low-stock thresholds, and JSON data backups.
        </p>
      </div>

      {/* General & Currency Preferences */}
      <form
        onSubmit={handleSavePreferences}
        className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5"
      >
        <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100">
          Organization &amp; Inventory Defaults
        </h2>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Company / Business Name (printed on Purchase Orders)
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Display Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="INR">INR (₹) — Indian Rupee (e.g. ₹1,25,000)</option>
              <option value="USD">USD ($) — US Dollar</option>
              <option value="EUR">EUR (€) — Euro</option>
              <option value="GBP">GBP (£) — British Pound</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Sample formatting: {formatCurrency(125000, currency)}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Default Low-Stock Threshold
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pre-fills reorder level when creating new SKUs.
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              Interface Theme
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch between crisp daylight mode and high-contrast dark slate mode.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            {settings.theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Switch to Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600" />
                <span>Switch to Dark Mode</span>
              </>
            )}
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>

      {/* JSON Backup & Restore + Reset Demo Data */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-5">
        <div>
          <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100">
            Data Portability &amp; Demo Reset
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            All records persist locally in your browser&apos;s localStorage. Export a full JSON snapshot anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportBackupJson}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Backup</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportBackupFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON Backup</span>
          </button>

          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors whitespace-nowrap shrink-0 sm:ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        </div>

        {backupError && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {backupError}
          </p>
        )}
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={resetDemoData}
        title="Reset Demo Data"
        description="Replace all current products, suppliers, purchase orders, and stock movements with the initial realistic SMB seed dataset? Export a JSON backup first if you want to keep your changes."
        confirmLabel="Reset to Seed Data"
      />
    </div>
  );
};
