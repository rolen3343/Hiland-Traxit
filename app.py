from flask import Flask, jsonify, request, render_template, make_response
import csv
import io
import re
from typing import List, Dict
from datetime import datetime
from db import init_db, save_entries, get_entries, get_conn

app = Flask(__name__)

BRANDS = [
    { 'name': 'GNG', 'sub': ['Whole', '2%', '1%', 'Skim'] },
    { 'name': 'Grate Value', 'sub': ['Whole', '2%', '1%', 'Skim'] },
    { 'name': 'Reasors', 'sub': ['Whole', '2%', '1%', 'Skim'] },
    { 'name': 'Hiland', 'sub': ['Whole', '2%', '1%', 'Skim'] },
    { 'name': 'Best Choice', 'sub': ['Whole', '2%', '1%', 'Skim'] },
    { 'name': 'Harps', 'sub': ['Whole', '2%', '1%', 'Skim'] }
]


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/hours')
def hours():
    return render_template('hours.html')


@app.route('/api/brands')
def brands():
    return jsonify(BRANDS)


@app.route('/api/entries', methods=['POST'])
def post_entries():
    data = request.get_json() or {}
    date = data.get('date')
    items = data.get('items')
    if not isinstance(items, list):
        return jsonify({'error': 'invalid items'}), 400
    # basic validation for each item
    required = ('brand', 'subtype', 'size', 'quantity')
    for i, it in enumerate(items or []):
        if not isinstance(it, dict):
            return jsonify({'error': f'item {i} is not an object'}), 400
        for k in required:
            if k not in it:
                return jsonify({'error': f'item {i} missing "{k}"'}), 400
        try:
            q = int(it.get('quantity') or 0)
            if q < 0:
                return jsonify({'error': f'item {i} quantity must be >= 0'}), 400
        except Exception:
            return jsonify({'error': f'item {i} invalid quantity'}), 400
        # normalize exclude flag
        if 'exclude' in it:
            it['exclude'] = bool(it.get('exclude'))
    try:
        save_entries(date, items)
        return jsonify({'ok': True, 'date': date})
    except Exception:
        return jsonify({'error': 'db error'}), 500


@app.route('/api/entries', methods=['GET'])
def get_entries_route():
    try:
        rows = get_entries()
        return jsonify(rows)
    except Exception:
        return jsonify({'error': 'db error'}), 500


@app.route('/export')
def export_csv():
    try:
        rows = get_entries()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['id', 'date', 'brand', 'subtype', 'size', 'quantity', 'crates', 'rows6', 'rows7', 'stacks6', 'stacks7', 'on_run_sheet'])
        for r in rows:
            writer.writerow([r.get('id'), r.get('date'), r.get('brand'), r.get('subtype'), r.get('size'), r.get('quantity'), r.get('crates'), r.get('rows6') or r.get('rows'), r.get('rows7'), r.get('stacks6'), r.get('stacks7'), r.get('on_run_sheet')])
        resp = make_response(output.getvalue())
        resp.headers['Content-Type'] = 'text/csv'
        resp.headers['Content-Disposition'] = 'attachment; filename=hiland_entries.csv'
        return resp
    except Exception:
        return jsonify({'error': 'export failed'}), 500


@app.route('/clear', methods=['POST'])
def clear_entries():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('DELETE FROM entries')
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'error': 'clear failed'}), 500


@app.route('/api/entries/<int:entry_id>', methods=['PATCH', 'DELETE'])
def update_entry(entry_id):
    if request.method == 'DELETE':
        # Permanently delete the entry
        try:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute('DELETE FROM entries WHERE id=?', (entry_id,))
            conn.commit()
            conn.close()
            return jsonify({'ok': True})
        except Exception:
            return jsonify({'error': 'delete failed'}), 500
    
    # PATCH method
    data = request.get_json() or {}
    if 'on_run_sheet' not in data:
        return jsonify({'error': 'missing on_run_sheet'}), 400
    try:
        val = 1 if data.get('on_run_sheet') else 0
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('UPDATE entries SET on_run_sheet=? WHERE id=?', (val, entry_id))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': 'update failed'}), 500


@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    """Store and retrieve user settings (date, gallons per hour, downtime) for cross-device sync."""
    conn = get_conn()
    cur = conn.cursor()
    
    if request.method == 'POST':
        data = request.get_json() or {}
        
        # Create settings table if it doesn't exist
        cur.execute('''CREATE TABLE IF NOT EXISTS settings 
                      (key TEXT PRIMARY KEY, value TEXT)''')
        
        # Update or insert all settings
        for key in ['date', 'gallonsPerHour', 'shiftStartTime', 'isClockedIn', 'isDowntime', 'downtimeStart', 'totalDowntimeMs', 'deletedEntryIds']:
            value = data.get(key, '')
            cur.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 
                       (key, str(value)))
        
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    
    else:  # GET
        cur.execute('SELECT key, value FROM settings')
        rows = cur.fetchall()
        conn.close()
        
        settings = {}
        for row in rows:
            settings[row[0]] = row[1]
        
        return jsonify(settings)


@app.route('/api/clock', methods=['POST'])
def clock():
    """Handle clock in/out for time tracking."""
    data = request.get_json() or {}
    action = data.get('action')  # 'in' or 'out'
    
    conn = get_conn()
    cur = conn.cursor()
    
    # Create hours table if it doesn't exist
    cur.execute('''CREATE TABLE IF NOT EXISTS hours 
                  (id INTEGER PRIMARY KEY AUTOINCREMENT,
                   date TEXT,
                   clock_in TEXT,
                   clock_out TEXT,
                   total_time_ms INTEGER,
                   downtime_ms INTEGER)''')
    
    if action == 'in':
        # Clock in - create new record
        date = data.get('date', '')
        clock_in = datetime.now().isoformat()
        cur.execute('INSERT INTO hours (date, clock_in) VALUES (?, ?)', (date, clock_in))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    
    elif action == 'out':
        # Clock out - update most recent record
        clock_out = datetime.now().isoformat()
        total_time_ms = data.get('total_time_ms', 0)
        downtime_ms = data.get('downtime_ms', 0)
        
        cur.execute('''UPDATE hours SET clock_out=?, total_time_ms=?, downtime_ms=? 
                      WHERE id = (SELECT id FROM hours ORDER BY id DESC LIMIT 1)''',
                   (clock_out, total_time_ms, downtime_ms))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    
    conn.close()
    return jsonify({'error': 'invalid action'}), 400


@app.route('/api/hours', methods=['GET'])
def get_hours():
    """Get all time records."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('''SELECT id, date, clock_in, clock_out, total_time_ms, downtime_ms 
                      FROM hours ORDER BY id DESC''')
        rows = cur.fetchall()
        conn.close()
        
        records = []
        for row in rows:
            records.append({
                'id': row[0],
                'date': row[1],
                'clock_in': row[2],
                'clock_out': row[3],
                'total_time_ms': row[4] or 0,
                'downtime_ms': row[5] or 0
            })
        return jsonify(records)
    except Exception:
        return jsonify([])


@app.route('/api/hours/clear', methods=['POST'])
def clear_hours():
    """Clear all time records."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute('DELETE FROM hours')
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


def _ocr_text_from_image_bytes(data: bytes) -> str:
    """Attempt to extract text from image bytes using available OCR backends.

    Tries EasyOCR first (if installed), then falls back to pytesseract.
    Returns a single string with newlines between detected lines.
    """
    # Try EasyOCR
    try:
        import easyocr  # type: ignore
        import numpy as np  # type: ignore
        import cv2  # type: ignore
        np_arr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        reader = easyocr.Reader(['en'], gpu=False)
        results = reader.readtext(img, detail=0, paragraph=True)
        if isinstance(results, list):
            return "\n".join([r.strip() for r in results if isinstance(r, str)])
    except Exception:
        pass

    # Fallback: pytesseract
    try:
        from PIL import Image
        import pytesseract  # type: ignore
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img)
        return text or ""
    except Exception:
        pass

    return ""


def _normalize_brand(token: str) -> str:
    t = token.strip().lower()
    for b in BRANDS:
        if t == b['name'].lower():
            return b['name']
    # rough fuzzy fixes
    if 'great value' in t or 'grate value' in t:
        return 'Grate Value'
    return token.strip()


def _parse_runsheet_text(txt: str) -> List[Dict]:
    """Parse free-form OCR text into items matching the expected schema.

    Handles both single-line and multi-line table formats.
    """
    lines = [re.sub(r"\s+", " ", l).strip() for l in (txt or "").splitlines()]
    items: List[Dict] = []
    debug_info = []

    brand_names = [b['name'] for b in BRANDS]
    subtypes = ['Whole', '2%', '1%', 'Skim']
    sizes = ['Gallon', 'Half Gallon', 'Quart']
    
    # Track current context for table-style parsing
    current_brand = None
    
    for idx, line in enumerate(lines):
        if not line or len(line) < 2:
            continue
        
        low = line.lower()
        debug_info.append(f"Line {idx}: {line}")
        
        # Extract all numbers first
        numbers = re.findall(r"(\d+)", line)
        
        # Check for brand
        brand = None
        for b in brand_names:
            if b.lower() in low:
                brand = _normalize_brand(b)
                current_brand = brand  # Remember for next lines
                break
        
        # Try common abbreviations
        if not brand:
            if 'gng' in low or 'g&g' in low or 'g & g' in low:
                brand = current_brand = 'GNG'
            elif 'gv' in low or 'great' in low or 'grate' in low:
                brand = current_brand = 'Grate Value'
            elif 'reasors' in low or 'reasor' in low:
                brand = current_brand = 'Reasors'
            elif 'hiland' in low or 'hi land' in low or 'hi-land' in low:
                brand = current_brand = 'Hiland'
            elif 'best' in low:
                brand = current_brand = 'Best Choice'
            elif 'harp' in low:
                brand = current_brand = 'Harps'
        
        # If no brand on this line but we have a current_brand and numbers, use it
        if not brand and current_brand and numbers:
            brand = current_brand
        
        # If still no brand, skip
        if not brand:
            debug_info.append(f"  → Skipped: No brand found")
            continue

        # Check for subtype - CHECK SPECIFIC TYPES FIRST (2%, 1%, skim) BEFORE whole/homo
        subtype = None
        if '2%' in low or '2 percent' in low or 'two percent' in low or '2 %' in low:
            subtype = '2%'
        elif '1%' in low or '1 percent' in low or 'one percent' in low or '1 %' in low:
            subtype = '1%'
        elif 'skim' in low:
            subtype = 'Skim'
        elif 'whole' in low or 'homo' in low or 'homogenized' in low:
            subtype = 'Whole'
        
        # Shorthand checks - only if no subtype found yet
        if subtype is None:
            if re.search(r"\b2\b", line):
                subtype = '2%'
            elif re.search(r"\b1\b", line):
                subtype = '1%'
            elif re.search(r"\bS\b", line, re.IGNORECASE):
                subtype = 'Skim'
            elif re.search(r"\bW\b", line, re.IGNORECASE):
                subtype = 'Whole'
            elif re.search(r"\bH\b", line, re.IGNORECASE):
                subtype = 'Whole'  # H for Homo
            elif re.search(r"\bS\b", line, re.IGNORECASE):
                subtype = 'Skim'
            elif re.search(r"\b2\b", line):
                subtype = '2%'
            elif re.search(r"\b1\b", line):
                subtype = '1%'

        # Check for size
        size = None
        if 'half gallon' in low or '1/2 gallon' in low or 'half gal' in low or '1/2 gal' in low:
            size = 'Half Gallon'
        elif 'quart' in low or 'qt' in low:
            size = 'Quart'
        elif 'gallon' in low or 'gal' in low:
            size = 'Gallon'
        
        if size is None:
            size = 'Gallon'

        # Extract quantity - try to get the last or largest number
        qty = 0
        if numbers:
            # Filter out likely non-quantities (years, single digits that might be subtypes)
            candidate_qtys = [int(n) for n in numbers if len(n) <= 4]
            if candidate_qtys:
                # Use the last number, or if multiple, the largest that makes sense
                qty = candidate_qtys[-1] if len(candidate_qtys) == 1 else max([q for q in candidate_qtys if q > 0 and q < 10000], default=0)

        if qty <= 0:
            debug_info.append(f"  → Skipped: No valid quantity (found numbers: {numbers})")
            continue

        debug_info.append(f"  → Parsed: {brand} {subtype} {size} × {qty}")
        items.append({
            'brand': brand,
            'subtype': subtype or subtypes[0],
            'size': size,
            'quantity': qty,
            'exclude': False
        })

    # Store debug info for troubleshooting
    if not items and debug_info:
        print("OCR Debug Info:")
        for d in debug_info:
            print(d)
    
    return items, debug_info


@app.route('/api/ocr', methods=['POST'])
def ocr_runsheet():
    """Accept an image upload and return parsed runsheet items from OCR."""
    if 'image' not in request.files:
        return jsonify({'error': 'missing image field'}), 400
    f = request.files['image']
    data = f.read()
    if not data:
        return jsonify({'error': 'empty image'}), 400

    text = _ocr_text_from_image_bytes(data)
    if not text:
        return jsonify({'error': 'ocr_unavailable', 'message': 'OCR libraries not available or no text detected'}), 500

    items, debug_info = _parse_runsheet_text(text)
    # Always return raw text and debug info so user can see what was detected
    return jsonify({'ok': True, 'items': items, 'raw_text': text, 'detected_count': len(items), 'debug': '\\n'.join(debug_info)})


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3000, debug=True)

