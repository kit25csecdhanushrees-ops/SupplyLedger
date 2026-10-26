import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Edit3,
  Eye,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
} from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { useStockTrack } from '../../store/StockTrackContext';
import {
  Product,
  ProductUnit,
  StockMovementReason,
  StockMovementType,
  StockStatus,
} from '../../types';
import { formatCurrency } from '../../domain/businessRules';
import { downloadTextFile } from '../../utils/download';
import { ColumnDef, DataTable } from '../ui/DataTable';
import { ConfirmDialog, Drawer, Modal } from '../ui/Modal';
import { MovementTypeBadge, StockStatusBadge } from '../ui/StatusBadge';
import { StatCard } from '../ui/StatCard';

const PRODUCT_UNITS: ProductUnit[] = [
  'pcs',
  'box',
  'pack',
  'kg',
  'roll',
  'meter',
  'liter',
  'set',
];

const ADJUST_REASONS: StockMovementReason[] = [
  'Sale',
  'Purchase',
  'Correction',
  'Damage',
  'Return',
];

interface ProductFormState {
  name: string;
  SKU: string;
  category: string;
  description: string;
  unit: ProductUnit;
  costPrice: string;
  sellingPrice: string;
  quantityInStock: string;
  reorderLevel: string;
  reorderQuantity: string;
  preferredSupplierId: string;
  location: string;
}

const emptyProductForm = (defaultSupplierId = '', defaultThreshold = 12): ProductFormState => ({
  name: '',
  SKU: '',
  category: 'Electrical',
  description: '',
  unit: 'pcs',
  costPrice: '',
  sellingPrice: '',
  quantityInStock: '0',
  reorderLevel: String(defaultThreshold),
  reorderQuantity: '25',
  preferredSupplierId: defaultSupplierId,
  location: 'Whse A · Aisle 01 · Bin A1',
});

export const InventoryView: React.FC = () => {
  const {
    products,
    suppliers,
    supplierProducts,
    currency,
    defaultLowStockThreshold,
    isHydrating,
    categories,
    inventorySummary,
    getProductStatus,
    getProductSuppliers,
    getProductMovements,
    exportCsvString,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStock,
    importProductsCsv,
  } = useInventory();

  const { deepLink, clearDeepLink, navigateToEntity, addToast } = useStockTrack();

  // Filters & Table state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StockStatus>('ALL');
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Modals & Drawers
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [formState, setFormState] = useState<ProductFormState>(() =>
    emptyProductForm(suppliers[0]?.id ?? '', defaultLowStockThreshold)
  );
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete confirmation
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  // Quick Stock Adjust Modal
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustDirection, setAdjustDirection] = useState<'ADD' | 'DEDUCT'>('ADD');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState<StockMovementReason>('Correction');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState('');

  // CSV Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle deep links from Dashboard, Global Search, or Header Alerts
  useEffect(() => {
    if (deepLink && deepLink.tab === 'inventory') {
      if (deepLink.entityId) {
        setDetailProductId(deepLink.entityId);
      }
      clearDeepLink();
    }
  }, [deepLink, clearDeepLink]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, supplierFilter, statusFilter]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();

    const filtered = products.filter((p) => {
      if (q) {
        const matchesQuery =
          p.name.toLowerCase().includes(q) ||
          p.SKU.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) {
        return false;
      }

      if (supplierFilter !== 'ALL') {
        const linkedToSupplier =
          p.preferredSupplierId === supplierFilter ||
          supplierProducts.some(
            (sp) => sp.productId === p.id && sp.supplierId === supplierFilter
          );
        if (!linkedToSupplier) return false;
      }

      if (statusFilter !== 'ALL') {
        if (getProductStatus(p) !== statusFilter) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'SKU':
          cmp = a.SKU.localeCompare(b.SKU);
          break;
        case 'category':
          cmp = a.category.localeCompare(b.category);
          break;
        case 'quantityInStock':
          cmp = a.quantityInStock - b.quantityInStock;
          break;
        case 'costPrice':
          cmp = a.costPrice - b.costPrice;
          break;
        case 'sellingPrice':
          cmp = a.sellingPrice - b.sellingPrice;
          break;
        case 'stockValue':
          cmp = a.quantityInStock * a.costPrice - b.quantityInStock * b.costPrice;
          break;
        case 'name':
        default:
          cmp = a.name.localeCompare(b.name);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    products,
    search,
    categoryFilter,
    supplierFilter,
    statusFilter,
    sortKey,
    sortDir,
    supplierProducts,
    getProductStatus,
  ]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, page]);

  const handleSortChange = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormState(
      emptyProductForm(
        suppliers.find((s) => s.status === 'Active')?.id ?? suppliers[0]?.id ?? '',
        defaultLowStockThreshold
      )
    );
    setFormErrors({});
    setIsProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormState({
      name: product.name,
      SKU: product.SKU,
      category: product.category,
      description: product.description,
      unit: product.unit,
      costPrice: String(product.costPrice),
      sellingPrice: String(product.sellingPrice),
      quantityInStock: String(product.quantityInStock),
      reorderLevel: String(product.reorderLevel),
      reorderQuantity: String(product.reorderQuantity),
      preferredSupplierId: product.preferredSupplierId,
      location: product.location,
    });
    setFormErrors({});
    setIsProductModalOpen(true);
  };

  const validateAndSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    const trimmedName = formState.name.trim();
    const trimmedSku = formState.SKU.trim().toUpperCase();
    const trimmedCategory = formState.category.trim();

    if (!trimmedName) errors.name = 'Product name is required.';
    if (!trimmedSku) errors.SKU = 'Unique SKU is required.';
    else {
      const duplicate = products.some(
        (p) =>
          p.id !== editingProduct?.id &&
          p.SKU.trim().toUpperCase() === trimmedSku
      );
      if (duplicate) {
        errors.SKU = `SKU "${trimmedSku}" is already in use.`;
      }
    }
    if (!trimmedCategory) errors.category = 'Category is required.';

    const costPrice = Number(formState.costPrice);
    const sellingPrice = Number(formState.sellingPrice);
    const quantityInStock = Number(formState.quantityInStock);
    const reorderLevel = Number(formState.reorderLevel);
    const reorderQuantity = Number(formState.reorderQuantity);

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      errors.costPrice = 'Enter a non-negative cost price.';
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      errors.sellingPrice = 'Enter a non-negative selling price.';
    }
    if (!Number.isInteger(quantityInStock) || quantityInStock < 0) {
      errors.quantityInStock = 'Stock quantity must be a whole number >= 0.';
    }
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      errors.reorderLevel = 'Reorder level must be a whole number >= 0.';
    }
    if (!Number.isInteger(reorderQuantity) || reorderQuantity < 1) {
      errors.reorderQuantity = 'Reorder quantity must be at least 1.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload = {
      name: trimmedName,
      SKU: trimmedSku,
      category: trimmedCategory,
      description: formState.description.trim(),
      unit: formState.unit,
      costPrice,
      sellingPrice,
      quantityInStock,
      reorderLevel,
      reorderQuantity,
      preferredSupplierId: formState.preferredSupplierId,
      location: formState.location.trim() || 'Main Warehouse',
    };

    const result = editingProduct
      ? updateProduct(editingProduct.id, payload)
      : addProduct(payload);

    if (!result.ok) {
      setFormErrors({ SKU: result.error || 'Validation failed.' });
      return;
    }

    setIsProductModalOpen(false);
  };

  const openQuickAdjust = (product: Product, direction: 'ADD' | 'DEDUCT') => {
    setAdjustingProduct(product);
    setAdjustDirection(direction);
    setAdjustQty('1');
    setAdjustReason(direction === 'ADD' ? 'Correction' : 'Sale');
    setAdjustNote('');
    setAdjustError('');
  };

  const handleSubmitQuickAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    const qty = parseInt(adjustQty, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setAdjustError('Enter a positive whole quantity.');
      return;
    }
    if (!adjustReason) {
      setAdjustError('Reason is required.');
      return;
    }

    const delta = adjustDirection === 'ADD' ? qty : -qty;
    let type: StockMovementType = adjustDirection === 'ADD' ? 'IN' : 'OUT';
    if (adjustReason === 'Correction' || adjustReason === 'Damage') {
      type = 'ADJUSTMENT';
    }

    const res = adjustProductStock({
      productId: adjustingProduct.id,
      delta,
      type,
      reason: adjustReason,
      note: adjustNote,
    });

    if (!res.ok) {
      setAdjustError(res.error || 'Could not adjust stock.');
      return;
    }

    setAdjustingProduct(null);
  };

  const handleExportCsv = () => {
    const csv = exportCsvString();
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`stocktrack_inventory_${dateStamp}.csv`, csv);
    addToast('success', 'Inventory exported', `Downloaded ${products.length} products as CSV.`);
  };

  const handleDownloadSampleCsv = () => {
    const sample = [
      'SKU,Name,Category,Description,Unit,CostPrice,SellingPrice,QuantityInStock,ReorderLevel,ReorderQuantity,PreferredSupplier,Location',
      'ELC-9010,16A Industrial Plug Socket IP44,Electrical,Weatherproof 3-pin industrial socket,pcs,310,460,35,12,30,Bharat Switchgear & Controls,Whse A · Aisle 01',
      'SAF-4022,High-Visibility Reflective Vest,Safety Gear,ANSI Class 2 polyester safety vest,pcs,160,260,45,15,50,Suraksha Industrial Safety Corp,Whse B · Aisle 03',
    ].join('\n');
    downloadTextFile('stocktrack_sample_import.csv', sample);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleRunCsvImport = () => {
    const { importedCount, skipped } = importProductsCsv(csvText);
    setImportFeedback(skipped);
    if (importedCount > 0 && skipped.length === 0) {
      setIsImportModalOpen(false);
      setCsvText('');
    }
  };

  const detailProduct = useMemo(
    () => products.find((p) => p.id === detailProductId) ?? null,
    [products, detailProductId]
  );

  const columns: ColumnDef<Product>[] = [
    {
      key: 'name',
      header: 'Product & Metadata',
      sortable: true,
      render: (product) => {
        const prefSupplier = suppliers.find((s) => s.id === product.preferredSupplierId);
        return (
          <div className="min-w-[210px]">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {product.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono text-slate-700 dark:text-slate-300">{product.SKU}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category}</span>
              {prefSupplier && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[160px]">{prefSupplier.name}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'location',
      header: 'Location',
      render: (product) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
          {product.location}
        </span>
      ),
    },
    {
      key: 'quantityInStock',
      header: 'In Stock',
      align: 'right',
      sortable: true,
      render: (product) => (
        <div
          className="inline-flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => openQuickAdjust(product, 'DEDUCT')}
            title="Deduct stock (-)"
            aria-label={`Deduct stock for ${product.name}`}
            className="w-6 h-6 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="min-w-[68px] text-right">
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {product.quantityInStock}
            </span>{' '}
            <span className="text-xs text-slate-500 dark:text-slate-400">{product.unit}</span>
          </div>
          <button
            type="button"
            onClick={() => openQuickAdjust(product, 'ADD')}
            title="Add stock (+)"
            aria-label={`Add stock for ${product.name}`}
            className="w-6 h-6 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => <StockStatusBadge status={getProductStatus(product)} />,
    },
    {
      key: 'costPrice',
      header: 'Cost',
      align: 'right',
      sortable: true,
      render: (product) => (
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
          {formatCurrency(product.costPrice, currency)}
        </span>
      ),
    },
    {
      key: 'sellingPrice',
      header: 'Selling',
      align: 'right',
      sortable: true,
      render: (product) => (
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
          {formatCurrency(product.sellingPrice, currency)}
        </span>
      ),
    },
    {
      key: 'stockValue',
      header: 'Stock Value',
      align: 'right',
      sortable: true,
      render: (product) => (
        <span className="font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
          {formatCurrency(product.quantityInStock * product.costPrice, currency)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (product) => (
        <div
          className="inline-flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDetailProductId(product.id)}
            title="View details & stock timeline"
            aria-label={`View details for ${product.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => openEditModal(product)}
            title="Edit product"
            aria-label={`Edit ${product.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDeletingProduct(product)}
            title="Delete product"
            aria-label={`Delete ${product.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Primary Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Inventory Catalog
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage SKUs, bin locations, quick stock adjustments, and multi-supplier pricing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setImportFeedback([]);
              setIsImportModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>
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
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total SKUs"
          value={inventorySummary.totalProducts}
          subtext={`${categories.length} active categories`}
          onClick={() => setStatusFilter('ALL')}
        />
        <StatCard
          label="Cost Valuation"
          value={formatCurrency(inventorySummary.totalCostValue, currency)}
          subtext={`Retail: ${formatCurrency(inventorySummary.totalRetailValue, currency)}`}
        />
        <StatCard
          label="Low Stock SKUs"
          value={inventorySummary.lowStockCount}
          subtext="Click to filter Low Stock"
          tone={inventorySummary.lowStockCount > 0 ? 'warning' : 'default'}
          onClick={() =>
            setStatusFilter((prev) =>
              prev === StockStatus.LOW_STOCK ? 'ALL' : StockStatus.LOW_STOCK
            )
          }
        />
        <StatCard
          label="Out of Stock SKUs"
          value={inventorySummary.outOfStockCount}
          subtext="Click to filter Out of Stock"
          tone={inventorySummary.outOfStockCount > 0 ? 'critical' : 'default'}
          onClick={() =>
            setStatusFilter((prev) =>
              prev === StockStatus.OUT_OF_STOCK ? 'ALL' : StockStatus.OUT_OF_STOCK
            )
          }
        />
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by product name, SKU, category, or shelf..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by supplier"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="ALL">All Suppliers</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>

          {/* Interactive segmented status filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg">
            {(
              [
                { value: 'ALL', label: 'All' },
                { value: StockStatus.IN_STOCK, label: 'In Stock' },
                { value: StockStatus.LOW_STOCK, label: 'Low' },
                { value: StockStatus.OUT_OF_STOCK, label: 'Out' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === opt.value
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Inventory DataTable */}
      <DataTable
        columns={columns}
        data={paginatedProducts}
        rowKey={(p) => p.id}
        isLoading={isHydrating}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        page={page}
        pageSize={pageSize}
        totalItems={filteredAndSorted.length}
        onPageChange={setPage}
        onRowClick={(product) => setDetailProductId(product.id)}
        emptyTitle="No products match current filters"
        emptyDescription="Clear search filters or add a new SKU to start tracking stock levels and supplier pricing."
        emptyActionLabel="Add Product"
        onEmptyAction={openCreateModal}
      />

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? `Edit Product · ${editingProduct.SKU}` : 'Add New Product'}
        subtitle="SKUs must be unique and all prices/quantities must be non-negative."
        maxWidthClass="max-w-2xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsProductModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="product-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </>
        }
      >
        <form id="product-form" onSubmit={validateAndSubmitProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="e.g. 32A Triple-Pole MCB Breaker"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.name && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                SKU (Unique) *
              </label>
              <input
                type="text"
                value={formState.SKU}
                onChange={(e) =>
                  setFormState({ ...formState, SKU: e.target.value.toUpperCase() })
                }
                placeholder="ELC-32TP"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.SKU && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.SKU}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category *
              </label>
              <input
                type="text"
                list="inventory-categories"
                value={formState.category}
                onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                placeholder="Electrical"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <datalist id="inventory-categories">
                {categories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              {formErrors.category && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.category}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Unit of Measure
              </label>
              <select
                value={formState.unit}
                onChange={(e) =>
                  setFormState({ ...formState, unit: e.target.value as ProductUnit })
                }
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Preferred Supplier
              </label>
              <select
                value={formState.preferredSupplierId}
                onChange={(e) =>
                  setFormState({ ...formState, preferredSupplierId: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">None selected</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cost Price *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.costPrice}
                onChange={(e) => setFormState({ ...formState, costPrice: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.costPrice && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.costPrice}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Selling Price *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.sellingPrice}
                onChange={(e) => setFormState({ ...formState, sellingPrice: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.sellingPrice && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.sellingPrice}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Qty in Stock *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={formState.quantityInStock}
                onChange={(e) =>
                  setFormState({ ...formState, quantityInStock: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.quantityInStock && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.quantityInStock}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reorder Level *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={formState.reorderLevel}
                onChange={(e) => setFormState({ ...formState, reorderLevel: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.reorderLevel && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.reorderLevel}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reorder Qty *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formState.reorderQuantity}
                onChange={(e) =>
                  setFormState({ ...formState, reorderQuantity: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {formErrors.reorderQuantity && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.reorderQuantity}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Warehouse / Shelf Location
            </label>
            <input
              type="text"
              value={formState.location}
              onChange={(e) => setFormState({ ...formState, location: e.target.value })}
              placeholder="Whse A · Aisle 02 · Bin B4"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Technical Description
            </label>
            <textarea
              rows={2}
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              placeholder="Specifications, dimensions, or handling notes..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </form>
      </Modal>

      {/* Quick Stock Adjust Modal */}
      <Modal
        isOpen={Boolean(adjustingProduct)}
        onClose={() => setAdjustingProduct(null)}
        title={
          adjustingProduct
            ? `${adjustDirection === 'ADD' ? 'Increase' : 'Deduct'} Stock · ${adjustingProduct.SKU}`
            : 'Quick Stock Adjust'
        }
        subtitle={
          adjustingProduct
            ? `${adjustingProduct.name} · Current stock: ${adjustingProduct.quantityInStock} ${adjustingProduct.unit}`
            : undefined
        }
        maxWidthClass="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAdjustingProduct(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="quick-adjust-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Apply Stock Update
            </button>
          </>
        }
      >
        <form id="quick-adjust-form" onSubmit={handleSubmitQuickAdjust} className="space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setAdjustDirection('ADD');
                setAdjustReason('Correction');
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                adjustDirection === 'ADD'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              + Add Stock
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustDirection('DEDUCT');
                setAdjustReason('Sale');
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                adjustDirection === 'DEDUCT'
                  ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              - Deduct Stock
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Quantity ({adjustingProduct?.unit}) *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reason (Required) *
              </label>
              <select
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value as StockMovementReason)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Note / Reference
            </label>
            <input
              type="text"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="e.g. Cycle count audit or Customer dispatch SO-1402"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {adjustingProduct && Number.isInteger(parseInt(adjustQty, 10)) && parseInt(adjustQty, 10) > 0 && (
            <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">Resulting Stock Balance</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {adjustingProduct.quantityInStock +
                  (adjustDirection === 'ADD'
                    ? parseInt(adjustQty, 10)
                    : -parseInt(adjustQty, 10))}{' '}
                {adjustingProduct.unit}
              </span>
            </div>
          )}

          {adjustError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              {adjustError}
            </p>
          )}
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Products from CSV"
        subtitle="Upload a CSV file or paste CSV rows. Duplicate SKUs are automatically skipped."
        maxWidthClass="max-w-xl"
        footer={
          <>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="mr-auto text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              Download sample CSV template
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!csvText.trim()}
              onClick={handleRunCsvImport}
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Import Products
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Select a <code className="font-mono">.csv</code> file with columns:{' '}
              <span className="font-mono">SKU, Name, Category, Unit, CostPrice, SellingPrice, QuantityInStock</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Choose File
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              CSV Content Preview / Paste Area
            </label>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="SKU,Name,Category,Unit,CostPrice,SellingPrice,QuantityInStock,ReorderLevel,ReorderQuantity&#10;ELC-9010,16A Industrial Socket,Electrical,pcs,310,460,35,12,30"
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {importFeedback.length > 0 && (
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Import Notes ({importFeedback.length})
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 max-h-28 overflow-y-auto">
                {importFeedback.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Product Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        onConfirm={() => {
          if (deletingProduct) {
            if (detailProductId === deletingProduct.id) setDetailProductId(null);
            deleteProduct(deletingProduct.id);
          }
        }}
        title="Delete Product"
        description={
          deletingProduct
            ? `Permanently delete "${deletingProduct.name}" (${deletingProduct.SKU}) from inventory? Historical purchase orders will remain intact, but supplier catalog links for this SKU will be removed.`
            : ''
        }
        confirmLabel="Delete Product"
      />

      {/* Product Detail Drawer */}
      <Drawer
        isOpen={Boolean(detailProduct)}
        onClose={() => setDetailProductId(null)}
        title={detailProduct ? detailProduct.name : 'Product Details'}
        subtitle={
          detailProduct
            ? `${detailProduct.SKU} · ${detailProduct.category} · ${detailProduct.location}`
            : undefined
        }
        footer={
          detailProduct ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const p = detailProduct;
                  setDetailProductId(null);
                  openEditModal(p);
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Edit Product
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = detailProduct;
                  setDetailProductId(null);
                  navigateToEntity({
                    tab: 'purchase-orders',
                    action: 'create-po-for-product',
                    productId: p.id,
                    supplierId: p.preferredSupplierId,
                  });
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Create Purchase Order</span>
              </button>
            </>
          ) : undefined
        }
      >
        {detailProduct && (
          <div className="space-y-6">
            {/* Core Metrics */}
            <div className="grid grid-cols-3 gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">On Hand</span>
                <p className="mt-1 text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {detailProduct.quantityInStock}{' '}
                  <span className="text-xs font-normal text-slate-500">{detailProduct.unit}</span>
                </p>
                <div className="mt-1">
                  <StockStatusBadge status={getProductStatus(detailProduct)} />
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Unit Cost / Sell</span>
                <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(detailProduct.costPrice, currency)}
                </p>
                <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Sell: {formatCurrency(detailProduct.sellingPrice, currency)}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Reorder Rule</span>
                <p className="mt-1 text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  Min: {detailProduct.reorderLevel} {detailProduct.unit}
                </p>
                <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Order Qty: {detailProduct.reorderQuantity}
                </p>
              </div>
            </div>

            {detailProduct.description && (
              <div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Description
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {detailProduct.description}
                </p>
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                  Created {detailProduct.createdAt} · Last updated {detailProduct.updatedAt}
                </p>
              </div>
            )}

            {/* Linked Suppliers & Prices */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                  Linked Suppliers &amp; Unit Pricing
                </h3>
              </div>

              {getProductSuppliers(detailProduct).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No suppliers linked to this SKU yet.
                </p>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
                  {getProductSuppliers(detailProduct).map((row) => (
                    <div
                      key={row.supplier.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailProductId(null);
                            navigateToEntity({
                              tab: 'suppliers',
                              entityId: row.supplier.id,
                              action: 'view',
                            });
                          }}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                        >
                          {row.supplier.name}
                        </button>
                        <div className="mt-0.5 text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span>Lead: {row.leadTimeDays}d</span>
                          <span aria-hidden="true">·</span>
                          <span>MOQ: {row.minOrderQty}</span>
                          {row.isPreferred && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-teal-700 dark:text-teal-400 font-medium">
                                Preferred
                              </span>
                            </>
                          )}
                          {row.isCheapest && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                Lowest Price
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(row.unitPrice, currency)}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const p = detailProduct;
                            setDetailProductId(null);
                            navigateToEntity({
                              tab: 'purchase-orders',
                              action: 'create-po-for-product',
                              productId: p.id,
                              supplierId: row.supplier.id,
                              unitPrice: row.unitPrice,
                            });
                          }}
                          className="mt-0.5 text-teal-600 dark:text-teal-400 hover:underline font-medium"
                        >
                          Order SKU
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stock Movement Timeline */}
            <div>
              <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Stock Movement History
              </h3>

              {getProductMovements(detailProduct.id).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No stock movements recorded for this SKU yet.
                </p>
              ) : (
                <div className="space-y-3 border-l border-slate-200 dark:border-slate-800 ml-2 pl-4">
                  {getProductMovements(detailProduct.id).map((mov) => (
                    <div key={mov.id} className="relative text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <MovementTypeBadge type={mov.type} />
                          <span className="text-slate-500 dark:text-slate-400">
                            · {mov.reason}
                          </span>
                        </div>
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {mov.type === 'OUT'
                            ? `-${mov.quantity}`
                            : mov.type === 'IN'
                            ? `+${mov.quantity}`
                            : mov.quantity > 0
                            ? `+${mov.quantity}`
                            : mov.quantity}{' '}
                          {detailProduct.unit}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                        {mov.note}
                      </p>
                      <p className="mt-0.5 font-mono tabular-nums text-slate-400 dark:text-slate-500">
                        {mov.date} · Ref: {mov.reference}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
