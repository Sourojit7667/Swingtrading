from flask import Flask, request, jsonify, session, render_template
from database import init_db, get_db
import functools
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("ADMIN_SECRET_KEY")

ADMIN_EMAIL =  os.getenv("ADMIN_EMAIL")  
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")           

init_db()

def admin_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "Unauthorized. Admin access required."}), 403
        return f(*args, **kwargs)
    return wrapper


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data  = request.get_json()
    email = data.get("email", "").strip().lower()
    pwd   = data.get("password", "").strip()

    if email == ADMIN_EMAIL.lower() and pwd == ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"success": True, "message": "Admin logged in."})
    return jsonify({"success": False, "message": "Invalid credentials."}), 401

@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("is_admin", None)
    return jsonify({"success": True})

@app.route("/api/admin/status")
def admin_status():
    return jsonify({"is_admin": session.get("is_admin", False)})

@app.route("/api/stats")
def get_stats():
    db = get_db()
    total_trades  = db.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    target_hits   = db.execute("SELECT COUNT(*) FROM target_hit").fetchone()[0]
    stop_losses   = db.execute("SELECT COUNT(*) FROM stop_loss").fetchone()[0]
    accuracy      = round((target_hits / total_trades * 100), 1) if total_trades > 0 else 0.0
    db.close()
    return jsonify({
        "total_trades": total_trades,
        "target_hits":  target_hits,
        "stop_losses":  stop_losses,
        "accuracy":     accuracy
    })

@app.route("/api/trades/running")
def running_trades():
    db  = get_db()
    
    rows = db.execute("""
        SELECT t.id, t.stock_name, t.created_at
        FROM trades t
        WHERE t.id NOT IN (SELECT trade_id FROM stop_loss)
          AND t.id NOT IN (SELECT trade_id FROM target_hit)
        ORDER BY t.created_at DESC
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/trades/all")
def all_trades():
    db   = get_db()
    rows = db.execute("""
        SELECT
            t.id,
            t.stock_name,
            t.created_at,
            CASE
                WHEN sl.trade_id IS NOT NULL THEN 'stop_loss'
                WHEN th.trade_id IS NOT NULL THEN 'target_hit'
                ELSE 'running'
            END AS status,
            th.return_percentage
        FROM trades t
        LEFT JOIN stop_loss sl ON sl.trade_id = t.id
        LEFT JOIN target_hit th ON th.trade_id = t.id
        ORDER BY t.created_at DESC
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/trades/add", methods=["POST"])
@admin_required
def add_trade():
    data       = request.get_json()
    stock_name = data.get("stock_name", "").strip().upper()
    if not stock_name:
        return jsonify({"error": "Stock name is required."}), 400
    db = get_db()
    db.execute("INSERT INTO trades (stock_name) VALUES (?)", (stock_name,))
    db.commit()
    db.close()
    return jsonify({"success": True, "message": f"Trade '{stock_name}' added."})


@app.route("/api/trades/target-hit", methods=["POST"])
@admin_required
def mark_target_hit():
    data              = request.get_json()
    trade_id          = data.get("trade_id")
    return_percentage = data.get("return_percentage")

    if not trade_id or return_percentage is None:
        return jsonify({"error": "trade_id and return_percentage are required."}), 400

    try:
        return_percentage = float(return_percentage)
    except (ValueError, TypeError):
        return jsonify({"error": "return_percentage must be a number."}), 400

    db = get_db()
    
    trade = db.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
    if not trade:
        db.close()
        return jsonify({"error": "Trade not found."}), 404

    already_sl = db.execute("SELECT 1 FROM stop_loss WHERE trade_id = ?", (trade_id,)).fetchone()
    already_th = db.execute("SELECT 1 FROM target_hit WHERE trade_id = ?", (trade_id,)).fetchone()
    if already_sl or already_th:
        db.close()
        return jsonify({"error": "Trade is already resolved."}), 400

    db.execute(
        "INSERT INTO target_hit (trade_id, stock_name, return_percentage) VALUES (?, ?, ?)",
        (trade_id, trade["stock_name"], return_percentage)
    )
    db.commit()
    db.close()
    return jsonify({"success": True, "message": "Trade marked as Target Hit."})


@app.route("/api/trades/stop-loss", methods=["POST"])
@admin_required
def mark_stop_loss():
    data     = request.get_json()
    trade_id = data.get("trade_id")
    if not trade_id:
        return jsonify({"error": "trade_id is required."}), 400

    db    = get_db()
    trade = db.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
    if not trade:
        db.close()
        return jsonify({"error": "Trade not found."}), 404

    already_sl = db.execute("SELECT 1 FROM stop_loss WHERE trade_id = ?", (trade_id,)).fetchone()
    already_th = db.execute("SELECT 1 FROM target_hit WHERE trade_id = ?", (trade_id,)).fetchone()
    if already_sl or already_th:
        db.close()
        return jsonify({"error": "Trade is already resolved."}), 400

    db.execute(
        "INSERT INTO stop_loss (trade_id, stock_name) VALUES (?, ?)",
        (trade_id, trade["stock_name"])
    )
    db.commit()
    db.close()
    return jsonify({"success": True, "message": "Trade marked as Stop Loss."})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
