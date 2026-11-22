import React, { useState } from "react";
import { useInventory } from "../contexts/InventoryContext";

export default function CategoryManager({ onCategoryChange, onAssign, selectedCount = 0 }) {
  const { inventoryCategories, addInventoryCategory, renameInventoryCategory, deleteInventoryCategory } = useInventory();
  const [newCategory, setNewCategory] = useState("");
  const [categoryToRename, setCategoryToRename] = useState("");
  const [renamedCategory, setRenamedCategory] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState("");
  const [replacement, setReplacement] = useState("");
  const [categoryToAssign, setCategoryToAssign] = useState("");
  const [feedback, setFeedback] = useState({ error: "", message: "" });

  const changeCategory = (oldName, newName) => {
    if (categoryToAssign.toLowerCase() === oldName.toLowerCase()) setCategoryToAssign(newName);
    if (categoryToRename.toLowerCase() === oldName.toLowerCase()) setCategoryToRename(newName);
    if (replacement.toLowerCase() === oldName.toLowerCase()) setReplacement(newName);
    onCategoryChange?.(oldName, newName);
  };

  const submit = (event, action) => {
    event.preventDefault();
    setFeedback({ error: "", message: "" });
    try {
      if (action === "add") {
        addInventoryCategory(newCategory);
        setNewCategory("");
        setFeedback({ error: "", message: "Category added." });
      } else if (action === "rename") {
        const name = renameInventoryCategory(categoryToRename, renamedCategory);
        changeCategory(categoryToRename, name);
        if (categoryToDelete.toLowerCase() === categoryToRename.toLowerCase()) setCategoryToDelete(name);
        setRenamedCategory("");
        setFeedback({ error: "", message: "Category renamed in inventory records." });
      } else if (action === "delete") {
        if (categoryToDelete === "General Materials") throw new Error("General Materials is the default category and cannot be deleted.");
        if (!replacement || replacement === categoryToDelete) throw new Error("Choose a different existing replacement category.");
        if (!window.confirm(`Delete "${categoryToDelete}" and move its items and history to "${replacement}"?`)) return;
        const name = deleteInventoryCategory(categoryToDelete, replacement);
        changeCategory(categoryToDelete, name);
        setCategoryToDelete("");
        setReplacement("");
        setFeedback({ error: "", message: "Category deleted and its records reassigned." });
      } else {
        if (selectedCount !== 1) throw new Error("Select one Stock In record.");
        onAssign(categoryToAssign);
        setCategoryToAssign("");
        setFeedback({ error: "", message: "Record category updated." });
      }
    } catch (error) {
      setFeedback({ error: error.message, message: "" });
    }
  };

  return (
    <>
      <p className="panel-copy">Rename categories across inventory history, or delete one by moving its records to another category. General Materials is the default and cannot be renamed or deleted.</p>
      <form className="form-row inventory-stock__form" onSubmit={(event) => submit(event, "add")}>
        <label>New category<input className="input-field" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} required /></label>
        <button className="secondary-btn" type="submit">Add category</button>
      </form>
      <form className="form-row inventory-stock__form" onSubmit={(event) => submit(event, "rename")}>
        <label>Category to rename<select className="input-field" value={categoryToRename} onChange={(event) => setCategoryToRename(event.target.value)} required>
          <option value="">Select category</option>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Rename category to<input className="input-field" value={renamedCategory} onChange={(event) => setRenamedCategory(event.target.value)} required /></label>
        <button className="secondary-btn" type="submit">Rename category</button>
      </form>
      <form className="form-row inventory-stock__form" onSubmit={(event) => submit(event, "delete")}>
        <label>Category to delete<select className="input-field" value={categoryToDelete} onChange={(event) => {
          const value = event.target.value;
          setCategoryToDelete(value);
          if (replacement === value) setReplacement("");
        }} required>
          <option value="">Select category</option>{inventoryCategories.filter((name) => name !== "General Materials").map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Move records to<select className="input-field" value={replacement} onChange={(event) => setReplacement(event.target.value)} required>
          <option value="">Select replacement</option>{inventoryCategories.filter((name) => name !== categoryToDelete).map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <button className="secondary-btn" type="submit">Delete category</button>
      </form>
      {onAssign ? <form className="form-row inventory-stock__form" onSubmit={(event) => submit(event, "assign")}>
        <label>Category for selected receipt<select className="input-field" value={categoryToAssign} onChange={(event) => setCategoryToAssign(event.target.value)} required>
          <option value="">Select category</option>{inventoryCategories.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
        <button className="secondary-btn" type="submit" disabled={selectedCount !== 1}>Update selected receipt category</button>
      </form> : null}
      {feedback.error || feedback.message ? <p role={feedback.error ? "alert" : "status"}>{feedback.error || feedback.message}</p> : null}
    </>
  );
}
