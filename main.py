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

# -------- Free-only lookup (UPCItemDB Trial) --------
def _safe_float(v):
    try:
        return float(str(v).replace("$", "").replace(",", ""))
    except Exception:
        return 0.0

def _first(*vals):
    for v in vals:
        if v:
            return v
    return ""

@app.route("/api/lookup")
def api_lookup():
    upc = (request.args.get("upc") or "").strip()
    if not upc:
        return jsonify({"ok": False, "error": "missing_upc"}), 400

    def try_lookup(u):
        r = requests.get(
            "https://api.upcitemdb.com/prod/trial/lookup",
            params={"upc": u},
            timeout=10
        )
        r.raise_for_status()
        return r.json()

    # Try as-given; if 13 digits starting with 0, also try 12-digit UPC-A
    candidates = [upc]
    if len(upc) == 13 and upc.startswith("0"):
        candidates.append(upc[1:])

    for candidate in candidates:
        try:
            data = try_lookup(candidate)
            items = (data or {}).get("items") or []
            if not items:
                continue
            it = items[0]

            title = it.get("title") or ""
            brand = it.get("brand") or ""
            asin = it.get("asin") or ""

            # Retail from offers
            retail = 0.0
            for o in it.get("offers") or []:
                price = o.get("list_price") or o.get("price")
                retail = max(retail, _safe_float(price))

            # Fallbacks if offers empty
            if retail <= 0:
                retail = max(
                    _safe_float(it.get("highest_recorded_price")),
                    _safe_float(it.get("lowest_recorded_price")),
                    _safe_float(it.get("msrp")),
                )

            desc = _first(
                it.get("description"),
                it.get("long_description"),
                it.get("subtitle"),
            )
            if not desc:
                bits = []
                if brand: bits.append(brand)
                if title and (title.lower() != brand.lower()): bits.append(title)
                if retail: bits.append(f"Approx. retail: ${retail:0.2f}.")
                bits.append("Condition not verified. See photos for details.")
                desc = " ".join(bits).strip()

            amazon_url = f"https://www.amazon.com/dp/{asin}" if asin else ""

            return jsonify({
                "ok": True,
                "provider": "upcitemdb",
                "queried": candidate,
                "upc": candidate,
                "asin": asin,
                "title": title,
                "brand": brand,
                "retail": retail,
                "description": desc,
                "amazon_url": amazon_url
            })
        except Exception:
            continue

    return jsonify({"ok": False, "error": "not_found_or_rate_limited"}), 200

if __name__ == "__main__":
    # On Render use Start Command: gunicorn main:app
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)