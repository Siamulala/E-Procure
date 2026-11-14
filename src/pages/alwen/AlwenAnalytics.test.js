import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlwenAnalytics from "./AlwenAnalytics";
import { alwenApiDownload, alwenApiRequest } from "../../services/alwenApi";

jest.mock("react-chartjs-2", () => ({
  Bar: () => null,
  Doughnut: () => null
}));

jest.mock("../../services/alwenApi", () => ({
  alwenApiDownload: jest.fn(),
  alwenApiRequest: jest.fn()
}));

const report = {
  filters: { start_date: "2026-01-01", end_date: "2026-11-13", project_id: null, supplier_id: null, category_id: null },
  summary: {
    period_po_commitments: "100.00",
    purchase_order_count: 1,
    open_po_value: "0.00",
    this_month_po_commitments: "100.00",
    last_month_po_commitments: "0.00",
    this_month: "2026-11",
    last_month: "2026-10",
    top_supplier: "Nile Computers",
    top_project: "Kericho"
  },
  monthly_commitments: [{ month: "2026-11", value: "100.00", purchase_order_count: 1 }],
  supplier_spend: [{ supplier: "Nile Computers", value: "100.00", purchase_order_count: 1, share_percent: "100.00" }],
  project_spend: [{ project: "Kericho", value: "100.00", purchase_order_count: 1, share_percent: "100.00" }],
  category_spend: [],
  item_spend: [],
  purchase_request_funnel: [],
  supplier_scorecard: [],
  price_history: [],
  stock: null,
  stock_movements_by_month: [],
  usage_by_project: [],
  definitions: { spend: "Purchase-order line commitments by order date; this is not paid expenditure." }
};

beforeEach(() => {
  jest.clearAllMocks();
  alwenApiRequest.mockImplementation((path) => {
    if (path === "/projects") return Promise.resolve([]);
    if (path === "/suppliers?limit=500") return Promise.resolve({ items: [{ id: 5, name: "Nile Computers" }] });
    if (path === "/categories") return Promise.resolve([]);
    return Promise.resolve(report);
  });
});

test("loads analytics, applies report filters, and exports filtered CSV", async () => {
  render(<AlwenAnalytics user={{ role: "Finance", project_id: null }} />);

  expect(alwenApiRequest).toHaveBeenCalled();
  expect(await screen.findByRole("heading", { name: "Analytics & reports" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Supplier commitments" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => {
    expect(alwenApiRequest).toHaveBeenCalledWith(expect.stringContaining("supplier_id=5"));
  });

  fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
  await waitFor(() => {
    expect(alwenApiDownload).toHaveBeenCalledWith(
      expect.stringContaining("group_by=month"),
      "alwen-spend-by-month.csv"
    );
  });
});
