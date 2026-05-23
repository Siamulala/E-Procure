const mongoose = require("mongoose");

const PurchaseSchema = new mongoose.Schema({
  supplierID: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
  itemID: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory" },
  supplier: String,
  item: String,
  description: String,
  quantityRequested: Number,
  quantityPurchased: Number,
  price: Number,
  units: String,
  preparedBy: String,
  directorApproval: String,
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Purchase", PurchaseSchema);
