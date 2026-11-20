import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { InventoryProvider } from "../contexts/InventoryContext";
import PurchaseOrderBatchModal from "./PurchaseOrderBatchModal";

const mockPdfText = jest.fn();
const mockPdfSave = jest.fn();

jest.mock("jspdf", () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    addImage: jest.fn(), addPage: jest.fn(), setFont: jest.fn(), setFontSize: jest.fn(),
    text: mockPdfText, line: jest.fn(), setFillColor: jest.fn(), rect: jest.fn(),
    setTextColor: jest.fn(), setDrawColor: jest.fn(), save: mockPdfSave,
  })),
}));
jest.mock("xlsx", () => ({ ...jest.requireActual("xlsx"), writeFile: jest.fn() }));
jest.mock("../utils/companyBrand", () => ({
  companyLogoDataUri: "data:image/svg+xml,test",
  getCompanyLogoPngDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
}));

test("purchase order PDF, CSV and Excel omit status while retaining order details", async () => {
  localStorage.clear();
  mockPdfText.mockClear();
  mockPdfSave.mockClear();
  XLSX.writeFile.mockClear();
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  try {
    render(
      <InventoryProvider>
        <PurchaseOrderBatchModal orders={[{
          id: "order-1", orderNumber: "PO:123", supplierId: "SUP-1",
          date: "2026-01-01", status: "Pending",
          lineItems: [{ itemId: "ITM-1", quantity: 2, uom: "km", unitCost: 10 }],
        }]} onClose={() => {}} />
      </InventoryProvider>
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("PO:123");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(mockPdfSave).toHaveBeenCalledWith("purchase-orders.pdf"));
    expect(mockPdfText.mock.calls.flat().join(" ")).toContain("PO:123");
    expect(mockPdfText.mock.calls.flat().join(" ")).not.toMatch(/status|pending/i);

    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    const workbook = XLSX.writeFile.mock.calls[0][0];
    const excel = XLSX.utils.sheet_to_json(workbook.Sheets["Purchase Order Lines"], { header: 1 });
    expect(excel[4]).toContain("PO Number");
    expect(excel[4]).not.toContain("Status");
    expect(excel[5]).toContain("PO:123");

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(URL.createObjectURL.mock.calls[0][0]);
    });
    expect(csv).toContain("PO:123");
    expect(csv).not.toMatch(/status|pending/i);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
  } finally {
    click.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});
