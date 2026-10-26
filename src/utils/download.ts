import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Product, PurchaseOrder, Supplier, SupportedCurrency } from '../types';
import { formatCurrency } from '../domain/businessRules';

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats currency specifically for jsPDF (using INR/USD prefix because standard PDF Helvetica lacks ₹ glyph).
 */
function formatPdfCurrency(amount: number, currency: SupportedCurrency): string {
  if (currency === 'INR') {
    const hasDecimals = Math.abs(amount % 1) > 0.001;
    const num = new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `INR ${num}`;
  }
  return formatCurrency(amount, currency);
}

export function downloadPurchaseOrderPdf(params: {
  po: PurchaseOrder;
  supplier: Supplier | undefined;
  products: ReadonlyArray<Product>;
  companyName: string;
  currency: SupportedCurrency;
}) {
  const { po, supplier, products, companyName, currency } = params;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('PURCHASE ORDER', 40, 50);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(companyName, 40, 68);

  // PO Meta Right Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(po.id, 555, 50, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Status: ${po.status}`, 555, 65, { align: 'right' });
  doc.text(`Order Date: ${po.orderDate}`, 555, 79, { align: 'right' });
  doc.text(`Expected Delivery: ${po.expectedDate}`, 555, 93, { align: 'right' });
  if (po.receivedDate) {
    doc.text(`Received Date: ${po.receivedDate}`, 555, 107, { align: 'right' });
  }

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(40, 120, 555, 120);

  // Vendor Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Supplier / Vendor:', 40, 142);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  if (supplier) {
    doc.text(supplier.name, 40, 157);
    doc.text(`Attn: ${supplier.contactPerson}  |  ${supplier.phone}`, 40, 171);
    doc.text(supplier.email, 40, 185);
    doc.text(supplier.address, 40, 199, { maxWidth: 320 });
    doc.text(`Payment Terms: ${supplier.paymentTerms}`, 40, 224);
  } else {
    doc.text('Unknown Supplier', 40, 157);
  }

  const tableRows = po.items.map((item, idx) => {
    const product = products.find((p) => p.id === item.productId);
    const lineTotal = item.quantity * item.unitPrice;
    return [
      String(idx + 1),
      product?.SKU ?? item.productId,
      product?.name ?? 'Unknown Item',
      `${item.quantity} ${product?.unit ?? 'pcs'}`,
      `${item.receivedQuantity ?? 0} ${product?.unit ?? 'pcs'}`,
      formatPdfCurrency(item.unitPrice, currency),
      formatPdfCurrency(lineTotal, currency),
    ];
  });

  autoTable(doc, {
    startY: 245,
    head: [['#', 'SKU', 'Item Description', 'Ordered', 'Received', 'Unit Price', 'Line Total']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 68 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
    margin: { left: 40, right: 40 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 400;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total Amount: ${formatPdfCurrency(po.totalAmount, currency)}`,
    555,
    finalY + 28,
    { align: 'right' }
  );

  if (po.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Notes & Instructions:', 40, finalY + 52);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(po.notes, 40, finalY + 67, { maxWidth: 515 });
  }

  doc.save(`${po.id}_${supplier?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Order'}.pdf`);
}
