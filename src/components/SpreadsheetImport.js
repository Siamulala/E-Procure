import React, { useState } from "react";
import * as XLSX from "xlsx";
import { convertQuantity } from "../contexts/InventoryContext";

const FIELD_ALIASES = {
  item: ["item", "itemname", "material", "materialname", "product", "productname", "sku", "itemcode", "productid"],
  quantity: ["quantity", "qty", "quantityreceived", "quantitypurchased", "requestedquantity"],
  uom: ["uom", "unit", "units", "unitofmeasure", "unitofmeasurement"],
  date: ["date", "received", "receiveddate", "receiptdate", "stockindate", "purchasedate"],
  supplier: ["supplier", "suppliername", "vendor", "vendorname"],
  unitCost: ["unitcost", "unitcostksh", "unitprice", "unitpriceksh", "purchaseunitcost", "costperunit", "price"],
  reference: ["reference", "referencenumber", "ponumber", "purchaseorder", "invoicenumber"],
};
const LABELS = { item: "Item / SKU", quantity: "Quantity", uom: "UOM", date: "Receipt date", supplier: "Supplier", unitCost: "Unit cost", reference: "Reference" };
const normalized = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const sameText = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const parseNumber = (value) => {
  const text = String(value ?? "").trim().replace(/^KSh\s*/i, "").replace(/,/g, "");
  return text === "" ? NaN : Number(text);
};

function findUnique(value, entries, fields) {
  if (!String(value ?? "").trim()) return "";
  const matches = entries.filter((entry) => fields.some((field) => sameText(entry[field], value)));
  return matches.length === 1 ? matches[0].id : "";
}

function suggestedColumns(header, fields) {
  return Object.fromEntries(fields.map((field) => {
    const matches = header.flatMap((cell, index) => FIELD_ALIASES[field].includes(normalized(cell)) ? [index] : []);
    return [field, matches.length === 1 ? String(matches[0]) : ""];
  }));
}

export default function SpreadsheetImport({ mode, items, onApply, onClose }) {
  const stock = mode === "stock";
  const fields = stock ? ["item", "quantity", "uom", "date", "supplier", "unitCost", "reference"] : ["item", "quantity", "uom"];
  const [book, setBook] = useState(null);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [sheetRows, setSheetRows] = useState([]);
  const [headerRow, setHeaderRow] = useState(1);
  const [columns, setColumns] = useState({});
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const activeItems = items.filter((item) => !item.archived);

  const selectSheet = (workbook, name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd", blankrows: true });
    if (rows.length > 5001) throw new Error("A worksheet can contain at most 5,001 rows.");
    setSheetName(name);
    setSheetRows(rows);
    setHeaderRow(1);
    setColumns(suggestedColumns(rows[0] || [], fields));
    setPreview(null);
  };

  const readFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    setPreview(null);
    setBook(null);
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      setError("Choose an Excel or CSV file no larger than 10 MB.");
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      if (!workbook.SheetNames.length) throw new Error("The spreadsheet does not contain a worksheet.");
      selectSheet(workbook, workbook.SheetNames[0]);
      setBook(workbook);
      setFileName(file.name);
    } catch (readError) {
      setError(`Could not read spreadsheet: ${readError.message}`);
    }
  };

  const makePreview = () => {
    setError("");
    try {
      if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > sheetRows.length) throw new Error("Choose a valid header row.");
      const required = ["item", "quantity"];
      const missing = required.filter((field) => columns[field] === "");
      if (missing.length) throw new Error(`Select columns for: ${missing.map((field) => LABELS[field]).join(", ")}.`);
      const selected = fields.map((field) => columns[field]).filter((value) => value !== "");
      if (new Set(selected).size !== selected.length) throw new Error("Use a different column for each field.");
      const rows = sheetRows.slice(headerRow).flatMap((cells, index) => {
        if (!cells.some((cell) => String(cell ?? "").trim())) return [];
        const values = Object.fromEntries(fields.map((field) => [field, columns[field] === "" ? "" : String(cells[Number(columns[field])] ?? "").trim()]));
        return [{
          sourceRow: headerRow + index + 1,
          sourceItem: values.item,
          sourceSupplier: values.supplier || "",
          itemId: findUnique(values.item, activeItems, ["id", "sku", "name"]),
          quantity: values.quantity,
          uom: values.uom,
          date: values.date || "",
          unitCost: values.unitCost || "",
          reference: values.reference || "",
        }];
      });
      if (!rows.length) throw new Error("No non-empty rows were found below the selected header.");
      setPreview(rows);
    } catch (previewError) {
      setPreview(null);
      setError(previewError.message);
    }
  };

  const updateRow = (index, field, value) => {
    setPreview((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const apply = () => {
    setError("");
    try {
      const rows = preview.map((row) => {
        try {
          const quantity = parseNumber(row.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a positive quantity.");
          if (!row.uom.trim()) throw new Error("Enter the spreadsheet quantity's unit.");
          if (!stock) {
            const item = activeItems.find((entry) => entry.id === row.itemId);
            if (!item) throw new Error("Match an active item.");
            return { itemId: item.id, quantity: String(convertQuantity(quantity, row.uom, item.uom)) };
          }
          if (!row.sourceItem.trim()) throw new Error("Enter an item name or SKU.");
          if (!row.sourceSupplier.trim()) throw new Error("Enter a supplier name.");
          const date = row.date.trim();
          const parsedDate = new Date(`${date}T00:00:00Z`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
            throw new Error("Enter a valid receipt date in YYYY-MM-DD format.");
          }
          const unitCost = parseNumber(row.unitCost);
          if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Enter a valid non-negative unit cost.");
          return { sourceRow: row.sourceRow, item: row.sourceItem, supplier: row.sourceSupplier, date, quantity, uom: row.uom, unitCost, reference: row.reference };
        } catch (rowError) {
          throw new Error(`Spreadsheet row ${row.sourceRow}: ${rowError.message}`);
        }
      });
      onApply(rows);
      onClose();
    } catch (applyError) {
      setError(applyError.message);
    }
  };

  return (
    <section className="page-card no-print">
      <div className="panel-heading"><h2 className="panel-title">Upload {stock ? "purchased stock" : "request items"}</h2><button className="secondary-btn" type="button" onClick={onClose}>Close import</button></div>
      <p className="panel-copy">Excel or CSV is processed locally. Match columns and review every row before {stock ? "recording Stock In" : "replacing the current request item lines"}. {stock ? "Existing items and suppliers are found automatically; new ones are created. Each row requires an item, quantity, UOM, receipt date (YYYY-MM-DD), supplier and unit cost." : ""} Re-importing can create duplicates.</p>
      <label>Choose import spreadsheet<input className="input-field" type="file" accept=".xlsx,.xls,.csv" onChange={readFile} /></label>
      {book ? <>
        <p className="panel-copy">{fileName}</p>
        <div className="form-row">
          <label>Worksheet<select className="input-field" value={sheetName} onChange={(event) => {
            try { setError(""); selectSheet(book, event.target.value); } catch (sheetError) { setError(sheetError.message); }
          }}>{book.SheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label>Header row<input className="input-field" type="number" min="1" max={Math.max(1, sheetRows.length)} value={headerRow} onChange={(event) => {
            const next = Number(event.target.value);
            setHeaderRow(next);
            setColumns(suggestedColumns(sheetRows[next - 1] || [], fields));
            setPreview(null);
          }} /></label>
          {fields.map((field) => <label key={field}>{LABELS[field]} column<select className="input-field" value={columns[field] ?? ""} onChange={(event) => { setColumns((current) => ({ ...current, [field]: event.target.value })); setPreview(null); }}>
            <option value="">Select column{!["item", "quantity"].includes(field) ? " (optional)" : ""}</option>
            {(sheetRows[headerRow - 1] || []).map((name, index) => <option key={index} value={index}>{name || `Column ${index + 1}`}</option>)}
          </select></label>)}
        </div>
        <button className="secondary-btn" type="button" onClick={makePreview}>Review spreadsheet rows</button>
      </> : null}
      {error && !preview ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      {preview ? <>
        <p className="panel-copy">{preview.length} row(s). Check {stock ? "items, suppliers, units and values" : "matches, units and values"} before continuing.</p>
        <div style={{ overflowX: "auto" }}><table className="data-table">
          <thead><tr><th>Row</th><th>{stock ? "Item / SKU" : "Source item"}</th>{!stock ? <th>Match item</th> : null}<th>Quantity</th><th>UOM</th>{stock ? <><th>Received</th><th>Supplier</th><th>Unit cost</th><th>Reference</th></> : null}<th>Exclude</th></tr></thead>
          <tbody>{preview.map((row, index) => <tr key={row.sourceRow}>
            <td>{row.sourceRow}</td><td>{stock ? <input aria-label={`Item row ${row.sourceRow}`} value={row.sourceItem} onChange={(event) => updateRow(index, "sourceItem", event.target.value)} /> : row.sourceItem}</td>
            {!stock ? <td><select aria-label={`Match item row ${row.sourceRow}`} value={row.itemId} onChange={(event) => updateRow(index, "itemId", event.target.value)}><option value="">Select item</option>{activeItems.map((item) => <option key={item.id} value={item.id}>{item.sku} — {item.name} ({item.uom})</option>)}</select></td> : null}
            <td><input aria-label={`Quantity row ${row.sourceRow}`} value={row.quantity} onChange={(event) => updateRow(index, "quantity", event.target.value)} /></td>
            <td><input aria-label={`UOM row ${row.sourceRow}`} value={row.uom} onChange={(event) => updateRow(index, "uom", event.target.value)} /></td>
            {stock ? <>
              <td><input aria-label={`Receipt date row ${row.sourceRow}`} placeholder="YYYY-MM-DD" value={row.date} onChange={(event) => updateRow(index, "date", event.target.value)} /></td>
              <td><input aria-label={`Supplier row ${row.sourceRow}`} value={row.sourceSupplier} onChange={(event) => updateRow(index, "sourceSupplier", event.target.value)} /></td>
              <td><input aria-label={`Unit cost row ${row.sourceRow}`} value={row.unitCost} onChange={(event) => updateRow(index, "unitCost", event.target.value)} /></td>
              <td><input aria-label={`Reference row ${row.sourceRow}`} value={row.reference} onChange={(event) => updateRow(index, "reference", event.target.value)} /></td>
            </> : null}
            <td><button className="secondary-btn" type="button" onClick={() => setPreview((rows) => rows.filter((entry) => entry.sourceRow !== row.sourceRow))} aria-label={`Exclude spreadsheet row ${row.sourceRow}`}>Exclude</button></td>
          </tr>)}</tbody>
        </table></div>
        {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
        <button className="primary-btn" type="button" onClick={apply} disabled={!preview.length}>{stock ? "Record reviewed Stock In" : "Use rows in purchase request"}</button>
      </> : null}
    </section>
  );
}
