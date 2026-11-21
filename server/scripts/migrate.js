/* eslint-disable no-console -- CLI script: output goes to stdout, collected by CloudWatch */
const fs = require("fs");
const path = require("path");
const db = require("../config");

(async () => {
  try {
    const { rows } = await db.query(
      "SELECT to_regclass('public.users') AS users_table"
    );
    if (rows[0].users_table) {
      console.log("Schema already exists, nothing to do");
    } else {
      const sql = fs.readFileSync(
        path.join(__dirname, "../config/init.sql"),
        "utf8"
      );
      await db.query(sql);
      console.log("Schema loaded");
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
