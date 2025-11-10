// -----------------------------
// WooCommerce CSV Exporter App
// -----------------------------

// === Selectors ===
const exportBtn = document.getElementById("exportBtn");
const csvInput = document.getElementById("csvInput");
const toast = document.getElementById("toast");

// === Toast notifications ===
function showToast(message) {
  if (!toast) {
    console.log("Toast:", message);
    return;
  }
  toast.innerText = message;
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 4000);
}

// === Progress bar helper ===
function updateProgress(current, total) {
  const container = document.getElementById("progressContainer");
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");

  if (!container || !bar || !text) return;

  container.style.display = "block";
  const percent = Math.round((current / total) * 100);
  bar.style.width = `${percent}%`;
  text.innerText = `Progress: ${percent}% (${current}/${total})`;

  if (percent >= 100) {
    setTimeout(() => {
      container.style.display = "none";
      bar.style.width = "0%";
      text.innerText = "Progress: 0%";
    }, 3000);
  }
}

// === Delay helper ===
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// === Global array for imported items ===
let allItems = [];

// -----------------------------
// CSV Import (Worldly Treasures)
// -----------------------------
csvInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  const rows = text.split("\n").map((r) => r.trim()).filter(Boolean);
  const headers = rows[0].split(",").map((h) => h.trim());
  allItems = rows.slice(1).map((row) => {
    const values = row.split(",");
    const item = {};
    headers.forEach((h, i) => (item[h] = values[i]));
    return item;
  });

  showToast(`Loaded ${allItems.length} items from ${file.name}`);
  console.log("Worldly Treasures items:", allItems);
});

// -----------------------------
// Fetch stock photo via Unsplash or fallback
// -----------------------------
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";

const fetchStockPhoto = async (sku, desc, brand) => {
  try {
    const query = encodeURIComponent(`${desc || brand || sku}`);
    const url = `https://api.unsplash.com/photos/random?query=${query}&client_id=${UNSPLASH_ACCESS_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Unsplash fetch failed");

    const data = await res.json();
    return data.urls?.small || data.urls?.regular;
  } catch (e) {
    console.warn("Unsplash image fetch failed for", sku, e);
    const safeText = encodeURIComponent(desc?.slice(0, 60) || sku);
    return `https://via.placeholder.com/600x600.png?text=${safeText}`;
  }
};

// -----------------------------
// Export WooCommerce CSV
// -----------------------------
function exportToCSV(items) {
  if (!items.length) {
    showToast("No items to export!");
    return;
  }

  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(",")];

  for (const item of items) {
    const values = headers.map((h) =>
      `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`
    );
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `WooCommerce_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// -----------------------------
// Export button logic
// -----------------------------
exportBtn.addEventListener("click", async () => {
  if (!allItems.length) {
    showToast("No items to export");
    return;
  }

  showToast("Starting image lookup (this may take a moment)...");
  console.log("Export: fetching images for", allItems.length, "items...");

  const enrichedItems = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];

    // Calculate 80% BIN and cost placeholders
    const retail = parseFloat(item.Retail || item.price || 0);
    const binPrice = (retail * 0.8).toFixed(2);
    const cost = (retail * 0.6).toFixed(2); // placeholder for now

    const imageUrl = await fetchStockPhoto(item.sku, item.name, item.brand);

    enrichedItems.push({
      ...item,
      imageUrl,
      "BIN (80%)": binPrice,
      Cost: cost,
    });

    updateProgress(i + 1, allItems.length);
    await delay(200); // gentle pacing for API
  }

  showToast("Image lookup complete. Generating CSV...");
  console.log("Image lookup complete:", enrichedItems);

  exportToCSV(enrichedItems);
  showToast("WooCommerce CSV exported successfully!");
});
