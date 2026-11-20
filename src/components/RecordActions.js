import React, { useState } from "react";

const csvValue = (value) => {
  const flattened = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return `"${flattened.replaceAll('"', '""')}"`;
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function RecordActions({
  records,
  selectedRecords,
  recordName = "records",
  onEdit,
  onDelete,
  onUpload,
  onManageCategories,
  onConfigureCable,
  formatRecord = (record) => record,
  canEdit = true,
  canDelete = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedRecords.length > 0;
  const editEnabled = selectedRecords.length === 1 && typeof onEdit === "function" && canEdit;
  const deleteEnabled = hasSelection && typeof onDelete === "function" && canDelete;

  const exportRecords = () => {
    if (!records.length) return;
    const formattedRecords = records.map(formatRecord);
    const headers = Array.from(new Set(formattedRecords.flatMap((record) => Object.keys(record))));
    const rows = formattedRecords.map((record) => headers.map((header) => csvValue(record[header])).join(","));
    downloadBlob(
      new Blob([[headers.map(csvValue).join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" }),
      `${recordName}-export.csv`
    );
    setIsOpen(false);
  };

  const downloadSelection = () => {
    if (!hasSelection) return;
    downloadBlob(
      new Blob([JSON.stringify(selectedRecords.map(formatRecord), null, 2)], { type: "application/json;charset=utf-8" }),
      `${recordName}-selection.json`
    );
    setIsOpen(false);
  };

  const runAction = (action) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="record-actions no-print">
      <button
        className="secondary-btn"
        type="button"
        aria-label="Actions"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        Actions
      </button>
      {isOpen ? (
        <div className="record-actions__menu" role="menu" aria-label="Record actions">
          <button type="button" role="menuitem" disabled={!editEnabled} onClick={() => runAction(() => onEdit(selectedRecords[0]))}>Edit</button>
          <button type="button" role="menuitem" disabled={!deleteEnabled} onClick={() => runAction(() => onDelete(selectedRecords))}>Delete</button>
          {onUpload ? <button type="button" role="menuitem" onClick={() => runAction(onUpload)}>Upload spreadsheet</button> : null}
          {onManageCategories ? <button type="button" role="menuitem" onClick={() => runAction(onManageCategories)}>Manage categories</button> : null}
          {onConfigureCable ? <button type="button" role="menuitem" onClick={() => runAction(onConfigureCable)}>Configure cable length</button> : null}
          <button type="button" role="menuitem" onClick={() => runAction(() => window.print())}>Print</button>
          <button type="button" role="menuitem" disabled={!records.length} onClick={exportRecords}>Export (CSV)</button>
          <button type="button" role="menuitem" disabled={!hasSelection} onClick={downloadSelection}>Download (JSON)</button>
        </div>
      ) : null}
    </div>
  );
}
