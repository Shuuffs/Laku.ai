document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const chatWidget = document.getElementById('chat-widget');
    const chatHeader = document.getElementById('chat-header');
    const chatBody = document.getElementById('chat-body');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-message');
    const toggleButton = document.getElementById('toggle-chat');
    const minimizeButton = document.getElementById('minimize-chat');
    
    let isOpen = true;
    let isMinimized = false;
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    // Toggle chat visibility
    function toggleChat() {
        isOpen = !isOpen;
        if (isOpen) {
            chatBody.classList.remove('hidden');
            if (isMinimized) {
                unminimizeChat();
            }
            updateToggleButton();
            // Scroll to bottom when opening
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        } else {
            chatBody.classList.add('hidden');
            updateToggleButton();
        }
    }
    
    // Minimize chat
    function minimizeChat() {
        chatBody.style.height = '0';
        chatBody.style.minHeight = '0';
        chatBody.style.padding = '0';
        chatBody.style.overflow = 'hidden';
        isMinimized = true;
    }
    
    // Unminimize chat
    function unminimizeChat() {
        chatBody.style.height = '400px';
        chatBody.style.minHeight = '400px';
        chatBody.style.padding = '';
        chatBody.style.overflow = '';
        isMinimized = false;
    }
    
    // Toggle minimize state
    function toggleMinimize() {
        if (isMinimized) {
            unminimizeChat();
        } else {
            minimizeChat();
        }
    }
    
    // Update toggle button icon
    function updateToggleButton() {
        const icon = toggleButton.querySelector('svg');
        if (isOpen) {
            icon.innerHTML = '<path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" />';
        } else {
            icon.innerHTML = '<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />';
        }
    }
    
    // Add message to chat
    function addMessage(content, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
        messageDiv.textContent = content;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }
    
    // Show typing indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'bot-message message';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
    }
    
    // Hide typing indicator
    function hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    // Scroll to bottom of chat
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Start dragging the chat widget
    function startDrag(e) {
        if (e.button !== 0) return; // Only left mouse button
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = chatWidget.offsetLeft;
        startTop = chatWidget.offsetTop;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }
    
    // Handle dragging
    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        
        // Keep widget within viewport
        const maxLeft = window.innerWidth - chatWidget.offsetWidth;
        const maxTop = window.innerHeight - (isMinimized ? chatHeader.offsetHeight : chatWidget.offsetHeight);
        
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
        
        chatWidget.style.left = `${newLeft}px`;
        chatWidget.style.top = `${newTop}px`;
    }
    
    // Stop dragging
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }
    
    // Send message to backend
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;
        
        // Add user message to chat
        addMessage(message, true);
        userInput.value = '';
        
        // Show typing indicator and disable input while processing
        showTypingIndicator();
        userInput.disabled = true;
        sendButton.disabled = true;
        
        try {
            const response = await fetch('/ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ user_text: message })
            });
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();
            console.log('Server response:', data); // Debug log
            
            // Hide typing indicator
            hideTypingIndicator();
            
            // Add bot's response to chat
            if (data.ai_response) {
                addMessage(data.ai_response, false);
                
                // Check if we need to refresh any data based on the action
                console.log('Action received:', data.action); // Debug log
                if (data.action) {
                    // Refresh sales data if it's a sales-related action
                    if (['add_sale', 'sale_added', 'remove_sale'].includes(data.action)) {
                        console.log('Processing sales action:', data.action); // Debug log
                        if (window.fetchSales) {
                            console.log('Calling window.fetchSales()');
                            try {
                                await window.fetchSales();
                                console.log('Sales data refreshed');
                            } catch (e) {
                                console.error('Error refreshing sales:', e);
                            }
                        } else {
                            console.warn('window.fetchSales is not defined');
                        }
                        
                        if (window.updateSummary) {
                            console.log('Updating summary');
                            window.updateSummary();
                        }
                        if (window.updateCharts) {
                            console.log('Updating charts');
                            window.updateCharts();
                        }
                    }
                    
                    // Refresh inventory if it's an inventory-related action
                    if (['add_inventory', 'update_inventory', 'remove_inventory'].includes(data.action) && window.loadInventory) {
                        await window.loadInventory();
                        // Also update the item dropdown in the sales form
                        if (window.fetchAndPopulateItems) {
                            await window.fetchAndPopulateItems();
                        }
                    }
                    
                    // If we have a chart update function, call it
                    if (window.updateInventoryChart) {
                        window.updateInventoryChart();
                    }
                }
                
                // Handle summary data if present
                if (data.summary) {
                    let summaryText = '📊 Summary:\n';
                    if (data.summary.total_revenue !== undefined) {
                        summaryText += `• Total Revenue: $${data.summary.total_revenue.toFixed(2)}\n`;
                    }
                    if (data.summary.best_selling_item) {
                        summaryText += `• Best Selling Item: ${data.summary.best_selling_item}\n`;
                    }
                    if (data.summary.peak_hour) {
                        summaryText += `• Peak Sales Hour: ${data.summary.peak_hour}\n`;
                    }
                    addMessage(summaryText, false);
                }
            } else {
                addMessage("I'm sorry, I couldn't process your request. Please try again.", false);
            }
        } catch (error) {
            console.error('Error:', error);
            hideTypingIndicator();
            addMessage("I'm having trouble connecting to the server. Please try again later.", false);
        } finally {
            // Re-enable input
            userInput.disabled = false;
            sendButton.disabled = false;
            userInput.focus();
        }
    }
    
    // Event Listeners
    chatHeader.addEventListener('mousedown', startDrag);
    toggleButton.addEventListener('click', toggleChat);
    minimizeButton.addEventListener('click', toggleMinimize);
    sendButton.addEventListener('click', sendMessage);
    
    // Send message on Enter key
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Prevent text selection while dragging
    document.addEventListener('selectstart', function(e) {
        if (isDragging) {
            e.preventDefault();
        }
    });
    
    // Add welcome message
    setTimeout(() => {
        addMessage("Hi there! I'm Laku, your sales assistant. How can I help you today?", false);
    }, 1000);
});
