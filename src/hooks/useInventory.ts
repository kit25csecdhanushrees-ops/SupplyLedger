import { useMemo } from 'react';
import { useStockTrack } from '../store/StockTrackContext';
import {
  calculateTotalStockValue,
  compareSuppliersForProduct,
  getStockStatus,
  productsToCsv,
} from '../domain/businessRules';
import { Product, StockStatus } from '../types';

export function useInventory() {
  const {
    data,
    isHydrating,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStock,
    importProductsCsv,
  } = useStockTrack();

  const categories = useMemo(() => {
    const unique = new Set(data.products.map((p) => p.category).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [data.products]);

  const inventorySummary = useMemo(() => {
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const p of data.products) {
      const status = getStockStatus(p, data.settings.defaultLowStockThreshold);
      if (status === StockStatus.IN_STOCK) inStockCount++;
      else if (status === StockStatus.LOW_STOCK) lowStockCount++;
      else outOfStockCount++;
    }

    return {
      totalProducts: data.products.length,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      totalCostValue: calculateTotalStockValue(data.products, 'cost'),
      totalRetailValue: calculateTotalStockValue(data.products, 'retail'),
    };
  }, [data.products, data.settings.defaultLowStockThreshold]);

  const getProductStatus = (product: Product): StockStatus =>
    getStockStatus(product, data.settings.defaultLowStockThreshold);

  const getProductSuppliers = (product: Product) =>
    compareSuppliersForProduct(
      product,
      data.suppliers,
      data.supplierProducts,
      data.purchaseOrders
    );

  const getProductMovements = (productId: string) =>
    data.stockMovements
      .filter((m) => m.productId === productId)
      .sort((a, b) => b.date.localeCompare(a.date));

  const exportCsvString = () => productsToCsv(data.products, data.suppliers);

  return {
    products: data.products,
    suppliers: data.suppliers,
    supplierProducts: data.supplierProducts,
    currency: data.settings.currency,
    defaultLowStockThreshold: data.settings.defaultLowStockThreshold,
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
  };
}
