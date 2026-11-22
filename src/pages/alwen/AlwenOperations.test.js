import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AlwenOperations from "./AlwenOperations";
import { alwenApiRequest } from "../../services/alwenApi";

jest.mock("../../services/alwenApi", () => ({ alwenApiRequest: jest.fn() }));
jest.mock("./AlwenAnalytics", () => () => null);

beforeEach(() => {
  alwenApiRequest.mockReset();
  alwenApiRequest.mockImplementation((path) => {
    if (path === "/units") return Promise.resolve([{ id: 1, code: "pcs" }]);
    if (["/categories", "/projects", "/stores"].includes(path)) return Promise.resolve([]);
    return Promise.resolve({ items: [] });
  });
});

test("authorized users can create an item from the stock page", async () => {
  render(<AlwenOperations user={{ role: "Admin" }} initialTab="stock" />);
  fireEvent.click(await screen.findByRole("button", { name: "Add item" }));
  fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "New tool" } });
  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "TOOL-1" } });
  fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save item" }));
  await waitFor(() => expect(alwenApiRequest).toHaveBeenCalledWith("/items", {
    method: "POST",
    body: { name: "New tool", sku: "TOOL-1", category_id: null, unit_id: 1, reorder_level: "0" },
  }));
  expect(await screen.findByText("Item added.")).toBeInTheDocument();
  expect(screen.getByText(/New items start with zero stock/)).toBeInTheDocument();
});

test("stock users without item creation permission cannot open the item form", async () => {
  render(<AlwenOperations user={{ role: "Store Keeper" }} initialTab="stock" />);
  await screen.findByRole("heading", { name: "Current stock" });
  expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
});
