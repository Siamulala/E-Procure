import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import InventoryDashboard from "./InventoryDashboard";
import { InventoryProvider } from "../contexts/InventoryContext";

jest.mock("recharts", () => {
  const React = require("react");
  const actual = jest.requireActual("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => React.cloneElement(children, { width: 500, height: 300 }),
  };
});

test("monthly item expenditure renders a curved line", async () => {
  localStorage.clear();
  const year = new Date().getFullYear();
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "one", itemId: "ITM-1", item: "Cable", movementType: "in", date: `${year}-01-01`, quantity: 1, uom: "km", isPurchase: true, supplier: "Supplier", unitCost: 100 },
    { id: "two", itemId: "ITM-1", item: "Cable", movementType: "in", date: `${year}-02-01`, quantity: 3, uom: "km", isPurchase: true, supplier: "Supplier", unitCost: 100 },
    { id: "three", itemId: "ITM-1", item: "Cable", movementType: "in", date: `${year}-03-01`, quantity: 2, uom: "km", isPurchase: true, supplier: "Supplier", unitCost: 100 },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  const monthlySection = screen.getByRole("heading", { name: "Monthly total expenditure" }).closest("section");
  const section = screen.getByRole("heading", { name: "Monthly expenditure by item" }).closest("section");
  await waitFor(() => {
    expect(monthlySection.querySelector(".recharts-line-curve")).toHaveAttribute("d", expect.stringContaining("C"));
    expect(section.querySelector(".recharts-line-curve")).toHaveAttribute("d", expect.stringContaining("C"));
  }, { timeout: 10000 });
}, 15000);

test("graph insights use purchased receipts and respond to year and item selection", () => {
  localStorage.clear();
  const year = 2027;
  const previous = year - 1;
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "previous", itemId: "cable", item: "Cable", movementType: "in", date: `${previous}-02-01`, quantity: 1, uom: "m", isPurchase: true, supplier: "Alpha", unitCost: 50 },
    { id: "one", itemId: "cable", item: "Cable", movementType: "in", date: `${year}-01-01`, quantity: 1, uom: "m", isPurchase: true, supplier: "Alpha", unitCost: 100 },
    { id: "two", itemId: "cable", item: "Cable", movementType: "in", date: `${year}-02-01`, quantity: 3, uom: "m", isPurchase: true, supplier: "Alpha", unitCost: 100 },
    { id: "three", itemId: "battery", item: "Battery", movementType: "in", date: `${year}-02-02`, quantity: 2, uom: "piece", isPurchase: true, supplier: "Beta", unitCost: 100 },
    { id: "return", itemId: "battery", item: "Battery", movementType: "in", date: `${year}-02-03`, quantity: 100, uom: "piece", unitCost: 100 },
    { id: "out-cable", itemId: "cable", item: "Cable", movementType: "out", date: `${year}-03-01`, quantity: 1, uom: "km" },
    { id: "out-battery", itemId: "battery", item: "Battery", movementType: "out", date: `${year}-03-01`, quantity: 2, uom: "piece" },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: String(year) } });
  const monthly = screen.getByRole("heading", { name: "Monthly total expenditure" }).closest("section");
  const item = screen.getByRole("heading", { name: "Monthly expenditure by item" }).closest("section");
  const supplier = screen.getByRole("heading", { name: "Supplier expenditure" }).closest("section");
  expect(screen.queryByRole("heading", { name: "Highest material consumption" })).not.toBeInTheDocument();

  expect(within(monthly).getByText(/Feb was among the highest-spend months/)).toHaveTextContent(
    `KSh 500.00. Recorded purchase value for the same month in ${previous} was KSh 50.00`
  );
  expect(within(supplier).getByText(/Alpha was among the highest-value suppliers/)).toHaveTextContent(
    "KSh 400.00 (66.7% of purchase value)"
  );
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "cable" } });
  expect(within(item).getByText(/Cable accounted for/)).toHaveTextContent(
    "KSh 400.00 (66.7% of"
  );
  expect(within(item).getByText(/Cable accounted for/)).toHaveTextContent(
    "Feb was among its highest-spend months at KSh 300.00"
  );
  fireEvent.change(screen.getByLabelText("Item"), { target: { value: "battery" } });
  expect(within(item).getByText(/Battery accounted for/)).toHaveTextContent("KSh 200.00 (33.3%");
  fireEvent.change(screen.getByLabelText("Year"), { target: { value: String(previous) } });
  expect(within(item).getByText(/Cable accounted for/)).toHaveTextContent("KSh 50.00 (100%");
});

test("insights explain zero-value purchase data without dividing by zero", () => {
  localStorage.clear();
  const year = new Date().getFullYear();
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "zero", itemId: "cable", item: "Cable", movementType: "in", date: `${year}-01-01`, quantity: 1, uom: "m", isPurchase: true, supplier: "Alpha", unitCost: 0 },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  expect(screen.getByText(`No purchase value was recorded in ${year}, so there is no peak spending month.`)).toBeInTheDocument();
  expect(screen.getByText(`No purchase value is available for the selected item in ${year}.`)).toBeInTheDocument();
  expect(screen.getByText(`No supplier purchase value is available for ${year}.`)).toBeInTheDocument();
});

test("insights explain when there are no recorded purchases or issues", () => {
  localStorage.clear();
  const year = new Date().getFullYear();
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  expect(screen.getByText(`No purchase value was recorded in ${year}, so there is no peak spending month.`)).toBeInTheDocument();
  expect(screen.getByText(`No purchase value is available for the selected item in ${year}.`)).toBeInTheDocument();
  expect(screen.getByText(`No supplier purchase value is available for ${year}.`)).toBeInTheDocument();
});

test("category expenditure renders a pie chart and retains category totals", async () => {
  localStorage.clear();
  const year = new Date().getFullYear();
  localStorage.setItem("inventory-stock-movements", JSON.stringify([
    { id: "one", itemId: "ITM-1", item: "Cable", category: "Fiber", movementType: "in", date: `${year}-01-01`, quantity: 2, uom: "km", isPurchase: true, supplier: "Alpha", unitCost: 100 },
    { id: "two", itemId: "ITM-2", item: "Battery", category: "Power", movementType: "in", date: `${year}-01-02`, quantity: 1, uom: "piece", isPurchase: true, supplier: "Beta", unitCost: 100 },
  ]));
  render(<InventoryProvider><InventoryDashboard /></InventoryProvider>);
  const section = screen.getByRole("heading", { name: "Purchase expenditure by category" }).closest("section");
  await waitFor(() => expect(section.querySelectorAll(".recharts-pie-sector")).toHaveLength(2), { timeout: 5000 });
  expect(within(section).getByText(/Fiber was among the highest-value categories/)).toHaveTextContent("KSh 200.00 (66.7%");
  fireEvent.click(within(section).getByText("Category values"));
  expect(within(section).getByRole("row", { name: /Power.*KSh 100.00/ })).toBeInTheDocument();
});
