import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, ShoppingCart, Sparkles } from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import {
  calculateSupplierMetrics,
  calculateTotalStockValue,
  formatCurrency,
  getStockStatus,
} from '../../domain/businessRules';
import { StockStatus } from '../../types';
import { StatCard } from '../ui/StatCard';
import { MovementTypeBadge, PoStatusBadge, StockStatusBadge } from '../ui/StatusBadge';

export const DashboardView: React.FC = () => {
  const {
    data,
    setActiveTab,
    navigateToEntity,
    autoGenerateReorderDrafts,
  } = useStockTrack();

  const { products, suppliers, purchaseOrders, stockMovements, settings } = data;
  const isDark = settings.theme === 'dark';

  // KPI computations
  const kpis = useMemo(() => {
    let lowStock = 0;
    let outOfStock = 0;

    for (const p of products) {
      const st = getStockStatus(p, settings.defaultLowStockThreshold);
      if (st === StockStatus.LOW_STOCK) lowStock++;
      else if (st === StockStatus.OUT_OF_STOCK) outOfStock++;
    }

    const openPos = purchaseOrders.filter(
      (po) =>
        po.status === 'Draft' ||
        po.status === 'Sent' ||
        po.status === 'Partially Received'
    ).length;

    const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
    const totalStockValue = calculateTotalStockValue(products, 'cost');

    return {
      totalProducts: products.length,
      totalStockValue,
      lowStock,
      outOfStock,
      openPos,
      activeSuppliers,
    };
  }, [products, suppliers, purchaseOrders, settings.defaultLowStockThreshold]);

  // Chart 1: Stock Value by Category
  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const val = Math.max(0, p.quantityInStock) * p.costPrice;
      map.set(p.category, (map.get(p.category) ?? 0) + val);
    }
    return Array.from(map.entries())
      .map(([category, value]) => ({
        category: category.length > 16 ? `${category.slice(0, 15)}…` : category,
        fullCategory: category,
        value: Math.round(value),
      }))
      .sort((a, b) => b.value - a.value);
  }, [products]);

  // Chart 2: Monthly Stock In vs Out (last 6 months dynamically anchored around latest movement/current date)
  const monthlyFlowData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // Determine anchor date from latest movement or current date
    const allDates = stockMovements.map((m) => m.date).sort();
    const latestStr = allDates[allDates.length - 1] || new Date().toISOString().slice(0, 10);
    const anchor = new Date(latestStr);

    const buckets: Array<{ key: string; label: string; stockIn: number; stockOut: number }> = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      buckets.push({
        key: `${yyyy}-${mm}`,
        label: `${monthNames[d.getMonth()]} '${String(yyyy).slice(-2)}`,
        stockIn: 0,
        stockOut: 0,
      });
    }

    for (const mov of stockMovements) {
      const ym = mov.date.slice(0, 7);
      const bucket = buckets.find((b) => b.key === ym);
      if (!bucket) continue;
      if (mov.type === 'IN') {
        bucket.stockIn += mov.quantity;
      } else if (mov.type === 'OUT') {
        bucket.stockOut += mov.quantity;
      } else if (mov.type === 'ADJUSTMENT') {
        if (mov.quantity > 0) bucket.stockIn += mov.quantity;
        else bucket.stockOut += Math.abs(mov.quantity);
      }
    }

    return buckets;
  }, [stockMovements]);

  // Chart 3: Top 5 Suppliers by Order Value
  const topSuppliersData = useMemo(() => {
    return suppliers
      .map((sup) => {
        const metrics = calculateSupplierMetrics(sup, purchaseOrders);
        // Include Draft + Committed + Received order volume for complete order value picture
        const totalOrderVal = purchaseOrders
          .filter((po) => po.supplierId === sup.id && po.status !== 'Cancelled')
          .reduce((sum, po) => sum + po.totalAmount, 0);
        return {
          id: sup.id,
          name: sup.name.length > 20 ? `${sup.name.slice(0, 19)}…` : sup.name,
          fullName: sup.name,
          orderValue: Math.round(totalOrderVal),
          onTimeRate: metrics.onTimeDeliveryRate,
        };
      })
      .filter((s) => s.orderValue > 0)
      .sort((a, b) => b.orderValue - a.orderValue)
      .slice(0, 5);
  }, [suppliers, purchaseOrders]);

  // Low-Stock Alert List
  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => {
        const st = getStockStatus(p, settings.defaultLowStockThreshold);
        return st === StockStatus.OUT_OF_STOCK || st === StockStatus.LOW_STOCK;
      })
      .sort((a, b) => a.quantityInStock - b.quantityInStock);
  }, [products, settings.defaultLowStockThreshold]);

  // Combined Recent Activity Feed (Movements + POs)
  const recentActivity = useMemo(() => {
    const movItems = stockMovements.slice(0, 8).map((m) => {
      const prod = products.find((p) => p.id === m.productId);
      return {
        id: `act-m-${m.id}`,
        date: m.date,
        kind: 'movement' as const,
        movement: m,
        productName: prod?.name ?? m.productId,
        unit: prod?.unit ?? 'pcs',
      };
    });

    const poItems = purchaseOrders.slice(0, 6).map((po) => {
      const sup = suppliers.find((s) => s.id === po.supplierId);
      return {
        id: `act-po-${po.id}`,
        date: po.receivedDate || po.orderDate,
        kind: 'po' as const,
        po,
        supplierName: sup?.name ?? 'Unknown Supplier',
      };
    });

    return [...movItems, ...poItems]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [stockMovements, purchaseOrders, products, suppliers]);

  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: '8px',
    fontSize: '12px',
    color: isDark ? '#f8fafc' : '#0f172a',
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Action Anchor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time stock valuation, replenishment alerts, and supplier fulfillment telemetry.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const drafts = autoGenerateReorderDrafts();
            if (drafts.length > 0) setActiveTab('purchase-orders');
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Auto-Draft Low-Stock POs</span>
        </button>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Products"
          value={kpis.totalProducts}
          subtext="Active catalog SKUs"
          onClick={() => setActiveTab('inventory')}
        />
        <StatCard
          label="Total Stock Value"
          value={formatCurrency(kpis.totalStockValue, settings.currency, true)}
          subtext={formatCurrency(kpis.totalStockValue, settings.currency)}
          onClick={() => setActiveTab('reports')}
        />
        <StatCard
          label="Low-Stock Items"
          value={kpis.lowStock}
          subtext="At or below reorder level"
          tone={kpis.lowStock > 0 ? 'warning' : 'default'}
          onClick={() => setActiveTab('inventory')}
        />
        <StatCard
          label="Out-of-Stock Items"
          value={kpis.outOfStock}
          subtext="Zero units on hand"
          tone={kpis.outOfStock > 0 ? 'critical' : 'default'}
          onClick={() => setActiveTab('inventory')}
        />
        <StatCard
          label="Open Purchase Orders"
          value={kpis.openPos}
          subtext="Draft, Sent & Partial"
          onClick={() => setActiveTab('purchase-orders')}
        />
        <StatCard
          label="Active Suppliers"
          value={kpis.activeSuppliers}
          subtext={`Of ${suppliers.length} total vendors`}
          onClick={() => setActiveTab('suppliers')}
        />
      </div>

      {/* Charts Row: Stock Value by Category + Monthly Stock In vs Out */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                Stock Value by Category
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current on-hand cost valuation across product categories
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryChartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="category"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrency(Number(v), settings.currency, true)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown) => [
                    formatCurrency(Number(value), settings.currency),
                    'Cost Value',
                  ]}
                />
                <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                Monthly Stock In vs. Stock Out
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                6-month unit movement volume across warehouse ledger
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-teal-600 inline-block" />
                In
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                Out
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyFlowData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="stockIn" name="Units In" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="stockOut" name="Units Out" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top 5 Suppliers Chart + Low-Stock Alert Shortcut List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                  Top 5 Suppliers by Order Value
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cumulative purchase order volume by vendor
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('suppliers')}
                className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
              >
                All Suppliers
              </button>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topSuppliersData}
                  layout="vertical"
                  margin={{ top: 4, right: 18, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCurrency(Number(v), settings.currency, true)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={125}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: unknown) => [
                      formatCurrency(Number(value), settings.currency),
                      'Order Value',
                    ]}
                  />
                  <Bar dataKey="orderValue" fill="#0284c7" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Low-Stock Alert List with "Create PO" Shortcut */}
        <div className="lg:col-span-7 p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                Low &amp; Out-of-Stock Replenishment Queue ({lowStockProducts.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                SKUs at or below reorder threshold — launch a pre-filled PO in one click
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>View Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-10 text-xs text-slate-500 dark:text-slate-400">
              All products are currently stocked above their reorder thresholds.
            </div>
          ) : (
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800 overflow-y-auto max-h-72">
              {lowStockProducts.map((product) => {
                const status = getStockStatus(product, settings.defaultLowStockThreshold);
                const supplier = suppliers.find((s) => s.id === product.preferredSupplierId);
                return (
                  <div
                    key={product.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            navigateToEntity({
                              tab: 'inventory',
                              entityId: product.id,
                              action: 'view',
                            })
                          }
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 truncate text-left"
                        >
                          {product.name}
                        </button>
                        <StockStatusBadge status={status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{product.SKU}</span> · On hand:{' '}
                        <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {product.quantityInStock} {product.unit}
                        </strong>{' '}
                        (Min {product.reorderLevel}) ·{' '}
                        {supplier ? supplier.name : 'No preferred vendor'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        navigateToEntity({
                          tab: 'purchase-orders',
                          action: 'create-po-for-product',
                          productId: product.id,
                          supplierId: product.preferredSupplierId,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Create PO</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
              Recent Warehouse &amp; Procurement Activity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest stock movements and purchase order updates
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
          >
            Full Stock Ledger →
          </button>
        </div>

        <div className="divide-y divide-slate-200/75 dark:divide-slate-800 text-xs">
          {recentActivity.map((item) => {
            if (item.kind === 'movement') {
              const m = item.movement;
              return (
                <div
                  key={item.id}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <MovementTypeBadge type={m.type} />
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {item.productName}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      · {m.reason} · {m.note}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {m.type === 'OUT'
                        ? `-${m.quantity}`
                        : m.type === 'IN'
                        ? `+${m.quantity}`
                        : m.quantity > 0
                        ? `+${m.quantity}`
                        : m.quantity}{' '}
                      {item.unit}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">{m.date}</span>
                  </div>
                </div>
              );
            }

            const po = item.po;
            return (
              <div
                key={item.id}
                onClick={() =>
                  navigateToEntity({
                    tab: 'purchase-orders',
                    entityId: po.id,
                    action: 'view',
                  })
                }
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 rounded px-1 -mx-1 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <PoStatusBadge status={po.status} />
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {po.id}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    · {item.supplierName} ({po.items.length} line items)
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(po.totalAmount, settings.currency)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">{item.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
