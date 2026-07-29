const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

function triggerHaptic(type = 'light') {
    if (!tg?.HapticFeedback) return;
    if (type === 'light' || type === 'medium' || type === 'heavy') {
        tg.HapticFeedback.impactOccurred(type);
    } else if (type === 'success' || type === 'warning' || type === 'error') {
        tg.HapticFeedback.notificationOccurred(type);
    } else if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
    }
}

const defaultProducts = [
    {
        id: 1,
        title: 'Беспроводные наушники',
        price: '2 500 ₽',
        category: 'Электроника',
        city: 'Минск',
        seller: 'Алексей',
        telegram: 'alexey_tech',
        description: 'Отличные наушники, оригинальные, полный комплект.',
        images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300']
    }
];

const defaultReviews = [
    { author: 'Максим', stars: '5', text: 'Отличный продавец! Быстро ответил и быстро отправил товар.' },
    { author: 'Елена', stars: '5', text: 'Все соответствовало описанию. Очень довольна покупкой!' }
];

let products = JSON.parse(localStorage.getItem('my_marketplace_products')) || defaultProducts;
let favorites = JSON.parse(localStorage.getItem('my_marketplace_favorites')) || [];
let reviews = JSON.parse(localStorage.getItem('my_marketplace_reviews')) || defaultReviews;
let currentUser = JSON.parse(localStorage.getItem('my_marketplace_user')) || null;

let currentCategory = 'all';
let currentCityFilter = 'all';
let editingProductId = null;
let currentImageIndex = 0;
let currentProductImages = [];

products.forEach(p => {
    if (!p.city) p.city = 'Минск';
    if (!p.images || !Array.isArray(p.images) || p.images.length === 0) {
        p.images = p.image ? [p.image] : ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300'];
    }
});

let isDarkTheme = localStorage.getItem('my_marketplace_theme') === 'dark';

function applyTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        if (themeBtn) themeBtn.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        if (themeBtn) themeBtn.textContent = '🌙';
    }
}

function saveToStorage() {
    try {
        localStorage.setItem('my_marketplace_products', JSON.stringify(products));
        localStorage.setItem('my_marketplace_favorites', JSON.stringify(favorites));
        localStorage.setItem('my_marketplace_reviews', JSON.stringify(reviews));
        localStorage.setItem('my_marketplace_theme', isDarkTheme ? 'dark' : 'light');
        if (currentUser) {
            localStorage.setItem('my_marketplace_user', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('my_marketplace_user');
        }
    } catch (e) {
        console.warn('Очищаем старые данные...');
    }
}

function checkAuth() {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app');

    if (currentUser) {
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        renderProfile();
        renderMyProductsTab();
        filterAndRender();
    } else {
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
        setupAuthScreen();
    }
}

function setupAuthScreen() {
    const user = tg?.initDataUnsafe?.user;
    const tgBox = document.getElementById('tg-auth-box');
    const guestBox = document.getElementById('guest-auth-box');

    if (user) {
        tgBox.classList.remove('hidden');
        guestBox.classList.add('hidden');

        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        document.getElementById('auth-name').textContent = fullName || 'Пользователь';
        document.getElementById('auth-username').textContent = user.username ? `@${user.username}` : 'Без юзернейма';

        if (user.photo_url) {
            document.getElementById('auth-avatar').innerHTML = `<img src="${user.photo_url}">`;
        }
    } else {
        tgBox.classList.add('hidden');
        guestBox.classList.remove('hidden');
    }
}

function loginUser(name, username, photoUrl = '') {
    currentUser = {
        name: name || 'Пользователь',
        username: username ? username.replace('@', '') : 'user',
        photoUrl: photoUrl,
        isVerified: false,
        phone: ''
    };
    triggerHaptic('success');
    saveToStorage();
    checkAuth();
}

function logoutUser() {
    triggerHaptic('warning');
    currentUser = null;
    saveToStorage();
    checkAuth();
}

function completeVerification(phone) {
    if (!currentUser) return;
    currentUser.isVerified = true;
    currentUser.phone = phone;
    triggerHaptic('success');
    saveToStorage();
    renderProfile();
    document.getElementById('verify-modal').classList.add('hidden');
}

function renderReviews() {
    const list = document.getElementById('reviews-list');
    if (!list) return;
    list.innerHTML = '';

    document.getElementById('profile-reviews-count').textContent = `(${reviews.length} отзывов)`;

    if (reviews.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 10px;">Пока нет отзывов</div>';
        return;
    }

    reviews.forEach(r => {
        const item = document.createElement('div');
        item.className = 'review-item';
        let starsStr = '⭐'.repeat(parseInt(r.stars || 5));
        item.innerHTML = `
            <div class="review-header">
                <span class="review-author">${r.author}</span>
                <span class="review-stars">${starsStr}</span>
            </div>
            <p class="review-text">${r.text}</p>
        `;
        list.appendChild(item);
    });
}

function renderMyProductsTab() {
    if (!currentUser) return;

    const myProducts = products.filter(p => {
        let pTg = (p.telegram || '').replace('@', '').toLowerCase();
        let myTg = (currentUser.username || '').toLowerCase();
        return pTg === myTg && pTg !== '';
    });

    const container = document.getElementById('my-products-tab-grid');
    if (!container) return;
    container.innerHTML = '';

    if (myProducts.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 20px;">У вас пока нет созданных объявлений</div>';
        return;
    }

    myProducts.forEach(item => {
        const isFav = favorites.includes(item.id);
        const mainImage = item.images[0];
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => openViewModal(item.id);

        card.innerHTML = `
            <button class="fav-btn" onclick="toggleFavorite(event, ${item.id})">${isFav ? '❤️' : '🤍'}</button>
            <button class="delete-btn" onclick="deleteProduct(event, ${item.id})">✕</button>
            <img class="product-image" src="${mainImage}" alt="${item.title}">
            <div class="product-title">${item.title}</div>
            <div class="product-city">📍 ${item.city || 'Минск'}</div>
            <div class="product-price">${item.price}</div>
        `;
        container.appendChild(card);
    });
}

function renderProfile() {
    if (!currentUser) return;

    const nameEl = document.getElementById('user-name');
    const tgEl = document.getElementById('user-tg-tag');
    const avatarEl = document.getElementById('user-avatar');

    const badgeEl = document.getElementById('profile-badge');
    const openVerifyBtn = document.getElementById('open-verify-btn');

    nameEl.textContent = currentUser.name;
    tgEl.textContent = `@${currentUser.username}`;

    if (currentUser.photoUrl) {
        avatarEl.innerHTML = `<img src="${currentUser.photoUrl}" alt="Avatar">`;
    } else {
        avatarEl.innerHTML = '👤';
    }

    // Состояние верификации
    if (currentUser.isVerified) {
        badgeEl.textContent = '✓ Профиль подтверждён';
        badgeEl.className = 'profile-badge verified';
        openVerifyBtn.classList.add('hidden');
    } else {
        badgeEl.textContent = '❌ Профиль не подтвержден';
        badgeEl.className = 'profile-badge unverified';
        openVerifyBtn.classList.remove('hidden');
    }

    document.getElementById('fav-ads-count').textContent = favorites.length;

    const myProducts = products.filter(p => {
        let pTg = (p.telegram || '').replace('@', '').toLowerCase();
        let myTg = (currentUser.username || '').toLowerCase();
        return pTg === myTg && pTg !== '';
    });

    document.getElementById('my-ads-count').textContent = myProducts.length;

    const myContainer = document.getElementById('my-products');
    if (myContainer) {
        myContainer.innerHTML = '';

        if (myProducts.length === 0) {
            myContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">У вас пока нет объявлений</div>';
        } else {
            myProducts.forEach(item => {
                const isFav = favorites.includes(item.id);
                const mainImage = item.images[0];
                const card = document.createElement('div');
                card.className = 'product-card';
                card.onclick = () => openViewModal(item.id);

                card.innerHTML = `
                    <button class="fav-btn" onclick="toggleFavorite(event, ${item.id})">${isFav ? '❤️' : '🤍'}</button>
                    <button class="delete-btn" onclick="deleteProduct(event, ${item.id})">✕</button>
                    <img class="product-image" src="${mainImage}" alt="${item.title}">
                    <div class="product-title">${item.title}</div>
                    <div class="product-city">📍 ${item.city || 'Минск'}</div>
                    <div class="product-price">${item.price}</div>
                `;
                myContainer.appendChild(card);
            });
        }
    }

    renderReviews();
}

window.toggleFavorite = function(event, id) {
    event.stopPropagation();
    if (favorites.includes(id)) {
        favorites = favorites.filter(favId => favId !== id);
    } else {
        favorites.push(id);
    }
    triggerHaptic('medium');
    saveToStorage();
    filterAndRender();
    renderProfile();
    renderMyProductsTab();
};

window.deleteProduct = function(event, id) {
    event.stopPropagation();
    products = products.filter(item => item.id !== id);
    favorites = favorites.filter(favId => favId !== id);
    triggerHaptic('warning');
    saveToStorage();
    filterAndRender();
    renderProfile();
    renderMyProductsTab();
};

window.handleTelegramClick = function(event, rawTg, productTitle, productPrice) {
    if (event) event.preventDefault();
    if (!rawTg) return;

    triggerHaptic('light');
    let cleanTg = rawTg.trim().replace('@', '');
    let messageText = `Здравствуйте! Меня заинтересовал ваш товар "${productTitle}" за ${productPrice}.`;
    let encodedText = encodeURIComponent(messageText);

    let tgUrl = `https://t.me/${cleanTg}?text=${encodedText}`;
    
    if (tg?.openTelegramLink) {
        tg.openTelegramLink(tgUrl);
    } else {
        window.location.href = tgUrl;
    }
};

function updateGallery() {
    const imgElement = document.getElementById('view-image');
    const dotsContainer = document.getElementById('gallery-dots');
    const prevBtn = document.getElementById('prev-img-btn');
    const nextBtn = document.getElementById('next-img-btn');

    if (!currentProductImages || currentProductImages.length === 0) return;

    imgElement.src = currentProductImages[currentImageIndex];

    if (currentProductImages.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        dotsContainer.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        dotsContainer.style.display = 'flex';

        dotsContainer.innerHTML = '';
        currentProductImages.forEach((_, idx) => {
            const dot = document.createElement('div');
            dot.className = `dot ${idx === currentImageIndex ? 'active' : ''}`;
            dotsContainer.appendChild(dot);
        });
    }
}

window.openViewModal = function(id) {
    triggerHaptic('light');
    const product = products.find(p => p.id === id);
    if (!product) return;

    editingProductId = id;
    currentProductImages = product.images || ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300'];
    currentImageIndex = 0;

    updateGallery();

    document.getElementById('view-title').textContent = product.title;
    document.getElementById('view-price').textContent = product.price;
    document.getElementById('view-category').textContent = product.category || 'Другое';
    document.getElementById('view-city').textContent = `📍 ${product.city || 'Минск'}`;
    document.getElementById('view-seller').textContent = product.seller || 'Продавец';
    
    let tgUser = product.telegram ? ('@' + product.telegram.replace('@', '')) : 'Telegram не указан';
    document.getElementById('view-telegram').textContent = tgUser;
    document.getElementById('view-desc').textContent = product.description || 'Описание отсутствует';

    const contactBtn = document.getElementById('contact-btn');
    if (product.telegram && product.telegram.trim() !== '') {
        contactBtn.onclick = (e) => handleTelegramClick(e, product.telegram, product.title, product.price);
        contactBtn.style.opacity = '1';
        contactBtn.style.pointerEvents = 'auto';

        if (tg?.MainButton) {
            tg.MainButton.setText(`💬 Написать продавцу (${product.price})`);
            tg.MainButton.show();
            tg.MainButton.onClick(() => {
                handleTelegramClick(null, product.telegram, product.title, product.price);
            });
        }
    } else {
        contactBtn.onclick = null;
        contactBtn.style.opacity = '0.5';
        contactBtn.style.pointerEvents = 'none';
        if (tg?.MainButton) tg.MainButton.hide();
    }

    document.getElementById('view-modal').classList.remove('hidden');
};

function closeViewModal() {
    triggerHaptic('light');
    document.getElementById('view-modal').classList.add('hidden');
    if (tg?.MainButton) tg.MainButton.hide();
}

function openEditModal() {
    triggerHaptic('light');
    const product = products.find(p => p.id === editingProductId);
    if (!product) return;

    closeViewModal();

    document.getElementById('modal-title').textContent = 'Редактировать объявление';
    document.getElementById('save-btn').textContent = 'Сохранить';

    document.getElementById('title-input').value = product.title;
    document.getElementById('price-input').value = product.price.replace(' ₽', '');
    document.getElementById('category-select').value = product.category || 'Другое';
    document.getElementById('city-select').value = product.city || 'Минск';
    document.getElementById('seller-input').value = product.seller || '';
    document.getElementById('telegram-input').value = product.telegram || '';
    document.getElementById('desc-input').value = product.description || '';

    document.getElementById('modal').classList.remove('hidden');
}

function openAddModal() {
    triggerHaptic('light');
    editingProductId = null;

    document.getElementById('modal-title').textContent = 'Добавить объявление';
    document.getElementById('save-btn').textContent = 'Опубликовать';

    document.getElementById('title-input').value = '';
    document.getElementById('price-input').value = '';
    document.getElementById('category-select').value = 'Другое';
    document.getElementById('city-select').value = 'Минск';
    
    if (currentUser) {
        document.getElementById('seller-input').value = currentUser.name || '';
        document.getElementById('telegram-input').value = currentUser.username || '';
    } else {
        document.getElementById('seller-input').value = '';
        document.getElementById('telegram-input').value = '';
    }

    document.getElementById('desc-input').value = '';
    document.getElementById('image-file-input').value = '';
    document.getElementById('file-name').textContent = 'Файлы не выбраны';

    document.getElementById('modal').classList.remove('hidden');
}

function filterAndRender() {
    const searchInput = document.querySelector('.search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = products.filter(product => {
        const matchesQuery = product.title.toLowerCase().includes(query);
        
        let matchesCat = false;
        if (currentCategory === 'all') {
            matchesCat = true;
        } else if (currentCategory === 'favorites') {
            matchesCat = favorites.includes(product.id);
        } else {
            matchesCat = product.category === currentCategory;
        }

        let matchesCity = currentCityFilter === 'all' || (product.city || 'Минск') === currentCityFilter;

        return matchesQuery && matchesCat && matchesCity;
    });

    renderProducts(filtered);
}

function renderProducts(itemsToRender) {
    const container = document.getElementById('products');
    if (!container) return;
    container.innerHTML = '';

    if (itemsToRender.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Ничего не найдено</div>';
        return;
    }

    itemsToRender.forEach(item => {
        const isFav = favorites.includes(item.id);
        const mainImage = item.images[0];
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => openViewModal(item.id);

        card.innerHTML = `
            <button class="fav-btn" onclick="toggleFavorite(event, ${item.id})">${isFav ? '❤️' : '🤍'}</button>
            <button class="delete-btn" onclick="deleteProduct(event, ${item.id})">✕</button>
            <img class="product-image" src="${mainImage}" alt="${item.title}">
            <div class="product-title">${item.title}</div>
            <div class="product-city">📍 ${item.city || 'Минск'}</div>
            <div class="product-price">${item.price}</div>
        `;
        container.appendChild(card);
    });
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.5);
            callback(compressedDataUrl);
        };
        img.onerror = function() { callback(null); };
        img.src = e.target.result;
    };
    reader.onerror = function() { callback(null); };
    reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    checkAuth();

    const tgLoginBtn = document.getElementById('tg-login-btn');
    const guestLoginBtn = document.getElementById('guest-login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const openVerifyBtn = document.getElementById('open-verify-btn');
    const verifyModal = document.getElementById('verify-modal');
    const closeVerifyModalBtn = document.getElementById('close-verify-modal-btn');
    const confirmTgPhoneBtn = document.getElementById('confirm-tg-phone-btn');
    const saveManualPhoneBtn = document.getElementById('save-manual-phone-btn');

    if (openVerifyBtn) {
        openVerifyBtn.onclick = () => {
            triggerHaptic('light');
            verifyModal.classList.remove('hidden');
        };
    }

    if (closeVerifyModalBtn) {
        closeVerifyModalBtn.onclick = () => {
            triggerHaptic('light');
            verifyModal.classList.add('hidden');
        };
    }

    // Подтверждение через Telegram Contact API
    if (confirmTgPhoneBtn) {
        confirmTgPhoneBtn.onclick = () => {
            triggerHaptic('light');
            if (tg?.requestContact) {
                tg.requestContact((sent) => {
                    if (sent) {
                        completeVerification('Подтверждён Telegram');
                    } else {
                        completeVerification('+375 (29) 111-22-33');
                    }
                });
            } else {
                completeVerification('+375 (29) 111-22-33');
            }
        };
    }

    if (saveManualPhoneBtn) {
        saveManualPhoneBtn.onclick = () => {
            const phoneVal = document.getElementById('manual-phone-input').value.trim();
            if (!phoneVal) {
                triggerHaptic('error');
                alert('Введите ваш номер телефона!');
                return;
            }
            completeVerification(phoneVal);
        };
    }

    if (tgLoginBtn) {
        tgLoginBtn.onclick = () => {
            const user = tg?.initDataUnsafe?.user;
            if (user) {
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
                loginUser(fullName || user.username, user.username, user.photo_url || '');
            } else {
                loginUser('Марк', 'donovanproduct3');
            }
        };
    }

    if (guestLoginBtn) {
        guestLoginBtn.onclick = () => {
            const name = document.getElementById('guest-name-input').value.trim();
            const username = document.getElementById('guest-tg-input').value.trim();
            if (!name) {
                triggerHaptic('error');
                alert('Введите ваше имя!');
                return;
            }
            loginUser(name, username);
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = () => logoutUser();
    }

    const themeBtn = document.getElementById('theme-toggle');
    const searchInput = document.querySelector('.search-input');
    const cityFilterSelect = document.getElementById('city-filter');
    const catBtns = document.querySelectorAll('.cat-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pTabBtns = document.querySelectorAll('.p-tab-btn');
    
    const modal = document.getElementById('modal');
    const viewModal = document.getElementById('view-modal');

    const openBtn = document.getElementById('open-modal-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const closeViewBtn = document.getElementById('close-view-btn');
    const editBtn = document.getElementById('edit-btn');
    const saveBtn = document.getElementById('save-btn');

    const fileInput = document.getElementById('image-file-input');
    const fileNameDisplay = document.getElementById('file-name');

    const prevImgBtn = document.getElementById('prev-img-btn');
    const nextImgBtn = document.getElementById('next-img-btn');

    if (cityFilterSelect) {
        cityFilterSelect.onchange = () => {
            triggerHaptic('selection');
            currentCityFilter = cityFilterSelect.value;
            filterAndRender();
        };
    }

    pTabBtns.forEach(btn => {
        btn.onclick = () => {
            triggerHaptic('selection');
            pTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const targetSec = btn.dataset.ptab;
            document.querySelectorAll('.profile-section').forEach(sec => sec.classList.add('hidden'));
            document.getElementById(targetSec).classList.remove('hidden');
        };
    });

    navItems.forEach(item => {
        item.onclick = () => {
            triggerHaptic('selection');
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetTab = item.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
            document.getElementById(targetTab).classList.remove('hidden');

            if (targetTab === 'tab-profile') renderProfile();
            if (targetTab === 'tab-my-ads') renderMyProductsTab();
        };
    });

    if (prevImgBtn) {
        prevImgBtn.onclick = () => {
            if (currentImageIndex > 0) {
                currentImageIndex--;
                triggerHaptic('selection');
                updateGallery();
            }
        };
    }

    if (nextImgBtn) {
        nextImgBtn.onclick = () => {
            if (currentImageIndex < currentProductImages.length - 1) {
                currentImageIndex++;
                triggerHaptic('selection');
                updateGallery();
            }
        };
    }

    if (themeBtn) {
        themeBtn.onclick = () => {
            isDarkTheme = !isDarkTheme;
            triggerHaptic('light');
            applyTheme();
            saveToStorage();
        };
    }

    catBtns.forEach(btn => {
        btn.onclick = () => {
            triggerHaptic('selection');
            catBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.cat;
            filterAndRender();
        };
    });

    if (searchInput) searchInput.addEventListener('input', () => filterAndRender());

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const filesCount = fileInput.files ? fileInput.files.length : 0;
            if (filesCount > 0) {
                fileNameDisplay.textContent = `Выбрано файлов: ${filesCount}`;
            } else {
                fileNameDisplay.textContent = 'Файлы не выбраны';
            }
        });
    }

    if (openBtn) openBtn.onclick = () => openAddModal();
    if (closeBtn) closeBtn.onclick = () => { triggerHaptic('light'); modal.classList.add('hidden'); };
    if (closeViewBtn) closeViewBtn.onclick = () => closeViewModal();
    if (editBtn) editBtn.onclick = () => openEditModal();

    if (saveBtn) {
        saveBtn.onclick = () => {
            const titleInput = document.getElementById('title-input');
            const priceInput = document.getElementById('price-input');
            const categorySelect = document.getElementById('category-select');
            const citySelect = document.getElementById('city-select');
            const sellerInput = document.getElementById('seller-input');
            const telegramInput = document.getElementById('telegram-input');
            const descInput = document.getElementById('desc-input');

            if (!titleInput.value.trim()) {
                triggerHaptic('error');
                alert('Введите название товара!');
                return;
            }

            let price = priceInput.value.trim() || '0';
            if (!price.includes('₽')) price = price + ' ₽';

            const files = fileInput.files ? Array.from(fileInput.files).slice(0, 4) : [];

            const applyChangesWithImages = (imagesArray) => {
                if (editingProductId) {
                    const index = products.findIndex(p => p.id === editingProductId);
                    if (index !== -1) {
                        products[index].title = titleInput.value.trim();
                        products[index].price = price;
                        products[index].category = categorySelect.value;
                        products[index].city = citySelect.value;
                        products[index].seller = sellerInput.value.trim() || 'Частное лицо';
                        products[index].telegram = telegramInput.value.trim();
                        products[index].description = descInput.value.trim();
                        if (imagesArray && imagesArray.length > 0) {
                            products[index].images = imagesArray;
                        }
                    }
                } else {
                    products.unshift({
                        id: Date.now(),
                        title: titleInput.value.trim(),
                        price: price,
                        category: categorySelect.value,
                        city: citySelect.value,
                        seller: sellerInput.value.trim() || 'Частное лицо',
                        telegram: telegramInput.value.trim(),
                        description: descInput.value.trim(),
                        images: imagesArray.length > 0 ? imagesArray : ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300']
                    });
                }

                triggerHaptic('success');
                saveToStorage();
                filterAndRender();
                renderProfile();
                renderMyProductsTab();
                modal.classList.add('hidden');
            };

            if (files.length > 0) {
                let processedImages = [];
                let counter = 0;

                files.forEach(file => {
                    compressImage(file, (compressedUrl) => {
                        if (compressedUrl) processedImages.push(compressedUrl);
                        counter++;
                        if (counter === files.length) {
                            applyChangesWithImages(processedImages);
                        }
                    });
                });
            } else {
                applyChangesWithImages([]);
            }
        };
    }
});
