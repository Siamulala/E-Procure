// src/pages/Orders.js
import React, { useState } from "react";

export default function Orders({ orders, setOrders, user }) {
    const [newOrder, setNewOrder] = useState({
        department: "",
        item: "",
        quantity: "",
        status: "Pending",
        supplier: "",
        date: ""
    });

    const [editingIndex, setEditingIndex] = useState(null);
    const [editValues, setEditValues] = useState({});
    const [openMenu, setOpenMenu] = useState(null);

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

    const exportRow = (row) => {
        const csv = Object.keys(row).join(",") + "\n" + Object.values(row).join(",");
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `order-${row.item}.csv`; a.click();
    };

    const printRow = (row) => {
        const w = window.open('', '_blank');
        w.document.write('<pre>' + JSON.stringify(row, null, 2) + '</pre>');
        w.print();
        w.close();
    };

    const startEdit = (i) => { setEditingIndex(i); setEditValues(orders[i]); setOpenMenu(null); };
    const saveEdit = (i) => { const next = orders.map((o,idx)=> idx===i?editValues:o); setOrders(next); setEditingIndex(null); };
    const deleteRow = (i) => { if(!window.confirm('Delete order?')) return; setOrders(orders.filter((_,idx)=>idx!==i)); setOpenMenu(null); };

    const visible = (o) => {
      if (!user) return true;
      if (user.role === 'Director') return true;
      return o.status === 'Approved' || o.status === 'Fulfilled' || o.status === 'In Stock';
    };

        const printOrders = () => {
            const w = window.open("", "_blank");
            w.document.write(`
                <html><head><title>Orders Report</title><style>body{font-family:Arial;margin:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:10px}th{background:#f0f0f0}</style></head><body>
                <h1>Orders Report</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
                <table><tr><th>Department</th><th>Item</th><th>Quantity</th><th>Supplier</th><th>Status</th><th>Date</th></tr>
                ${orders.filter(visible).map(o => `<tr><td>${o.department}</td><td>${o.item}</td><td>${o.quantity}</td><td>${o.supplier}</td><td>${o.status}</td><td>${o.date}</td></tr>`).join("")}
                </table><button onclick="window.print()" style="margin-top:20px;padding:10px 20px">Print</button></body></html>
            `);
        };

        return (
                <div style={{ padding: "30px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h1>Orders</h1>
                            <button onClick={printOrders} style={{ padding: "10px 20px", backgroundColor: "#16a34a", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: 600 }}>📄 Print</button>
                        </div>

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
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.filter(visible).map((o, i) => (
                        <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{editingIndex===i ? <input value={editValues.department||""} onChange={(e)=>setEditValues({...editValues,department:e.target.value})} /> : o.department}</td>
                            <td>{editingIndex===i ? <input value={editValues.item||""} onChange={(e)=>setEditValues({...editValues,item:e.target.value})} /> : o.item}</td>
                            <td>{editingIndex===i ? <input value={editValues.quantity||""} onChange={(e)=>setEditValues({...editValues,quantity:e.target.value})} /> : o.quantity}</td>
                            <td>{editingIndex===i ? <input value={editValues.supplier||""} onChange={(e)=>setEditValues({...editValues,supplier:e.target.value})} /> : o.supplier}</td>
                            <td>{editingIndex===i ? <select value={editValues.status||"Pending"} onChange={(e)=>setEditValues({...editValues,status:e.target.value})}><option>Pending</option><option>Approved</option><option>Fulfilled</option></select> : o.status}</td>
                            <td>{editingIndex===i ? <input type="date" value={editValues.date||""} onChange={(e)=>setEditValues({...editValues,date:e.target.value})} /> : o.date}</td>
                            <td style={{ position: 'relative' }}>
                                <button onClick={() => setOpenMenu(openMenu===i?null:i)}>⋯</button>
                                {openMenu===i && (
                                  <div style={{ position: 'absolute', right: 0, background:'#fff', border:'1px solid #ddd', padding:8, zIndex:10 }}>
                                    {editingIndex===i ? (
                                      <>
                                        <button onClick={()=>saveEdit(i)}>Save</button>
                                        <button onClick={()=>setEditingIndex(null)}>Cancel</button>
                                      </>
                                    ) : (
                                      <>
                                        <button onClick={()=>startEdit(i)}>Edit</button>
                                        <button onClick={()=>exportRow(o)}>Export</button>
                                        <button onClick={()=>printRow(o)}>Print</button>
                                        <button onClick={()=>deleteRow(i)}>Delete</button>
                                      </>
                                    )}
                                  </div>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}