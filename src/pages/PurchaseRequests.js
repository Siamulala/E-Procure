import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PrintHeader from "../components/PrintHeader";
import RecordActions from "../components/RecordActions";
import SpreadsheetImport from "../components/SpreadsheetImport";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

function createRequestLines(items) {
  return [{ itemId: items[0]?.id || "", quantity: "1" }];
}

export default function PurchaseRequests() {
  const {
    items,
    purchaseRequests,
    createPurchaseRequest,
    updatePurchaseRequest,
    deletePurchaseRequests,
    updatePRStatus,
    currentRole,
    quotations,
  } = useInventory();
  const navigate = useNavigate();
  const activeItems = items.filter((item) => !item.archived);
  const [requestedBy, setRequestedBy] = useState("");
  const [department, setDepartment] = useState("Operations");
  const [urgency, setUrgency] = useState("Normal");
  const [lineItems, setLineItems] = useState(() => createRequestLines(activeItems));
  const [selectedRequestIds, setSelectedRequestIds] = useState([]);
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const selectedRequests = purchaseRequests.filter((request) => selectedRequestIds.includes(request.id));

  const updateLine = (index, field, value) => {
    setLineItems((previous) => previous.map((line, row) => (
      row === index ? { ...line, [field]: value } : line
    )));
  };

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingRequestId) {
        updatePurchaseRequest(editingRequestId, { requestedBy, department, urgency, lineItems });
        setMessage("Purchase request updated.");
        setEditingRequestId(null);
      } else {
        createPurchaseRequest({ requestedBy, department, urgency, lineItems });
        setMessage("Purchase request submitted. Procurement and Director were notified.");
      }
      setRequestedBy("");
      setLineItems(createRequestLines(activeItems));
      setSelectedRequestIds([]);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (request) => {
    setEditingRequestId(request.id);
    setRequestedBy(request.requestedBy);
    setDepartment(request.department);
    setUrgency(request.urgency);
    setLineItems(request.lineItems.map((line) => ({ itemId: line.itemId, quantity: String(line.quantity) })));
    setError("");
    setMessage("");
  };

  const deleteSelected = (records) => {
    if (!window.confirm(`Delete ${records.length} selected pending purchase request(s)?`)) return;
    setError("");
    setMessage("");
    try {
      deletePurchaseRequests(records.map((request) => request.id));
      setSelectedRequestIds([]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const decideRequest = (request, status) => {
    setError("");
    setMessage("");
    try {
      updatePRStatus(request.id, status);
      setMessage(`${request.id} ${status.toLowerCase()}.`);
    } catch (actionError) {
      setError(actionError.message);
    }
  };

  const canApprove = currentRole === "Director" || currentRole === "Procurement";

  return (
    <div className="page-shell">
      <PrintHeader title="Purchase Requests" subtitle="Internal material requisitions and approval workflow." />
      <p className="panel-copy no-print">Current demo role: <strong>{currentRole}</strong></p>

      {currentRole === "Requester" ? (
        <section className="page-card no-print">
          <h2 className="panel-title">{editingRequestId ? "Edit purchase request" : "Raise a purchase request"}</h2>
          <form onSubmit={submit}>
            <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <label>Requester name<input className="input-field" value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} required /></label>
              <label>Department
                <select className="input-field" value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="Operations">Operations</option>
                  <option value="Network Maintenance">Network Maintenance</option>
                  <option value="IT & Infrastructure">IT & Infrastructure</option>
                  <option value="Administration">Administration</option>
                </select>
              </label>
              <label>Urgency
                <select className="input-field" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="panel-heading">
                <h3 className="panel-title">Requested items</h3>
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={!activeItems.length}
                  onClick={() => setLineItems((previous) => [...previous, ...createRequestLines(activeItems)])}
                >
                  Add item row
                </button>
              </div>
              {lineItems.map((line, index) => (
                <div className="form-row" key={`request-line-${index}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label>Item
                    <select className="input-field" value={line.itemId} onChange={(event) => updateLine(index, "itemId", event.target.value)} required disabled={!activeItems.length}>
                      {activeItems.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.name} ({item.uom})</option>)}
                    </select>
                  </label>
                  <label>Quantity ({activeItems.find((item) => item.id === line.itemId)?.uom || "UOM"})<input className="input-field" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required /></label>
                  {lineItems.length > 1 ? <button className="secondary-btn" type="button" onClick={() => setLineItems((previous) => previous.filter((_, row) => row !== index))}>Remove row</button> : null}
                </div>
              ))}
            </div>
            <button className="primary-btn" type="submit" disabled={!activeItems.length} style={{ marginTop: 12 }}>
              {editingRequestId ? "Save purchase request" : "Submit and notify leadership"}
            </button>
            {editingRequestId ? (
              <button className="secondary-btn" type="button" onClick={() => {
                setEditingRequestId(null);
                setRequestedBy("");
                setDepartment("Operations");
                setUrgency("Normal");
                setLineItems(createRequestLines(activeItems));
              }}>Cancel edit</button>
            ) : null}
          </form>
          {error || message ? <p role={error ? "alert" : "status"} style={{ color: error ? "#b91c1c" : "#15803d" }}>{error || message}</p> : null}
        </section>
      ) : null}

      {currentRole !== "Requester" ? (
        <div className="no-print">
          {error || message ? <p role={error ? "alert" : "status"} style={{ color: error ? "#b91c1c" : "#15803d" }}>{error || message}</p> : null}
        </div>
      ) : null}

      {currentRole === "Requester" && importOpen ? <SpreadsheetImport mode="request" items={items} onClose={() => setImportOpen(false)} onApply={(rows) => {
        setLineItems(rows);
        setError("");
        setMessage(`${rows.length} spreadsheet line(s) loaded. Review the request and submit it when ready.`);
      }} /> : null}

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Purchase request register</h2>
            <p className="panel-copy">Select a pending request to edit or delete, or use Actions to print, export, or download.</p>
          </div>
        </div>
        <RecordActions
          records={purchaseRequests}
          selectedRecords={selectedRequests}
          recordName="purchase-requests"
          formatPdfRecord={(request) => ({
            "Request number": request.id, Date: request.date, Requester: request.requestedBy,
            Department: request.department, Urgency: request.urgency,
            Items: request.lineItems.map((line) => {
              const item = items.find((entry) => entry.id === line.itemId);
              return `${line.quantity} ${line.uom || item?.uom || ""} - ${item?.name || "Unknown item"}`;
            }).join("\n"),
            "Estimated total": formatKsh(request.lineItems.reduce((sum, line) => {
              const item = items.find((entry) => entry.id === line.itemId);
              return sum + (item ? Number(item.unitCost) * Number(line.quantity) : 0);
            }, 0), true),
            Status: request.status,
          })}
          onEdit={currentRole === "Requester" ? startEdit : undefined}
          onDelete={currentRole === "Requester" ? deleteSelected : undefined}
          onUpload={currentRole === "Requester" ? () => { setMessage(""); setImportOpen(true); } : undefined}
          canEdit={selectedRequests.length === 1 && selectedRequests[0].status === "Pending Approval"}
          canDelete={selectedRequests.every((request) => (
            request.status === "Pending Approval"
            && !quotations.some((quotation) => quotation.prId === request.id)
          ))}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label="Select all purchase requests"
                  checked={purchaseRequests.length > 0 && purchaseRequests.every((request) => selectedRequestIds.includes(request.id))}
                  onChange={() => setSelectedRequestIds(
                    purchaseRequests.length > 0 && purchaseRequests.every((request) => selectedRequestIds.includes(request.id))
                      ? []
                      : purchaseRequests.map((request) => request.id)
                  )}
                  disabled={!purchaseRequests.length}
                />
              </th>
              <th>PR #</th><th>Requester / department</th><th>Items</th><th>Estimated total</th><th>Status</th><th className="no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {purchaseRequests.map((request) => {
              const estimatedTotal = request.lineItems.reduce((sum, line) => {
                const item = items.find((entry) => entry.id === line.itemId);
                return sum + (item ? Number(item.unitCost) * Number(line.quantity) : 0);
              }, 0);
              return (
                <tr key={request.id}>
                <td className="no-print">
                  <input
                    type="checkbox"
                    aria-label={`Select ${request.id}`}
                    checked={selectedRequestIds.includes(request.id)}
                    onChange={() => setSelectedRequestIds((current) => current.includes(request.id)
                      ? current.filter((id) => id !== request.id)
                      : [...current, request.id])}
                  />
                </td>
                  <td>{request.id}<div className="panel-copy">{request.date}</div></td>
                  <td>{request.requestedBy}<div className="panel-copy">{request.department} · {request.urgency}</div></td>
                  <td>{request.lineItems.map((line, index) => {
                    const item = items.find((entry) => entry.id === line.itemId);
                    return (
                      <div key={`${request.id}-line-${index}`}>
                        {line.quantity} {line.uom || item?.uom || ""} × {item?.name || "Unknown item"}
                      </div>
                    );
                  })}</td>
                  <td>{formatKsh(estimatedTotal, true)}</td>
                  <td>{request.status}</td>
                  <td className="no-print">
                    {request.status === "Pending Approval" && canApprove ? (
                      <>
                        <button className="secondary-btn" type="button" onClick={() => decideRequest(request, "Approved")}>Approve</button>
                        <button className="secondary-btn" type="button" onClick={() => decideRequest(request, "Rejected")} style={{ marginLeft: 6, color: "#b91c1c" }}>Reject</button>
                      </>
                    ) : null}
                    {["Approved", "Quoted"].includes(request.status) ? (
                      <button className="secondary-btn" type="button" onClick={() => navigate(`/inventory/quotations?prId=${encodeURIComponent(request.id)}`)}>
                        View quotes
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!purchaseRequests.length ? <tr><td colSpan="7">No purchase requests found.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
