import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import * as XLSX from "xlsx";
import PrintHeader from "../../components/PrintHeader";
import { alwenApiDownload, alwenApiRequest } from "../../services/alwenApi";
import { getCompanyLogoPngDataUrl } from "../../utils/companyBrand";
import "../../styles/Pages.css";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Legend, Tooltip);

const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
const formatKES = (value) => new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 2
}).format(Number(value) || 0);
const formatQuantity = (value) => new Intl.NumberFormat("en-KE", {
  maximumFractionDigits: 3
}).format(Number(value) || 0);
const moneyTick = (value) => new Intl.NumberFormat("en-KE", {
  notation: "compact",
  maximumFractionDigits: 1
}).format(value);

const cardStyle = { display: "grid", gap: 8, minHeight: 112 };
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true, ticks: { callback: moneyTick } }
  }
};
const horizontalBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, ticks: { callback: moneyTick } },
    y: { grid: { display: false } }
  }
};
const chartColors = ["#2563eb", "#0f766e", "#f59e0b", "#7c3aed", "#dc2626", "#0891b2"];

function AnalyticsTable({ title, columns, rows, empty, renderRow }) {
  return (
    <section className="page-card" style={{ overflowX: "auto" }}>
      <h2 className="panel-title">{title}</h2>
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map(renderRow)}
          {!rows.length ? <tr><td colSpan={columns.length}>{empty}</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

function ReportDetails({ compact, children }) {
  if (!compact) return children;
  return <details className="alwen-dashboard-details"><summary>Detailed tables</summary><div>{children}</div></details>;
}

export default function AlwenAnalytics({ user, compact = false }) {
  const initialToday = today();
  const [filters, setFilters] = useState({
    start_date: `${initialToday.slice(0, 4)}-01-01`,
    end_date: initialToday,
    project_id: user.role === "Project Manager" && user.project_id ? String(user.project_id) : "",
    supplier_id: "",
    category_id: ""
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [projects, setProjects] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [report, setReport] = useState(null);
  const [groupBy, setGroupBy] = useState("month");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [appliedFilters]);

  const loadReport = useCallback(async (queryString = query) => {
    setLoading(true);
    setError("");
    try {
      const result = await alwenApiRequest(`/analytics/dashboard${queryString ? `?${queryString}` : ""}`);
      setReport(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    let active = true;
    Promise.all([
      alwenApiRequest("/projects"),
      alwenApiRequest("/suppliers?limit=500"),
      alwenApiRequest("/categories")
    ]).then(([projectData, supplierData, categoryData]) => {
      if (!active) return;
      setProjects(user.role === "Project Manager" && user.project_id
        ? projectData.filter((project) => project.id === user.project_id)
        : user.role === "Project Manager" ? [] : projectData);
      setSuppliers(supplierData.items);
      setCategories(categoryData);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    });
    return () => { active = false; };
  }, [user.project_id, user.role]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  };

  const exportReport = async () => {
    setExporting(true);
    setError("");
    try {
      const params = new URLSearchParams(query);
      params.set("group_by", groupBy);
      await alwenApiDownload(`/analytics/exports/spend.csv?${params.toString()}`, `alwen-spend-by-${groupBy}.csv`);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = () => {
    if (!report) return;
    const workbook = XLSX.utils.book_new();
    const addSheet = (name, rows) => {
      const entries = rows || [];
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Easy-Procure"],
        ["Procurement & Inventory Analytics"],
        ["Generated", new Date().toLocaleString()],
        [],
        entries.length ? Object.keys(entries[0]) : [],
        ...entries.map((entry) => Object.values(entry))
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addSheet("Summary", [
      { Metric: "PO commitments in period (KES)", Value: summary.period_po_commitments },
      { Metric: "Purchase orders", Value: summary.purchase_order_count },
      { Metric: "Open PO value remaining (KES)", Value: summary.open_po_value },
      { Metric: "Current stock value (KES)", Value: report.stock?.stock_value || "Not available for this role" },
      { Metric: "Top supplier", Value: summary.top_supplier || "" },
      { Metric: "Top project", Value: summary.top_project || "" }
    ]);
    addSheet("Monthly", report.monthly_commitments);
    addSheet("Suppliers", report.supplier_spend);
    addSheet("Projects", report.project_spend);
    addSheet("Categories", report.category_spend);
    addSheet("Items", report.item_spend);
    addSheet("Quote scorecard", report.supplier_scorecard);
    addSheet("Price history", report.price_history);
    addSheet("PR funnel", report.purchase_request_funnel);
    addSheet("Stock movements", report.stock_movements_by_month);
    addSheet("Project usage", report.usage_by_project);
    if (report.stock) {
      addSheet("Low stock", report.stock.low_stock_items);
      addSheet("Stock by store", report.stock.by_store);
    }
    try {
      XLSX.writeFile(workbook, "alwen-analytics.xlsx");
      setError("");
    } catch (exportError) {
      setError(`Could not export Excel: ${exportError.message}`);
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    try {
      const { jsPDF } = await import("jspdf");
      const document = new jsPDF({ orientation: "landscape" });
      const logo = await getCompanyLogoPngDataUrl();
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      let y = 30;
      document.addImage(logo, "PNG", 14, 8, 58, 13);
      document.setFontSize(16);
      document.text("Procurement & Inventory Analytics", 14, y);
      y += 8;
      document.setFontSize(9);
      document.text(`Period: ${report.filters.start_date || "All"} to ${report.filters.end_date || "All"} · Values are PO commitments, not paid expenditure.`, 14, y);
      y += 9;
      const addSection = (title, lines) => {
        if (!lines.length) return;
        if (y > pageHeight - 15) {
          document.addPage();
          y = 16;
        }
        document.setFontSize(12);
        document.text(title, 14, y);
        y += 7;
        document.setFontSize(8);
        lines.forEach((line) => {
          const wrapped = document.splitTextToSize(line, pageWidth - 28);
          wrapped.forEach((text) => {
            if (y > pageHeight - 12) {
              document.addPage();
              y = 16;
            }
            document.text(text, 14, y);
            y += 4.5;
          });
        });
        y += 3;
      };
      addSection("Summary", [
        `PO commitments: ${formatKES(summary.period_po_commitments)} · Orders: ${summary.purchase_order_count}`,
        `Open PO value remaining: ${formatKES(summary.open_po_value)} · Current stock value: ${report.stock ? formatKES(report.stock.stock_value) : "Not available"}`,
        `Top supplier: ${summary.top_supplier || "—"} · Top project: ${summary.top_project || "—"}`
      ]);
      addSection("Monthly PO commitments", report.monthly_commitments.map((entry) => `${entry.month} | ${formatKES(entry.value)} | ${entry.purchase_order_count} POs`));
      addSection("Supplier commitments", report.supplier_spend.map((entry) => `${entry.supplier} | ${formatKES(entry.value)} | ${entry.share_percent}% | ${entry.purchase_order_count} POs`));
      addSection("Project commitments", report.project_spend.map((entry) => `${entry.project} | ${formatKES(entry.value)} | ${entry.share_percent}%`));
      addSection("Category commitments", report.category_spend.map((entry) => `${entry.category} | ${formatKES(entry.value)} | Qty ${formatQuantity(entry.quantity)}`));
      addSection("Stock movement by month", report.stock_movements_by_month.map((entry) => `${entry.month} | Received ${formatQuantity(entry.received)} | Net issued ${formatQuantity(entry.issued)}`));
      document.save("alwen-analytics.pdf");
      setError("");
    } catch (exportError) {
      setError(`Could not export PDF: ${exportError.message}`);
    }
  };

  const summary = report?.summary;
  const monthlyChart = useMemo(() => ({
    labels: (report?.monthly_commitments || []).map((entry) => entry.month),
    datasets: [{
      label: "PO commitments (KES)",
      data: (report?.monthly_commitments || []).map((entry) => Number(entry.value)),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.14)",
      pointBackgroundColor: "#2563eb",
      pointRadius: 3,
      tension: 0.3,
      fill: true
    }]
  }), [report]);
  const supplierChart = useMemo(() => {
    const topSuppliers = (report?.supplier_spend || []).slice(0, 6);
    return {
      labels: topSuppliers.map((entry) => entry.supplier),
      datasets: [{
        label: "PO commitments",
        data: topSuppliers.map((entry) => Number(entry.value)),
        backgroundColor: chartColors,
        borderRadius: 5,
        barThickness: 18
      }]
    };
  }, [report]);
  const categoryChart = useMemo(() => {
    const categories = (report?.category_spend || []).slice(0, 6);
    return {
      labels: categories.map((entry) => entry.category),
      datasets: [{
        data: categories.map((entry) => Number(entry.value)),
        backgroundColor: chartColors,
        borderWidth: 0
      }]
    };
  }, [report]);
  const projectChart = useMemo(() => {
    const projectsForChart = (report?.project_spend || []).slice(0, 6);
    return {
      labels: projectsForChart.map((entry) => entry.project),
      datasets: [{
        label: "PO commitments",
        data: projectsForChart.map((entry) => Number(entry.value)),
        backgroundColor: "#0f766e",
        borderRadius: 5,
        barThickness: 18
      }]
    };
  }, [report]);
  const supplierCount = (report?.supplier_spend || [])
    .filter((entry) => entry.supplier !== "Unassigned").length;
  const requestsAwaitingAction = (report?.purchase_request_funnel || [])
    .filter((entry) => ["Submitted", "Approved"].includes(entry.status))
    .reduce((total, entry) => total + Number(entry.count || 0), 0);

  return (
    <div className="page-shell page-content alwen-analytics-dashboard">
      <PrintHeader
        title="Procurement Spend Overview"
        subtitle="A decision-ready view of purchase-order commitments, supplier concentration, project allocation, and stock."
      />

      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}

      <section className="page-card">
        <div className="panel-heading">
          <div>
            <h2 className="panel-title">Dashboard filters</h2>
            <p className="panel-copy">Filter procurement commitments by period, project, supplier, or item category.</p>
          </div>
          <button className="secondary-btn no-print" type="button" onClick={() => loadReport()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <form onSubmit={applyFilters} className="form-row alwen-dashboard-filters">
          <label className="alwen-field">From<input className="input-field" type="date" name="start_date" value={filters.start_date} onChange={updateFilter} /></label>
          <label className="alwen-field">To<input className="input-field" type="date" name="end_date" value={filters.end_date} onChange={updateFilter} /></label>
          <label className="alwen-field">Project
            <select className="input-field" name="project_id" value={filters.project_id} onChange={updateFilter} disabled={user.role === "Project Manager"}>
              <option value="">{user.role === "Project Manager" ? "Assigned project" : "All projects"}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          {user.role !== "Project Manager" ? (
            <label className="alwen-field">Supplier
              <select className="input-field" name="supplier_id" value={filters.supplier_id} onChange={updateFilter}>
                <option value="">All suppliers</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="alwen-field">Category
            <select className="input-field" name="category_id" value={filters.category_id} onChange={updateFilter}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <button className="primary-btn" type="submit" disabled={loading}>Apply filters</button>
        </form>
      </section>

      {loading && !report ? <p role="status">Loading analytics...</p> : null}
      {report ? (
        <>
          <p className="analytics-measure-note">{report.definitions.spend} This dashboard does not represent paid expenditure.</p>
          <div className="page-grid page-grid--cards alwen-dashboard-kpis">
            <section className="page-card" style={cardStyle}>
              <p className="stat-title">PO commitments</p>
              <strong className="stat-value">{formatKES(summary.period_po_commitments)}</strong>
              <p className="panel-copy">For the selected period and filters</p>
            </section>
            <section className="page-card" style={cardStyle}>
              <p className="stat-title">Open PO value</p>
              <strong className="stat-value">{formatKES(summary.open_po_value)}</strong>
              <p className="panel-copy">Remaining value on open and partially received orders</p>
            </section>
            <section className="page-card" style={cardStyle}>
              <p className="stat-title">Purchase orders</p>
              <strong className="stat-value">{summary.purchase_order_count}</strong>
              <p className="panel-copy">Orders with commitments in this period</p>
            </section>
            <section className="page-card" style={cardStyle}>
              <p className="stat-title">Suppliers with commitments</p>
              <strong className="stat-value">{supplierCount}</strong>
              <p className="panel-copy">Suppliers with POs in this period</p>
            </section>
            <section className="page-card" style={cardStyle}>
              <p className="stat-title">Requests awaiting action</p>
              <strong className="stat-value">{requestsAwaitingAction}</strong>
              <p className="panel-copy">Submitted or approved requests</p>
            </section>
            {report.stock ? (
              <section className="page-card" style={cardStyle}>
                <p className="stat-title">Current stock value</p>
                <strong className="stat-value">{formatKES(report.stock.stock_value)}</strong>
                <p className="panel-copy">Current snapshot; category filter applies</p>
              </section>
            ) : null}
          </div>

          <div className="analytics-chart-grid">
            <section className="page-card">
              <div className="panel-heading">
                <div>
                  <h2 className="panel-title">Monthly spend trend</h2>
                  <p className="panel-copy">PO commitments by order date</p>
                </div>
              </div>
              {monthlyChart.labels.length ? (
                <div className="analytics-chart alwen-dashboard-chart"><Line data={monthlyChart} options={chartOptions} /></div>
              ) : <p className="panel-copy chart-empty">No commitments for this period.</p>}
            </section>
            <section className="page-card">
              <h2 className="panel-title">Top suppliers by commitment</h2>
              <p className="panel-copy">Highest-value suppliers in the filtered period</p>
              {supplierChart.labels.length ? (
                <div className="analytics-chart alwen-dashboard-chart"><Bar data={supplierChart} options={horizontalBarOptions} /></div>
              ) : <p className="panel-copy chart-empty">No supplier commitments for this period.</p>}
            </section>
          </div>

          <div className="analytics-chart-grid">
            <section className="page-card">
              <h2 className="panel-title">Spend by category</h2>
              <p className="panel-copy">Share of PO commitments by item category</p>
              {categoryChart.labels.length ? (
                <div className="analytics-chart alwen-dashboard-chart">
                  <Doughnut
                    data={categoryChart}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }}
                  />
                </div>
              ) : <p className="panel-copy chart-empty">No categorized commitments for this period.</p>}
            </section>
            <section className="page-card">
              <h2 className="panel-title">Spend by project</h2>
              <p className="panel-copy">Project allocation for the filtered period</p>
              {projectChart.labels.length ? (
                <div className="analytics-chart alwen-dashboard-chart">
                  <Bar data={projectChart} options={horizontalBarOptions} />
                </div>
              ) : <p className="panel-copy chart-empty">No project allocations for this period.</p>}
            </section>
          </div>

          <ReportDetails compact={compact}>
          <div className="analytics-chart-grid">
            <AnalyticsTable
              title="Purchase request funnel"
              columns={["Status", "Requests"]}
              rows={report.purchase_request_funnel}
              empty="No purchase requests in this period."
              renderRow={(entry) => <tr key={entry.status}><td>{entry.status}</td><td>{entry.count}</td></tr>}
            />
            {report.stock ? (
              <AnalyticsTable
                title="Low-stock alerts"
                columns={["Item", "Category", "Available", "Reorder at"]}
                rows={report.stock.low_stock_items}
                empty="No items are below their configured reorder levels."
                renderRow={(entry) => <tr key={entry.item_id}><td>{entry.item}</td><td>{entry.category || "—"}</td><td>{formatQuantity(entry.quantity)}</td><td>{formatQuantity(entry.reorder_level)}</td></tr>}
              />
            ) : null}
          </div>

          {report.stock ? (
            <AnalyticsTable
              title="Current stock by item and store"
              columns={["Item", "Category", "Store", "Quantity", "Average cost", "Stock value"]}
              rows={report.stock.by_store}
              empty="No stock balances recorded."
              renderRow={(entry) => <tr key={`${entry.item_id}-${entry.store_id}`}><td>{entry.item}</td><td>{entry.category || "—"}</td><td>{entry.store}</td><td>{formatQuantity(entry.quantity)}</td><td>{formatKES(entry.average_unit_cost)}</td><td>{formatKES(entry.stock_value)}</td></tr>}
            />
          ) : null}

          <div className="analytics-chart-grid">
            <AnalyticsTable
              title="Supplier commitments"
              columns={["Supplier", "POs", "Value", "Share"]}
              rows={report.supplier_spend}
              empty="No purchase orders found."
              renderRow={(entry) => <tr key={entry.supplier}><td>{entry.supplier}</td><td>{entry.purchase_order_count}</td><td>{formatKES(entry.value)}</td><td>{entry.share_percent}%</td></tr>}
            />
            <AnalyticsTable
              title="Project commitments"
              columns={["Project", "POs", "Value", "Share"]}
              rows={report.project_spend}
              empty="No project allocations found."
              renderRow={(entry) => <tr key={entry.project}><td>{entry.project}</td><td>{entry.purchase_order_count}</td><td>{formatKES(entry.value)}</td><td>{entry.share_percent}%</td></tr>}
            />
          </div>

          <div className="analytics-chart-grid">
            <AnalyticsTable
              title="Category commitments"
              columns={["Category", "Quantity", "Value", "Share"]}
              rows={report.category_spend}
              empty="No categorized purchase orders found."
              renderRow={(entry) => <tr key={entry.category}><td>{entry.category}</td><td>{formatQuantity(entry.quantity)}</td><td>{formatKES(entry.value)}</td><td>{entry.share_percent}%</td></tr>}
            />
            <AnalyticsTable
              title="Supplier quotation scorecard"
              columns={["Supplier", "Proposed", "Lowest quote", "Win rate"]}
              rows={report.supplier_scorecard}
              empty="No submitted or approved supplier proposals found."
              renderRow={(entry) => <tr key={entry.supplier_id}><td>{entry.supplier}</td><td>{entry.proposed_count}</td><td>{entry.lowest_count}</td><td>{entry.win_rate}%</td></tr>}
            />
          </div>

          <AnalyticsTable
            title="Top items by PO commitment"
            columns={["Item", "Quantity", "POs", "Value", "Share"]}
            rows={report.item_spend.slice(0, 10)}
            empty="No purchase orders found."
            renderRow={(entry) => <tr key={entry.item}><td>{entry.item}</td><td>{formatQuantity(entry.quantity)}</td><td>{entry.purchase_order_count}</td><td>{formatKES(entry.value)}</td><td>{entry.share_percent}%</td></tr>}
          />

          <div className="analytics-chart-grid">
            <AnalyticsTable
              title="Stock movement by month"
              columns={["Month", "Received", "Net issued"]}
              rows={report.stock_movements_by_month}
              empty="No stock movements found."
              renderRow={(entry) => <tr key={entry.month}><td>{entry.month}</td><td>{formatQuantity(entry.received)}</td><td>{formatQuantity(entry.issued)}</td></tr>}
            />
            <AnalyticsTable
              title="Net usage by project"
              columns={["Project", "Quantity"]}
              rows={report.usage_by_project}
              empty="No project issues or returns found."
              renderRow={(entry) => <tr key={entry.project_id || "unallocated"}><td>{entry.project}</td><td>{formatQuantity(entry.quantity)}</td></tr>}
            />
          </div>

          <AnalyticsTable
            title="Item price comparison history"
            columns={["Item", "Supplier", "Quotes", "Average rate", "Lowest", "Highest"]}
            rows={report.price_history}
            empty="No item quotations found for these filters."
            renderRow={(entry) => <tr key={`${entry.item_id}-${entry.supplier_id}`}><td>{entry.item}</td><td>{entry.supplier}</td><td>{entry.quote_count}</td><td>{formatKES(entry.average_rate)}</td><td>{formatKES(entry.lowest_rate)}</td><td>{formatKES(entry.highest_rate)}</td></tr>}
          />
          </ReportDetails>

          <section className="page-card">
            <div className="panel-heading">
              <div>
                <h2 className="panel-title">Export report</h2>
                <p className="panel-copy">CSV download of PO commitments with the current filters.</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <select className="input-field" aria-label="CSV export grouping" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                  {["month", "supplier", "project", "category", "item"].map((value) => <option key={value} value={value}>By {value}</option>)}
                </select>
                <button className="secondary-btn" type="button" onClick={exportReport} disabled={exporting}>{exporting ? "Preparing..." : "Download CSV"}</button>
                <button className="secondary-btn" type="button" onClick={exportExcel} disabled={loading}>Download Excel</button>
                <button className="secondary-btn" type="button" onClick={exportPdf} disabled={loading}>Download PDF</button>
              </div>
            </div>
            <p className="panel-copy">{report.definitions.spend} Paid expenditure and invoice aging are not included in this phase.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
