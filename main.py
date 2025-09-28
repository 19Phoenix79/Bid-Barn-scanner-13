import os
from flask import Flask, send_from_directory, jsonify

# Serve files from the repo root
app = Flask(__name__, static_folder='.', static_url_path='')

@app.route("/")
def root():
    # Serve index.html from the repo root
    return send_from_directory('.', 'index.html')

# Optional health checks
@app.route("/ping")
def ping():
    return jsonify({"status": "ok"})

@app.route("/api/health")
def health():
    return jsonify({"ok": True})

# Serve any other file in the repo root (app.js, styles.css, images, etc.)
@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory('.', path)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)