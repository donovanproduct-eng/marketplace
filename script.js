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

let currentUser = JSON.parse(localStorage.getItem('my_marketplace_user')) || null;
let favorites = currentUser ? (JSON.parse(localStorage.getItem(`favs_${currentUser.username}`)) || []) : [];

let currentCategory = 'all';

let currentFilters = {
    city: 'all',
    sort: 'default',
    priceMin: '',
    priceMax: '',
    currency: 'all',
    size: '',
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

window.openFullscreenZoom = function() {
    triggerHaptic('light');
    const currentImgSrc = currentProductImages[currentImageIndex];
    if (!currentImgSrc) return;

    const zoomImg = document.getElementById('fullscreen-zoom-img');
    const zoomModal = document.getElementById('fullscreen-zoom-modal');
    
    if (zoomImg && zoomModal) {
        zoomImg.src = currentImgSrc;
        zoomModal.classList.remove('hidden');
    }
};

window.closeFullscreenZoom = function() {
    triggerHaptic('light');
    const zoomModal = document.getElementById('fullscreen-zoom-modal');
    if (zoomModal) {
        zoomModal.classList.add('hidden');
    }
};

function updateRatingUI(reviewsArray, scoreId, starsId, countId) {
    const scoreEl = document.getElementById(scoreId);
    const starsEl = document.getElementById(starsId);
    const countEl = document.getElementById(countId);
    
    if (!scoreEl || !starsEl || !countEl) return;

    if (reviewsArray.length === 0) {
        scoreEl.textContent = '0.0';
        starsEl.textContent = '⭐⭐⭐⭐⭐';
        countEl.textContent = '(0 отзывов)';
    } else {
        let totalStars = 0;
        reviewsArray.forEach(r => totalStars += parseInt(r.stars || 5));
        const avg = (totalStars / reviewsArray.length).toFixed(1);
        
        scoreEl.textContent = avg;
        
        const fullStars = Math.round(avg);
        starsEl.textContent = '⭐'.repeat(fullStars === 0 ? 1 : fullStars); 
        
        let word = 'отзывов';
        let c = reviewsArray.length;
        if (c % 10 === 1 && c % 100 !== 11) word = 'отзыв';
        else if ([2, 3, 4].includes(c % 10) && ![12, 13, 14].includes(c % 100)) word = 'отзыва';
        
        countEl.textContent = `(${c} ${word})`;
    }
}

function updateSubcategories(categoryValue, selectedSubcategory = '', selectedSize = '') {
    const subContainer = document.getElementById('subcategory-container');
    const subSelect = document.getElementById('subcategory-select');
    
    const sizeContainer = document.getElementById('size-container');
    const sizeSelect = document.getElementById('size-select');
    
    const subs = subcategoriesMap[categoryValue];
    
    if (subs && subs.length > 0) {
        subSelect.innerHTML = '';
        subs.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            subSelect.appendChild(opt);
        });
        if (selectedSubcategory && subs.includes(selectedSubcategory)) {
            subSelect.value = selectedSubcategory;
        }
        subContainer.style.display = 'block';
    } else {
        subSelect.innerHTML = '';
        subContainer.style.display = 'none';
    }

    if (categoryValue === "Одежда" || categoryValue === "Обувь") {
        sizeSelect.innerHTML = '';
        let targetSizes = (categoryValue === "Одежда") ? clothingSizes : shoeSizes;
        
        targetSizes.forEach(sz => {
            const opt = document.createElement('option');
            opt.value = sz;
            opt.textContent = sz;
            sizeSelect.appendChild(opt);
        });

        if (selectedSize && targetSizes.includes(selectedSize)) {
            sizeSelect.value = selectedSize;
        }
        sizeContainer.style.display = 'block';
    } else {
        sizeSelect.innerHTML = '';
        sizeContainer.style.display = 'none';
    }
}

function listenFirebaseProducts() {
    db.collection("products")
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => {
          products = [];
          snapshot.forEach((doc) => {
              const data = doc.data();
              products.push({
                  id: doc.id,
                  ...data,
                  images: (data.images && data.images.length > 0) ? data.images : [data.image || 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300']
              });
          });
          filterAndRender();
          renderProfile();
          renderMyProductsTab();
          
          if (window.currentOpenedSellerTg) {
              renderPublicProfileProducts(window.currentOpenedSellerTg);
          }

          hideLoader();
      }, (err) => {
          console.error("Ошибка Firebase (продукты):", err);
          hideLoader();
      });
}

function listenFirebaseReviews() {
    db.collection("reviews")
      .onSnapshot((snapshot) => {
          allReviews = [];
          snapshot.forEach((doc) => {
              allReviews.push({ id: doc.id, ...doc.data() });
          });
          renderProfile();
          if (window.currentOpenedSellerTg) {
              renderPublicProfileReviews(window.currentOpenedSellerTg);
          }
      }, (err) => {
          console.error("Ошибка Firebase (отзывы):", err);
      });
}

function listenFirebasePurchases() {
    if (!currentUser || !currentUser.username) return;
    const cleanMyTg = currentUser.username.replace('@', '').toLowerCase();

    db.collection("purchases")
      .where("buyerUsername", "==", cleanMyTg)
      .onSnapshot((snapshot) => {
          myPurchases = [];
          snapshot.forEach((doc) => {
              myPurchases.push({ id: doc.id, ...doc.data() });
          });
          renderPurchasesTab();
      }, (err) => {
          console.error("Ошибка Firebase (покупки):", err);
      });
}

async function logProductView(productId) {
    if (!currentUser || !currentUser.username) return;

    const product = products.find(p => p.id === productId);
    if (!product) return;
    let pTg = (product.telegram || '').replace('@', '').toLowerCase();
    let myTg = (currentUser.username || '').toLowerCase();
    if (pTg === myTg) return;

    try {
        await db.collection("productViews").add({
            productId: productId,
            viewerUsername: currentUser.username,
            viewerName: currentUser.name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("Ошибка записи просмотра:", e);
    }
}

function checkPendingReviewRequests() {
    if (!currentUser || !currentUser.username) return;

    const cleanMyTg = currentUser.username.replace('@', '').toLowerCase();

    db.collection("pendingReviews")
      .where("buyerUsername", "==", cleanMyTg)
      .where("completed", "==", false)
      .get()
      .then((querySnapshot) => {
          if (!querySnapshot.empty) {
              const doc = querySnapshot.docs[0];
              const data = doc.data();
              
              const reviewModal = document.getElementById('leave-review-modal');
              const descEl = document.getElementById('leave-review-desc');
              if (descEl) {
                  descEl.textContent = `Вы купили товар "${data.productTitle}" у продавца @${data.sellerTelegram}. Пожалуйста, оставьте отзыв.`;
              }
              if (reviewModal) {
                  reviewModal.classList.remove('hidden');
              }

              const submitBtn = document.getElementById('submit-review-btn');
              const cancelBtn = document.getElementById('cancel-review-btn');

              submitBtn.onclick = async () => {
                  const stars = document.getElementById('review-stars-select').value;
                  const text = document.getElementById('review-text-input').value.trim();

                  if (!text) {
                      alert('Напишите пару слов о сделке!');
                      return;
                  }

                  try {
                      await db.collection("reviews").add({
                          sellerTelegram: data.sellerTelegram.toLowerCase(),
                          author: currentUser.name,
                          stars: stars,
                          text: text,
                          createdAt: firebase.firestore.FieldValue.serverTimestamp()
                      });

                      await db.collection("pendingReviews").doc(doc.id).update({ completed: true });

                      triggerHaptic('success');
                      reviewModal.classList.add('hidden');
                      alert('Спасибо за ваш отзыв!');
                  } catch (e) {
                      console.error("Ошибка сохранения отзыва:", e);
                  }
              };

              cancelBtn.onclick = () => {
                  reviewModal.classList.add('hidden');
              };
          }
      })
      .catch((err) => {
          console.error("Ошибка проверки запросов на отзыв:", err);
      });
}

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
        localStorage.setItem('my_marketplace_theme', isDarkTheme ? 'dark' : 'light');
        if (currentUser) {
            localStorage.setItem('my_marketplace_user', JSON.stringify(currentUser));
            localStorage.setItem(`favs_${currentUser.username}`, JSON.stringify(favorites));
        } else {
            localStorage.removeItem('my_marketplace_user');
        }
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }
}

function checkAuth() {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app');

    if (currentUser) {
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        syncUserWithFirebase();
        renderProfile();
        renderMyProductsTab();
        filterAndRender();
        listenFirebasePurchases();
        checkPendingReviewRequests();

        // Показываем кнопку добавления, если открыта вкладка «Мои товары»
        const activeNav = document.querySelector('.nav-item.active');
        const addBtn = document.getElementById('open-modal-btn');
        if (activeNav && activeNav.dataset.tab === 'tab-my-ads' && addBtn) {
            addBtn.classList.remove('hidden');
        }
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
        guestBox.classList.add('hidden');
    }
}

async function syncUserWithFirebase() {
    if (!currentUser || !currentUser.username) return;

    const userDocRef = db.collection("users").doc(currentUser.username.toLowerCase());

    try {
        const doc = await userDocRef.get();
        if (doc.exists) {
            const data = doc.data();
            currentUser.isVerified = !!data.isVerified;
            currentUser.phone = data.phone || currentUser.phone || '';
            
            if (data.bio) currentUser.bio = data.bio;
            if (data.customAvatar) currentUser.customAvatar = data.customAvatar;
            if (data.favorites) favorites = data.favorites;
            
            saveToStorage();
            renderProfile();
            filterAndRender();
        } else {
            await userDocRef.set({
                name: currentUser.name,
                username: currentUser.username,
                isVerified: false,
                phone: '',
                bio: '',
                customAvatar: '',
                favorites: favorites 
            });
        }
    } catch (e) {
        console.error("Ошибка синхронизации юзера:", e);
    }
}

async function loginUser(name, username, photoUrl = '') {
    const cleanUsername = username ? username.replace('@', '').toLowerCase() : 'user';
    currentUser = {
        name: name || 'Пользователь',
        username: cleanUsername,
        photoUrl: photoUrl,
        isVerified: false,
        phone: '',
        bio: '',
        customAvatar: ''
    };
    favorites = JSON.parse(localStorage.getItem(`favs_${cleanUsername}`)) || [];
    triggerHaptic('success');
    saveToStorage();
    checkAuth();
}

function logoutUser() {
    triggerHaptic('warning');
    currentUser = null;
    favorites = []; 
    saveToStorage();
    checkAuth();
}

async function completeVerification(phone) {
    if (!currentUser) return;

    currentUser.isVerified = true;
    currentUser.phone = phone;
    triggerHaptic('success');
    saveToStorage();
    renderProfile();

    document.getElementById('verify-modal').classList.add('hidden');

    if (currentUser.username) {
        try {
            await db.collection("users").doc(currentUser.username.toLowerCase()).set({
                name: currentUser.name,
                username: currentUser.username,
                isVerified: true,
                phone: phone,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.error("Ошибка сохранения верификации:", e);
        }
    }
}

function renderPurchasesTab() {
    const container = document.getElementById('my-purchases-grid');
    if (!container) return;
    container.innerHTML = '';

    if (myPurchases.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 20px;">У вас пока нет купленных товаров</div>';
        return;
    }

    myPurchases.forEach(item => {
        const mainImage = (item.images && item.images.length > 0) ? item.images[0] : 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300';
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => openPurchasedViewModal(item);

        card.innerHTML = `
            <img class="product-image" src="${mainImage}" alt="${item.title}">
            <div class="product-title">${item.title}</div>
            <div class="product-city">📍 ${item.city || 'Минск'}</div>
            <div class="product-price">${item.price}</div>
        `;
        container.appendChild(card);
    });
}

function setupViewModalCommon(product) {
    editingProductId = null;
    currentProductImages = product.images || ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300'];
    currentImageIndex = 0;

    updateGallery();

    let categoryText = product.category || 'Другое';
    if (product.subcategory) {
        categoryText += ` • ${product.subcategory}`;
    }
    if (product.size) {
        categoryText += ` • Размер: ${product.size}`;
    }

    document.getElementById('view-title').textContent = product.title;
    document.getElementById('view-price').textContent = product.price; 
    document.getElementById('view-category').textContent = categoryText;
    document.getElementById('view-city').textContent = `📍 ${product.city || 'Минск'}`;
    document.getElementById('view-seller').textContent = product.seller || 'Продавец';
    
    let rawTg = product.telegram ? String(product.telegram).trim() : '';
    if (rawTg.includes('t.me/')) {
        rawTg = rawTg.split('t.me/')[1].split('/')[0];
    }
    let cleanTg = rawTg.replace('@', '').trim();

    let tgUser = cleanTg ? ('@' + cleanTg) : 'Telegram не указан';
    document.getElementById('view-telegram').textContent = tgUser;
    document.getElementById('view-desc').textContent = product.description || 'Описание отсутствует';

    activeSellerData = {
        name: product.seller || 'Продавец',
        telegram: cleanTg
    };

    const editBtn = document.getElementById('edit-btn');
    let pTg = cleanTg.toLowerCase();
    let myTg = (currentUser?.username || '').replace('@', '').toLowerCase();

    if (product.id && currentUser && pTg === myTg && myTg !== '') {
        editBtn.style.display = 'block';
        editingProductId = product.id;
    } else {
        editBtn.style.display = 'none';
    }

    const contactBtn = document.getElementById('contact-btn');
    if (cleanTg !== '') {
        contactBtn.onclick = (e) => handleTelegramClick(e, cleanTg, product.title, product.price);
        contactBtn.style.opacity = '1';
        contactBtn.style.pointerEvents = 'auto';

        if (tg?.MainButton) {
            tg.MainButton.setText(`💬 Написать продавцу (${product.price})`);
            tg.MainButton.show();
            tg.MainButton.onClick(() => {
                handleTelegramClick(null, cleanTg, product.title, product.price);
            });
        }
    } else {
        contactBtn.onclick = null;
        contactBtn.style.opacity = '0.5';
        contactBtn.style.pointerEvents = 'none';
        if (tg?.MainButton) tg.MainButton.hide();
    }

    document.getElementById('view-modal').classList.remove('hidden');
}

window.openPurchasedViewModal = function(product) {
    triggerHaptic('light');
    setupViewModalCommon(product);
};

window.openViewModal = function(id) {
    triggerHaptic('light');
    const product = products.find(p => p.id === id);
    if (!product) return;
    logProductView(id);
    setupViewModalCommon(product);
}

function closeViewModal() {
    triggerHaptic('light');
    document.getElementById('view-modal').classList.add('hidden');
    if (tg?.MainButton) {
        tg.MainButton.hide();
    }
}

window.openActiveSellerProfile = function() {
    triggerHaptic('light');
    
    let targetTg = activeSellerData.telegram || '';
    window.currentOpenedSellerTg = targetTg;

    if (tg?.MainButton) {
        tg.MainButton.hide();
    }

    const pubNameEl = document.getElementById('public-user-name');
    const pubTgEl = document.getElementById('public-user-tg');
    const pubBadgeEl = document.getElementById('public-profile-badge');
    const pubAvEl = document.getElementById('public-user-avatar');
    const pubBioEl = document.getElementById('public-profile-bio');

    if (pubNameEl) pubNameEl.textContent = activeSellerData.name || 'Продавец';
    if (pubTgEl) pubTgEl.textContent = targetTg ? `@${targetTg}` : '@username';

    if (pubBadgeEl) {
        pubBadgeEl.textContent = '⏳ Проверка...';
        pubBadgeEl.className = 'profile-badge unverified';
        if (pubAvEl) pubAvEl.innerHTML = '👤';
        if (pubBioEl) pubBioEl.style.display = 'none';
        
        if (targetTg) {
            db.collection("users").doc(targetTg.toLowerCase()).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    
                    if (data.isVerified) {
                        pubBadgeEl.textContent = '✓ Подтверждённый продавец';
                        pubBadgeEl.className = 'profile-badge verified';
                    } else {
                        pubBadgeEl.textContent = '❌ Профиль не подтвержден';
                        pubBadgeEl.className = 'profile-badge unverified';
                    }

                    if (pubNameEl && data.name) pubNameEl.textContent = data.name;

                    if (pubAvEl) {
                        if (data.customAvatar) pubAvEl.innerHTML = `<img src="${data.customAvatar}" alt="Avatar">`;
                        else pubAvEl.innerHTML = '👤';
                    }

                    if (pubBioEl) {
                        pubBioEl.textContent = data.bio || '';
                        pubBioEl.style.display = data.bio ? 'block' : 'none';
                    }
                } else {
                    pubBadgeEl.textContent = '❌ Профиль не подтвержден';
                    pubBadgeEl.className = 'profile-badge unverified';
                }
            }).catch(e => {
                console.error("Ошибка загрузки профиля продавца:", e);
                pubBadgeEl.textContent = '❌ Профиль не подтвержден';
                pubBadgeEl.className = 'profile-badge unverified';
            });
        }
    }

    const pubTabAds = document.getElementById('pub-tab-ads');
    const pubTabReviews = document.getElementById('pub-tab-reviews');
    const pubSecAds = document.getElementById('pub-sec-ads');
    const pubSecReviews = document.getElementById('pub-sec-reviews');
    
    if (pubTabAds && pubTabReviews && pubSecAds && pubSecReviews) {
        pubTabAds.classList.add('active');
        pubTabReviews.classList.remove('active');
        pubSecAds.style.display = 'block';
        pubSecReviews.style.display = 'none';
    }

    renderPublicProfileProducts(targetTg);
    renderPublicProfileReviews(targetTg);

    document.getElementById('view-modal').classList.add('hidden');
    document.getElementById('public-profile-modal').classList.remove('hidden');
};

function renderReviews() {
    const list = document.getElementById('reviews-list');
    if (!list || !currentUser) return;
    list.innerHTML = '';

    const myTg = currentUser.username.replace('@', '').toLowerCase();
    const myReviews = allReviews.filter(r => (r.sellerTelegram || '').toLowerCase() === myTg);

    document.getElementById('profile-reviews-count').textContent = `(${myReviews.length} отзывов)`;

    if (myReviews.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 10px;">Пока нет отзывов</div>';
        return;
    }

    myReviews.forEach(r => {
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

function renderPublicProfileReviews(sellerTelegram) {
    const container = document.getElementById('public-reviews-list');
    if (!container) return;
    container.innerHTML = '';

    const cleanSellerTg = sellerTelegram.replace('@', '').toLowerCase();
    const sellerReviews = allReviews.filter(r => (r.sellerTelegram || '').toLowerCase() === cleanSellerTg);
    
    updateRatingUI(sellerReviews, 'public-rating-score', 'public-rating-stars', 'public-rating-count');

    if (sellerReviews.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">У этого продавца пока нет отзывов</div>';
        return;
    }

    sellerReviews.forEach(r => {
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
        container.appendChild(item);
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
            <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
            <button class="delete-btn" onclick="deleteProduct(event, '${item.id}')">✕</button>
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
    const bioEl = document.getElementById('profile-bio');
    const badgeEl = document.getElementById('profile-badge');
    const openVerifyBtn = document.getElementById('open-verify-btn');

    nameEl.textContent = currentUser.name;
    tgEl.textContent = `@${currentUser.username}`;

    if (currentUser.customAvatar) {
        avatarEl.innerHTML = `<img src="${currentUser.customAvatar}" alt="Avatar">`;
    } else if (currentUser.photoUrl) {
        avatarEl.innerHTML = `<img src="${currentUser.photoUrl}" alt="Avatar">`;
    } else {
        avatarEl.innerHTML = '👤';
    }

    if (bioEl) {
        bioEl.textContent = currentUser.bio || '';
        bioEl.style.display = currentUser.bio ? 'block' : 'none';
    }

    if (currentUser.isVerified) {
        badgeEl.textContent = '✓ Профиль подтверждён';
        badgeEl.className = 'profile-badge verified';
        if (openVerifyBtn) openVerifyBtn.style.display = 'none'; 
    } else {
        badgeEl.textContent = '❌ Профиль не подтвержден';
        badgeEl.className = 'profile-badge unverified';
        if (openVerifyBtn) openVerifyBtn.style.display = 'block'; 
    }

    document.getElementById('fav-ads-count').textContent = favorites.length;

    const myProducts = products.filter(p => {
        let pTg = (p.telegram || '').replace('@', '').toLowerCase();
        let myTg = (currentUser.username || '').toLowerCase();
        return pTg === myTg && pTg !== '';
    });

    document.getElementById('my-ads-count').textContent = myProducts.length;

    const myTg = currentUser.username.replace('@', '').toLowerCase();
    const myReviews = allReviews.filter(r => (r.sellerTelegram || '').toLowerCase() === myTg);
    updateRatingUI(myReviews, 'profile-rating-score', 'profile-rating-stars', 'profile-reviews-count');

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
                    <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
                    <button class="delete-btn" onclick="deleteProduct(event, '${item.id}')">✕</button>
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

function renderPublicProfileProducts(sellerTelegram) {
    const container = document.getElementById('public-user-products');
    if (!container) return;
    container.innerHTML = '';

    const cleanSellerTg = sellerTelegram.replace('@', '').toLowerCase();
    const sellerProducts = products.filter(p => {
        let pTg = (p.telegram || '').replace('@', '').toLowerCase();
        return pTg === cleanSellerTg && pTg !== '';
    });

    if (sellerProducts.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">У этого продавца пока нет других объявлений</div>';
        return;
    }

    sellerProducts.forEach(item => {
        const isFav = favorites.includes(item.id);
        const mainImage = item.images[0];
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => {
            document.getElementById('public-profile-modal').classList.add('hidden');
            openViewModal(item.id);
        };

        card.innerHTML = `
            <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
            <img class="product-image" src="${mainImage}" alt="${item.title}">
            <div class="product-title">${item.title}</div>
            <div class="product-city">📍 ${item.city || 'Минск'}</div>
            <div class="product-price">${item.price}</div>
        `;
        container.appendChild(card);
    });
}

window.toggleFavorite = async function(event, id) {
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
    if (activeSellerData.telegram) {
        renderPublicProfileProducts(activeSellerData.telegram);
    }

    if (currentUser && currentUser.username) {
        try {
            await db.collection("users").doc(currentUser.username.toLowerCase()).update({
                favorites: favorites
            });
        } catch(e) {
            console.error("Ошибка сохранения избранного в базу", e);
        }
    }
};

async function loadRecentViewersForProduct(productId) {
    const listContainer = document.getElementById('recent-viewers-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center;">Загрузка списка...</div>';

    try {
        const snapshot = await db.collection("productViews")
            .where("productId", "==", productId)
            .get();

        listContainer.innerHTML = '';
        
        if (snapshot.empty) {
            listContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center;">Никто не заходил на этот товар в последнее время</div>';
            return;
        }

        let views = [];
        snapshot.forEach(doc => {
            views.push(doc.data());
        });

        views.sort((a, b) => {
            let timeA = a.createdAt ? a.createdAt.toMillis() : 0;
            let timeB = b.createdAt ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        const seenUsers = new Set();
        let addedCount = 0;

        views.forEach(data => {
            const username = data.viewerUsername;
            const name = data.viewerName || username;

            if (username && !seenUsers.has(username) && addedCount < 10) {
                seenUsers.add(username);
                addedCount++;

                const chip = document.createElement('div');
                chip.className = 'viewer-chip';
                chip.innerHTML = `<span>👤 ${name}</span> <span style="color: #24A1DE; font-size: 12px;">@${username}</span>`;
                
                chip.onclick = () => {
                    document.getElementById('buyer-username-input').value = username;
                    triggerHaptic('light');
                    document.querySelectorAll('.viewer-chip').forEach(c => c.style.borderColor = 'transparent');
                    chip.style.borderColor = '#007aff';
                    chip.style.borderWidth = '1.5px';
                    chip.style.borderStyle = 'solid';
                };

                listContainer.appendChild(chip);
            }
        });

        if (addedCount === 0) {
            listContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center;">Нет данных о просмотрах</div>';
        }
    } catch (e) {
        console.error("Ошибка загрузки просмотров:", e);
        listContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center;">Не удалось загрузить историю просмотров</div>';
    }
}

window.deleteProduct = function(event, id) {
    event.stopPropagation();
    
    const product = products.find(p => p.id === id);
    if (!product) return;

    let pTg = (product.telegram || '').replace('@', '').toLowerCase();
    let myTg = (currentUser?.username || '').toLowerCase();

    if (!currentUser || pTg !== myTg || !myTg) {
        triggerHaptic('error');
        alert("Вы можете удалять только свои объявления!");
        return;
    }

    pendingDeleteId = id;
    const buyerModal = document.getElementById('buyer-modal');
    if (buyerModal) {
        document.getElementById('buyer-username-input').value = '';
        buyerModal.classList.remove('hidden');
        loadRecentViewersForProduct(id);
    }
};

async function finalizeProductDeletion(buyerUsername) {
    if (!pendingDeleteId) return;

    const product = products.find(p => p.id === pendingDeleteId);

    try {
        if (product && buyerUsername) {
            let cleanBuyer = buyerUsername.trim().replace('@', '').toLowerCase();
            let sellerTg = (currentUser?.username || '').toLowerCase();

            await db.collection("purchases").add({
                buyerUsername: cleanBuyer,
                title: product.title,
                price: product.price,
                category: product.category || 'Другое',
                subcategory: product.subcategory || '',
                size: product.size || '',
                city: product.city || 'Минск',
                seller: product.seller || 'Продавец',
                telegram: product.telegram || '',
                description: product.description || '',
                images: product.images || [],
                purchasedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await db.collection("pendingReviews").add({
                productTitle: product.title,
                sellerTelegram: sellerTg,
                buyerUsername: cleanBuyer,
                completed: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        await db.collection("products").doc(pendingDeleteId).delete();
        favorites = favorites.filter(favId => favId !== pendingDeleteId);
        triggerHaptic('warning');
        saveToStorage();
    } catch (err) {
        console.error("Ошибка удаления:", err);
    }

    pendingDeleteId = null;
}

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

function openEditModal() {
    triggerHaptic('light');
    const product = products.find(p => p.id === editingProductId);
    if (!product) return;

    closeViewModal();

    document.getElementById('modal-title').textContent = 'Редактировать объявление';
    document.getElementById('save-btn').textContent = 'Сохранить';

    document.getElementById('title-input').value = product.title || '';
    
    let savedPrice = product.price || '';
    let numPart = savedPrice.replace(/[^\d.,]/g, '').trim(); 
    let currPart = savedPrice.includes('₽') || savedPrice.includes('RUB') ? '₽' : 'BYN';
    
    document.getElementById('price-input').value = numPart;
    document.getElementById('currency-select').value = currPart;

    const catVal = product.category || 'Другое';
    document.getElementById('category-select').value = catVal;
    
    updateSubcategories(catVal, product.subcategory || '', product.size || '');

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
    document.getElementById('currency-select').value = 'BYN';
    
    document.getElementById('category-select').value = 'Другое';
    updateSubcategories('Другое'); 

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

// === УМНАЯ ФИЛЬТРАЦИЯ И СОРТИРОВКА ===
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

        // Фильтр по городу
        let matchesCity = currentFilters.city === 'all' || (product.city || 'Минск') === currentFilters.city;

        // Валюта товара и цена
        let rawPriceStr = product.price || '0';
        let rawPriceNum = parseFloat(rawPriceStr.replace(/[^\d.]/g, '')) || 0;
        let productCurrency = rawPriceStr.includes('₽') || rawPriceStr.includes('RUB') ? '₽' : 'BYN';

        // Фильтр по выбранной валюте в поиске
        let matchesCurrency = currentFilters.currency === 'all' || productCurrency === currentFilters.currency;

        // Фильтр по минимальной цене
        let matchesPriceMin = currentFilters.priceMin === '' || rawPriceNum >= parseFloat(currentFilters.priceMin);
        
        // Фильтр по максимальной цене
        let matchesPriceMax = currentFilters.priceMax === '' || rawPriceNum <= parseFloat(currentFilters.priceMax);

        // Фильтр по размеру (если задан)
        let matchesSize = true;
        if (currentFilters.size.trim() !== '') {
            let pSize = (product.size || '').toLowerCase();
            let targetSize = currentFilters.size.trim().toLowerCase();
            matchesSize = pSize.includes(targetSize);
        }

        // Фильтр по рейтингу продавца
        let matchesRating = true;
        if (currentFilters.minRating > 0) {
            let sellerTg = (product.telegram || '').replace('@', '').toLowerCase();
            let sellerReviews = allReviews.filter(r => (r.sellerTelegram || '').toLowerCase() === sellerTg);
            let avgRating = 0;
            if (sellerReviews.length > 0) {
                let total = 0;
                sellerReviews.forEach(r => total += parseInt(r.stars || 5));
                avgRating = total / sellerReviews.length;
            }
            matchesRating = sellerReviews.length > 0 && avgRating >= currentFilters.minRating;
        }

        return matchesQuery && matchesCat && matchesCity && matchesCurrency && matchesPriceMin && matchesPriceMax && matchesSize && matchesRating;
    });

    // Сортировка
    if (currentFilters.sort === 'asc') {
        filtered.sort((a, b) => {
            let priceA = parseFloat((a.price || '0').replace(/[^\d.]/g, '')) || 0;
            let priceB = parseFloat((b.price || '0').replace(/[^\d.]/g, '')) || 0;
            return priceA - priceB;
        });
    } else if (currentFilters.sort === 'desc') {
        filtered.sort((a, b) => {
            let priceA = parseFloat((a.price || '0').replace(/[^\d.]/g, '')) || 0;
            let priceB = parseFloat((b.price || '0').replace(/[^\d.]/g, '')) || 0;
            return priceB - priceA;
        });
    }

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

        let pTg = (item.telegram || '').replace('@', '').toLowerCase();
        let myTg = (currentUser?.username || '').toLowerCase();
        const isMyProduct = currentUser && pTg === myTg && myTg !== '';

        card.innerHTML = `
            <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
            ${isMyProduct ? `<button class="delete-btn" onclick="deleteProduct(event, '${item.id}')">✕</button>` : ''}
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
            const maxDim = 800;
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
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
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
    listenFirebaseProducts();
    listenFirebaseReviews();

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

    // Настройки профиля
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
    const catBtns = document.querySelectorAll('.cat-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pTabBtns = document.querySelectorAll('.p-tab-btn');
    
    const modal = document.getElementById('modal');

    // Логика модального окна фильтров
    const filtersModal = document.getElementById('filters-modal');
    const openFiltersBtn = document.getElementById('open-filters-btn');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const resetFiltersBtn = document.getElementById('reset-filters-btn');

    if (openFiltersBtn && filtersModal) {
        openFiltersBtn.onclick = () => {
            triggerHaptic('light');
            document.getElementById('filter-city-select').value = currentFilters.city;
            document.getElementById('filter-sort-select').value = currentFilters.sort;
            document.getElementById('filter-price-min').value = currentFilters.priceMin;
            document.getElementById('filter-price-max').value = currentFilters.priceMax;
            document.getElementById('filter-currency-select').value = currentFilters.currency;
            document.getElementById('filter-size-input').value = currentFilters.size;
            document.getElementById('filter-rating-select').value = currentFilters.minRating;

            filtersModal.classList.remove('hidden');
        };
    }

    if (applyFiltersBtn && filtersModal) {
        applyFiltersBtn.onclick = () => {
            triggerHaptic('success');
            currentFilters.city = document.getElementById('filter-city-select').value;
            currentFilters.sort = document.getElementById('filter-sort-select').value;
            currentFilters.priceMin = document.getElementById('filter-price-min').value.trim();
            currentFilters.priceMax = document.getElementById('filter-price-max').value.trim();
            currentFilters.currency = document.getElementById('filter-currency-select').value;
            currentFilters.size = document.getElementById('filter-size-input').value.trim();
            currentFilters.minRating = parseFloat(document.getElementById('filter-rating-select').value) || 0;

            filtersModal.classList.add('hidden');
            filterAndRender();
        };
    }

    if (resetFiltersBtn && filtersModal) {
        resetFiltersBtn.onclick = () => {
            triggerHaptic('warning');
            document.getElementById('filter-city-select').value = 'all';
            document.getElementById('filter-sort-select').value = 'default';
            document.getElementById('filter-price-min').value = '';
            document.getElementById('filter-price-max').value = '';
            document.getElementById('filter-currency-select').value = 'all';
            document.getElementById('filter-size-input').value = '';
            document.getElementById('filter-rating-select').value = '0';

            currentFilters = {
                city: 'all',
                sort: 'default',
                priceMin: '',
                priceMax: '',
                currency: 'all',
                size: '',
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

            const citySelect = document.getElementById('city-select');
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
                    city: citySelect.value || 'Минск',
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
