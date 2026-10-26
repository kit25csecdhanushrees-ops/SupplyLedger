import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useStockTrack } from '../../store/StockTrackContext';
import {
  calculateSupplierMetrics,
  formatCurrency,
  getStockStatus,
  serializeRowsToCsv,
} from '../../domain/businessRules';
import { StockStatus } from '../../types';
import { downloadTextFile } from '../../utils/download';
import { DataTable } from '../ui/DataTable';
import { PoStatusBadge, StockStatusBadge } from '../ui/StatusBadge';
import { StatCard } from '../ui/StatCard';

type ReportTab =
  | 'valuation'
  | 'low-stock'
  | 'supplier-spend'
  | 'purchase-history'
  | 'movement-summary';

export const ReportsView: React.FC = () => {
  const { data, addToast, navigateToEntity } = useStockTrack();
  const { products, suppliers, purchaseOrders, stockMovements, settings } = data;
  const [activeReport, setActiveReport] = useState<ReportTab>('valuation');

  // 1. Inventory Valuation Rows
  const valuationRows = useMemo(() => {
    return products
      .map((p) => {
        const costTotal = p.quantityInStock * p.costPrice;
        const retailTotal = p.quantityInStock * p.sellingPrice;
        const potentialProfit = retailTotal - costTotal;
        const marginPct =
          p.sellingPrice > 0
            ? Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100)
            : 0;
        return {
          product: p,
          costTotal,
          retailTotal,
          potentialProfit,
          marginPct,
        };
      })
      .sort((a, b) => b.costTotal - a.costTotal);
  }, [products]);

  // 2. Low-Stock Report Rows
  const lowStockRows = useMemo(() => {
    return products
      .filter((p) => {
        const st = getStockStatus(p, settings.defaultLowStockThreshold);
        return st === StockStatus.LOW_STOCK || st === StockStatus.OUT_OF_STOCK;
      })
      .map((p) => {
        const status = getStockStatus(p, settings.defaultLowStockThreshold);
        const supplier = suppliers.find((s) => s.id === p.preferredSupplierId);
        const shortage = Math.max(0, p.reorderLevel - p.quantityInStock);
        const estReorderCost = p.reorderQuantity * p.costPrice;
        return {
          product: p,
          status,
          supplierName: supplier?.name ?? 'Unassigned',
          shortage,
          estReorderCost,
        };
      })
      .sort((a, b) => a.product.quantityInStock - b.product.quantityInStock);
  }, [products, suppliers, settings.defaultLowStockThreshold]);

  // 3. Supplier Spend Report Rows
  const supplierSpendRows = useMemo(() => {
    return suppliers
      .map((s) => {
        const metrics = calculateSupplierMetrics(s, purchaseOrders);
        const avgOrderVal =
          metrics.totalOrdersCount > 0
            ? metrics.totalSpend / metrics.totalOrdersCount
            : 0;
        return {
          supplier: s,
          metrics,
          avgOrderVal,
        };
      })
      .sort((a, b) => b.metrics.totalSpend - a.metrics.totalSpend);
  }, [suppliers, purchaseOrders]);

  // 4. Purchase History Rows
  const purchaseHistoryRows = useMemo(() => {
    return [...purchaseOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  }, [purchaseOrders]);

  // 5. Stock Movement Summary per Product
  const movementSummaryRows = useMemo(() => {
    return products.map((p) => {
      const movs = stockMovements.filter((m) => m.productId === p.id);
      let totalIn = 0;
      let totalOut = 0;
      let totalAdj = 0;
      for (const m of movs) {
        if (m.type === 'IN') totalIn += m.quantity;
        else if (m.type === 'OUT') totalOut += m.quantity;
        else totalAdj += m.quantity;
      }
      return {
        product: p,
        movementCount: movs.length,
        totalIn,
        totalOut,
        totalAdj,
      };
    });
  }, [products, stockMovements]);

  const handleExportCurrentReport = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (activeReport === 'valuation') {
      const csv = serializeRowsToCsv(
        [
          'SKU',
          'Product',
          'Category',
          'QtyInStock',
          'Unit',
          'CostPrice',
          'SellingPrice',
          'TotalCostValue',
          'TotalRetailValue',
          'PotentialMargin',
          'GrossMarginPct',
        ],
        valuationRows.map((r) => [
          r.product.SKU,
          r.product.name,
          r.product.category,
          r.product.quantityInStock,
          r.product.unit,
          r.product.costPrice,
          r.product.sellingPrice,
          r.costTotal,
          r.retailTotal,
          r.potentialProfit,
          `${r.marginPct}%`,
        ])
      );
      downloadTextFile(`inventory_valuation_${dateStamp}.csv`, csv);
      addToast('success', 'Valuation report exported', 'CSV downloaded.');
      return;
    }

    if (activeReport === 'low-stock') {
      const csv = serializeRowsToCsv(
        [
          'SKU',
          'Product',
          'Status',
          'CurrentStock',
          'ReorderLevel',
          'Shortage',
          'SuggestedReorderQty',
          'PreferredSupplier',
          'EstReorderCost',
        ],
        lowStockRows.map((r) => [
          r.product.SKU,
          r.product.name,
          r.status,
          r.product.quantityInStock,
          r.product.reorderLevel,
          r.shortage,
          r.product.reorderQuantity,
          r.supplierName,
          r.estReorderCost,
        ])
      );
      downloadTextFile(`low_stock_report_${dateStamp}.csv`, csv);
      addToast('success', 'Low-stock report exported', 'CSV downloaded.');
      return;
    }

    if (activeReport === 'supplier-spend') {
      const csv = serializeRowsToCsv(
        [
          'Supplier',
          'Status',
          'TotalOrders',
          'ReceivedOrders',
          'TotalSpend',
          'AvgOrderValue',
          'OnTimeDeliveryPct',
          'AvgLeadTimeDays',
        ],
        supplierSpendRows.map((r) => [
          r.supplier.name,
          r.supplier.status,
          r.metrics.totalOrdersCount,
          r.metrics.receivedOrdersCount,
          r.metrics.totalSpend,
          Math.round(r.avgOrderVal),
          r.metrics.onTimeDeliveryRate !== null
            ? `${r.metrics.onTimeDeliveryRate}%`
            : 'N/A',
          r.metrics.averageLeadTimeDays,
        ])
      );
      downloadTextFile(`supplier_spend_report_${dateStamp}.csv`, csv);
      addToast('success', 'Supplier spend report exported', 'CSV downloaded.');
      return;
    }

    if (activeReport === 'purchase-history') {
      const csv = serializeRowsToCsv(
        [
          'PONumber',
          'Supplier',
          'OrderDate',
          'ExpectedDate',
          'ReceivedDate',
          'Status',
          'LineItems',
          'TotalAmount',
        ],
        purchaseHistoryRows.map((po) => {
          const supName =
            suppliers.find((s) => s.id === po.supplierId)?.name ?? 'Unknown';
          return [
            po.id,
            supName,
            po.orderDate,
            po.expectedDate,
            po.receivedDate ?? '',
            po.status,
            po.items.length,
            po.totalAmount,
          ];
        })
      );
      downloadTextFile(`purchase_history_report_${dateStamp}.csv`, csv);
      addToast('success', 'Purchase history exported', 'CSV downloaded.');
      return;
    }

    const csv = serializeRowsToCsv(
      [
        'SKU',
        'Product',
        'Category',
        'MovementEntries',
        'TotalIn',
        'TotalOut',
        'NetAdjustments',
        'CurrentEndingStock',
      ],
      movementSummaryRows.map((r) => [
        r.product.SKU,
        r.product.name,
        r.product.category,
        r.movementCount,
        r.totalIn,
        r.totalOut,
        r.totalAdj,
        r.product.quantityInStock,
      ])
    );
    downloadTextFile(`stock_movement_summary_${dateStamp}.csv`, csv);
    addToast('success', 'Movement summary exported', 'CSV downloaded.');
  };

  const reportTabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'valuation', label: 'Inventory Valuation' },
    { id: 'low-stock', label: 'Low-Stock Report' },
    { id: 'supplier-spend', label: 'Supplier Spend' },
    { id: 'purchase-history', label: 'Purchase History' },
    { id: 'movement-summary', label: 'Movement Summary' },
  ];

  const totalCostValuation = valuationRows.reduce((s, r) => s + r.costTotal, 0);
  const totalRetailValuation = valuationRows.reduce((s, r) => s + r.retailTotal, 0);
  const totalSupplierSpend = supplierSpendRows.reduce(
    (s, r) => s + r.metrics.totalSpend,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Business Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Audit-ready inventory valuation, low-stock forecasting, supplier spend, and ledger summaries.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCurrentReport}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Export Report CSV</span>
        </button>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveReport(tab.id)}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeReport === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report 1: Inventory Valuation */}
      {activeReport === 'valuation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Cost Value"
              value={formatCurrency(totalCostValuation, settings.currency)}
              subtext="Asset value at unit purchase cost"
            />
            <StatCard
              label="Total Retail Value"
              value={formatCurrency(totalRetailValuation, settings.currency)}
              subtext="Projected revenue at selling price"
            />
            <StatCard
              label="Unrealized Gross Margin"
              value={formatCurrency(
                totalRetailValuation - totalCostValuation,
                settings.currency
              )}
              subtext="Retail minus cost valuation"
              tone="positive"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'sku',
                header: 'SKU',
                render: (r) => (
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.product.SKU}
                  </span>
                ),
              },
              {
                key: 'name',
                header: 'Product',
                render: (r) => (
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {r.product.name}
                    </p>
                    <p className="text-xs text-slate-500">{r.product.category}</p>
                  </div>
                ),
              },
              {
                key: 'qty',
                header: 'On Hand',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {r.product.quantityInStock} {r.product.unit}
                  </span>
                ),
              },
              {
                key: 'cost',
                header: 'Cost Value',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(r.costTotal, settings.currency)}
                  </span>
                ),
              },
              {
                key: 'retail',
                header: 'Retail Value',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(r.retailTotal, settings.currency)}
                  </span>
                ),
              },
              {
                key: 'margin',
                header: 'Gross Margin',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                    {r.marginPct}%
                  </span>
                ),
              },
            ]}
            data={valuationRows}
            rowKey={(r) => r.product.id}
          />
        </div>
      )}

      {/* Report 2: Low-Stock Report */}
      {activeReport === 'low-stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="SKUs Requiring Restock"
              value={lowStockRows.length}
              subtext="Low Stock & Out of Stock combined"
              tone={lowStockRows.length > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Out-of-Stock SKUs"
              value={lowStockRows.filter((r) => r.status === StockStatus.OUT_OF_STOCK).length}
              subtext="Immediate replenishment priority"
              tone="critical"
            />
            <StatCard
              label="Est. Replenishment Budget"
              value={formatCurrency(
                lowStockRows.reduce((s, r) => s + r.estReorderCost, 0),
                settings.currency
              )}
              subtext="Using configured reorder quantities"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'sku',
                header: 'SKU',
                render: (r) => (
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {r.product.SKU}
                  </span>
                ),
              },
              {
                key: 'name',
                header: 'Product',
                render: (r) => (
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {r.product.name}
                    </p>
                    <p className="text-xs text-slate-500">{r.supplierName}</p>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StockStatusBadge status={r.status} />,
              },
              {
                key: 'stock',
                header: 'Current / Min',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {r.product.quantityInStock} / {r.product.reorderLevel} {r.product.unit}
                  </span>
                ),
              },
              {
                key: 'reorderQty',
                header: 'Reorder Qty',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                    {r.product.reorderQuantity} {r.product.unit}
                  </span>
                ),
              },
              {
                key: 'estCost',
                header: 'Est. PO Cost',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(r.estReorderCost, settings.currency)}
                  </span>
                ),
              },
            ]}
            data={lowStockRows}
            rowKey={(r) => r.product.id}
            emptyTitle="Zero low-stock items"
            emptyDescription="All inventory SKUs are above their minimum reorder levels."
          />
        </div>
      )}

      {/* Report 3: Supplier Spend Report */}
      {activeReport === 'supplier-spend' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Cumulative Committed Spend"
              value={formatCurrency(totalSupplierSpend, settings.currency)}
              subtext="Sent, Partially Received & Received POs"
            />
            <StatCard
              label="Active Vendors"
              value={suppliers.filter((s) => s.status === 'Active').length}
              subtext={`Out of ${suppliers.length} registered suppliers`}
            />
            <StatCard
              label="Completed Deliveries"
              value={purchaseOrders.filter((po) => po.status === 'Received').length}
              subtext="Fully received Purchase Orders"
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'supplier',
                header: 'Supplier',
                render: (r) => (
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {r.supplier.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.supplier.paymentTerms} · {r.supplier.status}
                    </p>
                  </div>
                ),
              },
              {
                key: 'orders',
                header: 'PO Count',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {r.metrics.totalOrdersCount}
                  </span>
                ),
              },
              {
                key: 'spend',
                header: 'Total Spend',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(r.metrics.totalSpend, settings.currency)}
                  </span>
                ),
              },
              {
                key: 'avg',
                header: 'Avg PO Value',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {formatCurrency(r.avgOrderVal, settings.currency)}
                  </span>
                ),
              },
              {
                key: 'ontime',
                header: 'On-Time %',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                    {r.metrics.onTimeDeliveryRate !== null
                      ? `${r.metrics.onTimeDeliveryRate}%`
                      : '—'}
                  </span>
                ),
              },
              {
                key: 'lead',
                header: 'Avg Lead Time',
                align: 'right',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {r.metrics.averageLeadTimeDays} days
                  </span>
                ),
              },
            ]}
            data={supplierSpendRows}
            rowKey={(r) => r.supplier.id}
            onRowClick={(r) =>
              navigateToEntity({
                tab: 'suppliers',
                entityId: r.supplier.id,
                action: 'view',
              })
            }
          />
        </div>
      )}

      {/* Report 4: Purchase History */}
      {activeReport === 'purchase-history' && (
        <DataTable
          columns={[
            {
              key: 'po',
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
              render: (po) => (
                <span className="text-slate-800 dark:text-slate-200">
                  {suppliers.find((s) => s.id === po.supplierId)?.name ?? 'Unknown'}
                </span>
              ),
            },
            {
              key: 'orderDate',
              header: 'Order Date',
              render: (po) => (
                <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {po.orderDate}
                </span>
              ),
            },
            {
              key: 'receivedDate',
              header: 'Expected / Received',
              render: (po) => (
                <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {po.expectedDate} / {po.receivedDate ?? 'Pending'}
                </span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (po) => <PoStatusBadge status={po.status} />,
            },
            {
              key: 'amount',
              header: 'Total Amount',
              align: 'right',
              render: (po) => (
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(po.totalAmount, settings.currency)}
                </span>
              ),
            },
          ]}
          data={purchaseHistoryRows}
          rowKey={(po) => po.id}
          onRowClick={(po) =>
            navigateToEntity({
              tab: 'purchase-orders',
              entityId: po.id,
              action: 'view',
            })
          }
        />
      )}

      {/* Report 5: Stock Movement Summary */}
      {activeReport === 'movement-summary' && (
        <DataTable
          columns={[
            {
              key: 'sku',
              header: 'SKU',
              render: (r) => (
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {r.product.SKU}
                </span>
              ),
            },
            {
              key: 'name',
              header: 'Product',
              render: (r) => (
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {r.product.name}
                </span>
              ),
            },
            {
              key: 'txCount',
              header: 'Ledger Entries',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {r.movementCount}
                </span>
              ),
            },
            {
              key: 'in',
              header: 'Total IN',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{r.totalIn}
                </span>
              ),
            },
            {
              key: 'out',
              header: 'Total OUT',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  -{r.totalOut}
                </span>
              ),
            },
            {
              key: 'adj',
              header: 'Net Adjustments',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {r.totalAdj > 0 ? `+${r.totalAdj}` : r.totalAdj}
                </span>
              ),
            },
            {
              key: 'ending',
              header: 'Current Stock',
              align: 'right',
              render: (r) => (
                <span className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {r.product.quantityInStock} {r.product.unit}
                </span>
              ),
            },
          ]}
          data={movementSummaryRows}
          rowKey={(r) => r.product.id}
        />
      )}
    </div>
  );
};
