// app.js — Full Sir Scansalot (imports, scanning, pricing, DuckDuckGo/placeholder images, Woo export)
// Overwrite your existing app.js with this complete file.

// --------------------
// Utility & DOM setup
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // Elements (match item.html)
  const el = {
    truckCost: $("truckCost"),
    palletCost: $("palletCost"),
    palletLabel: $("palletLabel"),
    targetItems: $("targetItems"),
    startPct: $("startPct"),
    startMode: $("startMode"),
    startPctView: $("startPctView"),
    palletId: $("palletId"),
    count: $("count"),
    cpi: $("cpi"),
    retailLast: $("retailLast"),
    binLast: $("binLast"),
    live: $("live"),
    snapCanvas: $("snapCanvas"),
    upcInput: $("upcInput"),
    lastItem: $("lastItem"),
    tbody: $("tbody"),
    startCam: $("startCam"),
    stopCam: $("stopCam"),
    snapBtn: $("snapBtn"),
    addManual: $("addManual"),
    saveSession: $("saveSession"),
    newPallet: $("newPallet"),
    exportCsv: $("exportCsv"),
    clearPallet: $("clearPallet"),
    manifestBtn: $("manifestBtn"),
    manifestFile: $("manifestFile"),
    worldlyBtn: $("worldlyBtn"),
    worldlyFile: $("worldlyFile"),
    toastHost: $("toast"),
  };

  // Toast
  function toast(msg, ms = 1400) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), ms);
  }

  // --------------------
  // Dedup guard
  // --------------------
  const recently = new Map();
  const DEDUPE_MS = 3000;
  function isRecentlyScanned(code) {
    const now = Date.now();
    for (const [k, t] of recently) if (t <= now) recently.delete(k);
    const t = recently.get(code);
    return t && t > now;
  }
  function markScanned(code) {
    recently.set(code, Date.now() + DEDUPE_MS);
  }

  // --------------------
  // Pack detection
  // --------------------
  function detectPackQty(title = "") {
    const patterns = [
      /pack of\s*(\d+)/i,     // "pack of 12"
      /(\d+)\s*pack\b/i,      // "12 pack"
      /(\d+)\s*pk\b/i,        // "12 pk"
      /(\d+)\s*ct\b/i,        // "12 ct"
      /(\d+)\s*count\b/i,     // "12 count"
      /x\s*(\d+)\b/i          // "x12"
    ];
    for (const re of patterns) {
      const m = String(title).match(re);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > 1) return n;
      }
    }
    return 1;
  }

  // --------------------
  // Local retail cache
  // --------------------
  const retailCacheKey = "bb_retail_cache_v1";
  let retailCache = {};
  try { retailCache = JSON.parse(localStorage.getItem(retailCacheKey) || "{}"); } catch {}
  function saveRetailCache(){ localStorage.setItem(retailCacheKey, JSON.stringify(retailCache)); }

  // --------------------
  // App state
  // --------------------
  const SKEY = "bb_pallet_v8_full";
  const state = {
    truckCost: 0,
    palletCost: 0,
    palletLabel: "",
    targetItems: 0,
    startPct: 0,
    startMode: "pct",
    items: [] // each item: { upc, asin, title, brand, retail, packQty, desc, startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit, qty, userImg, amazonUrl, sku, scanLp, model, source, wholesale }
  };

  function saveState(){ localStorage.setItem(SKEY, JSON.stringify(state)); }
  function loadState(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); }catch{} }

  function totalUnits() { return state.items.reduce((s,it)=> s + (Number(it.qty)||0), 0); }
  function currentCPI(){
    const denom = (state.targetItems && state.targetItems > 0) ? state.targetItems : Math.max(1, totalUnits());
    return state.palletCost ? (state.palletCost / denom) : 0;
  }

  // --------------------
  // Price computations
  // --------------------
  function computePricesForNewItem(retailPerUnit) {
    const denom = (state.targetItems && state.targetItems > 0) ? state.targetItems : Math.max(1, totalUnits() + 1);
    const cpiNew = state.palletCost ? (state.palletCost / denom) : 0;

    let startPrice = 0, startPctComputed = 0;
    if (state.startMode === "dollar") {
      startPrice = 1;
      startPctComputed = retailPerUnit > 0 ? (1 / retailPerUnit) : 0;
    } else if (state.startPct && state.startPct > 0) {
      startPctComputed = state.startPct;
      startPrice = retailPerUnit > 0 ? (retailPerUnit * state.startPct) : 0;
    } else {
      startPrice = cpiNew;
      startPctComputed = retailPerUnit > 0 ? (cpiNew / retailPerUnit) : 0;
    }

    const binPrice = retailPerUnit ? (retailPerUnit * 0.80) : 0;
    const goalSale = retailPerUnit ? (retailPerUnit * 0.38) : 0;
    const buyerFee = goalSale * 0.12;
    const profit   = (goalSale + buyerFee) - startPrice;

    return { startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit };
  }

  // --------------------
  // Rendering
  // --------------------
  function repaint(){
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = totalUnits();
    if (el.cpi) el.cpi.textContent = Number(currentCPI()).toFixed(2);

    let pctHeader = state.startPct > 0 ? (state.startPct * 100) : 0;
    if (!(pctHeader > 0) && state.items[0] && state.items[0].startPctComputed > 0) {
      pctHeader = state.items[0].startPctComputed * 100;
    }
    if (el.startPctView) el.startPctView.textContent = `${Math.round(pctHeader)}%`;

    if (el.retailLast) el.retailLast.textContent = state.items[0] ? Number(state.items[0].retail||0).toFixed(2) : "0.00";
    if (el.binLast) el.binLast.textContent = state.items[0] ? Number(state.items[0].binPrice||0).toFixed(2) : "0.00";

    if (!el.tbody) return;
    el.tbody.innerHTML = "";
    state.items.forEach((it,i)=>{
      const tr = document.createElement("tr");
      if ((it.profit||0) > 0) tr.classList.add("profit-positive");
      if ((it.profit||0) < 0) tr.classList.add("profit-negative");

      const perUnit = (it.retail && it.retail > 0) ? `$${Number(it.retail).toFixed(2)}` : "$0.00";
      const packNote = (it.packQty && it.packQty > 1) ? ` <span class="small" style="color:#9aa4b2;">(pack ${it.packQty})</span>` : "";
      const retailHtml = (it.retail && it.retail > 0) ? `${perUnit}${packNote}` : `$0.00 <button class="qbtn" data-i="${i}" data-act="set-retail">Set</button>`;

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${it.upc || ""}</td>
        <td>${it.title || it.name || ""}</td>
        <td>${it.brand || ""}</td>
        <td>${retailHtml}</td>
        <td>$${Number(it.startPrice || 0).toFixed(2)}${(it.startPctComputed>0)?` <span class="small" style="color:#9aa4b2;">(${Math.round(it.startPctComputed*100)}%)</span>`:""}</td>
        <td>$${Number(it.binPrice || 0).toFixed(2)}</td>
        <td>$${Number(it.goalSale || 0).toFixed(2)}</td>
        <td>$${Number(it.buyerFee || 0).toFixed(2)}</td>
        <td>$${Number(it.profit || 0).toFixed(2)}</td>
        <td>
          <div class="qtywrap">
            <button class="qbtn" data-i="${i}" data-delta="-1">−</button>
            <input class="qtyinp" data-i="${i}" type="number" min="1" value="${it.qty || 1}">
            <button class="qbtn" data-i="${i}" data-delta="1">+</button>
          </div>
        </td>
        <td>${it.userImg ? `<img class="thumb" src="${it.userImg}" />` : (it.image ? `<img class="thumb" src="${it.image}" />` : "")}</td>
        <td>${it.sku || ""}</td>
        <td>${it.scanLp || ""}</td>
        <td>${it.desc || ""}</td>
        <td>${it.model || ""}</td>
        <td>${it.wtQty || ""}</td>
        <td>${it.wtRetail ? `$${Number(it.wtRetail).toFixed(2)}` : ""}</td>
      `;
      el.tbody.appendChild(tr);
    });
  }

  function setLast(it){
    if (!el.lastItem) return;
    const img = it.userImg || it.image || "";
    const shortDesc = (it.desc || it.title || "").slice(0, 180);
    const packNote = (it.packQty && it.packQty > 1) ? ` (per unit, pack ${it.packQty})` : "";
    el.lastItem.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        ${img ? `<img class="thumb" src="${img}" />` : ""}
        <div>
          <strong>${it.title || it.name || "Item"}</strong>
          <div class="small">UPC: ${it.upc || ""} • SKU: ${it.sku || ""} • Brand: ${it.brand || ""} • Qty: ${it.qty || 1}</div>
          <div class="small">
            Retail $${(it.retail||0).toFixed(2)}${packNote} • Start $${(it.startPrice||0).toFixed(2)}${(it.startPctComputed>0)?` (${Math.round(it.startPctComputed*100)}% of retail)`:""}
            • BIN 80% $${(it.binPrice||0).toFixed(2)}
          </div>
          <div class="small">
            Goal Sale (38%) $${(it.goalSale||0).toFixed(2)} • Buyer Fee (12%) $${(it.buyerFee||0).toFixed(2)}
            • <b>Profit</b> $${(it.profit||0).toFixed(2)}
          </div>
          ${shortDesc ? `<div class="small" style="margin-top:6px;max-width:600px;">Desc: ${shortDesc}${(it.desc||"").length>180?'…':''}</div>` : ""}
        </div>
      </div>
    `;
  }

  // --------------------
  // Add item (from UPC lookup / manual / import)
  // --------------------
  let scanBusy = false;

  async function addUPC(upcIn) {
    let upc = String(upcIn || "").replace(/\D/g, "");
    if (!upc) { toast("No code provided"); return; }
    if (upc.length === 13 && upc.startsWith("0")) upc = upc.slice(1);
    if (!(upc.length === 12 || upc.length === 13)) { toast("Code too short — rescan"); return; }
    if (scanBusy) return;
    if (isRecentlyScanned(upc)) { toast("Already captured"); return; }
    scanBusy = true;

    // Prepare fields
    let asin = "", title = "", brand = "", retail = 0, amazonUrl = "", desc = "", packQty = 1;

    // 1) Check retail cache
    if (retailCache[upc] && Number(retailCache[upc]) > 0) {
      retail = Number(retailCache[upc]);
    } else {
      // 2) Try backend lookup (if available)
      try {
        const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
        const j = await r.json();
        if (j && j.ok) {
          asin = j.asin || "";
          title = j.title || "";
          brand = j.brand || "";
          retail = Number(j.retail || 0);
          amazonUrl = j.amazon_url || "";
          desc = j.description || "";

          packQty = detectPackQty(title);
          if (packQty > 1 && retail > 0) {
            retail = retail / packQty;
          }
          if (retail > 0) { retailCache[upc] = retail; saveRetailCache(); }
        }
      } catch (err) {
        // no backend or failed — safe to continue
        console.warn("Lookup error (ignored)", err);
      }
    }

    if (!desc) desc = (title || brand) ? `${brand} ${title} — condition not verified. See photos.` : "Condition not verified. See photos.";
    const calc = computePricesForNewItem(retail);

    const item = {
      upc, asin, title, name: title, brand,
      retail, packQty: packQty || 1, desc,
      startPrice: calc.startPrice,
      startPctComputed: calc.startPctComputed,
      binPrice: calc.binPrice,
      goalSale: calc.goalSale,
      buyerFee: calc.buyerFee,
      profit: calc.profit,
      qty: 1, userImg: "", amazonUrl,
      sku: upc, scanLp: "", model: "", source: "scan", wholesale: 0, image: ""
    };

    state.items.unshift(item);
    saveState();
    setLast(item);
    repaint();
    toast("✅ Item captured!");
    markScanned(upc);
    setTimeout(()=>{ scanBusy = false; }, 900);
  }

  // --------------------
  // CSV parse utilities
  // --------------------
  function splitSafe(line, delimiter = ",") {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  }
  function parseRows(text) {
    const rowsRaw = text.replace(/\r/g, "").split("\n").map(r => r.trim()).filter(r => r.length > 0);
    if (!rowsRaw.length) return [];
    const delim = rowsRaw.some(r => r.indexOf("\t") >= 0) ? "\t" : ",";
    return rowsRaw.map(r => splitSafe(r, delim));
  }

  // --------------------
  // Import B-Stock (CSV)
  // --------------------
  if (el.manifestFile) {
    el.manifestFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const rows = parseRows(ev.target.result);
          if (!rows.length) { toast("No data in file"); e.target.value=""; return; }
          const header = rows[0].map(h => h.toLowerCase());
          // try to map columns gracefully
          const upcIdx = header.findIndex(h => h.includes("upc") || h.includes("sku"));
          const nameIdx = header.findIndex(h => h.includes("name") || h.includes("title"));
          const brandIdx = header.findIndex(h => h.includes("brand"));
          const retailIdx = header.findIndex(h => h.includes("retail") || h.includes("price"));
          const qtyIdx = header.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("stock"));

          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
            const cols = rows[i];
            if (!cols || cols.length < 2) continue;
            const upc = (cols[upcIdx] || "").trim();
            const name = (cols[nameIdx] || "").trim();
            const brand = (cols[brandIdx] || "").trim();
            const retail = Number((cols[retailIdx] || "").replace(/[^\d.]/g, "")) || 0;
            const qty = parseInt((cols[qtyIdx] || "1")) || 1;

            const calc = computePricesForNewItem(retail);
            const item = {
              upc, sku: upc, asin: "", title: name, name,
              brand, retail, packQty:1, desc: name,
              startPrice: calc.startPrice, startPctComputed: calc.startPctComputed,
              binPrice: calc.binPrice, goalSale: calc.goalSale, buyerFee: calc.buyerFee, profit: calc.profit,
              qty, userImg: "", amazonUrl:"", scanLp:"", model:"", source:"B-Stock", wholesale:0, image:""
            };
            state.items.push(item);
            imported++;
          }
          saveState();
          repaint();
          toast(`Imported ${imported} B-Stock items ✅`);
        } catch (err) {
          console.error(err);
          toast("Error parsing B-Stock file");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  // --------------------
  // Import Worldly Treasures (TSV)
  // --------------------
  if (el.worldlyFile) {
    el.worldlyFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const rows = parseRows(ev.target.result);
          if (!rows.length) { toast("No data in file"); e.target.value=""; return; }
          const header = rows[0].map(h => h.toLowerCase());
          // columns: SKU, Scan LP #, Item Description, Model #, Qty, Wholesale, Retail
          const skuIdx = header.findIndex(h => h.includes("sku"));
          const scanIdx = header.findIndex(h => h.includes("scan"));
          const descIdx = header.findIndex(h => h.includes("item description") || h.includes("description") || h.includes("item"));
          const modelIdx = header.findIndex(h => h.includes("model"));
          const qtyIdx = header.findIndex(h => h.includes("qty"));
          const wholesaleIdx = header.findIndex(h => h.includes("wholesale"));
          const retailIdx = header.findIndex(h => h.includes("retail"));

          let imported = 0;
          for (let i = 1; i < rows.length; i++) {
            const cols = rows[i];
            if (!cols || cols.length < 2) continue;
            const sku = (cols[skuIdx] || "").trim();
            const scanLp = (cols[scanIdx] || "").trim();
            const desc = (cols[descIdx] || "").trim();
            const model = (cols[modelIdx] || "").trim();
            const qty = parseInt((cols[qtyIdx] || "1")) || 1;
            const wholesale = Number((cols[wholesaleIdx] || "").replace(/[^\d.]/g,"")) || 0;
            const retail = Number((cols[retailIdx] || "").replace(/[^\d.]/g,"")) || 0;

            const calc = computePricesForNewItem(retail);
            const item = {
              upc: "", sku, asin:"", title:desc, name:desc,
              brand:"", retail, packQty:1, desc,
              startPrice: calc.startPrice, startPctComputed: calc.startPctComputed,
              binPrice: calc.binPrice, goalSale: calc.goalSale, buyerFee: calc.buyerFee, profit: calc.profit,
              qty, userImg:"", amazonUrl:"", scanLp, model, source:"Worldly Treasures", wholesale, wtQty: qty, wtRetail: retail, image:""
            };
            state.items.push(item);
            imported++;
          }
          saveState();
          repaint();
          toast(`Imported ${imported} Worldly Treasures items ✅`);
        } catch (err) {
          console.error(err);
          toast("Error parsing Worldly file");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  // --------------------
  // Camera & Quagga integration
  // --------------------
  let running = false, handlerRef = null;
  function attachHandler(){
    if (!window.Quagga) return;
    if (handlerRef){ try{ window.Quagga.offDetected(handlerRef); }catch{} handlerRef=null; }
    handlerRef=(res)=>{
      const raw = res?.codeResult?.code || "";
      if (!raw) return;
      const code = raw.replace(/\D/g, "");
      if (!(code.length === 12 || code.length === 13)) return;
      if (isRecentlyScanned(code)) return;
      addUPC(code);
    };
    window.Quagga.onDetected(handlerRef);
  }

  function startCamera(){
    if (running) return;
    if (!window.Quagga){ alert("Scanner library not loaded. Check internet."); return; }
    const constraints = { facingMode: { ideal: "environment" }, width:{ideal:1280}, height:{ideal:720}};
    const cfg = {
      inputStream:{ type:"LiveStream", target: el.live, constraints },
      decoder:{ readers:["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate:true, numOfWorkers: navigator.hardwareConcurrency || 2,
      locator: { halfSample:false, patchSize:"medium" }
    };
    window.Quagga.init(cfg, (err)=>{
      if (err){ console.error(err); alert("Camera init failed. Allow camera & HTTPS."); return; }
      attachHandler();
      window.Quagga.start();
      running = true;
      const v = el.live.querySelector("video");
      if (v) { v.setAttribute("playsinline","true"); v.style.width="100%"; }
      // Try to set focus/zoom (best effort)
      try {
        const stream = v && v.srcObject;
        const track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
        const caps  = track && track.getCapabilities ? track.getCapabilities() : null;
        const applyIf = async (obj) => { try { await track.applyConstraints(obj); } catch {} };
        if (track && caps) {
          if (caps.focusMode && caps.focusMode.includes("continuous")) await applyIf({ advanced:[{ focusMode:"continuous" }]});
          if (caps.focusDistance && typeof caps.focusDistance === "object") await applyIf({ advanced:[{ focusDistance: caps.focusDistance.min }]});
          if (caps.zoom && typeof caps.zoom === "object") { const z = Math.min(2, caps.zoom.max||2); await applyIf({ advanced:[{ zoom: z }]}); }
        }
      } catch(e){}
    });
  }

  function stopCamera(){
    if (!running || !window.Quagga) return;
    try{ if (handlerRef) window.Quagga.offDetected(handlerRef); }catch{}
    window.Quagga.stop(); running=false; handlerRef=null;
  }

  // Snapshot -> attach to latest item
  function snapPhoto(){
    const video = el.live && el.live.querySelector("video");
    if (!video){ alert("Start camera first."); return; }
    const cv = el.snapCanvas; if (!cv) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    if (state.items[0]){ state.items[0].userImg = dataUrl; saveState(); repaint(); toast("Photo attached to last item"); }
    else { alert("Scan an item first, then snap."); }
  }

  // --------------------
  // Table qty / set-retail handlers
  // --------------------
  el.tbody && el.tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".qbtn");
    if (!btn) return;
    const idx = Number(btn.dataset.i);
    const it = state.items[idx]; if (!it) return;
    const act = btn.dataset.act || "";
    if (act === "set-retail") {
      const val = prompt("Enter retail price (per unit) for this item:", it.retail || "");
      const r = Number(val);
      if (isFinite(r) && r >= 0) {
        it.retail = r;
        retailCache[it.upc] = r; saveRetailCache();
        const recalc = computePricesForNewItem(it.retail);
        it.startPrice = recalc.startPrice; it.startPctComputed = recalc.startPctComputed;
        it.binPrice = recalc.binPrice; it.goalSale = recalc.goalSale; it.buyerFee = recalc.buyerFee; it.profit = recalc.profit;
        saveState(); repaint(); toast("Retail updated");
      }
      return;
    }
    const delta = Number(btn.dataset.delta || 0);
    if (delta !== 0) {
      it.qty = Math.max(1, (Number(it.qty)||1) + delta);
      saveState(); repaint();
    }
  });

  el.tbody && el.tbody.addEventListener("change", (e) => {
    const inp = e.target.closest(".qtyinp");
    if (!inp) return;
    const idx = Number(inp.dataset.i);
    const it = state.items[idx];
    if (!it) return;
    let v = Math.max(1, Math.floor(Number(inp.value)||1));
    it.qty = v;
    saveState(); repaint();
  });

  // --------------------
  // Add manual UPC
  // --------------------
  el.addManual && el.addManual.addEventListener("click", () => {
    addUPC(el.upcInput && el.upcInput.value);
    if (el.upcInput){ el.upcInput.value = ""; el.upcInput.focus(); }
  });
  el.upcInput && el.upcInput.addEventListener("keydown", (e)=> { if (e.key === "Enter"){ addUPC(el.upcInput.value); el.upcInput.value=""; } });

  // --------------------
  // Export WooCommerce CSV with images (DuckDuckGo attempt + placeholder fallback)
  // --------------------
  // Helpers for image fetch
  async function ddgImageSearch(query) {
    // Attempt DuckDuckGo i.js (may be blocked by CORS in some browsers; we catch errors)
    try {
      const endpoint = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}`;
      const res = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("DDG failed " + res.status);
      const j = await res.json();
      if (j && Array.isArray(j.results) && j.results.length) {
        return j.results[0].image || j.results[0].thumbnail || null;
      }
      return null;
    } catch (err) {
      // It's common for browsers to block this — we fallback later
      console.warn("DDG fetch error (ignored):", err);
      return null;
    }
  }

  const fetchStockPhoto = async (sku, desc, brand) => {
    // Try ddg first, then placeholder
    const qParts = [];
    if (brand) qParts.push(brand);
    if (desc) qParts.push(desc);
    if (sku) qParts.push(sku);
    const query = qParts.join(" ");
    let found = await ddgImageSearch(query);
    if (found) return found;
    // fallback placeholder with readable text
    const safeText = encodeURIComponent((desc || sku || brand || "NoImage").slice(0,60));
    return `https://via.placeholder.com/600x600.png?text=${safeText}`;
  };

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function exportWooCsv(){
    if (!state.items.length) { toast("No items to export"); return; }
    // Optionally ask user to confirm that images may take time
    if (!confirm("Export will fetch images for each item (may take a few seconds). Continue?")) return;

    toast("Starting image lookup (this may take a moment)...");
    console.log("Export: fetching images for", state.items.length, "items...");

    // Enrich items with image URLs
    for (let i = 0; i < state.items.length; i++) {
      const it = state.items[i];
      if (!it.image || it.image.indexOf("placeholder.com") === 0) {
        try {
          const img = await fetchStockPhoto(it.sku || it.upc || "", it.title || it.name || it.desc || "", it.brand || "");
          it.image = img || `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(it.title?.slice(0,60) || it.sku || "NoImage")}`;
        } catch (err) {
          it.image = `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(it.title?.slice(0,60) || it.sku || "NoImage")}`;
        }
        // polite delay
        await delay(450);
      }
      // update UI progressively
      repaint();
    }

    toast("Images fetched — building CSV...");

    // WooCommerce CSV headers (use merging by SKU)
    const headers = [
      "ID","Type","SKU","Name","Published","Is featured?","Visibility in catalog",
      "Short description","Description","Regular price","In stock?","Stock","Categories","Tags",
      "Images","Brands"
    ];
    const rows = [headers.join(",")];

    state.items.forEach((it, idx) => {
      const sku = it.sku || it.upc || "";
      const name = (it.title || it.name || "").replace(/"/g, '""');
      const shortDesc = (`Imported from ${it.source || "Scan"}`).replace(/"/g,'""');
      const description = (`Model: ${it.model || "N/A"} • ${it.desc || ""}`).replace(/"/g,'""');
      const price = (Number(it.retail) || 0).toFixed(2);
      const stock = Number(it.qty)||1;
      const categories = it.source === "Worldly Treasures" ? "Home & Garden" : "B-Stock";
      const tags = (it.brand || "").split(/\s*,\s*/).filter(Boolean).join(",");
      const imageUrls = it.image ? (Array.isArray(it.image)? it.image.join("|") : it.image) : "";
      const brand = it.brand || "";

      const row = [
        "", // ID blank -> create/merge by SKU in Woo
        "simple",
        `"${sku}"`,
        `"${name}"`,
        "1",
        "0",
        "visible",
        `"${shortDesc}"`,
        `"${description}"`,
        price,
        "1",
        stock,
        `"${categories}"`,
        `"${tags}"`,
        `"${imageUrls}"`,
        `"${brand}"`
      ];
      rows.push(row.join(","));
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `woo_import_${(state.palletLabel || "pallet")}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

    toast("WooCommerce CSV downloaded ✅");
  }

  // --------------------
  // Bind actions & init
  // --------------------
  // Save session
  el.saveSession && el.saveSession.addEventListener("click", () => {
    state.truckCost = Number(el.truckCost?.value || 0);
    state.palletCost = Number(el.palletCost?.value || 0);
    state.palletLabel = String(el.palletLabel?.value || "");
    state.targetItems = Number(el.targetItems?.value || 0);
    let pct = Number(el.startPct?.value || 0);
    if (pct > 1) pct = pct / 100;
    state.startPct = isFinite(pct) ? Math.max(0, pct) : 0;
    state.startMode = el.startMode ? (el.startMode.value || "pct") : "pct";
    saveState(); repaint(); toast("Session saved");
  });

  // New pallet
  el.newPallet && el.newPallet.addEventListener("click", () => {
    if (!confirm("Start a NEW pallet? This clears current pallet items.")) return;
    state.palletLabel = prompt("Pallet ID/Label:", "") || "";
    state.palletCost = Number(prompt("Pallet Cost ($):", "") || 0);
    state.targetItems = Number(prompt("Target items on pallet (optional):", "") || 0);
    const p = prompt("Start % of Retail (leave blank or 0 for AUTO):", "");
    if (p !== null && p !== "") { let x = Number(p); if (x > 1) x = x/100; state.startPct = isFinite(x) ? Math.max(0,x) : 0; } else { state.startPct = 0; }
    state.items = [];
    saveState(); repaint();
    if (el.startPct) el.startPct.value = state.startPct ? Math.round(state.startPct*100) : "";
    if (el.startMode) el.startMode.value = state.startMode || "pct";
  });

  // Camera controls
  el.startCam && el.startCam.addEventListener("click", startCamera);
  el.stopCam && el.stopCam.addEventListener("click", stopCamera);
  el.snapBtn && el.snapBtn.addEventListener("click", snapPhoto);

  // Manual add
  el.addManual && el.addManual.addEventListener("click", () => {
    addUPC(el.upcInput && el.upcInput.value);
    if (el.upcInput){ el.upcInput.value=""; el.upcInput.focus(); }
  });

  // Export
  el.exportCsv && el.exportCsv.addEventListener("click", exportWooCsv);

  // Clear pallet
  el.clearPallet && el.clearPallet.addEventListener("click", () => {
    if (confirm("Clear all items for this pallet?")) { state.items = []; saveState(); repaint(); toast("Cleared"); }
  });

  // Trigger file inputs (redundant with item.html script but safe)
  el.manifestBtn && el.manifestBtn.addEventListener("click", () => el.manifestFile && el.manifestFile.click());
  el.worldlyBtn && el.worldlyBtn.addEventListener("click", () => el.worldlyFile && el.worldlyFile.click());

  // --------------------
  // Load saved state and finish init
  // --------------------
  loadState();
  // Populate UI inputs from state
  if (el.truckCost) el.truckCost.value = state.truckCost || "";
  if (el.palletCost) el.palletCost.value = state.palletCost || "";
  if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
  if (el.targetItems) el.targetItems.value = state.targetItems || "";
  if (el.startPct) el.startPct.value = state.startPct ? Math.round(state.startPct*100) : "";
  if (el.startMode) el.startMode.value = state.startMode || "pct";

  repaint();

  // Warn if Quagga not loaded
  if (typeof window.Quagga === "undefined") {
    console.warn("Quagga not loaded; scanner disabled. Manual entry still works.");
  }

  // Expose some functions for console debugging
  window.sir = {
    state, saveState, loadState, addUPC, exportWooCsv
  };
}); // DOMContentLoaded end
