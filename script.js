const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

// Конфигурация Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBTDdD5W7ChKm65iygEK-7pt0MNiDLhGro",
    authDomain: "tg-marketplace-3e644.firebaseapp.com",
    projectId: "tg-marketplace-3e644",
    storageBucket: "tg-marketplace-3e644.appspot.com",
    messagingSenderId: "1013734928041",
    appId: "1:1013734928041:web:0ce6564b08a43804f043b8",
    measurementId: "G-375574T1G0"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// === БАЗА ПОДКАТЕГОРИЙ И РАЗМЕРОВ ===
const subcategoriesMap = {
    "Электроника": ["Телефоны", "Компьютеры и ноутбуки", "Умные часы", "Наушники", "Планшеты", "Игровые приставки", "Другая электроника"],
    "Одежда": ["Футболки и майки", "Штаны и джинсы", "Верхняя одежда", "Кофты и худи", "Рубашки", "Платья и юбки", "Другая одежда"],
    "Обувь": ["Кроссовки и кеды", "Туфли", "Ботинки", "Сапоги", "Тапочки", "Другая обувь"],
    "Аксессуары": ["Сумки и рюкзаки", "Часы", "Очки", "Украшения", "Головные уборы", "Другие аксессуары"],
    "Другое": [] 
};

const clothingSizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "Оверсайз / Универсальный"];
const shoeSizes = [
    "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", 
    "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "45.5", "46"
];

const standardCities = ["Минск", "Гродно", "Брест", "Гомель", "Витебск", "Могилев"];
let searchHistory = JSON.parse(localStorage.getItem('search_history')) || ['iPhone', 'Кроссовки', 'Худи'];

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

let products = [];
let allReviews = [];
let myPurchases = [];
let allProductViews = [];

let currentUser = JSON.parse(localStorage.getItem('my_marketplace_user')) || null;
let favorites = currentUser ? (JSON.parse(localStorage.getItem(`favs_${currentUser.username}`)) || []) : [];

let currentCategory = 'all';

let currentFilters = {
    city: 'all',
    sort: 'default',
    priceMin: '',
    priceMax: '',
    currency: 'all',
    category: 'all',
    subcategory: 'all',
    size: 'all',
    minRating: 0
};

let editingProductId = null;
let currentImageIndex = 0;
let currentProductImages = [];
let pendingDeleteId = null;
let tempAvatarBase64 = null; 

let isDarkTheme = localStorage.getItem('my_marketplace_theme') === 'dark';
let activeSellerData = { name: '', telegram: '' };

function hideLoader() {
    const loader = document.getElementById('loading-spinner');
    if (loader) {
        loader.classList.add('hidden');
    }
}

window.dismissKeyboard = function() {
    const searchInput = document.querySelector('.search-input');
    const overlay = document.getElementById('keyboard-overlay');
    if (searchInput) searchInput.blur();
    if (overlay) overlay.classList.add('hidden');
};

window.openEditProfileModal = function() {
    triggerHaptic('light');
    if (!currentUser) return;

    const nameInput = document.getElementById('edit-name-input');
    const bioInput = document.getElementById('edit-bio-input');
    const avatarPreview = document.getElementById('edit-avatar-preview');

    if (nameInput) nameInput.value = currentUser.name || '';
    if (bioInput) bioInput.value = currentUser.bio || '';
    
    if (avatarPreview) {
        if (currentUser.customAvatar) {
            avatarPreview.innerHTML = `<img src="${currentUser.customAvatar}" style="width:100%; height:100%; object-fit:cover;">`;
        } else if (currentUser.photoUrl) {
            avatarPreview.innerHTML = `<img src="${currentUser.photoUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        } else {
            avatarPreview.innerHTML = '👤';
        }
    }

    tempAvatarBase64 = null;
    const editProfileModal = document.getElementById('edit-profile-modal');
    if (editProfileModal) {
        editProfileModal.classList.remove('hidden');
    }
};

window.openFullscreenZoom = function() {
    triggerHaptic('light');
    const currentImgSrc = currentProductImages[currentImageIndex];
    if (!currentImgSrc) return;

    const zoomImg = document.getElementById('fullscreen-zoom-img');
    const zoomModal = document.getElementById('fullscreen-zoom-modal');
    
    if (zoomImg && zoomModal) {
        zoomImg.src = currentImgSrc;
        zoomModal.classList.remove('hidden');
        updateZoomGalleryUI();
    }
};

window.closeFullscreenZoom = function() {
    triggerHaptic('light');
    const zoomModal = document.getElementById('fullscreen-zoom-modal');
    if (zoomModal) {
        zoomModal.classList.add('hidden');
    }
};

function updateZoomGalleryUI() {
    const zoomImg = document.getElementById('fullscreen-zoom-img');
    const dotsContainer = document.getElementById('zoom-dots');

    if (!currentProductImages || currentProductImages.length === 0) return;
    zoomImg.src = currentProductImages[currentImageIndex];

    if (dotsContainer) {
        if (currentProductImages.length <= 1) {
            dotsContainer.style.display = 'none';
        } else {
            dotsContainer.style.display = 'flex';
            dotsContainer.innerHTML = '';
            currentProductImages.forEach((_, idx) => {
                const dot = document.createElement('div');
                dot.className = `dot ${idx === currentImageIndex ? 'active' : ''}`;
                dotsContainer.appendChild(dot);
            });
        }
    }
}

// === ПОДДЕРЖКА СВАЙПОВ ДЛЯ ФОТО В ЛАЙТБОКСЕ ===
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('DOMContentLoaded', () => {
    updateResellerUI();
    spawnResellerLot();

    const buyBtn = document.getElementById('reseller-buy-btn');
    const skipBtn = document.getElementById('reseller-skip-btn');

    if (buyBtn) {
        buyBtn.onclick = () => {
            if (!currentResellerLot) return;
            if (resellerState.balance < currentResellerLot.buyPrice) {
                triggerHaptic('error');
                alert('Недостаточно средств на балансе!');
                return;
            }
            clearInterval(resellerTimerInterval);
            resellerState.balance -= currentResellerLot.buyPrice;
            resellerState.inventory.push(currentResellerLot);
            triggerHaptic('success');
            saveResellerState();
            spawnResellerLot();
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            clearInterval(resellerTimerInterval);
            triggerHaptic('light');
            spawnResellerLot();
        };
    }

    const zoomModal = document.getElementById('fullscreen-zoom-modal');
    if (zoomModal) {
        zoomModal.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, {passive: true});

        zoomModal.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleZoomSwipe();
        }, {passive: true});
    }

    applyTheme();
    checkAuth();
    listenFirebaseProducts();
    listenFirebaseReviews();
    listenFirebaseViews();
    renderSearchTags();

    const closeVBtn = document.getElementById('close-view-btn');
    if (closeVBtn) {
        closeVBtn.onclick = () => closeViewModal();
    }

    const saveBuyerBtn = document.getElementById('save-buyer-btn');
    const skipBuyerBtn = document.getElementById('skip-buyer-btn');
    const buyerModal = document.getElementById('buyer-modal');

    if (saveBuyerBtn) {
        saveBuyerBtn.onclick = async () => {
            const buyerInput = document.getElementById('buyer-username-input').value.trim();
            buyerModal.classList.add('hidden');
            await finalizeProductDeletion(buyerInput);
        };
    }

    if (skipBuyerBtn) {
        skipBuyerBtn.onclick = async () => {
            buyerModal.classList.add('hidden');
            await finalizeProductDeletion(null);
        };
    }

    const closePublicProfileBtn = document.getElementById('close-public-profile-btn');
    const publicProfileModal = document.getElementById('public-profile-modal');

    if (closePublicProfileBtn && publicProfileModal) {
        closePublicProfileBtn.onclick = () => {
            triggerHaptic('light');
            publicProfileModal.classList.add('hidden');
            window.currentOpenedSellerTg = null; 
            document.getElementById('view-modal').classList.remove('hidden');
        };
    }

    const pubTabAds = document.getElementById('pub-tab-ads');
    const pubTabReviews = document.getElementById('pub-tab-reviews');
    const pubSecAds = document.getElementById('pub-sec-ads');
    const pubSecReviews = document.getElementById('pub-sec-reviews');

    if (pubTabAds && pubTabReviews && pubSecAds && pubSecReviews) {
        pubTabAds.addEventListener('click', (e) => {
            e.preventDefault();
            triggerHaptic('selection');
            pubTabAds.classList.add('active');
            pubTabReviews.classList.remove('active');
            
            pubSecAds.style.display = 'block';
            pubSecReviews.style.display = 'none';
        });

        pubTabReviews.addEventListener('click', (e) => {
            e.preventDefault();
            triggerHaptic('selection');
            pubTabReviews.classList.add('active');
            pubTabAds.classList.remove('active');
            
            pubSecReviews.style.display = 'block';
            pubSecAds.style.display = 'none';
        });
    }

    const tgLoginBtn = document.getElementById('tg-login-btn');
    const guestLoginBtn = document.getElementById('guest-login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    const closeEditProfileBtn = document.getElementById('close-edit-profile-btn');
    const editProfileModal = document.getElementById('edit-profile-modal');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const avatarFileInput = document.getElementById('avatar-file-input');
    const editAvatarPreview = document.getElementById('edit-avatar-preview');

    if (closeEditProfileBtn) {
        closeEditProfileBtn.onclick = () => {
            triggerHaptic('light');
            editProfileModal.classList.add('hidden');
        }
    }

    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', () => {
            if (avatarFileInput.files && avatarFileInput.files[0]) {
                compressImage(avatarFileInput.files[0], (base64) => {
                    if (base64) {
                        tempAvatarBase64 = base64;
                        editAvatarPreview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover;">`;
                    }
                });
            }
        });
    }

    if (saveProfileBtn) {
        saveProfileBtn.onclick = async () => {
            const newName = document.getElementById('edit-name-input').value.trim();
            const newBio = document.getElementById('edit-bio-input').value.trim();

            if (!newName) {
                triggerHaptic('error');
                alert('Имя не может быть пустым!');
                return;
            }

            let updates = {
                name: newName,
                bio: newBio
            };

            if (tempAvatarBase64) {
                updates.customAvatar = tempAvatarBase64;
            }

            try {
                await db.collection("users").doc(currentUser.username.toLowerCase()).update(updates);
                
                currentUser.name = newName;
                currentUser.bio = newBio;
                if (tempAvatarBase64) currentUser.customAvatar = tempAvatarBase64;
                
                saveToStorage();
                renderProfile();
                
                triggerHaptic('success');
                editProfileModal.classList.add('hidden');
            } catch (e) {
                console.error('Ошибка сохранения профиля', e);
                alert('Произошла ошибка при сохранении.');
            }
        };
    }

    const closeVerifyModalBtn = document.getElementById('close-verify-modal-btn');
    const confirmTgPhoneBtn = document.getElementById('confirm-tg-phone-btn');
    const saveManualPhoneBtn = document.getElementById('save-manual-phone-btn');

    if (closeVerifyModalBtn) {
        closeVerifyModalBtn.onclick = () => {
            triggerHaptic('light');
            document.getElementById('verify-modal').classList.add('hidden');
        };
    }

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
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const keyboardOverlay = document.getElementById('keyboard-overlay');
    const catBtns = document.querySelectorAll('.cat-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pTabBtns = document.querySelectorAll('.p-tab-btn');
    
    const modal = document.getElementById('modal');

    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            if (keyboardOverlay) keyboardOverlay.classList.remove('hidden');
        });

        searchInput.addEventListener('input', (e) => {
            filterAndRender();
            if (clearSearchBtn) {
                if (e.target.value.trim().length > 0) {
                    clearSearchBtn.classList.remove('hidden');
                } else {
                    clearSearchBtn.classList.add('hidden');
                }
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query.length >= 2) {
                    addSearchHistory(query);
                }
                dismissKeyboard();
            }
        });
    }

    if (clearSearchBtn && searchInput) {
        clearSearchBtn.onclick = () => {
            searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            filterAndRender();
            searchInput.focus();
        };
    }

    const citySelect = document.getElementById('city-select');
    const customCityInput = document.getElementById('custom-city-input');
    if (citySelect && customCityInput) {
        citySelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customCityInput.classList.remove('hidden');
                customCityInput.focus();
            } else {
                customCityInput.classList.add('hidden');
                customCityInput.value = '';
            }
        });
    }

    const filterCitySelect = document.getElementById('filter-city-select');
    const filterCustomCityInput = document.getElementById('filter-custom-city-input');
    if (filterCitySelect && filterCustomCityInput) {
        filterCitySelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                filterCustomCityInput.classList.remove('hidden');
                filterCustomCityInput.focus();
            } else {
                filterCustomCityInput.classList.add('hidden');
                filterCustomCityInput.value = '';
            }
        });
    }

    const filterCategorySelect = document.getElementById('filter-category-select');
    if (filterCategorySelect) {
        filterCategorySelect.addEventListener('change', (e) => {
            updateFilterSubcategories(e.target.value, 'all', 'all');
        });
    }

    const filtersModal = document.getElementById('filters-modal');
    const openFiltersBtn = document.getElementById('open-filters-btn');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');

    if (openFiltersBtn && filtersModal) {
        openFiltersBtn.onclick = () => {
            triggerHaptic('light');
            
            let fCity = currentFilters.city;
            if (fCity === 'all') {
                filterCitySelect.value = 'all';
                filterCustomCityInput.classList.add('hidden');
                filterCustomCityInput.value = '';
            } else if (standardCities.includes(fCity)) {
                filterCitySelect.value = fCity;
                filterCustomCityInput.classList.add('hidden');
                filterCustomCityInput.value = '';
            } else {
                filterCitySelect.value = 'custom';
                filterCustomCityInput.classList.remove('hidden');
                filterCustomCityInput.value = fCity;
            }

            filterCategorySelect.value = currentFilters.category;
            updateFilterSubcategories(currentFilters.category, currentFilters.subcategory, currentFilters.size);

            document.getElementById('filter-sort-select').value = currentFilters.sort;
            document.getElementById('filter-price-min').value = currentFilters.priceMin;
            document.getElementById('filter-price-max').value = currentFilters.priceMax;
            document.getElementById('filter-currency-select').value = currentFilters.currency;
            document.getElementById('filter-rating-select').value = currentFilters.minRating;

            filtersModal.classList.remove('hidden');
        };
    }

    if (applyFiltersBtn && filtersModal) {
        applyFiltersBtn.onclick = () => {
            triggerHaptic('success');
            
            let fCityVal = filterCitySelect.value;
            if (fCityVal === 'custom') {
                currentFilters.city = filterCustomCityInput.value.trim() || 'all';
            } else {
                currentFilters.city = fCityVal;
            }

            currentFilters.category = filterCategorySelect.value;
            
            const subSel = document.getElementById('filter-subcategory-select');
            currentFilters.subcategory = subSel ? subSel.value : 'all';

            const sizeSel = document.getElementById('filter-size-select');
            currentFilters.size = sizeSel ? sizeSel.value : 'all';

            currentFilters.sort = document.getElementById('filter-sort-select').value;
            currentFilters.priceMin = document.getElementById('filter-price-min').value.trim();
            currentFilters.priceMax = document.getElementById('filter-price-max').value.trim();
            currentFilters.currency = document.getElementById('filter-currency-select').value;
            currentFilters.minRating = parseFloat(document.getElementById('filter-rating-select').value) || 0;

            filtersModal.classList.add('hidden');
            filterAndRender();
        };
    }

    if (resetFiltersBtn && filtersModal) {
        resetFiltersBtn.onclick = () => {
            triggerHaptic('warning');
            filterCitySelect.value = 'all';
            filterCustomCityInput.classList.add('hidden');
            filterCustomCityInput.value = '';
            filterCategorySelect.value = 'all';
            updateFilterSubcategories('all', 'all', 'all');
            document.getElementById('filter-sort-select').value = 'default';
            document.getElementById('filter-price-min').value = '';
            document.getElementById('filter-price-max').value = '';
            document.getElementById('filter-currency-select').value = 'all';
            document.getElementById('filter-rating-select').value = '0';

            currentFilters = {
                city: 'all',
                sort: 'default',
                priceMin: '',
                priceMax: '',
                currency: 'all',
                category: 'all',
                subcategory: 'all',
                size: 'all',
                minRating: 0
            };

            filtersModal.classList.add('hidden');
            filterAndRender();
        };
    }

    const openBtn = document.getElementById('open-modal-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const editBtn = document.getElementById('edit-btn');
    const saveBtn = document.getElementById('save-btn');

    const fileInput = document.getElementById('image-file-input');
    const fileNameDisplay = document.getElementById('file-name');

    const prevImgBtn = document.getElementById('prev-img-btn');
    const nextImgBtn = document.getElementById('next-img-btn');

    const categorySelectEl = document.getElementById('category-select');
    if (categorySelectEl) {
        categorySelectEl.addEventListener('change', (e) => {
            updateSubcategories(e.target.value);
        });
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

            const addBtn = document.getElementById('open-modal-btn');
            if (addBtn) {
                if (targetTab === 'tab-my-ads') {
                    addBtn.classList.remove('hidden'); 
                } else {
                    addBtn.classList.add('hidden'); 
                }
            }

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
    if (editBtn) editBtn.onclick = () => openEditModal();

    if (saveBtn) {
        saveBtn.onclick = async () => {
            const titleInput = document.getElementById('title-input');
            const priceInput = document.getElementById('price-input');
            const currencySelect = document.getElementById('currency-select');
            const categorySelect = document.getElementById('category-select');
            
            const subContainer = document.getElementById('subcategory-container');
            const subcategoryVal = subContainer.style.display === 'block' ? document.getElementById('subcategory-select').value : '';

            const sizeContainer = document.getElementById('size-container');
            const sizeVal = sizeContainer.style.display === 'block' ? document.getElementById('size-select').value : '';

            const citySelectVal = document.getElementById('city-select').value;
            const customCityVal = document.getElementById('custom-city-input').value.trim();
            const finalCity = (citySelectVal === 'custom') ? (customCityVal || 'Минск') : citySelectVal;

            const sellerInput = document.getElementById('seller-input');
            const telegramInput = document.getElementById('telegram-input');
            const descInput = document.getElementById('desc-input');

            if (!titleInput.value.trim()) {
                triggerHaptic('error');
                alert('Введите название товара!');
                return;
            }

            let rawPrice = priceInput.value.trim() || '0';
            let finalPrice = `${rawPrice} ${currencySelect.value}`;

            triggerHaptic('success');
            modal.classList.add('hidden');

            const files = fileInput.files ? Array.from(fileInput.files).slice(0, 4) : [];

            const applyChangesWithIssues = async (imagesArray) => {
                const productData = {
                    title: titleInput.value.trim(),
                    price: finalPrice,
                    category: categorySelect.value || 'Другое',
                    subcategory: subcategoryVal || '',
                    size: sizeVal || '',
                    city: finalCity,
                    seller: sellerInput.value.trim() || 'Частное лицо',
                    telegram: telegramInput.value.trim() || '',
                    description: descInput.value.trim() || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (imagesArray && imagesArray.length > 0) {
                    productData.images = imagesArray;
                }

                try {
                    if (editingProductId) {
                        await db.collection("products").doc(editingProductId).update(productData);
                    } else {
                        if (!productData.images) {
                            productData.images = ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300'];
                        }
                        await db.collection("products").add(productData);
                    }
                } catch (err) {
                    console.error("Firebase save error details:", err);
                    alert("Ошибка публикации: " + err.message);
                }
            };

            if (files.length > 0) {
                let processedImages = [];
                let counter = 0;

                files.forEach(file => {
                    compressImage(file, (compressedUrl) => {
                        if (compressedUrl) processedImages.push(compressedUrl);
                        counter++;
                        if (counter === files.length) {
                            applyChangesWithIssues(processedImages);
                        }
                    });
                });
            } else {
                applyChangesWithIssues([]);
            }
        };
    }
});

function handleZoomSwipe() {
    const swipeThreshold = 50;
    if (touchEndX < touchStartX - swipeThreshold) {
        if (currentImageIndex < currentProductImages.length - 1) {
            currentImageIndex++;
            triggerHaptic('selection');
            updateGallery();
            updateZoomGalleryUI();
        }
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            triggerHaptic('selection');
            updateGallery();
            updateZoomGalleryUI();
        }
    }
}

// Функции для Симулятора Реселлера
const resellerTemplates = [
    { title: "Stone Island Zip Hoodie", img: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=300", minPrice: 120, maxPrice: 280, desc: "Состояние 9/10, бирки на месте. Продавец срочно отдает." },
    { title: "Nike Air Force 1 Low", img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300", minPrice: 80, maxPrice: 180, desc: "Немного б/у, но подошва в отличном состоянии." },
    { title: "Rick Owens Ramones", img: "https://images.unsplash.com/photo-1543508282-6319a3e2621f?w=300", minPrice: 250, maxPrice: 600, desc: "Редкая пара, есть небольшая потертость на носке." },
    { title: "Carhartt WIP Jacket", img: "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=300", minPrice: 100, maxPrice: 220, desc: "Винтажная рабочая куртка, плотный хлопок." },
    { title: "Adidas Samba OG", img: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=300", minPrice: 90, maxPrice: 190, desc: "Классика, состояние идеальное, коробка есть." },
    { title: "Supreme Box Logo Tee", img: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300", minPrice: 150, maxPrice: 350, desc: "Лимитка с коллаборации, без следов носки." }
];

let resellerState = JSON.parse(localStorage.getItem('reseller_state')) || {
    balance: 400,
    dealsCount: 0,
    inventory: []
};
let currentResellerLot = null;
let resellerTimerInterval = null;

function saveResellerState() {
    localStorage.setItem('reseller_state', JSON.stringify(resellerState));
    updateResellerUI();
}

function updateResellerUI() {
    const balEl = document.getElementById('reseller-balance');
    const dealsEl = document.getElementById('reseller-deals-count');
    if (balEl) balEl.textContent = `${resellerState.balance} BYN`;
    if (dealsEl) dealsEl.textContent = resellerState.dealsCount;
    renderResellerInventory();
}

function spawnResellerLot() {
    const cardArea = document.getElementById('reseller-game-area');
    if (!cardArea) return;

    if (resellerState.balance <= 0 && resellerState.inventory.length === 0) {
        cardArea.innerHTML = `<div style="text-align: center; padding: 40px; color: #ff3b30; font-weight: 700;">Вы банкрот! Баланс 0 BYN. <br><button class="btn-primary" onclick="resetResellerGame()" style="margin-top:10px;">Начать заново</button></div>`;
        return;
    }

    const template = resellerTemplates[Math.floor(Math.random() * resellerTemplates.length)];
    const buyPrice = Math.floor(Math.random() * (template.maxPrice - template.minPrice) + template.minPrice);
    const marketMultiplier = (Math.random() * 0.8 + 0.7);
    const marketValue = Math.floor(buyPrice * marketMultiplier + (Math.random() * 60 - 20));

    currentResellerLot = {
        id: Date.now(),
        title: template.title,
        img: template.img,
        desc: template.desc,
        buyPrice: buyPrice,
        marketValue: Math.max(40, marketValue)
    };

    const imgEl = document.getElementById('reseller-lot-img');
    const titleEl = document.getElementById('reseller-lot-title');
    const descEl = document.getElementById('reseller-lot-desc');
    const priceEl = document.getElementById('reseller-lot-price');
    const marketEl = document.getElementById('reseller-lot-market');

    if (imgEl) imgEl.src = currentResellerLot.img;
    if (titleEl) titleEl.textContent = currentResellerLot.title;
    if (descEl) descEl.textContent = currentResellerLot.desc;
    if (priceEl) priceEl.textContent = `${currentResellerLot.buyPrice} BYN`;
    if (marketEl) marketEl.textContent = `~${currentResellerLot.marketValue} BYN`;

    startResellerTimer(10);
}

function startResellerTimer(seconds) {
    let timeLeft = seconds;
    const bar = document.getElementById('reseller-timer-bar');
    if (!bar) return;

    clearInterval(resellerTimerInterval);
    bar.style.width = '100%';

    resellerTimerInterval = setInterval(() => {
        timeLeft--;
        let percent = (timeLeft / seconds) * 100;
        bar.style.width = `${percent}%`;

        if (timeLeft <= 0) {
            clearInterval(resellerTimerInterval);
            triggerHaptic('warning');
            spawnResellerLot();
        }
    }, 1000);
}

window.resetResellerGame = function() {
    resellerState = { balance: 400, dealsCount: 0, inventory: [] };
    saveResellerState();
    location.reload();
};

function renderResellerInventory() {
    const container = document.getElementById('reseller-inventory');
    if (!container) return;
    container.innerHTML = '';

    if (resellerState.inventory.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Склад пуст. Купите вещи на рынке выше!</div>';
        return;
    }

    resellerState.inventory.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'reseller-item-card';
        
        let sellOffer = Math.floor(item.marketValue * (Math.random() * 0.3 + 0.85));
        let profit = sellOffer - item.buyPrice;
        let profitColor = profit >= 0 ? '#34c759' : '#ff3b30';

        div.innerHTML = `
            <img class="reseller-item-img" src="${item.img}" alt="${item.title}">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${item.title}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Покупка: ${item.buyPrice} BYN</div>
            <button class="btn-primary" style="padding: 6px; font-size: 12px; border:none; outline:none;" onclick="sellResellerItem(${index}, ${sellOffer})">Продать за ${sellOffer} BYN <br><span style="font-size: 10px; color:${profitColor};">(${profit >= 0 ? '+' : ''}${profit} BYN)</span></button>
        `;
        container.appendChild(div);
    });
}

window.sellResellerItem = function(index, sellPrice) {
    clearInterval(resellerTimerInterval);
    const item = resellerState.inventory.splice(index, 1)[0];
    resellerState.balance += sellPrice;
    resellerState.dealsCount++;
    triggerHaptic('success');
    saveResellerState();
    renderResellerInventory();
    spawnResellerLot();
};
