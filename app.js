// app.js - Unified importer / Unsplash image fetch / WooCommerce uploader
// --------------------------------------------------------------------

// ---------- CONFIG ----------
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw"; // your key
const WOO_API_BASE = "https://bidbarn.bid/wp-json/wc/v3";
const WOO_CONSUMER_KEY = "ck_d55a9ed6d41a3d9a81ca11c768784466e295d2ff";
const WOO_CONSUMER_SECRET = "cs_e758596896402d908099ff144cb09bd158ca4d21";

// delay between image fetches / uploads (ms)
const IMAGE_DELAY = 200;
const UPLOAD_DELAY = 500;
const UPLOAD_RETRIES = 2;

// ---------- DOM ----------
const importEl = document.getElementById("importBtn"); // file input
const exportBtn = document.getElementById("exportBtn");
const uploadBtn = document.getElementById("uploadBtn");
const toast = document.getElementById("toast");

// ---------- Helpers ----------
function showToast(msg, ms = 3500) {
  if (!toast) { console.log("toast:", msg); return; }
  toast.textContent = msg;
  toast.style.opacity = 1;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.style.opacity = 0, ms);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function safeNum(x) {
  if (typeof x === "number") return x;
  if (!x) return 0;
  const n = Number(String(x).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ---------- Dynamic script loader (for XLSX support via SheetJS) ----------
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = (e) => reject(e);
    document.head.appendChild(s);
  });
}

// ---------- Simple CSV parser (handles commas inside quotes) ----------
function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r\n|\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

// ---------- Vendor-specific parsers -> unified shape ----------
function detectVendor(headersLower) {
  // checks for hints in header names
  if (headersLower.some(h => h.includes("scan lp") || h.includes("wt retail") || h.includes("wt qty") || h.includes("wt retail"))) return "worldly";
  if (headersLower.some(h => h.includes("lot id") || h.includes("item #") || h.includes("unit retail") || h.includes("ext. retail"))) return "bstock";
  if (headersLower.some(h => h.includes("title") && headersLower.some(h2 => h2.includes("manufacturer") || h2.includes("retailprice")))) return "direct";
  // fallback guessing by header names
  if (headersLower.includes("sku") && headersLower.includes("retail")) return "worldly";
  return "unknown";
}

function normalizeFromWorldly(rows) {
  // rows: array of arrays, first row is header
  const headers = rows[0].map(h => h.trim());
  const idx = {}; headers.forEach((h,i)=> idx[h.toLowerCase()] = i);
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const sku = (r[idx["sku"]] || r[idx["upc"]] || r[idx["item id"]] || "").toString().trim();
    const name = (r[idx["item description"]] || r[idx["name"]] || r[idx["title"]] || "").toString().trim();
    const retail = safeNum(r[idx["retail"]] || r[idx["wt retail"]] || r[idx["retail value"]] || r[idx["retail price"]] || r[idx["unit retail"]]);
    const qty = parseInt(r[idx["qty"]] || r[idx["quantity"]] || r[idx["wt qty"]] || 1) || 1;
    const brand = (r[idx["brand"]] || "").toString().trim();
    const model = (r[idx["model #"]] || r[idx["model"]] || "").toString().trim();
    items.push({ sku, name, brand, model, retail, qty, vendor: "worldly" });
  }
  return items;
}

function normalizeFromBstock(rows) {
  const headers = rows[0].map(h => h.trim());
  const idx = {}; headers.forEach((h,i)=> idx[h.toLowerCase()] = i);
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const sku = (r[idx["item #"]] || r[idx["item#"]] || r[idx["sku"]] || "").toString().trim();
    const name = (r[idx["item description"]] || r[idx["title"]] || "").toString().trim();
    const retail = safeNum(r[idx["unit retail"]] || r[idx["retailprice"]] || r[idx["retail"]]);
    const qty = parseInt(r[idx["qty"]] || r[idx["quantity"]] || 1) || 1;
    const brand = (r[idx["brand"]] || "").toString().trim();
    const model = (r[idx["model"]] || r[idx["model #"]] || "").toString().trim();
    items.push({ sku, name, brand, model, retail, qty, vendor: "bstock" });
  }
  return items;
}

function normalizeFromDirect(rows) {
  const headers = rows[0].map(h => h.trim());
  const idx = {}; headers.forEach((h,i)=> idx[h.toLowerCase()] = i);
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const sku = (r[idx["upc"]] || r[idx["sku"]] || "").toString().trim();
    const name = (r[idx["title"]] || r[idx["item description"]] || "").toString().trim();
    const retail = safeNum(r[idx["retailprice"]] || r[idx["retail"]]);
    const qty = parseInt(r[idx["quantity"]] || r[idx["qty"]] || 1) || 1;
    const brand = (r[idx["manufacturer"]] || r[idx["brand"]] || "").toString().trim();
    const model = (r[idx["model"]] || "").toString().trim();
    items.push({ sku, name, brand, model, retail, qty, vendor: "direct" });
  }
  return items;
}

// ---------- Unified CSV/XLSX file handler ----------
async function handleFile(file) {
  const fname = file.name.toLowerCase();
  const text = await file.text();

  // If XLSX/xls, load SheetJS then parse to rows
  if (fname.endsWith(".xlsx") || fname.endsWith(".xls")) {
    await loadScriptOnce("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js");
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: "array" });
    // take first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const arr = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    if (!arr || !arr.length) { showToast("No sheet data"); return []; }
    const headersLower = arr[0].map(h => (h||"").toString().toLowerCase());
    const vendor = detectVendor(headersLower);
    if (vendor === "bstock") return normalizeFromBstock(arr);
    if (vendor === "worldly") return normalizeFromWorldly(arr);
    if (vendor === "direct") return normalizeFromDirect(arr);
    // fallback to try direct normalization
    return normalizeFromWorldly(arr);
  }

  // CSV parsing
  const rows = parseCSV(text);
  if (!rows.length) { showToast("CSV empty"); return []; }
  const headersLower = rows[0].map(h => (h||"").toString().toLowerCase());
  const vendor = detectVendor(headersLower);
  if (vendor === "bstock") return normalizeFromBstock(rows);
  if (vendor === "worldly") return normalizeFromWorldly(rows);
  if (vendor === "direct") return normalizeFromDirect(rows);
  // fallback: if contains "item #" treat as bstock; otherwise worldy
  if (headersLower.some(h => h.includes("item #") || h.includes("unit retail"))) return normalizeFromBstock(rows);
  return normalizeFromWorldly(rows);
}

// ---------- Unsplash image fetch (cached, simple) ----------
const imgCache = new Map();

async function fetchUnsplashImage(query) {
  if (!query) return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent("no+query")}`;
  if (imgCache.has(query)) return imgCache.get(query);
  // Use search endpoint; small result
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${UNSPLASH_ACCESS_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Unsplash status", res.status);
      // fallback placeholder
      const ph = `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(query)}`;
      imgCache.set(query, ph);
      return ph;
    }
    const j = await res.json();
    const src = (j.results && j.results[0] && (j.results[0].urls.small || j.results[0].urls.regular)) || `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(query)}`;
    imgCache.set(query, src);
    return src;
  } catch (e) {
    console.warn("Unsplash fetch failed", e);
    const ph = `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(query)}`;
    imgCache.set(query, ph);
    return ph;
  }
}

// ---------- WooCommerce upload ----------
function wooAuthHeader() {
  return "Basic " + btoa(`${WOO_CONSUMER_KEY}:${WOO_CONSUMER_SECRET}`);
}

async function createWooProduct(product) {
  const url = `${WOO_API_BASE}/products`;
  for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": wooAuthHeader()
        },
        body: JSON.stringify(product)
      });
      if (res.ok) {
        const j = await res.json();
        return { success: true, result: j };
      } else {
        const txt = await res.text();
        console.warn("Woo POST failed:", res.status, txt);
        // Rate-limited? if 429 or 403 with rate message, wait and retry
        if (res.status === 429 || res.status === 403) {
          await delay(2000);
          continue;
        }
        return { success: false, status: res.status, text: txt };
      }
    } catch (e) {
      console.warn("Network error during Woo POST:", e);
      await delay(1500);
    }
  }
  return { success: false, status: "retries_exhausted" };
}

// ---------- Main workflow ----------
let importedItems = []; // normalized items

importEl?.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return showToast("No file selected");
  showToast("Parsing file...");
  try {
    importedItems = await handleFile(file);
    if (!importedItems.length) {
      showToast("No items parsed from file.");
      return;
    }
    console.log("Imported items:", importedItems);
    showToast(`Imported items: ${importedItems.length}`, 4000);
  } catch (err) {
    console.error(err);
    showToast("Failed to parse file");
  }
});

// Export enriched CSV locally (for backup) - optional button usage
exportBtn?.addEventListener("click", async () => {
  if (!importedItems.length) return showToast("No items loaded");
  showToast("Generating enriched CSV...");
  // build enriched rows with placeholder values
  const enriched = importedItems.map(it => {
    return {
      sku: it.sku || "",
      name: it.name || "",
      brand: it.brand || "",
      model: it.model || "",
      retail: (it.retail||0).toFixed(2),
      qty: it.qty || 1,
      vendor: it.vendor || ""
    };
  });
  // CSV
  const keys = Object.keys(enriched[0]);
  const rows = [keys.join(",")].concat(enriched.map(r => keys.map(k => `"${String(r[k]||"").replace(/"/g,'""')}"`).join(",")));
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `enriched_export_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("CSV ready (downloaded).");
});

// Upload button - core: compute weighted costs, fetch images, post to WooCommerce
uploadBtn?.addEventListener("click", async () => {
  if (!importedItems.length) return showToast("No items loaded to upload");

  // Determine total retail value across the imported items
  const totalRetail = importedItems.reduce((s,it) => s + (safeNum(it.retail) * (it.qty||1)), 0);
  console.log("Total retail:", totalRetail);

  // Ask user for total pallet cost if not known
  let palletCost = null;
  // try to find a column like "price" "your price" - otherwise prompt
  // (this is a simple heuristic; you can change as needed)
  if (importedItems.length && importedItems[0].palletCost) {
    palletCost = safeNum(importedItems[0].palletCost);
  } else {
    const p = prompt(`Enter TOTAL pallet cost to allocate across ${importedItems.length} items (used to weight start prices). If you prefer one-off pricing, cancel and we'll use item cost if present.`, "");
    if (p !== null && p !== "") palletCost = safeNum(p);
  }

  if (!palletCost || palletCost <= 0) {
    const proceed = confirm("No valid pallet cost provided. Proceed and use item-level price = retail * 0.25? (Cancel to abort)");
    if (!proceed) return showToast("Upload aborted.");
  }

  showToast("Preparing upload... (check console for progress)");
  console.log("Uploading items:", importedItems.length);

  // iterate and upload
  let i = 0;
  for (const it of importedItems) {
    i++;
    // compute weighted cost (option 2)
    const itemRetail = safeNum(it.retail) * (it.qty || 1);
    let startPrice = 0;
    if (palletCost && totalRetail > 0) {
      startPrice = (itemRetail / totalRetail) * palletCost;
    } else {
      // fallback: 25% retail if no pallet cost
      startPrice = safeNum(it.retail) * 0.25;
    }
    startPrice = Number((startPrice).toFixed(2));

    // compute BIN (80% of retail) for convenience
    const bin80 = Number((safeNum(it.retail) * 0.8).toFixed(2));

    // fetch image (try by name + brand first)
    const imageQuery = (it.brand ? `${it.brand} ${it.name}` : it.name) || (it.sku || "product");
    const imageUrl = await fetchUnsplashImage(imageQuery);
    await delay(IMAGE_DELAY);

    // build description
    let desc = it.name || "";
    if (it.model) desc += `\nModel: ${it.model}`;
    if (it.brand) desc += `\nBrand: ${it.brand}`;

    // WooCommerce product payload
    const productPayload = {
      name: it.name || ("Product " + (it.sku||"")),
      type: "simple",
      regular_price: String(startPrice.toFixed(2)),
      sku: it.sku || undefined,
      stock_quantity: Number(it.qty || 1),
      manage_stock: true,
      description: desc,
      // category: Kitchen and Bath - ensure array of {name:...}
      categories: [ { name: "Kitchen and Bath" } ],
      images: [ { src: imageUrl } ],
      meta_data: [
        { key: "vendor_source", value: it.vendor || "" },
        { key: "calculated_start_price", value: String(startPrice) },
        { key: "bin_80", value: String(bin80) }
      ],
      status: "publish"
    };

    // do upload
    console.log(`[${i}/${importedItems.length}] Uploading SKU: ${it.sku} -> startPrice: ${startPrice} image: ${imageUrl}`);
    try {
      const res = await createWooProduct(productPayload);
      if (res.success) {
        console.log(`✅ Uploaded: ${it.sku || it.name}`, res.result);
      } else {
        console.warn(`❌ Failed to upload ${it.sku || it.name}:`, res);
      }
    } catch (err) {
      console.error("Upload exception:", err);
    }

    // friendly pacing
    await delay(UPLOAD_DELAY);
  }

  showToast("Upload run finished — check console for details", 6000);
  console.log("Upload complete");
});
