// Add file upload functionality to handle inventory manifest uploads

// HTML for file upload
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.csv';
fileInput.id = 'fileInput';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);

const uploadButton = document.createElement('button');
uploadButton.textContent = 'Upload Manifest';
uploadButton.addEventListener('click', () => fileInput.click());

document.body.appendChild(uploadButton);

// Handle file upload
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) {
    toast('No file selected');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const rows = content.split('\n');
    const headers = rows[0].split(',');

    rows.slice(1).forEach((row) => {
      const values = row.split(',');
      const item = {};
      headers.forEach((header, index) => {
        item[header.trim()] = values[index]?.trim();
      });

      // Calculate necessary fields like cost per item and resale price
      const retailPrice = parseFloat(item['Retail Price']);
      const costPerItem = state.palletCost / (state.targetItems || totalUnits());
      const goalSale = retailPrice * 0.38;

      item['Cost Per Item'] = costPerItem.toFixed(2);
      item['Resale Price'] = goalSale.toFixed(2);

      state.items.push(item);
    });

    save();
    repaint();
    toast('Manifest Uploaded Successfully');
  };

  reader.readAsText(file);
});