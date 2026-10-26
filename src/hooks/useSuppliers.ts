import { useMemo } from 'react';
import { useStockTrack } from '../store/StockTrackContext';
import {
  calculateSupplierMetrics,
  compareSuppliersForProduct,
} from '../domain/businessRules';
import { Product } from '../types';

export function useSuppliers() {
  const {
    data,
    isHydrating,
    addSupplier,
    updateSupplier,
    toggleSupplierStatus,
    upsertSupplierProduct,
    removeSupplierProduct,
  } = useStockTrack();

  const suppliersWithMetrics = useMemo(() => {
    return data.suppliers.map((supplier) => ({
      supplier,
      metrics: calculateSupplierMetrics(supplier, data.purchaseOrders),
      suppliedProductsCount: data.supplierProducts.filter(
        (sp) => sp.supplierId === supplier.id
      ).length,
    }));
  }, [data.suppliers, data.purchaseOrders, data.supplierProducts]);

  const getSupplierCatalog = (supplierId: string) => {
    const links = data.supplierProducts.filter((sp) => sp.supplierId === supplierId);
    return links
      .map((link) => {
        const product = data.products.find((p) => p.id === link.productId);
        return product ? { link, product } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  };

  const getSupplierOrders = (supplierId: string) =>
    data.purchaseOrders
      .filter((po) => po.supplierId === supplierId)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  const getComparisonForProduct = (product: Product) =>
    compareSuppliersForProduct(
      product,
      data.suppliers,
      data.supplierProducts,
      data.purchaseOrders
    );

  return {
    suppliers: data.suppliers,
    products: data.products,
    supplierProducts: data.supplierProducts,
    currency: data.settings.currency,
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
  };
}
