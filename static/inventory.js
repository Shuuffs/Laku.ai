// Inventory Management Functions

// Function to refresh the inventory display
function refreshInventory() {
    loadInventory();
}

// Toggle inventory section visibility
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleInventory');
    const inventoryContent = document.getElementById('inventoryContent');
    
    if (toggleBtn && inventoryContent) {
        toggleBtn.addEventListener('click', () => {
            inventoryContent.classList.toggle('hidden');
            // Rotate the arrow icon
            toggleBtn.querySelector('svg').classList.toggle('rotate-180');
        });
    }
    
    // Load inventory when page loads
    loadInventory();
    
    // Handle form submission for adding new items
    const addItemForm = document.getElementById('addItemForm');
    if (addItemForm) {
        addItemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addNewItem();
        });
    }
});

// Load inventory items from the server
async function loadInventory() {
    const inventoryList = document.getElementById('inventoryList');
    if (!inventoryList) return;
    
    try {
        inventoryList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">Loading inventory...</div>';
        
        const response = await fetch('/api/items');
        if (!response.ok) throw new Error('Failed to load inventory');
        
        const items = await response.json();
        
        if (items.length === 0) {
            inventoryList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">No items in inventory. Add some items to get started.</div>';
            return;
        }
        
        let html = '';
        items.forEach(item => {
            html += `
                <div class="flex items-center justify-between bg-white p-3 rounded-lg border border-emerald-100 shadow-sm" data-item-id="${item.item_id}">
                    <div class="flex-1">
                        <div class="font-medium text-emerald-800">${item.item_name}</div>
                        <div class="flex justify-between text-xs text-emerald-600">
                            <span>$${parseFloat(item.price).toFixed(2)}</span>
                            <span class="text-gray-500">Qty: ${item.quantity}</span>
                        </div>
                    </div>
                    <button onclick="deleteInventoryItem(${item.item_id}, this)" class="text-red-500 hover:text-red-700 p-1 ml-2" title="Delete item">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            `;
        });
        
        inventoryList.innerHTML = html;
        
        // Refresh the item dropdown in the sales form
        if (typeof fetchAndPopulateItems === 'function') {
            fetchAndPopulateItems();
        }
        
    } catch (error) {
        console.error('Error loading inventory:', error);
        inventoryList.innerHTML = `
            <div class="text-center py-4 text-sm text-red-500">
                Error loading inventory. Please try again.
            </div>
        `;
    }
}

// Add a new item to inventory
async function addNewItem() {
    const nameInput = document.getElementById('newItemName');
    const priceInput = document.getElementById('newItemPrice');
    const quantityInput = document.getElementById('newItemQuantity');
    const submitBtn = document.querySelector('#addItemForm button[type="submit"]');
    
    if (!nameInput || !priceInput || !quantityInput || !submitBtn) return;
    
    const itemName = nameInput.value.trim();
    const itemPrice = parseFloat(priceInput.value);
    const itemQuantity = parseInt(quantityInput.value, 10);
    
    if (!itemName || isNaN(itemPrice) || itemPrice <= 0 || isNaN(itemQuantity) || itemQuantity < 1) {
        showToast('Please enter valid item details', 'error');
        return;
    }
    
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Adding...';
    
    try {
        const response = await fetch('/api/items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                item_name: itemName,
                price: itemPrice,
                quantity: itemQuantity
            }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add item');
        }
        
        // Clear the form
        nameInput.value = '';
        priceInput.value = '';
        
        // Reload the inventory
        await loadInventory();
        
        showToast('Item added successfully', 'success');
        
    } catch (error) {
        console.error('Error adding item:', error);
        showToast(error.message || 'Failed to add item', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    }
}

// Delete an item from inventory
async function deleteInventoryItem(itemId, button) {
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        return;
    }
    
    if (!button) return;
    
    const itemElement = button.closest('[data-item-id]');
    if (itemElement) {
        itemElement.style.opacity = '0.6';
        button.disabled = true;
    }
    
    try {
        const response = await fetch(`/api/items/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete item');
        }
        
        // Remove the item from the UI
        if (itemElement) {
            itemElement.remove();
        }
        
        // Check if there are no more items
        const inventoryList = document.getElementById('inventoryList');
        if (inventoryList && inventoryList.children.length === 0) {
            inventoryList.innerHTML = '<div class="text-center py-4 text-sm text-gray-500">No items in inventory. Add some items to get started.</div>';
        }
        
        // Refresh the item dropdown in the sales form
        if (typeof fetchAndPopulateItems === 'function') {
            fetchAndPopulateItems();
        }
        
        showToast('Item deleted successfully', 'success');
        
    } catch (error) {
        console.error('Error deleting item:', error);
        showToast(error.message || 'Failed to delete item', 'error');
        
        if (itemElement) {
            itemElement.style.opacity = '1';
            button.disabled = false;
        }
    }
}

// Make functions available globally
window.loadInventory = loadInventory;
window.addNewItem = addNewItem;
window.deleteInventoryItem = deleteInventoryItem;
