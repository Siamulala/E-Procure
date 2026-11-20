import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import { getCompanyLogoPngDataUrl } from "../utils/companyBrand";
import CompanyLogo from "./CompanyLogo";
import "../styles/PurchaseOrderBatchModal.css";

const VAT_RATE = 0.16;

function getTotals(order, includeVat) {
  const subtotal = order.lineItems.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
    0
  );
  const vat = includeVat ? subtotal * VAT_RATE : 0;
  return { subtotal, vat, total: subtotal + vat };
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function getExportRows(orders, suppliers, items, includeVat) {
  return orders.flatMap((order) => {
    const supplier = suppliers.find((entry) => entry.id === order.supplierId);
    const totals = getTotals(order, includeVat);
    return order.lineItems.map((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return {
        "PO Number": order.orderNumber || order.id,
        Supplier: supplier?.name || "Unknown supplier",
        Date: order.date,
        SKU: item?.sku || "N/A",
        Item: item?.name || "Unknown item",
        Quantity: Number(line.quantity),
        UOM: line.uom || item?.uom || "",
        "Unit Price (KSh)": Number(line.unitCost),
        "Line Total (KSh)": Number(line.quantity) * Number(line.unitCost),
        "Subtotal (KSh)": totals.subtotal,
        "VAT (16%) (KSh)": totals.vat,
        "Grand Total (KSh)": totals.total,
      };
    });
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function PurchaseOrderBatchModal({ orders, onClose }) {
  const { suppliers, items } = useInventory();
  const [includeVat, setIncludeVat] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!orders.length) return undefined;
    window.document.body.classList.add("voucher-open");
    return () => window.document.body.classList.remove("voucher-open");
  }, [orders.length]);

  const exportRows = useMemo(
    () => getExportRows(orders, suppliers, items, includeVat),
    [orders, suppliers, items, includeVat]
  );
  const total = orders.reduce((sum, order) => sum + getTotals(order, includeVat).total, 0);

  const createPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const companyLogo = await getCompanyLogoPngDataUrl();
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      orders.forEach((order, orderIndex) => {
        if (orderIndex > 0) pdf.addPage();
        const supplier = suppliers.find((entry) => entry.id === order.supplierId);
        const totals = getTotals(order, includeVat);
        let y = 20;

        pdf.addImage(companyLogo, "PNG", 16, 8, 58, 13);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.text("PURCHASE ORDER", 194, 18, { align: "right" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.text(order.orderNumber || order.id, 194, 25, { align: "right" });
        pdf.line(16, 34, 194, 34);

        y = 45;
        pdf.setFont("helvetica", "bold");
        pdf.text("SUPPLIER", 16, y);
        pdf.text("ORDER DETAILS", 110, y);
        pdf.setFont("helvetica", "normal");
        pdf.text(supplier?.name || "Unknown supplier", 16, y + 7);
        pdf.text(supplier?.email || "", 16, y + 13);
        pdf.text(`Issue date: ${order.date || "—"}`, 110, y + 7);
        if (order.quotationId) pdf.text(`Quotation ref: ${order.quotationId}`, 110, y + 13);

        y += 34;
        const columns = [16, 28, 54, 118, 142, 166];
        pdf.setFillColor(30, 41, 59);
        pdf.rect(16, y - 5, 178, 9, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        ["#", "SKU", "ITEM DESCRIPTION", "QTY / UOM", "UNIT (KSh)", "TOTAL (KSh)"].forEach((label, index) => {
          pdf.text(label, columns[index], y);
        });
        pdf.setTextColor(30, 41, 59);
        pdf.setFont("helvetica", "normal");
        y += 10;

        order.lineItems.forEach((line, lineIndex) => {
          if (y > 250) {
            pdf.addPage();
            y = 20;
          }
          const item = items.find((entry) => entry.id === line.itemId);
          const quantity = Number(line.quantity) || 0;
          const unitCost = Number(line.unitCost) || 0;
          const lineTotal = quantity * unitCost;
          pdf.text(String(lineIndex + 1), columns[0], y);
          pdf.text(item?.sku || "N/A", columns[1], y);
          pdf.text((item?.name || "Unknown item").slice(0, 34), columns[2], y);
          pdf.text(`${quantity} ${line.uom || item?.uom || ""}`.trim(), columns[3], y);
          pdf.text(unitCost.toLocaleString("en-KE", { minimumFractionDigits: 2 }), columns[4], y);
          pdf.text(lineTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 }), columns[5], y);
          pdf.setDrawColor(226, 232, 240);
          pdf.line(16, y + 3, 194, y + 3);
          y += 10;
        });

        y = Math.max(y + 8, 205);
        pdf.setFontSize(10);
        pdf.text(`Subtotal: ${formatKsh(totals.subtotal, true)}`, 194, y, { align: "right" });
        if (includeVat) {
          pdf.text(`VAT (16%): ${formatKsh(totals.vat, true)}`, 194, y + 7, { align: "right" });
          y += 7;
        } else {
          pdf.text("VAT: Not applied", 194, y + 7, { align: "right" });
          y += 7;
        }
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(`TOTAL: ${formatKsh(totals.total, true)}`, 194, y + 9, { align: "right" });
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text("Please quote this purchase order number on delivery notes and invoices.", 16, 275);
      });
    return pdf;
  };

  const downloadPdf = async () => {
    setError("");
    setMessage("");
    try {
      const pdf = await createPdf();
      pdf.save("purchase-orders.pdf");
      setMessage("PDF downloaded.");
    } catch (downloadError) {
      setError(`Could not create the PDF: ${downloadError.message}`);
    }
  };

  const exportExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();
      const headers = Object.keys(exportRows[0] || {});
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Easy-Procure"],
        ["Purchase Orders"],
        [new Date().toLocaleString()],
        [],
        headers,
        ...exportRows.map((row) => headers.map((header) => row[header]))
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet, "Purchase Order Lines");
      XLSX.writeFile(workbook, "purchase-orders.xlsx");
      setError("");
      setMessage("Excel file downloaded.");
    } catch (exportError) {
      setError(`Could not export Excel: ${exportError.message}`);
    }
  };

  const exportCsv = () => {
    const headers = Object.keys(exportRows[0] || {});
    if (!headers.length) {
      setError("There are no purchase-order lines to export.");
      return;
    }
    const content = [
      csvEscape("Easy-Procure"),
      csvEscape("Purchase Orders"),
      "",
      headers.map(csvEscape).join(","),
      ...exportRows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
    ].join("\r\n");
    downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8" }), "purchase-orders.csv");
    setError("");
    setMessage("CSV file downloaded.");
  };

  const shareOrders = async () => {
    setError("");
    setMessage("");
    const summary = orders.map((order) => {
      const supplier = suppliers.find((entry) => entry.id === order.supplierId);
      return `${order.orderNumber || order.id} — ${supplier?.name || "Unknown supplier"} — ${formatKsh(getTotals(order, includeVat).total, true)}`;
    }).join("\n");
    try {
      if (navigator.share) {
        const pdfFile = new File([(await createPdf()).output("blob")], "purchase-orders.pdf", { type: "application/pdf" });
        if (navigator.canShare?.({ files: [pdfFile] })) {
          await navigator.share({ title: "Purchase orders", text: summary, files: [pdfFile] });
          setMessage("Purchase-order PDF shared.");
        } else {
          await navigator.share({ title: "Purchase orders", text: summary });
          setMessage("Purchase-order summary shared.");
        }
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        setMessage("Purchase order summary copied for sharing.");
      } else {
        throw new Error("Sharing is unavailable in this browser.");
      }
    } catch (shareError) {
      if (shareError.name === "AbortError") {
        setMessage("Sharing cancelled.");
      } else {
        setError(`Could not share purchase orders: ${shareError.message}`);
      }
    }
  };

  if (!orders.length) return null;

  return (
    <div className="voucher-backdrop po-batch-backdrop">
      <section className="voucher-sheet po-batch-sheet" role="dialog" aria-modal="true" aria-labelledby="po-batch-title">
        <div className="po-batch-toolbar no-print">
          <div>
            <h2 id="po-batch-title">Purchase order documents</h2>
            <p>{orders.length} selected · one supplier · received orders excluded</p>
          </div>
          <div className="po-batch-actions">
            <label className="po-vat-toggle">
              <input type="checkbox" checked={includeVat} onChange={(event) => setIncludeVat(event.target.checked)} />
              Include VAT (16%)
            </label>
            <button type="button" className="primary-btn" onClick={() => window.print()}>Print</button>
            <button type="button" className="secondary-btn" onClick={downloadPdf}>Download PDF</button>
            <button type="button" className="secondary-btn" onClick={exportExcel}>Export Excel</button>
            <button type="button" className="secondary-btn" onClick={exportCsv}>Export CSV</button>
            <button type="button" className="secondary-btn" onClick={shareOrders}>Share</button>
            <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
          </div>
          {error ? <p className="po-batch-error" role="alert">{error}</p> : null}
          {message ? <p className="po-batch-message" role="status">{message}</p> : null}
        </div>

        <div className="po-batch-documents">
          {orders.map((order) => {
            const supplier = suppliers.find((entry) => entry.id === order.supplierId);
            const totals = getTotals(order, includeVat);
            return (
              <article className="po-print-document" key={order.id}>
                <header className="po-print-header">
                  <div>
                    <CompanyLogo className="po-document-logo" />
                    <h1>Purchase Order</h1>
                  </div>
                  <div className="po-print-reference">
                    <strong>{order.orderNumber || order.id}</strong>
                    <span>Issued {order.date || "—"}</span>
                  </div>
                </header>
                <div className="po-print-meta">
                  <div><span>Supplier</span><strong>{supplier?.name || "Unknown supplier"}</strong><small>{supplier?.email || ""}</small></div>
                  <div><span>Delivery location</span><strong>Central Warehouse &amp; NOC Store</strong><small>{supplier?.leadTimeDays ?? "—"} business-day lead time</small></div>
                  {order.quotationId ? <div><span>Quotation reference</span><strong>{order.quotationId}</strong></div> : null}
                </div>
                <table className="po-print-table">
                  <thead><tr><th>#</th><th>SKU</th><th>Description</th><th>Quantity (UOM)</th><th>Unit price</th><th>Line total</th></tr></thead>
                  <tbody>
                    {order.lineItems.map((line, index) => {
                      const item = items.find((entry) => entry.id === line.itemId);
                      const lineTotal = Number(line.quantity) * Number(line.unitCost);
                      return (
                        <tr key={`${order.id}-${line.itemId}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{item?.sku || "N/A"}</td>
                          <td>{item?.name || "Unknown item"}</td>
                          <td>{line.quantity} {line.uom || item?.uom || ""}</td>
                          <td>{formatKsh(line.unitCost, true)}</td>
                          <td>{formatKsh(lineTotal, true)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <dl className="po-print-totals">
                  <div><dt>Subtotal</dt><dd>{formatKsh(totals.subtotal, true)}</dd></div>
                  {includeVat ? <div><dt>VAT (16%)</dt><dd>{formatKsh(totals.vat, true)}</dd></div> : null}
                  <div className="po-print-grand-total"><dt>Total {includeVat ? "(incl. VAT)" : "(VAT not applied)"}</dt><dd>{formatKsh(totals.total, true)}</dd></div>
                </dl>
                <footer className="po-print-footer">
                  <p>Please quote the purchase order number on delivery notes and invoices. Goods are subject to inspection upon receipt.</p>
                  <div><span>Prepared by</span><span>Authorized by</span><span>Supplier acknowledgment</span></div>
                </footer>
              </article>
            );
          })}
          <div className="po-batch-total no-print">Selected orders total: <strong>{formatKsh(total, true)}</strong></div>
        </div>
      </section>
    </div>
  );
}
