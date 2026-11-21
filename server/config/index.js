const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Pool } = require("pg");

const database =
  process.env.NODE_ENV === "test"
    ? process.env.POSTGRES_DB_TEST
    : process.env.POSTGRES_DB;

const connectionString = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${database}`;
const pool = new Pool({
  connectionString,
  /*
    SSL is not supported in development
    */
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
