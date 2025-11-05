// --- BEGIN Worldly Treasures CSV Import --- //

document.getElementById('worldlyBtn')?.addEventListener('click', () => {
  document.getElementById('worldlyFile').click();
});

document.getElementById('worldlyFile')?.addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    processWorldlyCSV(e.target.result);
  };
  reader.readAsText(file);
});

function processWorldlyCSV(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) {
    showToast('CSV file appears to be empty or missing data rows.');
    return;
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const skuIdx    = header.findIndex(h => h === 'sku');
  const scanlpIdx = header.findIndex(h => h.includes('scan lp'));
  const descIdx   = header.findIndex(h => h.includes('description'));
  const modelIdx  = header.findIndex(h => h.includes('model'));
  const qtyIdx    = header.findIndex(h => h === 'qty');
  const retailIdx = header.findIndex(h => h.includes('retail'));

  if ([skuIdx, scanlpIdx, descIdx, modelIdx, qtyIdx, retailIdx].some(i => i === -1)) {
    showToast('CSV header is missing required columns (SKU, SCAN LP #, Item Description, Model #, QTY, Retail).');
    return;
  }

  const tbody = document.getElementById('tbody');
  let added = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length || cols.every(c => c.trim() === "")) continue;

    const tr = document.createElement('tr');
    // Main columns for alignment (12 cells)
    for (let j = 0; j < 12; j++) tr.appendChild(document.createElement('td'));
    // Worldly Treasures columns
    [skuIdx, scanlpIdx, descIdx, modelIdx, qtyIdx, retailIdx].forEach(idx => {
      const td = document.createElement('td');
      td.textContent = idx !== -1 && cols[idx] ? cols[idx].trim() : '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    added++;
  }
  showToast(`${added} Worldly Treasures items imported.`);
}

// Light toast popup (can swap with alert if preferred)
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) { alert(msg); return; }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2700);
}

// --- END Worldly Treasures CSV Import --- //
