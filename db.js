import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    const countResult = await client.query('SELECT COUNT(*) AS count FROM tasks');
    const count = parseInt(countResult.rows[0].count, 10);

    if (count === 0) {
      await client.query(`
        INSERT INTO tasks (title, done) 
        VALUES 
          ('Setup project repository', TRUE),
          ('Design REST API routing', FALSE),
          ('Integrate Swagger documentation', FALSE)
      `);
    }
  } finally {
    client.release();
  }
}

export default pool;