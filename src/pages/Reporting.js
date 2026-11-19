import React, { useMemo, useState } from "react";
import PrintHeader from "../components/PrintHeader";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

const reportTabs = [
  { id: "summary", label: "Summary" },
  { id: "requests", label: "Purchase Requests" },
  { id: "quotations", label: "Purchase Quotations" },
  { id: "purchase-orders", label: "Purchase Orders" },
  { id: "inventory", label: "Inventory" },
  { id: "suppliers", label: "Suppliers" },
];

const numberOrZero = (value) => Number(value) || 0;

function getStatusCounts(records) {
  return records.reduce((counts, record) => {
    const status = record.status || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function getLineTotal(lines, priceKey) {
  return lines.reduce(
    (total, line) => total + numberOrZero(line.quantity) * numberOrZero(line[priceKey]),
    0
  );
}

export default function Reporting() {
  const { suppliers, items, purchaseRequests, quotations, purchaseOrders } = useInventory();
  const [reportType, setReportType] = useState("summary");

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const activeItems = items.filter((item) => !item.archived);
  const inventoryValue = items.reduce(
    (sum, item) => sum + numberOrZero(item.stock) * numberOrZero(item.unitCost),
    0
  );
  const lowStockCount = activeItems.filter(
    (item) => numberOrZero(item.stock) <= numberOrZero(item.reorderLevel)
  ).length;
  const committedSpend = purchaseOrders
    .filter((order) => order.status !== "Cancelled")
    .reduce((sum, order) => sum + getLineTotal(order.lineItems, "unitCost"), 0);
  const requestStatuses = getStatusCounts(purchaseRequests);
  const quotationStatuses = getStatusCounts(quotations);
  const purchaseOrderStatuses = getStatusCounts(purchaseOrders);

  const renderItemLines = (lines, priceKey) => lines.map((line, index) => {
    const item = itemById.get(line.itemId);
    const quantity = numberOrZero(line.quantity);
    return (
      <div key={`${line.itemId}-${index}`}>
        {quantity} × {item?.name || "Unknown item"}
        {priceKey ? ` @ ${formatKsh(line[priceKey], true)}` : ""}
      </div>
    );
  });

  return (
    <div className="page-shell">
      <PrintHeader
        title="Reporting & Analytics"
        subtitle="Live reports from inventory, purchase requests, supplier quotations, and purchase orders."
      />

      <div className="report-tabs no-print" role="group" aria-label="Report sections">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`secondary-btn ${reportType === tab.id ? "report-tab--active" : ""}`}
            aria-pressed={reportType === tab.id}
            onClick={() => setReportType(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {reportType === "summary" ? (
        <>
          <div className="page-grid page-grid--cards">
            <section className="page-card">
              <p className="stat-title">Purchase Requests</p>
              <strong className="stat-value">{purchaseRequests.length}</strong>
              <p className="panel-copy">{requestStatuses["Pending Approval"] || 0} pending approval</p>
            </section>
            <section className="page-card">
              <p className="stat-title">Purchase Quotations</p>
              <strong className="stat-value">{quotations.length}</strong>
              <p className="panel-copy">{quotationStatuses.Submitted || 0} awaiting selection</p>
            </section>
            <section className="page-card">
              <p className="stat-title">Purchase Orders</p>
              <strong className="stat-value">{purchaseOrders.length}</strong>
              <p className="panel-copy">{purchaseOrderStatuses.Pending || 0} pending receipt</p>
            </section>
            <section className="page-card">
              <p className="stat-title">Inventory Value</p>
              <strong className="stat-value">{formatKsh(inventoryValue)}</strong>
              <p className="panel-copy">{lowStockCount} active items at or below reorder level</p>
            </section>
          </div>

          <section className="page-card">
            <h2 className="panel-title">Procurement workflow status</h2>
            <p className="panel-copy">Counts update as requests, quotations, and orders change in their respective sections.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Workflow</th><th>Status</th><th>Records</th></tr></thead>
                <tbody>
                  {[
                    ...Object.entries(requestStatuses).map(([status, count]) => ({ workflow: "Purchase Requests", status, count })),
                    ...Object.entries(quotationStatuses).map(([status, count]) => ({ workflow: "Purchase Quotations", status, count })),
                    ...Object.entries(purchaseOrderStatuses).map(([status, count]) => ({ workflow: "Purchase Orders", status, count })),
                  ].map((row) => (
                    <tr key={`${row.workflow}-${row.status}`}>
                      <td>{row.workflow}</td><td>{row.status}</td><td>{row.count}</td>
                    </tr>
                  ))}
                  {!purchaseRequests.length && !quotations.length && !purchaseOrders.length ? (
                    <tr><td colSpan="3">No procurement activity found.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="panel-copy report-total">Committed purchase-order spend: <strong>{formatKsh(committedSpend)}</strong></p>
          </section>
        </>
      ) : null}

      {reportType === "requests" ? (
        <section className="page-card">
          <h2 className="panel-title">Purchase request register</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Request</th><th>Requester / department</th><th>Items</th><th>Estimated value</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {purchaseRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.id}</td>
                    <td>{request.requestedBy}<div className="panel-copy">{request.department}</div></td>
                    <td>{renderItemLines(request.lineItems)}</td>
                    <td>{formatKsh(request.lineItems.reduce((sum, line) => {
                      const item = itemById.get(line.itemId);
                      return sum + numberOrZero(item?.unitCost) * numberOrZero(line.quantity);
                    }, 0), true)}</td>
                    <td>{request.status}</td>
                    <td>{request.date}</td>
                  </tr>
                ))}
                {!purchaseRequests.length ? <tr><td colSpan="6">No purchase requests found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {reportType === "quotations" ? (
        <section className="page-card">
          <h2 className="panel-title">Purchase quotation register</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Quotation</th><th>Request</th><th>Supplier</th><th>Quoted items</th><th>Total quote</th><th>Valid until</th><th>Status</th></tr></thead>
              <tbody>
                {quotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td>{quotation.id}</td>
                    <td>{quotation.prId || "Direct"}</td>
                    <td>{supplierById.get(quotation.supplierId)?.name || "Unknown supplier"}</td>
                    <td>{renderItemLines(quotation.lineItems, "quotedUnitCost")}</td>
                    <td>{formatKsh(getLineTotal(quotation.lineItems, "quotedUnitCost"), true)}</td>
                    <td>{quotation.validUntil}</td>
                    <td>{quotation.status}</td>
                  </tr>
                ))}
                {!quotations.length ? <tr><td colSpan="7">No purchase quotations found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {reportType === "purchase-orders" ? (
        <section className="page-card">
          <h2 className="panel-title">Purchase order register</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Purchase order</th><th>Supplier</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {purchaseOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNumber || order.id}</td>
                    <td>{supplierById.get(order.supplierId)?.name || "Unknown supplier"}</td>
                    <td>{renderItemLines(order.lineItems)}</td>
                    <td>{formatKsh(getLineTotal(order.lineItems, "unitCost"), true)}</td>
                    <td>{order.status}</td>
                    <td>{order.date}</td>
                  </tr>
                ))}
                {!purchaseOrders.length ? <tr><td colSpan="6">No purchase orders found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {reportType === "inventory" ? (
        <section className="page-card">
          <h2 className="panel-title">Inventory valuation</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Stock (UOM)</th><th>Reorder level (UOM)</th><th>Unit cost</th><th>Stock value</th><th>Status</th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const stock = numberOrZero(item.stock);
                  return (
                    <tr key={item.id}>
                      <td>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.category || "General Materials"}</td>
                      <td>{stock} {item.uom}</td>
                      <td>{item.reorderLevel} {item.uom}</td>
                      <td>{formatKsh(item.unitCost, true)}</td>
                      <td>{formatKsh(stock * numberOrZero(item.unitCost), true)}</td>
                      <td>{item.archived ? "Archived" : "Active"}</td>
                    </tr>
                  );
                })}
                {!items.length ? <tr><td colSpan="8">No inventory items found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {reportType === "suppliers" ? (
        <section className="page-card">
          <h2 className="panel-title">Supplier register</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Supplier</th><th>Email</th><th>Purchase orders</th><th>Committed spend</th><th>Lead time</th><th>Payment terms</th></tr></thead>
              <tbody>
                {suppliers.map((supplier) => {
                  const orders = purchaseOrders.filter((order) => order.supplierId === supplier.id);
                  const spend = orders
                    .filter((order) => order.status !== "Cancelled")
                    .reduce((sum, order) => sum + getLineTotal(order.lineItems, "unitCost"), 0);
                  return (
                    <tr key={supplier.id}>
                      <td>{supplier.name}</td>
                      <td>{supplier.email || "—"}</td>
                      <td>{orders.length}</td>
                      <td>{formatKsh(spend, true)}</td>
                      <td>{supplier.leadTimeDays ?? "—"} days</td>
                      <td>{supplier.paymentTerms || "—"}</td>
                    </tr>
                  );
                })}
                {!suppliers.length ? <tr><td colSpan="6">No suppliers found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
