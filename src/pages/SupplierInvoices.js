import React, { useState } from "react";
import PrintHeader from "../components/PrintHeader";
import RecordActions from "../components/RecordActions";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

export default function SupplierInvoices() {
  const { suppliers, purchaseOrders, supplierInvoices, addSupplierInvoice, recordSupplierPayment } = useInventory();
  const [form, setForm] = useState({ supplierId: "", number: "", date: new Date().toISOString().slice(0, 10), amount: "", purchaseOrderId: "" });
  const [payments, setPayments] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      addSupplierInvoice(form);
      setForm({ supplierId: "", number: "", date: new Date().toISOString().slice(0, 10), amount: "", purchaseOrderId: "" });
      setMessage("Supplier invoice recorded.");
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const pay = (invoice) => {
    setError("");
    setMessage("");
    try {
      recordSupplierPayment(invoice.id, payments[invoice.id]);
      setPayments((current) => ({ ...current, [invoice.id]: "" }));
      setMessage("Payment recorded.");
    } catch (paymentError) {
      setError(paymentError.message);
    }
  };

  return (
    <div className="page-shell">
      <PrintHeader title="Supplier Invoice" subtitle="Record supplier invoices and payments. Amounts are entered as invoiced totals." />
      <section className="page-card no-print">
        <h2 className="panel-title">Record invoice</h2>
        <form className="form-row" onSubmit={submit}>
          <label>Supplier<select className="input-field" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value, purchaseOrderId: "" })} required>
            <option value="">Select supplier</option>{suppliers.filter((supplier) => !supplier.archived).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select></label>
          <label>Invoice number<input className="input-field" value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} required /></label>
          <label>Invoice date<input className="input-field" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
          <label>Invoice total (KSh)<input className="input-field" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
          <label>Purchase order (optional)<select className="input-field" value={form.purchaseOrderId} onChange={(event) => setForm({ ...form, purchaseOrderId: event.target.value })}>
            <option value="">None</option>{purchaseOrders.filter((order) => order.supplierId === form.supplierId).map((order) => <option key={order.id} value={order.id}>{order.orderNumber || order.id}</option>)}
          </select></label>
          <button type="submit" className="primary-btn">Save invoice</button>
        </form>
      </section>
      {error || message ? <p role={error ? "alert" : "status"}>{error || message}</p> : null}
      <section className="page-card" style={{ overflowX: "auto" }}>
        <h2 className="panel-title">Supplier invoice register</h2>
        <RecordActions records={supplierInvoices} selectedRecords={supplierInvoices.filter((invoice) => selectedIds.includes(invoice.id))} recordName="supplier-invoices"
          formatPdfRecord={(invoice) => ({
            Invoice: invoice.number, Supplier: invoice.supplier, Date: invoice.date,
            "Purchase order": invoice.purchaseOrderNumber,
            Total: formatKsh(invoice.amountCents / 100, true), Paid: formatKsh(invoice.paidCents / 100, true),
            Outstanding: formatKsh((invoice.amountCents - invoice.paidCents) / 100, true),
          })} />
        <table className="data-table">
          <thead><tr><th className="no-print">Select</th><th>Invoice</th><th>Supplier</th><th>Date</th><th>Purchase order</th><th>Total</th><th>Paid</th><th>Outstanding</th><th className="no-print">Record payment</th></tr></thead>
          <tbody>
            {supplierInvoices.map((invoice) => {
              const outstanding = invoice.amountCents - invoice.paidCents;
              return <tr key={invoice.id}>
                <td className="no-print"><input type="checkbox" aria-label={`Select invoice ${invoice.number}`} checked={selectedIds.includes(invoice.id)} onChange={() => setSelectedIds((ids) => ids.includes(invoice.id) ? ids.filter((id) => id !== invoice.id) : [...ids, invoice.id])} /></td>
                <td>{invoice.number}</td><td>{invoice.supplier}</td><td>{invoice.date}</td><td>{invoice.purchaseOrderNumber || "—"}</td>
                <td>{formatKsh(invoice.amountCents / 100, true)}</td><td>{formatKsh(invoice.paidCents / 100, true)}</td><td>{formatKsh(outstanding / 100, true)}</td>
                <td className="no-print">{outstanding > 0 ? <>
                  <input className="input-field" aria-label={`Payment for ${invoice.number}`} type="number" min="0.01" step="0.01" value={payments[invoice.id] || ""} onChange={(event) => setPayments({ ...payments, [invoice.id]: event.target.value })} />
                  <button className="secondary-btn" type="button" onClick={() => pay(invoice)}>Record payment</button>
                </> : "Paid"}</td>
              </tr>;
            })}
            {!supplierInvoices.length ? <tr><td colSpan="9">No supplier invoices recorded.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
