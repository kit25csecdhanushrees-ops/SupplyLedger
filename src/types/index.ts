export type ProductUnit = 'pcs' | 'kg' | 'box' | 'pack' | 'meter' | 'liter' | 'set' | 'roll';

export enum StockStatus {
  IN_STOCK = 'In Stock',
  LOW_STOCK = 'Low Stock',
  OUT_OF_STOCK = 'Out of Stock',
}

export interface Product {
  id: string;
  name: string;
  SKU: string;
  category: string;
  description: string;
  unit: ProductUnit;
  costPrice: number;
  sellingPrice: number;
  quantityInStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  preferredSupplierId: string;
  location: string;
  createdAt: string;
  updatedAt: string;
}

export type SupplierStatus = 'Active' | 'Inactive';

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  leadTimeDays: number;
  rating: number; // 1 to 5
  status: SupplierStatus;
  notes: string;
}

export interface SupplierProduct {
  supplierId: string;
  productId: string;
  supplierPrice: number;
  minOrderQty: number;
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Sent'
  | 'Partially Received'
  | 'Received'
  | 'Cancelled';

export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  receivedQuantity?: number;
}

export interface PurchaseOrder {
  id: string; // e.g., PO-0001
  supplierId: string;
  items: PurchaseOrderItem[];
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate: string;
  receivedDate?: string;
  totalAmount: number;
  notes: string;
}

export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

export type StockMovementReason =
  | 'Purchase'
  | 'Sale'
  | 'Damage'
  | 'Return'
  | 'Correction';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number; // positive magnitude for IN/OUT, signed delta or positive with note for ADJUSTMENT
  reason: StockMovementReason;
  reference: string; // e.g., PO-0001 or manual ref
  date: string;
  note: string;
}

export type SupportedCurrency = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface AppSettings {
  companyName: string;
  currency: SupportedCurrency;
  theme: 'light' | 'dark';
  defaultLowStockThreshold: number;
}

export interface PersistedData {
  products: Product[];
  suppliers: Supplier[];
  supplierProducts: SupplierProduct[];
  purchaseOrders: PurchaseOrder[];
  stockMovements: StockMovement[];
  settings: AppSettings;
}

export type NavigationTab =
  | 'dashboard'
  | 'inventory'
  | 'suppliers'
  | 'purchase-orders'
  | 'movements'
  | 'reports'
  | 'settings';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertCategory =
  | 'OUT_OF_STOCK'
  | 'LOW_STOCK'
  | 'OVERDUE_PO'
  | 'POOR_SUPPLIER';

export interface SystemAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  targetTab: NavigationTab;
  targetEntityId: string;
}

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface SupplierPerformanceMetrics {
  supplierId: string;
  totalOrdersCount: number;
  receivedOrdersCount: number;
  openOrdersCount: number;
  overdueOrdersCount: number;
  totalSpend: number;
  onTimeDeliveryRate: number | null; // percentage 0-100, or null if no received orders
  averageLeadTimeDays: number;
}

export interface SupplierProductComparison {
  supplier: Supplier;
  unitPrice: number;
  minOrderQty: number;
  leadTimeDays: number;
  actualAvgLeadTimeDays: number;
  onTimeDeliveryRate: number | null;
  isPreferred: boolean;
  isCheapest: boolean;
  isFastest: boolean;
}

export interface ReorderDraftGroup {
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  items: Array<{
    product: Product;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalAmount: number;
}
