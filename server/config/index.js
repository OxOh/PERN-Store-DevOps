const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Pool } = require("pg");

const database =
  process.env.NODE_ENV === "test"
    ? process.env.POSTGRES_DB_TEST
    : process.env.POSTGRES_DB;

const password = encodeURIComponent(process.env.POSTGRES_PASSWORD || "");
const connectionString = `postgresql://${process.env.POSTGRES_USER}:${password}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${database}`;

const pool = new Pool({
  connectionString,
  // TLS is enabled with POSTGRES_SSL=true (production on RDS). The server
  // certificate is verified against the bundled Amazon RDS CA certificates.
  ssl:
    process.env.POSTGRES_SSL === "true"
      ? {
          ca: fs
            .readFileSync(path.join(__dirname, "../certs/rds-global-bundle.pem"))
            .toString(),
        }
      : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  end: () => pool.end(),
};
