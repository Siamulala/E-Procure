import React, { useEffect } from "react";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import CompanyLogo from "./CompanyLogo";
import "../styles/VoucherModal.css";

export default function VoucherModal({ type, document, onClose }) {
  const { suppliers, items } = useInventory();

  useEffect(() => {
    if (!document) return undefined;
    window.document.body.classList.add("voucher-open");
    return () => window.document.body.classList.remove("voucher-open");
  }, [document]);

  if (!document) return null;

  const isPurchaseOrder = type === "PO";
  const supplier = suppliers.find((entry) => entry.id === document.supplierId);
  const lines = document.lineItems.map((line, index) => {
    const item = items.find((entry) => entry.id === line.itemId);
    const unitPrice = Number(isPurchaseOrder ? line.unitCost : line.quotedUnitCost) || 0;
    const quantity = Number(line.quantity) || 0;
    return {
      id: `${document.id}-${line.itemId}-${index}`,
      sku: item?.sku || "N/A",
      name: item?.name || "Unknown item",
      quantity,
      uom: line.uom || item?.uom || "",
      unitPrice,
      total: quantity * unitPrice,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const taxAmount = subtotal * 0.16;

  return (
    <div className="voucher-backdrop">
      <section className="voucher-sheet" role="dialog" aria-modal="true" aria-labelledby="voucher-title">
        <div className="voucher-actions no-print">
          <strong>{isPurchaseOrder ? "Purchase order voucher" : "Quotation voucher"} preview</strong>
          <div>
            <button type="button" className="primary-btn" onClick={() => window.print()}>Print / Save PDF</button>
            <button type="button" className="secondary-btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="voucher-document">
          <header className="voucher-heading">
            <div>
              <CompanyLogo className="voucher-company-logo" />
              <h2 id="voucher-title">Easy-Procure Ltd.</h2>
              <p>Procurement &amp; Supply Chain Division · Nairobi, Kenya</p>
            </div>
            <div className="voucher-reference">
              <strong>{isPurchaseOrder ? "Purchase Order" : "Supplier Quotation"}</strong>
              <p>{document.id}</p>
              <small>{isPurchaseOrder ? `Issue date: ${document.date}` : `Valid until: ${document.validUntil}`}</small>
              {document.quotationId ? <small>Quotation reference: {document.quotationId}</small> : null}
              {!isPurchaseOrder && document.prId ? <small>Request reference: {document.prId}</small> : null}
            </div>
          </header>

          <div className="voucher-metadata">
            <div>
              <strong>Supplier</strong>
              <p>{supplier?.name || "Unknown supplier"}</p>
              <small>{supplier?.email || "—"}</small>
              <small>Payment terms: {supplier?.paymentTerms || "—"}</small>
            </div>
            <div>
              <strong>{isPurchaseOrder ? "Delivery" : "Quotation status"}</strong>
              <p>{isPurchaseOrder ? "Central Warehouse & NOC Store" : document.status}</p>
              {isPurchaseOrder ? <small>Expected lead time: {supplier?.leadTimeDays ?? "—"} business days</small> : null}
              {isPurchaseOrder ? <small>Status: {document.status}</small> : null}
            </div>
          </div>

          <table className="voucher-table">
            <thead>
              <tr><th>#</th><th>SKU</th><th>Item description</th><th>Quantity (UOM)</th><th>Unit price</th><th>Total</th></tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id}>
                  <td>{index + 1}</td>
                  <td>{line.sku}</td>
                  <td>{line.name}</td>
                  <td>{line.quantity} {line.uom}</td>
                  <td>{formatKsh(line.unitPrice, true)}</td>
                  <td>{formatKsh(line.total, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="voucher-totals">
            <div><dt>Subtotal</dt><dd>{formatKsh(subtotal, true)}</dd></div>
            <div><dt>VAT (16%)</dt><dd>{formatKsh(taxAmount, true)}</dd></div>
            <div className="voucher-grand-total"><dt>Grand total</dt><dd>{formatKsh(subtotal + taxAmount, true)}</dd></div>
          </dl>

          <footer className="voucher-footer">
            <p>
              {isPurchaseOrder
                ? "Please include the purchase order number on delivery notes and invoices. Goods are subject to inspection upon receipt."
                : "Quotation pricing is subject to the stated validity period and formal purchase order approval."}
            </p>
            <div className="voucher-signatures">
              <div><span /><strong>Prepared by</strong><small>Procurement Officer</small></div>
              <div><span /><strong>Authorized by</strong><small>Managing Director / Finance</small></div>
              <div><span /><strong>Supplier acknowledgment</strong><small>Date &amp; official stamp</small></div>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}
