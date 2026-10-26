import React, { useMemo, useState } from 'react';
import { Download, Plus, RotateCcw } from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import {
  StockMovement,
  StockMovementReason,
  StockMovementType,
} from '../../types';
import { serializeRowsToCsv } from '../../domain/businessRules';
import { downloadTextFile } from '../../utils/download';
import { ColumnDef, DataTable } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { MovementTypeBadge } from '../ui/StatusBadge';
import { StatCard } from '../ui/StatCard';

export const MovementsView: React.FC = () => {
  const {
    data,
    isHydrating,
    adjustProductStock,
    navigateToEntity,
    addToast,
  } = useStockTrack();

  const { stockMovements, products } = data;

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [productFilter, setProductFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Record Manual Movement Modal
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [recProductId, setRecProductId] = useState(() => products[0]?.id ?? '');
  const [recType, setRecType] = useState<StockMovementType>('OUT');
  const [recReason, setRecReason] = useState<StockMovementReason>('Sale');
  const [recQty, setRecQty] = useState('1');
  const [recRef, setRecRef] = useState('');
  const [recNote, setRecNote] = useState('');
  const [recError, setRecError] = useState('');

  const filteredMovements = useMemo(() => {
    return stockMovements
      .filter((m) => {
        if (productFilter !== 'ALL' && m.productId !== productFilter) return false;
        if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;
        if (dateFrom && m.date < dateFrom) return false;
        if (dateTo && m.date > dateTo) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [stockMovements, productFilter, typeFilter, dateFrom, dateTo]);

  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMovements.slice(start, start + pageSize);
  }, [filteredMovements, page]);

  const ledgerStats = useMemo(() => {
    let unitsIn = 0;
    let unitsOut = 0;
    let netAdj = 0;

    for (const m of filteredMovements) {
      if (m.type === 'IN') unitsIn += m.quantity;
      else if (m.type === 'OUT') unitsOut += m.quantity;
      else netAdj += m.quantity;
    }

    return {
      entries: filteredMovements.length,
      unitsIn,
      unitsOut,
      netAdj,
    };
  }, [filteredMovements]);

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'MovementID',
      'SKU',
      'ProductName',
      'Type',
      'Quantity',
      'Unit',
      'Reason',
      'Reference',
      'Note',
    ];
    const rows = filteredMovements.map((m) => {
      const prod = products.find((p) => p.id === m.productId);
      return [
        m.date,
        m.id,
        prod?.SKU ?? m.productId,
        prod?.name ?? 'Unknown Product',
        m.type,
        m.type === 'OUT' ? -m.quantity : m.quantity,
        prod?.unit ?? 'pcs',
        m.reason,
        m.reference,
        m.note,
      ];
    });
    const csv = serializeRowsToCsv(headers, rows);
    downloadTextFile(
      `stocktrack_movements_${new Date().toISOString().slice(0, 10)}.csv`,
      csv
    );
    addToast('success', 'Ledger exported', `Exported ${filteredMovements.length} movement rows.`);
  };

  const handleRecordMovement = (e: React.FormEvent) => {
    e.preventDefault();
    const rawQty = parseInt(recQty, 10);
    if (!recProductId) {
      setRecError('Select a product.');
      return;
    }
    if (!Number.isInteger(rawQty) || rawQty === 0) {
      setRecError('Enter a non-zero whole quantity.');
      return;
    }

    let delta = rawQty;
    if (recType === 'IN') {
      delta = Math.abs(rawQty);
    } else if (recType === 'OUT') {
      delta = -Math.abs(rawQty);
    }

    const res = adjustProductStock({
      productId: recProductId,
      delta,
      type: recType,
      reason: recReason,
      reference: recRef,
      note: recNote,
    });

    if (!res.ok) {
      setRecError(res.error || 'Could not record movement.');
      return;
    }

    setIsRecordOpen(false);
    setRecError('');
  };

  const columns: ColumnDef<StockMovement>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (m) => (
        <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
          {m.date}
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Product & SKU',
      render: (m) => {
        const prod = products.find((p) => p.id === m.productId);
        return (
          <div>
            <button
              type="button"
              onClick={() => {
                if (prod) {
                  navigateToEntity({
                    tab: 'inventory',
                    entityId: prod.id,
                    action: 'view',
                  });
                }
              }}
              className="font-medium text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 text-left"
            >
              {prod?.name ?? m.productId}
            </button>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {prod?.SKU ?? '—'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      render: (m) => <MovementTypeBadge type={m.type} />,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (m) => (
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {m.reason}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity Delta',
      align: 'right',
      render: (m) => {
        const prod = products.find((p) => p.id === m.productId);
        const signed =
          m.type === 'OUT'
            ? `-${m.quantity}`
            : m.type === 'IN'
            ? `+${m.quantity}`
            : m.quantity > 0
            ? `+${m.quantity}`
            : String(m.quantity);
        const color =
          signed.startsWith('+')
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400';

        return (
          <span className={`font-mono text-xs font-semibold tabular-nums ${color}`}>
            {signed} {prod?.unit ?? 'pcs'}
          </span>
        );
      },
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (m) => {
        const isPo = /^PO-\d+/i.test(m.reference);
        return isPo ? (
          <button
            type="button"
            onClick={() =>
              navigateToEntity({
                tab: 'purchase-orders',
                entityId: m.reference,
                action: 'view',
              })
            }
            className="font-mono text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
          >
            {m.reference}
          </button>
        ) : (
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
            {m.reference}
          </span>
        );
      },
    },
    {
      key: 'note',
      header: 'Audit Note',
      render: (m) => (
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {m.note}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Stock Movements Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Complete audit trail of Purchase Order receipts, sales dispatches, returns, and cycle-count adjustments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRecProductId(products[0]?.id ?? '');
              setRecType('OUT');
              setRecReason('Sale');
              setRecQty('1');
              setRecRef('');
              setRecNote('');
              setRecError('');
              setIsRecordOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Log Movement</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Filtered Entries" value={ledgerStats.entries} subtext="Matching audit records" />
        <StatCard
          label="Units Received (IN)"
          value={`+${ledgerStats.unitsIn}`}
          subtext="Purchases & returns"
          tone="positive"
        />
        <StatCard
          label="Units Dispatched (OUT)"
          value={`-${ledgerStats.unitsOut}`}
          subtext="Customer sales & issues"
          tone="warning"
        />
        <StatCard
          label="Net Adjustments"
          value={ledgerStats.netAdj > 0 ? `+${ledgerStats.netAdj}` : ledgerStats.netAdj}
          subtext="Cycle counts & damage"
        />
      </div>

      {/* Filters */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Product
            </label>
            <select
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 max-w-[230px]"
            >
              <option value="ALL">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.SKU} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {(dateFrom || dateTo || productFilter !== 'ALL' || typeFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setProductFilter('ALL');
                setTypeFilter('ALL');
                setPage(1);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg">
          {(['ALL', 'IN', 'OUT', 'ADJUSTMENT'] as const).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => {
                setTypeFilter(tp);
                setPage(1);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                typeFilter === tp
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tp === 'ALL' ? 'All Types' : tp}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger DataTable */}
      <DataTable
        columns={columns}
        data={paginatedMovements}
        rowKey={(m) => m.id}
        isLoading={isHydrating}
        page={page}
        pageSize={pageSize}
        totalItems={filteredMovements.length}
        onPageChange={setPage}
        emptyTitle="No stock movements in range"
        emptyDescription="Widen your date range or log a stock movement."
      />

      {/* Manual Log Movement Modal */}
      <Modal
        isOpen={isRecordOpen}
        onClose={() => setIsRecordOpen(false)}
        title="Log Stock Movement"
        subtitle="Record a sale, return, damage write-off, or manual stock adjustment."
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsRecordOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="record-movement-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              Save Ledger Entry
            </button>
          </>
        }
      >
        <form id="record-movement-form" onSubmit={handleRecordMovement} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Product *
            </label>
            <select
              value={recProductId}
              onChange={(e) => setRecProductId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.SKU} — {p.name} ({p.quantityInStock} {p.unit} on hand)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Movement Type *
              </label>
              <select
                value={recType}
                onChange={(e) => {
                  const next = e.target.value as StockMovementType;
                  setRecType(next);
                  if (next === 'IN') setRecReason('Return');
                  else if (next === 'OUT') setRecReason('Sale');
                  else setRecReason('Correction');
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="OUT">OUT (Deduct)</option>
                <option value="IN">IN (Add)</option>
                <option value="ADJUSTMENT">ADJUSTMENT (+/-)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reason *
              </label>
              <select
                value={recReason}
                onChange={(e) => setRecReason(e.target.value as StockMovementReason)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="Sale">Sale</option>
                <option value="Purchase">Purchase</option>
                <option value="Return">Return</option>
                <option value="Damage">Damage</option>
                <option value="Correction">Correction</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Quantity {recType === 'ADJUSTMENT' ? '(Signed, e.g. -2 or 5)' : '*'}
              </label>
              <input
                type="number"
                step="1"
                value={recQty}
                onChange={(e) => setRecQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reference Code
              </label>
              <input
                type="text"
                value={recRef}
                onChange={(e) => setRecRef(e.target.value)}
                placeholder="SO-1410 / ADJ-04"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Note *
            </label>
            <input
              type="text"
              value={recNote}
              onChange={(e) => setRecNote(e.target.value)}
              placeholder="Explain why stock changed..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          {recError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              {recError}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
};
