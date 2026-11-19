import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrintHeader from "../components/PrintHeader";
import RecordActions from "../components/RecordActions";
import VoucherModal from "../components/VoucherModal";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

function getDefaultValidUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

export default function Quotations() {
  const {
    suppliers,
    items,
    purchaseRequests,
    quotations,
    createQuotation,
    updateQuotation,
    deleteQuotations,
    convertQuotationToPO,
    currentRole,
  } = useInventory();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeItems = items.filter((item) => !item.archived);
  const preselectedPrId = searchParams.get("prId") || "";
  const [selectedPrId, setSelectedPrId] = useState(preselectedPrId);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [validUntil, setValidUntil] = useState(getDefaultValidUntil);
  const [lineItems, setLineItems] = useState(() => ([
    { itemId: activeItems[0]?.id || "", quantity: "1", quotedUnitCost: String(activeItems[0]?.unitCost || "") },
  ]));
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [selectedQuotationIds, setSelectedQuotationIds] = useState([]);
  const [editingQuotationId, setEditingQuotationId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selectedQuotations = quotations.filter((quotation) => selectedQuotationIds.includes(quotation.id));

  useEffect(() => {
    setSelectedPrId(preselectedPrId);
  }, [preselectedPrId]);

  useEffect(() => {
    if (!selectedPrId || editingQuotationId) return;
    const request = purchaseRequests.find((entry) => entry.id === selectedPrId);
    if (!request) return;
    setLineItems(request.lineItems.map((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      return {
        itemId: line.itemId,
        quantity: String(line.quantity),
        quotedUnitCost: String(item?.unitCost ?? ""),
      };
    }));
  }, [selectedPrId, purchaseRequests, items, editingQuotationId]);

  const updateLine = (index, field, value) => {
    setLineItems((previous) => previous.map((line, row) => {
      if (row !== index) return line;
      if (field === "itemId" && !selectedPrId) {
        const item = items.find((entry) => entry.id === value);
        return { ...line, itemId: value, quotedUnitCost: String(item?.unitCost ?? "") };
      }
      return { ...line, [field]: value };
    }));
  };

  const addStandaloneLine = () => {
    if (selectedPrId) return;
    setLineItems((previous) => [
      ...previous,
      { itemId: activeItems[0]?.id || "", quantity: "1", quotedUnitCost: String(activeItems[0]?.unitCost || "") },
    ]);
  };
  const selectableItems = selectedPrId ? items : activeItems;

  const submit = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const quotationData = {
        prId: selectedPrId || null,
        supplierId,
        validUntil,
        lineItems: lineItems.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity),
          quotedUnitCost: Number(line.quotedUnitCost),
        })),
      };
      if (editingQuotationId) {
        updateQuotation(editingQuotationId, quotationData);
        setMessage(`${editingQuotationId} updated.`);
        setEditingQuotationId(null);
      } else {
        const quotation = createQuotation(quotationData);
        setMessage(`${quotation.id} saved.`);
        if (!selectedPrId) {
          setLineItems([{ itemId: items[0]?.id || "", quantity: "1", quotedUnitCost: String(items[0]?.unitCost || "") }]);
        }
      }
      setSelectedQuotationIds([]);
    } catch (submitError) {
      setError(submitError.message);
    }
  };

  const startEdit = (quotation) => {
    setEditingQuotationId(quotation.id);
    setSelectedPrId(quotation.prId || "");
    setSupplierId(quotation.supplierId);
    setValidUntil(quotation.validUntil);
    setLineItems(quotation.lineItems.map((line) => ({
      itemId: line.itemId,
      quantity: String(line.quantity),
      quotedUnitCost: String(line.quotedUnitCost),
    })));
    setError("");
    setMessage("");
  };

  const deleteSelected = (records) => {
    if (!window.confirm(`Delete ${records.length} selected submitted quotation(s)?`)) return;
    setError("");
    setMessage("");
    try {
      deleteQuotations(records.map((quotation) => quotation.id));
      setSelectedQuotationIds([]);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const acceptQuotation = (quotationId) => {
    setError("");
    setMessage("");
    try {
      convertQuotationToPO(quotationId);
      navigate("/inventory/purchase-orders");
    } catch (actionError) {
      setError(actionError.message);
    }
  };

  const canCreateOrSelect = currentRole === "Procurement";

  return (
    <>
      <div className="page-shell page-content">
        <PrintHeader title="Vendor Quotations" subtitle="Compare supplier bids and convert a selected quotation into a purchase order." />
        <p className="panel-copy no-print">Current demo role: <strong>{currentRole}</strong></p>

      {canCreateOrSelect ? (
        <section className="page-card no-print">
          <h2 className="panel-title">{editingQuotationId ? "Edit supplier quotation" : "Record supplier quotation"}</h2>
          <form onSubmit={submit}>
            <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <label>Linked purchase request
                <select className="input-field" value={selectedPrId} onChange={(event) => setSelectedPrId(event.target.value)} disabled={Boolean(editingQuotationId)}>
                  <option value="">Standalone quotation</option>
                  {purchaseRequests
                    .filter((request) => ["Approved", "Quoted"].includes(request.status))
                    .map((request) => <option key={request.id} value={request.id}>{request.id} · {request.department}</option>)}
                </select>
              </label>
              <label>Supplier
                <select className="input-field" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label>Valid until<input className="input-field" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required /></label>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="panel-heading">
                <h3 className="panel-title">Quoted items</h3>
                {!selectedPrId ? (
                  <button type="button" className="secondary-btn" onClick={addStandaloneLine} disabled={!activeItems.length}>Add item row</button>
                ) : null}
              </div>
              {lineItems.map((line, index) => (
                <div className="form-row" key={`quotation-line-${index}`} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label>Item
                    <select className="input-field" value={line.itemId} onChange={(event) => updateLine(index, "itemId", event.target.value)} required disabled={Boolean(selectedPrId) || !selectableItems.length}>
                      {selectableItems.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.name} ({item.uom}){item.archived ? " (Archived)" : ""}</option>)}
                    </select>
                  </label>
                  <label>Quantity ({items.find((item) => item.id === line.itemId)?.uom || "UOM"})<input className="input-field" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} required readOnly={Boolean(selectedPrId)} /></label>
                  <label>Quoted unit price (KSh)<input className="input-field" type="number" min="0" step="0.01" value={line.quotedUnitCost} onChange={(event) => updateLine(index, "quotedUnitCost", event.target.value)} required /></label>
                  {!selectedPrId && lineItems.length > 1 ? <button className="secondary-btn" type="button" onClick={() => setLineItems((previous) => previous.filter((_, row) => row !== index))}>Remove row</button> : null}
                </div>
              ))}
            </div>
            <button type="submit" className="primary-btn" disabled={(!selectedPrId && !activeItems.length) || !suppliers.length} style={{ marginTop: 12 }}>
              {editingQuotationId ? "Save quotation changes" : "Save quotation"}
            </button>
            {editingQuotationId ? (
              <button type="button" className="secondary-btn" onClick={() => {
                setEditingQuotationId(null);
                setSelectedPrId("");
                setSupplierId(suppliers[0]?.id || "");
                setValidUntil(getDefaultValidUntil());
                setLineItems([{ itemId: activeItems[0]?.id || "", quantity: "1", quotedUnitCost: String(activeItems[0]?.unitCost || "") }]);
              }}>Cancel edit</button>
            ) : null}
          </form>
        </section>
      ) : (
        <p className="panel-copy no-print">Switch the demo role to Procurement on the Inventory Dashboard to record or select quotations.</p>
      )}

      {error || message ? <p className="no-print" role={error ? "alert" : "status"} style={{ color: error ? "#b91c1c" : "#15803d" }}>{error || message}</p> : null}

      <section className="page-card" style={{ overflowX: "auto" }}>
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Quotation register</h2>
            <p className="panel-copy">Select a submitted quotation to edit or delete, or use Actions to print, export, or download.</p>
          </div>
        </div>
        <RecordActions
          records={quotations}
          selectedRecords={selectedQuotations}
          recordName="quotations"
          onEdit={canCreateOrSelect ? startEdit : undefined}
          onDelete={canCreateOrSelect ? deleteSelected : undefined}
          canEdit={selectedQuotations.length === 1 && selectedQuotations[0].status === "Submitted"}
          canDelete={selectedQuotations.every((quotation) => quotation.status === "Submitted")}
        />
        <table className="data-table">
          <thead>
            <tr>
              <th className="no-print">
                <input
                  type="checkbox"
                  aria-label="Select all quotations"
                  checked={quotations.length > 0 && quotations.every((quotation) => selectedQuotationIds.includes(quotation.id))}
                  onChange={() => setSelectedQuotationIds(
                    quotations.length > 0 && quotations.every((quotation) => selectedQuotationIds.includes(quotation.id))
                      ? []
                      : quotations.map((quotation) => quotation.id)
                  )}
                  disabled={!quotations.length}
                />
              </th>
              <th>Quote #</th><th>Linked PR</th><th>Supplier</th><th>Quoted items</th><th>Total bid</th><th>Status</th><th className="no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((quotation) => {
              const supplier = suppliers.find((entry) => entry.id === quotation.supplierId);
              const totalBid = quotation.lineItems.reduce((sum, line) => sum + Number(line.quantity) * Number(line.quotedUnitCost), 0);
              return (
                <tr key={quotation.id}>
                  <td className="no-print">
                    <input
                      type="checkbox"
                      aria-label={`Select ${quotation.id}`}
                      checked={selectedQuotationIds.includes(quotation.id)}
                      onChange={() => setSelectedQuotationIds((current) => current.includes(quotation.id)
                        ? current.filter((id) => id !== quotation.id)
                        : [...current, quotation.id])}
                    />
                  </td>
                  <td>{quotation.id}<div className="panel-copy">Valid until {quotation.validUntil}</div></td>
                  <td>{quotation.prId || "Direct"}</td>
                  <td>{supplier?.name || "Unknown supplier"}</td>
                  <td>{quotation.lineItems.map((line, index) => {
                    const item = items.find((entry) => entry.id === line.itemId);
                    return (
                      <div key={`${quotation.id}-line-${index}`}>
                        {line.quantity} {line.uom || item?.uom || ""} × {item?.name || "Unknown item"} @ {formatKsh(Number(line.quotedUnitCost), true)}
                      </div>
                    );
                  })}</td>
                  <td>{formatKsh(totalBid, true)}</td>
                  <td>{quotation.status}</td>
                  <td className="no-print">
                    <button className="secondary-btn" type="button" onClick={() => setSelectedQuote(quotation)}>Voucher</button>
                    {canCreateOrSelect && quotation.status === "Submitted" ? (
                      <button className="secondary-btn" type="button" onClick={() => acceptQuotation(quotation.id)} style={{ marginLeft: 6 }}>Accept & create PO</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!quotations.length ? <tr><td colSpan="8">No quotations found.</td></tr> : null}
          </tbody>
        </table>
      </section>
      </div>
      <VoucherModal type="QUOTE" document={selectedQuote} onClose={() => setSelectedQuote(null)} />
    </>
  );
}
