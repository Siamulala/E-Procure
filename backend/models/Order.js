const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  itemID: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory" },
  department: String,
  technician: String,
  item: String,
  quantity: Number,
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Order", OrderSchema);
