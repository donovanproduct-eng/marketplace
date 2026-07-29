// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
}

// Конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBTDdD5W7ChKm65iygEK-7pt0MNiDLhGro",
  authDomain: "tg-marketplace-3e644.firebaseapp.com",
  projectId: "tg-marketplace-3e644",
  storageBucket: "tg-marketplace-3e644.firebasestorage.app",
  messagingSenderId: "1013734928041",
  appId: "1:1013734928041:web:0ce6564b08a43804f043b8",
  measurementId: "G-375574T1G0"
};

// Инициализация Firebase & Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    if (tabName === 'home') {
        document.getElementById('tab-home').classList.add('active');
        event.currentTarget.classList.add('active');
    } else if (tabName === 'create') {
        document.getElementById('tab-create').classList.add('active');
        event.currentTarget.classList.add('active');
    }
}

// Загрузка товаров из Firestore в реальном времени
function listenProducts() {
    const listContainer = document.getElementById('products-list');

    db.collection("products")
      .orderBy("createdAt", "desc")
      .onSnapshot((snapshot) => {
          listContainer.innerHTML = "";

          if (snapshot.empty) {
              listContainer.innerHTML = "<p class='empty-text'>Пока нет объявлений. Будьте первым!</p>";
              return;
          }

          snapshot.forEach((doc) => {
              const item = doc.data();
              const userUsername = tg?.initDataUnsafe?.user?.username || 'telegram_user';

              const card = document.createElement('div');
              card.className = 'product-card';
              card.innerHTML = `
                  <img src="${item.image}" alt="${item.title}" class="product-img" onerror="this.src='https://via.placeholder.com/300x200?text=Нет+фото'">
                  <div class="product-info">
                      <span class="product-category">${item.category}</span>
                      <h3 class="product-title">${item.title}</h3>
                      <p class="product-price">${item.price}</p>
                      <p class="product-desc">${item.description}</p>
                      <a href="https://t.me/${item.sellerTelegram || userUsername}" target="_blank" class="btn btn-contact">
                          💬 Написать продавцу
                      </a>
                  </div>
              `;
              listContainer.appendChild(card);
          });
      }, (error) => {
          console.error("Ошибка Firebase:", error);
          listContainer.innerHTML = "<p class='error-text'>Ошибка загрузки. Проверьте режим Firestore (Test Mode).</p>";
      });
}

// Отправка товара в Firestore
document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Публикация...';

    const user = tg?.initDataUnsafe?.user;

    const newProduct = {
        title: document.getElementById('p-title').value,
        price: document.getElementById('p-price').value,
        category: document.getElementById('p-category').value,
        description: document.getElementById('p-desc').value,
        image: document.getElementById('p-image').value,
        sellerTelegram: user?.username || 'admin',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection("products").add(newProduct);
        alert("Объявление создано!");
        document.getElementById('add-product-form').reset();
        switchTab('home');
    } catch (err) {
        console.error("Ошибка при сохранении:", err);
        alert("Не удалось сохранить. Проверьте Firestore Test Mode!");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Опубликовать';
    }
});

// Старт
document.addEventListener('DOMContentLoaded', () => {
    listenProducts();
});
