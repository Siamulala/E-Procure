// src/pages/Orders.js
import React, { useState } from "react";

export default function Orders({ orders, setOrders }) {
    const [newOrder, setNewOrder] = useState({
        department: "",
        item: "",
        quantity: "",
        status: "Pending",
        supplier: "",
        date: ""
    });

    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setNewOrder((prev) => ({ ...prev, [name]: value }));
    };

    // Add new order
    const handleAddOrder = (e) => {
        e.preventDefault();
        if (!newOrder.department || !newOrder.item || !newOrder.quantity || !newOrder.supplier || !newOrder.date) {
            alert("Please fill all required fields");
            return;
        }

        setOrders((prev) => [
            ...prev,
            {
                ...newOrder,
                quantity: parseInt(newOrder.quantity)
            }
        ]);

        // Reset form
        setNewOrder({
            department: "",
            item: "",
            quantity: "",
            status: "Pending",
            supplier: "",
            date: ""
        });
    };

    return (
        <div style={{ padding: "30px" }}>
            <h1>Orders</h1>

            {/* Add Order Form */}
            <form
                onSubmit={handleAddOrder}
                style={{
                    marginBottom: "20px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "10px"
                }}
            >
                <input type="text" name="department" placeholder="Department" value={newOrder.department} onChange={handleChange} />
                <input type="text" name="item" placeholder="Item" value={newOrder.item} onChange={handleChange} />
                <input type="number" name="quantity" placeholder="Quantity" value={newOrder.quantity} onChange={handleChange} />
                <input type="text" name="supplier" placeholder="Supplier" value={newOrder.supplier} onChange={handleChange} />
                <input type="date" name="date" value={newOrder.date} onChange={handleChange} />
                <select name="status" value={newOrder.status} onChange={handleChange}>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Fulfilled">Fulfilled</option>
                </select>
                <button
                    type="submit"
                    style={{
                        gridColumn: "span 2",
                        padding: "10px",
                        backgroundColor: "#4CAF50",
                        color: "#fff",
                        border: "none",
                        borderRadius: "5px"
                    }}
                >
                    Add Order
                </button>
            </form>

            {/* Orders Table */}
            <table border="1" cellPadding="10" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ backgroundColor: "#f0f0f0" }}>
                    <tr>
                        <th>No.</th>
                        <th>Department</th>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Supplier</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((o, i) => (
                        <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{o.department}</td>
                            <td>{o.item}</td>
                            <td>{o.quantity}</td>
                            <td>{o.supplier}</td>
                            <td>{o.status}</td>
                            <td>{o.date}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

