const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast-bubble";
  t.textContent = msg;
  $("toast").appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function formatMoney(num) {
  if (isNaN(num)) return "$0.00";
  return "$" + num.toFixed(2);
}

let palletItems = [];

function addItem(item) {
  palletItems.push(item);
  renderTable();
}

function renderTable() {
  const tbody = $("itemTableBody");
  tbody.innerHTML = "";

  palletItems.forEach((item, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${item.sku || ""}</td>
      <td>${item.name || ""}</td>
      <td>${item.model || ""}</td>
      <td>${item.qty || 1}</td>
      <td>${formatMoney(item.wholesale)}</td>
      <td>${formatMoney(item.retail)}</td>
      <td>${item.source || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

// === PARSE WORLDLY TREASURES FILE ===
$("worldlyBtn").addEventListener("click", () => $("worldlyFile").click());

$("worldlyFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result.trim();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return toast("No data found in file ❌");

    // Skip header row
    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/\t+/).map((x) => x.trim());
      if (cols.length < 7) continue;

      const sku = cols[0];
      const lp = cols[1];
      const name = cols[2];
      const model = cols[3];
      const qty = parseInt(cols[4]) || 1;
      const wholesale = parseFloat(cols[5].replace(/[^0-9.]/g, "")) || 0;
      const retail = parseFloat(cols[6].replace(/[^0-9.]/g, "")) || 0;

      addItem({
        sku,
        lp,
        name,
        model,
        qty,
        wholesale,
        retail,
        source: "Worldly Treasures",
      });
      imported++;
    }

    toast(`Imported ${imported} Worldly Treasures items ✅`);
    e.target.value = "";
  };

  reader.readAsText(file);
});

// === PARSE B-STOCK FILE (STANDARD CSV) ===
$("manifestBtn").addEventListener("click", () => $("manifestFile").click());

$("manifestFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = ev.target.result.trim();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return toast("No data found in file ❌");

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((x) => x.trim());
      if (cols.length < 4) continue;

      addItem({
        sku: cols[0],
        name: cols[1],
        model: cols[2],
        qty: parseInt(cols[3]) || 1,
        wholesale: parseFloat(cols[4]) || 0,
        retail: parseFloat(cols[5]) || 0,
        source: "B-Stock",
      });
      imported++;
    }

    toast(`Imported ${imported} B-Stock items ✅`);
    e.target.value = "";
  };

  reader.readAsText(file);
});

// === EXPORT CSV ===
$("exportCsv").addEventListener("click", () => {
  if (!palletItems.length) {
    toast("No items to export ❌");
    return;
  }

  const headers = ["SKU", "LP#", "Name", "Model", "Qty", "Wholesale", "Retail", "Source"];
  const rows = palletItems.map((i) =>
    [i.sku, i.lp, i.name, i.model, i.qty, i.wholesale, i.retail, i.source].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export.csv";
  a.click();
  toast("Exported CSV ✅");
});

// === CLEAR PALLET ===
$("clearPallet").addEventListener("click", () => {
  if (!confirm("Clear all items?")) return;
  palletItems = [];
  renderTable();
  toast("Cleared pallet 🗑️");
});
