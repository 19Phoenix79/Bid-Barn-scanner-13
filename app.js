// app.js - Sir Scansalot: Import manifests, auto-categorize, DuckDuckGo + Unsplash images,
// weighted cost allocation, export WooCommerce CSV (import-ready), and optional upload to WC.
//
// CONFIG - update keys / endpoints if you need
const UNSPLASH_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";
const WC_API_BASE = "https://bidbarn.bid/wp-json/wc/v3";
const CONSUMER_KEY = "ck_d55a9ed6d41a3d9a81ca11c768784466e295d2ff";
const CONSUMER_SECRET = "cs_e758596896402d908099ff144cb09bd158ca4d21";

// Timing & limits
const IMAGE_DELAY_MS = 250;
const UPLOAD_DELAY_MS = 800;
const UPLOAD_RETRIES = 2;
const AUCTION_DAYS = 3; // per your request

// DOM elements — make sure index.html contains these IDs
const importEl = document.getElementById("importBtn");    // <input type="file" accept=".csv,.xlsx" id="importBtn">
const exportEl = document.getElementById("exportBtn");    // export CSV button
const uploadEl = document.getElementById("uploadBtn");    // upload to WooCommerce
const toastEl  = document.getElementById("toast");        // toast container

// ------- UI helpers -------
function showToast(msg, ms = 3500) {
  if (!toastEl) { console.log("TOAST:", msg); return; }
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.style.opacity = 0), ms);
}
function delay(ms){ return new Promise(res => setTimeout(res, ms)); }
function safeNum(v){ if (typeof v === "number") return v; if (!v && v!==0) return 0; const n = Number(String(v).replace(/[^0-9.\-]/g,"")); return isNaN(n) ? 0 : n; }
function isoDaysFromNow(days){ const d = new Date(); d.setUTCDate(d.getUTCDate()+days); return d.toISOString(); }

// ------- CSV / XLSX utilities -------
async function loadSheetJS(){
  if (window.XLSX) return;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js";
    s.onload = () => res();
    s.onerror = (e) => rej(e);
    document.head.appendChild(s);
  });
}

// robust CSV parser for lines (handles quoted commas)
function parseCSVText(text){
  const rows = [];
  const lines = text.split(/\r\n|\n/);
  for (const line of lines) {
    if (line === undefined || line === null) continue;
    // skip empty lines
    if (!line.trim()) continue;
    const cols = [];
    let cur = "", inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"'){ cur += '"'; i++; continue; }
      if (ch === '"'){ inQ = !inQ; continue; }
      if (ch === ',' && !inQ){ cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

// normalize various vendor headers -> unified items
function detectVendorByHeaders(headersLower){
  if (headersLower.some(h => h.includes("wt retail") || h.includes("scan lp") || h.includes("wt qty"))) return "worldly";
  if (headersLower.some(h => h.includes("lot id") || h.includes("item #") || h.includes("unit retail") || h.includes("ext. retail"))) return "bstock";
  if (headersLower.some(h => h.includes("title") && headersLower.some(h2 => h2.includes("retailprice") || h2.includes("upc")))) return "direct";
  if (headersLower.includes("sku") && headersLower.includes("retail")) return "worldly";
  return "unknown";
}

function normalizeRowsToItems(rows){
  // rows = array of arrays; first row is header
  const headers = rows[0].map(h => (h||"").toString().trim());
  const idx = {}; headers.forEach((h,i)=> idx[h.toLowerCase()] = i);
  const headersLower = headers.map(h => (h||"").toString().toLowerCase());
  const vendor = detectVendorByHeaders(headersLower);
  const items = [];

  for (let r=1; r<rows.length; r++){
    const row = rows[r];
    if (!row || row.length===0) continue;
    const get = (names) => {
      for (const n of names) {
        const k = (""+n).toLowerCase();
        if (idx[k] !== undefined && row[idx[k]] !== undefined) return row[idx[k]];
      }
      return "";
    };

    let item = {};
    if (vendor === "bstock") {
      item.sku = (get(["Item #","item #","item#","SKU","Item ID"])||"").toString().trim();
      item.name = (get(["Item Description","Title"])||"").toString().trim();
      item.brand = (get(["Brand"])||"").toString().trim();
      item.retail = safeNum(get(["Unit Retail","Unit retail","UnitRetail","Unit Retail Price","UnitRetailPrice","Ext. Retail"]));
      item.qty = parseInt(get(["Qty","Quantity","qty"])||1)||1;
      item.image = (get(["Image","Photo","Image URL","ImageURL"])||"").toString().trim();
      item.category = (get(["Category","Department","Department","Seller Category"])||"").toString().trim();
      item.cost = safeNum(get(["Price","Cost","Price Each","Your Price","Load Price"]));
    } else if (vendor === "direct") {
      item.sku = (get(["UPC","upc","SKU"])||"").toString().trim();
      item.name = (get(["Title","Product Name","Item Description"])||"").toString().trim();
      item.brand = (get(["Manufacturer","Brand"])||"").toString().trim();
      item.retail = safeNum(get(["RetailPrice","Retail Price","Retail"]));
      item.qty = parseInt(get(["Quantity","Qty","quantity"])||1)||1;
      item.image = (get(["Image","Photo","Image URL","ImageURL"])||"").toString().trim();
      item.category = (get(["Category","Dept","Department"])||"").toString().trim();
      item.cost = safeNum(get(["Price","Cost","Your Price"]));
    } else {
      // worldly or fallback
      item.sku = (get(["SKU","Sku","sku","UPC","Item ID","Item #"])||"").toString().trim();
      item.name = (get(["Item Description","Item Name","Title","Name"])||"").toString().trim();
      item.brand = (get(["Brand"])||"").toString().trim();
      item.retail = safeNum(get(["Retail Value","Retail","WT Retail","RetailPrice","Retail Price","Unit Retail","Ext. Retail"]));
      item.qty = parseInt(get(["Qty","Quantity","WT QTY","Qty (each)"])||1)||1;
      item.image = (get(["Image","Image URL","Photo","Product Image","ImageURL"])||"").toString().trim();
      item.category = (get(["Category","Department","Dept. Code","Seller Category"])||"").toString().trim();
      item.cost = safeNum(get(["Price","Cost","Your Price","Load Price"]));
    }

    // normalized defaults
    item.retail = Number(item.retail || 0);
    if (!item.qty || isNaN(item.qty)) item.qty = 1;
    item.cost = Number(item.cost || 0); // may be 0; we'll compute weighted if needed
    items.push(item);
  }
  return items;
}

async function handleFile(file) {
  const fname = file.name.toLowerCase();
  if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) {
    await loadSheetJS();
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(data), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const arr = XLSX.utils.sheet_to_json(sheet, { header:1, raw:false });
    return normalizeRowsToItems(arr);
  } else {
    const text = await file.text();
    const rows = parseCSVText(text);
    return normalizeRowsToItems(rows);
  }
}

// ------- Category detection (keyword matching to Woo category names) -------
function detectCategoryNameFromText(t) {
  if (!t) return "General Merchandise";
  const s = t.toLowerCase();
  if (s.includes("vanity") || s.includes("bath") || s.includes("toilet") || s.includes("sink") || s.includes("faucet")) return "Kitchen and Bath";
  if (s.includes("kitchen") || s.includes("cabinet")) return "Kitchen and Bath";
  if (s.includes("light") || s.includes("chandelier") || s.includes("lamp")) return "Lighting";
  if (s.includes("washer") || s.includes("dryer") || s.includes("fridge") || s.includes("appliance") || s.includes("microwave") || s.includes("dishwasher") || s.includes("oven")) return "Appliances";
  if (s.includes("drill") || s.includes("saw") || s.includes("tool") || s.includes("compressor")) return "Tools";
  if (s.includes("outdoor") || s.includes("patio") || s.includes("garden")) return "Outdoor & Garden";
  if (s.includes("furniture") || s.includes("chair") || s.includes("sofa") || s.includes("table") ) return "Furniture";
  return "General Merchandise";
}

// ------- Woo category sync (fetch existing categories and create if needed) -------
let cachedWooCategories = null;
async function loadWooCategories(){
  if (cachedWooCategories) return cachedWooCategories;
  try {
    const res = await fetch(`${WC_API_BASE}/products/categories?per_page=100`, {
      headers: { Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`) }
    });
    const json = await res.json();
    cachedWooCategories = Array.isArray(json) ? json : [];
    console.log("Loaded categories:", cachedWooCategories.map(c => c.name));
    return cachedWooCategories;
  } catch (e) {
    console.warn("Failed loading categories:", e);
    cachedWooCategories = [];
    return cachedWooCategories;
  }
}

async function ensureWooCategory(name){
  if (!name) return null;
  const list = await loadWooCategories();
  const found = list.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  // create
  try {
    const res = await fetch(`${WC_API_BASE}/products/categories`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) { console.warn("Create category error:", res.status, data); return null; }
    cachedWooCategories.push(data);
    console.log("Created new category:", data.name);
    return data.id;
  } catch (e) {
    console.warn("ensureWooCategory error:", e);
    return null;
  }
}

// ------- DuckDuckGo image search (i.js endpoint) -------
// returns first image url or null
async function fetchDuckDuckGoImage(query){
  if (!query) return null;
  try {
    // DuckDuckGo i.js endpoint returns JSON of images
    const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" }});
    if (!resp.ok) {
      // If ddg blocks or rate-limits, return null
      console.warn("DDG image search status", resp.status);
      return null;
    }
    const j = await resp.json();
    if (j && Array.isArray(j.results) && j.results.length) {
      // take the very first result
      return j.results[0].image || j.results[0].thumbnail || null;
    }
    return null;
  } catch (e) {
    console.warn("DuckDuckGo image fetch failed:", e);
    return null;
  }
}

// ------- Unsplash fallback -------
async function fetchUnsplashImage(query){
  if (!query) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${UNSPLASH_KEY}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.warn("Unsplash status", r.status);
      return null;
    }
    const j = await r.json();
    if (j && j.results && j.results.length) {
      return j.results[0].urls && (j.results[0].urls.regular || j.results[0].urls.small) || null;
    }
    return null;
  } catch (e) {
    console.warn("Unsplash fetch error:", e);
    return null;
  }
}

// ------- Upload image to WP media (returns media id) -------
async function uploadImageToWP(imageUrl, fileName){
  try {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error("image download failed");
    const blob = await r.blob();
    const fd = new FormData();
    fd.append("file", blob, fileName || "product.jpg");

    const upload = await fetch(`${WC_API_BASE}/media`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`) },
      body: fd
    });
    const json = await upload.json();
    if (!upload.ok) {
      console.warn("Media upload failed:", upload.status, json);
      return null;
    }
    return json.id || null;
  } catch (e) {
    console.warn("uploadImageToWP error:", e);
    return null;
  }
}

// ------- Create product attempt (auction first, fallback to simple) -------
async function createProduct(it, index, total) {
  const title = it.name || it["Item Description"] || it["Title"] || "Untitled";
  const sku = it.sku || it.SKU || "";
  const qty = Number(it.qty || it.Quantity || 1) || 1;

  // Determine cost (start price)
  // Weighted-by-retail: if we have palletCost and retail totals we'll compute outside and set it.cost
  let startPrice = Number(it.cost || 0);
  if (!startPrice || startPrice <= 0) {
    // fallback to item.cost if present or retail * 0.25
    startPrice = it.cost && it.cost > 0 ? it.cost : (it.retail ? (it.retail * 0.25) : 0);
  }
  startPrice = Number(startPrice.toFixed(2));

  // category detection and ensure it exists in Woo
  const detectedName = detectCategoryName(it.category || title || "");
  const catId = await ensureWooCategory(detectedName);

  // image: prefer manifest-provided image URL
  let imageUrl = (it.image || it["Image"] || it["Image URL"] || "").toString().trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    // try DuckDuckGo first
    const ddgQuery = ((it.brand || "") + " " + title).trim() || title;
    imageUrl = await fetchDuckDuckGoImage(ddgQuery);
    await delay(IMAGE_DELAY_MS);
    if (!imageUrl) {
      // fallback to Unsplash
      imageUrl = await fetchUnsplashImage(ddgQuery);
      await delay(IMAGE_DELAY_MS);
    }
  }

  let mediaId = null;
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    mediaId = await uploadImageToWP(imageUrl, `${(sku||title).slice(0,40).replace(/[^a-z0-9]/gi,'_')}.jpg`);
    await delay(IMAGE_DELAY_MS);
  }

  // Build auction payload (first try)
  const startISO = new Date().toISOString();
  const endISO = isoDaysFromNow(AUCTION_DAYS);
  const auctionMeta = [
    { key: "auction_start_date", value: startISO },
    { key: "auction_end_date", value: endISO },
    { key: "auction_start_price", value: String(startPrice) },
    { key: "_yith_auction_duration", value: String(AUCTION_DAYS) },
    { key: "_yith_auction_start_date", value: startISO },
    { key: "_yith_auction_end_date", value: endISO },
    { key: "yith_auction_start_price", value: String(startPrice) },
    { key: "calculated_start_price", value: String(startPrice) }
  ];

  const auctionPayload = {
    name: title,
    type: "auction",
    regular_price: String(startPrice.toFixed(2)),
    sku: sku || undefined,
    manage_stock: true,
    stock_quantity: qty,
    description: it.Description || it["Item Description"] || "",
    categories: catId ? [{ id: catId }] : [],
    images: mediaId ? [{ id: mediaId }] : [],
    meta_data: auctionMeta,
    status: "publish"
  };

  // Try creating auction product
  try {
    const resp = await fetch(`${WC_API_BASE}/products`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(auctionPayload)
    });
    const text = await resp.text();
    if (resp.ok) {
      let json; try { json = JSON.parse(text); } catch(e){ json = text; }
      console.log(`(${index}/${total}) Created AUCTION product:`, sku, json.id || json);
      return { ok:true, type:"auction", result:json };
    } else {
      console.warn(`(${index}/${total}) Auction create rejected:`, resp.status, text);
      // fall through to the fallback
    }
  } catch (e) {
    console.warn("Auction create error:", e);
  }

  // Fallback: create simple product, include auction meta keys
  const simplePayload = {
    name: title,
    type: "simple",
    regular_price: String(startPrice.toFixed(2)),
    sku: sku || undefined,
    manage_stock: true,
    stock_quantity: qty,
    description: it.Description || it["Item Description"] || "",
    categories: catId ? [{ id: catId }] : [],
    images: mediaId ? [{ id: mediaId }] : [],
    meta_data: auctionMeta,
    status: "publish"
  };

  for (let attempt=0; attempt<=UPLOAD_RETRIES; attempt++) {
    try {
      const r = await fetch(`${WC_API_BASE}/products`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(simplePayload)
      });
      const txt = await r.text();
      if (r.ok) {
        let json; try { json = JSON.parse(txt); } catch(e){ json = txt; }
        console.log(`(${index}/${total}) Created SIMPLE product (with auction meta):`, sku, json.id || json);
        return { ok:true, type:"simple", result:json };
      } else {
        console.warn(`(${index}/${total}) Simple create failed:`, r.status, txt);
        if (r.status === 429) await delay(2000 * (attempt+1));
        else break;
      }
    } catch (e) {
      console.warn(`(${index}/${total}) Exception creating simple product:`, e);
      await delay(1000 * (attempt+1));
    }
  }

  return { ok:false };
}

// ------- EXPORT CSV (WooCommerce import format) -------
function buildWooCommerceCSVRows(items) {
  // WooCommerce importer columns (common subset)
  // Adjust fields as needed — this set works with the WP importer
  const headers = [
    "Name","Type","SKU","Regular price","Categories","Short description","Description","Images","Stock","In stock?","Manage stock?","Status"
  ];

  const rows = [headers];

  for (const it of items) {
    // compute start price (we assume cost is startPrice already)
    const price = Number(it.cost || 0).toFixed(2);

    // image selection: prefer manifest image or duck/unsplash fallback (we already computed imageUrl? not persistent)
    const imageUrl = it._exportImageUrl || it.image || "";

    const cat = detectCategoryName(it.category || it["Category"] || it["Department"] || it.name || "");
    const shortDesc = (it.brand ? it.brand + " " : "") + (it.model ? ("Model: "+it.model) : "");

    const row = [
      it.name || "",
      "simple",
      it.sku || "",
      price,
      cat,
      shortDesc,
      it.Description || it["Item Description"] || "",
      imageUrl,
      String(it.qty || 1),
      it.qty && it.qty>0 ? "1" : "0",
      "1",
      "publish"
    ];
    rows.push(row);
  }
  return rows;
}

function downloadCSV(rows, fileName) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName || `woo_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

// ------- Top-level flow / handlers -------
let importedItems = [];

importEl?.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) { showToast("No file selected"); return; }
  showToast("Parsing file...");
  try {
    importedItems = await handleFile(file);
    // If imported items have no explicit cost, compute weighted cost now
    // Ask user for total pallet cost unless the file provided costs
    const totalRetail = importedItems.reduce((s,it) => s + (safeNum(it.retail) * (it.qty||1)), 0);
    console.log("Total retail sum detected:", totalRetail);

    // ask user for pallet cost if none of items have a 'cost' set
    const anyCost = importedItems.some(it => it.cost && it.cost > 0);
    let palletCost = null;
    if (!anyCost) {
      const p = prompt("Enter TOTAL pallet cost (used to weight start prices by retail). Cancel to fallback to retail*0.25 per item:", "");
      if (p !== null && p !== "") palletCost = safeNum(p);
    }

    if (palletCost && palletCost > 0 && totalRetail > 0) {
      // compute weighted cost per item = (item.retail / totalRetail) * palletCost
      for (const it of importedItems) {
        const itemRetailTotal = safeNum(it.retail) * (it.qty || 1);
        const share = itemRetailTotal && totalRetail ? (itemRetailTotal / totalRetail) : 0;
        const perItemCost = (share * palletCost) / (it.qty || 1); // per unit
        it.cost = Number(perItemCost || 0).toFixed(2);
      }
      showToast(`Weighted costs computed from pallet cost $${palletCost}`, 4000);
    } else {
      // fallback: if each item has a 'Price' column or 'Cost', use that; else use retail*0.25
      for (const it of importedItems) {
        if (!it.cost || Number(it.cost) === 0) {
          if (it.Price && safeNum(it.Price) > 0) it.cost = Number(safeNum(it.Price)).toFixed(2);
          else if (it.Cost && safeNum(it.Cost) > 0) it.cost = Number(safeNum(it.Cost)).toFixed(2);
          else it.cost = Number((safeNum(it.retail) * 0.25)).toFixed(2);
        }
      }
      showToast("Using item-level cost or retail*25% fallback", 3500);
    }

    // precompute an export image URL using DuckDuckGo then Unsplash for the export CSV (so export contains image URLs)
    showToast("Fetching sample images for export (this may take some time)...");
    for (let i=0;i<importedItems.length;i++){
      const it = importedItems[i];
      if (it.image && /^https?:\/\//i.test(it.image)) { it._exportImageUrl = it.image; continue; }
      const q = ((it.brand || "") + " " + it.name).trim() || it.name;
      let ddg = await fetchDuckDuckGoImage(q);
      await delay(IMAGE_DELAY_MS);
      if (!ddg) {
        const us = await fetchUnsplashImage(q);
        await delay(IMAGE_DELAY_MS);
        it._exportImageUrl = us || `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(it.name.slice(0,30) || "No+Image")}`;
      } else {
        it._exportImageUrl = ddg;
      }
      // optional: progress in console
      if ((i+1) % 10 === 0) console.log(`Prepared images for ${i+1}/${importedItems.length}`);
    }
    showToast("Import and image-prep done. Ready to export or upload.");
    console.log("Imported items (sample):", importedItems.slice(0,6));
  } catch (e) {
    console.error("Import error:", e);
    showToast("Failed to parse the file");
  }
});

// Export CSV (WooCommerce import-ready)
exportEl?.addEventListener("click", async () => {
  if (!importedItems || !importedItems.length) { showToast("No items loaded"); return; }
  showToast("Building WooCommerce CSV...");
  // Build rows
  const rows = buildWooCommerceCSVRows(importedItems);
  downloadCSV(rows, `woo_import_${new Date().toISOString().slice(0,10)}.csv`);
  showToast("WooCommerce CSV generated and downloaded");
});

// Upload to WooCommerce (creates products — auction if possible)
uploadEl?.addEventListener("click", async () => {
  if (!importedItems || !importedItems.length) { showToast("No items loaded"); return; }
  await loadWooCategories();
  showToast("Uploading items to WooCommerce. Check console for details (this may take a while).", 8000);
  for (let i=0;i<importedItems.length;i++){
    const it = importedItems[i];
    try {
      const res = await createProduct(it, i+1, importedItems.length);
      if (!res || !res.ok) console.warn("Upload failed for item:", it.sku || it.name, res);
    } catch (e) {
      console.error("Upload exception:", e);
    }
    await delay(UPLOAD_DELAY_MS);
  }
  showToast("Upload run finished. See console for details.", 8000);
});
