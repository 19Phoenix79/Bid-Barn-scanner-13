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

# ---------- Helpers ----------
def _safe_float(v):
    try:
        return float(str(v).replace("$","").replace(",",""))
    except:
        return 0.0

def lookup_keepa(upc: str):
    """Use Keepa to map UPC/EAN to ASIN + title/brand/retail."""
    key = os.environ.get("KEEPA_API_KEY")
    if not key:
        return None
    try:
        # US marketplace domain=1
        r = requests.get(
            "https://api.keepa.com/product",
            params={"key": key, "domain": 1, "code": upc, "history": 0},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
        products = data.get("products") or []
        if not products:
            return None
        p = products[0]
        asin = p.get("asin") or ""
        title = p.get("title") or ""
        brand = p.get("brand") or ""
        # Keepa listPrice is in cents
        retail = 0.0
        if p.get("listPrice"):
            retail = float(p["listPrice"]) / 100.0
        # Image: Keepa may provide imagesCSV; not always full URLs—so omit if unsure
        image = ""
        if p.get("imagesCSV"):
            first = (p["imagesCSV"].split(",") or [""])[0]
            # Best effort: Keepa images are usually already full URLs; if not, leave blank
            if first.startswith("http"):
                image = first
        return {
            "ok": True,
            "provider": "keepa",
            "upc": upc,
            "asin": asin,
            "title": title,
            "brand": brand,
            "image": image,
            "retail": retail,
            "amazon_url": f"https://www.amazon.com/dp/{asin}" if asin else "",
        }
    except Exception:
        return None

def lookup_barcodelookup(upc: str):
    """BarcodeLookup fallback."""
    key = os.environ.get("BARCODE_LOOKUP_API_KEY")
    if not key:
        return None
    try:
        r = requests.get(
            "https://api.barcodelookup.com/v3/products",
            params={"barcode": upc, "key": key, "formatted": "y"},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
        prods = data.get("products") or []
        if not prods:
            return None
        p = prods[0]
        title = p.get("product_name") or p.get("title") or ""
        brand = p.get("brand") or ""
        image = (p.get("images") or [""])[0]
        # Some responses include 'asin' or 'stores' with Amazon links
        asin = p.get("asin") or ""
        retail = 0.0
        if p.get("msrp"):
            retail = _safe_float(p["msrp"])
        amazon_url = ""
        stores = p.get("stores") or []
        for s in stores:
            link = s.get("link") or ""
            if "amazon.com" in link and not amazon_url:
                amazon_url = link
        return {
            "ok": True,
            "provider": "barcodelookup",
            "upc": upc,
            "asin": asin,
            "title": title,
            "brand": brand,
            "image": image,
            "retail": retail,
            "amazon_url": amazon_url,
        }
    except Exception:
        return None

def lookup_upcitemdb(upc: str):
    """UPCItemDB trial fallback (limited)."""
    try:
        r = requests.get(
            "https://api.upcitemdb.com/prod/trial/lookup",
            params={"upc": upc},
            timeout=12,
        )
        r.raise_for_status()
        data = r.json()
        items = data.get("items") or []
        if not items:
            return None
        it = items[0]
        title = it.get("title") or ""
        brand = it.get("brand") or ""
        image = (it.get("images") or [""])[0]
        asin = it.get("asin") or ""
        # Offers sometimes have list price
        retail = 0.0
        offers = it.get("offers") or []
        for o in offers:
            price = o.get("list_price") or o.get("price")
            retail = max(retail, _safe_float(price))
        amazon_url = ""
        if asin:
            amazon_url = f"https://www.amazon.com/dp/{asin}"
        return {
            "ok": True,
            "provider": "upcitemdb",
            "upc": upc,
            "asin": asin,
            "title": title,
            "brand": brand,
            "image": image,
            "retail": retail,
            "amazon_url": amazon_url,
        }
    except Exception:
        return None

@app.route("/api/lookup")
def api_lookup():
    upc = (request.args.get("upc") or "").strip()
    if not upc:
        return jsonify({"ok": False, "error": "missing_upc"}), 400

    # Try providers in order
    for fn in (lookup_keepa, lookup_barcodelookup, lookup_upcitemdb):
        res = fn(upc)
        if res and res.get("ok"):
            return jsonify(res)

    # Final fallback — nothing found
    return jsonify({"ok": False, "error": "not_found"}), 200

if __name__ == "__main__":
    # On Render, use Start Command: gunicorn main:app
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)