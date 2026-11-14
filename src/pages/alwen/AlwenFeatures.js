import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { alwenApiDownload, alwenApiRequest, alwenApiUpload } from "../../services/alwenApi";
import "../../styles/AlwenFeatures.css";

const today = () => new Date().toISOString().slice(0, 10);
const tabs = [
  ["suppliers", "Suppliers"],
  ["contracts", "Contracts"],
  ["invoices", "Invoices"],
  ["reports", "Reports"],
  ["notifications", "Notifications"],
  ["qbo", "QuickBooks"]
];
const currency = (value) => new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

function Field({ label, children }) {
  return <label className="alwen-feature-field"><span>{label}</span>{children}</label>;
}

function Message({ error, message }) {
  if (!error && !message) return null;
  return <p className={error ? "alwen-feature-error" : "alwen-feature-success"} role={error ? "alert" : "status"}>{error || message}</p>;
}

export default function AlwenFeatures({ user }) {
  const { section } = useParams();
  const [tab, setTab] = useState(section || "suppliers");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [budgetRows, setBudgetRows] = useState([]);
  const [priceVariance, setPriceVariance] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [taxSettings, setTaxSettings] = useState({ vat_rate: "0.1600", wht_rates: {} });
  const [qboStatus, setQboStatus] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState({
    email_enabled: true,
    sms_enabled: false,
    alert_kinds: []
  });
  const [supplierDocumentType, setSupplierDocumentType] = useState("KRA PIN certificate");
  const [supplierFile, setSupplierFile] = useState(null);
  const [supplierDocumentExpiry, setSupplierDocumentExpiry] = useState("");
  const [contractFile, setContractFile] = useState(null);
  const [paymentAmounts, setPaymentAmounts] = useState({});
  const [contractForm, setContractForm] = useState({
    contract_number: "", supplier_id: "", start_date: today(), end_date: "", payment_terms: "",
    description: "", agreed_price: "", max_quantity: ""
  });
  const [invoiceForm, setInvoiceForm] = useState({
    purchase_order_id: "", receipt_line_id: "", invoice_number: "", invoice_date: today(), quantity: "", unit_price: "",
    etims_invoice_number: "", etims_verification_reference: ""
  });
  const [taxForm, setTaxForm] = useState({ vat_rate: "0.1600", services: "", professional_fees: "", contractual: "" });

  useEffect(() => {
    if (section && tabs.some(([key]) => key === section)) setTab(section);
  }, [section]);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      if (tab === "suppliers") {
        const result = await alwenApiRequest("/suppliers?limit=500");
        setSuppliers(result.items);
      } else if (tab === "contracts") {
        const [result, supplierData] = await Promise.all([
          alwenApiRequest("/contracts"),
          alwenApiRequest("/suppliers?limit=500")
        ]);
        setContracts(result.items);
        setSuppliers(supplierData.items);
      } else if (tab === "invoices") {
        const [invoiceData, orderData, receiptData, supplierData, settings] = await Promise.all([
          alwenApiRequest("/invoices"),
          alwenApiRequest("/purchase-orders?limit=100"),
          alwenApiRequest("/goods-receipts?limit=100"),
          alwenApiRequest("/suppliers?limit=500"),
          alwenApiRequest("/tax/settings")
        ]);
        setInvoices(invoiceData.items);
        setPurchaseOrders(orderData.items);
        setReceipts(receiptData.items);
        setSuppliers(supplierData.items);
        setTaxSettings(settings);
        setTaxForm((current) => ({
          ...current,
          vat_rate: settings.vat_rate,
          services: settings.wht_rates.services || "",
          professional_fees: settings.wht_rates.professional_fees || "",
          contractual: settings.wht_rates.contractual || ""
        }));
      } else if (tab === "reports") {
        const year = new Date().getFullYear();
        const [budgetData, varianceData] = await Promise.all([
          alwenApiRequest(`/reports/budget-vs-actual?year=${year}`),
          alwenApiRequest("/contracts/reports/price-variance")
        ]);
        setBudgetRows(budgetData.items);
        setPriceVariance(varianceData.items);
      } else if (tab === "notifications") {
        const [inbox, preferences] = await Promise.all([
          alwenApiRequest("/notifications/me"),
          alwenApiRequest("/notifications/preferences/me")
        ]);
        setNotifications(inbox.items);
        setNotificationPreferences(preferences);
      } else if (tab === "qbo") {
        setQboStatus(await alwenApiRequest("/integrations/qbo/status"));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const run = async (action, successMessage) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const orderLines = useMemo(() => {
    const order = purchaseOrders.find((entry) => String(entry.id) === invoiceForm.purchase_order_id);
    return order?.lines || [];
  }, [purchaseOrders, invoiceForm.purchase_order_id]);
  const matchedReceiptLines = receipts.flatMap((receipt) =>
    receipt.purchase_order_id === Number(invoiceForm.purchase_order_id)
      ? receipt.lines.map((line) => ({ ...line, received_date: receipt.received_date }))
      : []
  );
  const selectedReceiptLine = matchedReceiptLines.find((line) => String(line.id) === invoiceForm.receipt_line_id);
  const selectedOrderLine = orderLines.find((line) => line.id === selectedReceiptLine?.purchase_order_line_id);

  const submitInvoice = (event) => {
    event.preventDefault();
    const receiptLine = matchedReceiptLines.find((line) => String(line.id) === invoiceForm.receipt_line_id);
    const order = purchaseOrders.find((entry) => String(entry.id) === invoiceForm.purchase_order_id);
    if (!receiptLine || !order || !selectedOrderLine) return;
    run(async () => {
      await alwenApiRequest("/invoices", {
        method: "POST",
        body: {
          supplier_id: order.supplier_id,
          purchase_order_id: order.id,
          invoice_number: invoiceForm.invoice_number,
          invoice_date: invoiceForm.invoice_date,
          etims_invoice_number: invoiceForm.etims_invoice_number || null,
          etims_verification_reference: invoiceForm.etims_verification_reference || null,
          lines: [{
            purchase_order_line_id: selectedOrderLine.id,
            goods_receipt_line_id: receiptLine.id,
            item_id: selectedOrderLine.item_id,
            description: selectedOrderLine.description,
            quantity: invoiceForm.quantity,
            unit_price: invoiceForm.unit_price
          }]
        }
      });
      setInvoiceForm((current) => ({ ...current, invoice_number: "", quantity: "", unit_price: "" }));
    }, "Invoice recorded.");
  };

  const saveContract = (event) => {
    event.preventDefault();
    run(async () => {
      await alwenApiRequest("/contracts", {
        method: "POST",
        body: {
          contract_number: contractForm.contract_number,
          supplier_id: Number(contractForm.supplier_id),
          start_date: contractForm.start_date,
          end_date: contractForm.end_date,
          payment_terms: contractForm.payment_terms || null,
          lines: [{
            description: contractForm.description,
            agreed_price: contractForm.agreed_price,
            max_quantity: contractForm.max_quantity || null
          }]
        }
      });
      setContractForm((current) => ({ ...current, contract_number: "", description: "", agreed_price: "", max_quantity: "" }));
    }, "Contract saved as a draft.");
  };

  const loadSupplierDocument = (supplierId) => {
    if (!supplierFile) {
      setError("Choose a supplier document to upload.");
      return;
    }
    run(() => alwenApiUpload(
      `/suppliers/${supplierId}/documents`,
      supplierFile,
      {
        document_type: supplierDocumentType,
        ...(supplierDocumentExpiry ? { expires_on: supplierDocumentExpiry } : {})
      }
    ), "Supplier document uploaded.");
  };

  const uploadContractDocument = (contractId) => {
    if (!contractFile) {
      setError("Choose a signed contract PDF to upload.");
      return;
    }
    run(() => alwenApiUpload(`/contracts/${contractId}/document`, contractFile), "Signed contract uploaded.");
  };

  const payInvoice = (invoice) => {
    const amount = paymentAmounts[invoice.id];
    if (!amount) {
      setError("Enter a payment amount.");
      return;
    }
    run(() => alwenApiRequest(`/invoices/${invoice.id}/payments`, {
      method: "POST",
      body: { amount, payment_date: today() }
    }), "Invoice payment recorded.");
  };

  const savePreferences = (event) => {
    event.preventDefault();
    run(() => alwenApiRequest("/notifications/preferences/me", {
      method: "PUT",
      body: {
        email_enabled: Boolean(notificationPreferences.email_enabled),
        sms_enabled: Boolean(notificationPreferences.sms_enabled),
        alert_kinds: notificationPreferences.alert_kinds || []
      }
    }), "Notification preferences saved.");
  };

  const saveTaxSettings = (event) => {
    event.preventDefault();
    run(async () => {
      const wht_rates = Object.fromEntries(
        ["services", "professional_fees", "contractual"]
          .filter((key) => taxForm[key] !== "")
          .map((key) => [key, taxForm[key]])
      );
      await alwenApiRequest("/tax/settings", {
        method: "PUT",
        body: { vat_rate: taxForm.vat_rate, wht_rates }
      });
    }, "Tax settings updated.");
  };

  const markRead = (id) => run(
    () => alwenApiRequest(`/notifications/${id}/read`, { method: "PATCH" }),
    "Notification marked as read."
  );

  const downloadTaxReport = (kind) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    run(
      () => kind === "vat"
        ? alwenApiDownload(`/reports/tax/vat-input.xlsx?year=${year}&month=${month}`, `vat-input-${year}-${month}.xlsx`)
        : alwenApiDownload(`/reports/tax/withholding?year=${year}&month=${month}`, `withholding-${year}-${month}.json`),
      "Tax report downloaded."
    );
  };

  const openQbo = () => run(async () => {
    const result = await alwenApiRequest("/integrations/qbo/authorize");
    window.open(result.authorization_url, "_blank", "noopener,noreferrer");
  }, "QuickBooks authorization opened.");

  const downloadQboCsv = (entity) => run(
    () => alwenApiDownload(`/integrations/qbo/export/${entity}.csv`, `qbo-${entity}.csv`),
    "QuickBooks CSV downloaded."
  );

  return (
    <div className="page-shell alwen-features">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Alwen procurement & inventory</p>
          <h1 className="page-title">{tabs.find(([key]) => key === tab)?.[1] || "Procurement"}</h1>
          <p className="page-subtitle">Supplier compliance, contracts, invoices, reports, and notifications.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={load} disabled={loading || saving}>Refresh</button>
      </header>
      <div className="alwen-feature-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={tab === key ? "primary-btn" : "secondary-btn"}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <Message error={error} message={message} />
      {loading ? <section className="page-card"><p>Loading {tab}...</p></section> : null}

      {tab === "suppliers" && !loading ? (
        <section className="page-card">
          <div className="alwen-feature-toolbar">
            <label>Document type
              <select className="input-field" value={supplierDocumentType} onChange={(event) => setSupplierDocumentType(event.target.value)}>
                {["KRA PIN certificate", "Certificate of incorporation", "Tax compliance certificate", "Bank confirmation"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>PDF / JPG / PNG (max 10 MB)
              <input className="input-field" type="file" accept=".pdf,.jpg,.png" onChange={(event) => setSupplierFile(event.target.files?.[0] || null)} />
            </label>
            <label>Document expiry (optional)
              <input className="input-field" type="date" value={supplierDocumentExpiry} onChange={(event) => setSupplierDocumentExpiry(event.target.value)} />
            </label>
          </div>
          <div className="alwen-feature-table-wrap">
            <table className="data-table">
              <thead><tr><th>Supplier</th><th>Status</th><th>KRA PIN</th><th>Score</th><th>Compliance</th><th>Actions</th></tr></thead>
              <tbody>{suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td><td>{supplier.status}</td><td>{supplier.kra_pin || "—"}</td>
                  <td>{supplier.performance_score ?? "—"}</td>
                  <td>{supplier.vat_registered ? "VAT registered" : "Non-VAT"}</td>
                  <td className="alwen-feature-actions">
                    <button className="secondary-btn" type="button" onClick={() => run(async () => {
                      const result = await alwenApiRequest(`/suppliers/${supplier.id}/onboarding`);
                      setMessage(result.compliant ? "Supplier documents are compliant." : "Supplier is missing or has expired documents.");
                    }, "Onboarding status checked.")}>Check</button>
                    <button className="secondary-btn" type="button" onClick={() => loadSupplierDocument(supplier.id)} disabled={saving}>Upload</button>
                    <button className="secondary-btn" type="button" onClick={() => run(async () => {
                      const result = await alwenApiRequest(`/suppliers/${supplier.id}/scorecard`);
                      setMessage(`Supplier performance score: ${result.score}/100.`);
                    }, "Supplier scorecard refreshed.")}>Scorecard</button>
                    {supplier.status === "Suspended" ? <button className="secondary-btn" type="button" onClick={() => run(() => alwenApiRequest(`/suppliers/${supplier.id}/reapprove`, { method: "POST" }), "Supplier re-approved.")}>Re-approve</button> : null}
                  </td>
                </tr>
              ))}{!suppliers.length ? <tr><td colSpan="6">No suppliers found.</td></tr> : null}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "contracts" && !loading ? (
        <>
          {["Admin", "Procurement Officer"].includes(user.role) ? (
            <section className="page-card">
              <h2 className="panel-title">Create contract</h2>
              <form className="alwen-feature-form" onSubmit={saveContract}>
                <Field label="Contract number"><input className="input-field" required value={contractForm.contract_number} onChange={(event) => setContractForm({ ...contractForm, contract_number: event.target.value })} /></Field>
                <Field label="Supplier"><select className="input-field" required value={contractForm.supplier_id} onChange={(event) => setContractForm({ ...contractForm, supplier_id: event.target.value })}><option value="">Select supplier</option>{suppliers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
                <Field label="Start date"><input className="input-field" type="date" required value={contractForm.start_date} onChange={(event) => setContractForm({ ...contractForm, start_date: event.target.value })} /></Field>
                <Field label="End date"><input className="input-field" type="date" required value={contractForm.end_date} onChange={(event) => setContractForm({ ...contractForm, end_date: event.target.value })} /></Field>
                <Field label="Payment terms"><input className="input-field" value={contractForm.payment_terms} onChange={(event) => setContractForm({ ...contractForm, payment_terms: event.target.value })} /></Field>
                <Field label="Line description"><input className="input-field" required value={contractForm.description} onChange={(event) => setContractForm({ ...contractForm, description: event.target.value })} /></Field>
                <Field label="Agreed price (KES)"><input className="input-field" type="number" min="0" step="0.01" required value={contractForm.agreed_price} onChange={(event) => setContractForm({ ...contractForm, agreed_price: event.target.value })} /></Field>
                <Field label="Maximum quantity"><input className="input-field" type="number" min="0.001" step="0.001" value={contractForm.max_quantity} onChange={(event) => setContractForm({ ...contractForm, max_quantity: event.target.value })} /></Field>
                <button className="primary-btn" type="submit" disabled={saving}>Save draft</button>
              </form>
            </section>
          ) : null}
          <section className="page-card alwen-feature-table-wrap">
            <table className="data-table">
              <thead><tr><th>Contract</th><th>Supplier</th><th>Period</th><th>Status</th><th>Lines</th><th>Actions</th></tr></thead>
              <tbody>{contracts.map((contract) => (
                <tr key={contract.id}>
                  <td>{contract.contract_number}</td>
                  <td>{suppliers.find((supplier) => supplier.id === contract.supplier_id)?.name || contract.supplier_id}</td>
                  <td>{contract.start_date} – {contract.end_date}</td><td>{contract.status}</td>
                  <td>{contract.lines.map((line) => `${line.description} · ${currency(line.agreed_price)}${line.remaining_quantity ? ` · remaining ${line.remaining_quantity}` : ""}`).join("; ")}</td>
                  <td className="alwen-feature-actions">
                    {contract.status === "draft" ? <button className="secondary-btn" type="button" onClick={() => run(() => alwenApiRequest(`/contracts/${contract.id}/activate`, { method: "POST" }), "Contract activated.")}>Activate</button> : null}
                    <label className="alwen-feature-upload">Signed PDF<input type="file" accept=".pdf,application/pdf" onChange={(event) => setContractFile(event.target.files?.[0] || null)} /></label>
                    <button className="secondary-btn" type="button" onClick={() => uploadContractDocument(contract.id)} disabled={saving}>Upload</button>
                  </td>
                </tr>
              ))}{!contracts.length ? <tr><td colSpan="6">No contracts found.</td></tr> : null}</tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "invoices" && !loading ? (
        <>
          {["Admin", "Procurement Officer", "Finance"].includes(user.role) ? (
            <section className="page-card">
              <h2 className="panel-title">Record invoice against received goods</h2>
              <form className="alwen-feature-form" onSubmit={submitInvoice}>
                <Field label="Purchase order"><select className="input-field" required value={invoiceForm.purchase_order_id} onChange={(event) => setInvoiceForm({ ...invoiceForm, purchase_order_id: event.target.value, receipt_line_id: "", quantity: "", unit_price: "" })}><option value="">Select PO</option>{purchaseOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></Field>
                <Field label="Received line"><select className="input-field" required value={invoiceForm.receipt_line_id} onChange={(event) => {
                  const receipt = matchedReceiptLines.find((line) => String(line.id) === event.target.value);
                  const poLine = orderLines.find((line) => line.id === receipt?.purchase_order_line_id);
                  setInvoiceForm({ ...invoiceForm, receipt_line_id: event.target.value, quantity: receipt?.quantity || "", unit_price: poLine?.unit_price || "" });
                }}><option value="">Select received line</option>{matchedReceiptLines.map((line) => <option key={line.id} value={line.id}>{line.description} · received {line.quantity}</option>)}</select></Field>
                <Field label="Invoice number"><input className="input-field" required value={invoiceForm.invoice_number} onChange={(event) => setInvoiceForm({ ...invoiceForm, invoice_number: event.target.value })} /></Field>
                <Field label="Invoice date"><input className="input-field" type="date" required value={invoiceForm.invoice_date} onChange={(event) => setInvoiceForm({ ...invoiceForm, invoice_date: event.target.value })} /></Field>
                <Field label="Quantity"><input className="input-field" type="number" min="0.001" step="0.001" required value={invoiceForm.quantity} onChange={(event) => setInvoiceForm({ ...invoiceForm, quantity: event.target.value })} /></Field>
                <Field label="Unit price (KES)"><input className="input-field" type="number" min="0" step="0.01" required value={invoiceForm.unit_price} onChange={(event) => setInvoiceForm({ ...invoiceForm, unit_price: event.target.value })} /></Field>
                <Field label="eTIMS invoice number"><input className="input-field" value={invoiceForm.etims_invoice_number} onChange={(event) => setInvoiceForm({ ...invoiceForm, etims_invoice_number: event.target.value })} /></Field>
                <Field label="eTIMS verification reference"><input className="input-field" value={invoiceForm.etims_verification_reference} onChange={(event) => setInvoiceForm({ ...invoiceForm, etims_verification_reference: event.target.value })} /></Field>
                <button className="primary-btn" type="submit" disabled={saving || !matchedReceiptLines.length}>Save invoice</button>
              </form>
            </section>
          ) : null}
          <section className="page-card">
            <details className="alwen-feature-tax"><summary>Tax settings</summary>
              <p>VAT rate: {taxSettings.vat_rate}; WHT rates: {JSON.stringify(taxSettings.wht_rates)}</p>
              {user.role === "Admin" ? <form className="alwen-feature-form" onSubmit={saveTaxSettings}>
                <Field label="VAT rate (fraction)"><input className="input-field" type="number" min="0" max="1" step="0.0001" value={taxForm.vat_rate} onChange={(event) => setTaxForm({ ...taxForm, vat_rate: event.target.value })} /></Field>
                {["services", "professional_fees", "contractual"].map((key) => <Field key={key} label={`${key.replace("_", " ")} WHT rate`}><input className="input-field" type="number" min="0" max="1" step="0.0001" value={taxForm[key]} onChange={(event) => setTaxForm({ ...taxForm, [key]: event.target.value })} /></Field>)}
                <button className="secondary-btn" type="submit" disabled={saving}>Save tax settings</button>
              </form> : null}
            </details>
          </section>
          <section className="page-card alwen-feature-table-wrap">
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Supplier</th><th>Date</th><th>Net</th><th>VAT</th><th>Total</th><th>Match</th><th>Payment</th></tr></thead>
              <tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_number}</td><td>{invoice.supplier}</td><td>{invoice.invoice_date}</td><td>{currency(invoice.net_amount)}</td><td>{currency(invoice.vat_amount)}</td><td>{currency(invoice.total_amount)}</td><td>{invoice.matching_status}</td><td>{invoice.payment_status}{invoice.payment_status !== "Paid" && ["Admin", "Finance"].includes(user.role) ? <div className="alwen-feature-payment"><input aria-label={`Payment amount for ${invoice.invoice_number}`} className="input-field" type="number" min="0.01" step="0.01" value={paymentAmounts[invoice.id] || ""} onChange={(event) => setPaymentAmounts({ ...paymentAmounts, [invoice.id]: event.target.value })} /><button className="secondary-btn" type="button" onClick={() => payInvoice(invoice)} disabled={saving}>Pay</button></div> : null}</td></tr>)}{!invoices.length ? <tr><td colSpan="8">No invoices found.</td></tr> : null}</tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "reports" && !loading ? (
        <>
          <section className="page-card alwen-feature-actions">
            <button className="secondary-btn" onClick={() => downloadTaxReport("vat")}>Download VAT input Excel</button>
            <button className="secondary-btn" onClick={() => downloadTaxReport("wht")}>Download WHT schedule</button>
          </section>
          <section className="page-card alwen-feature-table-wrap">
            <h2 className="panel-title">Budget vs actual — {new Date().getFullYear()}</h2>
            <table className="data-table">
              <thead><tr><th>Project</th><th>Month</th><th>Budget</th><th>Committed</th><th>Received</th><th>Invoiced net</th></tr></thead>
              <tbody>{budgetRows.map((row) => <tr key={`${row.project_id}-${row.month}`}><td>{row.project}</td><td>{String(row.month).padStart(2, "0")}</td><td>{currency(row.budget)}</td><td>{currency(row.committed)}</td><td>{currency(row.received_value)}</td><td>{currency(row.invoiced_net)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="page-card alwen-feature-table-wrap">
            <h2 className="panel-title">Contract price variance</h2>
            <table className="data-table"><thead><tr><th>PO</th><th>Contract</th><th>Line</th><th>Paid</th><th>Agreed</th><th>Variance</th></tr></thead>
              <tbody>{priceVariance.map((row) => <tr key={row.purchase_order_line_id}><td>{row.order_number}</td><td>{row.contract_number}</td><td>{row.description}</td><td>{currency(row.paid_price)}</td><td>{currency(row.contract_price)}</td><td>{currency(row.variance)}</td></tr>)}{!priceVariance.length ? <tr><td colSpan="6">No contract price variances.</td></tr> : null}</tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "notifications" && !loading ? (
        <>
          <section className="page-card">
            <h2 className="panel-title">Notification preferences</h2>
            <form className="alwen-feature-form" onSubmit={savePreferences}>
              <Field label="Email">
                <select className="input-field" value={String(notificationPreferences.email_enabled)} onChange={(event) => setNotificationPreferences({ ...notificationPreferences, email_enabled: event.target.value === "true" })}>
                  <option value="true">On</option><option value="false">Off</option>
                </select>
              </Field>
              <Field label="SMS (requires provider configuration)">
                <select className="input-field" value={String(notificationPreferences.sms_enabled)} onChange={(event) => setNotificationPreferences({ ...notificationPreferences, sms_enabled: event.target.value === "true" })}>
                  <option value="false">Off</option><option value="true">On</option>
                </select>
              </Field>
              <button className="primary-btn" type="submit" disabled={saving}>Save preferences</button>
            </form>
          </section>
          <section className="page-card">
            <h2 className="panel-title">Inbox</h2>
            {notifications.map((entry) => <article className={`alwen-feature-notification ${entry.read_at ? "is-read" : ""}`} key={entry.id}>
              <div><strong>{entry.title}</strong><p>{entry.message}</p><small>{new Date(entry.created_at).toLocaleString()}</small></div>
              {!entry.read_at ? <button className="secondary-btn" onClick={() => markRead(entry.id)}>Mark read</button> : null}
            </article>)}
            {!notifications.length ? <p>No notifications.</p> : null}
          </section>
        </>
      ) : null}

      {tab === "qbo" && !loading ? (
        <section className="page-card">
          <h2 className="panel-title">QuickBooks Online</h2>
          <p>{qboStatus?.configured ? `Connected to company ${qboStatus.realm_id} (${qboStatus.environment}).` : "Not connected. CSV exports remain available."}</p>
          {user.role === "Admin" ? <div className="alwen-feature-actions">
            {!qboStatus?.configured ? <button className="primary-btn" onClick={openQbo} disabled={saving}>Connect QBO</button> : null}
            <button className="secondary-btn" onClick={() => downloadQboCsv("purchase-orders")}>Export POs CSV</button>
            <button className="secondary-btn" onClick={() => downloadQboCsv("invoices")}>Export invoices CSV</button>
            {qboStatus?.configured ? <button className="secondary-btn" onClick={() => run(() => alwenApiRequest("/integrations/qbo/sync/import", { method: "POST" }), "QBO reference mappings refreshed.")}>Import reference data</button> : null}
          </div> : null}
        </section>
      ) : null}
    </div>
  );
}
