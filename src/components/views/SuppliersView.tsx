import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Edit3,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Scale,
  Search,
  ShoppingCart,
  Star,
  Trash2,
} from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import { useStockTrack } from '../../store/StockTrackContext';
import { Supplier, SupplierStatus } from '../../types';
import { formatCurrency } from '../../domain/businessRules';
import { ColumnDef, DataTable } from '../ui/DataTable';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { PoStatusBadge, SupplierStatusBadge } from '../ui/StatusBadge';
import { StatCard } from '../ui/StatCard';

interface SupplierFormState {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: string;
  rating: string;
  status: SupplierStatus;
  notes: string;
}

const emptySupplierForm = (): SupplierFormState => ({
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  paymentTerms: 'Net 30',
  leadTimeDays: '5',
  rating: '4.5',
  status: 'Active',
  notes: '',
});

export const SuppliersView: React.FC = () => {
  const {
    suppliers,
    products,
    currency,
    isHydrating,
    suppliersWithMetrics,
    getSupplierCatalog,
    getSupplierOrders,
    getComparisonForProduct,
    addSupplier,
    updateSupplier,
    toggleSupplierStatus,
    upsertSupplierProduct,
    removeSupplierProduct,
  } = useSuppliers();

  const { deepLink, clearDeepLink, navigateToEntity } = useStockTrack();

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SupplierStatus>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Product Supplier Comparison tool state
  const [compareProductId, setCompareProductId] = useState<string>(
    () => products[0]?.id ?? ''
  );

  // Add/Edit Supplier Modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formState, setFormState] = useState<SupplierFormState>(emptySupplierForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Deactivate confirm
  const [deactivatingSupplier, setDeactivatingSupplier] = useState<Supplier | null>(null);

  // Link Product to Supplier Catalog Modal
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogProductId, setCatalogProductId] = useState('');
  const [catalogPrice, setCatalogPrice] = useState('');
  const [catalogMoq, setCatalogMoq] = useState('10');

  useEffect(() => {
    if (deepLink && deepLink.tab === 'suppliers') {
      if (deepLink.entityId) {
        setSelectedSupplierId(deepLink.entityId);
      }
      clearDeepLink();
    }
  }, [deepLink, clearDeepLink]);

  useEffect(() => {
    if (!compareProductId && products.length > 0) {
      setCompareProductId(products[0].id);
    }
  }, [products, compareProductId]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliersWithMetrics.filter(({ supplier }) => {
      if (statusFilter !== 'ALL' && supplier.status !== statusFilter) return false;
      if (q) {
        const match =
          supplier.name.toLowerCase().includes(q) ||
          supplier.contactPerson.toLowerCase().includes(q) ||
          supplier.email.toLowerCase().includes(q) ||
          supplier.phone.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [suppliersWithMetrics, search, statusFilter]);

  const selectedProfile = useMemo(
    () =>
      suppliersWithMetrics.find((entry) => entry.supplier.id === selectedSupplierId) ??
      null,
    [suppliersWithMetrics, selectedSupplierId]
  );

  const comparisonProduct = useMemo(
    () => products.find((p) => p.id === compareProductId) ?? null,
    [products, compareProductId]
  );

  const comparisonRows = useMemo(
    () => (comparisonProduct ? getComparisonForProduct(comparisonProduct) : []),
    [comparisonProduct, getComparisonForProduct]
  );

  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setFormState(emptySupplierForm());
    setFormErrors({});
    setIsSupplierModalOpen(true);
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormState({
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      paymentTerms: supplier.paymentTerms,
      leadTimeDays: String(supplier.leadTimeDays),
      rating: String(supplier.rating),
      status: supplier.status,
      notes: supplier.notes,
    });
    setFormErrors({});
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formState.name.trim()) errors.name = 'Supplier name is required.';
    if (!formState.contactPerson.trim()) errors.contactPerson = 'Contact person is required.';
    if (!formState.email.trim() || !formState.email.includes('@')) {
      errors.email = 'Valid email address is required.';
    }
    const leadDays = Number(formState.leadTimeDays);
    if (!Number.isInteger(leadDays) || leadDays < 1) {
      errors.leadTimeDays = 'Lead time must be at least 1 day.';
    }
    const ratingNum = Number(formState.rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      errors.rating = 'Rating must be between 1 and 5.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload: Omit<Supplier, 'id'> = {
      name: formState.name.trim(),
      contactPerson: formState.contactPerson.trim(),
      email: formState.email.trim(),
      phone: formState.phone.trim(),
      address: formState.address.trim(),
      paymentTerms: formState.paymentTerms.trim() || 'Net 30',
      leadTimeDays: leadDays,
      rating: Number(ratingNum.toFixed(1)),
      status: formState.status,
      notes: formState.notes.trim(),
    };

    if (editingSupplier) {
      updateSupplier(editingSupplier.id, payload);
    } else {
      addSupplier(payload);
    }
    setIsSupplierModalOpen(false);
  };

  const openCatalogLinkModal = (supplierId: string) => {
    const defaultProd = products[0];
    setCatalogProductId(defaultProd?.id ?? '');
    setCatalogPrice(defaultProd ? String(defaultProd.costPrice) : '0');
    setCatalogMoq('10');
    setSelectedSupplierId(supplierId);
    setIsCatalogModalOpen(true);
  };

  const handleSaveCatalogLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !catalogProductId) return;
    const price = Math.max(0, Number(catalogPrice) || 0);
    const moq = Math.max(1, Math.floor(Number(catalogMoq) || 1));
    upsertSupplierProduct({
      supplierId: selectedSupplierId,
      productId: catalogProductId,
      supplierPrice: price,
      minOrderQty: moq,
    });
    setIsCatalogModalOpen(false);
  };

  // --- Supplier Profile Detail View ---
  if (selectedProfile) {
    const { supplier, metrics } = selectedProfile;
    const catalog = getSupplierCatalog(supplier.id);
    const supplierOrders = getSupplierOrders(supplier.id);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setSelectedSupplierId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Suppliers</span>
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {supplier.name}
              </h1>
              <SupplierStatusBadge status={supplier.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Payment Terms: {supplier.paymentTerms} · Standard Lead Time: {supplier.leadTimeDays} days · Rating: {supplier.rating.toFixed(1)} / 5.0
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openEditSupplier(supplier)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (supplier.status === 'Active') {
                  setDeactivatingSupplier(supplier);
                } else {
                  toggleSupplierStatus(supplier.id);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{supplier.status === 'Active' ? 'Deactivate' : 'Reactivate'}</span>
            </button>
            {supplier.status === 'Active' && (
              <button
                type="button"
                onClick={() =>
                  navigateToEntity({
                    tab: 'purchase-orders',
                    action: 'create-po-for-supplier',
                    supplierId: supplier.id,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Create PO</span>
              </button>
            )}
          </div>
        </div>

        {/* Supplier Performance Scorecard */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Spend"
            value={formatCurrency(metrics.totalSpend, currency)}
            subtext={`Across ${metrics.totalOrdersCount} non-cancelled POs`}
          />
          <StatCard
            label="On-Time Delivery Rate"
            value={
              metrics.onTimeDeliveryRate !== null
                ? `${metrics.onTimeDeliveryRate}%`
                : 'No completed POs'
            }
            subtext={`${metrics.receivedOrdersCount} received orders`}
            tone={
              metrics.onTimeDeliveryRate === null
                ? 'default'
                : metrics.onTimeDeliveryRate >= 85
                ? 'positive'
                : metrics.onTimeDeliveryRate >= 70
                ? 'warning'
                : 'critical'
            }
          />
          <StatCard
            label="Average Lead Time"
            value={`${metrics.averageLeadTimeDays} days`}
            subtext={`Quoted SLA: ${supplier.leadTimeDays} days`}
          />
          <StatCard
            label="Supplier Rating"
            value={`${supplier.rating.toFixed(1)} / 5.0`}
            subtext={`${metrics.openOrdersCount} open PO(s)`}
          />
        </div>

        {/* Contact & Terms Block */}
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Primary Contact
            </span>
            <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
              {supplier.contactPerson}
            </p>
            <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <p className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{supplier.email}</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-mono tabular-nums">{supplier.phone || '—'}</span>
              </p>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Facility &amp; Dispatch Address
            </span>
            <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{supplier.address || 'No address specified'}</span>
            </p>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Procurement Notes
            </span>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {supplier.notes || 'No special procurement notes on file.'}
            </p>
          </div>
        </div>

        {/* Products Supplied Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100">
                Supplied Products &amp; Contract Pricing ({catalog.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Prices automatically populate when creating Purchase Orders for {supplier.name}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCatalogLinkModal(supplier.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Link Product Price</span>
            </button>
          </div>

          <DataTable
            columns={[
              {
                key: 'sku',
                header: 'SKU',
                render: ({ product }) => (
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {product.SKU}
                  </span>
                ),
              },
              {
                key: 'name',
                header: 'Product Name',
                render: ({ product }) => (
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {product.name}
                  </span>
                ),
              },
              {
                key: 'stock',
                header: 'Current Stock',
                align: 'right',
                render: ({ product }) => (
                  <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {product.quantityInStock} {product.unit}
                  </span>
                ),
              },
              {
                key: 'moq',
                header: 'Min Order Qty',
                align: 'right',
                render: ({ link, product }) => (
                  <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {link.minOrderQty} {product.unit}
                  </span>
                ),
              },
              {
                key: 'price',
                header: 'Supplier Price',
                align: 'right',
                render: ({ link }) => (
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatCurrency(link.supplierPrice, currency)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: ({ link, product }) => (
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCatalogProductId(product.id);
                        setCatalogPrice(String(link.supplierPrice));
                        setCatalogMoq(String(link.minOrderQty));
                        setIsCatalogModalOpen(true);
                      }}
                      className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      Edit Price
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSupplierProduct(supplier.id, product.id)}
                      aria-label={`Remove ${product.name} from supplier`}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              },
            ]}
            data={catalog}
            rowKey={({ product }) => product.id}
            emptyTitle="No catalog products linked"
            emptyDescription="Link products with negotiated supplier prices and MOQs."
            emptyActionLabel="Link Product Price"
            onEmptyAction={() => openCatalogLinkModal(supplier.id)}
          />
        </div>

        {/* Full Purchase Order History */}
        <div className="space-y-3">
          <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100">
            Purchase Order History ({supplierOrders.length})
          </h2>
          <DataTable
            columns={[
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
                key: 'orderDate',
                header: 'Order Date',
                render: (po) => (
                  <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {po.orderDate}
                  </span>
                ),
              },
              {
                key: 'expectedDate',
                header: 'Expected / Received',
                render: (po) => (
                  <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    Due {po.expectedDate}
                    {po.receivedDate ? ` · Recv ${po.receivedDate}` : ''}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (po) => <PoStatusBadge status={po.status} />,
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
            ]}
            data={supplierOrders}
            rowKey={(po) => po.id}
            onRowClick={(po) =>
              navigateToEntity({
                tab: 'purchase-orders',
                entityId: po.id,
                action: 'view',
              })
            }
            emptyTitle="No purchase orders yet"
            emptyDescription="Create your first Purchase Order for this supplier."
          />
        </div>

        {/* Modals reused inside profile view */}
        <Modal
          isOpen={isCatalogModalOpen}
          onClose={() => setIsCatalogModalOpen(false)}
          title="Link Product & Contract Price"
          subtitle={`Set negotiated unit price and MOQ for ${supplier.name}.`}
          maxWidthClass="max-w-md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="catalog-link-form"
                className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
              >
                Save Pricing
              </button>
            </>
          }
        >
          <form id="catalog-link-form" onSubmit={handleSaveCatalogLink} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Product
              </label>
              <select
                value={catalogProductId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setCatalogProductId(pid);
                  const prod = products.find((p) => p.id === pid);
                  if (prod) setCatalogPrice(String(prod.costPrice));
                }}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.SKU} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Supplier Unit Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={catalogPrice}
                  onChange={(e) => setCatalogPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Min Order Qty (MOQ)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={catalogMoq}
                  onChange={(e) => setCatalogMoq(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          isOpen={Boolean(deactivatingSupplier)}
          onClose={() => setDeactivatingSupplier(null)}
          onConfirm={() => {
            if (deactivatingSupplier) toggleSupplierStatus(deactivatingSupplier.id);
          }}
          title="Deactivate Supplier"
          description={
            deactivatingSupplier
              ? `Mark "${deactivatingSupplier.name}" as Inactive? Inactive suppliers remain in historical PO reports but are excluded from auto-suggested reorders.`
              : ''
          }
          confirmLabel="Deactivate Supplier"
          variant="warning"
        />

        {renderSupplierFormModal()}
      </div>
    );
  }

  function renderSupplierFormModal() {
    return (
      <Modal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        title={editingSupplier ? `Edit Supplier · ${editingSupplier.name}` : 'Add New Supplier'}
        subtitle="Maintain contact details, payment terms, and expected lead times."
        maxWidthClass="max-w-xl"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsSupplierModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="supplier-form"
              className="px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
            >
              {editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={handleSaveSupplier} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Company Name *
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                placeholder="Bharat Switchgear & Controls"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              {formErrors.name && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contact Person *
              </label>
              <input
                type="text"
                value={formState.contactPerson}
                onChange={(e) =>
                  setFormState({ ...formState, contactPerson: e.target.value })
                }
                placeholder="Vikram Deshmukh"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              {formErrors.contactPerson && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {formErrors.contactPerson}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={formState.email}
                onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                placeholder="orders@supplier.in"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              {formErrors.email && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={formState.phone}
                onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                placeholder="+91 98204 71200"
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Address
            </label>
            <input
              type="text"
              value={formState.address}
              onChange={(e) => setFormState({ ...formState, address: e.target.value })}
              placeholder="Plot 42, Industrial Area, Pune"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Payment Terms
              </label>
              <select
                value={formState.paymentTerms}
                onChange={(e) =>
                  setFormState({ ...formState, paymentTerms: e.target.value })
                }
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Advance 50%">Advance 50%</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Lead Time (Days)
              </label>
              <input
                type="number"
                min="1"
                value={formState.leadTimeDays}
                onChange={(e) =>
                  setFormState({ ...formState, leadTimeDays: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              {formErrors.leadTimeDays && (
                <p className="mt-1 text-xs text-red-600">{formErrors.leadTimeDays}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rating (1–5)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formState.rating}
                onChange={(e) => setFormState({ ...formState, rating: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
              {formErrors.rating && (
                <p className="mt-1 text-xs text-red-600">{formErrors.rating}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Status
              </label>
              <select
                value={formState.status}
                onChange={(e) =>
                  setFormState({ ...formState, status: e.target.value as SupplierStatus })
                }
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              placeholder="Delivery schedules, volume discounts, or quality notes..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
            />
          </div>
        </form>
      </Modal>
    );
  }

  const supplierTableColumns: ColumnDef<(typeof suppliersWithMetrics)[number]>[] = [
    {
      key: 'name',
      header: 'Supplier',
      render: ({ supplier, suppliedProductsCount }) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{supplier.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {supplier.contactPerson} · {suppliedProductsCount} SKUs · {supplier.paymentTerms}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: ({ supplier }) => <SupplierStatusBadge status={supplier.status} />,
    },
    {
      key: 'leadTime',
      header: 'Avg Lead Time',
      align: 'right',
      render: ({ supplier, metrics }) => (
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
          {metrics.averageLeadTimeDays}d (SLA {supplier.leadTimeDays}d)
        </span>
      ),
    },
    {
      key: 'onTime',
      header: 'On-Time %',
      align: 'right',
      render: ({ metrics }) => (
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            metrics.onTimeDeliveryRate === null
              ? 'text-slate-400'
              : metrics.onTimeDeliveryRate >= 85
              ? 'text-emerald-600 dark:text-emerald-400'
              : metrics.onTimeDeliveryRate >= 70
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {metrics.onTimeDeliveryRate !== null ? `${metrics.onTimeDeliveryRate}%` : '—'}
        </span>
      ),
    },
    {
      key: 'spend',
      header: 'Total Spend',
      align: 'right',
      render: ({ metrics }) => (
        <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatCurrency(metrics.totalSpend, currency)}
        </span>
      ),
    },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      render: ({ supplier }) => (
        <span className="inline-flex items-center justify-end gap-1 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>{supplier.rating.toFixed(1)}</span>
        </span>
      ),
    },
  ];

  // --- Main Suppliers Directory + Comparison View ---
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Supplier Directory &amp; Scorecards
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track vendor lead times, on-time delivery performance, and compare SKU sourcing costs.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateSupplier}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Toolbar: Search, Active/Inactive Filter, Cards/Table Toggle */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by company, contact person, email, or phone..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg">
            {(['ALL', 'Active', 'Inactive'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {st === 'ALL' ? 'All' : st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              aria-label="Card view"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Supplier Cards or Table */}
      {viewMode === 'table' ? (
        <DataTable
          columns={supplierTableColumns}
          data={filteredSuppliers}
          rowKey={({ supplier }) => supplier.id}
          isLoading={isHydrating}
          onRowClick={({ supplier }) => setSelectedSupplierId(supplier.id)}
          emptyTitle="No suppliers found"
          emptyDescription="Add a supplier or clear your active search filter."
          emptyActionLabel="Add Supplier"
          onEmptyAction={openCreateSupplier}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredSuppliers.map(({ supplier, metrics, suppliedProductsCount }) => (
            <div
              key={supplier.id}
              onClick={() => setSelectedSupplierId(supplier.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedSupplierId(supplier.id);
                }
              }}
              className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {supplier.name}
                  </h3>
                  <SupplierStatusBadge status={supplier.status} />
                </div>

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {supplier.contactPerson} · {supplier.paymentTerms} ·{' '}
                  <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500 inline" />
                    {supplier.rating.toFixed(1)}
                  </span>
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Total Spend</span>
                    <span className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 block">
                      {formatCurrency(metrics.totalSpend, currency, true)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">On-Time %</span>
                    <span
                      className={`mt-0.5 font-mono font-semibold tabular-nums block ${
                        metrics.onTimeDeliveryRate === null
                          ? 'text-slate-400'
                          : metrics.onTimeDeliveryRate >= 85
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : metrics.onTimeDeliveryRate >= 70
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {metrics.onTimeDeliveryRate !== null
                        ? `${metrics.onTimeDeliveryRate}%`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">Lead Time</span>
                    <span className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 block">
                      {metrics.averageLeadTimeDays}d
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {suppliedProductsCount} SKUs · {metrics.totalOrdersCount} POs
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEditSupplier(supplier)}
                    className="font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplierId(supplier.id)}
                    className="font-semibold text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    Open Scorecard →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Supplier Comparison Tool (Cheapest vs Fastest per Product) */}
      <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Scale className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-slate-100">
                Supplier Sourcing Comparison (Cheapest vs. Fastest)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any SKU to compare unit pricing, MOQ, quoted vs. actual lead times, and on-time reliability.
              </p>
            </div>
          </div>

          <select
            aria-label="Select product to compare suppliers"
            value={compareProductId}
            onChange={(e) => setCompareProductId(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600 sm:max-w-xs w-full"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.SKU} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={[
            {
              key: 'supplier',
              header: 'Supplier & Recommendations',
              render: (row) => (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSupplierId(row.supplier.id)}
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      {row.supplier.name}
                    </button>
                    <SupplierStatusBadge status={row.supplier.status} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>{row.supplier.paymentTerms}</span>
                    {row.isPreferred && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-teal-700 dark:text-teal-400">
                          Preferred Vendor
                        </span>
                      </>
                    )}
                    {row.isCheapest && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Best Unit Price
                        </span>
                      </>
                    )}
                    {row.isFastest && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-sky-700 dark:text-sky-400">
                          Fastest Lead Time
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'price',
              header: 'Unit Price',
              align: 'right',
              render: (row) => (
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatCurrency(row.unitPrice, currency)}
                </span>
              ),
            },
            {
              key: 'moq',
              header: 'MOQ',
              align: 'right',
              render: (row) => (
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {row.minOrderQty} {comparisonProduct?.unit}
                </span>
              ),
            },
            {
              key: 'lead',
              header: 'Quoted / Avg Lead',
              align: 'right',
              render: (row) => (
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {row.leadTimeDays}d / {row.actualAvgLeadTimeDays}d
                </span>
              ),
            },
            {
              key: 'ontime',
              header: 'On-Time Rate',
              align: 'right',
              render: (row) => (
                <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                  {row.onTimeDeliveryRate !== null ? `${row.onTimeDeliveryRate}%` : '—'}
                </span>
              ),
            },
            {
              key: 'order',
              header: 'Action',
              align: 'right',
              render: (row) =>
                row.supplier.status === 'Active' && comparisonProduct ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigateToEntity({
                        tab: 'purchase-orders',
                        action: 'create-po-for-product',
                        supplierId: row.supplier.id,
                        productId: comparisonProduct.id,
                        unitPrice: row.unitPrice,
                      })
                    }
                    className="px-3 py-1.5 text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-colors whitespace-nowrap shrink-0"
                  >
                    Create PO
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Inactive</span>
                ),
            },
          ]}
          data={comparisonRows}
          rowKey={(row) => row.supplier.id}
          emptyTitle="No suppliers linked to this product"
          emptyDescription="Open a supplier scorecard to link negotiated SKU pricing."
        />
      </div>

      {renderSupplierFormModal()}
    </div>
  );
};
