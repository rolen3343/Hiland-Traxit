import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'hiland.db')

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        '''CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            brand TEXT,
            subtype TEXT,
            size TEXT,
            quantity INTEGER,
            crates INTEGER DEFAULT 0,
            rows INTEGER DEFAULT 0,
            rows6 INTEGER DEFAULT 0,
            rows7 INTEGER DEFAULT 0,
            stacks6 INTEGER DEFAULT 0,
            stacks7 INTEGER DEFAULT 0,
            on_run_sheet INTEGER DEFAULT 1
        )'''
    )
    conn.commit()

    # Ensure newer columns exist for older DBs
    cur.execute("PRAGMA table_info(entries)")
    cols = [r[1] for r in cur.fetchall()]
    extras = [
        ("crates", "INTEGER", "0"),
        ("rows", "INTEGER", "0"),
        ("rows6", "INTEGER", "0"),
        ("rows7", "INTEGER", "0"),
        ("stacks6", "INTEGER", "0"),
        ("stacks7", "INTEGER", "0"),
        ("on_run_sheet", "INTEGER", "1"),
    ]
    for name, typ, default in extras:
        if name not in cols:
            cur.execute(f'ALTER TABLE entries ADD COLUMN {name} {typ} DEFAULT {default}')
    conn.commit()
    conn.close()

def save_entries(date, items):
    d = date or datetime.utcnow().strftime('%Y-%m-%d')
    conn = get_conn()
    cur = conn.cursor()
    for it in items:
        qty = int(it.get('quantity') or 0)
        crates = (qty + 4 - 1) // 4
        # number of stacks when stacking crates vertically
        stacks6 = (crates + 6 - 1) // 6
        stacks7 = (crates + 7 - 1) // 7
        # rows of stacks when placing 13 stacks per row
        rows6 = (stacks6 + 13 - 1) // 13
        rows7 = (stacks7 + 13 - 1) // 13
        # legacy 'rows' keep as rows6 for compatibility
        rows = rows6
        on_run = 0 if it.get('exclude') else 1
        cur.execute('INSERT INTO entries (date, brand, subtype, size, quantity, crates, rows, rows6, rows7, stacks6, stacks7, on_run_sheet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (d, it.get('brand'), it.get('subtype'), it.get('size'), qty, crates, rows, rows6, rows7, stacks6, stacks7, on_run))
    conn.commit()
    conn.close()

def get_entries():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute('SELECT * FROM entries ORDER BY date DESC, id DESC')
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

