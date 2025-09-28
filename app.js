// ===== Session state (saved to localStorage) =====
const state = {
  palletCost: 0,
  targetCount: 0,
  items: [] // { upc, title, brand, category, avgCost }
};

const $ = (id) => document.getElementById(id);
const countEl = $("count");
const avgEl = $("avg");
const lastItemEl = $("lastItem");
const tableBody = document.querySelector("#itemsTable tbody");

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("bb_state") || "{}");
    if (s.palletCost) state.palletCost = Number(s.palletCost);
    if (s.targetCount) state.targetCount = Number(s.targetCount);
    if (Array.isArray(s.items)) state.items = s.items;
  } catch {}
}
function saveState() {
  localStorage.setItem("bb_state", JSON.stringify(state));
}

function fmt(n){ return (Number(n)||0).toFixed(2); }

function currentAvgCost() {
  const denom = Math.max(1, state.items.length || state.targetCount || 1);
  return state.palletCost ? (state.palletCost / denom) : 0;
}

function redraw() {
  countEl.textContent = state.items.length;
  avgEl.textContent = fmt(currentAvgCost());
  tableBody.innerHTML = "";
  state.items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${it.upc}</td>
      <td>${it.title||""}</td>
      <td>${it.brand||""}</td>
      <td>${it.category||""}</td>
      <td>$${fmt(it.avgCost||currentAvgCost())}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function setLastItemCard(it) {
  lastItemEl.classList.remove("empty");
  lastItemEl.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;">
      <div>
        <div style="font-weight:700">${it.title || "Item"}</div>
        <div style="color:#9aa4b2;font-size:12px;">UPC: ${it.upc}</div>
        <div style="color:#9aa4b2;font-size:12px;">Brand: ${it.brand||""} • ${it.category||""}</div>
        <div style="margin-top:4px;">Avg Cost: $${fmt(it.avgCost||currentAvgCost())}</div>
      </div>
    </div>
  `;
}

// ===== Save session settings =====
$("saveSession").addEventListener("click", () => {
  state.palletCost = Number($("palletCost").value || 0);
  state.targetCount = Number($("targetCount").value || 0);
  saveState();
  redraw();
});

// ===== Add item (manual UPC or from camera) =====
async function addUPC(upc) {
  upc = (upc || "").replace(/\D/g, "");
  if (!upc) return;

  // Try API lookup first (if server has a key), otherwise fall back to quick manual title prompt
  let title = "", brand = "", category = "";
  try {
    const r = await fetch(`/api/lookup?upc=${encodeURIComponent(upc)}`);
    const j = await r.json();
    if (j.ok) {
      title = j.title || "";
      brand = j.brand || "";
      category = j.category || "";
    }
  } catch {}

  if (!title) {
    // Super fast manual entry (no blocking if you just hit cancel)
    const t = prompt("Title (optional):", "");
    if (t !== null) title = t.trim();
  }

  const item = { upc, title, brand, category, avgCost: currentAvgCost() };
  state.items.unshift(item);
  saveState();
  setLastItemCard(item);
  redraw();
}

$("manualBtn").addEventListener("click", () => {
  addUPC($("upcInput").value);
  $("upcInput").value = "";
  $("upcInput").focus();
});

// ===== CSV export (client-side, instant) =====
$("exportCsv").addEventListener("click", () => {
  const rows = [
    ["#","UPC","Title","Brand","Category","AvgCost"]
  ];
  state.items.forEach((it, i) => {
    rows.push([i+1, it.upc, it.title, it.brand, it.category, fmt(it.avgCost||currentAvgCost())]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], {type: "text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bidbarn_scan_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("clearList").addEventListener("click", () => {
  if (confirm("Clear scanned items?")) {
    state.items = [];
    saveState();
    redraw();
  }
});

// ===== Quagga (camera) setup =====
let quaggaRunning = false;
function startCamera() {
  if (quaggaRunning) return;
  const config = {
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: document.querySelector("#live"),
      constraints: {
        facingMode: "environment"
      }
    },
    locator: { patchSize: "medium", halfSample: true },
    numOfWorkers: navigator.hardwareConcurrency || 2,
    decoder: {
      readers: [
        "ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader", "code_128_reader"
      ]
    },
    locate: true
  };

  window.Quagga.init(config, (err) => {
    if (err) { console.error(err); alert("Camera init failed"); return; }
    window.Quagga.start();
    quaggaRunning = true;
  });

  let last = "";
  window.Quagga.onDetected((res) => {
    const code = (res.codeResult && res.codeResult.code) || "";
    if (!code) return;
    // debounce: avoid duplicates from same frame burst
    if (code === last) return;
    last = code;
    addUPC(code);
    // brief cooldown
    setTimeout(() => { last = ""; }, 800);
  });
}

function stopCamera() {
  if (!quaggaRunning) return;
  window.Quagga.stop();
  quaggaRunning = false;
}

$("startCam").addEventListener("click", startCamera);
$("stopCam").addEventListener("click", stopCamera);

// ===== boot =====
loadState();
$("palletCost").value = state.palletCost || "";
$("targetCount").value = state.targetCount || "";
redraw();