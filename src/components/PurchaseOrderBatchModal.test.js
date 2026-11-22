import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { InventoryProvider } from "../contexts/InventoryContext";
import PurchaseOrderBatchModal from "./PurchaseOrderBatchModal";

const mockPdfText = jest.fn();
const mockPdfSave = jest.fn();
const mockPdfAddPage = jest.fn();
const mockPdfSplitText = jest.fn((value) => [value]);

jest.mock("jspdf", () => ({ jsPDF: jest.fn() }));
beforeEach(() => {
  require("jspdf").jsPDF.mockImplementation(() => ({
    addImage: jest.fn(), addPage: mockPdfAddPage, setFont: jest.fn(), setFontSize: jest.fn(),
    text: mockPdfText, line: jest.fn(), setFillColor: jest.fn(), rect: jest.fn(),
    setTextColor: jest.fn(), setDrawColor: jest.fn(), save: mockPdfSave,
    splitTextToSize: mockPdfSplitText,
  }));
});
jest.mock("xlsx", () => ({ ...jest.requireActual("xlsx"), writeFile: jest.fn() }));
jest.mock("../utils/companyBrand", () => ({
  companyLogoDataUri: "data:image/svg+xml,test",
  getCompanyLogoPngDataUrl: jest.fn().mockResolvedValue("data:image/png;base64,test"),
}));

test("purchase order PDF, CSV and Excel omit status while retaining order details", async () => {
  localStorage.clear();
  mockPdfSplitText.mockImplementation((value) => [value]);
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([{
    id: "SUP-1", name: "Test supplier", email: "supplier@example.com",
    phone: "012345", address: "Main Street", paymentTerms: "Net 30",
  }]));
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
    expect(screen.getByRole("dialog")).toHaveTextContent("Phone: 012345");
    expect(screen.getByRole("dialog")).toHaveTextContent("Address: Main Street");
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(mockPdfSave).toHaveBeenCalledWith("purchase-orders.pdf"));
    expect(mockPdfText.mock.calls.flat().join(" ")).toContain("PO:123");
    expect(mockPdfText.mock.calls.flat().join(" ")).toContain("Phone: 012345");
    expect(mockPdfText.mock.calls.flat().join(" ")).toContain("Address: Main Street");
    expect(mockPdfText.mock.calls.flat().join(" ")).not.toMatch(/status|pending/i);

    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));
    const workbook = XLSX.writeFile.mock.calls[0][0];
    const excel = XLSX.utils.sheet_to_json(workbook.Sheets["Purchase Order Lines"], { header: 1 });
    expect(excel[4]).toContain("PO Number");
    expect(excel[4]).not.toContain("Status");
    expect(excel[5]).toContain("PO:123");
    expect(excel[5]).toContain("supplier@example.com");
    expect(excel[5]).toContain("012345");
    expect(excel[5]).toContain("Main Street");

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(URL.createObjectURL.mock.calls[0][0]);
    });

    expect(csv).toContain("PO:123");
    expect(csv).toContain("Main Street");
    expect(csv).not.toMatch(/status|pending/i);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
  } finally {
    click.mockRestore();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  }
});

test("long supplier details paginate before the purchase order table", async () => {
  localStorage.clear();
  localStorage.setItem("inventory-managed-suppliers", JSON.stringify([{
    id: "SUP-1", name: "Test supplier", address: "Long address",
  }]));
  mockPdfText.mockClear();
  mockPdfSave.mockClear();
  mockPdfAddPage.mockClear();
  mockPdfSplitText.mockImplementation((value) => (
    value === "Address: Long address" ? Array(40).fill("address line") : [value]
  ));
  render(<InventoryProvider><PurchaseOrderBatchModal orders={[{
    id: "order-1", supplierId: "SUP-1", date: "2026-01-01",
    lineItems: [{ itemId: "ITM-1", quantity: 1, unitCost: 10 }],
  }]} onClose={() => {}} /></InventoryProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(mockPdfSave).toHaveBeenCalled());
  expect(mockPdfAddPage).toHaveBeenCalled();
  const addressLines = mockPdfText.mock.calls.filter(([text]) => text === "address line");
  const tableHeader = mockPdfText.mock.calls.find(([text]) => text === "ITEM DESCRIPTION");
  expect(addressLines).toHaveLength(40);
  expect(tableHeader[2]).toBeGreaterThan(addressLines[addressLines.length - 1][2]);
});
