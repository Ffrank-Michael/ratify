const fs = require("fs");
fs.rmSync("records.json", { force: true });
console.log("Payment record cleared. Ratify starts fresh.");