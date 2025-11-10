// === Helper functions ===
const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast-bubble";
  t.textContent = msg;
  $("toast").appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

function formatMoney(num) {
  return "$" + (num || 0).toFixed(2);
}

// === Global storage ===
let palletItems = [];

// === Add Item to Table ===
function addItem(item) {
  palletItems.push(item);
  renderTable();
}

// === Render Table ===
function renderTable() {
  const tbody = $("itemTableBody");
  tbody.innerHTML = "";

  let totalRetail = 0;

  palletItems.forEach((item, i) => {
    const tr = document.createElement("tr");
    const profitClass = item.profit >= 0 ? "profit-positive" : "profit-negative";
    tr.className = profitClass;

    const row = `
      <td>${i + 1}</td>
      <td>${item.upc || ""}</td>
      <td>${item.name || ""}</td>
      <td>${item.brand || ""}</td>
      <td>${item.qty || 1}</td>
      <td>${formatMoney(item.retail)}</td>
      <td>${formatMoney((item.retail || 0) * (item.qty || 1))}</td>
      <td>${item.source || ""}</td>
      <td>${item.status || "Active"}</td>
      <td>${formatMoney(item.profit || 0)}</td>
    `;

    tr.innerHTML = row;
    tbody.appendChild(tr);

    totalRetail += (item.retail || 0) * (item.qty || 1);
  });

  $("totalValue").textContent = formatMoney(totalRetail);
}

// === Export CSV ===
$("exportCsv").addEventListener("click", () => {
  if (!palletItems.length) {
    toast("No items to export ❌");
    return;
  }

  const headers = [
    "UPC",
    "Name",
    "Brand",
    "Retail",
    "Qty",
    "Source",
    "Status",
    "Profit",
  ];
  const rows = palletItems.map((i) =>
    [
      i.upc,
      i.name,
      i.brand,
      i.retail,
      i.qty,
      i.source,
      i.status,
      i.profit,
    ].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export.csv";
  a.click();
  toast("Exported CSV ✅");
});

// === Clear Pallet ===
$("clearPallet").addEventListener("click", () => {
  if (!confirm("Clear all items?")) return;
  palletItems = [];
  renderTable();
  toast("Pallet cleared 🗑️");
});

// === CSV PARSER (handles commas, quotes, etc.) ===
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// === IMPORT B-STOCK CSV ===
$("manifestBtn").addEventListener("click", () => {
  console.log("📂 B-Stock button clicked");
  $("manifestFile").click();
});

$("manifestFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) {
    console.warn("⚠️ No file selected for B-Stock");
    return;
  }
  console.log("📦 B-Stock file selected:", file.name);

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const rows = parseCSV(text);
    console.log("✅ Parsed B-Stock CSV rows:", rows.slice(0, 5));

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (cols && cols.length >= 4) {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
          source: "B-Stock",
          profit: (parseFloat(cols[3]) || 0) * 0.2, // example profit
        });
        imported++;
      }
    }

    toast(`Imported ${imported} B-Stock items ✅`);
    e.target.value = ""; // allow re-upload
  };

  reader.onerror = (err) => {
    console.error("❌ File read error:", err);
    toast("Error reading CSV file");
  };

  reader.readAsText(file, "UTF-8");
});

// === IMPORT WORLDLY TREASURES CSV ===
$("worldlyBtn").addEventListener("click", () => {
  console.log("🌎 Worldly Treasures button clicked");
  $("worldlyFile").click();
});

$("worldlyFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) {
    console.warn("⚠️ No file selected for Worldly Treasures");
    return;
  }
  console.log("🌍 Worldly file selected:", file.name);

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result;
    const rows = parseCSV(text);
    console.log("✅ Parsed Worldly CSV rows:", rows.slice(0, 5));

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (cols && cols.length >= 4) {
        addItem({
          upc: cols[0],
          name: cols[1],
          brand: cols[2],
          retail: parseFloat(cols[3]) || 0,
          qty: parseInt(cols[4]) || 1,
          source: "Worldly Treasures",
          profit: (parseFloat(cols[3]) || 0) * 0.3, // example profit
        });
        imported++;
      }
    }

    toast(`Imported ${imported} Worldly Treasures items ✅`);
    e.target.value = ""; // allow re-upload
  };

  reader.onerror = (err) => {
    console.error("❌ File read error:", err);
    toast("Error reading CSV file");
  };

  reader.readAsText(file, "UTF-8");
});
