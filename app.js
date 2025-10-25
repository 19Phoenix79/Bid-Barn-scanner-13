// ===== Sir Scansalot — Scanner + B-Stock Manifest Import, per-unit retail, camera close-focus, auto Start%=CPI/Retail, qty, CSV, toast, de-dupe =====
(() => {
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const money = (n) => (Number(n) || 0).toFixed(2);
  const toFloat = (v) => {
    if (v === null || v === undefined) return 0;
    try { return parseFloat(String(v).replace(/[$,]/g, "")) || 0; } catch { return 0; }
  };

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
    toastHost: $("toast"),
    manifestBtn: $("manifestBtn"),
    manifestFile: $("manifestFile"),
  };

  // --- Toast helper ---
  function toast(msg) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), 1600);
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
  }

  // --- Duplicate-scan guard ---
  const recently = new Map(); // upc -> expiresAt
  const DEDUPE_MS = 3000;
  function isRecentlyScanned(upc) {
    const now = Date.now();
    for (const [k, t] of recently) if (t <= now) recently.delete(k);
    const t = recently.get(upc);
    return t && t > now;
  }
  function markScanned(upc) {
    recently.set(upc, Date.now() + DEDUPE_MS);
  }

  // --- Detect "pack of N" in product titles and return N (defaults to 1) ---
  function detectPackQty(title = "") {
    const patterns = [
      /pack of\s*(\d+)/i, /(\d+)\s*pack\b/i, /(\d+)\s*pk\b/i,
      /(\d+)\s*ct\b/i, /(\d+)\s*count\b/i, /x\s*(\d+)\b/i
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

  // --- Local retail cache ---
  const retailCacheKey = "bb_retail_cache_v1";
  let retailCache = {};
  try { retailCache = JSON.parse(localStorage.getItem(retailCacheKey) || "{}"); } catch {}
  function saveRetailCache(){ localStorage.setItem(retailCacheKey, JSON.stringify(retailCache)); }

  // --- App state ---
  const SKEY = "bb_pallet_v9_manifest";
  const state = {
    truckCost: 0,
    palletCost: 0,
    palletLabel: "",
    targetItems: 0,
    startPct: 0,
    startMode: "pct",
    items: [] // { upc, asin, title, brand, retail(per unit), packQty, desc, startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit, qty, userImg, amazonUrl }
  };

  function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); }catch{} }
  function save(){ localStorage.setItem(SKEY, JSON.stringify(state)); }

  const totalUnits = () => state.items.reduce((s, it) => s + (Number(it.qty)||0), 0);

  function currentCPI() {
    const denom = (state.targetItems && state.targetItems > 0) ? state.targetItems : Math.max(1, totalUnits());
    return state.palletCost ? (state.palletCost / denom) : 0;
  }

  function repaint(){
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = totalUnits();
    if (el.cpi) el.cpi.textContent = money(currentCPI());

    let pctHeader = state.startPct > 0 ? (state.startPct * 100) : 0;
    if (!(pctHeader > 0) && state.items[0] && state.items[0].startPctComputed > 0) {
      pctHeader = state.items[0].startPctComputed * 100;
    }
    if (el.startPctView) el.startPctView.textContent = `${Math.round(pctHeader)}%`;

    if (el.retailLast) el.retailLast.textContent = state.items[0] ? money(state.items[0].retail || 0) : "0.00";
    if (el.binLast) el.binLast.textContent = state.items[0] ? money(state.items[0].binPrice || 0) : "0.00";

    if (el.tbody){
      el.tbody.innerHTML = "";
      state.items.forEach((it,i)=>{
        const tr = document.createElement("tr");
        if ((it.profit||0) > 0) tr.classList.add("profit-positive");
        if ((it.profit||0) < 0) tr.classList.add("profit-negative");
        const img = it.userImg || "";

        const perUnit = (it.retail && it.retail > 0) ? `$${money(it.retail)}` : "$0.00";
        const packNote = (it.packQty && it.packQty > 1)
          ? ` <span class="small" style="color:#9aa4b2;">(per unit, pack ${it.packQty})</span>`
          : "";
        const retailHtml = (it.retail && it.retail > 0)
          ? `${perUnit}${packNote}`
          : `$0.00 <button class="qbtn" data-i="${i}" data-act="set-retail">Set</button>`;

        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${it.upc || ""}</td>
          <td>${it.title || ""}</td>
          <td>${it.brand || ""}</td>
          <td>${retailHtml}</td>
          <td>$${money(it.startPrice || 0)}${(it.startPctComputed>0)?` <span class="small" style="color:#9aa4b2;">(${Math.round(it.startPctComputed*100)}%)</span>`:""}</td>
          <td>$${money(it.binPrice || 0)}</td>
          <td>$${money(it.goalSale || 0)}</td>
          <td>$${money(it.buyerFee || 0)}</td>
          <td>$${money(it.profit || 0)}</td>
          <td>
            <div class="qtywrap">
              <button class="qbtn" data-i="${i}" data-delta="-1">−</button>
              <input class="qtyinp" data-i="${i}" type="number" min="1" value="${it.qty || 1}">
              <button class="qbtn" data-i="${i}" data-delta="1">+</button>
            </div>
          </td>
          <td>${img ? `<img class="thumb" src="${img}" />` : ""}</td>
        `;
        el.tbody.appendChild(tr);
      });
    }
  }

  function setLast(it){
    if (!el.lastItem) return;
    const asinLine = it.asin ? ` • ASIN: ${it.asin}` : "";
    const img = it.userImg || "";
    const shortDesc = (it.desc || "").slice(0, 180);
    const packNote = (it.packQty && it.packQty > 1) ? ` (per unit, pack ${it.packQty})` : "";
    el.lastItem.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        ${img ? `<img class="thumb" src="${img}" />` : ""}
        <div>
          <strong>${it.title || "Item"}</strong>
          <div class="small">UPC: ${it.upc || ""}${asinLine} • Brand: ${it.brand || ""} • Qty: ${it.qty || 1}</div>
          <div class="small">
            Retail $${money(it.retail||0)}${packNote} • Start $${money(it.startPrice||0)}${(it.startPctComputed>0)?` (${Math.round(it.startPctComputed*100)}% of retail)`:""}
            • BIN 80% $${money(it.binPrice||0)}
          </div>
          <div class="small">
            Goal Sale (38%) $${money(it.goalSale||0)} • Buyer Fee (12%) $${money(it.buyerFee||0)}
            • <b>Profit</b> $${money(it.profit||0)}
          </div>
          ${shortDesc ? `<div class="small" style="margin-top:6px;max-width:600px;">Desc: ${shortDesc}${(it.desc||"").length>180?'…':''}</div>` : ""}
        </div>
      </div>
    `;
  }

  function genDesc(it){
    const parts = [];
    if (it.brand) parts.push(it.brand);
    if (it.title && it.title.toLowerCase() !== (it.brand||"").toLowerCase()) parts.push(it.title);
    if (it.retail) parts.push(`Approx. retail: $${money(it.retail)}.`);
    parts.push("Condition not verified. See photos for details.");
    return parts.join(" ");
  }

  function computePricesForNewItem(retailPerUnit) {
    const denom = (state.targetItems && state.targetItems > 0)
      ? state.targetItems
      : Math.max(1, totalUnits() + 1);
    const cpiNew = state.palletCost ? (state.palletCost / denom) : 0;

    let startPrice = 0, startPctComputed = 0;
    if (state.startMode === "dollar") {
      startPrice = 1;
      startPctComputed = retailPerUnit > 0 ? (1 / retailPerUnit) : 0;
    } else if (state.startPct && state.startPct > 0) {
      startPctComputed = state.startPct;
      startPrice = retailPerUnit > 0 ? (retailPerUnit * state.startPct) : 0;
    } else {
      startPrice = cpiNew; // AUTO = your cost per item
      startPctComputed = retailPerUnit > 0 ? (cpiNew / retailPerUnit) : 0;
    }

    const binPrice = retailPerUnit ? (retailPerUnit * 0.80) : 0;
    const goalSale = retailPerUnit ? (retailPerUnit * 0.38) : 0;
    const buyerFee = goalSale * 0.12;
    const profit   = (goalSale + buyerFee) - startPrice;

    return { startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit };
  }

  // ------- Scanner workflow -------
  let scanBusy = false;

  async function addUPC(upc){
    upc = String(upc || "").replace(/\D/g, "");
    if (upc.length === 13 && upc.startsWith("0")) upc = upc.slice(1);
    if (!(upc.length === 12 || upc.length === 13)) { toast("Code too short — rescan"); return; }
    if (scanBusy) return;
    if (isRecentlyScanned(upc)) { toast("Already captured"); return; }
    scanBusy = true;

    let asin="", title="", brand="", retail=0, amazonUrl="", desc="", packQty=1;

    // 1) Try local retail cache first
    if (retailCache[upc] && Number(retailCache[upc]) > 0) {
      retail = Number(retailCache[upc]);
    } else {
      // 2) Call backend trial API
      try{
        const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
        const j = await r.json();
        if (j.ok){
          asin = j.asin || "";
          title = j.title || "";
          brand = j.brand || "";
          retail = Number(j.retail || 0);   // may be pack price
          amazonUrl = j.amazon_url || "";
          desc = j.description || "";

          // Heuristic for packs
          packQty = detectPackQty(title);
          if (packQty > 1 && retail > 0) retail = retail / packQty;

          if (retail > 0) { retailCache[upc] = retail; saveRetailCache(); }
        }
      }catch{}
    }

    if (!desc) desc = genDesc({ brand, title, retail });

    const calc = computePricesForNewItem(retail);

    const item = {
      upc, asin, title, brand,
      retail, packQty: packQty || 1,
      desc,
      startPrice: calc.startPrice,
      startPctComputed: calc.startPctComputed,
      binPrice: calc.binPrice,
      goalSale: calc.goalSale,
      buyerFee: calc.buyerFee,
      profit: calc.profit,
      qty: 1, userImg: "", amazonUrl
    };

    state.items.unshift(item);
    save();
    setLast(item);
    repaint();

    toast("✅ Item captured!");
    markScanned(upc);
    setTimeout(()=>{ scanBusy = false; }, 900);
  }

  // Camera + Quagga with close-focus tuning
  let running=false, handlerRef=null;
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
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      alert("Camera requires HTTPS. Open this site on https://");
      return;
    }
    if (running) return;
    if (!window.Quagga){ alert("Scanner library not loaded. Check internet."); return; }

    const constraints = {
      facingMode: { ideal: "environment" },
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
      advanced: [
        { focusMode: "continuous" },
        { focusMode: "near" },
        { focusDistance: 0 },
        { zoom: 2 }
      ]
    };

    const cfg = {
      inputStream:{ type:"LiveStream", target: el.live, constraints },
      decoder:{ readers:["ean_reader","upc_reader","upc_e_reader","code_128_reader","ean_8_reader"] },
      locate:true,
      numOfWorkers: navigator.hardwareConcurrency || 2,
      locator: { halfSample: false, patchSize: "medium" }
    };

    window.Quagga.init(cfg, async (err)=>{
      if (err){ console.error(err); alert("Camera init failed. Allow camera & HTTPS."); return; }
      attachHandler();
      window.Quagga.start();
      running = true;
      const v = el.live.querySelector("video");
      if (v) { v.setAttribute("playsinline", "true"); v.style.width = "100%"; }

      try {
        const stream = v && v.srcObject;
        const track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
        const caps  = track && track.getCapabilities ? track.getCapabilities() : null;
        const applyIf = async (obj) => { try { await track.applyConstraints(obj); } catch {} };
        if (track && caps) {
          if (caps.focusMode && caps.focusMode.includes("continuous")) await applyIf({ advanced: [{ focusMode: "continuous" }] });
          else if (caps.focusMode && caps.focusMode.includes("near")) await applyIf({ advanced: [{ focusMode: "near" }] });
          if (typeof caps.focusDistance === "object") await applyIf({ advanced: [{ focusDistance: caps.focusDistance.min }] });
          if (typeof caps.zoom === "object") await applyIf({ advanced: [{ zoom: Math.min(2, caps.zoom.max || 2) }] });
        }
      } catch(e) {}
    });
  }
  function stopCamera(){
    if (!running || !window.Quagga) return;
    try{ if (handlerRef) window.Quagga.offDetected(handlerRef); }catch{}
    window.Quagga.stop(); running=false; handlerRef=null;
  }
  function snapPhoto(){
    const video = el.live && el.live.querySelector("video");
    if (!video){ alert("Start camera first."); return; }
    const cv = el.snapCanvas; if (!cv) return;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = cv.toDataURL("image/jpeg", 0.85);
    if (state.items[0]){ state.items[0].userImg = dataUrl; save(); repaint(); }
    else { alert("Scan an item first, then snap."); }
  }

  // ------- Manifest CSV Import (B-Stock) -------
  // Flexible header mapping (case-insensitive). Add common B-Stock names here.
  const H = {
    upc: ["upc","barcode","ean","upc_code","product upc","item upc","upc12","upc-12"],
    title: ["title","product title","item name","name","description short","product_name"],
    brand: ["brand","mfr","manufacturer","brand name"],
    qty: ["qty","quantity","units","unit qty","unit quantity","QTY"],
    retail: ["unit retail","unit msrp","unit price msrp","msrp","retail","retail price","suggested retail","list price","price"]
  };

  function findHeader(map, headerRow) {
    const idx = {};
    const lower = headerRow.map(h => String(h || "").trim().toLowerCase());
    for (const key in map) {
      for (const cand of map[key]) {
        const j = lower.indexOf(String(cand).toLowerCase());
        if (j !== -1) { idx[key] = j; break; }
      }
    }
    return idx;
  }

  // Robust CSV parser (handles quotes, embedded commas/newlines)
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; continue; } // escaped quote
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field=""; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row=[]; field=""; i++; continue; }
        field += c; i++; continue;
      }
    }
    row.push(field); rows.push(row);
    // Trim trailing empty lines
    while (rows.length && rows[rows.length-1].every(x => x === "")) rows.pop();
    return rows;
  }

  function buildItemFromManifest(row, idx) {
    const get = (k) => {
      const j = idx[k];
      return (j !== undefined) ? row[j] : "";
    };
    let upc = String(get("upc") || "").replace(/\D/g,"");
    if (upc.length === 13 && upc.startsWith("0")) upc = upc.slice(1);
    const title = String(get("title") || "").trim();
    const brand = String(get("brand") || "").trim();
    const qty = Math.max(1, parseInt(get("qty") || "1", 10) || 1);

    // Prefer unit retail if present; otherwise try MSRP/Retail field and assume it's per unit.
    let retail = toFloat(get("retail"));
    if (!retail || retail <= 0) retail = 0;

    // If the title implies a pack and the manifest's retail looks like a pack price,
    // our detectPackQty() will divide. If the CSV provides true unit retail, the division
    // won’t happen because packQty will be 1 (no pack wording).
    const packQty = detectPackQty(title);
    if (packQty > 1 && retail > 0) {
      // If manifest price is obviously a pack, convert to per unit:
      retail = retail / packQty;
    }

    const desc = (brand || title) ? `${brand ? brand + " " : ""}${title}` : "Manifest item";

    const calc = computePricesForNewItem(retail);

    const item = {
      upc, asin:"", title, brand,
      retail, packQty: Math.max(1, packQty),
      desc,
      startPrice: calc.startPrice,
      startPctComputed: calc.startPctComputed,
      binPrice: calc.binPrice,
      goalSale: calc.goalSale,
      buyerFee: calc.buyerFee,
      profit: calc.profit,
      qty, userImg: "", amazonUrl: ""
    };

    // Cache retail for future scans
    if (upc && retail > 0) { retailCache[upc] = retail; saveRetailCache(); }

    return item;
  }

  async function importManifestFile(file){
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { alert("CSV is empty"); return; }
    const header = rows[0];
    const idx = findHeader(H, header);

    if (idx.upc === undefined || idx.title === undefined) {
      alert("Missing required columns (need at least UPC and Title).");
      return;
    }

    let imported = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      const item = buildItemFromManifest(row, idx);
      // Skip rows without meaningful UPC or Title
      if (!item.title && !item.upc) continue;

      state.items.unshift(item);
      imported += (Number(item.qty)||1);
    }
    save(); repaint();
    toast(`📥 Imported ${imported} unit(s) from manifest`);
  }

  // ------- Qty & Retail controls -------
  on(el.tbody, "click", (e) => {
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
        if (it.upc) { retailCache[it.upc] = r; saveRetailCache(); }
        const recalc = computePricesForNewItem(it.retail);
        it.startPrice = recalc.startPrice;
        it.startPctComputed = recalc.startPctComputed;
        it.binPrice = recalc.binPrice;
        it.goalSale = recalc.goalSale;
        it.buyerFee = recalc.buyerFee;
        it.profit = recalc.profit;
        save(); repaint(); toast("Retail updated");
      }
      return;
    }

    const delta = Number(btn.dataset.delta || 0);
    if (delta !== 0) {
      it.qty = Math.max(1, (Number(it.qty)||1) + delta);
      save(); repaint();
    }
  });

  on(el.tbody, "change", (e) => {
    const inp = e.target.closest(".qtyinp");
    if (!inp) return;
    const idx = Number(inp.dataset.i);
    const it = state.items[idx];
    if (!it) return;
    let v = Math.max(1, Math.floor(Number(inp.value)||1));
    it.qty = v;
    save(); repaint();
  });

  // ------- Export Woo CSV -------
  function exportWooCsv(){
    const headers = [
      "Name","SKU","Regular price","Sale price","Categories","Brands","Tags",
      "Short description","Description","Images","Stock","In stock?","Catalog visibility","Status"
    ];
    const rows = [headers];

    state.items.forEach((it,i)=>{
      const images = "";
      const description = it.desc || "";
      rows.push([
        it.title || `Item ${i+1}`,                // Name
        it.upc || "",                              // SKU
        it.binPrice ? it.binPrice.toFixed(2) : "", // Regular price = BIN (80% per-unit retail)
        "", "",                                    // Sale price, Categories
        it.brand || "",                            // Brands
        "", "",                                    // Tags, Short description
        description,                               // Long description
        images,                                    // Images
        String(Math.max(1, Number(it.qty)||1)),   // Stock
        "1","visible","publish"
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sirscansalot_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ------- Session controls -------
  function bind(){
    on(el.saveSession,"click",()=>{
      state.truckCost = Number(el.truckCost?.value || 0);
      state.palletCost = Number(el.palletCost?.value || 0);
      state.palletLabel = String(el.palletLabel?.value || "");
      state.targetItems = Number(el.targetItems?.value || 0);

      let pct = Number(el.startPct?.value || 0);
      if (pct > 1) pct = pct / 100;
      state.startPct = isFinite(pct) ? Math.max(0, pct) : 0;

      state.startMode = el.startMode ? (el.startMode.value || "pct") : "pct";

      save(); repaint();
    });

    on(el.newPallet,"click",()=>{
      if (!confirm("Start a NEW pallet? This clears current pallet items.")) return;
      state.palletLabel = prompt("Pallet ID/Label:", "") || "";
      state.palletCost = Number(prompt("Pallet Cost ($):", "") || 0);
      state.targetItems = Number(prompt("Target items on pallet (optional):", "") || 0);
      const p = prompt("Start % of Retail (leave blank or 0 for AUTO):", "");
      if (p !== null && p !== "") {
        let x = Number(p); if (x > 1) x = x/100;
        state.startPct = isFinite(x) ? Math.max(0, x) : 0;
      } else {
        state.startPct = 0;
      }
      state.items = [];
      save(); repaint();

      if (el.startPct)  el.startPct.value  = state.startPct ? Math.round(state.startPct*100) : "";
      if (el.startMode) el.startMode.value = state.startMode || "pct";
    });

    on(el.startCam,"click",startCamera);
    on(el.stopCam,"click",stopCamera);
    on(el.snapBtn,"click",snapPhoto);

    on(el.addManual,"click",()=>{
      addUPC(el.upcInput && el.upcInput.value);
      if (el.upcInput){ el.upcInput.value=""; el.upcInput.focus(); }
    });
    on(el.upcInput,"keydown",(e)=>{
      if (e.key === "Enter"){ addUPC(el.upcInput.value); el.upcInput.value=""; }
    });

    on(el.exportCsv,"click",exportWooCsv);
    on(el.clearPallet,"click",()=>{
      if (confirm("Clear all items for this pallet?")){ state.items = []; save(); repaint(); }
    });

    // Manifest import triggers
    on(el.manifestBtn,"click",()=> el.manifestFile && el.manifestFile.click());
    on(el.manifestFile,"change",(e)=>{
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      importManifestFile(f);
      e.target.value = ""; // allow importing same file again
    });
  }

  document.addEventListener("DOMContentLoaded",()=>{
    load();
    if (el.truckCost)   el.truckCost.value   = state.truckCost || "";
    if (el.palletCost)  el.palletCost.value  = state.palletCost || "";
    if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
    if (el.targetItems) el.targetItems.value = state.targetItems || "";
    if (el.startPct)    el.startPct.value    = state.startPct ? Math.round(state.startPct*100) : "";
    if (el.startMode)   el.startMode.value   = state.startMode || "pct";
    repaint();
    bind();

    if (typeof window.Quagga === "undefined"){
      console.warn("Quagga not loaded; scanner disabled. Manual entry still works.");
    }
  });
})();