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

// Инициализируем Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ЧЕТКОЕ ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
function switchTab(tabName) {
    const homeTab = document.getElementById('tab-home');
    const createTab = document.getElementById('tab-create');
    const btnHome = document.getElementById('btn-home');
    const btnCreate = document.getElementById('btn-create');

    if (tabName === 'home') {
        homeTab.classList.add('active');
        createTab.classList.remove('active');
        
        if(btnHome) btnHome.classList.add('active');
        if(btnCreate) btnCreate.classList.remove('active');
    } else if (tabName === 'create') {
        createTab.classList.add('active');
        homeTab.classList.remove('active');

        if(btnCreate) btnCreate.classList.add('active');
        if(btnHome) btnHome.classList.remove('active');
    }
}

// Загрузка товаров из базы
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
          listContainer.innerHTML = "<p class='error-text'>Ошибка загрузки базы данных.</p>";
      });
}

// Отправка нового товара
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
        switchTab('home'); // Переключаем на главную после создания
    } catch (err) {
        console.error("Ошибка при сохранении:", err);
        alert("Не удалось сохранить.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Опубликовать';
    }
});

// Запуск при старте
document.addEventListener('DOMContentLoaded', () => {
    switchTab('home'); // Принудительно открываем Главную
    listenProducts();
});
