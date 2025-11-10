// ==========================
// Sir Scansalot - app.js (FULL VERSION)
// ==========================

// --- GLOBAL STATE ---
let items = [];
let session = {
  truckCost: 0,
  palletCost: 0,
  palletLabel: "",
  targetItems: 0,
  startPct: 0,
  startMode: "pct",
};
let videoRunning = false;

// --- DOM HELPERS ---
const $ = (id) => document.getElementById(id);
const fmt = (n) => (isNaN(n) ? "0.00" : Number(n).toFixed(2));

// --- TOAST MESSAGES ---
function toast(msg) {
  const el = $("toast");
  const bubble = document.createElement("div");
  bubble.className = "toast-bubble";
  bubble.textContent = msg;
  el.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1300);
}

// --- SESSION SAVE ---
$("saveSession").addEventListener("click", () => {
  session.truckCost = parseFloat($("truckCost").value) || 0;
  session.palletCost = parseFloat($("palletCost").value) || 0;
  session.palletLabel = $("palletLabel").value.trim() || "—";
  session.targetItems = parseInt($("targetItems").value) || 0;
  session.startPct = parseFloat($("startPct").value) || 0;
  session.startMode = $("startMode").value;

  $("palletId").textContent = session.palletLabel;
  toast("Session saved ✅");
  updateStats();
});

// --- NEW PALLET ---
$("newPallet").addEventListener("click", () => {
  if (confirm("Start new pallet? This will clear current items.")) {
    items = [];
    $("tbody").innerHTML = "";
    updateStats();
    toast("New pallet started 🚛");
  }
});

// --- CAMERA SCAN (Quagga2) ---
$("startCam").addEventListener("click", () => {
  if (videoRunning) return;
  videoRunning = true;
  toast("Camera starting...");

  Quagga.init(
    {
      inputStream: {
        type: "LiveStream",
        constraints: { facingMode: "environment" },
        target: document.querySelector("#live"),
      },
      decoder: { readers: ["ean_reader", "upc_reader", "upc_e_reader"] },
    },
    (err) => {
      if (err) {
        toast("Camera error");
        console.error(err);
        videoRunning = false;
        return;
      }
      Quagga.start();
      toast("Scanning...");
    }
  );

  Quagga.onDetected((data) => {
    const code = data.codeResult.code;
    if (code) addItem({ upc: code });
  });
});

$("stopCam").addEventListener("click", () => {
  if (videoRunning) {
    Quagga.stop();
    videoRunning = false;
    toast("Camera stopped ⏹");
  }
});

// --- MANUAL ADD ---
$("addManual").addEventListener("click", () => {
  const upc = $("upcInput").value.trim();
  if (!upc) return toast("Enter a UPC first");
  addItem({ upc });
  $("upcInput").value = "";
});

// --- SNAPSHOT ---
$("snapBtn").addEventListener("click", () => {
  const canvas = $("snapCanvas");
  const live = document.querySelector("#live video");
  if (!live) return toast("No camera feed");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(live, 0, 0, canvas.width, canvas.height);
  toast("📸 Snapshot taken");
});

// --- ADD ITEM ---
function addItem({ upc, name = "", brand = "", retail = 0, qty = 1 }) {
  const cpi = session.palletCost && session.targetItems
    ? session.palletCost / session.targetItems
    : 0;
  let start = 0;

  if (session.startMode === "pct") {
    const pct = session.startPct || (cpi && retail ? (cpi / retail) * 100 : 0);
    start = retail * (pct / 100);
  } else {
    start = 1;
  }

  const bin = retail * 0.8;
  const goalSale = retail * 0.38;
  const fee = goalSale * 0.12;
  const profit = goalSale - cpi - fee;

  const item = {
    upc,
    name,
    brand,
    retail,
    start,
    bin,
    goalSale,
    fee,
    profit,
    qty,
  };

  items.push(item);
  renderItem(item);
  updateStats();
}

// --- RENDER ITEM ROW ---
function renderItem(item) {
  const tbody = $("tbody");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${items.length}</td>
    <td>${item.upc || ""}</td>
    <td>${item.name || ""}</td>
    <td>${item.brand || ""}</td>
    <td>$${fmt(item.retail)}</td>
    <td>$${fmt(item.start)}</td>
    <td>$${fmt(item.bin)}</td>
    <td>$${fmt(item.goalSale)}</td>
    <td>$${fmt(item.fee)}</td>
    <td>$${fmt(item.profit)}</td>
    <td>${item.qty || 1}</td>
    <td>—</td>
    <td>SKU${items.length}</td>
    <td>—</td>
    <td>${item.name || ""}</td>
    <td>—</td>
    <td>${item.qty || 1}</td>
    <td>$${fmt(item.retail)}</td>
  `;
  tbody.appendChild(row);

  $("lastItem").textContent = `${item.upc} – ${item.name || "Unknown"} added`;
}

// --- UPDATE HEADER STATS ---
function updateStats() {
  const count = items.reduce((sum, i) => sum + (i.qty || 1), 0);
  $("count").textContent = count;
  const cpi =
    count && session.palletCost ? session.palletCost / count : 0;
  $("cpi").textContent = fmt(cpi);
  const last = items[items.length - 1];
  if (last) {
    $("retailLast").textContent = fmt(last.retail);
    $("binLast").textContent = fmt(last.bin);
  }
  $("startPctView").textContent = session.startPct + "%";
}

// --- CSV PARSER (handles quoted commas) ---
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = lines.map(line => {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let char of line) {
      if (char === '"' && insideQuotes) {
        insideQuotes = false;
      } else if (char === '"' && !insideQuotes) {
        insideQuotes = true;
      } else if (char === "," && !insideQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
  return rows;
}

// --- IMPORT B-STOCK CSV ---
$("manifestBtn").addEventListener("click", () => $("manifestFile").click());

$("manifestFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const csv = ev.target.result;
    const rows = parseCSV(csv);
    console.log("📦 B-Stock CSV Rows:", rows);

    let imported = 0;
    rows.forEach((cols, idx) => {
      if (idx === 0) return; // skip header
      if (cols.length >= 4) {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
        });
        imported++;
      }
    });

    toast(`Imported ${imported} B-Stock items ✅`);
    e.target.value = ""; // reset input
  };

  reader.readAsText(file);
});

// --- IMPORT WORLDLY TREASURES CSV ---
$("worldlyBtn").addEventListener("click", () => $("worldlyFile").click());

$("worldlyFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const csv = ev.target.result;
    const rows = parseCSV(csv);
    console.log("🌎 Worldly Treasures CSV Rows:", rows);

    let imported = 0;
    rows.forEach((cols, idx) => {
      if (idx === 0) return;
      if (cols.length >= 4) {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
        });
        imported++;
      }
    });

    toast(`Imported ${imported} Worldly Treasures items ✅`);
    e.target.value = "";
  };

  reader.readAsText(file);
});

// --- EXPORT WOO CSV ---
$("exportCsv").addEventListener("click", () => {
  if (!items.length) return toast("No items to export");
  const header =
    "UPC,Name,Brand,Retail,Start,BIN,GoalSale,Fee,Profit,Qty\n";
  const rows = items
    .map(
      (i) =>
        `${i.upc},"${i.name}","${i.brand}",${i.retail},${i.start},${i.bin},${i.goalSale},${i.fee},${i.profit},${i.qty}`
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${session.palletLabel || "pallet"}_woo.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Exported WooCommerce CSV ✅");
});

// --- CLEAR PALLET ---
$("clearPallet").addEventListener("click", () => {
  if (confirm("Clear all pallet items?")) {
    items = [];
    $("tbody").innerHTML = "";
    updateStats();
    toast("Pallet cleared 🗑");
  }
});

  $("palletId").textContent = session.palletLabel;

  toast("Session saved ✅");
  updateStats();
});

// --- NEW PALLET ---
$("newPallet").addEventListener("click", () => {
  if (confirm("Start new pallet? This will clear current items.")) {
    items = [];
    $("tbody").innerHTML = "";
    updateStats();
    toast("New pallet started 🚛");
  }
});

// --- CAMERA SCAN (Quagga2) ---
$("startCam").addEventListener("click", () => {
  if (videoRunning) return;
  videoRunning = true;
  toast("Camera starting...");

  Quagga.init(
    {
      inputStream: {
        type: "LiveStream",
        constraints: { facingMode: "environment" },
        target: document.querySelector("#live"),
      },
      decoder: { readers: ["ean_reader", "upc_reader", "upc_e_reader"] },
    },
    (err) => {
      if (err) {
        toast("Camera error");
        console.error(err);
        videoRunning = false;
        return;
      }
      Quagga.start();
      toast("Scanning...");
    }
  );

  Quagga.onDetected((data) => {
    const code = data.codeResult.code;
    if (code) addItem({ upc: code });
  });
});

$("stopCam").addEventListener("click", () => {
  if (videoRunning) {
    Quagga.stop();
    videoRunning = false;
    toast("Camera stopped ⏹");
  }
});

// --- MANUAL ADD ---
$("addManual").addEventListener("click", () => {
  const upc = $("upcInput").value.trim();
  if (!upc) return toast("Enter a UPC first");
  addItem({ upc });
  $("upcInput").value = "";
});

// --- SNAPSHOT ---
$("snapBtn").addEventListener("click", () => {
  const canvas = $("snapCanvas");
  const live = document.querySelector("#live video");
  if (!live) return toast("No camera feed");
  const ctx = canvas.getContext("2d");
  ctx.drawImage(live, 0, 0, canvas.width, canvas.height);
  toast("📸 Snapshot taken");
});

// --- ADD ITEM ---
function addItem({ upc, name = "", brand = "", retail = 0, qty = 1 }) {
  const cpi = session.palletCost && session.targetItems
    ? session.palletCost / session.targetItems
    : 0;
  let start = 0;

  if (session.startMode === "pct") {
    const pct = session.startPct || (cpi && retail ? (cpi / retail) * 100 : 0);
    start = retail * (pct / 100);
  } else {
    start = 1;
  }

  const bin = retail * 0.8;
  const goalSale = retail * 0.38;
  const fee = goalSale * 0.12;
  const profit = goalSale - cpi - fee;

  const item = {
    upc,
    name,
    brand,
    retail,
    start,
    bin,
    goalSale,
    fee,
    profit,
    qty,
  };

  items.push(item);
  renderItem(item);
  updateStats();
}

// --- RENDER ITEM ROW ---
function renderItem(item) {
  const tbody = $("tbody");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${items.length}</td>
    <td>${item.upc || ""}</td>
    <td>${item.name || ""}</td>
    <td>${item.brand || ""}</td>
    <td>$${fmt(item.retail)}</td>
    <td>$${fmt(item.start)}</td>
    <td>$${fmt(item.bin)}</td>
    <td>$${fmt(item.goalSale)}</td>
    <td>$${fmt(item.fee)}</td>
    <td>$${fmt(item.profit)}</td>
    <td>${item.qty || 1}</td>
    <td>—</td>
    <td>SKU${items.length}</td>
    <td>—</td>
    <td>${item.name || ""}</td>
    <td>—</td>
    <td>${item.qty || 1}</td>
    <td>$${fmt(item.retail)}</td>
  `;
  tbody.appendChild(row);

  $("lastItem").textContent = `${item.upc} – ${item.name || "Unknown"} added`;
}

// --- UPDATE HEADER STATS ---
function updateStats() {
  const count = items.reduce((sum, i) => sum + (i.qty || 1), 0);
  $("count").textContent = count;
  const cpi =
    count && session.palletCost ? session.palletCost / count : 0;
  $("cpi").textContent = fmt(cpi);
  const last = items[items.length - 1];
  if (last) {
    $("retailLast").textContent = fmt(last.retail);
    $("binLast").textContent = fmt(last.bin);
  }
  $("startPctView").textContent = session.startPct + "%";
}

// --- IMPORT B-STOCK CSV ---
$("manifestFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const rows = ev.target.result.split(/\r?\n/);
    rows.forEach((r) => {
      const cols = r.split(",");
      if (cols.length > 3 && cols[0] !== "UPC") {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
        });
      }
    });
    toast("B-Stock CSV imported 📦");
  };
  reader.readAsText(file);
});

// --- IMPORT WORLDLY TREASURES CSV ---
$("worldlyFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const rows = ev.target.result.split(/\r?\n/);
    rows.forEach((r) => {
      const cols = r.split(",");
      if (cols.length > 3 && cols[0] !== "UPC") {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
        });
      }
    });
    toast("Worldly Treasures CSV imported 🌎");
  };
  reader.readAsText(file);
});

// --- EXPORT WOO CSV ---
$("exportCsv").addEventListener("click", () => {
  if (!items.length) return toast("No items to export");
  const header =
    "UPC,Name,Brand,Retail,Start,BIN,GoalSale,Fee,Profit,Qty\n";
  const rows = items
    .map(
      (i) =>
        `${i.upc},"${i.name}","${i.brand}",${i.retail},${i.start},${i.bin},${i.goalSale},${i.fee},${i.profit},${i.qty}`
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${session.palletLabel || "pallet"}_woo.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Exported WooCommerce CSV ✅");
});

// --- CLEAR PALLET ---
$("clearPallet").addEventListener("click", () => {
  if (confirm("Clear all pallet items?")) {
    items = [];
    $("tbody").innerHTML = "";
    updateStats();
    toast("Pallet cleared 🗑");
  }
});
    importWTLCSV);
    toastHost: $("toast"),
  exportCsv: $("exportCsv"),
  clearPallet: $("clearPallet"),
  importWTLBtn: document.getElementById("importWTLBtn"), // <— add this line
  toastHost: $("toast"),

  };

  // --- Toast helper ---
  function toast(msg) {
    const host = el.toastHost || document.body;
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), 1400);
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
  }

// --- CSV number cleaner (safe to re-declare; replaces $ , () etc.) ---
function normalizeNumber(val){
  if (val == null) return 0;
  const s = String(val).replace(/\(.*?\)/g, '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// --- Stock photo helper (Unsplash random image by query) ---
async function fetchStockImage(query) {
  if (!query) return "";
  const q = encodeURIComponent(query);
  const tries = [
    `https://source.unsplash.com/600x600/?${q}`,
    `https://source.unsplash.com/600x600/?product,${q}`
  ];
  // Use HEAD to follow redirect and capture final URL
  for (const u of tries) {
    try {
      const r = await fetch(u, { method: "HEAD" });
      if (r && r.url && !r.url.includes("source.unsplash")) return r.url;
    } catch {}
  }
  return "";
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

  // --- Local retail cache so once you set a retail it auto-fills next time ---
  const retailCacheKey = "bb_retail_cache_v1";
  let retailCache = {};
  try { retailCache = JSON.parse(localStorage.getItem(retailCacheKey) || "{}"); } catch {}
  function saveRetailCache(){ localStorage.setItem(retailCacheKey, JSON.stringify(retailCache)); }

  // --- App state ---
  const SKEY = "bb_pallet_v8";
  const state = {
    truckCost: 0,
    palletCost: 0,
    palletLabel: "",
    targetItems: 0,     // if >0, use for CPI; else use current units
    startPct: 0,        // manual override if >0; 0/blank => AUTO (CPI/Retail)
    startMode: "pct",   // or "dollar"
    items: []           // each: { upc, asin, title, brand, retail (per unit), packQty, desc, startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit, qty, userImg, amazonUrl }
  };

  function load(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(SKEY) || "{}")); }catch{} }
  function save(){ localStorage.setItem(SKEY, JSON.stringify(state)); }

  const totalUnits = () => state.items.reduce((s, it) => s + (Number(it.qty)||0), 0);

  // CPI display uses targetItems if set; else current total units (min 1)
  function currentCPI() {
    const denom = (state.targetItems && state.targetItems > 0) ? state.targetItems : Math.max(1, totalUnits());
    return state.palletCost ? (state.palletCost / denom) : 0;
  }

  function repaint(){
    if (el.palletId) el.palletId.textContent = state.palletLabel || "—";
    if (el.count) el.count.textContent = totalUnits();
    if (el.cpi) el.cpi.textContent = money(currentCPI());

    // Header Start%: show manual override if set, else last item's computed %
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

  // Generate fallback description if none from API
  function genDesc(it){
    const parts = [];
    if (it.brand) parts.push(it.brand);
    if (it.title && it.title.toLowerCase() !== (it.brand||"").toLowerCase()) parts.push(it.title);
    if (it.retail) parts.push(`Approx. retail: $${money(it.retail)}.`);
    parts.push("Condition not verified. See photos for details.");
    return parts.join(" ");
  }

  // Compute prices for a NEW item
  function computePricesForNewItem(retailPerUnit) {
    const denom = (state.targetItems && state.targetItems > 0)
      ? state.targetItems
      : Math.max(1, totalUnits() + 1); // include the new unit
    const cpiNew = state.palletCost ? (state.palletCost / denom) : 0;

    let startPrice = 0, startPctComputed = 0;
    if (state.startMode === "dollar") {
      startPrice = 1;
      startPctComputed = retailPerUnit > 0 ? (1 / retailPerUnit) : 0;
    } else if (state.startPct && state.startPct > 0) {
      startPctComputed = state.startPct;
      startPrice = retailPerUnit > 0 ? (retailPerUnit * state.startPct) : 0;
    } else {
      // AUTO = your cost per item
      startPrice = cpiNew;
      startPctComputed = retailPerUnit > 0 ? (cpiNew / retailPerUnit) : 0;
    }

    const binPrice = retailPerUnit ? (retailPerUnit * 0.80) : 0;
    const goalSale = retailPerUnit ? (retailPerUnit * 0.38) : 0;
    const buyerFee = goalSale * 0.12;
    const profit   = (goalSale + buyerFee) - startPrice;

    return { startPrice, startPctComputed, binPrice, goalSale, buyerFee, profit };
  }

  // Add item
  let scanBusy = false;

  async function addUPC(upc){
    upc = String(upc || "").replace(/\D/g, "");

    // If it’s EAN-13 with a leading 0, convert to 12-digit UPC-A
    if (upc.length === 13 && upc.startsWith("0")) {
      upc = upc.slice(1);
    }

    // Only accept 12 or 13 digits
    if (!(upc.length === 12 || upc.length === 13)) {
      toast("Code too short — rescan");
      return;
    }
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
          retail = Number(j.retail || 0);   // this may be PACK price
          amazonUrl = j.amazon_url || "";
          desc = j.description || "";

          // Adjust for multipacks: compute per-unit retail using title heuristics
          packQty = detectPackQty(title);
          if (packQty > 1 && retail > 0) {
            retail = retail / packQty; // per-unit price for all app calcs
          }

          if (retail > 0) { retailCache[upc] = retail; saveRetailCache(); }
        }
      }catch{}
    }

    if (!desc) desc = genDesc({ brand, title, retail });

    const calc = computePricesForNewItem(retail);

    const item = {
      upc, asin, title, brand,
      retail,                 // per-unit retail now
      packQty: packQty || 1,  // remember detected pack size (defaults to 1)
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
    // Must be on HTTPS (or localhost)
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
      inputStream:{
        type:"LiveStream",
        target: el.live,
        constraints
      },
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

      // Re-apply close-focus settings on the active track
      try {
        const stream = v && v.srcObject;
        const track = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
        const caps  = track && track.getCapabilities ? track.getCapabilities() : null;

        const applyIf = async (obj) => { try { await track.applyConstraints(obj); } catch {} };

        if (track && caps) {
          if (caps.focusMode && caps.focusMode.includes("continuous")) {
            await applyIf({ advanced: [{ focusMode: "continuous" }] });
          } else if (caps.focusMode && caps.focusMode.includes("near")) {
            await applyIf({ advanced: [{ focusMode: "near" }] });
          }
          if (typeof caps.focusDistance === "object") {
            await applyIf({ advanced: [{ focusDistance: caps.focusDistance.min }] });
          }
          if (typeof caps.zoom === "object") {
            const z = Math.min(2, caps.zoom.max || 2);
            await applyIf({ advanced: [{ zoom: z }] });
          }
        }
      } catch(e) { /* best effort */ }
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
    if (state.items[0]){ state.items[0].userImg = dataUrl; save(); repaint(); }
    else { alert("Scan an item first, then snap."); }
  }

  // Qty + Set Retail handlers (delegated)
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
        it.retail = r;                      // store per-unit retail
        retailCache[it.upc] = r;            // remember for future scans
        saveRetailCache();

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

 // Export: WooCommerce CSV — uses userImg as Images column
function exportWooCsv(){
  const headers = [
    "Name","SKU","Regular price","Sale price","Categories","Brands","Tags",
    "Short description","Description","Images","Stock","In stock?","Catalog visibility","Status"
  ];
  const rows = [headers];

  state.items.forEach((it,i)=>{
    const images = it.userImg || ""; // <-- include stock photo URL
    const description = it.desc || "";
    rows.push([
      it.title || `Item ${i+1}`,                // Name
      it.upc || "",                              // SKU
      it.binPrice ? it.binPrice.toFixed(2) : "", // Regular price = BIN (80%)
      "",                                        // Sale price
      "",                                        // Categories
      it.brand || "",                            // Brands
      "",                                        // Tags
      "",                                        // Short description
      description,                               // Description
      images,                                    // Images (single URL)
      String(Math.max(1, Number(it.qty)||1)),    // Stock
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

  function bind(){
    on(el.saveSession,"click",()=>{
      state.truckCost = Number(el.truckCost?.value || 0);
      state.palletCost = Number(el.palletCost?.value || 0);
      state.palletLabel = String(el.palletLabel?.value || "");
      state.targetItems = Number(el.targetItems?.value || 0);

      let pct = Number(el.startPct?.value || 0);
      if (pct > 1) pct = pct / 100;  // allow 23 or 0.23
      state.startPct = isFinite(pct) ? Math.max(0, pct) : 0; // 0 => AUTO

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
        state.startPct = 0; // AUTO
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
  }

  document.addEventListener("DOMContentLoaded",()=>{
    load();
    if (el.truckCost)   el.truckCost.value   = state.truckCost || "";
    if (el.palletCost)  el.palletCost.value  = state.palletCost || "";
    if (el.palletLabel) el.palletLabel.value = state.palletLabel || "";
    if (el.targetItems) el.targetItems.value = state.targetItems || "";
    if (el.startPct)    el.startPct.value    = state.startPct ? Math.round(state.startPct*100) : ""; // blank => AUTO
    if (el.startMode)   el.startMode.value   = state.startMode || "pct";
    repaint();
    bind();

    if (typeof window.Quagga === "undefined"){
      console.warn("Quagga not loaded; scanner disabled. Manual entry still works.");
    }
  });

// ================= Worldly Treasures Liquidations Importer =================

// Make sure PapaParse is available (added in index.html)
function importWTLCSV(){
  if (!window.Papa){
    alert("CSV parser not found. Please include papaparse.min.js");
    return;
  }

  const pick = document.createElement("input");
  pick.type = "file";
  pick.accept = ".csv,text/csv";
  pick.onchange = (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    window.Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const REQUIRED = ["SKU","SCAN LP #","Item Description","Model #","QTY","Retail"];
        const cols = (meta && meta.fields) ? meta.fields : Object.keys(data[0]||{});
        const missing = REQUIRED.filter(h => !cols.includes(h));
        if (missing.length){
          alert(`Missing required columns:\n${missing.join(", ")}`);
          return;
        }

        (async () => {
          let added = 0;

          for (const row of data){
            const sku    = String(row["SKU"] ?? "").trim();
            const upc    = String(row["SCAN LP #"] ?? "").replace(/\D/g,'');
            const title  = String(row["Item Description"] ?? "").trim();
            const model  = String(row["Model #"] ?? "").trim();
            let   qty    = normalizeNumber(row["QTY"]);
            let   retail = normalizeNumber(row["Retail"]);

            if (!title || (!upc && !sku)) continue;
            if (!qty || qty < 1) qty = 1;

            const calc = computePricesForNewItem(retail);
            const imgUrl = await fetchStockImage(title);  // fetch stock photo automatically

            const item = {
              upc: upc || sku,
              asin: "",
              title,
              brand: "",
              retail,
              packQty: 1,
              desc: (function buildDesc(){
                const bits = [];
                if (model) bits.push(`Model: ${model}`);
                if (retail > 0) bits.push(`Approx. retail: $${money(retail)}.`);
                bits.push("Condition not verified. See photos for details.");
                return bits.join(" ");
              })(),
              startPrice: calc.startPrice,
              startPctComputed: calc.startPctComputed,
              binPrice: calc.binPrice,
              goalSale: calc.goalSale,
              buyerFee: calc.buyerFee,
              profit: calc.profit,
              qty,
              userImg: imgUrl || "",   // image URL saved here
              amazonUrl: ""
            };

            state.items.unshift(item);
            added++;
          }

          save(); repaint();
          if (added) { setLast(state.items[0]); toast(`Imported ${added} WTL item${added!==1?'s':''}`); }
          else { alert("No valid WTL rows imported."); }
        })();
      }
    });
  };
  pick.click();
}

})();
