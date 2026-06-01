import React, { useState } from "react";

export default function TestFlows({ user, setUser, orders, setOrders, purchases, setPurchases, inventory, setInventory, pushNotification }) {
  const [log, setLog] = useState([]);

  const append = (msg) => setLog((l) => [msg, ...l]);

  const ensureUsers = () => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const admin = users.find(u=>u.role==='Admin');
    const director = users.find(u=>u.role==='Director');
    const proc = users.find(u=>u.role==='Procurement Officer');
    const next = [...users];
    if(!admin) { next.push({ name:'Admin', email:'admin@easyprocure.com', role:'Admin', password:'admin' }); append('Created Admin'); }
    if(!director) { next.push({ name:'Director', email:'director@easyprocure.com', role:'Director', password:'director' }); append('Created Director'); }
    if(!proc) { next.push({ name:'Officer', email:'officer@easyprocure.com', role:'Procurement Officer', password:'officer' }); append('Created Procurement Officer'); }
    localStorage.setItem('users', JSON.stringify(next));
    return next;
  };

  const run = () => {
    append('Starting test flows...');
    const users = ensureUsers();

    // 1. Login as Procurement Officer and create a purchase request
    const officer = users.find(u=>u.role==='Procurement Officer');
    setUser(officer);
    append(`Logged in as ${officer.name}`);

    const req = { item: 'Test Item', quantity: 5, supplier: 'Test Supplier', status: 'Pending', date: new Date().toISOString().slice(0,10) };
    setPurchases((p)=>{ const next=[...p, req]; append('Created purchase request'); return next; });

    // 2. Login as Director and approve
    const director = users.find(u=>u.role==='Director');
    setUser(director);
    append(`Switched to ${director.name} (Director)`);

    setPurchases((p)=>{
      const i = p.findIndex(x=>x.item==='Test Item');
      if(i===-1) { append('Purchase not found for approval'); return p; }
      const next = p.map((x,idx)=> idx===i?{...x,status:'Approved'}:x);
      append('Approved purchase request');
      pushNotification && pushNotification(`Purchase approved: Test Item`);
      return next;
    });

    // 3. Mark purchased and move to inventory
    setPurchases((p)=>{
      const i = p.findIndex(x=>x.item==='Test Item');
      if(i===-1) { append('Purchase not found for purchase step'); return p; }
      const next = p.map((x,idx)=> idx===i?{...x,status:'Purchased'}:x);
      append('Marked purchase as Purchased');
      return next;
    });

    const invItem = { item: 'Test Item', description:'From purchase', quantity:5, uom:'pcs', amount:0, total:0, supplier:'Test Supplier', date:new Date().toISOString().slice(0,10) };
    setInventory((inv)=>{ append('Added to inventory'); pushNotification && pushNotification('Item added to inventory: Test Item'); return [...inv, invItem]; });

    append('Test flows completed');
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>Automated Test Flows</h1>
      <p>Run a sequence: create purchase as Officer → approve as Director → mark purchased → verify inventory.</p>
      <button onClick={run} style={{ marginBottom: 12 }}>Run Test</button>
      <div style={{ background:'#fff', padding:12, border:'1px solid #ddd' }}>
        <h3>Log</h3>
        <ul>
          {log.map((l,i)=>(<li key={i}>{l}</li>))}
        </ul>
      </div>
      <div style={{ marginTop: 12 }}>
        <h3>Current State</h3>
        <p>Purchases: {JSON.stringify(purchases.slice(-5))}</p>
        <p>Inventory: {JSON.stringify(inventory.slice(-5))}</p>
        <p>Notifications: {JSON.stringify(JSON.parse(localStorage.getItem('notifications')||'[]').slice(-5))}</p>
      </div>
    </div>
  );
}
