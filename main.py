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