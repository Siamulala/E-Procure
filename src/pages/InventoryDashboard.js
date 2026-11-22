import React, { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import PrintHeader from "../components/PrintHeader";
import { useInventory } from "../contexts/InventoryContext";
import { formatKsh } from "../utils/currency";
import "../styles/Pages.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COLORS = ["#2563eb", "#0f766e", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
const chartTick = (value) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const formatPercent = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);

export default function InventoryDashboard() {
  const { items, purchaseTransactions, stockMovements } = useInventory();
  const currentYear = String(new Date().getFullYear());
  const years = [...new Set([currentYear, ...purchaseTransactions.map((row) => row.date.slice(0, 4)), ...stockMovements.map((row) => row.date.slice(0, 4))])]
    .filter((year) => /^\d{4}$/.test(year)).sort((a, b) => b.localeCompare(a));
  const [year, setYear] = useState(currentYear);
  const [itemId, setItemId] = useState("");

  const purchases = purchaseTransactions.filter((row) => row.date.startsWith(`${year}-`));
  const previousYear = String(Number(year) - 1);
  const previousPurchases = Number(previousYear) >= 2026
    ? purchaseTransactions.filter((row) => row.date.startsWith(`${previousYear}-`))
    : [];
  const hasPreviousPurchases = previousPurchases.length > 0;
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
  const categoryTotals = new Map();
  purchases.forEach((row) => categoryTotals.set(row.category, (categoryTotals.get(row.category) || 0) + Number(row.total)));
  const categoryData = [...categoryTotals].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

  const selectedItemName = itemOptions.find(([id]) => id === chosenItemId)?.[1];
  const peakMonth = monthly.reduce((peak, row) => row.total > peak.total ? row : peak, monthly[0]);
  const itemTotal = monthly.reduce((sum, row) => sum + row.item, 0);
  const peakItemMonth = monthly.reduce((peak, row) => row.item > peak.item ? row : peak, monthly[0]);
  const topSupplier = supplierData[0];

  return (
    <div className="page-shell page-content procurement-dashboard">
      <PrintHeader title="Inventory Dashboard" subtitle="Procurement and stock at a glance." />
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
          <p className="panel-copy">Received purchases · {year}{hasPreviousPurchases ? ` vs ${previousYear}` : " · no prior-year comparison available"}</p>
          {purchases.length || hasPreviousPurchases ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={chartTick} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Legend /><Line type="monotone" dataKey="total" name={year} stroke="#2563eb" strokeWidth={3} />{hasPreviousPurchases ? <Line type="monotone" dataKey="previous" name={previousYear} stroke="#a5b4fc" strokeWidth={3} /> : null}</LineChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No purchased stock in {year}.</p>}
          <div className="procurement-dashboard__insight">
            <strong>Purchase insight</strong>
            <p>{peakMonth.total > 0
              ? `${peakMonth.month} was among the highest-spend months in ${year}, at ${formatKsh(peakMonth.total, true)}.${hasPreviousPurchases ? ` Recorded purchase value for the same month in ${previousYear} was ${formatKsh(peakMonth.previous, true)}.` : " No prior-year comparison is available."}`
              : `No purchase value was recorded in ${year}, so there is no peak spending month.`}</p>
          </div>
          <details><summary>Monthly values</summary><table className="data-table"><thead><tr><th>Month</th><th>{year}</th>{hasPreviousPurchases ? <th>{previousYear}</th> : null}</tr></thead><tbody>{monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{formatKsh(row.total, true)}</td>{hasPreviousPurchases ? <td>{formatKsh(row.previous, true)}</td> : null}</tr>)}</tbody></table></details>
        </section>
        <section className="page-card procurement-dashboard__chart">
          <div className="panel-heading"><h2 className="panel-title">Monthly expenditure by item</h2>
            <label className="no-print">Item <select className="input-field" value={chosenItemId} onChange={(event) => setItemId(event.target.value)} disabled={!itemOptions.length}>
              {!itemOptions.length ? <option value="">No items</option> : itemOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
          </div>
          {selectedItemName ? <p className="panel-copy">{selectedItemName}</p> : null}
          {selectedItemName ? <div className="analytics-chart"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={chartTick} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Line type="monotone" dataKey="item" name={selectedItemName} stroke="#0f766e" strokeWidth={3} /></LineChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No purchased items in {year}.</p>}
          <div className="procurement-dashboard__insight">
            <strong>Item insight</strong>
            <p>{selectedItemName && itemTotal > 0 && annualTotal > 0
              ? `${selectedItemName} accounted for ${formatKsh(itemTotal, true)} (${formatPercent(itemTotal / annualTotal * 100)}% of ${year} purchase value). ${peakItemMonth.month} was among its highest-spend months at ${formatKsh(peakItemMonth.item, true)}.`
              : `No purchase value is available for the selected item in ${year}.`}</p>
          </div>
          {selectedItemName ? <details><summary>Item monthly values</summary><table className="data-table"><thead><tr><th>Month</th><th>{selectedItemName}</th></tr></thead><tbody>{monthly.map((row) => <tr key={row.month}><td>{row.month}</td><td>{formatKsh(row.item, true)}</td></tr>)}</tbody></table></details> : null}
        </section>
        <section className="page-card procurement-dashboard__chart">
          <h2 className="panel-title">Purchase expenditure by category</h2>
          <p className="panel-copy">Purchased Stock In by receipt category · {year}</p>
          {annualTotal > 0 ? <div className="analytics-chart" style={{ height: Math.max(280, categoryData.length * 35) }}><ResponsiveContainer width="100%" height="100%">
            <PieChart><Pie data={categoryData} dataKey="total" nameKey="name" outerRadius="75%">{categoryData.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatKsh(value, true)} /><Legend /></PieChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No category purchase value in {year}.</p>}
          <div className="procurement-dashboard__insight">
            <strong>Category insight</strong>
            <p>{categoryData.length && annualTotal > 0
              ? `${categoryData[0].name} was among the highest-value categories in ${year}, with ${formatKsh(categoryData[0].total, true)} (${formatPercent(categoryData[0].total / annualTotal * 100)}% of purchase value).`
              : `No category purchase value is available for ${year}.`}</p>
          </div>
          {categoryData.length ? <details><summary>Category values</summary><table className="data-table"><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>{categoryData.map((row) => <tr key={row.name}><td>{row.name}</td><td>{formatKsh(row.total, true)}</td></tr>)}</tbody></table></details> : null}
        </section>
        <section className="page-card procurement-dashboard__chart">
          <h2 className="panel-title">Supplier expenditure</h2>
          {supplierData.length ? <div className="analytics-chart" style={{ height: Math.max(280, supplierData.length * 35) }}><ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierData} layout="vertical" margin={{ left: 16 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={chartTick} /><YAxis dataKey="name" type="category" width={120} /><Tooltip formatter={(value) => formatKsh(value, true)} /><Bar dataKey="total" name="Expenditure">{supplierData.map((row, index) => <Cell key={row.name} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart>
          </ResponsiveContainer></div> : <p className="panel-copy">No supplier expenditure in {year}.</p>}
          <div className="procurement-dashboard__insight">
            <strong>Supplier insight</strong>
            <p>{topSupplier && annualTotal > 0
              ? `${topSupplier.name || "Unspecified supplier"} was among the highest-value suppliers in ${year}, with ${formatKsh(topSupplier.total, true)} (${formatPercent(topSupplier.total / annualTotal * 100)}% of purchase value). Review this share when considering supplier concentration.`
              : `No supplier purchase value is available for ${year}.`}</p>
          </div>
          {supplierData.length ? <details><summary>Supplier values</summary><table className="data-table"><thead><tr><th>Supplier</th><th>Total</th></tr></thead><tbody>{supplierData.map((row) => <tr key={row.name}><td>{row.name}</td><td>{formatKsh(row.total, true)}</td></tr>)}</tbody></table></details> : null}
        </section>
      </div>
    </div>
  );
}
