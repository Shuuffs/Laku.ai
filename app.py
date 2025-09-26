from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from flask_cors import CORS
import os, re, json
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import google.generativeai as genai
from datetime import datetime, timedelta
from functools import wraps

# ---------------- Flask Setup ----------------
app = Flask(__name__)
CORS(app)
app.secret_key = os.getenv('SECRET_KEY', 'dev_key_for_testing_only')
app.permanent_session_lifetime = timedelta(days=1)  # Session expires after 1 day

# ---------------- Load Gemini ----------------
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ---------------- Database Config ----------------
DB_CONFIG = {
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", 5432))
}

# ---------------- Helper Functions ----------------
def get_db_connection():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)

def get_item_price(item_name):
    """Get the price of an item from the inventory."""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT price FROM storage WHERE LOWER(item_name) = LOWER(%s)", (item_name,))
            result = cur.fetchone()
            return float(result['price']) if result else None

def fetch_sales():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM sales ORDER BY id DESC;")
            return cur.fetchall()

def delete_sale(sale_id):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if str(sale_id).lower() == 'all':
                cur.execute("DELETE FROM sales RETURNING id;")
                deleted = cur.fetchall()
                conn.commit()
                return {"message": "All sales have been deleted", "deleted_count": len(deleted)}
            else:
                cur.execute("DELETE FROM sales WHERE id = %s RETURNING *;", (sale_id,))
                deleted = cur.fetchone()
                conn.commit()
                if deleted:
                    return {"message": f"Sale #{sale_id} has been deleted", "deleted_sale": deleted}
                else:
                    return {"error": f"No sale found with ID {sale_id}"}

def insert_sale(item_name, quantity, price):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # First check if we have enough quantity in stock
            cur.execute(
                "SELECT quantity FROM storage WHERE LOWER(item_name) = LOWER(%s) FOR UPDATE;",
                (item_name,)
            )
            stock = cur.fetchone()
            
            if not stock:
                raise ValueError(f"Item '{item_name}' not found in inventory")
                
            current_quantity = stock['quantity']
            if current_quantity < quantity:
                raise ValueError(f"Insufficient stock for '{item_name}'. Available: {current_quantity}, Requested: {quantity}")
            
            # Insert the sale
            cur.execute(
                "INSERT INTO sales (item_name, quantity, price) VALUES (%s, %s, %s) RETURNING *;",
                (item_name, float(quantity), float(price))
            )
            result = cur.fetchone()
            
            # Update the storage quantity
            cur.execute(
                "UPDATE storage SET quantity = quantity - %s WHERE LOWER(item_name) = LOWER(%s) RETURNING quantity;",
                (quantity, item_name)
            )
            updated_stock = cur.fetchone()
            
            conn.commit()
            return result

def delete_sale(sale_id):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if sale_id.lower() == 'all':
                cur.execute("DELETE FROM sales;")
                return {"message": "All sales have been deleted", "deleted_count": cur.rowcount}
            else:
                cur.execute("DELETE FROM sales WHERE id = %s RETURNING *;", (sale_id,))
                deleted = cur.fetchone()
                if deleted:
                    return {"message": f"Sale #{sale_id} has been deleted", "deleted_sale": deleted}
                else:
                    return {"error": f"No sale found with ID {sale_id}"}

def parse_sales_input(text):
    """
    Parse input like "Sold 3 eggs for $5" -> item_name="eggs", quantity=3, price=5
    """
    match = re.search(r"(\d+)\s+(\w+).*?\$?(\d+\.?\d*)", text.lower())
    if match:
        quantity = int(match.group(1))
        item_name = match.group(2)
        price = float(match.group(3))
        return item_name, quantity, price
    return None, None, None

def compute_summary(sales):
    if not sales:
        return {
            "total_revenue": 0,
            "total_sales_count": 0,
            "avg_order_value": 0,
            "best_selling_item": None,
            "best_selling_quantity": 0,
            "items_sold": {},
            "hourly_sales": {hour: 0 for hour in range(24)},
            "recent_sales": []
        }
    
    # Calculate basic metrics
    total_revenue = sum(sale['quantity'] * sale['price'] for sale in sales)
    total_sales_count = sum(sale['quantity'] for sale in sales)
    avg_order_value = total_revenue / len(sales) if sales else 0
    
    # Calculate best selling items
    items_sold = {}
    for sale in sales:
        items_sold[sale['item_name']] = items_sold.get(sale['item_name'], 0) + sale['quantity']
    
    best_selling_item = max(items_sold.items(), key=lambda x: x[1]) if items_sold else (None, 0)
    
    # Calculate hourly sales distribution
    hourly_sales = {hour: 0 for hour in range(24)}
    for sale in sales:
        hour = sale['created_at'].hour
        hourly_sales[hour] += sale['quantity']
    
    # Get recent sales (last 5)
    recent_sales = sorted(sales, key=lambda x: x['created_at'], reverse=True)[:5]
    
    return {
        "total_revenue": total_revenue,
        "total_sales_count": total_sales_count,
        "avg_order_value": avg_order_value,
        "best_selling_item": best_selling_item[0],
        "best_selling_quantity": best_selling_item[1],
        "items_sold": items_sold,
        "hourly_sales": hourly_sales,
        "recent_sales": [{
            'item_name': s['item_name'],
            'quantity': s['quantity'],
            'price': float(s['price']),
            'total': float(s['quantity'] * s['price']),
            'time': s['created_at'].strftime('%H:%M')
        } for s in recent_sales]
    }

# ---------------- Helper Functions ----------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

# ---------------- Routes ----------------
@app.route("/")
@login_required
def home():
    return render_template("index.html")

@app.route("/login", methods=['GET', 'POST'])
def login():
    # If already logged in, redirect to home
    if 'logged_in' in session:
        return redirect(url_for('home'))
        
    if request.method == 'POST':
        # Set session as logged in (no validation)
        session.permanent = True
        session['logged_in'] = True
        session['username'] = request.form.get('username', 'User')
        
        # Redirect to next URL if provided, otherwise go to home
        next_url = request.args.get('next') or url_for('home')
        return redirect(next_url)
    
    # GET request - show login form
    return render_template("login.html")

@app.route("/logout")
def logout():
    # Remove user from session
    session.pop('logged_in', None)
    session.pop('username', None)
    return redirect(url_for('login'))

@app.route('/api/sales/<sale_id>', methods=['DELETE'])
def delete_sale_route(sale_id):
    try:
        result = delete_sale(sale_id)
        if 'error' in result:
            return jsonify({"status": "error", "message": result['error']}), 404
        return jsonify({"status": "success", "message": result['message']}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/sales', methods=['GET'])
def get_sales():
    try:
        sales = fetch_sales()
        summary = compute_summary(sales)
        return jsonify(sales), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/sales", methods=["POST"])
@app.route('/api/sales', methods=['POST'])
def add_sale():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided in request"}), 400
            
        # Handle both text input and direct item details
        if 'text' in data:
            # Parse text input (e.g., "Sold 3 eggs for $5")
            text = data['text'].strip()
            item_name, quantity, price = parse_sales_input(text)
            if not all([item_name, quantity, price]):
                return jsonify({"error": "Could not parse sale from text. Please provide item_name, quantity, and price."}), 400
        else:
            # Handle direct item details
            item_name = data.get('item_name')
            quantity = data.get('quantity')
            price = data.get('price')
            if not all([item_name, quantity, price]):
                return jsonify({
                    "error": "Missing required fields. Please provide item_name, quantity, and price.",
                    "example": {
                        "item_name": "Product Name",
                        "quantity": 1,
                        "price": 9.99
                    }
                }), 400
        
        # Convert to proper types
        try:
            quantity = int(quantity)
            price = float(price)
            if quantity <= 0 or price <= 0:
                raise ValueError("Quantity and price must be positive numbers")
        except (ValueError, TypeError) as e:
            return jsonify({"error": "Invalid quantity or price format. Must be positive numbers."}), 400
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # First check if item exists and get current stock
                cur.execute(
                    "SELECT item_id, item_name, quantity FROM storage WHERE LOWER(item_name) = LOWER(%s) FOR UPDATE;",
                    (item_name,)
                )
                item = cur.fetchone()
                
                if not item:
                    return jsonify({
                        "error": f"Item '{item_name}' not found in inventory. Please add it to inventory first.",
                        "suggestion": "Check your spelling or add the item to inventory first."
                    }), 404
                
                # Check if we have enough stock
                if item['quantity'] < quantity:
                    return jsonify({
                        "error": f"Insufficient stock for '{item['item_name']}'. Available: {item['quantity']}, Requested: {quantity}",
                        "item_id": item['item_id'],
                        "available_quantity": item['quantity'],
                        "requested_quantity": quantity
                    }), 400
                
                # Record the sale
                cur.execute(
                    "INSERT INTO sales (item_name, quantity, price) VALUES (%s, %s, %s) RETURNING *;",
                    (item_name, quantity, price)
                )
                sale = cur.fetchone()
                
                # Update the inventory
                cur.execute(
                    "UPDATE storage SET quantity = quantity - %s WHERE item_id = %s RETURNING quantity;",
                    (quantity, item['item_id'])
                )
                updated_stock = cur.fetchone()
                
                # Get updated sales summary
                cur.execute("""
                    SELECT 
                        COUNT(*) as total_sales,
                        SUM(quantity) as total_items_sold,
                        SUM(quantity * price) as total_revenue
                    FROM sales
                """)
                summary = cur.fetchone()
                
                conn.commit()
                
                # Get updated inventory for the sold item
                cur.execute(
                    "SELECT * FROM storage WHERE item_id = %s",
                    (item['item_id'],)
                )
                updated_item = cur.fetchone()
                
                return jsonify({
                    "success": True,
                    "sale": dict(sale) if sale else None,
                    "inventory_update": {
                        "item_id": item['item_id'],
                        "item_name": item['item_name'],
                        "previous_quantity": item['quantity'],
                        "new_quantity": updated_stock['quantity'],
                        "quantity_sold": quantity,
                        "updated_item": dict(updated_item) if updated_item else None
                    },
                    "summary": dict(summary) if summary else {},
                    "message": f"Successfully recorded sale: {quantity}x {item_name} at ${price:.2f} each"
                }), 201
        
    except Exception as e:
        # Log the error for debugging
        app.logger.error(f"Error in add_sale: {str(e)}")
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "An error occurred while processing your sale. Please try again."
        }), 500

@app.route("/api/analytics")
def get_analytics():
    try:
        sales = fetch_sales()
        analytics = compute_summary(sales)
        return jsonify({
            "success": True,
            "analytics": analytics
        }), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# ---------------- Items API ----------------
@app.route('/api/items', methods=['GET', 'POST'])
def handle_items():
    if request.method == 'GET':
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT * FROM storage ORDER BY item_name")
                    items = cur.fetchall()
                    return jsonify(items)
        except Exception as e:
            app.logger.error(f"Error fetching items: {str(e)}")
            return jsonify({"error": "Failed to fetch items"}), 500

    elif request.method == 'POST':
        # Add a new item
        try:
            data = request.get_json()
            item_name = data.get('item_name')
            price = data.get('price')
            
            if not item_name or price is None:
                return jsonify({"error": "Item name and price are required"}), 400
                
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Check if item already exists
            cursor.execute("SELECT * FROM storage WHERE LOWER(item_name) = LOWER(%s)", (item_name,))
            if cursor.fetchone():
                return jsonify({"error": "An item with this name already exists"}), 400
            
            # Insert new item
            # Default quantity to 1 if not provided
            quantity = request.json.get('quantity', 1)
            cursor.execute(
                "INSERT INTO storage (item_name, price, quantity) VALUES (%s, %s, %s) RETURNING item_id, item_name, price, quantity",
                (item_name, price, quantity)
            )
            new_item = cursor.fetchone()
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return jsonify({
                "message": "Item added successfully",
                "item": dict(new_item) if new_item else None
            }), 201
            
        except Exception as e:
            print(f"Error adding item: {str(e)}")
            return jsonify({"error": "Failed to add item"}), 500

@app.route('/api/inventory/chart-data', methods=['GET'])
def get_inventory_chart_data():
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT item_name as name, quantity 
                    FROM storage 
                    WHERE quantity > 0
                    ORDER BY quantity DESC
                """)
                items = cur.fetchall()
                return jsonify({
                    "success": True,
                    "data": items
                })
    except Exception as e:
        app.logger.error(f"Error fetching inventory chart data: {str(e)}")
        return jsonify({"success": False, "error": "Failed to fetch inventory data"}), 500

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Check if item exists
        cursor.execute("SELECT * FROM storage WHERE item_id = %s", (item_id,))
        item = cursor.fetchone()
        
        if not item:
            return jsonify({"error": "Item not found"}), 404
        
        # Check if item is referenced in sales
        cursor.execute("SELECT COUNT(*) FROM sales WHERE item_name = %s", (item['item_name'],))
        sales_count = cursor.fetchone()['count']
        
        if sales_count > 0:
            return jsonify({
                "error": "Cannot delete item with existing sales records. Delete the sales first."
            }), 400
        
        # Delete the item
        cursor.execute("DELETE FROM storage WHERE item_id = %s", (item_id,))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Item deleted successfully"}), 200
        
    except Exception as e:
        print(f"Error deleting item: {str(e)}")
        return jsonify({"error": "Failed to delete item"}), 500

# ---------------- AI Assistant ----------------
@app.route("/ai", methods=["POST"])
def ai_assistant():
    user_text = request.json.get("user_text")
    if not user_text:
        return jsonify({"error":"No input"}), 400

    if not GEMINI_API_KEY:
        return jsonify({"ai_response":"⚠️ Gemini unavailable. Enter sales manually."}), 200

    system_prompt = """
You are **Laku**, a friendly Bruneian AI assistant built by Team Katalis to help small businesses track sales and manage inventory.

 Core Rules
1. **Always output valid JSON only** (inside triple backticks). No extra text outside JSON.
2. **Monetary values:** numbers only (no currency symbols).
3. **Quantities:** whole numbers only.
4. Use the **exact action names and field names** listed below.
5. Default currency: **BND (Brunei Dollar)** unless specified.
6. **Language:** Match user's language (English or Malay).
7. **Multiple items:**
   - Parse items separated by commas, "and", or newlines.
   - Support multiple formats: 
     - `1 item1, 2 item2`
     - `1x item1, 2x item2`
     - `item1 x1, item2 x2`
     - `add 3 of item1 and 2 of item2`
   - Always use the `items` array format in JSON when multiple items are present.
   - **Do not ask user for missing prices.** Always assume the price exists in the storage table and will be retrieved automatically.
   - Provide a total price in the confirmation message when multiple items are added.

 Available Actions

 1. Sales Management
- **Add Sale (single or multiple items):**
  - Single item:
  ```json
  {
    "action": "add_sale",
    "item_name": "product name",
    "quantity": 1,
    "currency": "BND",
    "message": "Friendly confirmation message"
  }
  ```
  - Multiple items (preferred format):
  ```json
  {
    "action": "add_sale",
    "items": [
      {"item_name": "product 1", "quantity": 1},
      {"item_name": "product 2", "quantity": 2}
    ],
    "currency": "BND",
    "message": "Friendly confirmation message for multiple items"
  }
  ```

- **Remove Sale:**
  - Remove specific sale: 
    ```json
    {"action": "remove_sale", "sale_id": 123, "message": "..."}
    ```
  - Remove all sales: 
    ```json
    {"action": "remove_sale", "sale_id": "all", "confirmed": true, "message": "..."}
    ```

- **Get Sales Summary:**
  ```json
  {
    "action": "get_summary",
    "currency": "BND",
    "message": "Sales summary for today"
  }
  ```

 2. Inventory Management
- **Add New Item to Inventory:**
  ```json
  {
    "action": "add_inventory",
    "item_name": "product name",
    "price": 5.00,
    "quantity": 10,
    "message": "Added new item to inventory"
  }
  ```

- **Update Inventory Item:**
  ```json
  {
    "action": "update_inventory",
    "item_id": 1,
    "item_name": "updated name",
    "price": 6.00,
    "quantity": 15,
    "message": "Updated item details"
  }
  ```

- **Remove Item from Inventory:**
  ```json
  {
    "action": "remove_inventory",
    "item_id": 1,
    "message": "Item removed from inventory"
  }
  ```

- **List Inventory:**
  ```json
  {
    "action": "list_inventory",
    "message": "Current inventory items"
  }
  ```

 3. General
- **Chat/General Response:**
  ```json
  {
    "action": "chat",
    "message": "Your friendly response here"
  }
  ```

 Examples

 Adding Multiple Sales (with prices from storage table)
```json
{
  "function_call": [
    {"action": "add_sale", "item_name": "nasi_lemak", "quantity": 2, "currency": "BND", "message": "2 nasi lemak added"},
    {"action": "add_sale", "item_name": "teh_tarik", "quantity": 1, "currency": "BND", "message": "1 teh tarik added"}
  ],
  "reply": "✅ Added 2 nasi lemak and 1 teh tarik. Total will be retrieved based on stored prices."
}
```

 Adding New Inventory
```json
{
  "action": "add_inventory",
  "item_name": "ayam_penyet",
  "price": 6.50,
  "quantity": 20,
  "message": "Added 20 ayam penyet to inventory at BND 6.50 each"
}
```
"""


    try:
        # Add user's message to the prompt
        full_prompt = system_prompt + '\n\nUser: ' + user_text + '\n"""'
        
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(full_prompt)
        ai_response = response.text.strip()
        
        # Try to extract JSON from code blocks
        import re
        json_match = re.search(r'```(?:json\n)?(.*?)\n```', ai_response, re.DOTALL)
        
        if json_match:
            try:
                response_data = json.loads(json_match.group(1).strip())
                action = response_data.get("action")
                
                if action == "add_sale":
                    items = response_data.get("items")
                    if not items:
                        # Handle single item (backward compatibility)
                        items = [{
                            "item_name": response_data.get("item_name"),
                            "quantity": response_data.get("quantity"),
                            "price": response_data.get("price")
                        }]
                    
                    results = []
                    total_amount = 0
                    
                    for item in items:
                        item_name = item.get("item_name")
                        quantity = item.get("quantity")
                        price = item.get("price")
                        
                        if not item_name or quantity is None:
                            results.append(f"⚠️ Skipping item: Missing name or quantity")
                            continue
                        
                        # If price is not provided, try to get it from inventory
                        if price is None:
                            try:
                                price = get_item_price(item_name)
                                if price is None:
                                    results.append(f"⚠️ Could not find price for '{item_name}'. Please add it to inventory first.")
                                    continue
                            except Exception as e:
                                results.append(f"⚠️ Error getting price for '{item_name}': {str(e)}")
                                continue
                        
                        try:
                            sale = insert_sale(item_name, quantity, price)
                            if sale:
                                item_total = quantity * price
                                total_amount += item_total
                                results.append(f"✅ Added {quantity} {item_name} at BND {price:.2f} each (BND {item_total:.2f})")
                        except Exception as e:
                            results.append(f"⚠️ Error adding {quantity} {item_name}: {str(e)}")
                    
                    # Generate response message
                    if not results:
                        return jsonify({
                            "ai_response": "⚠️ No valid items to add. Please check your request.",
                            "action": "error"
                        })
                    
                    message = "\n".join(results)
                    if len(results) > 1:
                        message += f"\n\nTotal: BND {total_amount:.2f}"
                    
                    return jsonify({
                        "ai_response": response_data.get("message", message),
                        "action": "sale_added"
                    })
                
                elif action == "get_summary":
                    sales = fetch_sales()
                    summary = compute_summary(sales)
                    return jsonify({
                        "ai_response": response_data.get("message", "📊 Sales Summary"),
                        "action": "summary",
                        "summary": summary
                    })
                    
                elif action == "remove_sale":
                    sale_id = response_data.get("sale_id")
                    if not sale_id:
                        return jsonify({
                            "ai_response": "⚠️ Please specify a sale ID or 'all' to remove sales",
                            "action": "error"
                        })
                        
                    if sale_id == "all" and not response_data.get("confirmed"):
                        return jsonify({
                            "ai_response": "⚠️ Are you sure you want to delete ALL sales? This cannot be undone! Type 'yes, delete all' to confirm.",
                            "action": "confirm_delete_all"
                        })
                        
                    result = delete_sale(sale_id)
                    if "error" in result:
                        return jsonify({
                            "ai_response": f"❌ {result['error']}",
                            "action": "error"
                        })
                    
                    return jsonify({
                        "ai_response": f"✅ {result['message']}",
                        "action": "sale_deleted",
                        "result": result
                    })
                    
                elif action == "convert_currency":
                    amount = response_data.get("amount")
                    from_currency = response_data.get("from_currency")
                    to_currency = response_data.get("to_currency")
                    # TO DO: implement currency conversion logic
                    return jsonify({
                        "ai_response": response_data.get("message", "📊 Currency Conversion"),
                        "action": "convert_currency",
                        "amount": amount,
                        "from_currency": from_currency,
                        "to_currency": to_currency
                    })
                
                # Inventory Management Actions
                elif action == "add_inventory":
                    item_name = response_data.get("item_name")
                    price = response_data.get("price")
                    quantity = response_data.get("quantity", 1)
                    
                    if not item_name or price is None:
                        return jsonify({
                            "ai_response": "⚠️ Please provide both item name and price",
                            "action": "error"
                        })
                    
                    try:
                        with get_db_connection() as conn:
                            with conn.cursor() as cur:
                                # Check if item already exists
                                cur.execute("SELECT * FROM storage WHERE LOWER(item_name) = LOWER(%s)", (item_name,))
                                if cur.fetchone():
                                    return jsonify({
                                        "ai_response": f"⚠️ An item named '{item_name}' already exists in inventory",
                                        "action": "error"
                                    })
                                
                                # Add new item
                                cur.execute(
                                    "INSERT INTO storage (item_name, price, quantity) VALUES (%s, %s, %s) RETURNING *",
                                    (item_name, float(price), int(quantity))
                                )
                                new_item = cur.fetchone()
                                conn.commit()
                                
                                return jsonify({
                                    "ai_response": response_data.get("message", f"✅ Added {quantity} {item_name} to inventory at BND {price:.2f} each"),
                                    "action": "inventory_updated",
                                    "item": dict(new_item) if new_item else None
                                })
                    except Exception as e:
                        return jsonify({
                            "ai_response": f"⚠️ Failed to add item to inventory: {str(e)}",
                            "action": "error"
                        })
                
                elif action == "update_inventory":
                    item_id = response_data.get("item_id")
                    item_name = response_data.get("item_name")
                    price = response_data.get("price")
                    quantity = response_data.get("quantity")
                    
                    if not item_id or (not item_name and price is None and quantity is None):
                        return jsonify({
                            "ai_response": "⚠️ Please provide item_id and at least one field to update (item_name, price, or quantity)",
                            "action": "error"
                        })
                    
                    try:
                        with get_db_connection() as conn:
                            with conn.cursor() as cur:
                                # Build dynamic update query based on provided fields
                                update_fields = []
                                params = []
                                
                                if item_name is not None:
                                    update_fields.append("item_name = %s")
                                    params.append(item_name)
                                if price is not None:
                                    update_fields.append("price = %s")
                                    params.append(float(price))
                                if quantity is not None:
                                    update_fields.append("quantity = %s")
                                    params.append(int(quantity))
                                
                                params.append(item_id)  # For WHERE clause
                                
                                query = f"""
                                    UPDATE storage 
                                    SET {', '.join(update_fields)}
                                    WHERE item_id = %s
                                    RETURNING *
                                """
                                
                                cur.execute(query, params)
                                updated_item = cur.fetchone()
                                conn.commit()
                                
                                if not updated_item:
                                    return jsonify({
                                        "ai_response": f"⚠️ No item found with ID {item_id}",
                                        "action": "error"
                                    })
                                
                                return jsonify({
                                    "ai_response": response_data.get("message", f"✅ Updated item: {updated_item['item_name']}"),
                                    "action": "inventory_updated",
                                    "item": dict(updated_item) if updated_item else None
                                })
                    except Exception as e:
                        return jsonify({
                            "ai_response": f"⚠️ Failed to update inventory: {str(e)}",
                            "action": "error"
                        })
                
                elif action == "remove_inventory":
                    item_id = response_data.get("item_id")
                    
                    if not item_id:
                        return jsonify({
                            "ai_response": "⚠️ Please provide item_id to remove",
                            "action": "error"
                        })
                    
                    try:
                        with get_db_connection() as conn:
                            with conn.cursor() as cur:
                                # First get the item name for the response message
                                cur.execute("SELECT item_name FROM storage WHERE item_id = %s", (item_id,))
                                item = cur.fetchone()
                                
                                if not item:
                                    return jsonify({
                                        "ai_response": f"⚠️ No item found with ID {item_id}",
                                        "action": "error"
                                    })
                                
                                # Delete the item
                                cur.execute("DELETE FROM storage WHERE item_id = %s RETURNING *", (item_id,))
                                deleted_item = cur.fetchone()
                                conn.commit()
                                
                                return jsonify({
                                    "ai_response": response_data.get("message", f"✅ Removed {deleted_item['item_name']} from inventory"),
                                    "action": "inventory_updated",
                                    "item": dict(deleted_item) if deleted_item else None
                                })
                    except Exception as e:
                        return jsonify({
                            "ai_response": f"⚠️ Failed to remove item from inventory: {str(e)}",
                            "action": "error"
                        })
                
                elif action == "list_inventory":
                    try:
                        with get_db_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute("SELECT * FROM storage ORDER BY item_name")
                                items = [dict(item) for item in cur.fetchall()]
                                
                                return jsonify({
                                    "ai_response": response_data.get("message", "📋 Current Inventory"),
                                    "action": "list_inventory",
                                    "inventory": items
                                })
                    except Exception as e:
                        return jsonify({
                            "ai_response": f"⚠️ Failed to fetch inventory: {str(e)}",
                            "action": "error"
                        })
                
                # For chat responses or unrecognized actions
                return jsonify({
                    "ai_response": response_data.get("message", "I'm not sure how to respond to that."),
                    "action": "chat"
                })
                
            except json.JSONDecodeError as e:
                # If JSON parsing fails, return the raw AI response
                return jsonify({
                    "ai_response": f"⚠️ I had trouble processing that request. {str(e)}",
                    "action": "error"
                })
        
        # If no JSON found, return the raw response as a chat message
        return jsonify({
            "ai_response": ai_response,
            "action": "chat"
        })
            
    except Exception as e:
        return jsonify({
            "ai_response": f"⚠️ An error occurred: {str(e)}",
            "action": "error"
        }), 200

# ---------------- Run ----------------
if __name__ == "__main__":
    app.run(debug=True)
