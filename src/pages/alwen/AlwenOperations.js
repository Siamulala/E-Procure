import React, { useCallback, useEffect, useMemo, useState } from "react";
import { alwenApiRequest } from "../../services/alwenApi";
import AlwenAnalytics from "./AlwenAnalytics";
import "../../styles/Pages.css";

const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
};
const formatKES = (value) => new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

function ActionMessage({ error, message }) {
  if (!error && !message) return null;
  return (
    <p role={error ? "alert" : "status"} style={{ color: error ? "#b91c1c" : "#15803d" }}>
      {error || message}
    </p>
  );
}

function Field({ label, children }) {
  return (
    <label className="alwen-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function AlwenOperations({ user, initialTab = "requests" }) {
  const [tab, setTab] = useState(initialTab);
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balances, setBalances] = useState([]);
  const [movements, setMovements] = useState([]);
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [requestForm, setRequestForm] = useState({
    project_id: "",
    item_id: "",
    description: "",
    quantity: "",
    unit_id: "",
    required_by: "",
    proposed_supplier_id: "",
    proposed_supplier_reason: "",
    budget_override_reason: ""
  });
  const [quotes, setQuotes] = useState([{ supplier_id: "", rate: "" }]);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", email: "" });
  const [staffForm, setStaffForm] = useState({ name: "", phone: "" });
  const [itemForm, setItemForm] = useState({ name: "", sku: "", category_id: "", unit_id: "", reorder_level: "0" });
  const [receiptForm, setReceiptForm] = useState({
    purchase_order_id: "",
    purchase_order_line_id: "",
    store_id: "",
    receiver_id: "",
    quantity: "",
    unit_cost: "",
    delivery_note_number: ""
  });
  const [stockAction, setStockAction] = useState("issue");
  const [stockForm, setStockForm] = useState({
    item_id: "",
    store_id: "",
    quantity: "",
    project_id: "",
    staff_id: "",
    purpose: "",
    original_issue_id: "",
    from_store_id: "",
    to_store_id: "",
    quantity_delta: "",
    reason: ""
  });

  const canWritePR = ["Admin", "Procurement Officer"].includes(user.role);
  const canApprove = ["Admin", "Approver", "Director"].includes(user.role);
  const canReceive = ["Admin", "Procurement Officer", "Store Keeper"].includes(user.role);
  const canIssue = ["Admin", "Store Keeper"].includes(user.role);
  const canAdjust = canApprove;
  const availableTabs = useMemo(() => (
    user.role === "Project Manager"
      ? ["master", "requests", "orders", "analytics"]
      : ["master", "requests", "orders", "stock", "analytics"]
  ), [user.role]);

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [
        requestData,
        orderData,
        projectData,
        itemData,
        unitData,
        categoryData,
        supplierData,
        storeData,
        staffData,
        balanceData,
        movementData
      ] = await Promise.all([
        alwenApiRequest("/purchase-requests?limit=100"),
        alwenApiRequest("/purchase-orders?limit=100"),
        alwenApiRequest("/projects"),
        alwenApiRequest("/items?limit=500"),
        alwenApiRequest("/units"),
        alwenApiRequest("/categories"),
        alwenApiRequest("/suppliers?limit=500"),
        alwenApiRequest("/stores"),
        alwenApiRequest("/staff?limit=500"),
        user.role === "Project Manager" ? Promise.resolve({ items: [] }) : alwenApiRequest("/stock/balances?limit=500"),
        alwenApiRequest("/stock/movements?limit=100")
      ]);
      setRequests(requestData.items);
      setOrders(orderData.items);
      setProjects(projectData);
      setItems(itemData.items);
      setUnits(unitData);
      setCategories(categoryData);
      setSuppliers(supplierData.items);
      setStores(storeData);
      setStaff(staffData.items);
      setBalances(balanceData.items);
      setMovements(movementData.items);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const selectedOrder = orders.find((order) => String(order.id) === receiptForm.purchase_order_id);
    const firstLine = selectedOrder?.lines?.[0];
    if (firstLine) {
      setReceiptForm((current) => ({
        ...current,
        purchase_order_line_id: String(firstLine.id),
        unit_cost: firstLine.unit_price
      }));
    }
  }, [orders, receiptForm.purchase_order_id]);

  const runAction = async (action, successMessage) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await action();
      await loadData();
      setMessage(successMessage);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setSaving(false);
    }
  };

  const createStaff = (event) => {
    event.preventDefault();
    runAction(async () => {
      await alwenApiRequest("/staff", {
        method: "POST",
        body: { name: staffForm.name, phone: staffForm.phone || null }
      });
      setStaffForm({ name: "", phone: "" });
    }, "Staff member added.");
  };

  const updateRequestField = (event) => {
    const { name, value } = event.target;
    setRequestForm((current) => {
      if (name === "item_id") {
        const selected = items.find((item) => String(item.id) === value);
        return { ...current, item_id: value, description: selected?.name || current.description, unit_id: selected?.unit_id ? String(selected.unit_id) : current.unit_id };
      }
      return { ...current, [name]: value };
    });
  };

  const createRequest = (event) => {
    event.preventDefault();
    const supplierId = Number(requestForm.proposed_supplier_id) || null;
    const quotePayload = quotes
      .filter((quote) => quote.supplier_id && quote.rate)
      .map((quote) => ({
        supplier_id: Number(quote.supplier_id),
        lines: [{ line_index: 0, rate: quote.rate }]
      }));
    runAction(async () => {
      await alwenApiRequest("/purchase-requests", {
        method: "POST",
        body: {
          request_date: today(),
          required_by: requestForm.required_by || null,
          project_id: Number(requestForm.project_id) || null,
          budget_override_reason: requestForm.budget_override_reason || null,
          lines: [{
            item_id: Number(requestForm.item_id) || null,
            description: requestForm.description,
            quantity: requestForm.quantity,
            unit_id: Number(requestForm.unit_id) || null,
            proposed_supplier_id: supplierId,
            proposed_supplier_reason: requestForm.proposed_supplier_reason || null
          }],
          quotes: quotePayload
        }
      });
      setRequestForm({
        project_id: "",
        item_id: "",
        description: "",
        quantity: "",
        unit_id: "",
        required_by: "",
        proposed_supplier_id: "",
        proposed_supplier_reason: "",
        budget_override_reason: ""
      });
      setQuotes([{ supplier_id: "", rate: "" }]);
    }, "Purchase request saved as a draft.");
  };

  const createSupplier = (event) => {
    event.preventDefault();
    runAction(async () => {
      await alwenApiRequest("/suppliers", {
        method: "POST",
        body: {
          name: supplierForm.name,
          phone: supplierForm.phone || null,
          email: supplierForm.email || null
        }
      });
      setSupplierForm({ name: "", phone: "", email: "" });
    }, "Supplier added.");
  };

  const createItem = (event) => {
    event.preventDefault();
    runAction(async () => {
      await alwenApiRequest("/items", {
        method: "POST",
        body: {
          name: itemForm.name,
          sku: itemForm.sku || null,
          category_id: Number(itemForm.category_id) || null,
          unit_id: Number(itemForm.unit_id) || null,
          reorder_level: itemForm.reorder_level || "0"
        }
      });
      setItemForm({ name: "", sku: "", category_id: "", unit_id: "", reorder_level: "0" });
    }, "Item added.");
  };

  const updateRequest = (requestId, path, body, success) => runAction(
    () => alwenApiRequest(`/purchase-requests/${requestId}${path}`, {
      method: "POST",
      ...(body ? { body } : {})
    }),
    success
  );

  const decideRequest = (requestId, decision) => {
    const comments = decision === "Rejected" ? window.prompt("Reason for rejection:") : "";
    if (decision === "Rejected" && !comments?.trim()) return;
    updateRequest(requestId, "/decision", { decision, comments }, `Request ${decision.toLowerCase()}.`);
  };

  const selectedOrder = orders.find((order) => String(order.id) === receiptForm.purchase_order_id);
  const selectedOrderLines = selectedOrder?.lines || [];
  const selectedReceiptLine = selectedOrderLines.find((line) => String(line.id) === receiptForm.purchase_order_line_id);

  const receiveGoods = (event) => {
    event.preventDefault();
    runAction(async () => {
      await alwenApiRequest("/goods-receipts", {
        method: "POST",
        body: {
          purchase_order_id: Number(receiptForm.purchase_order_id),
          store_id: Number(receiptForm.store_id),
          receiver_id: Number(receiptForm.receiver_id),
          received_date: today(),
          delivery_note_number: receiptForm.delivery_note_number || null,
          lines: [{
            purchase_order_line_id: Number(receiptForm.purchase_order_line_id),
            quantity: receiptForm.quantity,
            unit_cost: receiptForm.unit_cost || null
          }]
        }
      });
      setReceiptForm((current) => ({ ...current, quantity: "", delivery_note_number: "" }));
    }, "Goods received and stock ledger updated.");
  };

  const submitStockAction = (event) => {
    event.preventDefault();
    const itemStore = {
      item_id: Number(stockForm.item_id),
      store_id: Number(stockForm.store_id)
    };
    let path;
    let body;
    if (stockAction === "issue") {
      path = "/stock/issues";
      body = {
        ...itemStore,
        quantity: stockForm.quantity,
        project_id: Number(stockForm.project_id) || null,
        staff_id: Number(stockForm.staff_id) || null,
        purpose: stockForm.purpose,
        movement_date: today()
      };
    } else if (stockAction === "return") {
      path = "/stock/returns";
      body = {
        original_issue_id: Number(stockForm.original_issue_id),
        quantity: stockForm.quantity,
        reason: stockForm.reason,
        movement_date: today()
      };
    } else if (stockAction === "transfer") {
      path = "/stock/transfers";
      body = {
        item_id: itemStore.item_id,
        from_store_id: Number(stockForm.from_store_id),
        to_store_id: Number(stockForm.to_store_id),
        quantity: stockForm.quantity,
        reason: stockForm.reason,
        movement_date: today()
      };
    } else {
      path = "/stock/adjustments";
      body = {
        ...itemStore,
        quantity_delta: stockForm.quantity_delta,
        reason: stockForm.reason,
        movement_date: today()
      };
    }
    runAction(
      () => alwenApiRequest(path, { method: "POST", body }),
      `Stock ${stockAction} recorded.`
    );
    setStockForm((current) => ({ ...current, quantity: "", quantity_delta: "", purpose: "", reason: "" }));
  };

  if (loading) return <div className="page-shell"><p>Loading Alwen operations...</p></div>;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-eyebrow">Alwen procurement & inventory</p>
          <h1 className="page-title">Operations</h1>
          <p className="page-subtitle">Purchase requests, purchase orders, receipts, and stock movements.</p>
        </div>
        <button className="secondary-btn" type="button" onClick={loadData} disabled={saving}>Refresh</button>
      </div>
      <ActionMessage error={error} message={message} />

      <div className="form-row" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, minmax(140px, 1fr))`, marginBottom: 16 }}>
        {availableTabs.map((name) => (
          <button key={name} type="button" className={tab === name ? "primary-btn" : "secondary-btn"} onClick={() => setTab(name)}>
            {name === "master" ? "Items & Suppliers" : name === "requests" ? "Purchase Requests" : name === "orders" ? "Purchase Orders" : name === "stock" ? "Stock" : "Analytics"}
          </button>
        ))}
      </div>

      {tab === "master" ? (
        <>
          {canWritePR ? (
            <section className="page-card">
              <h2 className="panel-title">Add supplier</h2>
              <form onSubmit={createSupplier} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 12 }}>
                <Field label="Supplier name"><input className="input-field" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                <Field label="Phone"><input className="input-field" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                <Field label="Email"><input className="input-field" type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></Field>
                <button className="primary-btn" type="submit" disabled={saving}>Save supplier</button>
              </form>
            </section>
          ) : null}
          {canWritePR ? (
            <section className="page-card">
              <h2 className="panel-title">Add staff / receiver</h2>
              <form onSubmit={createStaff} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 12 }}>
                <Field label="Name"><input className="input-field" value={staffForm.name} onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                <Field label="Phone"><input className="input-field" value={staffForm.phone} onChange={(event) => setStaffForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
                <button className="primary-btn" type="submit" disabled={saving}>Save staff member</button>
              </form>
            </section>
          ) : null}
          {canWritePR ? (
            <section className="page-card">
              <h2 className="panel-title">Add item</h2>
              <form onSubmit={createItem} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 12 }}>
                <Field label="Item name"><input className="input-field" value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                <Field label="SKU"><input className="input-field" value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} /></Field>
                <Field label="Category"><select className="input-field" value={itemForm.category_id} onChange={(event) => setItemForm((current) => ({ ...current, category_id: event.target.value }))}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                <Field label="Unit"><select className="input-field" value={itemForm.unit_id} onChange={(event) => setItemForm((current) => ({ ...current, unit_id: event.target.value }))}><option value="">Select unit</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}</select></Field>
                <Field label="Reorder level"><input className="input-field" type="number" min="0" step="0.001" value={itemForm.reorder_level} onChange={(event) => setItemForm((current) => ({ ...current, reorder_level: event.target.value }))} /></Field>
                <button className="primary-btn" type="submit" disabled={saving}>Save item</button>
              </form>
            </section>
          ) : null}
          <section className="page-card" style={{ overflowX: "auto" }}>
            <h2 className="panel-title">Items & suppliers</h2>
            <p className="panel-copy">{items.length} items · {suppliers.length} suppliers</p>
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Unit</th><th>Preferred supplier</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id}><td>{item.sku || "—"}</td><td>{item.name}</td><td>{item.category || "—"}</td><td>{item.unit || "—"}</td><td>{item.preferred_supplier || "—"}</td></tr>)}
                {!items.length ? <tr><td colSpan="5">No items have been set up.</td></tr> : null}
              </tbody>
            </table>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {suppliers.map((supplier) => <span className="soft-pill" key={supplier.id}>{supplier.name}</span>)}
            </div>
          </section>
        </>
      ) : null}

      {tab === "requests" ? (
        <>
          {canWritePR ? (
            <section className="page-card" style={{ marginBottom: 16 }}>
              <h2 className="panel-title">New purchase request</h2>
              <form onSubmit={createRequest} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <Field label="Project">
                  <select className="input-field" name="project_id" value={requestForm.project_id} onChange={updateRequestField}>
                    <option value="">Select project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </Field>
                <Field label="Received by">
                  <select className="input-field" value={receiptForm.receiver_id} onChange={(event) => setReceiptForm((current) => ({ ...current, receiver_id: event.target.value }))} required>
                    <option value="">Select receiver</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </Field>
                <Field label="Item">
                  <select className="input-field" name="item_id" value={requestForm.item_id} onChange={updateRequestField}>
                    <option value="">Select item (optional)</option>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Description">
                  <input className="input-field" name="description" value={requestForm.description} onChange={updateRequestField} required />
                </Field>
                <Field label="Quantity">
                  <input className="input-field" name="quantity" type="number" min="0.001" step="0.001" value={requestForm.quantity} onChange={updateRequestField} required />
                </Field>
                <Field label="Unit">
                  <select className="input-field" name="unit_id" value={requestForm.unit_id} onChange={updateRequestField}>
                    <option value="">Select unit</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
                  </select>
                </Field>
                <Field label="Required by">
                  <input className="input-field" type="date" name="required_by" value={requestForm.required_by} onChange={updateRequestField} />
                </Field>
                <Field label="Proposed supplier">
                  <select className="input-field" name="proposed_supplier_id" value={requestForm.proposed_supplier_id} onChange={updateRequestField}>
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <Field label="Reason if not lowest">
                  <input className="input-field" name="proposed_supplier_reason" value={requestForm.proposed_supplier_reason} onChange={updateRequestField} />
                </Field>
                <Field label="Budget override reason (if required)">
                  <input className="input-field" name="budget_override_reason" value={requestForm.budget_override_reason} onChange={updateRequestField} />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="panel-heading">
                    <h3 className="panel-title">Supplier quotations</h3>
                    <button className="secondary-btn" type="button" onClick={() => setQuotes((current) => [...current, { supplier_id: "", rate: "" }])}>Add quote</button>
                  </div>
                  {quotes.map((quote, index) => (
                    <div className="form-row" key={`quote-${index}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <Field label={`Supplier ${index + 1}`}>
                        <select
                          className="input-field"
                          value={quote.supplier_id}
                          onChange={(event) => setQuotes((current) => current.map((entry, row) => row === index ? { ...entry, supplier_id: event.target.value } : entry))}
                        >
                          <option value="">Select supplier</option>
                          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Unit rate (KES)">
                        <input
                          className="input-field"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={quote.rate}
                          onChange={(event) => setQuotes((current) => current.map((entry, row) => row === index ? { ...entry, rate: event.target.value } : entry))}
                        />
                      </Field>
                      {quotes.length > 1 ? <button className="secondary-btn" type="button" onClick={() => setQuotes((current) => current.filter((_, row) => row !== index))}>Remove</button> : null}
                    </div>
                  ))}
                </div>
                <button className="primary-btn" type="submit" disabled={saving}>Save draft</button>
              </form>
            </section>
          ) : null}
          <section className="page-card" style={{ overflowX: "auto" }}>
            <h2 className="panel-title">Requests</h2>
            <table className="data-table">
              <thead><tr><th>PR number</th><th>Date</th><th>Project</th><th>Lines</th><th>Status</th><th>Workflow</th></tr></thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.request_number}</td>
                    <td>{formatDate(request.request_date)}</td>
                    <td>{projects.find((project) => project.id === request.project_id)?.name || "—"}</td>
                    <td>
                      {request.lines.map((line) => (
                        <div key={line.id} style={{ marginBottom: 8 }}>
                          <strong>{line.description}</strong> ({line.quantity})
                          <div>
                            {line.quotes.map((quote) => (
                              <span key={quote.supplier_id} style={{ display: "inline-block", marginRight: 10, color: quote.is_lowest ? "#15803d" : "#64748b", fontWeight: quote.is_lowest ? 700 : 400 }}>
                                {quote.supplier}: {formatKES(quote.rate)}{quote.is_lowest ? " · lowest" : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {request.approvals.map((approval) => (
                        <p key={`${approval.user_id}-${approval.decided_at}`} className="panel-copy">
                          {approval.decision}{approval.comments ? `: ${approval.comments}` : ""}
                        </p>
                      ))}
                    </td>
                    <td>{request.status}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {request.status === "Draft" && canWritePR ? <button className="secondary-btn" disabled={saving} onClick={() => updateRequest(request.id, "/submit", null, "Request submitted.")}>Submit</button> : null}
                      {request.status === "Submitted" && canApprove ? (
                        <>
                          <button className="secondary-btn" disabled={saving} onClick={() => decideRequest(request.id, "Approved")}>Approve</button>
                          <button className="secondary-btn" disabled={saving} onClick={() => decideRequest(request.id, "Rejected")}>Reject</button>
                        </>
                      ) : null}
                      {request.status === "Approved" && canWritePR ? <button className="primary-btn" disabled={saving} onClick={() => updateRequest(request.id, "/convert-to-orders", null, "Purchase orders created.")}>Convert to PO</button> : null}
                    </td>
                  </tr>
                ))}
                {!requests.length ? <tr><td colSpan="6">No purchase requests found.</td></tr> : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "orders" ? (
        <>
          {canReceive ? (
            <section className="page-card" style={{ marginBottom: 16 }}>
              <h2 className="panel-title">Receive goods against a purchase order</h2>
              <form onSubmit={receiveGoods} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <Field label="Purchase order">
                  <select className="input-field" value={receiptForm.purchase_order_id} onChange={(event) => setReceiptForm((current) => ({ ...current, purchase_order_id: event.target.value }))} required>
                    <option value="">Select order</option>
                    {orders.filter((order) => order.delivery_status !== "Closed" && order.delivery_status !== "Received").map((order) => (
                      <option key={order.id} value={order.id}>{order.order_number}</option>
                    ))}
                  </select>
                </Field>
                <Field label="PO line">
                  <select className="input-field" value={receiptForm.purchase_order_line_id} onChange={(event) => {
                    const line = selectedOrderLines.find((entry) => String(entry.id) === event.target.value);
                    setReceiptForm((current) => ({ ...current, purchase_order_line_id: event.target.value, unit_cost: line?.unit_price || "" }));
                  }} required>
                    <option value="">Select line</option>
                    {selectedOrderLines.map((line) => <option key={line.id} value={line.id}>{line.description} — {line.quantity}</option>)}
                  </select>
                </Field>
                <Field label="Store">
                  <select className="input-field" value={receiptForm.store_id} onChange={(event) => setReceiptForm((current) => ({ ...current, store_id: event.target.value }))} required>
                    <option value="">Select store</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </Field>
                <Field label={`Quantity (ordered ${selectedReceiptLine?.quantity || "—"})`}>
                  <input className="input-field" type="number" min="0.001" step="0.001" value={receiptForm.quantity} onChange={(event) => setReceiptForm((current) => ({ ...current, quantity: event.target.value }))} required />
                </Field>
                <Field label="Unit cost (KES)">
                  <input className="input-field" type="number" min="0" step="0.01" value={receiptForm.unit_cost} onChange={(event) => setReceiptForm((current) => ({ ...current, unit_cost: event.target.value }))} required />
                </Field>
                <Field label="Delivery note number">
                  <input className="input-field" value={receiptForm.delivery_note_number} onChange={(event) => setReceiptForm((current) => ({ ...current, delivery_note_number: event.target.value }))} />
                </Field>
                <button className="primary-btn" type="submit" disabled={saving}>Record receipt</button>
              </form>
            </section>
          ) : null}
          <section className="page-card" style={{ overflowX: "auto" }}>
            <h2 className="panel-title">Purchase orders</h2>
            <table className="data-table">
              <thead><tr><th>PO number</th><th>Supplier</th><th>Project</th><th>Lines</th><th>Status</th><th>Value (KES)</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_number}</td>
                    <td>{suppliers.find((supplier) => supplier.id === order.supplier_id)?.name || "—"}</td>
                    <td>{projects.find((project) => project.id === order.project_id)?.name || "—"}</td>
                    <td>{order.lines.map((line) => `${line.description} (${line.quantity})`).join(", ")}</td>
                    <td>{order.delivery_status}</td>
                    <td>{formatKES(order.lines.reduce((sum, line) => sum + Number(line.subtotal), 0))}</td>
                  </tr>
                ))}
                {!orders.length ? <tr><td colSpan="6">No purchase orders found.</td></tr> : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {tab === "stock" ? (
        <>
          <section className="page-card" style={{ marginBottom: 16 }}>
            <h2 className="panel-title">Stock movement</h2>
            <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
              {[
                ["issue", "Issue"],
                ["return", "Return"],
                ["transfer", "Transfer"],
                ...(canAdjust ? [["adjust", "Adjustment"]] : [])
              ].map(([value, label]) => (
                <button type="button" key={value} className={stockAction === value ? "primary-btn" : "secondary-btn"} onClick={() => setStockAction(value)}>{label}</button>
              ))}
            </div>
            <form onSubmit={submitStockAction} className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {stockAction === "issue" ? (
                <>
                  <Field label="Item"><select className="input-field" value={stockForm.item_id} onChange={(event) => setStockForm((current) => ({ ...current, item_id: event.target.value }))} required><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Store"><select className="input-field" value={stockForm.store_id} onChange={(event) => setStockForm((current) => ({ ...current, store_id: event.target.value }))} required><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>
                  <Field label="Quantity"><input className="input-field" type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
                  <Field label="Project"><select className="input-field" value={stockForm.project_id} onChange={(event) => setStockForm((current) => ({ ...current, project_id: event.target.value }))}><option value="">Select project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
                  <Field label="Received by"><select className="input-field" value={stockForm.staff_id} onChange={(event) => setStockForm((current) => ({ ...current, staff_id: event.target.value }))}><option value="">Select staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
                  <Field label="Purpose"><input className="input-field" value={stockForm.purpose} onChange={(event) => setStockForm((current) => ({ ...current, purpose: event.target.value }))} required /></Field>
                </>
              ) : null}
              {stockAction === "return" ? (
                <>
                  <Field label="Original issue"><select className="input-field" value={stockForm.original_issue_id} onChange={(event) => setStockForm((current) => ({ ...current, original_issue_id: event.target.value }))} required><option value="">Select issue</option>{movements.filter((movement) => movement.movement_type === "Issue").map((movement) => <option key={movement.id} value={movement.id}>#{movement.id} — {items.find((item) => item.id === movement.item_id)?.name} ({movement.quantity})</option>)}</select></Field>
                  <Field label="Quantity"><input className="input-field" type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
                  <Field label="Reason"><input className="input-field" value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} required /></Field>
                </>
              ) : null}
              {stockAction === "transfer" ? (
                <>
                  <Field label="Item"><select className="input-field" value={stockForm.item_id} onChange={(event) => setStockForm((current) => ({ ...current, item_id: event.target.value }))} required><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="From store"><select className="input-field" value={stockForm.from_store_id} onChange={(event) => setStockForm((current) => ({ ...current, from_store_id: event.target.value }))} required><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>
                  <Field label="To store"><select className="input-field" value={stockForm.to_store_id} onChange={(event) => setStockForm((current) => ({ ...current, to_store_id: event.target.value }))} required><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>
                  <Field label="Quantity"><input className="input-field" type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
                  <Field label="Reason"><input className="input-field" value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} required /></Field>
                </>
              ) : null}
              {stockAction === "adjust" ? (
                <>
                  <Field label="Item"><select className="input-field" value={stockForm.item_id} onChange={(event) => setStockForm((current) => ({ ...current, item_id: event.target.value }))} required><option value="">Select item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Store"><select className="input-field" value={stockForm.store_id} onChange={(event) => setStockForm((current) => ({ ...current, store_id: event.target.value }))} required><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>
                  <Field label="Quantity change"><input className="input-field" type="number" step="0.001" value={stockForm.quantity_delta} onChange={(event) => setStockForm((current) => ({ ...current, quantity_delta: event.target.value }))} required /></Field>
                  <Field label="Reason"><input className="input-field" value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} required /></Field>
                </>
              ) : null}
              <button className="primary-btn" type="submit" disabled={saving || (stockAction === "issue" && !canIssue)}>Record movement</button>
            </form>
          </section>
          <section className="page-card" style={{ overflowX: "auto", marginBottom: 16 }}>
            <h2 className="panel-title">Current stock</h2>
            <table className="data-table">
              <thead><tr><th>Item</th><th>Store</th><th>Quantity</th><th>Average cost</th><th>Stock value</th></tr></thead>
              <tbody>{balances.map((balance) => <tr key={`${balance.item_id}-${balance.store_id}`}><td>{balance.item}</td><td>{balance.store}</td><td>{balance.quantity}</td><td>{formatKES(balance.average_unit_cost)}</td><td>{formatKES(balance.stock_value)}</td></tr>)}
                {!balances.length ? <tr><td colSpan="5">No stock balances recorded.</td></tr> : null}
              </tbody>
            </table>
          </section>
          <section className="page-card" style={{ overflowX: "auto" }}>
            <h2 className="panel-title">Recent stock ledger</h2>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Item</th><th>Store</th><th>Movement</th><th>Quantity</th><th>Purpose / reason</th></tr></thead>
              <tbody>{movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.movement_date)}</td><td>{items.find((item) => item.id === movement.item_id)?.name || movement.item_id}</td><td>{stores.find((store) => store.id === movement.store_id)?.name || movement.store_id}</td><td>{movement.movement_type}</td><td>{movement.quantity}</td><td>{movement.purpose || movement.reason || "—"}</td></tr>)}
                {!movements.length ? <tr><td colSpan="6">No stock movements recorded.</td></tr> : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
      {tab === "analytics" ? <AlwenAnalytics user={user} /> : null}
      {saving ? <p role="status">Saving…</p> : null}
    </div>
  );
}
