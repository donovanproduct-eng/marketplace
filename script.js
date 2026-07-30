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

// === ЗВУКОВЫЕ ЭФФЕКТЫ ЧЕРЕЗ WEB AUDIO API (ТОЛЬКО В РЕСЕЛЛЕРЕ) ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const resellerTab = document.getElementById('tab-reseller');
    if (!resellerTab || resellerTab.classList.contains('hidden')) {
        return;
    }

    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'coin') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(987.77, now); 
        osc.frequency.setValueAtTime(1318.51, now + 0.08); 
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'buy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.setValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    }
}

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

// === ПАГИНАЦИЯ И ОПТИМИЗАЦИЯ ===
let lastVisibleProductDoc = null;
let isLoadingProducts = false;
let hasMoreProducts = true;
const PAGE_SIZE = 10;

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
    playSound('click');
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
    playSound('click');
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
    playSound('click');
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

let touchStartX = 0;
let touchEndX = 0;

function handleZoomSwipe() {
    const swipeThreshold = 50;
    if (touchEndX < touchStartX - swipeThreshold) {
        if (currentImageIndex < currentProductImages.length - 1) {
            currentImageIndex++;
            triggerHaptic('selection');
            playSound('click');
            updateGallery();
            updateZoomGalleryUI();
        }
    }
    if (touchEndX > touchStartX + swipeThreshold) {
        if (currentImageIndex > 0) {
            currentImageIndex--;
            triggerHaptic('selection');
            playSound('click');
            updateGallery();
            updateZoomGalleryUI();
        }
    }
}

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

function updateFilterSubcategories(categoryValue, selectedSub = 'all', selectedSz = 'all') {
    const subContainer = document.getElementById('filter-subcategory-container');
    const subSelect = document.getElementById('filter-subcategory-select');
    
    const sizeContainer = document.getElementById('filter-size-container');
    const sizeSelect = document.getElementById('filter-size-select');
    
    const subs = subcategoriesMap[categoryValue];
    
    if (subs && subs.length > 0) {
        subSelect.innerHTML = '<option value="all">Все подкатегории</option>';
        subs.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            subSelect.appendChild(opt);
        });
        if (selectedSub && subs.includes(selectedSub)) {
            subSelect.value = selectedSub;
        }
        subContainer.style.display = 'block';
    } else {
        subSelect.innerHTML = '';
        subContainer.style.display = 'none';
    }

    if (categoryValue === "Одежда" || categoryValue === "Обувь") {
        sizeSelect.innerHTML = '<option value="all">Все размеры</option>';
        let targetSizes = (categoryValue === "Одежда") ? clothingSizes : shoeSizes;
        
        targetSizes.forEach(sz => {
            const opt = document.createElement('option');
            opt.value = sz;
            opt.textContent = sz;
            sizeSelect.appendChild(opt);
        });

        if (selectedSz && targetSizes.includes(selectedSz)) {
            sizeSelect.value = selectedSz;
        }
        sizeContainer.style.display = 'block';
    } else {
        sizeSelect.innerHTML = '';
        sizeContainer.style.display = 'none';
    }
}

// === ОПТИМИЗИРОВАННАЯ ЗАГРУЗКА И ПАГИНАЦИЯ ТОВАРОВ ===
function fetchProductsPage(isInitial = false) {
    if (isLoadingProducts || (!hasMoreProducts && !isInitial)) return;
    isLoadingProducts = true;

    if (isInitial) {
        products = [];
        lastVisibleProductDoc = null;
        hasMoreProducts = true;
    }

    let query = db.collection("products")
                  .orderBy("createdAt", "desc")
                  .limit(PAGE_SIZE);

    if (lastVisibleProductDoc && !isInitial) {
        query = query.startAfter(lastVisibleProductDoc);
    }

    query.get().then((snapshot) => {
        if (snapshot.empty) {
            hasMoreProducts = false;
            isLoadingProducts = false;
            if (isInitial) filterAndRender();
            hideLoader();
            return;
        }

        lastVisibleProductDoc = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.docs.length < PAGE_SIZE) {
            hasMoreProducts = false;
        }

        const newItems = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            newItems.push({
                id: doc.id,
                ...data,
                images: (data.images && data.images.length > 0) ? data.images : ['https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300']
            });
        });

        if (isInitial) {
            products = newItems;
        } else {
            newItems.forEach(item => {
                if (!products.some(p => p.id === item.id)) {
                    products.push(item);
                }
            });
        }

        isLoadingProducts = false;
        filterAndRender();
        renderProfile();
        renderMyProductsTab();
        
        if (window.currentOpenedSellerTg) {
            renderPublicProfileProducts(window.currentOpenedSellerTg);
        }

        hideLoader();
    }).catch((err) => {
        console.error("Ошибка загрузки пагинации:", err);
        isLoadingProducts = false;
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

function listenFirebaseViews() {
    db.collection("productViews")
      .onSnapshot((snapshot) => {
          allProductViews = [];
          snapshot.forEach((doc) => {
              allProductViews.push({ id: doc.id, ...doc.data() });
          });
      }, (err) => {
          console.error("Ошибка Firebase (просмотры):", err);
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
        const existingView = allProductViews.find(v => v.productId === productId && v.viewerUsername === currentUser.username);
        if (existingView) return;

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
                      playSound('coin');
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
        localStorage.setItem('search_history', JSON.stringify(searchHistory));
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

        const activeNav = document.querySelector('.nav-item.active');
        const addBtn = document.getElementById('open-modal-btn');
        if (activeNav && addBtn) {
            if (activeNav.dataset.tab === 'tab-my-ads') {
                addBtn.classList.add('hidden');
            }
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
            currentUser.coins = data.coins !== undefined ? data.coins : 100;
            currentUser.lastDailyBonus = data.lastDailyBonus || null;
            
            if (data.bio) currentUser.bio = data.bio;
            if (data.customAvatar) currentUser.customAvatar = data.customAvatar;
            if (data.photoUrl && !currentUser.photoUrl) currentUser.photoUrl = data.photoUrl;
            if (data.favorites) favorites = data.favorites;
            
            saveToStorage();
            renderProfile();
            filterAndRender();
        } else {
            const user = tg?.initDataUnsafe?.user;
            let tgPhoto = user?.photo_url || '';
            currentUser.photoUrl = tgPhoto;
            currentUser.coins = 100;

            await userDocRef.set({
                name: currentUser.name,
                username: currentUser.username,
                isVerified: false,
                phone: '',
                bio: '',
                customAvatar: '',
                photoUrl: tgPhoto,
                favorites: favorites,
                coins: 100,
                lastDailyBonus: null
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
        customAvatar: '',
        coins: 100,
        lastDailyBonus: null
    };
    favorites = JSON.parse(localStorage.getItem(`favs_${cleanUsername}`)) || [];
    triggerHaptic('success');
    playSound('coin');
    saveToStorage();
    checkAuth();
}

function logoutUser() {
    triggerHaptic('warning');
    playSound('error');
    currentUser = null;
    favorites = []; 
    saveToStorage();
    checkAuth();
}

// === ЕЖЕДНЕВНЫЙ БОНУС ВАЛЮТЫ ===
window.claimDailyBonus = async function() {
    if (!currentUser) return;

    const now = new Date();
    const todayStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

    if (currentUser.lastDailyBonus === todayStr) {
        triggerHaptic('error');
        alert('Вы уже забирали сегодняшний бонус! Приходите завтра 🎁');
        return;
    }

    const reward = 25;
    currentUser.coins = (currentUser.coins || 0) + reward;
    currentUser.lastDailyBonus = todayStr;

    triggerHaptic('success');
    saveToStorage();
    renderProfile();

    try {
        await db.collection("users").doc(currentUser.username.toLowerCase()).update({
            coins: currentUser.coins,
            lastDailyBonus: todayStr
        });
        alert(`🎉 Вы получили ежедневный бонус: +${reward} Маркет-Коинов!`);
    } catch (e) {
        console.error("Ошибка начисления бонуса:", e);
    }
};

async function completeVerification(phone) {
    if (!currentUser) return;

    currentUser.isVerified = true;
    currentUser.phone = phone;
    triggerHaptic('success');
    playSound('coin');
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
            <img class="product-image" src="${mainImage}" alt="${item.title}" loading="lazy">
            <div class="product-title">${item.title}</div>
            <div class="product-city">${item.city || 'Минск'}</div>
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
    document.getElementById('view-city').textContent = product.city || 'Минск';
    document.getElementById('view-seller').textContent = product.seller || 'Продавец';
    
    const sellerAvatarContainer = document.querySelector('.seller-card .seller-avatar');
    if (sellerAvatarContainer) {
        sellerAvatarContainer.innerHTML = '👤';
    }

    let rawTg = product.telegram ? String(product.telegram).trim() : '';
    if (rawTg.includes('t.me/')) {
        rawTg = rawTg.split('t.me/')[1].split('/')[0];
    }
    let cleanTg = rawTg.replace('@', '').trim();

    if (cleanTg && sellerAvatarContainer) {
        db.collection("users").doc(cleanTg.toLowerCase()).get().then(doc => {
            if (doc.exists) {
                const sData = doc.data();
                if (sData.customAvatar) {
                    sellerAvatarContainer.innerHTML = `<img src="${sData.customAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                } else if (sData.photoUrl) {
                    sellerAvatarContainer.innerHTML = `<img src="${sData.photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                }
            }
        }).catch(e => console.error("Ошибка загрузки аватарки продавца:", e));
    }

    let totalLikes = 0;
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith('favs_')) {
            try {
                let favsList = JSON.parse(localStorage.getItem(key)) || [];
                if (favsList.includes(product.id)) totalLikes++;
            } catch(e) {}
        }
    }
    if (favorites.includes(product.id) && totalLikes === 0) totalLikes = 1;

    let totalViews = allProductViews.filter(v => v.productId === product.id).length;

    let existingLikesInfo = document.getElementById('view-likes-info');
    if (!existingLikesInfo) {
        existingLikesInfo = document.createElement('div');
        existingLikesInfo.id = 'view-likes-info';
        existingLikesInfo.style.fontSize = '12px';
        existingLikesInfo.style.color = 'var(--text-muted)';
        existingLikesInfo.style.marginBottom = '8px';
        document.getElementById('view-title').insertAdjacentElement('beforebegin', existingLikesInfo);
    }
    existingLikesInfo.innerHTML = `❤️ В избранном: ${totalLikes} чел. &nbsp;&nbsp;|&nbsp;&nbsp; 👁️ Просмотров: ${totalViews}`;

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
    playSound('click');
    setupViewModalCommon(product);
};

window.openViewModal = function(id) {
    triggerHaptic('light');
    playSound('click');
    const product = products.find(p => p.id === id);
    if (!product) return;
    logProductView(id);
    setupViewModalCommon(product);
}

function closeViewModal() {
    triggerHaptic('light');
    playSound('click');
    document.getElementById('view-modal').classList.add('hidden');
    if (tg?.MainButton) {
        tg.MainButton.hide();
    }
}

window.openActiveSellerProfile = function() {
    triggerHaptic('light');
    playSound('click');
    
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
                        if (data.customAvatar) {
                            pubAvEl.innerHTML = `<img src="${data.customAvatar}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;">`;
                        } else if (data.photoUrl) {
                            pubAvEl.innerHTML = `<img src="${data.photoUrl}" alt="Avatar" style="width:100%; height:100%; object-fit:cover;">`;
                        } else {
                            pubAvEl.innerHTML = '👤';
                        }
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
        
        let itemLikes = 0;
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('favs_')) {
                try {
                    let favsList = JSON.parse(localStorage.getItem(key)) || [];
                    if (favsList.includes(item.id)) itemLikes++;
                } catch(e) {}
            }
        }
        let itemViews = allProductViews.filter(v => v.productId === item.id).length;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => openViewModal(item.id);

        card.innerHTML = `
            <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
            <button class="delete-btn" onclick="deleteProduct(event, '${item.id}')">✕</button>
            <img class="product-image" src="${mainImage}" alt="${item.title}" loading="lazy">
            <div class="product-title">${item.title}</div>
            <div class="product-city">${item.city || 'Минск'}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin: 0 8px 10px 8px;">
                <div class="product-price" style="margin: 0;">${item.price}</div>
                <div style="font-size: 11px; color: var(--text-muted);">❤️ ${itemLikes} &nbsp; 👁️ ${itemViews}</div>
            </div>
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

    // ДИНАМИЧЕСКАЯ ГЕРАЦИЯ ВИДЖЕТА БОНУСА (ГАРАНТИРОВАННОЕ ПОЯВЛЕНИЕ)
    let coinsWidget = document.getElementById('coins-widget-container');
    if (!coinsWidget) {
        coinsWidget = document.createElement('div');
        coinsWidget.id = 'coins-widget-container';
        coinsWidget.className = 'user-coins-card';
        tgEl.insertAdjacentElement('afterend', coinsWidget);
    }

    const now = new Date();
    const todayStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    const isBonusClaimed = currentUser.lastDailyBonus === todayStr;

    coinsWidget.innerHTML = `
        <div class="coins-balance-box">
            <span>Баланс:</span>
            <span id="user-coins-count" class="coins-val">💎 ${currentUser.coins || 0}</span>
        </div>
        <button id="daily-bonus-btn" class="daily-bonus-btn" onclick="claimDailyBonus()" ${isBonusClaimed ? 'disabled style="opacity:0.5;"' : ''}>
            ${isBonusClaimed ? '🎁 Завтра +25 💎' : '🎁 Бонус +25 💎'}
        </button>
    `;

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
                    <img class="product-image" src="${mainImage}" alt="${item.title}" loading="lazy">
                    <div class="product-title">${item.title}</div>
                    <div class="product-city">${item.city || 'Минск'}</div>
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
            <img class="product-image" src="${mainImage}" alt="${item.title}" loading="lazy">
            <div class="product-title">${item.title}</div>
            <div class="product-city">${item.city || 'Минск'}</div>
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
    playSound('click');
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
                    playSound('click');
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
        playSound('error');
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
        products = products.filter(p => p.id !== pendingDeleteId);
        triggerHaptic('warning');
        playSound('click');
        saveToStorage();
        filterAndRender();
        renderProfile();
        renderMyProductsTab();
    } catch (err) {
        console.error("Ошибка удаления:", err);
    }

    pendingDeleteId = null;
};

window.handleTelegramClick = function(event, rawTg, productTitle, productPrice) {
    if (event) event.preventDefault();
    if (!rawTg) return;

    triggerHaptic('light');
    playSound('click');
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
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (dotsContainer) dotsContainer.style.display = 'none';
    } else {
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (dotsContainer) dotsContainer.style.display = 'flex';

        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            currentProductImages.forEach((_, idx) => {
                const dot = document.createElement('div');
                dot.className = `dot ${idx === currentImageIndex ? 'active' : ''}`;
                dotsContainer.appendChild(dot);
            });
        }
    }
}

function openEditModal() {
    triggerHaptic('light');
    playSound('click');
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

    const citySelect = document.getElementById('city-select');
    const customCityInput = document.getElementById('custom-city-input');
    
    if (standardCities.includes(product.city)) {
        citySelect.value = product.city;
        customCityInput.classList.add('hidden');
        customCityInput.value = '';
    } else {
        citySelect.value = 'custom';
        customCityInput.classList.remove('hidden');
        customCityInput.value = product.city || '';
    }

    document.getElementById('seller-input').value = product.seller || '';
    document.getElementById('telegram-input').value = product.telegram || '';
    document.getElementById('desc-input').value = product.description || '';

    document.getElementById('modal').classList.remove('hidden');
}

function openAddModal() {
    triggerHaptic('light');
    playSound('click');
    editingProductId = null;

    document.getElementById('modal-title').textContent = 'Добавить объявление';
    document.getElementById('save-btn').textContent = 'Опубликовать';

    document.getElementById('title-input').value = '';
    document.getElementById('price-input').value = '';
    document.getElementById('currency-select').value = 'BYN';
    
    document.getElementById('category-select').value = 'Другое';
    updateSubcategories('Другое'); 

    const citySelect = document.getElementById('city-select');
    const customCityInput = document.getElementById('custom-city-input');
    citySelect.value = 'Минск';
    customCityInput.classList.add('hidden');
    customCityInput.value = '';
    
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

function renderSearchTags() {
    const container = document.getElementById('search-tags-container');
    if (!container) return;
    container.innerHTML = '';

    if (searchHistory.length === 0) return;

    searchHistory.slice(-5).reverse().forEach(term => {
        const tag = document.createElement('button');
        tag.className = 'search-tag-chip';
        tag.textContent = term;
        tag.onclick = () => {
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = term;
                filterAndRender();
                dismissKeyboard();
            }
        };
        container.appendChild(tag);
    });
}

function addSearchHistory(query) {
    if (!query || query.length < 2) return;
    if (!searchHistory.includes(query)) {
        searchHistory.push(query);
        if (searchHistory.length > 10) searchHistory.shift();
        saveToStorage();
        renderSearchTags();
    }
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

        let matchesFilterCat = true;
        if (currentFilters.category !== 'all') {
            matchesFilterCat = product.category === currentFilters.category;
        }

        let matchesFilterSubcat = true;
        if (currentFilters.subcategory !== 'all') {
            matchesFilterSubcat = product.subcategory === currentFilters.subcategory;
        }

        let matchesFilterSize = true;
        if (currentFilters.size !== 'all' && currentFilters.size.trim() !== '') {
            let pSize = (product.size || '').toLowerCase();
            let targetSize = currentFilters.size.trim().toLowerCase();
            matchesFilterSize = pSize.includes(targetSize);
        }

        let matchesCity = true;
        if (currentFilters.city !== 'all') {
            let pCity = (product.city || 'Минск').toLowerCase();
            let filterCity = currentFilters.city.toLowerCase();
            matchesCity = pCity.includes(filterCity);
        }

        let rawPriceStr = product.price || '0';
        let rawPriceNum = parseFloat(rawPriceStr.replace(/[^\d.]/g, '')) || 0;
        let productCurrency = rawPriceStr.includes('₽') || rawPriceStr.includes('RUB') ? '₽' : 'BYN';

        let matchesCurrency = currentFilters.currency === 'all' || productCurrency === currentFilters.currency;
        let matchesPriceMin = currentFilters.priceMin === '' || rawPriceNum >= parseFloat(currentFilters.priceMin);
        let matchesPriceMax = currentFilters.priceMax === '' || rawPriceNum <= parseFloat(currentFilters.priceMax);

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

        return matchesQuery && matchesCat && matchesFilterCat && matchesFilterSubcat && matchesFilterSize && matchesCity && matchesCurrency && matchesPriceMin && matchesPriceMax && matchesRating;
    });

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
    const vipContainer = document.getElementById('vip-products-grid');
    const vipBox = document.getElementById('vip-products-container');

    if (!container) return;
    container.innerHTML = '';
    if (vipContainer) vipContainer.innerHTML = '';

    if (itemsToRender.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Ничего не найдено</div>';
        if (vipBox) vipBox.classList.add('hidden');
        return;
    }

    const vipItems = itemsToRender.filter(item => item.isVip);
    const normalItems = itemsToRender.filter(item => !item.isVip);

    if (vipItems.length > 0 && vipContainer && vipBox) {
        vipBox.classList.remove('hidden');
        vipItems.forEach(item => {
            const card = createProductCardHtml(item);
            vipContainer.appendChild(card);
        });
    } else if (vipBox) {
        vipBox.classList.add('hidden');
    }

    normalItems.forEach(item => {
        const card = createProductCardHtml(item);
        container.appendChild(card);
    });

    if (hasMoreProducts && currentCategory === 'all') {
        const spinner = document.createElement('div');
        spinner.className = 'load-more-spinner';
        spinner.textContent = 'Прокрутите вниз для загрузки других товаров...';
        container.appendChild(spinner);
    }
}

function createProductCardHtml(item) {
    const isFav = favorites.includes(item.id);
    const mainImage = item.images[0];
    const card = document.createElement('div');
    card.className = `product-card ${item.isHighlighted ? 'highlighted-card' : ''} ${item.isVip ? 'vip-card' : ''}`;
    card.onclick = () => openViewModal(item.id);

    let pTg = (item.telegram || '').replace('@', '').toLowerCase();
    let myTg = (currentUser?.username || '').toLowerCase();
    const isMyProduct = currentUser && pTg === myTg && myTg !== '';

    let badgeHtml = '';
    if (item.isVip) badgeHtml = '<div class="vip-badge">👑 VIP</div>';
    else if (item.isHighlighted) badgeHtml = '<div class="top-badge">⚡ ТОП</div>';

    card.innerHTML = `
        ${badgeHtml}
        <button class="fav-btn" onclick="toggleFavorite(event, '${item.id}')">${isFav ? '❤️' : '🤍'}</button>
        ${isMyProduct ? `<button class="delete-btn" onclick="deleteProduct(event, '${item.id}')">✕</button>` : ''}
        <img class="product-image" src="${mainImage}" alt="${item.title}" loading="lazy">
        <div class="product-title">${item.title}</div>
        <div class="product-city">${item.city || 'Минск'}</div>
        <div class="product-price">${item.price}</div>
    `;
    return card;
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

// СЛУШАТЕЛЬ БЕСКОНЕЧНОГО СКРОЛЛА (INFINITE SCROLL)
window.addEventListener('scroll', () => {
    if (currentCategory !== 'all') return;
    
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 400;

    if (scrollPosition >= threshold && !isLoadingProducts && hasMoreProducts) {
        fetchProductsPage(false);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    checkAuth();
    fetchProductsPage(true);
    listenFirebaseReviews();
    listenFirebaseViews();
    renderSearchTags();
    updateResellerUI();
    spawnResellerLot();

    setInterval(updateQuestsTimerUI, 1000);

    const buyBtn = document.getElementById('reseller-buy-btn');
    const skipBtn = document.getElementById('reseller-skip-btn');

    if (buyBtn) {
        buyBtn.onclick = () => {
            if (!currentResellerLot) return;
            
            let maxSlots = resellerState.warehouseLevel === 3 ? 20 : (resellerState.warehouseLevel === 2 ? 12 : (resellerState.warehouseLevel === 1 ? 8 : 4));
            if (resellerState.inventory.length >= maxSlots) {
                triggerHaptic('error');
                playSound('error');
                alert(`Склад заполнен! Максимум ${maxSlots} слотов. Продайте что-то со склада или улучшите склад.`);
                return;
            }

            if (resellerState.balance < currentResellerLot.buyPrice) {
                triggerHaptic('error');
                playSound('error');
                alert('Недостаточно средств на балансе!');
                return;
            }
            clearInterval(resellerTimerInterval);
            
            let isCheckTriggered = currentResellerLot.buyPrice > 100 && Math.random() < 0.35;
            
            if (isCheckTriggered) {
                let isActuallyLegit = Math.random() > 0.4;
                let userChoice = confirm(`⚠️ Внимание! Продавец подозрительный.\nПройти легит-чек (проверить на подлинность)?\n\nНажмите «OK», если считаете, что это ОРИГИНАЛ.\nНажмите «Отмена», если это ПАЛЕНКА.`);
                
                if (userChoice === isActuallyLegit) {
                    triggerHaptic('success');
                    playSound('coin');
                    alert(isActuallyLegit ? '✅ Вы угадали! Это 100% оригинал.' : '✅ Верно! Вы раскусили паленку и сэкономили деньги.');
                    if (!isActuallyLegit) {
                        currentResellerLot.buyPrice = Math.floor(currentResellerLot.buyPrice * 0.6);
                    }
                } else {
                    triggerHaptic('error');
                    playSound('error');
                    alert(isActuallyLegit ? '❌ Ошибка! Это оказался оригинал, вы упустили отличный лот.' : '❌ Ошибка! Вас обманули, это паленка! Товар потерял в стоимости.');
                    currentResellerLot.marketValue = Math.floor(currentResellerLot.buyPrice * 0.7);
                    currentResellerLot.fixedSellPrice = Math.floor(currentResellerLot.marketValue * 0.85);
                    currentResellerLot.isFake = true; 
                }
            }

            resellerState.balance -= currentResellerLot.buyPrice;
            resellerState.inventory.push(currentResellerLot);
            triggerHaptic('success');
            playSound('buy');
            saveResellerState();
            spawnResellerLot();
        };
    }

    if (skipBtn) {
        skipBtn.onclick = () => {
            clearInterval(resellerTimerInterval);
            checkDailyQuestProgress('skip_3', 1);
            triggerHaptic('light');
            playSound('click');
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
            playSound('click');
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
            playSound('click');
            pubTabAds.classList.add('active');
            pubTabReviews.classList.remove('active');
            
            pubSecAds.style.display = 'block';
            pubSecReviews.style.display = 'none';
        });

        pubTabReviews.addEventListener('click', (e) => {
            e.preventDefault();
            triggerHaptic('selection');
            playSound('click');
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
            playSound('click');
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
                playSound('error');
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
                playSound('coin');
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
            playSound('click');
            document.getElementById('verify-modal').classList.add('hidden');
        };
    }

    if (confirmTgPhoneBtn) {
        confirmTgPhoneBtn.onclick = () => {
            triggerHaptic('light');
            playSound('click');
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
                playSound('error');
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
                playSound('error');
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
            playSound('click');
            
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
            playSound('click');
            
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
            playSound('click');
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
            playSound('click');
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
            playSound('click');
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const targetTab = item.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
            document.getElementById(targetTab).classList.remove('hidden');

            const addBtn = document.getElementById('open-modal-btn');
            if (addBtn) {
                if (targetTab === 'tab-my-ads') {
                    addBtn.classList.add('hidden'); 
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
                playSound('click');
                updateGallery();
            }
        };
    }

    if (nextImgBtn) {
        nextImgBtn.onclick = () => {
            if (currentImageIndex < currentProductImages.length - 1) {
                currentImageIndex++;
                triggerHaptic('selection');
                playSound('click');
                updateGallery();
            }
        };
    }

    if (themeBtn) {
        themeBtn.onclick = () => {
            isDarkTheme = !isDarkTheme;
            triggerHaptic('light');
            playSound('click');
            applyTheme();
            saveToStorage();
        };
    }

    catBtns.forEach(btn => {
        btn.onclick = () => {
            triggerHaptic('selection');
            playSound('click');
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
    if (closeBtn) closeBtn.onclick = () => { triggerHaptic('light'); playSound('click'); modal.classList.add('hidden'); };
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
                playSound('error');
                alert('Введите название товара!');
                return;
            }

            let rawPrice = priceInput.value.trim() || '0';
            let finalPrice = `${rawPrice} ${currencySelect.value}`;

            triggerHaptic('success');
            playSound('coin');
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
                    fetchProductsPage(true);
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

// === СИМУЛЯТОР РЕСЕЛЛЕРА ===
let resellerState = JSON.parse(localStorage.getItem('reseller_state')) || {
    balance: 500,
    dealsCount: 0,
    inventory: [],
    warehouseLevel: 0,
    hagglingCounter: 0,
    dailyQuests: {
        lastResetTime: getTodayMidnightTimestamp(),
        progress: { sell_2: 0, clean_1: 0, skip_3: 0 },
        claimed: []
    }
};

if (resellerState.warehouseLevel === undefined) resellerState.warehouseLevel = 0;
if (resellerState.hagglingCounter === undefined) resellerState.hagglingCounter = 0;
if (!resellerState.dailyQuests) {
    resellerState.dailyQuests = {
        lastResetTime: getTodayMidnightTimestamp(),
        progress: { sell_2: 0, clean_1: 0, skip_3: 0 },
        claimed: []
    };
}

let currentResellerLot = null;
let resellerTimerInterval = null;

function saveResellerState() {
    localStorage.setItem('reseller_state', JSON.stringify(resellerState));
    updateResellerUI();
}

function getTodayMidnightTimestamp() {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
}

function checkAndResetDailyQuests() {
    const currentMidnight = getTodayMidnightTimestamp();
    if (resellerState.dailyQuests.lastResetTime < currentMidnight) {
        resellerState.dailyQuests = {
            lastResetTime: currentMidnight,
            progress: { sell_2: 0, clean_1: 0, skip_3: 0 },
            claimed: []
        };
        saveResellerState();
    }
}

function checkDailyQuestProgress(questKey, amount = 1) {
    checkAndResetDailyQuests();
    if (!resellerState.dailyQuests.claimed.includes(questKey)) {
        resellerState.dailyQuests.progress[questKey] = (resellerState.dailyQuests.progress[questKey] || 0) + amount;
        saveResellerState();
    }
}

function updateQuestsTimerUI() {
    checkAndResetDailyQuests();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const currentMidnight = getTodayMidnightTimestamp();
    const nextMidnight = currentMidnight + twentyFourHours;
    
    let timeLeft = nextMidnight - now;
    if (timeLeft < 0) timeLeft = 0;

    let hours = Math.floor(timeLeft / (1000 * 60 * 60));
    let minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    let timerEl = document.getElementById('quests-timer-text');
    if (timerEl) {
        timerEl.textContent = `Обновление: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

function updateResellerUI() {
    const balEl = document.getElementById('reseller-balance');
    const dealsEl = document.getElementById('reseller-deals-count');
    if (balEl) balEl.textContent = `${resellerState.balance} BYN`;
    if (dealsEl) dealsEl.textContent = resellerState.dealsCount;

    renderWarehouseBar();
    renderAchievementsWidget();
    renderResellerInventory();
}

function renderWarehouseBar() {
    let barContainer = document.getElementById('warehouse-upgrade-widget');
    if (!barContainer) {
        const headerEl = document.querySelector('.reseller-header');
        if (headerEl) {
            barContainer = document.createElement('div');
            barContainer.id = 'warehouse-upgrade-widget';
            headerEl.insertAdjacentElement('afterend', barContainer);
        }
    }

    if (!barContainer) return;

    let maxSlots = resellerState.warehouseLevel === 3 ? 20 : (resellerState.warehouseLevel === 2 ? 12 : (resellerState.warehouseLevel === 1 ? 8 : 4));
    let title = resellerState.warehouseLevel === 3 ? '🏬 Мега-молл' : (resellerState.warehouseLevel === 2 ? '🏛️ Бутик' : (resellerState.warehouseLevel === 1 ? '🏢 Шоурум' : '🏠 Гараж'));
    let nextCost = resellerState.warehouseLevel === 0 ? 1000 : (resellerState.warehouseLevel === 1 ? 3000 : (resellerState.warehouseLevel === 2 ? 7500 : 0));

    let upgradeBtnHtml = resellerState.warehouseLevel < 3 ? 
        `<button class="warehouse-upgrade-btn" onclick="upgradeWarehouse(${nextCost})">Улучшить за ${nextCost} BYN</button>` : 
        `<span style="font-size:12px; color:#34c759; font-weight:800; background:rgba(52,199,89,0.12); padding:6px 10px; border-radius:8px;">✓ Максимум</span>`;

    barContainer.className = 'warehouse-upgrade-bar';
    barContainer.innerHTML = `
        <div>
            <div class="warehouse-info-title">${title} (${resellerState.inventory.length}/${maxSlots} мест)</div>
            <div class="warehouse-info-subtitle">${resellerState.warehouseLevel === 0 ? 'След: Шоурум (8 мест)' : (resellerState.warehouseLevel === 1 ? 'След: Бутик (12 мест)' : (resellerState.warehouseLevel === 2 ? 'След: Мега-молл (20 мест)' : 'Высший уровень склада'))}</div>
        </div>
        ${upgradeBtnHtml}
    `;
}

window.upgradeWarehouse = function(cost) {
    if (resellerState.balance < cost) {
        triggerHaptic('error');
        playSound('error');
        alert('Недостаточно средств для улучшения склада!');
        return;
    }
    resellerState.balance -= cost;
    resellerState.warehouseLevel++;
    triggerHaptic('success');
    playSound('coin');
    saveResellerState();
    alert('Поздравляем! Склад успешно улучшен!');
};

function renderAchievementsWidget() {
    let achContainer = document.getElementById('achievements-widget');
    if (!achContainer) {
        const warehouseWidget = document.getElementById('warehouse-upgrade-widget');
        if (warehouseWidget) {
            achContainer = document.createElement('div');
            achContainer.id = 'achievements-widget';
            achContainer.style.margin = '12px 0';
            warehouseWidget.insertAdjacentElement('afterend', achContainer);
        }
    }

    if (!achContainer) return;
    checkAndResetDailyQuests();

    const dailyQuestsList = [
        { id: 'sell_2', title: 'Быстрый старт', desc: 'Продайте 2 любых товара', target: 2, reward: 150 },
        { id: 'clean_1', title: 'Мастер чистоты', desc: 'Сделайте 1 химчистку товара', target: 1, reward: 100 },
        { id: 'skip_3', title: 'Переборщик', desc: 'Пропустите 3 невыгодных лота', target: 3, reward: 75 }
    ];

    let html = `
        <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="font-weight: 700; font-size: 14px;">🏆 Ежедневные квесты</div>
                <div id="quests-timer-text" style="font-size: 11px; font-weight: 600; color: #ff9500; background: rgba(255,149,0,0.1); padding: 3px 8px; border-radius: 6px;">Обновление: 24:00:00</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    dailyQuestsList.forEach(q => {
        let currentProgress = resellerState.dailyQuests.progress[q.id] || 0;
        let isCompleted = currentProgress >= q.target;
        let isClaimed = resellerState.dailyQuests.claimed.includes(q.id);

        let statusBtn = '';
        if (isClaimed) {
            statusBtn = `<span style="font-size: 11px; color: #34c759; font-weight: 700;">Получено ✓</span>`;
        } else if (isCompleted) {
            statusBtn = `<button style="background:#34c759; color:white; border:none; padding:5px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;" onclick="claimDailyQuest('${q.id}', ${q.reward})">Забрать +${q.reward} BYN</button>`;
        } else {
            statusBtn = `<span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${currentProgress}/${q.target}</span>`;
        }

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--btn-secondary-bg); padding: 8px 12px; border-radius: 10px;">
                <div>
                    <div style="font-size: 13px; font-weight: 700;">${q.title}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${q.desc}</div>
                </div>
                <div>${statusBtn}</div>
            </div>
        `;
    });

    html += `</div></div>`;
    achContainer.innerHTML = html;
}

window.claimDailyQuest = function(questId, rewardAmount) {
    if (resellerState.dailyQuests.claimed.includes(questId)) return;

    resellerState.dailyQuests.claimed.push(questId);
    resellerState.balance += rewardAmount;
    triggerHaptic('success');
    playSound('coin');
    saveResellerState();
    alert(`🎉 Награда получена! +${rewardAmount} BYN зачислено на баланс.`);
};

function spawnResellerLot() {
    const cardArea = document.getElementById('reseller-game-area');
    if (!cardArea) return;

    if (resellerState.balance <= 0 && resellerState.inventory.length === 0) {
        cardArea.innerHTML = `<div style="text-align: center; padding: 40px; color: #ff3b30; font-weight: 700;">Вы банкрот! Баланс 0 BYN. <br><button class="btn-primary" onclick="resetResellerGame()" style="margin-top:10px;">Начать заново</button></div>`;
        return;
    }

    if (!products || products.length === 0) {
        cardArea.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">Загрузка товаров для симулятора...</div>`;
        setTimeout(spawnResellerLot, 2000);
        return;
    }

    const randomProduct = products[Math.floor(Math.random() * products.length)];
    
    let rawPriceNum = parseFloat((randomProduct.price || '100').replace(/[^\d.]/g, '')) || 150;
    const buyPrice = Math.max(30, Math.floor(rawPriceNum * (Math.random() * 0.4 + 0.5)));
    const marketMultiplier = (Math.random() * 0.6 + 0.8);
    const marketValue = Math.max(40, Math.floor(buyPrice * marketMultiplier));

    currentResellerLot = {
        id: randomProduct.id,
        title: randomProduct.title,
        img: randomProduct.images ? randomProduct.images[0] : 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=300',
        desc: randomProduct.description || 'Реальный товар с маркетплейса.',
        buyPrice: buyPrice,
        marketValue: marketValue,
        fixedSellPrice: Math.floor(marketValue * (Math.random() * 0.2 + 0.9)),
        isFake: false,
        isCleaned: false
    };

    if (!document.getElementById('reseller-lot-img')) {
        cardArea.innerHTML = `
            <div id="reseller-lot-card" class="reseller-card">
                <div id="reseller-timer-bar" class="reseller-timer-bar"></div>
                <img id="reseller-lot-img" class="reseller-img" src="" alt="Лот">
                <div id="reseller-lot-title" class="reseller-title">Загрузка лота...</div>
                <div id="reseller-lot-desc" class="reseller-desc">Описание продавца...</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <div style="font-size: 11px; color: var(--text-muted);">Цена выкупа:</div>
                        <div id="reseller-lot-price" class="reseller-price">0 BYN</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: var(--text-muted);">Оценка рынка:</div>
                        <div id="reseller-lot-market" style="font-size: 14px; font-weight: 700; color: #34c759;">~0 BYN</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="reseller-skip-btn" class="reseller-btn-skip">Пропустить</button>
                    <button id="reseller-buy-btn" class="reseller-btn-buy">Купить лот</button>
                </div>
            </div>`;
        
        document.getElementById('reseller-buy-btn').onclick = () => {
            if (!currentResellerLot) return;

            let maxSlots = resellerState.warehouseLevel === 3 ? 20 : (resellerState.warehouseLevel === 2 ? 12 : (resellerState.warehouseLevel === 1 ? 8 : 4));
            if (resellerState.inventory.length >= maxSlots) {
                triggerHaptic('error');
                playSound('error');
                alert(`Склад заполнен! Максимум ${maxSlots} слотов. Продайте что-то со склада или улучшите склад.`);
                return;
            }

            if (resellerState.balance < currentResellerLot.buyPrice) {
                triggerHaptic('error');
                playSound('error');
                alert('Недостаточно средств на балансе!');
                return;
            }
            clearInterval(resellerTimerInterval);
            
            let isCheckTriggered = currentResellerLot.buyPrice > 100 && Math.random() < 0.35;
            
            if (isCheckTriggered) {
                let isActuallyLegit = Math.random() > 0.4;
                let userChoice = confirm(`⚠️ Внимание! Продавец подозрительный.\nПройти легит-чек (проверить на подлинность)?\n\nНажмите «OK», если считаете, что это ОРИГИНАЛ.\nНажмите «Отмена», если это ПАЛЕНКА.`);
                
                if (userChoice === isActuallyLegit) {
                    triggerHaptic('success');
                    playSound('coin');
                    alert(isActuallyLegit ? '✅ Вы угадали! Это 100% оригинал.' : '✅ Верно! Вы раскусили паленку и сэкономили деньги.');
                    if (!isActuallyLegit) {
                        currentResellerLot.buyPrice = Math.floor(currentResellerLot.buyPrice * 0.6);
                    }
                } else {
                    triggerHaptic('error');
                    playSound('error');
                    alert(isActuallyLegit ? '❌ Ошибка! Это оказался оригинал, вы упустили отличный лот.' : '❌ Ошибка! Вас обманули, это паленка! Товар потерял в стоимости.');
                    currentResellerLot.marketValue = Math.floor(currentResellerLot.buyPrice * 0.7);
                    currentResellerLot.fixedSellPrice = Math.floor(currentResellerLot.marketValue * 0.85);
                    currentResellerLot.isFake = true; 
                }
            }

            resellerState.balance -= currentResellerLot.buyPrice;
            resellerState.inventory.push(currentResellerLot);
            triggerHaptic('success');
            playSound('buy');
            saveResellerState();
            spawnResellerLot();
        };

        document.getElementById('reseller-skip-btn').onclick = () => {
            clearInterval(resellerTimerInterval);
            checkDailyQuestProgress('skip_3', 1);
            triggerHaptic('light');
            playSound('click');
            spawnResellerLot();
        };
    }

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

    startResellerTimer(12);
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
    resellerState = { 
        balance: 500, 
        dealsCount: 0, 
        inventory: [], 
        warehouseLevel: 0, 
        hagglingCounter: 0,
        dailyQuests: { lastResetTime: getTodayMidnightTimestamp(), progress: { sell_2: 0, clean_1: 0, skip_3: 0 }, claimed: [] } 
    };
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
        
        let sellOffer = item.fixedSellPrice;
        let profit = sellOffer - item.buyPrice;

        let fakeBadgeHtml = item.isFake ? `<div class="fake-badge">⚠️ ПАЛЕНКА</div>` : '';
        let cleanBadgeHtml = item.isCleaned ? `<div class="clean-badge">✨ РЕМОНТ</div>` : '';
        
        let cleanCost = Math.max(15, Math.floor(item.buyPrice * 0.2));
        let cleanBtnHtml = (!item.isCleaned && !item.isFake) ? 
            `<button class="reseller-btn-clean" onclick="cleanResellerItem(${index}, ${cleanCost})">🧼 Химчистка (-${cleanCost} BYN)</button>` : '';

        div.innerHTML = `
            ${fakeBadgeHtml}
            ${cleanBadgeHtml}
            <img class="reseller-item-img" src="${item.img}" alt="${item.title}" loading="lazy">
            <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Покупка: ${item.buyPrice} BYN</div>
            ${cleanBtnHtml}
            <button class="reseller-btn-sell" onclick="trySellWithHaggling(${index}, ${sellOffer})">
                Продать за ${sellOffer} BYN<br>
                <span style="font-size: 11px; color: ${profit >= 0 ? '#d4edda' : '#f8d7da'}; font-weight: 600;">(${profit >= 0 ? '+' : ''}${profit} BYN)</span>
            </button>
        `;
        container.appendChild(div);
    });
}

window.cleanResellerItem = function(index, cost) {
    if (resellerState.balance < cost) {
        triggerHaptic('error');
        playSound('error');
        alert('Недостаточно средств для химчистки!');
        return;
    }

    resellerState.balance -= cost;
    let item = resellerState.inventory[index];
    item.isCleaned = true;
    item.buyPrice += cost; 
    item.fixedSellPrice = Math.floor(item.fixedSellPrice * 1.35); 
    
    checkDailyQuestProgress('clean_1', 1);

    triggerHaptic('success');
    playSound('coin');
    saveResellerState();
    renderResellerInventory();
};

window.trySellWithHaggling = function(index, baseSellPrice) {
    let item = resellerState.inventory[index];
    
    if (resellerState.hagglingCounter === undefined) {
        resellerState.hagglingCounter = 0;
    }

    resellerState.hagglingCounter++;

    if (resellerState.hagglingCounter >= 5) {
        resellerState.hagglingCounter = 0;
        
        let isPlusHaggle = Math.random() < 0.5;

        if (isPlusHaggle) {
            let bonusPercent = Math.random() * 0.15 + 0.10;
            let hagglePrice = Math.floor(baseSellPrice * (1 + bonusPercent));
            let diff = hagglePrice - baseSellPrice;

            let hagglingPrompt = confirm(`💬 Покупатель пишет в чат:\n«Слушай, очень срочно нужна вещь "${item.title}"! Готов забрать прямо сейчас и накинуть сверху +${diff} BYN, итого за ${hagglePrice} BYN?»\n\nНажмите «OK», чтобы согласиться на выгодную сделку.\nНажмите «Отмена», чтобы продать по своей цене.`);

            if (hagglingPrompt) {
                executeSale(index, hagglePrice, true, true);
            } else {
                executeSale(index, baseSellPrice, false, false);
            }
        } else {
            let discountPercent = Math.random() * 0.10 + 0.10; 
            let hagglePrice = Math.floor(baseSellPrice * (1 - discountPercent));
            let diff = baseSellPrice - hagglePrice;

            let hagglingPrompt = confirm(`💬 Покупатель пишет в чат:\n«Привет! Готов забрать "${item.title}" прямо сейчас за ${hagglePrice} BYN (-${diff} BYN скидка)?»\n\nНажмите «OK», чтобы согласиться на быструю сделку со скидкой.\nНажмите «Отмена», чтобы отказаться.`);

            if (hagglingPrompt) {
                executeSale(index, hagglePrice, true, false);
            } else {
                triggerHaptic('warning');
                playSound('error');
                alert('Покупатель отказался от вашей цены и ушел. Попробуйте продать товар позже!');
            }
        }
    } else {
        executeSale(index, baseSellPrice, false, false);
    }
};

function executeSale(index, sellPrice, wasHaggled, isPlus) {
    clearInterval(resellerTimerInterval);
    const item = resellerState.inventory.splice(index, 1)[0];
    resellerState.balance += sellPrice;
    resellerState.dealsCount++;
    
    checkDailyQuestProgress('sell_2', 1);

    triggerHaptic('success');
    playSound('coin');
    saveResellerState();
    renderResellerInventory();
    spawnResellerLot();

    if (wasHaggled) {
        if (isPlus) {
            alert(`🔥 Успешный торг! Покупатель переплатил сверху: +${sellPrice} BYN!`);
        } else {
            alert(`🤝 Сделка закрыта по цене с уступкой: +${sellPrice} BYN!`);
        }
    } else {
        alert(`🎉 Товар успешно продан за ${sellPrice} BYN!`);
    }
}
