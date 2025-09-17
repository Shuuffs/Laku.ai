from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import os, re, json
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import google.generativeai as genai
from datetime import datetime

# ---------------- Flask Setup ----------------
app = Flask(__name__)
CORS(app)

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
            cur.execute(
                "INSERT INTO sales (item_name, quantity, price) VALUES (%s,%s,%s) RETURNING *;",
                (item_name, quantity, price)
            )
            return cur.fetchone()

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

# ---------------- Routes ----------------
@app.route("/")
def home():
    return render_template("index.html")

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
@app.route("/api/sales", methods=["POST"])
def add_sale():
    data = request.get_json()
    
    # Handle direct form submission
    if 'item_name' in data and 'quantity' in data and 'price' in data:
        item_name = data['item_name']
        quantity = data['quantity']
        price = data['price']
    # Handle text input (for AI assistant)
    elif 'text' in data:
        item_name, quantity, price = parse_sales_input(data['text'])
        if not item_name:
            return jsonify({"error": "Cannot parse sale input."}), 400
    else:
        return jsonify({"error": "Invalid request format. Provide either text or item details."}), 400
    
    try:
        sale = insert_sale(item_name, quantity, price)
        sales = fetch_sales()
        summary = compute_summary(sales)
        return jsonify({"sale": sale, "summary": summary, "message": "Sale recorded successfully!"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

# ---------------- AI Assistant ----------------
@app.route("/ai", methods=["POST"])
def ai_assistant():
    user_text = request.json.get("user_text")
    if not user_text:
        return jsonify({"error":"No input"}), 400

    if not GEMINI_API_KEY:
        return jsonify({"ai_response":"⚠️ Gemini unavailable. Enter sales manually."}), 200

    system_prompt = """You are **Laku**, a friendly Bruneian AI assistant built by Team Katalis to help small businesses track sales and gain insights.

## Persona:
- Your name: **Laku**
- Style: Friendly, short, encouraging, and conversational.  

## Core Rules:
1. **Always output valid JSON for commands (inside triple backticks).**
2. For monetary values, use numbers without currency symbols.
3. For quantities, use whole numbers.
4. Use the exact action names and field names as specified below.
5. Respond in the same language as the user's message (English or Malay).
6. Match the user's language (English or Malay) in your responses.

## Message Handling:
1. **Always decide if a message is SALES-related or CHAT-related.**
   - SALES: Messages about items, quantities, prices, times, or requests for summaries.  
   - CHAT: Normal conversation, greetings, or general questions not related to sales.

## SALES Commands:
1. Add a sale:
   ```json
   {
     "action": "add_sale",
     "item_name": "product name",
     "quantity": 1,
     "price": 9.99,
     "currency": "BND",
     "message": "Friendly confirmation message"
   }
   ```

2. Get sales summary:
   ```json
   {
     "action": "get_summary",
     "currency": "BND",
     "message": "Summary of sales data"
   }
   ```

3. Delete all sales:
   ```json
   {
     "action": "remove_sale",
     "sale_id": "all",
     "confirmed": true,
     "message": "All sales have been deleted successfully"
   }
   ```

4. Delete a specific sale:
   ```json
   {
     "action": "remove_sale",
     "sale_id": "123",
     "message": "Sale #123 has been deleted"
   }
   ```

5. Convert currency:
   ```json
   {
     "action": "convert_currency",
     "amount": 100,
     "from_currency": "USD",
     "to_currency": "BND",
     "message": "Conversion details"
   }
   ```

6. For casual conversation or questions:
   ```json
   {
     "action": "chat",
     "message": "Your friendly reply here"
   }
   ```

## Response Formatting:
- ALWAYS return valid JSON, no extra text outside the JSON.
- Keep messages in user's language with casual Bruneian tone, short and friendly, with emojis.
- Examples: 
  - "Noted! 3 nasi katok sudah dicatat 👍"
  - "Ok, added your kuih muih 🍪"
  - "⚠️ Are you sure you want to delete ALL sales? This cannot be undone!"
  - "✅ Sale #123 has been removed"

## Safety Guidelines:
- Always confirm before deleting multiple or all records
- Never delete data without explicit user confirmation
- If unsure about a command, ask for clarification
- Be extra careful with destructive operations

User: """ + user_text + """
"""

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(system_prompt)
        ai_response = response.text.strip()
        
        # Try to extract JSON from code blocks
        import re
        json_match = re.search(r'```(?:json\n)?(.*?)\n```', ai_response, re.DOTALL)
        
        if json_match:
            try:
                response_data = json.loads(json_match.group(1).strip())
                action = response_data.get("action")
                
                if action == "add_sale":
                    # Add the sale to the database
                    item_name = response_data.get("item_name")
                    quantity = response_data.get("quantity")
                    price = response_data.get("price")
                    
                    if item_name and quantity is not None and price is not None:
                        sale = insert_sale(item_name, quantity, price)
                        if sale:
                            return jsonify({
                                "ai_response": response_data.get("message", "✅ Sale added successfully!"),
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
