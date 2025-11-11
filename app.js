// final app.js — WooCommerce uploader with auction-mode (3 day auctions), image upload, category sync
// WARNING: This uses consumer key/secret in-browser. For production, use a server-side proxy.

// ---------- CONFIG ----------
const UNSPLASH_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";
const WC_API_BASE = "https://bidbarn.bid/wp-json/wc/v3";
const CONSUMER_KEY = "ck_d55a9ed6d41a3d9a81ca11c768784466e295d2ff";
const CONSUMER_SECRET = "cs_e758596896402d908099ff144cb09bd158ca4d21";

// timing
const IMAGE_DELAY_MS = 300;
const UPLOAD_DELAY_MS = 800;
const UPLOAD_RETRIES = 2;
const AUCTION_DAYS = 3; // user requested 3 day auctions

// ---------- DOM ----------
const importBtn = document.getElementById("importBtn");
const uploadBtn = document.getElementById("uploadBtn");
const toastEl = document.getElementById("toast");

// ---------- UI helpers ----------
function showToast(msg, ms = 3500) {
  if (!toastEl) { console.log("TOAST:", msg); return; }
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.style.opacity = 0), ms);
}

function delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function safeNum(val){ if (typeof val === "number") return val; if (!val) return 0; const n = Number(String(val).replace(/[^0-9.\-]/g,"")); return isNaN(n) ? 0 : n; }
function isoDaysFromNow(days){ const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString(); }

// ---------- CSV / XLSX parsing utilities ----------
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

function parseCSVText(text){
  // robust CSV parser that handles quoted commas
  const rows = [];
  const lines = text.split(/\r\n|\n/);
  for (const line of lines) {
    if (!line) continue;
    const cols = [];
    let cur = "", inQ=false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"'){ cur += '"'; i++; continue; }
      if (ch === '"'){ inQ = !inQ; continue; }
      if (ch === ',' && !inQ){ cols.push(cur); cur=""; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

// ---------- vendor normalization (returns list of unified items) ----------
function detectVendorByHeaders(headersLower){
  if (headersLower.some(h => h.includes("wt retail") || h.includes("scan lp"))) return "worldly";
  if (headersLower.some(h => h.includes("lot id") || h.includes("item #") || h.includes("unit retail") || h.includes("ext. retail"))) return "bstock";
  if (headersLower.some(h => h.includes("title") && headersLower.some(h2 => h2.includes("retailprice") || h2.includes("upc")))) return "direct";
  if (headersLower.includes("sku") && headersLower.includes("retail")) return "worldly";
  return "unknown";
}

function normalizeRowsToItems(rows){
  // Rows is array-of-arrays with header row at index 0
  const headers = rows[0].map(h => (h||"").toString().trim());
  const idx = {}; headers.forEach((h,i)=> idx[h.toLowerCase()] = i);
  const headersLower = headers.map(h => (h||"").toString().toLowerCase());
  const vendor = detectVendorByHeaders(headersLower);

  const items = [];
  for (let r = 1; r < rows.length; r++){
    const row = rows[r];
    if (!row || row.length === 0) continue;
    // fallback getters
    const get = (names) => {
      for (const n of names){
        const k = (""+n).toLowerCase();
        if (idx[k] !== undefined && row[idx[k]] !== undefined) return row[idx[k]];
      }
      return "";
    };

    let item = {};
    if (vendor === "bstock"){
      item.sku = (get(["Item #","Item #","item #","item#","SKU","Item ID"])||"").toString().trim();
      item.name = (get(["Item Description","Title","Product Name"])||"").toString().trim();
      item.brand = (get(["Brand"])||"").toString().trim();
      item.retail = safeNum(get(["Unit Retail","Unit retail","UnitRetail","Unit Retail Price","UnitRetailPrice"]));
      item.qty = parseInt(get(["Qty","Quantity","qty"])||1) || 1;
      item.image = (get(["Image","Photo","Image URL","ImageURL"])||"").toString().trim();
      item.vendor = "bstock";
      item.raw = row;
    } else if (vendor === "direct") {
      item.sku = (get(["UPC","upc","SKU","Sku"])||"").toString().trim();
      item.name = (get(["Title","Product Name","Item Description"])||"").toString().trim();
      item.brand = (get(["Manufacturer","Brand"])||"").toString().trim();
      item.retail = safeNum(get(["RetailPrice","Retail Price","Retail"]));
      item.qty = parseInt(get(["Quantity","Qty","quantity"])||1) || 1;
      item.image = (get(["Image","Photo","Image URL"])||"").toString().trim();
      item.vendor = "direct";
      item.raw = row;
    } else {
      // worldly or unknown: flexible mapping by common names
      item.sku = (get(["SKU","Sku","sku","UPC","Item ID","Item #"])||"").toString().trim();
      item.name = (get(["Item Description","Item Name","Title","Name"])||"").toString().trim();
      item.brand = (get(["Brand"])||"").toString().trim();
      item.retail = safeNum(get(["Retail Value","Retail","WT Retail","RetailPrice","Retail Price","Unit Retail"]));
      item.qty = parseInt(get(["Qty","Quantity","WT QTY","Qty (each)"])||1) || 1;
      item.image = (get(["Image","Image URL","Photo","Product Image","ImageURL"])||"").toString().trim();
      item.vendor = "worldly";
      item.raw = row;
    }

    // ensure some defaults
    item.retail = Number(item.retail || 0);
    if (!item.qty || isNaN(item.qty)) item.qty = 1;
    items.push(item);
  }
  return items;
}

// ---------- file handler ----------
async function handleFile(file){
  const fname = file.name.toLowerCase();
  if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) {
    await loadSheetJS();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const ws = workbook.Sheets[sheetName];
    const arr = XLSX.utils.sheet_to_json(ws, { header:1, raw:false });
    return normalizeRowsToItems(arr);
  } else {
    const text = await file.text();
    const rows = parseCSVText(text);
    return normalizeRowsToItems(rows);
  }
}

// ---------- Unsplash fetch with simple rate-limit handling ----------
const unsplashCache = new Map();
async function fetchUnsplash(query){
  if (!query) return null;
  if (unsplashCache.has(query)) return unsplashCache.get(query);
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${UNSPLASH_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Unsplash status:", res.status);
      return null;
    }
    const j = await res.json();
    const img = j.results && j.results[0] && (j.results[0].urls.regular || j.results[0].urls.small);
    if (img) unsplashCache.set(query, img);
    return img || null;
  } catch (e) {
    console.warn("Unsplash error:", e);
    return null;
  }
}

// ---------- upload image to WP media (returns media id) ----------
async function uploadImageToWP(imageUrl, filename){
  try {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error("Failed to download image");
    const blob = await r.blob();
    const fd = new FormData();
    fd.append("file", blob, filename || "photo.jpg");

    const res = await fetch(`${WC_API_BASE}/media`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`) },
      body: fd
    });
    const json = await res.json();
    if (!res.ok) {
      console.warn("Media upload failed:", res.status, json);
      return null;
    }
    return json.id || null;
  } catch (e) {
    console.warn("uploadImageToWP error:", e);
    return null;
  }
}

// ---------- category sync: fetch existing categories and create as needed ----------
let cachedCategories = null;
async function loadCategories(){
  if (cachedCategories) return cachedCategories;
  try {
    const res = await fetch(`${WC_API_BASE}/products/categories?per_page=100`, {
      headers: { Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`) }
    });
    const json = await res.json();
    if (Array.isArray(json)) {
      cachedCategories = json;
      return cachedCategories;
    }
    cachedCategories = [];
    return cachedCategories;
  } catch (e) {
    console.warn("loadCategories error:", e);
    cachedCategories = [];
    return cachedCategories;
  }
}

async function ensureCategory(name){
  if (!name) return null;
  const list = await loadCategories();
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
    if (!res.ok) { console.warn("Create category failed:", res.status, data); return null; }
    // add to cache
    cachedCategories = cachedCategories || [];
    cachedCategories.push(data);
    return data.id;
  } catch (e) {
    console.warn("ensureCategory error:", e);
    return null;
  }
}

// ---------- detect category name from text ----------
function detectCategoryName(text){
  const t = (text || "").toLowerCase();
  if (t.includes("vanity") || t.includes("bath") || t.includes("toilet")) return "Bath";
  if (t.includes("kitchen") || t.includes("sink") || t.includes("faucet")) return "Kitchen and Bath";
  if (t.includes("light") || t.includes("lamp") || t.includes("chandelier")) return "Lighting";
  if (t.includes("washer") || t.includes("dryer") || t.includes("fridge") || t.includes("refrigerator") || t.includes("oven")) return "Appliances";
  if (t.includes("tool") || t.includes("drill") || t.includes("saw") || t.includes("compressor")) return "Tools";
  if (t.includes("outdoor") || t.includes("patio") || t.includes("garden")) return "Outdoor & Garden";
  if (t.includes("furniture") || t.includes("chair") || t.includes("sofa") || t.includes("table")) return "Furniture";
  return "General Merchandise";
}

// ---------- create product (tries auction type first, falls back) ----------
async function createProductWithImageAndAuction(it, index, total){
  const title = it.name || it["Item Description"] || it["Title"] || "Untitled";
  const sku = it.sku || it.SKU || "";
  const qty = Number(it.qty || it.Quantity || 1) || 1;
  // cost (starting price) = item cost if present; else fallback to retail*0.25
  let cost = 0;
  if (it.Price) cost = safeNum(it.Price);
  else if (it.Cost) cost = safeNum(it.Cost);
  else if (it.retail) cost = safeNum(it.retail) * 0.25;
  cost = Number(cost.toFixed(2));

  const categoryName = detectCategoryName(it.category || it.Department || it["Dept. Code"] || title);

  // image selection: prefer manifest image if present and valid
  let imageUrl = (it.image || it["Image"] || it["Image URL"] || it["Photo"] || "").toString().trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)){
    // fallback to Unsplash search (first try brand + title)
    const query = ((it.brand || it.Brand || "") + " " + title).trim() || title;
    imageUrl = await fetchUnsplash(query);
    await delay(IMAGE_DELAY_MS);
  }

  // upload image to WP media (if available)
  let mediaId = null;
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    mediaId = await uploadImageToWP(imageUrl, `${sku || title.substring(0,30)}.jpg`);
    await delay(IMAGE_DELAY_MS);
  }

  // build auction start/end ISO
  const startISO = new Date().toISOString();
  const endISO = isoDaysFromNow(AUCTION_DAYS);

  // attempt to create as auction product first
  // Many auction plugins expect type 'auction' — try it, and if rejected, fallback to simple + meta fields
  const auctionPayload = {
    name: title,
    type: "auction",
    regular_price: String(cost.toFixed(2)),
    sku: sku || undefined,
    manage_stock: true,
    stock_quantity: qty,
    description: it.Description || it["Item Description"] || "",
    categories: [],
    images: mediaId ? [{ id: mediaId }] : []
    // We'll add meta_data below if needed
  };

  // add likely auction meta fields (many plugins store custom meta; we include common ones)
  const auctionMeta = [
    { key: "auction_start_date", value: startISO },
    { key: "auction_end_date", value: endISO },
    { key: "auction_start_price", value: String(cost.toFixed(2)) },
    // YITH-like keys (common)
    { key: "_yith_auction_duration", value: String(AUCTION_DAYS) },
    { key: "_yith_auction_start_date", value: startISO },
    { key: "_yith_auction_end_date", value: endISO },
    { key: "yith_auction_start_price", value: String(cost.toFixed(2)) },
    // fallback meta entries
    { key: "calculated_start_price", value: String(cost.toFixed(2)) },
  ];
  auctionPayload.meta_data = auctionMeta;

  // Ensure category exists (create if needed) and add to payload
  const catId = await ensureCategory(categoryName);
  if (catId) auctionPayload.categories = [{ id: catId }];

  // Try POST as auction
  try {
    const attempt = await fetch(`${WC_API_BASE}/products`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(auctionPayload)
    });

    const txt = await attempt.text();
    if (attempt.ok) {
      let json; try { json = JSON.parse(txt); } catch(e){ json = txt; }
      console.log(`(${index}/${total}) Created AUCTION product:`, sku, json.id || json);
      return { success:true, type:"auction", resp: json };
    } else {
      console.warn(`(${index}/${total}) Auction create rejected:`, attempt.status, txt);
      // fallthrough to simple fallback
    }
  } catch (e) {
    console.warn("Auction create error:", e);
  }

  // Fallback: create as simple product and include auction meta keys (to let auction plugin pick them up)
  const simplePayload = {
    name: title,
    type: "simple",
    regular_price: String(cost.toFixed(2)),
    sku: sku || undefined,
    manage_stock: true,
    stock_quantity: qty,
    description: it.Description || it["Item Description"] || "",
    categories: [],
    images: mediaId ? [{ id: mediaId }] : [],
    meta_data: auctionMeta // include same meta for plugin compatibility
  };
  if (catId) simplePayload.categories = [{ id: catId }];

  // Try POST simple product (with meta)
  for (let attempt=0; attempt<=UPLOAD_RETRIES; attempt++){
    try {
      const res = await fetch(`${WC_API_BASE}/products`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(simplePayload)
      });
      const txt = await res.text();
      if (res.ok) {
        let json; try { json = JSON.parse(txt); } catch(e){ json = txt; }
        console.log(`(${index}/${total}) Created SIMPLE product (with auction meta):`, sku, json.id || json);
        return { success:true, type:"simple", resp: json };
      } else {
        console.warn(`(${index}/${total}) Simple create failed:`, res.status, txt);
        // if rate limited, wait then retry
        if (res.status === 429) await delay(2000 * (attempt+1));
        else break;
      }
    } catch (err){
      console.warn(`(${index}/${total}) Product create exception:`, err);
      await delay(1000 * (attempt+1));
    }
  }

  return { success:false };
}

// ---------- main flow ----------
let importedItems = [];

importBtn?.addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) { showToast("No file selected"); return; }
  showToast("Parsing file...");
  try {
    importedItems = await handleFile(file);
    if (!importedItems || !importedItems.length) {
      showToast("No items parsed from file");
      return;
    }
    console.log("Imported items:", importedItems.length, importedItems.slice(0,6));
    showToast(`Imported ${importedItems.length} items`);
  } catch (e){
    console.error("Parse error:", e);
    showToast("Failed to parse file");
  }
});

uploadBtn?.addEventListener("click", async () => {
  if (!importedItems || !importedItems.length) { showToast("No items loaded"); return; }

  showToast("Starting upload — check console for progress (this may take a while)");
  console.log("Uploading items:", importedItems.length);

  // ensure category cache initial load
  await loadCategories();

  let idx = 0;
  for (const it of importedItems){
    idx++;
    try {
      const res = await createProductWithImageAndAuction(it, idx, importedItems.length);
      if (!res || !res.success) {
        console.warn(`Item ${idx} failed:`, it.sku || it.name || it);
      }
    } catch (e){
      console.error(`Error uploading item ${idx}:`, e);
    }
    // small delay to avoid hitting API limits
    await delay(UPLOAD_DELAY_MS);
  }

  showToast("Upload run finished. Check console for full results.", 8000);
  console.log("Upload finished.");
});
