"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgpool = void 0;
const pg_1 = require("pg");
exports.pgpool = new pg_1.Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
});
