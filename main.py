import os
from flask import Flask, send_from_directory, jsonify

app = Flask(__name__, static_folder='.', static_url_path='')


# ---------- Serve main page ----------
@app.route("/")
def root():
    return send_from_directory('.', 'index.html')


# ---------- Serve all static files (JS, CSS, PNG, JPG, CSV downloads) ----------
@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory('.', path)


# ---------- Health check ----------
@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})


# ---------- OPTIONAL: Future API routes go here ----------
# Example placeholder:
@app.route("/api/lookup")
def lookup_placeholder():
    return jsonify({
        "ok": False,
        "message": "Retail lookup API not enabled yet."
    })


# ---------- Launch ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

import os, uuid, datetime
from fastapi import Form, UploadFile
import pandas as pd, io

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.post("/upload-csv")
async def upload_csv(csv_file: UploadFile, marketplace: str = Form(...)):
    if not csv_file.filename.lower().endswith(".csv"):
        return {"error": "Only .csv allowed"}
    contents = await csv_file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        return {"error": f"CSV read failed: {e}"}
    safe_name = f"{marketplace}_{datetime.date.today()}_{uuid.uuid4().hex[:6]}.csv"
    with open(os.path.join(UPLOAD_DIR, safe_name), "wb") as f:
        f.write(contents)
    return {"message": f"{marketplace} file uploaded", "rows": len(df)}
