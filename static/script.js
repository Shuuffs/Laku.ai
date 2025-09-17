// DOM Elements
const saleForm = document.getElementById('saleForm');
const salesList = document.getElementById('salesList');
const totalRevenueEl = document.getElementById('totalRevenue');
const totalSalesEl = document.getElementById('totalSalesCount');
const avgOrderValueEl = document.getElementById('avgOrderValue');
const topItemEl = document.getElementById('topItem');
const topItemQtyEl = document.getElementById('topItemQty');
const revenueChartCtx = document.getElementById('revenueChart')?.getContext('2d');
const topItemsCtx = document.getElementById('topItemsChart')?.getContext('2d');

// State
let sales = [];
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
        if (!response.ok) throw new Error('Failed to fetch sales');
        sales = await response.json();
        renderSales();
        updateSummary();
    } catch (error) {
        console.error('Error fetching sales:', error);
        alert('Failed to load sales data');
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
    
    const itemName = document.getElementById('itemName').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);
    
    if (!itemName || isNaN(quantity) || isNaN(price)) {
        alert('Please fill in all fields with valid values');
        return;
    }
    
    try {
        const response = await fetch('/api/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ itemName, quantity, price }),
        });
        
        // Reset form
        saleForm.reset();
        document.getElementById('quantity').value = 1;
        
        // Refresh sales data
        await fetchSales();
    } catch (error) {
        console.error('Error adding sale:', error);
        alert('Failed to add sale');
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
    if (!sales.length) {
        salesList.innerHTML = `
            <tr>
                <td colspan="7" class="py-6 text-center text-emerald-700 text-sm">
                    <svg class="mx-auto h-12 w-12 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p class="mt-2 text-emerald-800">No sales recorded yet</p>
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
    
    // Create table rows
    const rows = sales.slice(0, 10).map(sale => `
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
        salesList.querySelector('tbody').appendChild(viewMore);
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

// Initialize the app
const init = () => {
    // Load initial data
    fetchSales();
    fetchAnalytics();
    
    // Set up auto-refresh every 30 seconds
    setInterval(fetchAnalytics, 30000);
    
    // Set up event listeners
    if (saleForm) {
        saleForm.addEventListener('submit', addSale);
    }
    
    // Set default quantity to 1
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        quantityInput.value = '1';
    }
};

// Make functions available globally
window.fetchSales = fetchSales;
window.updateSummary = updateSummary;

// Start the app
document.addEventListener('DOMContentLoaded', init);
