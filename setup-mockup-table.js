const fs = require("fs");
const path = require("path");

// Read the SQL file
const sqlFile = path.join(__dirname, "create-mockup-job-table.sql");
const sql = fs.readFileSync(sqlFile, "utf8");

console.log("Setting up MockupJob table...");
console.log("Please run this SQL manually in your Supabase dashboard:");
console.log("=====================================");
console.log(sql);
console.log("=====================================");
console.log("\nAfter running the SQL, you can test the setup by running:");
console.log("node test-mockup-job-manager.js");
