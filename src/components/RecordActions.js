import React, { useRef, useState } from "react";
import { getCompanyDetails, getCompanyLogoPngDataUrl } from "../utils/companyBrand";

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
  onAdd,
  addLabel = "Add item",
  onUpload,
  onManageCategories,
  onConfigureCable,
  formatRecord = (record) => record,
  formatPdfRecord = formatRecord,
  formatPdfSummary,
  canEdit = true,
  canDelete = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printError, setPrintError] = useState("");
  const actionRootRef = useRef(null);
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

  const savePdf = async (pdfRecords, scope) => {
    setPdfError("");
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const companyDetails = getCompanyDetails();
      const companyLogo = await getCompanyLogoPngDataUrl();
      const formattedRecords = pdfRecords.map(formatPdfRecord);
      const formattedSummary = formatPdfSummary?.(pdfRecords);
      const headers = Array.from(new Set([
        ...formattedRecords.flatMap((record) => Object.keys(record)),
        ...Object.keys(formattedSummary || {}),
      ]));
      const columns = headers.length ? headers : ["Details"];
      const values = formattedRecords.map((record) => columns.map((header) => {
        const value = header === "Details" && !headers.length
          ? "No printable details available"
          : record[header];
        const text = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
        return text || "-";
      }));
      const summaryValues = formattedSummary
        ? columns.map((header) => {
          const value = formattedSummary[header];
          return value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
        })
        : null;
      const pdf = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const tableWidth = pageWidth - margin * 2;
      const title = recordName.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      const dateText = new Date().toLocaleDateString();
      const contactDetails = [
        companyDetails.phone && `Phone: ${companyDetails.phone}`,
        companyDetails.email && `Email: ${companyDetails.email}`,
      ].filter(Boolean).join(" | ");
      const columnWeights = columns.map((header, columnIndex) => values.reduce(
        (weight, row) => Math.max(weight, Math.min(row[columnIndex].length, 28)),
        Math.min(Math.max(header.length, 8), 28)
      ));
      const totalWeight = columnWeights.reduce((sum, weight) => sum + weight, 0);
      const columnWidths = columnWeights.map((weight) => tableWidth * weight / totalWeight);
      const lineHeight = 3.5;
      const cellPadding = 2;
      const headerLines = columns.map((header, index) => pdf.splitTextToSize(header, Math.max(4, columnWidths[index] - cellPadding * 2)));
      const headerHeight = Math.max(9, Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + cellPadding * 2);
      const contentBottom = pageHeight - margin;
      let y = 0;

      const drawPageHeader = (isFirstPage) => {
        pdf.setTextColor(30, 41, 59);
        const center = pageWidth / 2;
        if (isFirstPage) {
          const logoWidth = 50;
          const logoHeight = logoWidth * 120 / 520;
          pdf.addImage(companyLogo, "PNG", center - logoWidth / 2, 7, logoWidth, logoHeight);
          let headerY = 23;
          const writeCentered = (text) => {
            pdf.splitTextToSize(text, tableWidth).forEach((line) => {
              pdf.text(line, center, headerY, { align: "center" });
              headerY += 4;
            });
          };
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          writeCentered(companyDetails.name);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          if (companyDetails.address) writeCentered(companyDetails.address);
          if (contactDetails) writeCentered(contactDetails);
          headerY += 1;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(12);
          writeCentered(title);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          writeCentered(`Date: ${dateText}`);
          writeCentered(`Records: ${pdfRecords.length}`);
          pdf.setDrawColor(203, 213, 225);
          pdf.line(margin, headerY + 1, pageWidth - margin, headerY + 1);
          return headerY + 6;
        }

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(title, margin, 16);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.text(`${companyDetails.name} | ${dateText}`, margin, 23);
        pdf.text(`Records: ${pdfRecords.length}`, pageWidth - margin, 23, { align: "right" });
        pdf.setDrawColor(203, 213, 225);
        pdf.line(margin, 28, pageWidth - margin, 28);
        return 36;
      };

      const drawWatermark = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(34);
        pdf.setTextColor(230, 233, 238);
        pdf.text(companyDetails.name, pageWidth / 2, pageHeight / 2, { align: "center", angle: 45 });
      };

      const drawTableHeader = () => {
        pdf.setFillColor(30, 41, 59);
        pdf.rect(margin, y, tableWidth, headerHeight, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        let x = margin;
        headerLines.forEach((lines, index) => {
          lines.forEach((line, lineIndex) => {
            pdf.text(line, x + cellPadding, y + cellPadding + lineIndex * lineHeight + 2.5);
          });
          x += columnWidths[index];
          if (index < columns.length - 1) pdf.line(x, y, x, y + headerHeight);
        });
        y += headerHeight;
        pdf.setTextColor(30, 41, 59);
      };

      const startNextPage = () => {
        pdf.addPage();
        drawWatermark();
        y = drawPageHeader(false);
        drawTableHeader();
      };

      drawWatermark();
      y = drawPageHeader(true);
      drawTableHeader();
      const drawRow = (row, rowIndex, isSummary = false) => {
        const wrappedCells = row.map((value, index) => (
          pdf.splitTextToSize(value, Math.max(4, columnWidths[index] - cellPadding * 2))
        ));
        const rowLineCount = Math.max(...wrappedCells.map((lines) => lines.length));
        let lineOffset = 0;
        while (lineOffset < rowLineCount) {
          let availableLines = Math.floor((contentBottom - y - cellPadding * 2) / lineHeight);
          if (availableLines < 1) {
            startNextPage();
            availableLines = Math.floor((contentBottom - y - cellPadding * 2) / lineHeight);
          }
          const linesInSegment = Math.min(availableLines, rowLineCount - lineOffset);
          const rowHeight = linesInSegment * lineHeight + cellPadding * 2;
          pdf.setFillColor(...(isSummary ? [226, 232, 240] : rowIndex % 2 ? [248, 250, 252] : [255, 255, 255]));
          pdf.rect(margin, y, tableWidth, rowHeight, "F");
          pdf.setDrawColor(226, 232, 240);
          pdf.rect(margin, y, tableWidth, rowHeight);
          pdf.setFont("helvetica", isSummary ? "bold" : "normal");
          pdf.setFontSize(isSummary ? 9 : 8);
          let x = margin;
          for (let index = 0; index < wrappedCells.length; index += 1) {
            const lines = wrappedCells[index];
            for (let lineIndex = 0; lineIndex < linesInSegment; lineIndex += 1) {
              const line = lines[lineOffset + lineIndex];
              if (line !== undefined) pdf.text(line, x + cellPadding, y + cellPadding + lineIndex * lineHeight + 2.5);
            }
            x += columnWidths[index];
            if (index < columns.length - 1) pdf.line(x, y, x, y + rowHeight);
          }
          y += rowHeight;
          lineOffset += linesInSegment;
          if (lineOffset < rowLineCount) startNextPage();
        }
      };
      values.forEach((row, rowIndex) => drawRow(row, rowIndex));
      if (summaryValues) drawRow(summaryValues, values.length, true);
      pdf.save(`${recordName}-${scope}.pdf`);
      setIsOpen(false);
    } catch (error) {
      setPdfError(`Could not save PDF: ${error.message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const printSelected = () => {
    setPrintError("");
    const pageCard = actionRootRef.current?.closest(".page-card");
    const tables = Array.from(pageCard?.querySelectorAll("table") || []);
    const table = tables.find((candidate) => (
      candidate.querySelectorAll("tbody input[type='checkbox']:checked").length === selectedRecords.length
    ));
    if (!table || !selectedRecords.length) {
      setPrintError("Could not find the selected records in the table. Select rows using their checkboxes and try again.");
      return;
    }

    const selectedRows = Array.from(table.querySelectorAll("tbody tr")).filter((row) => (
      row.querySelector("input[type='checkbox']:checked")
    ));
    if (selectedRows.length !== selectedRecords.length) {
      setPrintError("Could not match all selected records to table rows. Select the records again and try printing.");
      return;
    }

    setPrintError("");
    setIsOpen(false);
    table.classList.add("print-selected-table");
    selectedRows.forEach((row) => row.classList.add("print-selected-row"));
    document.body.classList.add("print-selected-records");
    try {
      window.print();
    } finally {
      document.body.classList.remove("print-selected-records");
      table.classList.remove("print-selected-table");
      selectedRows.forEach((row) => row.classList.remove("print-selected-row"));
    }
  };

  const runAction = (action) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="record-actions no-print" ref={actionRootRef}>
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
          {onAdd ? <button type="button" role="menuitem" onClick={() => runAction(onAdd)}>{addLabel}</button> : null}
          <button type="button" role="menuitem" disabled={!editEnabled} onClick={() => runAction(() => onEdit(selectedRecords[0]))}>Edit</button>
          <button type="button" role="menuitem" disabled={!deleteEnabled} onClick={() => runAction(() => onDelete(selectedRecords))}>Delete</button>
          {onUpload ? <button type="button" role="menuitem" onClick={() => runAction(onUpload)}>Upload spreadsheet</button> : null}
          {onManageCategories ? <button type="button" role="menuitem" onClick={() => runAction(onManageCategories)}>Manage categories</button> : null}
          {onConfigureCable ? <button type="button" role="menuitem" onClick={() => runAction(onConfigureCable)}>Configure cable length</button> : null}
          <button type="button" role="menuitem" onClick={() => runAction(() => window.print())}>Print</button>
          <button type="button" role="menuitem" disabled={!hasSelection} onClick={printSelected}>Print selected</button>
          <button type="button" role="menuitem" disabled={!records.length || pdfBusy} onClick={() => savePdf(records, "all")}>{pdfBusy ? "Creating PDF..." : "Save all as PDF"}</button>
          <button type="button" role="menuitem" disabled={!hasSelection || pdfBusy} onClick={() => savePdf(selectedRecords, "selected")}>{pdfBusy ? "Creating PDF..." : "Save selected as PDF"}</button>
          <button type="button" role="menuitem" disabled={!records.length} onClick={exportRecords}>Export (CSV)</button>
          <button type="button" role="menuitem" disabled={!hasSelection} onClick={downloadSelection}>Download (JSON)</button>
        </div>
      ) : null}
      {pdfError ? <p role="alert">{pdfError}</p> : null}
      {printError ? <p role="alert">{printError}</p> : null}
    </div>
  );
}
