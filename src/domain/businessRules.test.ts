import { describe, expect, it } from 'vitest';
import {
  calculateSupplierMetrics,
  calculateTotalStockValue,
  computeSystemAlerts,
  formatCurrency,
  getReorderSuggestions,
  getStockStatus,
  receivePurchaseOrderItems,
} from './businessRules';
import { Product, PurchaseOrder, StockStatus, Supplier, SupplierProduct } from '../types';

const sampleSupplier: Supplier = {
  id: 'sup-1',
  name: 'Bharat Industrial Components',
  contactPerson: 'Rajesh Sharma',
  email: 'orders@bharatind.in',
  phone: '+91 98201 44510',
  address: 'MIDC Andheri East, Mumbai',
  paymentTerms: 'Net 30',
  leadTimeDays: 5,
  rating: 4.5,
  status: 'Active',
  notes: '',
};

const sampleProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'MCB Circuit Breaker 32A',
    SKU: 'ELC-1001',
    category: 'Electrical',
    description: 'Single pole C-curve DIN rail breaker',
    unit: 'pcs',
    costPrice: 220,
    sellingPrice: 340,
    quantityInStock: 50,
    reorderLevel: 15,
    reorderQuantity: 40,
    preferredSupplierId: 'sup-1',
    location: 'Aisle 1 · Rack B',
    createdAt: '2026-06-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'prod-2',
    name: 'Industrial Safety Gloves',
    SKU: 'SAF-2004',
    category: 'Safety Gear',
    description: 'Cut-resistant nitrile coated gloves',
    unit: 'pcs',
    costPrice: 150,
    sellingPrice: 250,
    quantityInStock: 8,
    reorderLevel: 10,
    reorderQuantity: 30,
    preferredSupplierId: 'sup-1',
    location: 'Aisle 3 · Rack A',
    createdAt: '2026-06-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'prod-3',
    name: 'Heavy Duty Stretch Film Roll',
    SKU: 'PKG-3010',
    category: 'Packaging',
    description: '500mm x 23 micron pallet wrap',
    unit: 'roll',
    costPrice: 480,
    sellingPrice: 690,
    quantityInStock: 0,
    reorderLevel: 12,
    reorderQuantity: 24,
    preferredSupplierId: 'sup-1',
    location: 'Aisle 4 · Floor',
    createdAt: '2026-06-01',
    updatedAt: '2026-09-01',
  },
];

describe('StockTrack pure business logic', () => {
  it('computes accurate stock status (In Stock, Low Stock, Out of Stock)', () => {
    expect(getStockStatus(sampleProducts[0])).toBe(StockStatus.IN_STOCK);
    expect(getStockStatus(sampleProducts[1])).toBe(StockStatus.LOW_STOCK);
    expect(getStockStatus(sampleProducts[2])).toBe(StockStatus.OUT_OF_STOCK);
  });

  it('calculates total stock value on cost and retail basis', () => {
    // (50 * 220) + (8 * 150) + (0 * 480) = 11,000 + 1,200 = 12,200
    expect(calculateTotalStockValue(sampleProducts, 'cost')).toBe(12200);
    // (50 * 340) + (8 * 250) + 0 = 17,000 + 2,000 = 19,000
    expect(calculateTotalStockValue(sampleProducts, 'retail')).toBe(19000);
  });

  it('formats INR currency using Indian numbering groups', () => {
    const formatted = formatCurrency(125000, 'INR');
    expect(formatted).toContain('1,25,000');
  });

  it('generates grouped reorder suggestions using reorderQuantity and supplier pricing', () => {
    const supplierProducts: SupplierProduct[] = [
      { supplierId: 'sup-1', productId: 'prod-2', supplierPrice: 145, minOrderQty: 20 },
      { supplierId: 'sup-1', productId: 'prod-3', supplierPrice: 460, minOrderQty: 30 },
    ];

    const groups = getReorderSuggestions(sampleProducts, [sampleSupplier], supplierProducts);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe('sup-1');
    expect(groups[0].items).toHaveLength(2);

    // prod-2 reorderQuantity is 30 (>= MOQ 20) at ₹145 = 4,350
    // prod-3 reorderQuantity is 24 (< MOQ 30 -> raised to 30) at ₹460 = 13,800
    expect(groups[0].totalAmount).toBe(4350 + 13800);
  });

  it('calculates supplier on-time delivery percentage and average lead time', () => {
    const orders: PurchaseOrder[] = [
      {
        id: 'PO-0001',
        supplierId: 'sup-1',
        items: [{ productId: 'prod-1', quantity: 20, unitPrice: 220, receivedQuantity: 20 }],
        status: 'Received',
        orderDate: '2026-09-01',
        expectedDate: '2026-09-06',
        receivedDate: '2026-09-05', // on time (4 days)
        totalAmount: 4400,
        notes: '',
      },
      {
        id: 'PO-0002',
        supplierId: 'sup-1',
        items: [{ productId: 'prod-2', quantity: 20, unitPrice: 150, receivedQuantity: 20 }],
        status: 'Received',
        orderDate: '2026-09-10',
        expectedDate: '2026-09-15',
        receivedDate: '2026-09-18', // late (8 days)
        totalAmount: 3000,
        notes: '',
      },
    ];

    const metrics = calculateSupplierMetrics(sampleSupplier, orders, '2026-10-26');
    expect(metrics.totalSpend).toBe(7400);
    expect(metrics.onTimeDeliveryRate).toBe(50);
    expect(metrics.averageLeadTimeDays).toBe(6);
  });

  it('updates product stock and logs StockMovement IN entries when receiving a PO partially and fully', () => {
    const po: PurchaseOrder = {
      id: 'PO-0010',
      supplierId: 'sup-1',
      items: [
        { productId: 'prod-2', quantity: 30, unitPrice: 145, receivedQuantity: 0 },
        { productId: 'prod-3', quantity: 24, unitPrice: 460, receivedQuantity: 0 },
      ],
      status: 'Sent',
      orderDate: '2026-10-20',
      expectedDate: '2026-10-25',
      totalAmount: 15390,
      notes: 'Urgent restock',
    };

    // Step 1: Partial receive (20 of prod-2, 0 of prod-3)
    const step1 = receivePurchaseOrderItems({
      purchaseOrder: po,
      receivedNowByProductId: { 'prod-2': 20, 'prod-3': 0 },
      products: sampleProducts,
      receiveDate: '2026-10-24',
      createMovementId: (i) => `mov-step1-${i}`,
    });

    expect(step1.updatedOrder.status).toBe('Partially Received');
    expect(step1.updatedProducts.find((p) => p.id === 'prod-2')?.quantityInStock).toBe(28); // 8 + 20
    expect(step1.updatedProducts.find((p) => p.id === 'prod-3')?.quantityInStock).toBe(0);
    expect(step1.newMovements).toHaveLength(1);
    expect(step1.newMovements[0]).toMatchObject({
      productId: 'prod-2',
      type: 'IN',
      quantity: 20,
      reason: 'Purchase',
      reference: 'PO-0010',
    });

    // Step 2: Receive remaining items (10 of prod-2, 24 of prod-3)
    const step2 = receivePurchaseOrderItems({
      purchaseOrder: step1.updatedOrder,
      receivedNowByProductId: { 'prod-2': 10, 'prod-3': 24 },
      products: step1.updatedProducts,
      receiveDate: '2026-10-26',
      createMovementId: (i) => `mov-step2-${i}`,
    });

    expect(step2.updatedOrder.status).toBe('Received');
    expect(step2.updatedOrder.receivedDate).toBe('2026-10-26');
    expect(step2.updatedProducts.find((p) => p.id === 'prod-2')?.quantityInStock).toBe(38); // 28 + 10
    expect(step2.updatedProducts.find((p) => p.id === 'prod-3')?.quantityInStock).toBe(24); // 0 + 24
    expect(step2.newMovements).toHaveLength(2);
  });

  it('detects low stock, out of stock, overdue POs, and poor supplier on-time alerts', () => {
    const overduePo: PurchaseOrder = {
      id: 'PO-0005',
      supplierId: 'sup-1',
      items: [{ productId: 'prod-1', quantity: 10, unitPrice: 220 }],
      status: 'Sent',
      orderDate: '2026-10-01',
      expectedDate: '2026-10-10',
      totalAmount: 2200,
      notes: '',
    };

    const lateReceivedPo: PurchaseOrder = {
      id: 'PO-0004',
      supplierId: 'sup-1',
      items: [{ productId: 'prod-1', quantity: 10, unitPrice: 220, receivedQuantity: 10 }],
      status: 'Received',
      orderDate: '2026-09-01',
      expectedDate: '2026-09-05',
      receivedDate: '2026-09-12', // 0% on-time rate
      totalAmount: 2200,
      notes: '',
    };

    const alerts = computeSystemAlerts(
      sampleProducts,
      [sampleSupplier],
      [overduePo, lateReceivedPo],
      10,
      '2026-10-26'
    );

    expect(alerts.some((a) => a.category === 'OUT_OF_STOCK')).toBe(true);
    expect(alerts.some((a) => a.category === 'LOW_STOCK')).toBe(true);
    expect(alerts.some((a) => a.category === 'OVERDUE_PO')).toBe(true);
    expect(alerts.some((a) => a.category === 'POOR_SUPPLIER')).toBe(true);
  });
});
