import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import Inventory from './pages/Inventory';

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

test('redirects authenticated users to the dashboard from the home route', () => {
  localStorage.setItem(
    'user',
    JSON.stringify({ name: 'Admin', email: 'admin@easyprocure.com', role: 'Admin', password: 'admin' })
  );

  render(<App />);

  expect(screen.getByText(/Hi, Admin/i)).toBeInTheDocument();
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

test('allows a user to reset their password and sign in with the temporary password', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'admin@easyprocure.com' } });
  fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

  expect(screen.getByText(/password reset complete/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/login/i), { target: { value: 'admin@easyprocure.com' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

  expect(screen.getByText(/Hi, Admin/i)).toBeInTheDocument();
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
