export const MENU_ACCESS_ITEMS = [
  { path: "/inventory/dashboard", label: "Inventory Dashboard" },
  { path: "/inventory", label: "Inventory Stock" },
  { path: "/inventory/purchase-requests", label: "Purchase Requests" },
  { path: "/inventory/quotations", label: "Purchase Quotations" },
  { path: "/inventory/purchase-orders", label: "Purchase Orders" },
  { path: "/inventory/stock-in", label: "Stock In" },
  { path: "/inventory/stock-out", label: "Stock Out" },
  { path: "/inventory/suppliers", label: "Inventory Suppliers" },
  { path: "/inventory/supplier-invoices", label: "Supplier Invoice" },
  { path: "/reporting", label: "Reporting" },
  { path: "/support", label: "Support" },
  { path: "/settings", label: "Settings" },
  { path: "/alwen/suppliers", label: "Supplier Management" },
  { path: "/alwen/contracts", label: "Contracts" },
  { path: "/alwen/invoices", label: "Invoices" },
  { path: "/alwen/reports", label: "Procurement Reports" },
  { path: "/alwen/notifications", label: "Notifications" },
  { path: "/alwen/qbo", label: "QuickBooks" },
];

const routeAliases = {
  "/dashboard": "/inventory/dashboard",
  "/orders": "/inventory/purchase-orders",
  "/inventory/items": "/inventory",
  "/purchase": "/inventory/purchase-requests",
};

export function canRoleViewMenu(role, path, roleMenuPermissions) {
  if (role === "Admin") return true;
  const menuPath = routeAliases[path] || path;
  if (!MENU_ACCESS_ITEMS.some((menu) => menu.path === menuPath)) return true;
  const allowedMenus = roleMenuPermissions?.[role];
  return !Array.isArray(allowedMenus) || allowedMenus.includes(menuPath);
}
