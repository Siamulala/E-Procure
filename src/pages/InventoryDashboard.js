import React, { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import PrintHeader from "../components/PrintHeader";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#2563eb", "#0f766e", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
const chartTick = (value) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export default function InventoryDashboard() {
  const { items, purchaseTransactions, stockMovements } = useInventory();
  const currentYear = String(new Date().getFullYear());
  const years = [...new Set([currentYear, ...purchaseTransactions.map((row) => row.date.slice(0, 4)), ...stockMovements.map((row) => row.date.slice(0, 4))])]
    .filter((year) => /^\d{4}$/.test(year)).sort((a, b) => b.localeCompare(a));
  const [year, setYear] = useState(currentYear);
  const [itemId, setItemId] = useState("");
  const [unit, setUnit] = useState("");

  const purchases = purchaseTransactions.filter((row) => row.date.startsWith(`${year}-`));
  const previousYear = String(Number(year) - 1);
  const previousPurchases = purchaseTransactions.filter((row) => row.date.startsWith(`${previousYear}-`));
  const annualTotal = purchases.reduce((sum, row) => sum + Number(row.total), 0);
  const activeSuppliers = new Set(purchases.map((row) => row.supplier).filter(Boolean)).size;
  const lowStock = items.filter((item) => !item.archived && Number(item.stock) <= Number(item.reorderLevel)).length;
  const itemOptions = useMemo(() => {
    const items = new Map();
    purchases.forEach((row) => items.set(row.itemId || row.sku || row.item, row.item));
    return [...items].sort((a, b) => a[1].localeCompare(b[1]));
  }, [purchases]);
  const chosenItemId = itemOptions.some(([id]) => id === itemId) ? itemId : itemOptions[0]?.[0] || "";
  const monthly = MONTHS.map((month, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const rows = purchases.filter((row) => row.date.startsWith(`${monthKey}-`));
    return {
      month,
      total: rows.reduce((sum, row) => sum + Number(row.total), 0),
      previous: previousPurchases.filter((row) => row.date.startsWith(`${previousYear}-${String(index + 1).padStart(2, "0")}-`))
        .reduce((sum, row) => sum + Number(row.total), 0),
      item: rows.filter((row) => (row.itemId || row.sku || row.item) === chosenItemId)
        .reduce((sum, row) => sum + Number(row.total), 0),
    };
  });
  const supplierTotals = new Map();
  purchases.forEach((row) => supplierTotals.set(row.supplier, (supplierTotals.get(row.supplier) || 0) + Number(row.total)));
  const supplierData = [...supplierTotals].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

  const consumption = new Map();
  stockMovements.filter((row) => row.movementType === "out" && row.date.startsWith(`${year}-`)).forEach((row) => {
    const unitName = row.uom === "km" ? "m" : row.uom;
    const key = `${row.itemId}:${unitName}`;
    const existing = consumption.get(key) || { id: key, name: row.item, unit: unitName, quantity: 0 };
    existing.quantity += Number(row.quantity) * (row.uom === "km" ? 1000 : 1);
    consumption.set(key, existing);
  });
  const unitOptions = [...new Set([...consumption.values()].map((row) => row.unit))].sort();
  const chosenUnit = unitOptions.includes(unit) ? unit : unitOptions[0] || "";
  const consumptionData = [...consumption.values()].filter((row) => row.unit === chosenUnit).sort((a, b) => b.quantity - a.quantity);
  const selectedItemName = itemOptions.find(([id]) => id === chosenItemId)?.[1];

  return (
    <div className="page-shell page-content procurement-dashboard">
      <PrintHeader title="Inventory Dashboard" subtitle="Procurement and material usage at a glance." />
      <section className="procurement-dashboard__toolbar">
        <div><p className="procurement-dashboard__eyebrow">PROCUREMENT OVERVIEW</p><p className="panel-copy">Purchases by Stock In date · {year}</p></div>
        <label className="no-print">Year <select className="input-field" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </section>

      <div className="procurement-dashboard__kpis">
        <section className="page-card procurement-dashboard__kpi procurement-dashboard__kpi--primary">
          <p className="stat-title">Annual expenditure · {year}</p><strong className="procurement-dashboard__value">{formatKsh(annualTotal, true)}</strong>
          <p className="panel-copy">Purchased Stock In, not payments or unreceived orders</p>
        </section>
        <section className="page-card procurement-dashboard__kpi">
          <p className="stat-title">Purchase receipt lines</p><strong className="procurement-dashboard__value">{purchases.length}</strong><p className="panel-copy">Received in {year}</p>
        </section>
        <section className="page-card procurement-dashboard__kpi">
          <p className="stat-title">Suppliers</p><strong className="procurement-dashboard__value">{activeSuppliers}</strong><p className="panel-copy">With purchased receipts in {year}</p>
        </section>
        <section className="page-card procurement-dashboard__kpi">
          <p className="stat-title">Low stock items</p><strong className="procurement-dashboard__value">{lowStock}</strong><p className="panel-copy">Main-unit balance at or below reorder level</p>
        </section>
      </div>

      <div className="procurement-dashboard__charts">
        <section className="page-card procurement-dashboard__chart">
          <h2 className="panel-title">Monthly total expenditure</h2>
          <p className="panel-copy">Received purchases · {year} vs {previousYear}</p>
          {purchases.length || previousPurchases.length ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={chartTick} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Legend /><Bar dataKey="total" name={year} fill="#2563eb" radius={[4, 4, 0, 0]} /><Bar dataKey="previous" name={previousYear} fill="#a5b4fc" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No purchased stock in {year}.</p>}
          <details><summary>Monthly values</summary><table className="data-table"><thead><tr><th>Month</th><th>{year}</th><th>{previousYear}</th></tr></thead><tbody>{monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{formatKsh(row.total, true)}</td><td>{formatKsh(row.previous, true)}</td></tr>)}</tbody></table></details>
        </section>
        <section className="page-card procurement-dashboard__chart">
          <div className="panel-heading"><h2 className="panel-title">Monthly expenditure by item</h2>
            <label className="no-print">Item <select className="input-field" value={chosenItemId} onChange={(event) => setItemId(event.target.value)} disabled={!itemOptions.length}>
              {!itemOptions.length ? <option value="">No items</option> : itemOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
          </div>
          {selectedItemName ? <p className="panel-copy">{selectedItemName}</p> : null}
          {selectedItemName ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={chartTick} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Line dataKey="item" name={selectedItemName} stroke="#0f766e" strokeWidth={3} /></LineChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No purchased items in {year}.</p>}
          {selectedItemName ? <details><summary>Item monthly values</summary><table className="data-table"><thead><tr><th>Month</th><th>{selectedItemName}</th></tr></thead><tbody>{monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{formatKsh(row.item, true)}</td></tr>)}</tbody></table></details> : null}
        </section>
        <section className="page-card procurement-dashboard__chart">
          <h2 className="panel-title">Supplier expenditure</h2>
          {supplierData.length ? <div className="analytics-chart" style={{ height: Math.max(280, supplierData.length * 35) }}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierData} layout="vertical" margin={{ left: 16 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={chartTick} /><YAxis dataKey="name" type="category" width={120} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Bar dataKey="total" name="Expenditure">{supplierData.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No supplier expenditure in {year}.</p>}
          {supplierData.length ? <details><summary>Supplier values</summary><table className="data-table"><thead><tr><th>Supplier</th><th>Total</th></tr></thead><tbody>{supplierData.map((row) => <tr key={row.name}><td>{row.name}</td><td>{formatKsh(row.total, true)}</td></tr>)}</tbody></table></details> : null}
        </section>
        <section className="page-card procurement-dashboard__chart">
          <div className="panel-heading"><h2 className="panel-title">Highest material consumption</h2>
            <label className="no-print">Unit <select className="input-field" value={chosenUnit} onChange={(event) => setUnit(event.target.value)} disabled={!unitOptions.length}>
              {!unitOptions.length ? <option value="">No stock out</option> : unitOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
          </div>
          <p className="panel-copy">Stock Out{chosenUnit ? ` (${chosenUnit})` : ""}; metres and kilometres are shown in metres.</p>
          {consumptionData.length ? <div className="analytics-chart" style={{ height: Math.max(280, consumptionData.length * 35) }}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={consumptionData} layout="vertical" margin={{ left: 16 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis dataKey="name" type="category" width={120} /><Tooltip formatter={(value) => `${value} ${chosenUnit}`} /><Bar dataKey="quantity" name="Issued" fill="#d97706" /></BarChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No stock out in {year}.</p>}
          {consumptionData.length ? <details><summary>Consumption values</summary><table className="data-table"><thead><tr><th>Item</th><th>Issued ({chosenUnit})</th></tr></thead><tbody>{consumptionData.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.quantity}</td></tr>)}</tbody></table></details> : null}
        </section>
      </div>
    </div>
  );
}
