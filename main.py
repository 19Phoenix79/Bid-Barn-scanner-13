import os
from typing import Dict, Any, Optional
from fastapi import FastAPI
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import requests

app = FastAPI()

# CORS so browser JS can call /lookup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve static UI
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse("static/index.html")

# ---- SIMPLE DEMO DB (works offline) ----
MOCK_DB: Dict[str, Dict[str, Any]] = {
    "885609027869": {
        "name": "Dyson Ball Animal 3 Upright",
        "brand": "Dyson",
        "description": "Upright vacuum with powerful suction for homes with pets.",
        "retail": 399.99,
        "amazon_link": "https://www.amazon.com/dp/B0B75Q388N",
        "image": ""
    },
    "885609034461": {
        "name": "Dyson V8 Plus Cordless",
        "brand": "Dyson",
        "description": "Cordless stick vacuum with up to 40 minutes of run time.",
        "retail": 349.99,
        "amazon_link": "https://www.amazon.com/dp/B0CT9552BL",
        "image": ""
    },
}

def try_upcitemdb(upc: str) -> Optional[Dict[str, Any]]:
    """Free trial endpoint; for production, swap to your own data source."""
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={upc}"
    try:
        r = requests.get(url, timeout=8)
        if r.status_code != 200:
            return None
        data = r.json()
        items = data.get("items") or []
        if not items:
            return None
        it = items[0]
        title = (it.get("title") or "").strip()
        brand = (it.get("brand") or "").strip()
        desc = (it.get("description") or "").strip()
        image = (it.get("images") or [None])[0]
        retail = None
        link = None
        for off in it.get("offers", []):
            if retail is None and off.get("price"):
                try:
                    retail = float(off["price"])
                except Exception:
                    pass
            if link is None and off.get("link"):
                link = off["link"]
        return {
            "name": title,
            "brand": brand,
            "description": desc,
            "retail": retail,
            "amazon_link": link or "",
            "image": image or "",
            "source": "upcitemdb"
        }
    except Exception:
        return None

@app.get("/lookup")
def lookup(upc: str):
    digits = "".join(c for c in upc if c.isdigit())
    if len(digits) not in (12, 13):
        return JSONResponse({"ok": False, "error": "invalid_upc"}, status_code=400)

    # 1) demo
    if digits in MOCK_DB:
        return {"ok": True, "data": {**MOCK_DB[digits], "source": "mock"}}

    # 2) public trial
    data = try_upcitemdb(digits)
    if data:
        return {"ok": True, "data": data}

    return {"ok": False, "error": "not_found"}