const express = require("express");
const router = express.Router();
const Supplier = require("../models/Supplier");
const Inventory = require("../models/Inventory");
const Order = require("../models/Order");
const Purchase = require("../models/Purchase");

// Suppliers
router.get("/suppliers", async (req, res) => {
  const suppliers = await Supplier.find();
  res.json(suppliers);
});
router.post("/suppliers", async (req, res) => {
  const newSupplier = new Supplier(req.body);
  await newSupplier.save();
  res.json(newSupplier);
});

// Inventory
router.get("/inventory", async (req, res) => {
  const items = await Inventory.find();
  res.json(items);
});
router.post("/inventory", async (req, res) => {
  const newItem = new Inventory(req.body);
  await newItem.save();
  res.json(newItem);
});

// Orders
router.get("/orders", async (req, res) => {
  const orders = await Order.find().populate("itemID");
  res.json(orders);
});
router.post("/orders", async (req, res) => {
  const newOrder = new Order(req.body);
  await newOrder.save();
  res.json(newOrder);
});

// Purchases
router.get("/purchases", async (req, res) => {
  const purchases = await Purchase.find().populate("supplierID").populate("itemID");
  res.json(purchases);
});
router.post("/purchases", async (req, res) => {
  const newPurchase = new Purchase(req.body);
  await newPurchase.save();
  res.json(newPurchase);
});

module.exports = router;
