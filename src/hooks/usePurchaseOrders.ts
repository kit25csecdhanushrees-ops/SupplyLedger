import { useMemo } from 'react';
import { useStockTrack } from '../store/StockTrackContext';
import {
  getReorderSuggestions,
  isPurchaseOrderOverdue,
} from '../domain/businessRules';
import { PurchaseOrder } from '../types';

export function usePurchaseOrders() {
  const {
    data,
    isHydrating,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    autoGenerateReorderDrafts,
  } = useStockTrack();

  const reorderSuggestions = useMemo(
    () =>
      getReorderSuggestions(
        data.products,
        data.suppliers,
        data.supplierProducts,
        data.purchaseOrders,
        data.settings.defaultLowStockThreshold
      ),
    [
      data.products,
      data.suppliers,
      data.supplierProducts,
      data.purchaseOrders,
      data.settings.defaultLowStockThreshold,
    ]
  );

  const stats = useMemo(() => {
    const openCount = data.purchaseOrders.filter(
      (po) =>
        po.status === 'Draft' ||
        po.status === 'Sent' ||
        po.status === 'Partially Received'
    ).length;

    const overdueCount = data.purchaseOrders.filter((po) =>
      isPurchaseOrderOverdue(po)
    ).length;

    const committedValue = data.purchaseOrders
      .filter((po) => po.status === 'Sent' || po.status === 'Partially Received')
      .reduce((sum, po) => sum + po.totalAmount, 0);

    return {
      totalCount: data.purchaseOrders.length,
      openCount,
      overdueCount,
      committedValue,
    };
  }, [data.purchaseOrders]);

  const getSupplierAutoPrice = (supplierId: string, productId: string): { unitPrice: number; minOrderQty: number } => {
    const link = data.supplierProducts.find(
      (sp) => sp.supplierId === supplierId && sp.productId === productId
    );
    if (link) {
      return { unitPrice: link.supplierPrice, minOrderQty: link.minOrderQty };
    }
    const product = data.products.find((p) => p.id === productId);
    return { unitPrice: product?.costPrice ?? 0, minOrderQty: 1 };
  };

  const checkOverdue = (po: PurchaseOrder) => isPurchaseOrderOverdue(po);

  return {
    purchaseOrders: data.purchaseOrders,
    suppliers: data.suppliers,
    products: data.products,
    supplierProducts: data.supplierProducts,
    companyName: data.settings.companyName,
    currency: data.settings.currency,
    isHydrating,
    stats,
    reorderSuggestions,
    getSupplierAutoPrice,
    checkOverdue,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    autoGenerateReorderDrafts,
  };
}
