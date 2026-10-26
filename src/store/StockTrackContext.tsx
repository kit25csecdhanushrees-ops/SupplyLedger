import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppSettings,
  NavigationTab,
  PersistedData,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  StockMovement,
  StockMovementReason,
  StockMovementType,
  Supplier,
  SupplierProduct,
  SystemAlert,
  ToastNotification,
} from '../types';
import { createSeedData } from '../data/seedData';
import {
  computeSystemAlerts,
  generateNextPoId,
  getReorderSuggestions,
  parseProductsFromCsv,
  receivePurchaseOrderItems,
  validateBackupData,
} from '../domain/businessRules';

const STORAGE_KEY = 'stocktrack_persisted_v1';

export interface DeepLinkTarget {
  tab: NavigationTab;
  entityId?: string;
  action?: 'view' | 'create-po-for-product' | 'create-po-for-supplier' | 'receive-po';
  supplierId?: string;
  productId?: string;
  unitPrice?: number;
}

interface StockTrackContextValue {
  data: PersistedData;
  isHydrating: boolean;
  activeTab: NavigationTab;
  deepLink: DeepLinkTarget | null;
  alerts: SystemAlert[];
  toasts: ToastNotification[];
  setActiveTab: (tab: NavigationTab) => void;
  navigateToEntity: (target: DeepLinkTarget) => void;
  clearDeepLink: () => void;
  addToast: (type: ToastNotification['type'], title: string, message?: string) => void;
  dismissToast: (id: string) => void;

  // Product actions
  addProduct: (payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => { ok: boolean; error?: string };
  updateProduct: (id: string, payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => { ok: boolean; error?: string };
  deleteProduct: (id: string) => void;
  adjustProductStock: (params: {
    productId: string;
    delta: number;
    type: StockMovementType;
    reason: StockMovementReason;
    reference?: string;
    note: string;
  }) => { ok: boolean; error?: string };
  importProductsCsv: (csvText: string) => { importedCount: number; skipped: string[] };

  // Supplier actions
  addSupplier: (payload: Omit<Supplier, 'id'>) => Supplier;
  updateSupplier: (id: string, payload: Omit<Supplier, 'id'>) => void;
  toggleSupplierStatus: (id: string) => void;
  upsertSupplierProduct: (link: SupplierProduct) => void;
  removeSupplierProduct: (supplierId: string, productId: string) => void;

  // Purchase Order actions
  createPurchaseOrder: (payload: {
    supplierId: string;
    items: PurchaseOrderItem[];
    status: PurchaseOrderStatus;
    orderDate: string;
    expectedDate: string;
    notes: string;
  }) => PurchaseOrder;
  updatePurchaseOrderStatus: (poId: string, nextStatus: PurchaseOrderStatus) => void;
  receivePurchaseOrder: (
    poId: string,
    receivedNowByProductId: Record<string, number>,
    receiveDate: string,
    note?: string
  ) => void;
  autoGenerateReorderDrafts: () => PurchaseOrder[];

  // Settings & Backup actions
  updateSettings: (patch: Partial<AppSettings>) => void;
  toggleTheme: () => void;
  resetDemoData: () => void;
  restoreBackupJson: (jsonText: string) => { ok: boolean; error?: string };
}

const StockTrackContext = createContext<StockTrackContextValue | null>(null);

function loadInitialData(): PersistedData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateBackupData(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to seed data if localStorage is unavailable or corrupt
  }
  const seeded = createSeedData();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // Ignore quota errors
  }
  return seeded;
}

export const StockTrackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<PersistedData>(() => loadInitialData());
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [activeTab, setActiveTabState] = useState<NavigationTab>('dashboard');
  const [deepLink, setDeepLink] = useState<DeepLinkTarget | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Brief initial hydration skeleton for polished loading UX
  useEffect(() => {
    const timer = window.setTimeout(() => setIsHydrating(false), 180);
    return () => window.clearTimeout(timer);
  }, []);

  // Persist to localStorage whenever data changes
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage quota exceptions
    }
  }, [data]);

  // Synchronize light/dark theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [data.settings.theme]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastNotification['type'], title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const setActiveTab = useCallback((tab: NavigationTab) => {
    setActiveTabState(tab);
  }, []);

  const navigateToEntity = useCallback((target: DeepLinkTarget) => {
    setActiveTabState(target.tab);
    setDeepLink(target);
  }, []);

  const clearDeepLink = useCallback(() => {
    setDeepLink(null);
  }, []);

  // --- Product CRUD & Stock Adjustments ---
  const addProduct = useCallback(
    (payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): { ok: boolean; error?: string } => {
      const normalizedSku = payload.SKU.trim().toUpperCase();
      if (!normalizedSku) {
        return { ok: false, error: 'SKU is required.' };
      }
      const duplicate = data.products.some(
        (p) => p.SKU.trim().toUpperCase() === normalizedSku
      );
      if (duplicate) {
        return { ok: false, error: `SKU "${normalizedSku}" already exists.` };
      }
      if (
        payload.costPrice < 0 ||
        payload.sellingPrice < 0 ||
        payload.quantityInStock < 0 ||
        payload.reorderLevel < 0 ||
        payload.reorderQuantity < 0
      ) {
        return { ok: false, error: 'Numeric values cannot be negative.' };
      }

      const today = new Date().toISOString().slice(0, 10);
      const newProduct: Product = {
        ...payload,
        SKU: normalizedSku,
        id: `prd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: today,
        updatedAt: today,
      };

      setData((prev) => {
        const nextSupplierProducts = [...prev.supplierProducts];
        if (
          newProduct.preferredSupplierId &&
          !nextSupplierProducts.some(
            (sp) =>
              sp.supplierId === newProduct.preferredSupplierId &&
              sp.productId === newProduct.id
          )
        ) {
          nextSupplierProducts.push({
            supplierId: newProduct.preferredSupplierId,
            productId: newProduct.id,
            supplierPrice: newProduct.costPrice,
            minOrderQty: Math.max(1, Math.min(10, newProduct.reorderQuantity || 1)),
          });
        }

        const nextMovements = [...prev.stockMovements];
        if (newProduct.quantityInStock > 0) {
          nextMovements.unshift({
            id: `mov-${Date.now()}`,
            productId: newProduct.id,
            type: 'IN',
            quantity: newProduct.quantityInStock,
            reason: 'Correction',
            reference: 'INIT-STOCK',
            date: today,
            note: 'Opening inventory balance',
          });
        }

        return {
          ...prev,
          products: [newProduct, ...prev.products],
          supplierProducts: nextSupplierProducts,
          stockMovements: nextMovements,
        };
      });

      addToast('success', 'Product created', `${newProduct.name} (${newProduct.SKU}) added to inventory.`);
      return { ok: true };
    },
    [data.products, addToast]
  );

  const updateProduct = useCallback(
    (
      id: string,
      payload: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
    ): { ok: boolean; error?: string } => {
      const normalizedSku = payload.SKU.trim().toUpperCase();
      const duplicate = data.products.some(
        (p) => p.id !== id && p.SKU.trim().toUpperCase() === normalizedSku
      );
      if (duplicate) {
        return { ok: false, error: `SKU "${normalizedSku}" is already assigned to another product.` };
      }
      if (
        payload.costPrice < 0 ||
        payload.sellingPrice < 0 ||
        payload.quantityInStock < 0 ||
        payload.reorderLevel < 0 ||
        payload.reorderQuantity < 0
      ) {
        return { ok: false, error: 'Numeric values cannot be negative.' };
      }

      const today = new Date().toISOString().slice(0, 10);
      setData((prev) => {
        const existing = prev.products.find((p) => p.id === id);
        if (!existing) return prev;

        const qtyDelta = payload.quantityInStock - existing.quantityInStock;
        const nextMovements = [...prev.stockMovements];
        if (qtyDelta !== 0) {
          nextMovements.unshift({
            id: `mov-${Date.now()}`,
            productId: id,
            type: 'ADJUSTMENT',
            quantity: qtyDelta,
            reason: 'Correction',
            reference: 'EDIT-PROD',
            date: today,
            note: `Stock edited from ${existing.quantityInStock} to ${payload.quantityInStock}`,
          });
        }

        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...payload,
                  SKU: normalizedSku,
                  updatedAt: today,
                }
              : p
          ),
          stockMovements: nextMovements,
        };
      });

      addToast('success', 'Product updated', `${payload.name} (${normalizedSku}) saved.`);
      return { ok: true };
    },
    [data.products, addToast]
  );

  const deleteProduct = useCallback(
    (id: string) => {
      const target = data.products.find((p) => p.id === id);
      setData((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== id),
        supplierProducts: prev.supplierProducts.filter((sp) => sp.productId !== id),
      }));
      if (target) {
        addToast('info', 'Product deleted', `${target.name} (${target.SKU}) removed.`);
      }
    },
    [data.products, addToast]
  );

  const adjustProductStock = useCallback(
    (params: {
      productId: string;
      delta: number;
      type: StockMovementType;
      reason: StockMovementReason;
      reference?: string;
      note: string;
    }): { ok: boolean; error?: string } => {
      const product = data.products.find((p) => p.id === params.productId);
      if (!product) {
        return { ok: false, error: 'Product not found.' };
      }
      if (params.delta === 0) {
        return { ok: false, error: 'Quantity change cannot be zero.' };
      }
      const nextQty = product.quantityInStock + params.delta;
      if (nextQty < 0) {
        return {
          ok: false,
          error: `Insufficient stock. Cannot deduct ${Math.abs(params.delta)} ${product.unit} from ${product.quantityInStock} ${product.unit}.`,
        };
      }

      const today = new Date().toISOString().slice(0, 10);
      const movementQty =
        params.type === 'ADJUSTMENT' ? params.delta : Math.abs(params.delta);

      const newMovement: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        type: params.type,
        quantity: movementQty,
        reason: params.reason,
        reference: params.reference?.trim() || `MAN-${String(Date.now()).slice(-4)}`,
        date: today,
        note: params.note.trim() || `${params.reason} stock update`,
      };

      setData((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.id === product.id
            ? { ...p, quantityInStock: nextQty, updatedAt: today }
            : p
        ),
        stockMovements: [newMovement, ...prev.stockMovements],
      }));

      addToast(
        'success',
        'Stock adjusted',
        `${product.name}: ${product.quantityInStock} → ${nextQty} ${product.unit} (${params.reason})`
      );
      return { ok: true };
    },
    [data.products, addToast]
  );

  const importProductsCsv = useCallback(
    (csvText: string) => {
      const { imported, skipped } = parseProductsFromCsv(
        csvText,
        data.products,
        data.suppliers
      );

      if (imported.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const createdProducts: Product[] = imported.map((item, idx) => ({
          ...item,
          id: `prd-imp-${Date.now()}-${idx}`,
          createdAt: today,
          updatedAt: today,
        }));

        const initialMovements: StockMovement[] = createdProducts
          .filter((p) => p.quantityInStock > 0)
          .map((p, idx) => ({
            id: `mov-imp-${Date.now()}-${idx}`,
            productId: p.id,
            type: 'IN',
            quantity: p.quantityInStock,
            reason: 'Correction',
            reference: 'CSV-IMPORT',
            date: today,
            note: 'Imported via CSV',
          }));

        setData((prev) => ({
          ...prev,
          products: [...createdProducts, ...prev.products],
          stockMovements: [...initialMovements, ...prev.stockMovements],
        }));

        addToast(
          'success',
          `Imported ${createdProducts.length} product${createdProducts.length === 1 ? '' : 's'}`,
          skipped.length > 0 ? `${skipped.length} row(s) skipped.` : 'All rows imported cleanly.'
        );
      } else {
        addToast('error', 'No products imported', skipped[0] || 'Check CSV format.');
      }

      return { importedCount: imported.length, skipped };
    },
    [data.products, data.suppliers, addToast]
  );

  // --- Supplier Actions ---
  const addSupplier = useCallback(
    (payload: Omit<Supplier, 'id'>): Supplier => {
      const newSupplier: Supplier = {
        ...payload,
        id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      setData((prev) => ({
        ...prev,
        suppliers: [newSupplier, ...prev.suppliers],
      }));
      addToast('success', 'Supplier added', `${newSupplier.name} is now active.`);
      return newSupplier;
    },
    [addToast]
  );

  const updateSupplier = useCallback(
    (id: string, payload: Omit<Supplier, 'id'>) => {
      setData((prev) => ({
        ...prev,
        suppliers: prev.suppliers.map((s) => (s.id === id ? { ...payload, id } : s)),
      }));
      addToast('success', 'Supplier updated', `${payload.name} profile saved.`);
    },
    [addToast]
  );

  const toggleSupplierStatus = useCallback(
    (id: string) => {
      const target = data.suppliers.find((s) => s.id === id);
      if (!target) return;
      const nextStatus = target.status === 'Active' ? 'Inactive' : 'Active';
      setData((prev) => ({
        ...prev,
        suppliers: prev.suppliers.map((s) =>
          s.id === id ? { ...s, status: nextStatus } : s
        ),
      }));
      addToast(
        'info',
        `Supplier ${nextStatus.toLowerCase()}`,
        `${target.name} marked as ${nextStatus}.`
      );
    },
    [data.suppliers, addToast]
  );

  const upsertSupplierProduct = useCallback(
    (link: SupplierProduct) => {
      setData((prev) => {
        const exists = prev.supplierProducts.some(
          (sp) => sp.supplierId === link.supplierId && sp.productId === link.productId
        );
        const next = exists
          ? prev.supplierProducts.map((sp) =>
              sp.supplierId === link.supplierId && sp.productId === link.productId
                ? link
                : sp
            )
          : [...prev.supplierProducts, link];
        return { ...prev, supplierProducts: next };
      });
      addToast('success', 'Catalog pricing saved', 'Supplier product price and MOQ updated.');
    },
    [addToast]
  );

  const removeSupplierProduct = useCallback(
    (supplierId: string, productId: string) => {
      setData((prev) => ({
        ...prev,
        supplierProducts: prev.supplierProducts.filter(
          (sp) => !(sp.supplierId === supplierId && sp.productId === productId)
        ),
      }));
      addToast('info', 'Catalog link removed', 'Product unlinked from supplier price list.');
    },
    [addToast]
  );

  // --- Purchase Order Actions ---
  const createPurchaseOrder = useCallback(
    (payload: {
      supplierId: string;
      items: PurchaseOrderItem[];
      status: PurchaseOrderStatus;
      orderDate: string;
      expectedDate: string;
      notes: string;
    }): PurchaseOrder => {
      const poId = generateNextPoId(data.purchaseOrders);
      const normalizedItems = payload.items.map((item) => ({
        ...item,
        receivedQuantity: item.receivedQuantity ?? 0,
      }));
      const totalAmount = Number(
        normalizedItems
          .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
          .toFixed(2)
      );

      const newPo: PurchaseOrder = {
        id: poId,
        supplierId: payload.supplierId,
        items: normalizedItems,
        status: payload.status,
        orderDate: payload.orderDate,
        expectedDate: payload.expectedDate,
        totalAmount,
        notes: payload.notes,
      };

      setData((prev) => ({
        ...prev,
        purchaseOrders: [newPo, ...prev.purchaseOrders],
      }));

      addToast('success', `${poId} created`, `Purchase order saved as ${payload.status}.`);
      return newPo;
    },
    [data.purchaseOrders, addToast]
  );

  const updatePurchaseOrderStatus = useCallback(
    (poId: string, nextStatus: PurchaseOrderStatus) => {
      setData((prev) => ({
        ...prev,
        purchaseOrders: prev.purchaseOrders.map((po) =>
          po.id === poId ? { ...po, status: nextStatus } : po
        ),
      }));
      addToast('info', `${poId} updated`, `Order status changed to ${nextStatus}.`);
    },
    [addToast]
  );

  const receivePurchaseOrder = useCallback(
    (
      poId: string,
      receivedNowByProductId: Record<string, number>,
      receiveDate: string,
      note?: string
    ) => {
      const targetPo = data.purchaseOrders.find((po) => po.id === poId);
      if (!targetPo) return;

      const { updatedOrder, updatedProducts, newMovements } = receivePurchaseOrderItems({
        purchaseOrder: targetPo,
        receivedNowByProductId,
        products: data.products,
        receiveDate,
        note,
        createMovementId: (idx) =>
          `mov-po-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      });

      if (newMovements.length === 0) {
        addToast('error', 'No quantities entered', 'Enter at least 1 unit to receive.');
        return;
      }

      const totalUnitsReceived = newMovements.reduce((sum, m) => sum + m.quantity, 0);

      setData((prev) => ({
        ...prev,
        products: updatedProducts,
        purchaseOrders: prev.purchaseOrders.map((po) =>
          po.id === poId ? updatedOrder : po
        ),
        stockMovements: [...newMovements, ...prev.stockMovements],
      }));

      addToast(
        'success',
        `Stock received for ${poId}`,
        `Added ${totalUnitsReceived} unit(s) across ${newMovements.length} SKU(s). Status: ${updatedOrder.status}.`
      );
    },
    [data.purchaseOrders, data.products, addToast]
  );

  const autoGenerateReorderDrafts = useCallback((): PurchaseOrder[] => {
    const groups = getReorderSuggestions(
      data.products,
      data.suppliers,
      data.supplierProducts,
      data.purchaseOrders,
      data.settings.defaultLowStockThreshold
    );

    if (groups.length === 0) {
      addToast(
        'info',
        'All low-stock items covered',
        'Every low-stock item either has sufficient stock or already has an open Purchase Order.'
      );
      return [];
    }

    const today = new Date();
    const orderDate = today.toISOString().slice(0, 10);
    const createdOrders: PurchaseOrder[] = [];
    const workingList = [...data.purchaseOrders];

    for (const group of groups) {
      const nextId = generateNextPoId(workingList);
      const expected = new Date(today);
      expected.setDate(expected.getDate() + (group.leadTimeDays || 5));

      const draftPo: PurchaseOrder = {
        id: nextId,
        supplierId: group.supplierId,
        items: group.items.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          receivedQuantity: 0,
        })),
        status: 'Draft',
        orderDate,
        expectedDate: expected.toISOString().slice(0, 10),
        totalAmount: group.totalAmount,
        notes: 'Auto-suggested replenishment draft for low/out-of-stock SKUs.',
      };

      createdOrders.push(draftPo);
      workingList.push(draftPo);
    }

    setData((prev) => ({
      ...prev,
      purchaseOrders: [...createdOrders, ...prev.purchaseOrders],
    }));

    addToast(
      'success',
      `Generated ${createdOrders.length} Draft PO${createdOrders.length > 1 ? 's' : ''}`,
      `Grouped low-stock items by preferred supplier (${createdOrders.map((o) => o.id).join(', ')}).`
    );

    return createdOrders;
  }, [data, addToast]);

  // --- Settings & Demo Reset ---
  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setData((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...patch },
      }));
      addToast('success', 'Settings saved', 'Workspace preferences updated.');
    },
    [addToast]
  );

  const toggleTheme = useCallback(() => {
    setData((prev) => {
      const nextTheme = prev.settings.theme === 'dark' ? 'light' : 'dark';
      return {
        ...prev,
        settings: { ...prev.settings, theme: nextTheme },
      };
    });
  }, []);

  const resetDemoData = useCallback(() => {
    setIsHydrating(true);
    const seeded = createSeedData();
    seeded.settings.theme = data.settings.theme; // Preserve current light/dark mode preference
    setData(seeded);
    window.setTimeout(() => setIsHydrating(false), 180);
    addToast('info', 'Demo data restored', 'Inventory, suppliers, POs, and ledger reset to initial seed state.');
  }, [data.settings.theme, addToast]);

  const restoreBackupJson = useCallback(
    (jsonText: string): { ok: boolean; error?: string } => {
      try {
        const parsed = JSON.parse(jsonText);
        if (!validateBackupData(parsed)) {
          return {
            ok: false,
            error: 'Invalid backup schema. Expected products, suppliers, supplierProducts, purchaseOrders, stockMovements, and settings.',
          };
        }
        setData(parsed);
        addToast('success', 'Backup restored', `Loaded ${parsed.products.length} products and ${parsed.purchaseOrders.length} purchase orders.`);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Malformed JSON file.' };
      }
    },
    [addToast]
  );

  const alerts = useMemo(
    () =>
      computeSystemAlerts(
        data.products,
        data.suppliers,
        data.purchaseOrders,
        data.settings.defaultLowStockThreshold
      ),
    [data.products, data.suppliers, data.purchaseOrders, data.settings.defaultLowStockThreshold]
  );

  const value = useMemo<StockTrackContextValue>(
    () => ({
      data,
      isHydrating,
      activeTab,
      deepLink,
      alerts,
      toasts,
      setActiveTab,
      navigateToEntity,
      clearDeepLink,
      addToast,
      dismissToast,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustProductStock,
      importProductsCsv,
      addSupplier,
      updateSupplier,
      toggleSupplierStatus,
      upsertSupplierProduct,
      removeSupplierProduct,
      createPurchaseOrder,
      updatePurchaseOrderStatus,
      receivePurchaseOrder,
      autoGenerateReorderDrafts,
      updateSettings,
      toggleTheme,
      resetDemoData,
      restoreBackupJson,
    }),
    [
      data,
      isHydrating,
      activeTab,
      deepLink,
      alerts,
      toasts,
      setActiveTab,
      navigateToEntity,
      clearDeepLink,
      addToast,
      dismissToast,
      addProduct,
      updateProduct,
      deleteProduct,
      adjustProductStock,
      importProductsCsv,
      addSupplier,
      updateSupplier,
      toggleSupplierStatus,
      upsertSupplierProduct,
      removeSupplierProduct,
      createPurchaseOrder,
      updatePurchaseOrderStatus,
      receivePurchaseOrder,
      autoGenerateReorderDrafts,
      updateSettings,
      toggleTheme,
      resetDemoData,
      restoreBackupJson,
    ]
  );

  return (
    <StockTrackContext.Provider value={value}>
      {children}
    </StockTrackContext.Provider>
  );
};

export function useStockTrack(): StockTrackContextValue {
  const ctx = useContext(StockTrackContext);
  if (!ctx) {
    throw new Error('useStockTrack must be used inside StockTrackProvider');
  }
  return ctx;
}
