const express = require("express");
const { ratifyPay, loadRecords } = require("./ratify");

const app = express();
app.use(express.json());

// The agent sends a quote here and asks Ratify to pay it
app.post("/pay", async function (req, res) {
  const entry = await ratifyPay(req.body);
  res.json(entry);
});

// Anyone can see the full payment record
app.get("/records", function (req, res) {
  res.json(loadRecords());
});

app.listen(3000, function () {
  console.log("Ratify is running at http://localhost:3000");
});