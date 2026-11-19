import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import Sidebar from './components/Sidebar';
import Inventory from './pages/Inventory';
import Settings from './pages/Settings';
import { InventoryProvider } from './contexts/InventoryContext';

jest.mock('react-chartjs-2', () => ({
  Pie: () => <div data-testid="pie-chart" />,
  Bar: () => <div data-testid="bar-chart" />,
  Line: () => <div data-testid="line-chart" />,
}));

beforeEach(() => {
  localStorage.clear();
});

test('renders the administrator login screen', () => {
  render(<App />);
  expect(screen.getByText(/Administrator login/i)).toBeInTheDocument();
});

test('redirects authenticated users to the single analytics dashboard from the home route', () => {
  localStorage.setItem(
    'user',
    JSON.stringify({ name: 'Admin', email: 'admin@easyprocure.com', role: 'Admin', password: 'admin' })
  );

  render(<App />);

  expect(screen.getByRole('heading', { name: 'Inventory Dashboard' })).toBeInTheDocument();
});

test('shows profile actions in the navbar for signed-in users', () => {
  localStorage.setItem(
    'user',
    JSON.stringify({ name: 'Admin', email: 'admin@easyprocure.com', role: 'Admin', password: 'admin' })
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /open profile menu/i }));

  expect(screen.getByText(/Edit name/i)).toBeInTheDocument();
  expect(screen.getByText(/Change password/i)).toBeInTheDocument();
  expect(screen.getByText(/Sign out/i)).toBeInTheDocument();
});

test('Inventory beside Dashboard opens nested purchase, supplier, and stock folders', () => {
  render(
    <MemoryRouter
      initialEntries={['/inventory']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <InventoryProvider>
        <Sidebar user={{ role: 'Admin' }} />
      </InventoryProvider>
    </MemoryRouter>
  );

  const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
  expect(dashboardLink).toHaveAttribute('href', '/inventory/dashboard');
  expect(screen.getAllByRole('link')[0]).toBe(dashboardLink);
  const inventoryToggle = screen.getByRole('button', { name: 'Inventory' });
  expect(inventoryToggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(inventoryToggle);
  const purchaseToggle = screen.getByRole('button', { name: 'Purchase' });
  expect(purchaseToggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Supplier' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Stock' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('link', { name: 'Inventory Stock' })).toHaveAttribute('href', '/inventory');
  expect(document.querySelector('#inventory-submenu').firstElementChild).toHaveTextContent('Inventory Stock');
  expect(screen.queryByRole('link', { name: 'Purchase Orders' })).not.toBeInTheDocument();
  fireEvent.click(purchaseToggle);
  fireEvent.click(screen.getByRole('button', { name: 'Supplier' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stock' }));
  expect(screen.getByRole('link', { name: 'Supplier Details' })).toHaveAttribute('href', '/inventory/suppliers');
  expect(screen.getByRole('link', { name: 'Supplier Invoice' })).toHaveAttribute('href', '/inventory/supplier-invoices');
  expect(screen.queryByRole('link', { name: 'Items' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Purchase Orders' })).toHaveAttribute('href', '/inventory/purchase-orders');
  expect(screen.getByRole('link', { name: 'Stock In' })).toHaveAttribute('href', '/inventory/stock-in');
  expect(screen.getByRole('link', { name: 'Stock Out' })).toHaveAttribute('href', '/inventory/stock-out');
  expect(screen.getByRole('link', { name: 'Purchase Requests' })).toHaveAttribute('href', '/inventory/purchase-requests');
  expect(screen.getByRole('link', { name: 'Purchase Quotation' })).toHaveAttribute('href', '/inventory/quotations');
  const purchaseLinkLabels = Array.from(document.querySelectorAll('#purchase-submenu a')).map((link) => link.textContent);
  expect(purchaseLinkLabels).toEqual([
    'Purchase Orders',
    'Purchase Requests',
    'Purchase Quotation',
  ]);
  expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();

  fireEvent.click(purchaseToggle);
  expect(purchaseToggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('link', { name: 'Purchase Orders' })).not.toBeInTheDocument();
  fireEvent.click(inventoryToggle);
  expect(screen.queryByRole('link', { name: 'Inventory Stock' })).not.toBeInTheDocument();
  fireEvent.click(inventoryToggle);
  expect(screen.getByRole('button', { name: 'Supplier' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Stock' })).toHaveAttribute('aria-expanded', 'false');
});

test.each([
  ['/inventory/stock-in', 'Stock In', 'Record stock in'],
  ['/inventory/stock-out', 'Stock Out', 'Record stock out'],
])('opens the %s inventory submenu', async (path, title, actionHeading) => {
  localStorage.setItem(
    'user',
    JSON.stringify({ name: 'Admin', email: 'admin@easyprocure.com', role: 'Admin' })
  );
  window.history.pushState({}, '', path);

  render(<App />);

  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: actionHeading })).toBeInTheDocument();
});

test('admin can remove a menu from a role', () => {
  render(
    <InventoryProvider>
      <Settings user={{ name: 'Admin', role: 'Admin' }} setUser={jest.fn()} />
    </InventoryProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Staff' }));
  const purchaseOrdersMenu = screen.getByLabelText('Purchase Orders');
  expect(purchaseOrdersMenu).toBeChecked();
  fireEvent.click(purchaseOrdersMenu);

  expect(screen.getByLabelText('Purchase Orders')).not.toBeChecked();
  expect(JSON.parse(localStorage.getItem('roleMenuPermissions')).Staff).not.toContain('/inventory/purchase-orders');
});

test('restricted roles cannot open a menu through its direct URL', async () => {
  localStorage.setItem(
    'user',
    JSON.stringify({ name: 'Staff', email: 'staff@example.com', role: 'Staff' })
  );
  localStorage.setItem(
    'roleMenuPermissions',
    JSON.stringify({ Staff: ['/inventory/dashboard'] })
  );
  window.history.pushState({}, '', '/inventory/purchase-orders');

  render(<App />);

  expect(await screen.findByText(/your role does not have permission to view this menu/i)).toBeInTheDocument();
});

test('allows a user to reset their password using an emailed verification code', async () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Code sent' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Email verified' }) });
  global.fetch = fetchMock;

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'admin@easyprocure.com' } });
  fireEvent.click(screen.getByRole('button', { name: /send code/i }));

  expect(await screen.findByLabelText(/verification code/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: '123456' } });
  fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newpassword123' } });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpassword123' } });
  fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

  expect(await screen.findByText(/password reset complete/i)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  fireEvent.change(screen.getByLabelText(/login/i), { target: { value: 'admin@easyprocure.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'newpassword123' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  expect(screen.getByRole('heading', { name: 'Inventory Dashboard' })).toBeInTheDocument();
  if (originalFetch) global.fetch = originalFetch;
  else delete global.fetch;
});

test('allows an authenticated user to add an inventory item', () => {
  const setInventory = jest.fn();

  render(<Inventory inventory={[]} setInventory={setInventory} user={{ name: 'Admin' }} searchTerm="" />);

  fireEvent.change(screen.getByPlaceholderText('Item'), { target: { value: 'ADSS Cable' } });
  fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Main feeder cable' } });
  fireEvent.change(screen.getByPlaceholderText('Quantity'), { target: { value: '10' } });
  fireEvent.change(screen.getByPlaceholderText('UOM'), { target: { value: 'Meters' } });
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '120' } });
  fireEvent.change(screen.getByPlaceholderText('Supplier'), { target: { value: 'Nexcom' } });
  fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: 'ADSS Cables' } });
  fireEvent.change(document.querySelector('input[name="date"]'), { target: { value: '2026-07-03' } });
  fireEvent.click(screen.getByRole('button', { name: /add item/i }));

  expect(setInventory).toHaveBeenCalled();
  expect(screen.getByText(/added adss cable to inventory/i)).toBeInTheDocument();
});

test('shows the bulk actions menu when inventory rows are selected', () => {
  const setInventory = jest.fn();
  render(
    <Inventory
      inventory={[{ item: 'ADSS Cable', quantity: 5, uom: 'Meters', amount: 120, supplier: 'Nexcom', date: '2026-07-03', description: 'Cable', category: 'ADSS Cables' }]}
      setInventory={setInventory}
      user={{ name: 'Admin' }}
      searchTerm=""
    />
  );

  fireEvent.click(screen.getAllByRole('checkbox')[1]);
  fireEvent.click(screen.getByRole('button', { name: /actions/i }));

  expect(screen.getByText(/edit/i)).toBeInTheDocument();
  expect(screen.getByText(/export/i)).toBeInTheDocument();
  expect(screen.getByText(/share/i)).toBeInTheDocument();
  expect(screen.getByText(/delete/i)).toBeInTheDocument();
});
