const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const apiRouter = require("./routes/api");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/easyprocure")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// API routes
app.use("/api", apiRouter);

// Test route
app.get("/", (req, res) => {
  res.send("Easy‑Procure Backend Running");
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));
