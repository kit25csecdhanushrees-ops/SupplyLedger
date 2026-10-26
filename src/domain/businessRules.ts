import {
  PersistedData,
  Product,
  ProductUnit,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  ReorderDraftGroup,
  StockMovement,
  StockStatus,
  Supplier,
  SupplierPerformanceMetrics,
  SupplierProduct,
  SupplierProductComparison,
  SupportedCurrency,
  SystemAlert,
} from '../types';

/**
 * Pure function to determine stock status for a product.
 * Out of Stock: quantityInStock <= 0
 * Low Stock: quantityInStock > 0 && quantityInStock <= effectiveReorderLevel
 * In Stock: quantityInStock > effectiveReorderLevel
 */
export function getStockStatus(
  product: Pick<Product, 'quantityInStock' | 'reorderLevel'>,
  fallbackThreshold = 10
): StockStatus {
  const threshold =
    typeof product.reorderLevel === 'number' && product.reorderLevel >= 0
      ? product.reorderLevel
      : fallbackThreshold;

  if (product.quantityInStock <= 0) {
    return StockStatus.OUT_OF_STOCK;
  }
  if (product.quantityInStock <= threshold) {
    return StockStatus.LOW_STOCK;
  }
  return StockStatus.IN_STOCK;
}

/**
 * Calculates total inventory value across products (cost basis by default, or retail basis).
 */
export function calculateTotalStockValue(
  products: ReadonlyArray<Pick<Product, 'quantityInStock' | 'costPrice' | 'sellingPrice'>>,
  basis: 'cost' | 'retail' = 'cost'
): number {
  return products.reduce((sum, product) => {
    const qty = Math.max(0, product.quantityInStock);
    const price = basis === 'retail' ? product.sellingPrice : product.costPrice;
    return sum + qty * price;
  }, 0);
}

/**
 * Formats currency according to user settings, defaulting to Indian Rupee (INR) with en-IN grouping (e.g. ₹1,25,000).
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency = 'INR',
  compact = false
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  if (currency === 'INR') {
    if (compact && Math.abs(safeAmount) >= 10000000) {
      return `₹${(safeAmount / 10000000).toFixed(2)} Cr`;
    }
    if (compact && Math.abs(safeAmount) >= 100000) {
      return `₹${(safeAmount / 100000).toFixed(2)} L`;
    }
    const hasDecimals = Math.abs(safeAmount % 1) > 0.001;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }

  const localeMap: Record<SupportedCurrency, string> = {
    INR: 'en-IN',
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
  };

  const hasDecimals = Math.abs(safeAmount % 1) > 0.001;
  return new Intl.NumberFormat(localeMap[currency] || 'en-IN', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: hasDecimals && !compact ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Generates sequential PO IDs in PO-0001 format.
 */
export function generateNextPoId(existingOrders: ReadonlyArray<Pick<PurchaseOrder, 'id'>>): string {
  let maxNumber = 0;
  for (const po of existingOrders) {
    const match = /^PO-(\d+)$/i.exec(po.id.trim());
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed > maxNumber) {
        maxNumber = parsed;
      }
    }
  }
  const next = maxNumber + 1;
  return `PO-${String(next).padStart(4, '0')}`;
}

/**
 * Computes difference in days between two ISO/YYYY-MM-DD dates (end - start).
 */
export function diffDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((utcEnd - utcStart) / msPerDay);
}

/**
 * Checks whether a Purchase Order is overdue relative to referenceDate (YYYY-MM-DD).
 */
export function isPurchaseOrderOverdue(
  po: Pick<PurchaseOrder, 'status' | 'expectedDate'>,
  referenceDateStr: string = new Date().toISOString().slice(0, 10)
): boolean {
  if (po.status === 'Received' || po.status === 'Cancelled') {
    return false;
  }
  if (!po.expectedDate) return false;
  return diffDays(po.expectedDate, referenceDateStr) > 0;
}

/**
 * Calculates supplier performance metrics: total spend, on-time delivery %, average lead time, overdue POs.
 */
export function calculateSupplierMetrics(
  supplier: Pick<Supplier, 'id' | 'leadTimeDays'>,
  purchaseOrders: ReadonlyArray<PurchaseOrder>,
  referenceDateStr: string = new Date().toISOString().slice(0, 10)
): SupplierPerformanceMetrics {
  const supplierOrders = purchaseOrders.filter(
    (po) => po.supplierId === supplier.id && po.status !== 'Cancelled'
  );

  const receivedOrders = supplierOrders.filter(
    (po) => po.status === 'Received' && Boolean(po.receivedDate)
  );

  const openOrders = supplierOrders.filter(
    (po) => po.status === 'Draft' || po.status === 'Sent' || po.status === 'Partially Received'
  );

  const overdueOrders = openOrders.filter((po) => isPurchaseOrderOverdue(po, referenceDateStr));

  // Total spend counts committed & fulfilled orders (Sent, Partially Received, Received)
  const totalSpend = supplierOrders
    .filter((po) => po.status !== 'Draft')
    .reduce((sum, po) => sum + po.totalAmount, 0);

  let onTimeDeliveryRate: number | null = null;
  let averageLeadTimeDays = supplier.leadTimeDays;

  if (receivedOrders.length > 0) {
    const onTimeCount = receivedOrders.filter((po) => {
      if (!po.receivedDate || !po.expectedDate) return true;
      return diffDays(po.expectedDate, po.receivedDate) <= 0;
    }).length;

    onTimeDeliveryRate = Math.round((onTimeCount / receivedOrders.length) * 100);

    const totalLeadDays = receivedOrders.reduce((acc, po) => {
      if (!po.receivedDate || !po.orderDate) return acc + supplier.leadTimeDays;
      return acc + Math.max(1, diffDays(po.orderDate, po.receivedDate));
    }, 0);

    averageLeadTimeDays = Number((totalLeadDays / receivedOrders.length).toFixed(1));
  }

  return {
    supplierId: supplier.id,
    totalOrdersCount: supplierOrders.length,
    receivedOrdersCount: receivedOrders.length,
    openOrdersCount: openOrders.length,
    overdueOrdersCount: overdueOrders.length,
    totalSpend,
    onTimeDeliveryRate,
    averageLeadTimeDays,
  };
}

/**
 * Compares all linked active suppliers for a given product, flagging the cheapest and fastest options.
 */
export function compareSuppliersForProduct(
  product: Pick<Product, 'id' | 'preferredSupplierId' | 'costPrice'>,
  suppliers: ReadonlyArray<Supplier>,
  supplierProducts: ReadonlyArray<SupplierProduct>,
  purchaseOrders: ReadonlyArray<PurchaseOrder>,
  referenceDateStr?: string
): SupplierProductComparison[] {
  const links = supplierProducts.filter((sp) => sp.productId === product.id);
  const rows: SupplierProductComparison[] = [];

  for (const link of links) {
    const supplier = suppliers.find((s) => s.id === link.supplierId);
    if (!supplier) continue;
    const metrics = calculateSupplierMetrics(supplier, purchaseOrders, referenceDateStr);
    rows.push({
      supplier,
      unitPrice: link.supplierPrice,
      minOrderQty: link.minOrderQty,
      leadTimeDays: supplier.leadTimeDays,
      actualAvgLeadTimeDays: metrics.averageLeadTimeDays,
      onTimeDeliveryRate: metrics.onTimeDeliveryRate,
      isPreferred: supplier.id === product.preferredSupplierId,
      isCheapest: false,
      isFastest: false,
    });
  }

  // Ensure preferred supplier appears even if not explicitly in SupplierProduct table
  if (
    product.preferredSupplierId &&
    !rows.some((r) => r.supplier.id === product.preferredSupplierId)
  ) {
    const pref = suppliers.find((s) => s.id === product.preferredSupplierId);
    if (pref) {
      const metrics = calculateSupplierMetrics(pref, purchaseOrders, referenceDateStr);
      rows.push({
        supplier: pref,
        unitPrice: product.costPrice,
        minOrderQty: 1,
        leadTimeDays: pref.leadTimeDays,
        actualAvgLeadTimeDays: metrics.averageLeadTimeDays,
        onTimeDeliveryRate: metrics.onTimeDeliveryRate,
        isPreferred: true,
        isCheapest: false,
        isFastest: false,
      });
    }
  }

  const activeRows = rows.filter((r) => r.supplier.status === 'Active');
  if (activeRows.length > 0) {
    const minPrice = Math.min(...activeRows.map((r) => r.unitPrice));
    const minLead = Math.min(...activeRows.map((r) => r.leadTimeDays));
    for (const r of rows) {
      if (r.supplier.status === 'Active') {
        r.isCheapest = r.unitPrice === minPrice;
        r.isFastest = r.leadTimeDays === minLead;
      }
    }
  }

  return rows.sort((a, b) => a.unitPrice - b.unitPrice);
}

/**
 * Generates grouped Draft PO suggestions for all Low Stock and Out of Stock products,
 * grouped by preferred supplier (falling back to cheapest active supplier), using each product's reorderQuantity.
 */
export function getReorderSuggestions(
  products: ReadonlyArray<Product>,
  suppliers: ReadonlyArray<Supplier>,
  supplierProducts: ReadonlyArray<SupplierProduct>,
  openPurchaseOrders: ReadonlyArray<PurchaseOrder> = [],
  defaultLowStockThreshold = 10
): ReorderDraftGroup[] {
  // Exclude products that already have an active Draft/Sent/Partially Received PO covering their reorder
  const productIdsInDraftOrOpen = new Set<string>();
  for (const po of openPurchaseOrders) {
    if (po.status === 'Draft' || po.status === 'Sent' || po.status === 'Partially Received') {
      for (const item of po.items) {
        const remaining = item.quantity - (item.receivedQuantity ?? 0);
        if (remaining > 0) {
          productIdsInDraftOrOpen.add(item.productId);
        }
      }
    }
  }

  const lowProducts = products.filter((p) => {
    const status = getStockStatus(p, defaultLowStockThreshold);
    return (
      (status === StockStatus.LOW_STOCK || status === StockStatus.OUT_OF_STOCK) &&
      !productIdsInDraftOrOpen.has(p.id)
    );
  });

  const groupMap = new Map<string, ReorderDraftGroup>();

  for (const product of lowProducts) {
    let targetSupplier = suppliers.find(
      (s) => s.id === product.preferredSupplierId && s.status === 'Active'
    );

    if (!targetSupplier) {
      // Fallback to cheapest active linked supplier, or first active supplier
      const linked = supplierProducts
        .filter((sp) => sp.productId === product.id)
        .sort((a, b) => a.supplierPrice - b.supplierPrice);
      for (const sp of linked) {
        const candidate = suppliers.find((s) => s.id === sp.supplierId && s.status === 'Active');
        if (candidate) {
          targetSupplier = candidate;
          break;
        }
      }
      if (!targetSupplier) {
        targetSupplier = suppliers.find((s) => s.status === 'Active');
      }
    }

    if (!targetSupplier) continue;

    const spLink = supplierProducts.find(
      (sp) => sp.supplierId === targetSupplier!.id && sp.productId === product.id
    );

    const unitPrice = spLink ? spLink.supplierPrice : product.costPrice;
    const baseReorderQty = product.reorderQuantity > 0 ? product.reorderQuantity : Math.max(10, product.reorderLevel * 2);
    const quantity = spLink ? Math.max(baseReorderQty, spLink.minOrderQty) : baseReorderQty;
    const lineTotal = Number((quantity * unitPrice).toFixed(2));

    const existingGroup = groupMap.get(targetSupplier.id);
    if (existingGroup) {
      existingGroup.items.push({ product, quantity, unitPrice, lineTotal });
      existingGroup.totalAmount = Number((existingGroup.totalAmount + lineTotal).toFixed(2));
    } else {
      groupMap.set(targetSupplier.id, {
        supplierId: targetSupplier.id,
        supplierName: targetSupplier.name,
        leadTimeDays: targetSupplier.leadTimeDays,
        items: [{ product, quantity, unitPrice, lineTotal }],
        totalAmount: lineTotal,
      });
    }
  }

  return Array.from(groupMap.values());
}

/**
 * Pure state transition for receiving stock against a Purchase Order.
 * Automatically increases product quantityInStock, updates PO status (Partially Received vs Received),
 * and creates StockMovement IN entries linked to the PO id.
 */
export function receivePurchaseOrderItems(params: {
  purchaseOrder: PurchaseOrder;
  receivedNowByProductId: Record<string, number>;
  products: ReadonlyArray<Product>;
  receiveDate: string;
  note?: string;
  createMovementId?: (index: number) => string;
}): {
  updatedOrder: PurchaseOrder;
  updatedProducts: Product[];
  newMovements: StockMovement[];
} {
  const {
    purchaseOrder,
    receivedNowByProductId,
    products,
    receiveDate,
    note = '',
    createMovementId = (idx) => `mov-${Date.now()}-${idx}`,
  } = params;

  if (purchaseOrder.status === 'Received' || purchaseOrder.status === 'Cancelled') {
    return {
      updatedOrder: purchaseOrder,
      updatedProducts: [...products],
      newMovements: [],
    };
  }

  const stockIncreaseMap = new Map<string, number>();
  const newMovements: StockMovement[] = [];
  let movementIndex = 0;

  const updatedItems: PurchaseOrderItem[] = purchaseOrder.items.map((item) => {
    const previouslyReceived = item.receivedQuantity ?? 0;
    const remaining = Math.max(0, item.quantity - previouslyReceived);
    const rawReceiveNow = receivedNowByProductId[item.productId] ?? 0;
    const receiveNow = Math.max(0, Math.min(remaining, Math.floor(rawReceiveNow)));

    if (receiveNow > 0) {
      stockIncreaseMap.set(
        item.productId,
        (stockIncreaseMap.get(item.productId) ?? 0) + receiveNow
      );

      newMovements.push({
        id: createMovementId(movementIndex++),
        productId: item.productId,
        type: 'IN',
        quantity: receiveNow,
        reason: 'Purchase',
        reference: purchaseOrder.id,
        date: receiveDate,
        note: note.trim() || `Received against ${purchaseOrder.id}`,
      });
    }

    return {
      ...item,
      receivedQuantity: previouslyReceived + receiveNow,
    };
  });

  const allFullyReceived = updatedItems.every(
    (item) => (item.receivedQuantity ?? 0) >= item.quantity
  );
  const anyReceived = updatedItems.some((item) => (item.receivedQuantity ?? 0) > 0);

  let nextStatus: PurchaseOrderStatus = purchaseOrder.status;
  if (allFullyReceived) {
    nextStatus = 'Received';
  } else if (anyReceived) {
    nextStatus = 'Partially Received';
  }

  const updatedOrder: PurchaseOrder = {
    ...purchaseOrder,
    items: updatedItems,
    status: nextStatus,
    receivedDate: allFullyReceived ? receiveDate : purchaseOrder.receivedDate,
  };

  const updatedProducts: Product[] = products.map((product) => {
    const added = stockIncreaseMap.get(product.id);
    if (!added) return product;
    return {
      ...product,
      quantityInStock: product.quantityInStock + added,
      updatedAt: receiveDate,
    };
  });

  return {
    updatedOrder,
    updatedProducts,
    newMovements,
  };
}

/**
 * Computes actionable system alerts for header notifications:
 * - Out of stock products
 * - Low stock products
 * - Overdue Purchase Orders (expectedDate passed and not Received/Cancelled)
 * - Active suppliers with poor on-time delivery rate (< 70%)
 */
export function computeSystemAlerts(
  products: ReadonlyArray<Product>,
  suppliers: ReadonlyArray<Supplier>,
  purchaseOrders: ReadonlyArray<PurchaseOrder>,
  defaultLowStockThreshold = 10,
  referenceDateStr: string = new Date().toISOString().slice(0, 10)
): SystemAlert[] {
  const alerts: SystemAlert[] = [];

  for (const product of products) {
    const status = getStockStatus(product, defaultLowStockThreshold);
    if (status === StockStatus.OUT_OF_STOCK) {
      alerts.push({
        id: `alert-oos-${product.id}`,
        category: 'OUT_OF_STOCK',
        severity: 'critical',
        title: `Out of Stock: ${product.name}`,
        description: `SKU ${product.SKU} has 0 ${product.unit} left (Reorder level: ${product.reorderLevel}).`,
        targetTab: 'inventory',
        targetEntityId: product.id,
      });
    } else if (status === StockStatus.LOW_STOCK) {
      alerts.push({
        id: `alert-low-${product.id}`,
        category: 'LOW_STOCK',
        severity: 'warning',
        title: `Low Stock: ${product.name}`,
        description: `${product.quantityInStock} ${product.unit} remaining (Reorder level: ${product.reorderLevel}).`,
        targetTab: 'inventory',
        targetEntityId: product.id,
      });
    }
  }

  for (const po of purchaseOrders) {
    if (isPurchaseOrderOverdue(po, referenceDateStr)) {
      const daysLate = diffDays(po.expectedDate, referenceDateStr);
      const supplierName =
        suppliers.find((s) => s.id === po.supplierId)?.name ?? 'Unknown Supplier';
      alerts.push({
        id: `alert-po-${po.id}`,
        category: 'OVERDUE_PO',
        severity: 'critical',
        title: `Overdue ${po.id} (${daysLate}d late)`,
        description: `${supplierName} · Expected ${po.expectedDate} · Status: ${po.status}`,
        targetTab: 'purchase-orders',
        targetEntityId: po.id,
      });
    }
  }

  for (const supplier of suppliers) {
    if (supplier.status !== 'Active') continue;
    const metrics = calculateSupplierMetrics(supplier, purchaseOrders, referenceDateStr);
    if (metrics.onTimeDeliveryRate !== null && metrics.onTimeDeliveryRate < 70) {
      alerts.push({
        id: `alert-sup-${supplier.id}`,
        category: 'POOR_SUPPLIER',
        severity: 'warning',
        title: `Low On-Time Rate: ${supplier.name}`,
        description: `${metrics.onTimeDeliveryRate}% on-time across ${metrics.receivedOrdersCount} completed POs.`,
        targetTab: 'suppliers',
        targetEntityId: supplier.id,
      });
    }
  }

  return alerts;
}

/**
 * Escapes CSV cell values safely.
 */
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serializes generic tabular data to a CSV string.
 */
export function serializeRowsToCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/**
 * Exports products array to CSV text.
 */
export function productsToCsv(
  products: ReadonlyArray<Product>,
  suppliers: ReadonlyArray<Supplier>
): string {
  const headers = [
    'SKU',
    'Name',
    'Category',
    'Description',
    'Unit',
    'CostPrice',
    'SellingPrice',
    'QuantityInStock',
    'ReorderLevel',
    'ReorderQuantity',
    'PreferredSupplier',
    'Location',
  ];

  const rows = products.map((p) => {
    const supplierName = suppliers.find((s) => s.id === p.preferredSupplierId)?.name ?? '';
    return [
      p.SKU,
      p.name,
      p.category,
      p.description,
      p.unit,
      p.costPrice,
      p.sellingPrice,
      p.quantityInStock,
      p.reorderLevel,
      p.reorderQuantity,
      supplierName,
      p.location,
    ];
  });

  return serializeRowsToCsv(headers, rows);
}

/**
 * Parses CSV lines handling quoted commas properly.
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const VALID_UNITS: ProductUnit[] = ['pcs', 'kg', 'box', 'pack', 'meter', 'liter', 'set', 'roll'];

/**
 * Parses CSV text into validated Product payloads (skipping duplicate SKUs).
 */
export function parseProductsFromCsv(
  csvText: string,
  existingProducts: ReadonlyArray<Product>,
  suppliers: ReadonlyArray<Supplier>
): {
  imported: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[];
  skipped: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { imported: [], skipped: ['CSV must include a header row and at least one product row.'] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colIndex = (names: string[]) => headers.findIndex((h) => names.includes(h));

  const skuIdx = colIndex(['sku', 'productsku', 'code']);
  const nameIdx = colIndex(['name', 'productname', 'title']);
  const catIdx = colIndex(['category', 'group']);
  const descIdx = colIndex(['description', 'desc']);
  const unitIdx = colIndex(['unit', 'uom']);
  const costIdx = colIndex(['costprice', 'cost', 'buyprice']);
  const sellIdx = colIndex(['sellingprice', 'price', 'sellprice', 'retailprice']);
  const qtyIdx = colIndex(['quantityinstock', 'quantity', 'qty', 'stock']);
  const reorderLvlIdx = colIndex(['reorderlevel', 'minstock', 'threshold']);
  const reorderQtyIdx = colIndex(['reorderquantity', 'reorderqty']);
  const supIdx = colIndex(['preferredsupplier', 'supplier', 'suppliername']);
  const locIdx = colIndex(['location', 'warehouse', 'shelf']);

  if (skuIdx === -1 || nameIdx === -1) {
    return {
      imported: [],
      skipped: ['Missing required columns: "SKU" and "Name".'],
    };
  }

  const seenSkus = new Set(existingProducts.map((p) => p.SKU.toUpperCase()));
  const imported: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  const skipped: string[] = [];

  for (let rowNum = 1; rowNum < lines.length; rowNum++) {
    const cols = parseCsvLine(lines[rowNum]);
    const sku = (cols[skuIdx] ?? '').trim().toUpperCase();
    const name = (cols[nameIdx] ?? '').trim();

    if (!sku || !name) {
      skipped.push(`Row ${rowNum + 1}: Missing SKU or Name.`);
      continue;
    }

    if (seenSkus.has(sku)) {
      skipped.push(`Row ${rowNum + 1}: Duplicate SKU "${sku}" skipped.`);
      continue;
    }

    const rawUnit = ((unitIdx >= 0 ? cols[unitIdx] : 'pcs') || 'pcs').toLowerCase() as ProductUnit;
    const unit: ProductUnit = VALID_UNITS.includes(rawUnit) ? rawUnit : 'pcs';

    const costPrice = Math.max(0, parseFloat(costIdx >= 0 ? cols[costIdx] : '0') || 0);
    const sellingPrice = Math.max(
      costPrice,
      parseFloat(sellIdx >= 0 ? cols[sellIdx] : String(costPrice)) || costPrice
    );
    const quantityInStock = Math.max(0, Math.floor(parseFloat(qtyIdx >= 0 ? cols[qtyIdx] : '0') || 0));
    const reorderLevel = Math.max(
      0,
      Math.floor(parseFloat(reorderLvlIdx >= 0 ? cols[reorderLvlIdx] : '10') || 10)
    );
    const reorderQuantity = Math.max(
      1,
      Math.floor(parseFloat(reorderQtyIdx >= 0 ? cols[reorderQtyIdx] : '25') || 25)
    );

    const supName = (supIdx >= 0 ? cols[supIdx] : '').trim().toLowerCase();
    const matchedSupplier =
      suppliers.find((s) => s.name.toLowerCase() === supName || s.id.toLowerCase() === supName) ??
      suppliers[0];

    seenSkus.add(sku);
    imported.push({
      SKU: sku,
      name,
      category: (catIdx >= 0 ? cols[catIdx] : '') || 'General',
      description: (descIdx >= 0 ? cols[descIdx] : '') || '',
      unit,
      costPrice,
      sellingPrice,
      quantityInStock,
      reorderLevel,
      reorderQuantity,
      preferredSupplierId: matchedSupplier?.id ?? '',
      location: (locIdx >= 0 ? cols[locIdx] : '') || 'Whse A · Bay 01',
    });
  }

  return { imported, skipped };
}

/**
 * Validates JSON backup structure prior to restoring.
 */
export function validateBackupData(raw: unknown): raw is PersistedData {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;
  return (
    Array.isArray(candidate.products) &&
    Array.isArray(candidate.suppliers) &&
    Array.isArray(candidate.supplierProducts) &&
    Array.isArray(candidate.purchaseOrders) &&
    Array.isArray(candidate.stockMovements) &&
    typeof candidate.settings === 'object' &&
    candidate.settings !== null
  );
}
