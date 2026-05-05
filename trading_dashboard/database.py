import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "trading.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # ── Table 1: All Trades ──────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_name TEXT    NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # ── Table 2: Stop Loss ───────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stop_loss (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id   INTEGER NOT NULL UNIQUE,
            stock_name TEXT    NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (trade_id) REFERENCES trades(id)
        )
    """)

    # ── Table 3: Target Hit ──────────────────────────────
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS target_hit (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_id          INTEGER NOT NULL UNIQUE,
            stock_name        TEXT    NOT NULL,
            return_percentage REAL    NOT NULL,
            created_at        DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (trade_id) REFERENCES trades(id)
        )
    """)

    conn.commit()
    conn.close()
    print("✅ Database initialized successfully.")

def delete_all_stocks():
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # Delete from dependent tables first (foreign key constraints)
        cursor.execute("DELETE FROM stop_loss")
        cursor.execute("DELETE FROM target_hit")
        cursor.execute("DELETE FROM trades")
        
        conn.commit()
        print("✅ All stocks deleted successfully.")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error deleting stocks: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
