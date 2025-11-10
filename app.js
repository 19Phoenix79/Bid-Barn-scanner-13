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
