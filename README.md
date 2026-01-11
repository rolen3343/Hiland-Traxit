# Hiland Dairy - Gallon Filler

Small Flask app to record daily gallon-filling values and export CSV.

Run locally (Windows PowerShell):

```powershell
pip install -r requirements.txt
python app.py
```

Open http://localhost:3000 in your browser.

## Usage
1. Start the app.
2. Enter rows manually using the UI; click "Submit" to save.
3. Or use "Scan & Prefill" to pre-populate rows from a photo.

## OCR Setup (Windows)
- The app tries EasyOCR first. If unavailable, it falls back to `pytesseract`.
- `pytesseract` requires the Tesseract executable installed on Windows.

### Install Tesseract (for pytesseract)
1. Download the Windows installer: https://github.com/UB-Mannheim/tesseract/wiki
2. Install and ensure `tesseract.exe` is on your `PATH`.
3. Restart PowerShell.

### Install EasyOCR (preferred)
If `pip install easyocr` fails, install PyTorch CPU wheels explicitly, then EasyOCR:

```powershell
pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision torchaudio
pip install easyocr numpy opencv-python-headless Pillow
```

Troubleshooting:
- If `/api/ocr` returns `ocr_unavailable`, either EasyOCR or Tesseract isn’t working. Confirm packages are installed and `tesseract.exe` is on PATH.
- Large images may OCR slowly; try to crop to the table area for best results.
