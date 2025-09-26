// Show toast notification
const showToast = (message, type = 'info') => {
    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '1000';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.padding = '12px 20px';
    toast.style.marginBottom = '10px';
    toast.style.borderRadius = '4px';
    toast.style.color = 'white';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    
    // Set background color based on type
    switch(type) {
        case 'success':
            toast.style.backgroundColor = '#10B981';
            break;
        case 'error':
            toast.style.backgroundColor = '#EF4444';
            break;
        case 'warning':
            toast.style.backgroundColor = '#F59E0B';
            break;
        default:
            toast.style.backgroundColor = '#3B82F6';
    }
    
    // Add message
    toast.textContent = message;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Trigger reflow to enable transition
    void toast.offsetWidth;
    toast.style.opacity = '1';
    
    // Auto-remove after delay
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, 5000);
};

// DOM Elements
const saleForm = document.getElementById('saleForm');
const salesList = document.getElementById('salesList');
const timeFilter = document.getElementById('timeFilter');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const totalRevenueEl = document.getElementById('totalRevenue');
const totalSalesEl = document.getElementById('totalSalesCount');
const avgOrderValueEl = document.getElementById('avgOrderValue');
const topItemEl = document.getElementById('topItem');
const topItemQtyEl = document.getElementById('topItemQty');
const revenueChartCtx = document.getElementById('revenueChart')?.getContext('2d');
const topItemsCtx = document.getElementById('topItemsChart')?.getContext('2d');

// State
let sales = [];
let items = [];

// Function to fetch and populate items from storage
async function fetchAndPopulateItems() {
    try {
        const response = await fetch('/api/items');
        if (!response.ok) {
            throw new Error('Failed to fetch items');
        }
        items = await response.json();
        
        const select = document.getElementById('itemName');
        if (!select) return;
        
        // Clear existing options except the first one
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        // Add items to dropdown
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.item_name;
            option.textContent = `${item.item_name} ($${parseFloat(item.price).toFixed(2)})`;
            option.dataset.price = item.price; // Store price as data attribute
            select.appendChild(option);
        });
        
        // Add event listener to update price when item is selected
        select.addEventListener('change', (e) => {
            const selectedOption = e.target.selectedOptions[0];
            const priceInput = document.getElementById('price');
            if (selectedOption && selectedOption.dataset.price) {
                // Store the price in the hidden input
                priceInput.value = parseFloat(selectedOption.dataset.price).toFixed(2);
                
                // Update the displayed price in the dropdown for better UX
                if (selectedOption.value) {
                    selectedOption.textContent = `${selectedOption.value} ($${priceInput.value})`;
                }
            } else {
                priceInput.value = '0.00';
            }
        });
        
        // Set initial price if an item is already selected
        if (select.selectedIndex > 0) {
            const selectedOption = select.options[select.selectedIndex];
            if (selectedOption && selectedOption.dataset.price) {
                document.getElementById('price').value = 
                    parseFloat(selectedOption.dataset.price).toFixed(2);
            }
        }
        
    } catch (error) {
        console.error('Error fetching items:', error);
        showToast('Error loading items. Please try again.', 'error');
    }
}
let analytics = {
    total_revenue: 0,
    total_sales_count: 0,
    avg_order_value: 0,
    best_selling_item: null,
    best_selling_quantity: 0,
    items_sold: {},
    hourly_sales: {},
    recent_sales: []
};

// Chart instances
let revenueChart = null;
let topItemsChart = null;

// Format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
};

// Format date
const formatDate = (dateString) => {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
};

// Fetch sales data
const fetchSales = async () => {
    try {
        const response = await fetch('/api/sales');
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to fetch sales');
        }
        
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Invalid sales data received');
        }
        
        // Update sales data
        sales = data; // Use the correct variable name 'sales' instead of 'salesData'
        
        // Render the sales list
        if (typeof renderSales === 'function') {
            renderSales();
        }
        
        // Update summary
        if (typeof updateSummary === 'function') {
            updateSummary();
        }
        
        // Update charts if they exist
        if (window.salesChart && typeof updateSalesChart === 'function') {
            updateSalesChart(sales);
        }
        
        if (window.categoryChart && typeof updateCategoryChart === 'function') {
            updateCategoryChart(sales);
        }
        
        return sales;
    } catch (error) {
        console.error('Error fetching sales:', error);
        showToast(error.message || 'Failed to load sales data', 'error');
        throw error; // Re-throw to allow callers to handle the error
    }
};

// Fetch analytics data
const fetchAnalytics = async () => {
    try {
        const response = await fetch('/api/analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const data = await response.json();
        if (data.success) {
            analytics = data.analytics;
            updateSummary();
            updateCharts();
        }
    } catch (error) {
        console.error('Error fetching analytics:', error);
    }
};

// Add new sale
const addSale = async (e) => {
    e.preventDefault();
    
    const itemSelect = document.getElementById('itemName');
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    
    if (!selectedOption || !selectedOption.dataset.price) {
        showToast('Please select a valid item', 'error');
        return;
    }
    
    const itemName = selectedOption.value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const price = parseFloat(selectedOption.dataset.price); // Get price from selected item
    
    // Validate inputs
    if (!itemName || isNaN(quantity) || isNaN(price) || quantity <= 0 || price < 0) {
        showToast('Please fill in all fields with valid values', 'error');
        return;
    }
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    
    try {
        // Disable submit button during request
        submitButton.disabled = true;
        submitButton.innerHTML = 'Processing...';
        
        // Send request to server
        const response = await fetch('/api/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                item_name: itemName, 
                quantity: quantity, 
                price: price 
            }),
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to add sale');
        }
        
        // Show success message
        showToast(`Sale recorded: ${quantity}x ${itemName} for $${price.toFixed(2)}`);
        
        // Reset form
        saleForm.reset();
        
        // Refresh data
        await Promise.all([
            fetchSales(),
            fetchAnalytics(),
            updateInventoryChart()  // Refresh the inventory chart
        ]);
        
        // Update UI
        renderSales();
        updateSummary();
        
    } catch (error) {
        console.error('Error adding sale:', error);
        showToast(error.message || 'Failed to add sale', 'error');
    } finally {
        // Re-enable submit button
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    }
};

// Delete a sale
const deleteSale = async (saleId) => {
    if (!confirm('Are you sure you want to delete this sale? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/sales/${saleId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Refresh the sales list and analytics
            await Promise.all([fetchSales(), fetchAnalytics()]);
            renderSales();
            updateSummary();
            
            // Show success message
            alert(data.message);
        } else {
            throw new Error(data.message || 'Failed to delete sale');
        }
    } catch (error) {
        console.error('Error deleting sale:', error);
        alert(`Error: ${error.message}`);
    }
};

// Render sales list
const renderSales = () => {
    if (!salesList) return;
    
    // Get search query
    const searchQuery = searchInput ? searchInput.value : '';
    
    // Get filtered sales based on selected time period
    const selectedPeriod = timeFilter ? timeFilter.value : 'all';
    let filteredSales = filterSalesByTime(sales, selectedPeriod);
    
    // Apply search filter if there's a search query
    if (searchQuery) {
        filteredSales = searchSales(filteredSales, searchQuery);
    }
    
    if (!filteredSales.length) {
        const noResultsMessage = searchQuery 
            ? `No sales found matching "${searchQuery}"`
            : 'No sales found for the selected period';
            
        salesList.innerHTML = `
            <tr>
                <td colspan="7" class="py-6 text-center text-emerald-700 text-sm">
                    <svg class="mx-auto h-12 w-12 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p class="mt-2 text-emerald-800">${noResultsMessage}</p>
                </td>
            </tr>`;
        return;
    }
    
    // Create table header
    const header = `
        <thead class="bg-emerald-50">
            <tr class="text-xs font-semibold tracking-wide text-left text-emerald-700 uppercase border-b border-emerald-200">
                <th class="px-4 py-3 w-20">ID</th>
                <th class="px-4 py-3">Item</th>
                <th class="px-4 py-3 text-right">Qty</th>
                <th class="px-4 py-3 text-right">Unit Price</th>
                <th class="px-4 py-3 text-right">Total</th>
                <th class="px-4 py-3 text-right">Date</th>
                <th class="px-4 py-3 text-right">Actions</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-emerald-100">
    `;
    
    // Create table rows with filtered sales
    const rows = filteredSales.slice(0, 10).map(sale => `
        <tr class="text-emerald-700 hover:bg-emerald-50 transition-colors" data-sale-id="${sale.id}">
            <td class="px-4 py-3 text-xs font-medium text-emerald-600">#${sale.id}</td>
            <td class="px-4 py-3 text-sm font-medium text-emerald-900">
                <div class="flex items-center">
                    <span class="font-medium">${sale.item_name}</span>
                </div>
            </td>
            <td class="px-4 py-3 text-sm text-right text-emerald-600">${sale.quantity}</td>
            <td class="px-4 py-3 text-sm text-right text-emerald-900">${formatCurrency(sale.price)}</td>
            <td class="px-4 py-3 text-sm font-medium text-right text-emerald-900">
                ${formatCurrency(sale.quantity * sale.price)}
            </td>
            <td class="px-4 py-3 text-xs text-right text-emerald-500">
                ${formatDate(sale.created_at || new Date().toISOString())}
            </td>
            <td class="px-4 py-3 text-right">
                <button 
                    onclick="deleteSale(${sale.id})" 
                    class="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete this sale"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
    
    salesList.innerHTML = header + rows + '</tbody>';
    
    // Add a view more button if there are more than 10 sales
    if (sales.length > 10) {
        const viewMore = document.createElement('tr');
        viewMore.innerHTML = `
            <td colspan="7" class="px-4 py-3 text-center text-xs text-emerald-600 bg-emerald-50">
                Showing 10 of ${sales.length} sales
            </td>
        `;
        // salesList.querySelector('tbody').appendChild(viewMore);
    }
};

// Update summary statistics
const updateSummary = () => {
    // Update summary cards
    totalRevenueEl.textContent = formatCurrency(analytics.total_revenue || 0);
    totalSalesEl.textContent = analytics.total_sales_count || 0;
    avgOrderValueEl.textContent = formatCurrency(analytics.avg_order_value || 0);
    
    // Update top selling item
    if (analytics.best_selling_item) {
        topItemEl.textContent = analytics.best_selling_item;
        topItemQtyEl.textContent = `${analytics.best_selling_quantity || 0} ${analytics.best_selling_quantity === 1 ? 'unit' : 'units'} sold`;
    } else {
        topItemEl.textContent = '-';
        topItemQtyEl.textContent = '0 units sold';
    }
    
    // Update trend indicators (you can implement trend calculation based on previous period)
    document.querySelectorAll('.trend-indicator').forEach(el => {
        el.textContent = '→ No change';
        el.className = 'text-gray-500 text-sm mt-2 trend-indicator';
    });
};

// Update charts
const updateCharts = () => {
    // Update revenue trend chart
    if (revenueChartCtx) {
        const hours = Array.from({length: 24}, (_, i) => i);
        const salesData = hours.map(hour => analytics.hourly_sales?.[hour] || 0);
        
        if (revenueChart) {
            revenueChart.data.labels = hours.map(h => `${h}:00`);
            revenueChart.data.datasets[0].data = salesData;
            revenueChart.update();
        } else if (window.Chart) {
            revenueChart = new Chart(revenueChartCtx, {
                type: 'line',
                data: {
                    labels: hours.map(h => `${h}:00`),
                    datasets: [{
                        label: 'Sales by Hour',
                        data: salesData,
                        borderColor: '#059669',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        backgroundColor: 'rgba(5, 150, 105, 0.1)',
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#059669',
                        pointHoverBackgroundColor: '#10b981',
                        pointHoverBorderColor: '#fff',
                        pointHoverRadius: 5,
                        pointHoverBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(6, 78, 59, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#ecfdf5',
                            padding: 10,
                            borderColor: '#10b981',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => `${context.parsed.y} sales at ${context.label}`,
                                title: () => 'Sales Activity'
                            }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: {
                                color: 'rgba(209, 250, 229, 0.3)'
                            },
                            ticks: { 
                                color: '#064e3b',
                                precision: 0,
                                stepSize: 1
                            } 
                        },
                        x: {
                            grid: {
                                color: 'rgba(209, 250, 229, 0.2)'
                            },
                            ticks: {
                                color: '#065f46'
                            }
                        }
                    }
                }
            });
        }
    }

    // Update top items chart
    if (topItemsCtx && analytics.items_sold) {
        const items = Object.entries(analytics.items_sold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        if (topItemsChart) {
            topItemsChart.data.labels = items.map(([item]) => item);
            topItemsChart.data.datasets[0].data = items.map(([_, qty]) => qty);
            topItemsChart.update();
        } else if (window.Chart) {
            topItemsChart = new Chart(topItemsCtx, {
                type: 'bar',
                data: {
                    labels: items.map(([item]) => item),
                    datasets: [{
                        label: 'Units Sold',
                        data: items.map(([_, qty]) => qty),
                        backgroundColor: (context) => {
                            const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
                            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
                            gradient.addColorStop(1, 'rgba(5, 150, 105, 0.7)');
                            return gradient;
                        },
                        borderColor: '#047857',
                        borderWidth: 1,
                        borderRadius: 4,
                        hoverBackgroundColor: '#10b981',
                        hoverBorderColor: '#065f46',
                        hoverBorderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(6, 78, 59, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#ecfdf5',
                            padding: 10,
                            borderColor: '#10b981',
                            borderWidth: 1,
                            callbacks: {
                                label: (context) => `${context.parsed.x} units`,
                                title: () => 'Units Sold'
                            }
                        }
                    },
                    scales: {
                        x: { 
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(209, 250, 229, 0.3)'
                            },
                            ticks: { 
                                color: '#064e3b',
                                precision: 0,
                                stepSize: 1
                            } 
                        },
                        y: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: '#065f46',
                                font: {
                                    weight: '500'
                                }
                            }
                        }
                    }
                }
            });
        }
    }
};

// Search sales by item name
const searchSales = (sales, query) => {
    if (!query) return sales;
    
    const searchTerm = query.toLowerCase().trim();
    return sales.filter(sale => 
        sale.item_name.toLowerCase().includes(searchTerm) ||
        (sale.id && sale.id.toString().includes(searchTerm))
    );
};

// Filter sales by time period
const filterSalesByTime = (sales, period) => {
    const now = new Date();
    let startDate;

    switch (period) {
        case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
        case 'week':
            startDate = new Date(now.setDate(now.getDate() - now.getDay()));
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        case 'all':
        default:
            return sales; // Return all sales if 'all' or unknown period
    }

    return sales.filter(sale => {
        const saleDate = new Date(sale.sale_date || sale.created_at);
        return saleDate >= startDate;
    });
};

// Initialize the app
const init = async () => {
    try {
        // Set default quantity to 1
        const quantityInput = document.getElementById('quantity');
        if (quantityInput) {
            quantityInput.value = '1';
        }
        
        // Fetch and populate items in the dropdown
        await fetchAndPopulateItems();
        
        // Set up time filter event listener
        if (timeFilter) {
            timeFilter.addEventListener('change', () => {
                renderSales();
                updateSummary();
            });
        }
        
        // Set up search functionality
        if (searchInput) {
            // Search on input with debounce
            let searchTimeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    renderSales();
                    updateSummary();
                    
                    // Show/hide clear button based on input
                    if (clearSearchBtn) {
                        clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
                    }
                }, 300);
            });
            
            // Clear search button
            if (clearSearchBtn) {
                clearSearchBtn.style.display = 'none'; // Hide initially
                clearSearchBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    clearSearchBtn.style.display = 'none';
                    renderSales();
                    updateSummary();
                });
            }
            
            // Search on Enter key
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(searchTimeout);
                    renderSales();
                    updateSummary();
                }
            });
        }
        
        // Set up event listeners
        if (saleForm) {
            // Remove any existing event listeners to prevent duplicates
            const newForm = saleForm.cloneNode(true);
            saleForm.parentNode.replaceChild(newForm, saleForm);
            // newForm.addEventListener('submit', addSale);
        }
        
        // Load initial data
        await Promise.all([
            fetchSales(),
            fetchAnalytics()
        ]);
        
        // Make sure the sales list is rendered
        if (typeof renderSales === 'function') {
            renderSales();
        }
        
        // Set up auto-refresh every 30 seconds
        setInterval(fetchAnalytics, 30000);
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showToast('Failed to initialize application', 'error');
    }
};

// Function to fetch and render inventory chart
async function updateInventoryChart() {
    try {
        const response = await fetch('/api/inventory/chart-data');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch inventory data');
        }
        
        const chartElement = document.getElementById('inventoryChart');
        if (!chartElement) {
            throw new Error('Inventory chart element not found');
        }
        
        const ctx = chartElement.getContext('2d');
        if (!ctx) {
            throw new Error('Could not get 2D context for the chart');
        }
        
        // Destroy existing chart if it exists and has the destroy method
        if (window.inventoryChart && typeof window.inventoryChart.destroy === 'function') {
            window.inventoryChart.destroy();
        }
        
        // Create new chart with vintage green theme
        window.inventoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.data.map(item => item.name),
                datasets: [{
                    label: 'Quantity in Stock',
                    data: data.data.map(item => item.quantity),
                    backgroundColor: [
                        'rgba(5, 150, 105, 0.7)',
                        'rgba(6, 95, 70, 0.7)',
                        'rgba(16, 185, 129, 0.7)',
                        'rgba(4, 120, 87, 0.7)',
                        'rgba(2, 132, 99, 0.7)',
                        'rgba(110, 231, 183, 0.7)'
                    ],
                    borderColor: [
                        'rgba(4, 120, 87, 1)',
                        'rgba(6, 78, 59, 1)',
                        'rgba(5, 150, 105, 1)',
                        'rgba(6, 95, 70, 1)',
                        'rgba(4, 120, 87, 1)',
                        'rgba(16, 185, 129, 1)'
                    ],
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(5, 150, 105, 0.9)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        titleFont: {
                            family: "'Poppins', sans-serif",
                            weight: '600',
                            size: 14
                        },
                        bodyFont: {
                            family: "'Poppins', sans-serif",
                            size: 13
                        },
                        padding: 12,
                        cornerRadius: 6,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.parsed.y} in stock`;
                            },
                            title: function(context) {
                                return context[0].label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(209, 250, 229, 0.3)',
                            drawBorder: false
                        },
                        title: {
                            display: true,
                            text: 'Quantity',
                            color: '#064e3b',
                            font: {
                                family: "'Poppins', sans-serif",
                                weight: 500,
                                size: 13
                            }
                        },
                        ticks: {
                            color: '#064e3b',
                            font: {
                                family: "'Poppins', sans-serif",
                                size: 12
                            },
                            precision: 0,
                            stepSize: 1
                        }
                    },
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        title: {
                            display: true,
                            text: 'Items',
                            color: '#064e3b',
                            font: {
                                family: "'Poppins', sans-serif",
                                weight: 500,
                                size: 13
                            }
                        },
                        ticks: {
                            color: '#064e3b',
                            font: {
                                family: "'Poppins', sans-serif",
                                size: 12,
                                weight: 500
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 10,
                        right: 10,
                        bottom: 10,
                        left: 10
                    }
                },
                elements: {
                    bar: {
                        hoverBackgroundColor: 'rgba(4, 120, 87, 0.9)'
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error updating inventory chart:', error);
        showToast('Failed to update inventory chart', 'error');
    }
}

// Make functions available globally
window.fetchSales = fetchSales;
window.updateSummary = updateSummary;
window.addSale = addSale;
window.updateInventoryChart = updateInventoryChart;

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    init();
    // Initialize inventory chart after the page loads with a small delay
    // to ensure the DOM is fully ready
    setTimeout(() => {
        updateInventoryChart();
    }, 100);
});
