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

// === Global item list ===
let allItems = [];

// -----------------------------
// CSV Import Handler
// -----------------------------
csvInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const csvText = e.target.result;
    const rows = csvText.split("\n").filter((r) => r.trim() !== "");
    const headers = rows.shift().split(",").map((h) => h.trim().replace(/"/g, ""));

    const parsedItems = rows.map((row) => {
      const values = row.split(",").map((v) => v.replace(/^"|"$/g, "").trim());
      const item = {};
      headers.forEach((h, i) => (item[h] = values[i]));
      return item;
    });

    allItems = parsedItems.filter((i) => i.sku || i.SKU);
    console.log("✅ Imported items:", allItems.length, allItems);
    showToast(`Loaded ${allItems.length} items from CSV`);
  };

  reader.readAsText(file);
});

// -----------------------------
// Fetch stock photo from Unsplash
// -----------------------------
const UNSPLASH_ACCESS_KEY = "D5LVeLM5MZKOJNhrIkjJE72QA20KOhpCk71l1R99Guw";

async function fetchStockPhoto(sku, desc, brand) {
  try {
    const query = encodeURIComponent(desc || brand || sku);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=1&client_id=${UNSPLASH_ACCESS_KEY}`
    );
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].urls.small;
    } else {
      return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(desc || brand || sku)}`;
    }
  } catch (e) {
    console.warn("Image fetch failed for", sku, e);
    return `https://via.placeholder.com/600x600.png?text=${encodeURIComponent(sku)}`;
  }
}

// -----------------------------
// Delay helper (to avoid spammy API hits)
// -----------------------------
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------
// CSV Export Function
// -----------------------------
function exportToCSV(items) {
  if (!items.length) {
    showToast("No items to export!");
    return;
  }

  const headers = Object.keys(items[0]);
  const csvRows = [headers.join(",")];

  for (const item of items) {
    const values = headers.map((h) => `"${(item[h] ?? "").toString().replace(/"/g, '""')}"`);
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

  for (const item of allItems) {
    const sku = item.sku || item.SKU || "";
    const name = item.name || item.Name || "";
    const brand = item.brand || item.Brand || "";

    // Fetch image
    const imageUrl = await fetchStockPhoto(sku, name, brand);

    // Placeholder for price logic:
    const cost = parseFloat(item.cost || item.Cost || 0);
    const startingPrice = cost; // starting auction price = cost
    const binPrice = cost * 0.8; // BIN = 80% placeholder

    enrichedItems.push({
      sku,
      name,
      brand,
      cost,
      startingPrice,
      binPrice,
      imageUrl,
    });

    await delay(300); // avoid Unsplash rate limit
  }

  showToast("Image lookup complete. Generating CSV...");
  console.log("Image lookup complete:", enrichedItems);

  exportToCSV(enrichedItems);
  showToast("WooCommerce CSV exported successfully!");
});
