document.addEventListener("DOMContentLoaded", () => {
  const worldlyBtn = document.getElementById("worldlyBtn");
  const worldlyFile = document.getElementById("worldlyFile");
  const manifestBtn = document.getElementById("manifestBtn");
  const manifestFile = document.getElementById("manifestFile");
  const tbody = document.getElementById("tbody");
  const toast = document.getElementById("toast");

  /* --- Toast helper --- */
  const showToast = (msg) => {
    const div = document.createElement("div");
    div.className = "toast-bubble";
    div.textContent = msg;
    toast.appendChild(div);
    setTimeout(() => div.remove(), 1500);
  };

  /* --- File Input Handlers --- */
  worldlyBtn.addEventListener("click", () => worldlyFile.click());
  manifestBtn.addEventListener("click", () => manifestFile.click());

  worldlyFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log("Selected Worldly Treasures CSV:", file.name);
    parseCsvFile(file, "worldly");
  });

  manifestFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    console.log("Selected B-Stock CSV:", file.name);
    parseCsvFile(file, "bstock");
  });

  /* --- Core Parser --- */
  function parseCsvFile(file, type) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result.trim();

      // Auto-detect delimiter: tabs or commas
      const delimiter = text.includes("\t") ? "\t" : ",";

      // Split rows safely
      const rows = text
        .split(/\r?\n/)
        .map((r) => r.split(delimiter).map((c) => c.replace(/(^"|"$)/g, "").trim()))
        .filter((r) => r.length > 1);

      console.log(`✅ Parsed ${type} rows:`, rows.slice(0, 3), "...");

      if (type === "worldly") importWorldly(rows);
      else importBstock(rows);
    };
    reader.onerror = (err) => console.error("❌ File read error:", err);
    reader.readAsText(file);
  }

  /* --- B-Stock Parser --- */
  function importBstock(rows) {
    const header = rows[0].map((h) => h.toLowerCase());
    const upcIdx = header.indexOf("upc");
    const nameIdx = header.indexOf("name");
    const brandIdx = header.indexOf("brand");
    const retailIdx = header.indexOf("retail");
    const qtyIdx = header.indexOf("qty");

    const items = rows.slice(1).map((r, i) => ({
      num: i + 1,
      upc: r[upcIdx] || "",
      name: r[nameIdx] || "",
      brand: r[brandIdx] || "",
      retail: parseFloat(r[retailIdx]?.replace(/[^\d.]/g, "")) || 0,
      qty: parseInt(r[qtyIdx] || 1),
    }));

    appendItems(items, "B-Stock");
  }

  /* --- Worldly Treasures Parser --- */
  function importWorldly(rows) {
    const header = rows[0].map((h) => h.toLowerCase());
    const skuIdx = header.indexOf("sku");
    const scanIdx = header.indexOf("scan lp #");
    const descIdx = header.indexOf("item description");
    const modelIdx = header.indexOf("model #");
    const qtyIdx = header.indexOf("qty");
    const retailIdx = header.indexOf("retail");

    const items = rows.slice(1).map((r, i) => ({
      num: i + 1,
      upc: "",
      sku: r[skuIdx] || "",
      scan: r[scanIdx] || "",
      name: r[descIdx] || "",
      model: r[modelIdx] || "",
      qty: parseInt(r[qtyIdx] || 1),
      retail: parseFloat(r[retailIdx]?.replace(/[^\d.]/g, "")) || 0,
      brand: "",
    }));

    appendItems(items, "Worldly Treasures");
  }

  /* --- Append rows to table --- */
  function appendItems(items, label) {
    if (!items.length) return showToast(`⚠️ No valid ${label} items found`);
    for (const item of items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.num}</td>
        <td>${item.upc || "—"}</td>
        <td>${item.name}</td>
        <td>${item.brand || "—"}</td>
        <td>$${item.retail.toFixed(2)}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>${item.qty}</td>
        <td>—</td>
        <td>${item.sku || "—"}</td>
        <td>${item.scan || "—"}</td>
        <td>${item.name || "—"}</td>
        <td>${item.model || "—"}</td>
        <td>${item.qty || "—"}</td>
        <td>$${item.retail.toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    }
    showToast(`✅ Imported ${items.length} ${label} items`);
  }
});
