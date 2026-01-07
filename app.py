from flask import Flask, jsonify, request, render_template, make_response
import csv
import io
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


@app.route('/api/entries/<int:entry_id>', methods=['PATCH'])
def update_entry(entry_id):
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
    except Exception:
        return jsonify({'error': 'update failed'}), 500


if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3000, debug=True)

