import React, { useState } from "react";
import { formatStockBalances, useInventory } from "../contexts/InventoryContext";

export default function CableConfiguration({ onClose }) {
  const { items, configureCable } = useInventory();
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("");
  const [length, setLength] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const item = items.find((entry) => entry.id === itemId);

  const save = (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      configureCable(itemId, type, length);
      setMessage("Cable length saved; compatible stock balances have been combined.");
    } catch (saveError) {
      setError(saveError.message);
    }
  };

  return <section className="page-card no-print">
    <div className="panel-heading">
      <h2 className="panel-title">Configure cable length</h2>
      <button className="secondary-btn" type="button" onClick={onClose}>Close cable settings</button>
    </div>
    <p className="panel-copy">Choose the cable item and confirm its package length. Other units remain separate unless a conversion is known.</p>
    <form className="form-row" onSubmit={save}>
      <label>Cable item<select className="input-field" value={itemId} onChange={(event) => {
        const selected = items.find((entry) => entry.id === event.target.value);
        setItemId(event.target.value);
        setType(selected?.cableType || "");
        setLength(selected?.cableLengthMeters == null ? "" : String(selected.cableLengthMeters));
        setError("");
        setMessage("");
      }} required>
        <option value="">Select item</option>
        {items.filter((entry) => !entry.archived).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.sku})</option>)}
      </select></label>
      <label>Cable type<select className="input-field" value={type} onChange={(event) => {
        setType(event.target.value);
        setLength(event.target.value === "adss" ? "4000" : event.target.value === "drop" ? "2000" : "");
      }} required>
        <option value="">Select cable type</option>
        <option value="adss">ADSS (roll)</option>
        <option value="drop">Drop cable (reel)</option>
      </select></label>
      <label>Metres per {type === "drop" ? "reel" : "roll"}<input className="input-field" type="number" min="0" step="any" value={length} onChange={(event) => setLength(event.target.value)} required /></label>
      <button className="primary-btn" type="submit">Save cable length</button>
    </form>
    {item ? <p className="panel-copy">Current balance: {formatStockBalances(item)}</p> : null}
    {error || message ? <p role={error ? "alert" : "status"}>{error || message}</p> : null}
  </section>;
}
