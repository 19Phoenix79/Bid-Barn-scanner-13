import os
from flask import Flask, send_from_directory, jsonify, request
import requests

app = Flask(__name__, static_folder='.', static_url_path='')

@app.route("/")
def root():
    return send_from_directory('.', 'index.html')

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory('.', path)

@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})

# Optional: UPC → stock photo + retail lookup
# Set BARCODE_LOOKUP_API_KEY in Render → Environment for automatic data.
@app.route("/api/lookup")
def api_lookup():
    upc = (request.args.get("upc") or "").strip()
    if not upc:
        return jsonify({"ok": False, "error": "missing_upc"}), 400

    api_key = os.environ.get("BARCODE_LOOKUP_API_KEY")
    if not api_key:
        # No key configured; client will fall back to quick prompts
        return jsonify({"ok": False, "error": "no_api_key"}), 200

    try:
        r = requests.get(
            "https://api.barcodelookup.com/v3/products",
            params={"barcode": upc, "key": api_key, "formatted": "y"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        products = data.get("products", [])
        if not products:
            return jsonify({"ok": False, "error": "not_found"}), 200

        p = products[0]
        # Try common fields
        title = p.get("product_name") or p.get("title") or ""
        brand = p.get("brand") or ""
        images = p.get("images") or []
        image = images[0] if images else ""
        # retail/MSRP often lives in 'stores' or 'offers'—we try to infer simply:
        retail = 0.0
        if "msrp" in p and p["msrp"]:
            try: retail = float(str(p["msrp"]).replace("$","").replace(",",""))
            except: pass

        return jsonify({
            "ok": True,
            "upc": upc,
            "title": title,
            "brand": brand,
            "image": image,
            "retail": retail
        })
    except Exception as e:
        return jsonify({"ok": False, "error": "lookup_error", "detail": str(e)}), 200

if __name__ == "__main__":
    # Local dev; on Render use: Start Command = gunicorn main:app
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)