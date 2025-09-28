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

# OPTIONAL UPC lookup (uses BarcodeLookup if you set API key env var BARCODE_LOOKUP_API_KEY)
@app.route("/api/lookup")
def api_lookup():
    upc = request.args.get("upc", "").strip()
    if not upc:
        return jsonify({"ok": False, "error": "missing upc"}), 400

    api_key = os.environ.get("BARCODE_LOOKUP_API_KEY")
    if not api_key:
        # No key configured – tell the client to fall back to manual
        return jsonify({"ok": False, "error": "no_api_key"}), 200

    try:
        url = "https://api.barcodelookup.com/v3/products"
        r = requests.get(url, params={"barcode": upc, "key": api_key, "formatted": "y"}, timeout=10)
        r.raise_for_status()
        data = r.json()
        products = data.get("products", [])
        if not products:
            return jsonify({"ok": False, "error": "not_found"}), 200

        p = products[0]
        resp = {
            "ok": True,
            "upc": upc,
            "title": p.get("product_name") or p.get("title") or "",
            "brand": p.get("brand") or "",
            "image": (p.get("images") or [""])[0],
            "category": p.get("category") or "",
            "description": p.get("description") or "",
        }
        return jsonify(resp)
    except Exception as e:
        return jsonify({"ok": False, "error": "lookup_error", "detail": str(e)}), 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)