import { Pool } from 'pg'

export const pgpool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
})