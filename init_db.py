import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 5432))
}

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

def init_db():
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cur:
                cur.execute(CREATE_TABLE_SQL)
                conn.commit()
        print("✅ Sales table created successfully!")
    except Exception as e:
        print(f"❌ Error creating table: {e}")

if __name__ == "__main__":
    init_db()
