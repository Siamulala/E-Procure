const mongoose = require("mongoose");

const InventorySchema = new mongoose.Schema({
  item: String,
  quantity: Number,
  unit: String,
  itemID: { type: mongoose.Schema.Types.ObjectId, auto: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Inventory", InventorySchema);
