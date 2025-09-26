import os
import psycopg2
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 5432))
}

# SQL to create tables
CREATE_TABLES_SQL = """
-- Sales table to track all sales transactions
CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    item_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * price) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Storage table for inventory management
CREATE TABLE IF NOT EXISTS storage (
    item_id SERIAL PRIMARY KEY,
    item_name TEXT NOT NULL UNIQUE,
    quantity INTEGER NOT NULL DEFAULT 0,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_storage_item_name ON storage(LOWER(item_name));
"""



def init_db():
    """Initialize the database with required tables and sample data."""
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            conn.autocommit = False
            with conn.cursor() as cur:
                # Create tables
                cur.execute(CREATE_TABLES_SQL)
                
                conn.commit()
                print("✅ Database initialized successfully!")
                
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        if 'conn' in locals():
            conn.rollback()
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        if 'conn' in locals():
            conn.rollback()
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("🚀 Initializing Laku.ai database...")
    init_db()
    print("✨ Database setup completed!")
