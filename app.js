// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAPm26AWckDmZQhBNbwRCloTnoTjPvhvLw",
    authDomain: "easylunch213100.firebaseapp.com",
    projectId: "easylunch213100",
    storageBucket: "easylunch213100.firebasestorage.app",
    messagingSenderId: "180723267125",
    appId: "1:180723267125:web:03dbd64b86ebcaaa17a37c",
    measurementId: "G-BE5Q3XHBVT"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let state = {
    menu: [],
    orders: [],
    deadline: '',
    siteImage: '',
    cart: [], // Local only
    adminAuthenticated: false,
    maxSeats: 100,
    adminPassword: '123',
    history: [] // Historical meal items
};

function getLocalDateStr(dateObj = new Date()) {
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().split('T')[0];
}
// --- Data Synchronization ---

// Listen for Database Changes
function initDatabaseSync() {
    // Sync Menu
    db.ref('menu').on('value', (snapshot) => {
        state.menu = snapshot.val() || [];
        renderAdminMenu();
        renderUserMenuDropdown();
    });

    // Sync Orders
    db.ref('orders').on('value', (snapshot) => {
        const rawOrders = snapshot.val() || {};
        state.orders = Object.keys(rawOrders).map(key => ({
            ...rawOrders[key],
            id: key
        }));
        renderAdminOrders();
        renderPublicOrders();
    });

    // Sync Deadline
    db.ref('deadline').on('value', (snapshot) => {
        state.deadline = snapshot.val() || '';
        updateDeadlineBanner();
    });

    // Sync Settings
    db.ref('settings').on('value', (snapshot) => {
        const settings = snapshot.val() || {};
        state.maxSeats = settings.maxSeats || 100;
        state.adminPassword = settings.adminPassword || '123';
        populateSeats();
    });

    // Sync Meal History
    db.ref('history').on('value', (snapshot) => {
        state.history = snapshot.val() || [];
        renderMenuShortcuts();
    });

    // Sync Site Image
    db.ref('siteImage').on('value', (snapshot) => {
        state.siteImage = snapshot.val() || '';
        updateSiteImageDisplay();
    });
}

// --- Write Operations ---

function saveMenu() {
    db.ref('menu').set(state.menu);
}

function saveOrder(order) {
    return db.ref('orders').push(order);
}

function saveDeadline() {
    db.ref('deadline').set(state.deadline);
}

function saveSettings() {
    db.ref('settings').set({
        maxSeats: state.maxSeats,
        adminPassword: state.adminPassword
    });
}

function updateOrderPaid(orderId, isPaid) {
    db.ref(`orders/${orderId}/paid`).set(isPaid);
}

function updateOrderChange(orderId, field, value) {
    // value can be string (note) or number (amount)
    db.ref(`orders/${orderId}/${field}`).set(value);
}

function deleteOrderFromDB(orderId) {
    db.ref(`orders/${orderId}`).remove();
}

function deleteDateOrders(dateStr) {
    const pwd = prompt(`確定要刪除 ${dateStr} 的所有訂單嗎？請輸入管理員密碼：`);
    if (pwd === state.adminPassword) {
        const ordersToDelete = state.orders.filter(o => o.date === dateStr);
        ordersToDelete.forEach(o => {
            db.ref(`orders/${o.id}`).remove();
        });
        showToast(`已刪除 ${dateStr} 的所有訂單`);
    } else if (pwd !== null) {
        showToast('密碼錯誤，刪除失敗');
    }
}

function updateMenuItemStock(itemId, newStock) {
    const itemIndex = state.menu.findIndex(m => m.id === itemId);
    if (itemIndex !== -1) {
        db.ref(`menu/${itemIndex}/stock`).set(newStock);
    }
}

function updateSiteImageDisplay() {
    const userImgContainer = document.getElementById('user-site-image-container');
    const userImg = document.getElementById('user-site-image');
    const adminImg = document.getElementById('admin-image-preview');
    const adminDelBtn = document.getElementById('btn-delete-site-image');
    
    if (state.siteImage) {
        if (userImgContainer) userImgContainer.style.display = 'block';
        if (userImg) userImg.src = state.siteImage;
        if (adminImg) {
            adminImg.style.display = 'block';
            adminImg.src = state.siteImage;
        }
        if (adminDelBtn) adminDelBtn.style.display = 'flex';
    } else {
        if (userImgContainer) userImgContainer.style.display = 'none';
        if (adminImg) adminImg.style.display = 'none';
        if (adminDelBtn) adminDelBtn.style.display = 'none';
    }
}

// --- UI Utilities ---

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast && toast.parentNode) container.removeChild(toast);
    }, 3000);
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function isDeadlinePassed() {
    if (!state.deadline) return false;
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    return currentTime >= state.deadline;
}

function isOrderAllowed(dateStr) {
    const todayStr = getLocalDateStr(new Date());
    if (!dateStr || dateStr < todayStr) return false;
    if (dateStr === todayStr) {
        return !isDeadlinePassed();
    }
    return true; 
}

function getDayName(dayStr) {
    const names = { "ALL": "固定(每天)", "1": "星期一", "2": "星期二", "3": "星期三", "4": "星期四", "5": "星期五", "6": "星期六", "0": "星期日" };
    return names[dayStr] || dayStr;
}

// --- Renderers ---

function populateSeats() {
    const seatSelect = document.getElementById('user-seat');
    if (!seatSelect) return;
    const currentVal = seatSelect.value;
    seatSelect.innerHTML = '<option value="" disabled selected>請選擇您的座號</option>';
    for (let i = 1; i <= state.maxSeats; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        seatSelect.appendChild(option);
    }
    seatSelect.value = currentVal;
}

function renderUserMenuDropdown() {
    const select = document.getElementById('user-menu-select');
    if (!select) return;
    select.innerHTML = '';

    const orderDateInput = document.getElementById('user-order-date');
    if (!orderDateInput) return;
    const orderDateStr = orderDateInput.value;
    
    if (!orderDateStr) return;
    const orderDate = new Date(orderDateStr);
    const dayOfWeek = orderDate.getDay().toString(); 
    
    const isAllowed = isOrderAllowed(orderDateStr);
    const addBtn = document.getElementById('btn-add-to-cart');

    if (!isAllowed) {
        select.innerHTML = '<option value="" disabled selected>已截止或無效日期</option>';
        if (addBtn) addBtn.disabled = true;
        return;
    }

    const availableItems = state.menu.filter(item => {
        const isDayMatching = (item.availableDay === 'ALL' || item.availableDay === dayOfWeek);
        const hasStock = (!item.hasLimit || item.stock > 0);
        return isDayMatching && hasStock;
    });

    if (availableItems.length === 0) {
        select.innerHTML = '<option value="" disabled selected>該日目前無餐點供應</option>';
        if (addBtn) addBtn.disabled = true;
        return;
    }

    if (addBtn) addBtn.disabled = false;

    availableItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        let text = `${item.name} - $${item.price}`;
        if (item.hasLimit) text += ` (剩餘: ${item.stock})`;
        option.textContent = text;
        select.appendChild(option);
    });
}

function updateDeadlineBanner() {
    const textEl = document.getElementById('user-deadline-text');
    const submitBtn = document.getElementById('btn-submit-order');
    const addBtn = document.getElementById('btn-add-to-cart');
    
    const orderDateInput = document.getElementById('user-order-date');
    if (!orderDateInput) return;
    const orderDateStr = orderDateInput.value;
    const todayStr = getLocalDateStr(new Date());
    
    const isPast = orderDateStr < todayStr;
    const isAllowed = isOrderAllowed(orderDateStr);

    if (isPast) {
        textEl.textContent = `無法預購過去的餐點`;
        textEl.style.color = 'var(--danger)';
        if (submitBtn) submitBtn.disabled = true;
        if (addBtn) addBtn.disabled = true;
        return;
    }

    if (state.deadline) {
        textEl.textContent = `該日訂單截止時間：${state.deadline}`;
        if (!isAllowed) {
            textEl.textContent += ' (今日已截止)';
            textEl.style.color = 'var(--danger)';
            if (submitBtn) submitBtn.disabled = true;
            if (addBtn) addBtn.disabled = true;
        } else {
            textEl.style.color = 'inherit';
        }
    } else {
        textEl.textContent = '尚未設定截止時間';
        textEl.style.color = 'inherit';
    }
}

function renderCart() {
    const container = document.getElementById('cart-list');
    const totalEl = document.getElementById('cart-total');
    const submitBtn = document.getElementById('btn-submit-order');
    if (!container) return;
    container.innerHTML = '';

    let total = 0;

    if (state.cart.length === 0) {
        container.innerHTML = '<p class="empty-state">購物車內還沒有餐點唷！</p>';
        if (totalEl) totalEl.textContent = `$0`;
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    state.cart.forEach((cartItem, index) => {
        const menuItem = state.menu.find(m => m.id === cartItem.itemId);
        if (!menuItem) return;

        const itemTotal = menuItem.price * cartItem.qty;
        total += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="name-qty">
                <span>${menuItem.name} x ${cartItem.qty}</span>
                <span class="item-subtext">$${menuItem.price} / 份</span>
            </div>
            <div style="display:flex; align-items:center; gap: 1rem;">
                <span class="price">$${itemTotal}</span>
                <button class="btn-remove-sm" onclick="removeFromCart(${index})" title="移除"><i class='bx bx-x-circle'></i></button>
            </div>
        `;
        container.appendChild(div);
    });

    if (totalEl) totalEl.textContent = `$${total}`;
    const orderDateInput = document.getElementById('user-order-date');
    const orderDateStr = orderDateInput ? orderDateInput.value : '';
    if (submitBtn) submitBtn.disabled = !isOrderAllowed(orderDateStr);
}

window.removeFromCart = function (index) {
    const orderDateInput = document.getElementById('user-order-date');
    const orderDateStr = orderDateInput ? orderDateInput.value : '';
    if (!isOrderAllowed(orderDateStr)) return;

    const cartItem = state.cart[index];
    const menuItem = state.menu.find(m => m.id === cartItem.itemId);
    if (menuItem && menuItem.hasLimit) {
        updateMenuItemStock(menuItem.id, menuItem.stock + cartItem.qty);
    }

    state.cart.splice(index, 1);
    renderCart();
};

function renderAdminMenu() {
    const container = document.getElementById('admin-menu-list');
    if (!container) return;
    container.innerHTML = '';

    if (state.menu.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); padding: 1rem 0;">尚無餐點</p>';
        return;
    }

    state.menu.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'admin-menu-item';
        let stockText = item.hasLimit ? `<span class="admin-item-subtext">庫存: ${item.stock} / ${item.originalStock}</span>` : `<span class="admin-item-subtext">無庫存限制</span>`;
        let dayText = `<span class="admin-item-subtext-day">供應: ${getDayName(item.availableDay)}</span>`;

        div.innerHTML = `
            <div class="admin-item-details">
                <strong>${item.name} - $${item.price}</strong>
                ${dayText} ${stockText}
            </div>
            <button class="btn-delete" title="刪除餐點" onclick="deleteMenuItem(${index})"><i class='bx bx-trash'></i></button>
        `;
        container.appendChild(div);
    });
}

function renderMenuShortcuts() {
    const container = document.getElementById('menu-shortcuts');
    if (!container) return;
    container.innerHTML = '';

    if (state.history.length === 0) {
        container.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">尚無歷史紀錄</span>';
        return;
    }

    state.history.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'shortcut-btn';
        btn.textContent = `${item.name} ($${item.price})`;
        btn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('menu-item-name').value = item.name;
            document.getElementById('menu-item-price').value = item.price;
        };
        container.appendChild(btn);
    });
}

window.deleteMenuItem = function (index) {
    if (!confirm('確定刪除此餐點？')) return;
    state.menu.splice(index, 1);
    saveMenu();
    showToast('已刪除餐點');
};

function renderAdminOrders() {
    const container = document.getElementById('admin-orders-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.orders.length === 0) {
        container.innerHTML = '<p class="empty-state">尚無訂單資料</p>';
        return;
    }

    const groups = {};
    state.orders.forEach(order => {
        const d = order.date || '未知日期';
        if (!groups[d]) groups[d] = [];
        groups[d].push(order);
    });

    const todayStr = getLocalDateStr(new Date());
    const dates = Object.keys(groups).sort(); // Base chronological sort

    const activeDates = dates.filter(d => d >= todayStr);
    const expiredDates = dates.filter(d => d < todayStr).reverse(); // Expired sorted latest -> oldest

    const renderGroup = (date, isExpired) => {
        const groupOrders = groups[date];
        let expected = 0;
        let received = 0;
        let totalMeals = 0;
        let totalExtraRice = 0;

        groupOrders.forEach(o => {
            expected += o.total;
            if (o.paid) received += o.total;

            if (o.items) {
                o.items.forEach(i => {
                    if (i.name.includes('加飯')) {
                        totalExtraRice += i.qty;
                    } else {
                        totalMeals += i.qty;
                    }
                });
            }
        });

        const section = document.createElement('div');
        section.className = `admin-date-group glass-card mt-1 ${isExpired ? 'expired-date' : ''}`;
        section.style.padding = '1rem';
        if (isExpired) section.style.opacity = '0.6';

        section.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">
                <h3 style="margin:0;">
                    <i class='bx bx-calendar'></i> ${date} 
                    ${isExpired ? '<span style="font-size:0.7rem; background:var(--danger); color:white; padding:2px 6px; border-radius:4px; margin-left:8px;">已過期</span>' : ''}
                </h3>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="font-size:0.9rem; text-align:right; border-right: 1px solid var(--border); padding-right: 1rem;">
                        <span style="display:block; color:var(--text-muted); font-size:0.8rem;">今日總數</span>
                        <span style="display:block;">餐點: <strong>${totalMeals}</strong> 份</span>
                        <span style="display:block;">加飯: <strong>${totalExtraRice}</strong> 份</span>
                    </div>
                    <div style="font-size:0.9rem; text-align:right;">
                        <span style="display:block;">應收: <strong style="color:var(--warning);">$${expected}</strong></span>
                        <span style="display:block;">已收: <strong style="color:var(--accent);">$${received}</strong></span>
                    </div>
                    <button class="btn-delete" title="刪除整日訂單" onclick="deleteDateOrders('${date}')" style="width: auto; padding: 0 10px; height: 32px; font-size: 0.8rem;">
                        <i class='bx bx-trash'></i> 刪除全天
                    </button>
                </div>
            </div>

            <!-- Itemized Tally Section -->
            <div style="background: rgba(0,0,0,0.1); border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem; border: 1px dashed var(--border);">
                <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem; color: var(--accent);"><i class='bx bx-list-check'></i> 本日品項統計</div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${Object.entries(groupOrders.reduce((acc, o) => {
                        o.items.forEach(i => {
                            if (!acc[i.name]) acc[i.name] = { qty: 0, total: 0 };
                            acc[i.name].qty += i.qty;
                            acc[i.name].total += i.qty * i.price;
                        });
                        return acc;
                    }, {})).map(([name, data]) => `
                        <div style="background: var(--card-bg); padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border); font-size: 0.85rem;">
                            <span style="color: var(--text-main);">${name}</span>: 
                            <strong style="color: var(--primary);">${data.qty} 份</strong> 
                            <span style="color: var(--text-muted); font-size: 0.75rem;">($${data.total})</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="table-responsive">
                <table class="orders-table">
                    <thead><tr><th>座號</th><th>內容</th><th>總價</th><th>付款</th><th>找錢備註</th><th>操作</th></tr></thead>
                    <tbody>
                        ${groupOrders.sort((a, b) => parseInt(a.seatNumber) - parseInt(b.seatNumber)).map((o, idx, arr) => {
                            const itemsHtml = o.items.map(i => {
                                const isDeleted = !state.menu.some(m => m.name === i.name);
                                return `<span style="${isDeleted ? 'color:var(--danger); text-decoration:line-through; font-weight:700;' : ''}">${i.name}</span>x${i.qty}${isDeleted ? '<span style="color:var(--danger); font-size:0.7rem; margin-left:4px;">(已下架)</span>' : ''}`;
                            }).join(', ');
                            const nextOrder = arr[idx + 1];
                            const isSameAsNext = nextOrder && nextOrder.seatNumber === o.seatNumber;
                            const prevOrder = arr[idx - 1];
                            const isSameAsPrev = prevOrder && prevOrder.seatNumber === o.seatNumber;
                            
                            // Style: If multiple orders for same seat, add a background and remove bottom border for intermediate rows
                            const rowStyle = isSameAsNext || isSameAsPrev ? 'background: rgba(99,102,241,0.05);' : '';
                            const borderStyle = isSameAsNext ? 'border-bottom: 1px dashed var(--border);' : '';
                            
                            return `
                                <tr style="${rowStyle} ${borderStyle}">
                                    <td style="font-weight:${isSameAsPrev ? '400' : '700'}; color:${isSameAsPrev ? 'var(--text-muted)' : 'inherit'};">
                                        ${o.seatNumber}號 ${isSameAsPrev ? '(續)' : ''}
                                    </td>
                                    <td>${itemsHtml}</td>
                                    <td>$${o.total}</td>
                                    <td><input type="checkbox" class="order-paid-checkbox" data-id="${o.id}" ${o.paid ? 'checked' : ''}></td>
                                    <td>
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <input type="number" class="inline-input order-change-amount" placeholder="應找額" data-id="${o.id}" value="${o.changeAmount || ''}">
                                            <input type="text" class="inline-input inline-input-text order-change-note" placeholder="備註" data-id="${o.id}" value="${o.changeNote || ''}">
                                        </div>
                                    </td>
                                    <td><button class="btn-delete order-delete-btn" data-id="${o.id}"><i class='bx bx-trash'></i></button></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(section);
    };

    if (activeDates.length > 0) {
        const title = document.createElement('h4');
        title.innerHTML = "<i class='bx bx-time-five'></i> 進行中 / 未來點單";
        title.style.margin = "1.5rem 0 0.5rem 0";
        container.appendChild(title);
        activeDates.forEach(d => renderGroup(d, false));
    }

    if (expiredDates.length > 0) {
        const title = document.createElement('h4');
        title.innerHTML = "<i class='bx bx-history'></i> 歷史紀錄 (已過期)";
        title.style.margin = "2rem 0 0.5rem 0";
        title.style.color = "var(--text-muted)";
        container.appendChild(title);
        expiredDates.forEach(d => renderGroup(d, true));
    }
}

function renderPublicOrders() {
    const tbody = document.getElementById('public-orders-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const orderDateInput = document.getElementById('user-order-date');
    const targetDate = orderDateInput ? orderDateInput.value : getLocalDateStr(new Date());
    
    const titleDateSpan = document.getElementById('public-orders-title-date');
    if (titleDateSpan) titleDateSpan.textContent = `${targetDate} 的訂單狀態`;

    const todayOrders = state.orders.filter(o => o.date === targetDate);

    if (todayOrders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${targetDate} 尚未有訂單</td></tr>`;
        return;
    }

    todayOrders.sort((a, b) => parseInt(a.seatNumber) - parseInt(b.seatNumber));
    todayOrders.forEach(order => {
        const itemsHtml = order.items.map(i => {
            const isDeleted = !state.menu.some(m => m.name === i.name);
            return `<span style="${isDeleted ? 'color:var(--danger); text-decoration:line-through;' : ''}">${i.name}</span>x${i.qty}${isDeleted ? '<span style="color:var(--danger); font-size:0.7rem; margin-left:4px;">(已下架)</span>' : ''}`;
        }).join('<br>');
        
        const tr = document.createElement('tr');
        
        let changeHtml = '<span style="color:var(--text-muted); font-size:0.8rem;">-</span>';
        if (order.changeAmount > 0) {
            changeHtml = `<span style="color:var(--accent); font-weight:600;">找 $${order.changeAmount}</span>`;
            if (order.changeNote) {
                changeHtml += `<br><span style="color:var(--text-muted); font-size:0.75rem;">(${order.changeNote})</span>`;
            }
        }

        tr.innerHTML = `
            <td>${order.seatNumber}號</td>
            <td>${itemsHtml}</td>
            <td>$${order.total}</td>
            <td><span class="badge ${order.paid ? 'success' : 'pending'}">${order.paid ? '✅ 已付' : '⏳ 未付'}</span></td>
            <td>${changeHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    initDatabaseSync();

    const btnUser = document.getElementById('btn-user');
    const btnAdmin = document.getElementById('btn-admin');
    const viewUser = document.getElementById('view-user');
    const viewAdmin = document.getElementById('view-admin');
    const adminModal = document.getElementById('admin-modal');
    const adminPasswordInput = document.getElementById('admin-password');

    btnUser.onclick = () => {
        btnUser.classList.add('active'); btnAdmin.classList.remove('active');
        viewUser.classList.add('active'); viewAdmin.classList.remove('active');
        state.adminAuthenticated = false;
    };

    btnAdmin.onclick = () => {
        if (state.adminAuthenticated) return;
        adminModal.classList.add('active');
        adminPasswordInput.value = ''; adminPasswordInput.focus();
    };

    document.getElementById('btn-cancel-admin').onclick = () => adminModal.classList.remove('active');

    document.getElementById('btn-submit-admin').onclick = handleAdminLogin;
    adminPasswordInput.onkeypress = (e) => { if (e.key === 'Enter') handleAdminLogin(); };

    function handleAdminLogin() {
        if (adminPasswordInput.value === state.adminPassword) {
            adminModal.classList.remove('active');
            state.adminAuthenticated = true;
            btnAdmin.classList.add('active'); btnUser.classList.remove('active');
            viewAdmin.classList.add('active'); viewUser.classList.remove('active');
            
            document.getElementById('settings-admin-password').value = state.adminPassword;
            document.getElementById('settings-max-seats').value = state.maxSeats;
            showToast('管理員登入成功');
        } else {
            showToast('密碼錯誤！');
        }
    }

    document.getElementById('btn-reset-pwd').onclick = () => {
        const email = prompt('請輸入您的帳號 (Google 登入信件):');
        if (email === 's213059@hcvs.hc.edu.tw' || email === 's213054@hcvs.hc.edu.tw') {
            const newPwd = prompt('帳號驗證成功！請輸入新密碼:');
            if (newPwd && newPwd.trim()) {
                state.adminPassword = newPwd.trim();
                saveSettings();
                showToast('密碼已修改成功，請重新登入');
                location.reload();
            } else {
                showToast('密碼不能為空');
            }
        } else if (email !== null) {
            showToast('權限不足，無法修改密碼');
        }
    };

    // Admin Forms
    document.getElementById('add-menu-form').onsubmit = (e) => {
        e.preventDefault();
        const hasLimit = document.getElementById('menu-item-has-limit').checked;
        const limitValue = hasLimit ? parseInt(document.getElementById('menu-item-limit').value, 10) : 0;
        const itemName = document.getElementById('menu-item-name').value.trim();
        const itemPrice = parseInt(document.getElementById('menu-item-price').value, 10);
        const availableDay = document.getElementById('menu-item-day').value;

        // Check for duplicates
        const existingItemIndex = state.menu.findIndex(m => m.name === itemName);
        if (existingItemIndex !== -1) {
            const existing = state.menu[existingItemIndex];
            if (existing.price !== itemPrice) {
                if (!confirm(`餐點「${itemName}」已存在，但價格不同(現有: $${existing.price}，輸入: $${itemPrice})，是否要將現有餐點價格及設定同步更新？`)) {
                    return;
                }
            }
            // Update existing instead
            state.menu[existingItemIndex] = {
                ...existing,
                price: itemPrice,
                availableDay,
                hasLimit, originalStock: limitValue, stock: limitValue
            };
            showToast('已更新現有餐點設定');
        } else {
            const newItem = {
                id: generateId(),
                name: itemName,
                price: itemPrice,
                availableDay,
                hasLimit, originalStock: limitValue, stock: limitValue
            };
            state.menu.push(newItem);
            showToast('餐點新增成功');
        }
        
        // Update History
        const historyIndex = state.history.findIndex(h => h.name === itemName);
        if (historyIndex === -1) {
            state.history.push({ name: itemName, price: itemPrice });
        } else {
            state.history[historyIndex].price = itemPrice; // Update price in history
        }
        db.ref('history').set(state.history.slice(-20)); // Keep last 20 unique items

        saveMenu();
        e.target.reset();
        document.getElementById('limit-input-group').style.display = 'none';
    };

    document.getElementById('btn-delete-all-menu').onclick = () => {
        const pwd = prompt('確定要刪除所有目前上架的餐點嗎？請輸入管理員密碼：');
        if (pwd === state.adminPassword) {
            state.menu = [];
            saveMenu();
            showToast('已清空所有餐點');
        } else if (pwd !== null) {
            showToast('密碼錯誤！');
        }
    };

    document.getElementById('menu-item-has-limit').onchange = (e) => {
        document.getElementById('limit-input-group').style.display = e.target.checked ? 'block' : 'none';
    };

    document.getElementById('set-deadline-form').onsubmit = (e) => {
        e.preventDefault();
        state.deadline = document.getElementById('deadline-time').value;
        saveDeadline();
        showToast('截止時間已更新');
    };

    document.getElementById('system-settings-form').onsubmit = (e) => {
        e.preventDefault();
        state.adminPassword = document.getElementById('settings-admin-password').value.trim() || state.adminPassword;
        state.maxSeats = parseInt(document.getElementById('settings-max-seats').value, 10) || state.maxSeats;
        saveSettings();
        showToast('設定已儲存');
    };

    // Image Upload & Cropping Logic
    const uploadInput = document.getElementById('upload-site-image');
    const cropBtn = document.getElementById('btn-crop-image');
    let dbCropper = null;

    if (uploadInput && cropBtn) {
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('cropper-container').style.display = 'block';
                const image = document.getElementById('image-to-crop');
                image.src = event.target.result;

                if (dbCropper) {
                    dbCropper.destroy();
                }
                dbCropper = new Cropper(image, {
                    aspectRatio: 16 / 9,
                    viewMode: 1,
                    background: false,
                });
            };
            reader.readAsDataURL(file);
        });

        cropBtn.addEventListener('click', () => {
            if (!dbCropper) return;
            showToast('處理中...');
            
            const canvas = dbCropper.getCroppedCanvas({
                width: 800,
                height: 450,
            });

            const base64Image = canvas.toDataURL('image/jpeg', 0.8);

            db.ref('siteImage').set(base64Image).then(() => {
                showToast('圖片已更新成功');
                document.getElementById('cropper-container').style.display = 'none';
                uploadInput.value = '';
                if (dbCropper) {
                    dbCropper.destroy();
                    dbCropper = null;
                }
            }).catch((err) => {
                showToast('圖片上傳失敗，可能檔案太大！');
            });
        });
    }

    const deleteSiteImageBtn = document.getElementById('btn-delete-site-image');
    if (deleteSiteImageBtn) {
        deleteSiteImageBtn.addEventListener('click', () => {
            if (confirm('確定要刪除首頁圖片嗎？')) {
                db.ref('siteImage').remove().then(() => {
                    showToast('已刪除首頁圖片');
                });
            }
        });
    }

    // Admin Table Actions
    const adminOrdersContainer = document.getElementById('admin-orders-container');
    adminOrdersContainer.onchange = (e) => {
        const changeAmtInput = e.target.closest('.order-change-amount');
        const changeNoteInput = e.target.closest('.order-change-note');
        if (changeAmtInput) {
            updateOrderChange(changeAmtInput.dataset.id, 'changeAmount', parseInt(e.target.value, 10) || 0);
        } else if (changeNoteInput) {
            updateOrderChange(changeNoteInput.dataset.id, 'changeNote', e.target.value.trim());
        }
    };

    adminOrdersContainer.onclick = (e) => {
        const delBtn = e.target.closest('.order-delete-btn');
        const chk = e.target.closest('.order-paid-checkbox');

        if (delBtn) {
            if (confirm('確定刪除？')) deleteOrderFromDB(delBtn.dataset.id);
        } else if (chk) {
            updateOrderPaid(chk.dataset.id, chk.checked);
        }
    };

    // User Ordering
    const orderDateInput = document.getElementById('user-order-date');
    if (orderDateInput) {
        const todayStr = getLocalDateStr(new Date());
        orderDateInput.value = todayStr;
        orderDateInput.min = todayStr;
        orderDateInput.onchange = () => {
            state.cart = []; renderCart(); renderUserMenuDropdown(); renderPublicOrders(); updateDeadlineBanner();
        };
    }

    document.getElementById('btn-add-to-cart').onclick = () => {
        const dateStr = orderDateInput.value;
        if (!isOrderAllowed(dateStr)) return showToast('日期無效或已截止');
        
        const itemId = document.getElementById('user-menu-select').value;
        const qty = parseInt(document.getElementById('user-menu-qty').value, 10);
        const item = state.menu.find(m => m.id === itemId);
        
        if (!item || isNaN(qty) || qty < 1) return showToast('請選擇餐點與有效數量');
        if (item.hasLimit && qty > item.stock) return showToast(`庫存不足(剩 ${item.stock})`);
        
        if (item.hasLimit) updateMenuItemStock(item.id, item.stock - qty);
        state.cart.push({ itemId: item.id, qty });
        renderCart(); renderUserMenuDropdown();
        document.getElementById('user-menu-qty').value = '1';
        showToast(`已加入：${item.name} x ${qty}`);
    };

    document.getElementById('order-form').onsubmit = (e) => {
        e.preventDefault();
        
        if (!confirm('訂單下單後無法自行修改，如需更改請來找訂餐人員')) {
            return;
        }

        const dateStr = orderDateInput.value;
        if (!isOrderAllowed(dateStr) || state.cart.length === 0) return showToast('無效操作');
        
        const items = state.cart.map(c => {
            const m = state.menu.find(mi => mi.id === c.itemId);
            return { name: m.name, qty: c.qty, price: m.price };
        });
        const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
        
        saveOrder({
            seatNumber: document.getElementById('user-seat').value,
            items, total, paid: false, date: dateStr,
            timestamp: new Date().toISOString()
        }).then(() => {
            state.cart = [];
            document.getElementById('user-seat').value = '';
            renderCart();
            showToast('訂單送出成功！');
        });
    };

    setInterval(() => {
        updateDateLimits();
        updateDeadlineBanner();
        renderCart();
    }, 1000);
});

function updateDateLimits() {
    const now = new Date();
    const orderDateInput = document.getElementById('user-order-date');

    // Dynamic Date Update
    if (orderDateInput) {
        const todayStr = getLocalDateStr(now);
        if (orderDateInput.min !== todayStr) {
            orderDateInput.min = todayStr;
            // If the selected date is in the past due to midnight passing, move it to today
            if (orderDateInput.value < todayStr) {
                orderDateInput.value = todayStr;
                state.cart = []; renderCart(); renderUserMenuDropdown(); renderPublicOrders(); updateDeadlineBanner();
            }
        }
    }
}
