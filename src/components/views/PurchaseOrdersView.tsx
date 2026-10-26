import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Download,
  Eye,
  PackageCheck,
  Plus,
  Printer,
  Search,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { useStockTrack } from '../../store/StockTrackContext';
import { PurchaseOrder, PurchaseOrderStatus } from '../../types';
import { formatCurrency } from '../../domain/businessRules';
import { downloadPurchaseOrderPdf } from '../../utils/download';
import { ColumnDef, DataTable } from '../ui/DataTable';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { PoStatusBadge } from '../ui/StatusBadge';
import { StatCard } from '../ui/StatCard';

interface DraftLineItem {
  productId: string;
  quantity: string;
  unitPrice: string;
}

export const PurchaseOrdersView: React.FC = () => {
  const {
    purchaseOrders,
    suppliers,
    products,
    companyName,
    currency,
    isHydrating,
    stats,
    reorderSuggestions,
    getSupplierAutoPrice,
    checkOverdue,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    autoGenerateReorderDrafts,
  } = usePurchaseOrders();

  const { deepLink, clearDeepLink, navigateToEntity } = useStockTrack();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // Create PO Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poStatus, setPoStatus] = useState<'Draft' | 'Sent'>('Draft');
  const [poOrderDate, setPoOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<DraftLineItem[]>([]);
  const [poFormError, setPoFormError] = useState('');

  // Receive Stock Modal State
  const [receivingPo, setReceivingPo] = useState<PurchaseOrder | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({});
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveNote, setReceiveNote] = useState('');

  // Cancel PO Confirmation
  const [cancellingPo, setCancellingPo] = useState<PurchaseOrder | null>(null);

  const computeExpectedDateForSupplier = (supplierId: string, baseDateStr: string) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    const d = new Date(baseDateStr || new Date().toISOString().slice(0, 10));
    d.setDate(d.getDate() + (sup?.leadTimeDays ?? 5));
    return d.toISOString().slice(0, 10);
  };

  const openNewPoModal = (preset?: {
    supplierId?: string;
    productId?: string;
    unitPrice?: number;
  }) => {
    const activeSuppliers = suppliers.filter((s) => s.status === 'Active');
    const chosenSupId =
      preset?.supplierId && suppliers.some((s) => s.id === preset.supplierId)
        ? preset.supplierId
        : activeSuppliers[0]?.id ?? suppliers[0]?.id ?? '';

    const today = new Date().toISOString().slice(0, 10);
    setPoSupplierId(chosenSupId);
    setPoStatus('Draft');
    setPoOrderDate(today);
    setPoExpectedDate(computeExpectedDateForSupplier(chosenSupId, today));
    setPoNotes('');
    setPoFormError('');

    if (preset?.productId) {
      const prod = products.find((p) => p.id === preset.productId);
      const auto = getSupplierAutoPrice(chosenSupId, preset.productId);
      const defaultQty = Math.max(prod?.reorderQuantity ?? 10, auto.minOrderQty);
      setPoLines([
        {
          productId: preset.productId,
          quantity: String(defaultQty),
          unitPrice: String(preset.unitPrice ?? auto.unitPrice),
        },
      ]);
    } else if (products.length > 0) {
      const firstProd =
        products.find((p) => p.preferredSupplierId === chosenSupId) ?? products[0];
      const auto = getSupplierAutoPrice(chosenSupId, firstProd.id);
      setPoLines([
        {
          productId: firstProd.id,
          quantity: String(Math.max(firstProd.reorderQuantity || 10, auto.minOrderQty)),
          unitPrice: String(auto.unitPrice),
        },
      ]);
    } else {
      setPoLines([]);
    }

    setIsCreateOpen(true);
  };

  // Handle deep-linking from Dashboard ("Create PO" shortcut), Inventory, Suppliers, or Header Alerts
  useEffect(() => {
    if (deepLink && deepLink.tab === 'purchase-orders') {
      if (deepLink.action === 'create-po-for-product') {
        openNewPoModal({
          supplierId: deepLink.supplierId,
          productId: deepLink.productId,
          unitPrice: deepLink.unitPrice,
        });
      } else if (deepLink.action === 'create-po-for-supplier') {
        openNewPoModal({ supplierId: deepLink.supplierId });
      } else if (deepLink.entityId) {
        setSelectedPoId(deepLink.entityId);
      }
      clearDeepLink();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink, clearDeepLink]);

  const handleSupplierChangeInModal = (nextSupplierId: string) => {
    setPoSupplierId(nextSupplierId);
    setPoExpectedDate(computeExpectedDateForSupplier(nextSupplierId, poOrderDate));
    // Refresh unit prices automatically using the newly selected supplier's catalog price
    setPoLines((prev) =>
      prev.map((line) => {
        const auto = getSupplierAutoPrice(nextSupplierId, line.productId);
        return {
          ...line,
          unitPrice: String(auto.unitPrice),
        };
      })
    );
  };

  const handleAddPoLine = () => {
    const unusedProduct =
      products.find((p) => !poLines.some((l) => l.productId === p.id)) ?? products[0];
    if (!unusedProduct) return;
    const auto = getSupplierAutoPrice(poSupplierId, unusedProduct.id);
    setPoLines((prev) => [
      ...prev,
      {
        productId: unusedProduct.id,
        quantity: String(Math.max(unusedProduct.reorderQuantity || 10, auto.minOrderQty)),
        unitPrice: String(auto.unitPrice),
      },
    ]);
  };

  const handleChangePoLineProduct = (index: number, nextProductId: string) => {
    const prod = products.find((p) => p.id === nextProductId);
    const auto = getSupplierAutoPrice(poSupplierId, nextProductId);
    setPoLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              productId: nextProductId,
              quantity: String(Math.max(prod?.reorderQuantity ?? 10, auto.minOrderQty)),
              unitPrice: String(auto.unitPrice),
            }
          : line
      )
    );
  };

  const draftTotalAmount = useMemo(() => {
    return poLines.reduce((sum, line) => {
      const q = Math.max(0, Number(line.quantity) || 0);
      const p = Math.max(0, Number(line.unitPrice) || 0);
      return sum + q * p;
    }, 0);
  }, [poLines]);

  const handleSubmitNewPo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplierId) {
      setPoFormError('Please select a supplier.');
      return;
    }
    if (poLines.length === 0) {
      setPoFormError('Add at least one product line item.');
      return;
    }

    const mergedMap = new Map<string, { quantity: number; unitPrice: number }>();
    for (const line of poLines) {
      const qty = Math.floor(Number(line.quantity));
      const price = Number(line.unitPrice);
      if (!line.productId || !Number.isInteger(qty) || qty <= 0) {
        setPoFormError('All line quantities must be whole numbers >= 1.');
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        setPoFormError('Unit prices cannot be negative.');
        return;
      }
      const existing = mergedMap.get(line.productId);
      if (existing) {
        existing.quantity += qty;
        existing.unitPrice = price;
      } else {
        mergedMap.set(line.productId, { quantity: qty, unitPrice: price });
      }
    }

    const created = createPurchaseOrder({
      supplierId: poSupplierId,
      items: Array.from(mergedMap.entries()).map(([productId, val]) => ({
        productId,
        quantity: val.quantity,
        unitPrice: val.unitPrice,
        receivedQuantity: 0,
      })),
      status: poStatus,
      orderDate: poOrderDate,
      expectedDate: poExpectedDate || poOrderDate,
      notes: poNotes.trim(),
    });

    setIsCreateOpen(false);
    setSelectedPoId(created.id);
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    const defaults: Record<string, string> = {};
    for (const item of po.items) {
      const remaining = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
      defaults[item.productId] = String(remaining);
    }
    setReceivingPo(po);
    setReceiveInputs(defaults);
    setReceiveDate(new Date().toISOString().slice(0, 10));
    setReceiveNote('');
  };

  const handleConfirmReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;
    const numericMap: Record<string, number> = {};
    for (const [productId, val] of Object.entries(receiveInputs)) {
      numericMap[productId] = Math.max(0, Math.floor(Number(val) || 0));
    }
    receivePurchaseOrder(receivingPo.id, numericMap, receiveDate, receiveNote);
    setReceivingPo(null);
  };

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (statusFilter !== 'ALL' && po.status !== statusFilter) return false;
      if (q) {
        const supName =
          suppliers.find((s) => s.id === po.supplierId)?.name.toLowerCase() ?? '';
        const matches =
          po.id.toLowerCase().includes(q) ||
          supName.includes(q) ||
          po.notes.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [purchaseOrders, suppliers, search, statusFilter]);

  const selectedPo = useMemo(
    () => purchaseOrders.find((po) => po.id === selectedPoId) ?? null,
    [purchaseOrders, selectedPoId]
  );

  // --- Printable / Detailed PO View ---
  if (selectedPo) {
    const supplier = suppliers.find((s) => s.id === selectedPo.supplierId);
    const isOverdue = checkOverdue(selectedPo);
    const canSend = selectedPo.status === 'Draft';
    const canReceive =
      selectedPo.status === 'Sent' ||
      selectedPo.status === 'Partially Received' ||
      selectedPo.status === 'Draft';
    const canCancel =
      selectedPo.status === 'Draft' || selectedPo.status === 'Sent';

    return (
      <div className="space-y-6">
        {/* Action Bar (hidden when printing) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <div>
            <button
              type="button"
              onClick={() => setSelectedPoId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Purchase Orders</span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-display font-mono font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {selectedPo.id}
              </h1>
              <PoStatusBadge status={selectedPo.status} isOverdue={isOverdue} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canSend && (
              <button
                type="button"
                onClick={() => updatePurchaseOrderStatus(selectedPo.id, 'Sent')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Mark as Sent</span>
              </button>
            )}

            {canReceive && (
              <button
                type="button"
                onClick={() => openReceiveModal(selectedPo)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Receive Stock</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print PO</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadPurchaseOrderPdf({
                  po: selectedPo,
                  supplier,
                  products,
                  companyName,
                  currency,
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingPo(selectedPo)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap shrink-0"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Cancel PO</span>
              </button>
            )}
          </div>
        </div>

        {/* Clean Printable Purchase Order Document */}
        <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl print-surface space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                Purchase Order Document
              </p>
              <h2 className="mt-1 text-xl font-display font-bold text-slate-900 dark:text-slate-100">
                {companyName}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Authorized Procurement &amp; Warehouse Receiving Copy
              </p>
            </div>

            <div className="sm:text-right text-xs space-y-1 font-mono tabular-nums">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {selectedPo.id}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Order Date: {selectedPo.orderDate}
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                Expected Date: {selectedPo.expectedDate}
              </p>
              {selectedPo.receivedDate && (
                <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  Received Date: {selectedPo.receivedDate}
                </p>
              )}
              <p className="text-slate-600 dark:text-slate-400">
                Status: {selectedPo.status}
              </p>
            </div>
          </div>

          {/* Vendor & Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                Vendor / Supplier
              </h3>
              {supplier ? (
                <div className="space-y-1 text-slate-600 dark:text-slate-300">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {supplier.name}
                  </p>
                  <p>Attn: {supplier.contactPerson}</p>
                  <p>{supplier.address}</p>
                  <p>
                    {supplier.email} · {supplier.phone}
                  </p>
                </div>
              ) : (
                <p className="text-slate-500">Supplier record unavailable</p>
              )}
            </div>

            <div className="sm:text-right space-y-1 text-slate-600 dark:text-slate-300">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                Commercial Terms
              </h3>
              <p>Payment Terms: {supplier?.paymentTerms ?? 'Standard'}</p>
              <p>Quoted Lead Time: {supplier?.leadTimeDays ?? '—'} days</p>
              <p>Currency: {currency}</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">#</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 font-semibold">Item Description</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Ordered</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Received</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Unit Price</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {selectedPo.items.map((item, idx) => {
                  const prod = products.find((p) => p.id === item.productId);
                  const received = item.receivedQuantity ?? 0;
                  const lineTotal = item.quantity * item.unitPrice;
                  return (
                    <tr key={`${item.productId}-${idx}`}>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">
                        {prod?.SKU ?? item.productId}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
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
                          className="hover:text-teal-600 dark:hover:text-teal-400 text-left"
                        >
                          {prod?.name ?? 'Deleted Product'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {item.quantity} {prod?.unit ?? 'pcs'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            received >= item.quantity
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : received > 0
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-slate-500'
                          }
                        >
                          {received} / {item.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatCurrency(item.unitPrice, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(lineTotal, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                    Total Order Amount
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(selectedPo.totalAmount, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selectedPo.notes && (
            <div className="pt-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Delivery &amp; Receiving Notes:{' '}
              </span>
              <span className="text-slate-600 dark:text-slate-300">{selectedPo.notes}</span>
            </div>
          )}
        </div>

        {renderReceiveStockModal()}
        {renderCancelDialog()}
      </div>
    );
  }

  function renderReceiveStockModal() {
    return (
      <Modal
        isOpen={Boolean(receivingPo)}
        onClose={() => setReceivingPo(null)}
        title={receivingPo ? `Receive Stock · ${receivingPo.id}` : 'Receive Stock'}
        subtitle="Enter quantities received in this shipment. Product stock and IN ledger movements update automatically."
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setReceivingPo(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="receive-po-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              Confirm Receipt &amp; Update Stock
            </button>
          </>
        }
      >
        {receivingPo && (
          <form id="receive-po-form" onSubmit={handleConfirmReceiveStock} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Received Date *
                </label>
                <input
                  type="date"
                  value={receiveDate}
                  onChange={(e) => setReceiveDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  GRN / Delivery Challan Note
                </label>
                <input
                  type="text"
                  value={receiveNote}
                  onChange={(e) => setReceiveNote(e.target.value)}
                  placeholder={`Received against ${receivingPo.id}`}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                    <th className="px-3.5 py-2.5 font-semibold">Product</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Ordered</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Prev. Recv</th>
                    <th className="px-3.5 py-2.5 font-semibold text-right">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {receivingPo.items.map((item) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const prevRecv = item.receivedQuantity ?? 0;
                    const remaining = Math.max(0, item.quantity - prevRecv);
                    return (
                      <tr key={item.productId}>
                        <td className="px-3.5 py-2.5">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {prod?.name ?? item.productId}
                          </p>
                          <p className="font-mono text-slate-500">
                            {prod?.SKU} · On hand: {prod?.quantityInStock ?? 0} {prod?.unit}
                          </p>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {item.quantity}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-500">
                          {prevRecv}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          {remaining === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Complete
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              step="1"
                              value={receiveInputs[item.productId] ?? '0'}
                              onChange={(e) =>
                                setReceiveInputs({
                                  ...receiveInputs,
                                  [item.productId]: e.target.value,
                                })
                              }
                              className="w-24 px-2.5 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </form>
        )}
      </Modal>
    );
  }

  function renderCancelDialog() {
    return (
      <ConfirmDialog
        isOpen={Boolean(cancellingPo)}
        onClose={() => setCancellingPo(null)}
        onConfirm={() => {
          if (cancellingPo) updatePurchaseOrderStatus(cancellingPo.id, 'Cancelled');
        }}
        title="Cancel Purchase Order"
        description={
          cancellingPo
            ? `Cancel ${cancellingPo.id}? Cancelled purchase orders cannot receive stock and are excluded from supplier spend totals.`
            : ''
        }
        confirmLabel="Cancel Order"
      />
    );
  }

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      key: 'id',
      header: 'PO Number',
      render: (po) => (
        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
          {po.id}
        </span>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (po) => {
        const sup = suppliers.find((s) => s.id === po.supplierId);
        return (
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {sup?.name ?? 'Unknown Supplier'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {po.items.length} line item{po.items.length === 1 ? '' : 's'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'dates',
      header: 'Order / Expected Date',
      render: (po) => (
        <div className="text-xs font-mono tabular-nums">
          <p className="text-slate-700 dark:text-slate-300">{po.orderDate}</p>
          <p className="text-slate-500 dark:text-slate-400">
            Due {po.expectedDate}
            {po.receivedDate ? ` · Recv ${po.receivedDate}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (po) => <PoStatusBadge status={po.status} isOverdue={checkOverdue(po)} />,
    },
    {
      key: 'total',
      header: 'Total Amount',
      align: 'right',
      render: (po) => (
        <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatCurrency(po.totalAmount, currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (po) => (
        <div
          className="inline-flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {po.status === 'Draft' && (
            <button
              type="button"
              onClick={() => updatePurchaseOrderStatus(po.id, 'Sent')}
              className="px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
            >
              Send
            </button>
          )}
          {(po.status === 'Sent' || po.status === 'Partially Received') && (
            <button
              type="button"
              onClick={() => openReceiveModal(po)}
              className="px-2.5 py-1 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-md hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
            >
              Receive Stock
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedPoId(po.id)}
            aria-label={`Open ${po.id}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create supplier orders, auto-draft low-stock replenishments, and receive deliveries into stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => autoGenerateReorderDrafts()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>
              Auto-Suggest POs
              {reorderSuggestions.length > 0 ? ` (${reorderSuggestions.length})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => openNewPoModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Purchase Order</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Orders"
          value={stats.totalCount}
          subtext="All historical & active POs"
          onClick={() => setStatusFilter('ALL')}
        />
        <StatCard
          label="Open Purchase Orders"
          value={stats.openCount}
          subtext="Draft, Sent, or Partially Received"
        />
        <StatCard
          label="Overdue Deliveries"
          value={stats.overdueCount}
          subtext="Past expected delivery date"
          tone={stats.overdueCount > 0 ? 'critical' : 'default'}
        />
        <StatCard
          label="Committed In-Transit Value"
          value={formatCurrency(stats.committedValue, currency)}
          subtext="Sent & Partially Received POs"
        />
      </div>

      {/* Search & Status Workflow Tabs */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO number (PO-0001), supplier name, or notes..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg">
          {(
            [
              'ALL',
              'Draft',
              'Sent',
              'Partially Received',
              'Received',
              'Cancelled',
            ] as const
          ).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      {/* PO DataTable */}
      <DataTable
        columns={columns}
        data={filteredOrders}
        rowKey={(po) => po.id}
        isLoading={isHydrating}
        onRowClick={(po) => setSelectedPoId(po.id)}
        emptyTitle="No purchase orders match"
        emptyDescription="Create a new Purchase Order or click Auto-Suggest POs to draft orders for low-stock SKUs."
        emptyActionLabel="New Purchase Order"
        onEmptyAction={() => openNewPoModal()}
      />

      {/* Create PO Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Purchase Order"
        subtitle="Select a supplier to automatically populate negotiated product prices."
        maxWidthClass="max-w-3xl"
        footer={
          <>
            <div className="mr-auto text-xs text-slate-600 dark:text-slate-300">
              Order Total:{' '}
              <strong className="text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {formatCurrency(draftTotalAmount, currency)}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-po-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              Create {poStatus} PO
            </button>
          </>
        }
      >
        <form id="create-po-form" onSubmit={handleSubmitNewPo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Supplier *
              </label>
              <select
                value={poSupplierId}
                onChange={(e) => handleSupplierChangeInModal(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.leadTimeDays}d lead · {s.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Order Date *
              </label>
              <input
                type="date"
                value={poOrderDate}
                onChange={(e) => {
                  setPoOrderDate(e.target.value);
                  setPoExpectedDate(
                    computeExpectedDateForSupplier(poSupplierId, e.target.value)
                  );
                }}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Expected Delivery *
              </label>
              <input
                type="date"
                value={poExpectedDate}
                onChange={(e) => setPoExpectedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Order Line Items
              </label>
              <button
                type="button"
                onClick={handleAddPoLine}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product Line</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
              {poLines.map((line, index) => {
                const autoInfo = getSupplierAutoPrice(poSupplierId, line.productId);
                const lineSubtotal =
                  (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                return (
                  <div
                    key={index}
                    className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs"
                  >
                    <div className="sm:col-span-6">
                      <select
                        value={line.productId}
                        onChange={(e) => handleChangePoLineProduct(index, e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.SKU} — {p.name} (Stock: {p.quantityInStock})
                          </option>
                        ))}
                      </select>
                      <span className="mt-0.5 block text-[11px] text-slate-400 font-mono">
                        Supplier MOQ: {autoInfo.minOrderQty}
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        aria-label="Quantity"
                        value={line.quantity}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((l, i) =>
                              i === index ? { ...l, quantity: e.target.value } : l
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      />
                      <span className="mt-0.5 block text-right text-[11px] text-slate-400">
                        Qty
                      </span>
                    </div>

                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label="Unit Price"
                        value={line.unitPrice}
                        onChange={(e) =>
                          setPoLines((prev) =>
                            prev.map((l, i) =>
                              i === index ? { ...l, unitPrice: e.target.value } : l
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                      />
                      <span className="mt-0.5 block text-right text-[11px] text-slate-400">
                        Unit Price
                      </span>
                    </div>

                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(lineSubtotal, currency)}
                      </span>
                      {poLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPoLines((prev) => prev.filter((_, i) => i !== index))
                          }
                          aria-label="Remove line"
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Initial Status
              </label>
              <select
                value={poStatus}
                onChange={(e) => setPoStatus(e.target.value as 'Draft' | 'Sent')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="Draft">Save as Draft</option>
                <option value="Sent">Mark Sent Immediately</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Notes / Dispatch Instructions
              </label>
              <input
                type="text"
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                placeholder="Include test certificates or gate pass instructions..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {poFormError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              {poFormError}
            </p>
          )}
        </form>
      </Modal>

      {renderReceiveStockModal()}
      {renderCancelDialog()}
    </div>
  );
};
