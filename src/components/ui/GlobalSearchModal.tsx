import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileText, Package, Search, X } from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import { formatCurrency } from '../../domain/businessRules';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { data, navigateToEntity } = useStockTrack();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        products: data.products.slice(0, 4),
        suppliers: data.suppliers.slice(0, 3),
        orders: data.purchaseOrders.slice(0, 3),
      };
    }

    const products = data.products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.SKU.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q)
      )
      .slice(0, 6);

    const suppliers = data.suppliers
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.contactPerson.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
      )
      .slice(0, 5);

    const orders = data.purchaseOrders
      .filter((po) => {
        const supName =
          data.suppliers.find((s) => s.id === po.supplierId)?.name.toLowerCase() ?? '';
        return (
          po.id.toLowerCase().includes(q) ||
          po.status.toLowerCase().includes(q) ||
          supName.includes(q)
        );
      })
      .slice(0, 5);

    return { products, suppliers, orders };
  }, [query, data]);

  if (!isOpen) return null;

  const totalCount =
    results.products.length + results.suppliers.length + results.orders.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-950/55 backdrop-blur-[2px] no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products by SKU/name, suppliers, or PO numbers..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-3 space-y-4">
          {totalCount === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No products, suppliers, or purchase orders match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <>
              {results.products.length > 0 && (
                <div>
                  <div className="px-2 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Products
                  </div>
                  <div className="space-y-0.5">
                    {results.products.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          navigateToEntity({
                            tab: 'inventory',
                            entityId: product.id,
                            action: 'view',
                          });
                          onClose();
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Package className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="font-mono">{product.SKU}</span> · {product.category} · {product.location}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                          {product.quantityInStock} {product.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.suppliers.length > 0 && (
                <div>
                  <div className="px-2 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Suppliers
                  </div>
                  <div className="space-y-0.5">
                    {results.suppliers.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => {
                          navigateToEntity({
                            tab: 'suppliers',
                            entityId: supplier.id,
                            action: 'view',
                          });
                          onClose();
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {supplier.name}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {supplier.contactPerson} · {supplier.paymentTerms} · {supplier.leadTimeDays}d lead
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                          {supplier.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.orders.length > 0 && (
                <div>
                  <div className="px-2 pb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Purchase Orders
                  </div>
                  <div className="space-y-0.5">
                    {results.orders.map((po) => {
                      const sup = data.suppliers.find((s) => s.id === po.supplierId);
                      return (
                        <button
                          key={po.id}
                          type="button"
                          onClick={() => {
                            navigateToEntity({
                              tab: 'purchase-orders',
                              entityId: po.id,
                              action: 'view',
                            });
                            onClose();
                          }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                                {po.id}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {sup?.name ?? 'Unknown'} · {po.status} · Due {po.expectedDate}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                            {formatCurrency(po.totalAmount, data.settings.currency)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Click any item to jump directly to its detail view</span>
          <span className="font-mono">ESC to close</span>
        </div>
      </div>
    </div>
  );
};
