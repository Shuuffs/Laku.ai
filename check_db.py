import psycopg2
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def check_database():
    try:
        conn = psycopg2.connect(
            dbname=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", 5432)
        )
        
        with conn.cursor() as cur:
            # Check if sales table exists
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'sales';
            """)
            table_exists = cur.fetchone()
            
            if table_exists:
                print("✅ Sales table exists")
                # Count records in sales table
                cur.execute("SELECT COUNT(*) as count FROM sales;")
                count = cur.fetchone()
                print(f"📊 Found {count[0]} sales records")
                
                # Show first 5 records
                if count[0] > 0:
                    cur.execute("SELECT * FROM sales ORDER BY id DESC LIMIT 5;")
                    print("\nRecent sales:")
                    for row in cur.fetchall():
                        print(f"- ID: {row[0]}, Item: {row[1]}, Qty: {row[2]}, Price: {row[3]}, Date: {row[4]}")
            else:
                print("❌ Sales table does not exist")
                print("\nCreating sales table...")
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS sales (
                        id SERIAL PRIMARY KEY,
                        item_name TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        price NUMERIC NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                conn.commit()
                print("✅ Created sales table")
                
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    check_database()
