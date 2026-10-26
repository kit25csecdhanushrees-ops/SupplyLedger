import React from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock,
  FileEdit,
  PackageCheck,
  Send,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import {
  PurchaseOrderStatus,
  StockMovementType,
  StockStatus,
  SupplierStatus,
} from '../../types';

interface StockStatusBadgeProps {
  status: StockStatus;
}

export const StockStatusBadge: React.FC<StockStatusBadgeProps> = ({ status }) => {
  if (status === StockStatus.IN_STOCK) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>In Stock</span>
      </span>
    );
  }
  if (status === StockStatus.LOW_STOCK) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Low Stock</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
      <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Out of Stock</span>
    </span>
  );
};

interface PoStatusBadgeProps {
  status: PurchaseOrderStatus;
  isOverdue?: boolean;
}

export const PoStatusBadge: React.FC<PoStatusBadgeProps> = ({ status, isOverdue }) => {
  if (isOverdue && status !== 'Received' && status !== 'Cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{status} · Overdue</span>
      </span>
    );
  }

  switch (status) {
    case 'Draft':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
          <FileEdit className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Draft</span>
        </span>
      );
    case 'Sent':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap shrink-0">
          <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Sent</span>
        </span>
      );
    case 'Partially Received':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
          <PackageCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Partially Received</span>
        </span>
      );
    case 'Received':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Received</span>
        </span>
      );
    case 'Cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-500 line-through whitespace-nowrap shrink-0">
          <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Cancelled</span>
        </span>
      );
  }
};

export const SupplierStatusBadge: React.FC<{ status: SupplierStatus }> = ({ status }) => {
  if (status === 'Active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Active</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
      <Ban className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Inactive</span>
    </span>
  );
};

export const MovementTypeBadge: React.FC<{ type: StockMovementType }> = ({ type }) => {
  if (type === 'IN') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Stock In</span>
      </span>
    );
  }
  if (type === 'OUT') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap shrink-0">
        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Stock Out</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 whitespace-nowrap shrink-0">
      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Adjustment</span>
    </span>
  );
};
