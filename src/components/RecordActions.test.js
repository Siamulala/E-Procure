import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InventoryProvider } from "../contexts/InventoryContext";
import InventoryStock from "../pages/InventoryStock";
import RecordActions from "./RecordActions";

const mockText = jest.fn();
const mockSave = jest.fn();
const mockAddPage = jest.fn();
const mockAddImage = jest.fn();

jest.mock("jspdf", () => ({ jsPDF: jest.fn() }));
jest.mock("../utils/companyBrand", () => ({
  companyLogoDataUri: "data:image/svg+xml,test",
  getCompanyDetails: () => {
    const details = JSON.parse(global.localStorage.getItem("companyDetails") || "{}");
    return {
      name: details.name || "Easy-Procure",
      address: details.address || "",
      phone: details.phone || "",
      email: details.email || "",
    };
  },
  getCompanyLogoPngDataUrl: () => Promise.resolve("data:image/png;base64,test"),
}));

beforeEach(() => {
  require("jspdf").jsPDF.mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 80 } },
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    setFillColor: jest.fn(),
    setDrawColor: jest.fn(),
    splitTextToSize: (text) => text.split("\n"),
    text: mockText,
    addImage: mockAddImage,
    rect: jest.fn(),
    line: jest.fn(),
    addPage: mockAddPage,
    save: mockSave,
  }));
  mockText.mockClear();
  mockSave.mockClear();
  mockAddPage.mockClear();
  mockAddImage.mockClear();
});

test("PDF downloads all or selected formatted records with company branding", async () => {
  localStorage.setItem("companyDetails", JSON.stringify({
    name: "Example Procurement Ltd.", address: "123 Example Road",
    phone: "0712345678", email: "office@example.com",
  }));
  const selected = { id: 2, name: "Selected", details: Array(12).fill("Detail").join("\n") };
  const formatPdfRecord = (record) => ({ Item: record.name, Details: record.details });
  const { rerender } = render(<RecordActions records={[{ id: 1, name: "Unselected" }, selected]} selectedRecords={[]} recordName="test-records" formatPdfRecord={formatPdfRecord} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  expect(screen.getByRole("menuitem", { name: "Save selected as PDF" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "Save all as PDF" })).toBeEnabled();
  expect(screen.getByRole("menuitem", { name: "Print" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Print selected" })).toBeDisabled();
  rerender(<RecordActions records={[{ id: 1, name: "Unselected" }, selected]} selectedRecords={[selected]} recordName="test-records" formatPdfRecord={formatPdfRecord} />);
  expect(screen.getByRole("menuitem", { name: "Print selected" })).toBeEnabled();
  fireEvent.click(screen.getByRole("menuitem", { name: "Save selected as PDF" }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith("test-records-selected.pdf"));
  const text = mockText.mock.calls.map(([line]) => line).join(" ");
  expect(text).toContain("Item");
  expect(text).toContain("Selected");
  expect(text).toContain("Details");
  expect(text).toContain("123 Example Road");
  expect(text).toContain("Phone: 0712345678");
  expect(text).toContain("Email: office@example.com");
  expect(text).not.toContain("Unselected");
  expect(mockAddImage).toHaveBeenCalledWith(
    "data:image/png;base64,test",
    "PNG",
    expect.any(Number),
    7,
    50,
    expect.any(Number)
  );
  const watermarkCalls = mockText.mock.calls.filter(([line, , , options]) => (
    line === "Example Procurement Ltd." && options?.angle === 45
  ));
  expect(watermarkCalls).toHaveLength(mockAddPage.mock.calls.length + 1);
  expect(mockText.mock.calls.find(([line, , , options]) => (
    line === "Example Procurement Ltd." && options?.align === "center"
  ))).toBeDefined();
  expect(mockAddPage).toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Save all as PDF" }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith("test-records-all.pdf"));
  const allPdfText = mockText.mock.calls.map(([line]) => line).join(" ");
  expect(allPdfText).toContain("Unselected");
});

test("Print selected prints only checked rows", () => {
  const selectedRecord = { id: "selected" };
  let table;
  const printSpy = jest.spyOn(window, "print").mockImplementation(() => {
    expect(table).toHaveClass("print-selected-table");
    expect(screen.getByTestId("selected-row")).toHaveClass("print-selected-row");
    expect(screen.getByTestId("other-row")).not.toHaveClass("print-selected-row");
  });
  render(
    <div className="page-card">
      <RecordActions records={[selectedRecord, { id: "other" }]} selectedRecords={[selectedRecord]} />
      <table data-testid="records-table">
        <tbody>
          <tr data-testid="selected-row"><td><input type="checkbox" checked readOnly /></td><td>Selected</td></tr>
          <tr data-testid="other-row"><td><input type="checkbox" readOnly /></td><td>Other</td></tr>
        </tbody>
      </table>
    </div>
  );
  table = screen.getByTestId("records-table");
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Print selected" }));

  expect(printSpy).toHaveBeenCalledTimes(1);
  expect(document.body).not.toHaveClass("print-selected-records");
  expect(table).not.toHaveClass("print-selected-table");
  printSpy.mockRestore();
});

test("PDF creation errors are displayed", async () => {
  render(<RecordActions records={[{ id: 1 }]} selectedRecords={[{ id: 1 }]} formatPdfRecord={() => { throw new Error("Cannot format record"); }} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Save selected as PDF" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save PDF: Cannot format record");
  expect(mockSave).not.toHaveBeenCalled();
});

test("inventory PDF contains the selected receipt's visible details", async () => {
  localStorage.clear();
  localStorage.setItem("companyDetails", JSON.stringify({
    name: "Example Procurement Ltd.", address: "123 Example Road", phone: "0712345678",
  }));
  const date = `${new Date().getFullYear()}-01-01`;
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "one", itemId: "ITM-1", item: "Cable", sku: "CABLE-1", category: "Fiber", movementType: "in", date, quantity: 2, uom: "km", isPurchase: true, supplier: "Alpha", unitCost: 50 },
    { id: "two", itemId: "ITM-2", item: "Battery", sku: "BAT-1", movementType: "in", date, quantity: 1, uom: "piece", isPurchase: true, supplier: "Beta", unitCost: 200 },
  ]));
  render(<MemoryRouter><InventoryProvider><InventoryStock /></InventoryProvider></MemoryRouter>);
  expect(screen.getByText("123 Example Road")).toBeInTheDocument();
  expect(screen.getByText("Phone: 0712345678")).toBeInTheDocument();
  expect(screen.getAllByText("Example Procurement Ltd.")).toHaveLength(2);
  fireEvent.click(screen.getByLabelText("Select stock in one"));
  fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Save selected as PDF" }));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  const text = mockText.mock.calls.map(([line]) => line).join(" ");
  expect(text).toContain("Item");
  expect(text).toContain("Cable");
  expect(text).toContain("Quantity");
  expect(text).toContain("UOM");
  expect(text).not.toContain("Quantity / UOM");
  expect(text).toContain("Total purchased value");
  expect(text).toContain("KSh 100.00");
  expect(text).not.toContain("Category");
  expect(text).not.toContain("Fiber");
  expect(text).toContain("Total");
  expect(text).toContain("KSh 100.00");
  expect(text).not.toContain("CABLE-1");
  expect(text).not.toContain("Battery");
  expect(screen.queryByRole("button", { name: "Print Inventory Stock" })).not.toBeInTheDocument();
});
