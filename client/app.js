// Конфигурация API
const API_CONFIG = {
    AUTH_SERVICE: 'http://localhost:8000',
    EVENT_SERVICE: 'http://localhost:8001',
    NOTIFICATION_SERVICE: 'http://localhost:8002'
};

// Состояние приложения
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let currentEventsPage = 1;
let eventsPerPage = 6;
let currentEvents = [];
let notificationCheckInterval = null;

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadEvents();
    
    // Обработчики форм
    document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('createEventForm')?.addEventListener('submit', handleCreateEvent);
    document.getElementById('editProfileForm')?.addEventListener('submit', handleEditProfile);
    
    // Показать главную страницу
    showSection('home');
    
    // Начать периодическую проверку уведомлений если пользователь авторизован
    if (authToken) {
        startNotificationPolling();
    }
    
    // Закрытие выпадающего меню при клике вне его
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('userDropdownContent');
        const dropdownBtn = document.querySelector('.user-dropdown-btn');
        
        if (dropdown && dropdown.classList.contains('show') && 
            !dropdown.contains(event.target) && 
            !dropdownBtn.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
});

// Проверка статуса аутентификации
async function checkAuthStatus() {
    if (!authToken) {
        updateAuthUI(false);
        return;
    }
    
    try {
        const response = await fetch(`${API_CONFIG.AUTH_SERVICE}/users/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            currentUser = await response.json();
            updateAuthUI(true);
            startNotificationPolling();
            
            // Загружаем уведомления если на странице уведомлений
            if (document.getElementById('notifications').style.display !== 'none') {
                loadNotifications();
            }
        } else {
            localStorage.removeItem('authToken');
            updateAuthUI(false);
        }
    } catch (error) {
        console.error('Auth check error:', error);
        updateAuthUI(false);
    }
}

// Обновление UI в зависимости от статуса аутентификации
function updateAuthUI(isAuthenticated) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    const profileEmail = document.getElementById('profileEmail');
    
    if (isAuthenticated && currentUser) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'flex';
        userName.textContent = currentUser.username;
        
        if (profileEmail) {
            profileEmail.textContent = currentUser.email;
        }
        
        // Загружаем количество непрочитанных уведомлений
        loadUnreadNotificationsCount();
        
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
        userName.textContent = '';
        
        if (profileEmail) {
            profileEmail.textContent = '';
        }
        
        // Скрываем бейджи уведомлений
        hideAllNotificationBadges();
        stopNotificationPolling();
    }
}

// Регистрация
async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('regEmail').value;
    const username = document.getElementById('regUsername').value;
    const fullName = document.getElementById('regFullName').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    
    if (password !== confirmPassword) {
        alert('Пароли не совпадают');
        return;
    }
    
    try {
        const response = await fetch(`${API_CONFIG.AUTH_SERVICE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                username,
                full_name: fullName,
                password
            })
        });
        
        if (response.ok) {
            const user = await response.json();
            alert('Регистрация успешна! Теперь вы можете войти в систему.');
            showSection('login');
        } else {
            const error = await response.json();
            alert(`Ошибка регистрации: ${error.detail}`);
        }
    } catch (error) {
        console.error('Register error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Вход
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        
        const response = await fetch(`${API_CONFIG.AUTH_SERVICE}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            authToken = data.access_token;
            localStorage.setItem('authToken', authToken);
            
            await checkAuthStatus();
            alert('Вход выполнен успешно!');
            showSection('events');
        } else {
            alert('Неверный email или пароль');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('unreadNotifications');
        localStorage.removeItem('lastNotificationCount');
        authToken = null;
        currentUser = null;
        updateAuthUI(false);
        hideAllNotificationBadges();
        showSection('home');
        alert('Вы успешно вышли из системы');
    }
}

// Загрузка мероприятий
async function loadEvents(page = 1) {
    try {
        const category = document.getElementById('categoryFilter')?.value;
        const location = document.getElementById('locationFilter')?.value;
        const dateFrom = document.getElementById('dateFromFilter')?.value;
        const dateTo = document.getElementById('dateToFilter')?.value;
        
        let url = `${API_CONFIG.EVENT_SERVICE}/events/?skip=${(page - 1) * eventsPerPage}&limit=${eventsPerPage}`;
        
        if (category) url += `&category=${category}`;
        if (location) url += `&location=${encodeURIComponent(location)}`;
        if (dateFrom) url += `&date_from=${dateFrom}`;
        if (dateTo) url += `&date_to=${dateTo}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
            currentEvents = await response.json();
            renderEvents(currentEvents);
            renderPagination(page);
        }
    } catch (error) {
        console.error('Load events error:', error);
        document.getElementById('eventsList').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки мероприятий. Проверьте подключение к серверу.</p>
            </div>
        `;
    }
}

// Отображение мероприятий
function renderEvents(events) {
    const eventsList = document.getElementById('eventsList');
    
    if (!events || events.length === 0) {
        eventsList.innerHTML = `
            <div class="no-events">
                <i class="fas fa-calendar-times"></i>
                <h3>Мероприятий не найдено</h3>
                <p>Попробуйте изменить параметры поиска</p>
            </div>
        `;
        return;
    }
    
    eventsList.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-header">
                <h3>${event.title}</h3>
                <span class="event-category">${getCategoryName(event.category)}</span>
            </div>
            <div class="event-body">
                <p>${event.description || 'Описание отсутствует'}</p>
                <div class="event-info">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${event.location || 'Местоположение не указано'}</span>
                </div>
                <div class="event-info">
                    <i class="fas fa-calendar"></i>
                    <span>${formatDate(event.start_date)}</span>
                </div>
                <div class="event-info">
                    <i class="fas fa-users"></i>
                    <span>Участников: ${event.current_participants}${event.max_participants ? `/${event.max_participants}` : ''}</span>
                </div>
            </div>
            <div class="event-actions">
                <button class="btn btn-outline" onclick="viewEventDetails(${event.id})">
                    <i class="fas fa-eye"></i> Подробнее
                </button>
                ${currentUser ? `
                    <button class="btn btn-primary" onclick="registerForEvent(${event.id})">
                        <i class="fas fa-user-plus"></i> Зарегистрироваться
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Пагинация
function renderPagination(currentPage) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    // В реальном приложении здесь бы было общее количество страниц из API
    const totalPages = Math.ceil(100 / eventsPerPage); // Примерное значение
    
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        const button = document.createElement('button');
        button.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        button.textContent = i;
        button.onclick = () => {
            currentEventsPage = i;
            loadEvents(i);
        };
        pagination.appendChild(button);
    }
}

// Поиск мероприятий
function searchEvents() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm) {
        renderEvents(currentEvents);
        return;
    }
    
    const filteredEvents = currentEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm) ||
        (event.description && event.description.toLowerCase().includes(searchTerm)) ||
        (event.location && event.location.toLowerCase().includes(searchTerm))
    );
    
    renderEvents(filteredEvents);
}

// Фильтрация мероприятий
function filterEvents() {
    loadEvents(1);
}

// Создание мероприятия
async function handleCreateEvent(e) {
    e.preventDefault();
    
    if (!currentUser) {
        alert('Для создания мероприятия необходимо войти в систему');
        showSection('login');
        return;
    }
    
    const eventData = {
        title: document.getElementById('eventTitle').value,
        description: document.getElementById('eventDescription').value,
        category: document.getElementById('eventCategory').value,
        location: document.getElementById('eventLocation').value,
        start_date: document.getElementById('eventStartDate').value,
        max_participants: document.getElementById('eventMaxParticipants').value || null
    };
    
    if (document.getElementById('eventEndDate').value) {
        eventData.end_date = document.getElementById('eventEndDate').value;
    }
    
    try {
        const response = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(eventData)
        });
        
        if (response.ok) {
            alert('Мероприятие успешно создано!');
            document.getElementById('createEventForm').reset();
            showSection('events');
            loadEvents();
        } else {
            const error = await response.json();
            alert(`Ошибка создания мероприятия: ${error.detail}`);
        }
    } catch (error) {
        console.error('Create event error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Регистрация на мероприятие
async function registerForEvent(eventId) {
    if (!currentUser) {
        alert('Для регистрации необходимо войти в систему');
        showSection('login');
        return;
    }
    
    try {
        const response = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/${eventId}/register`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            alert('Вы успешно зарегистрировались на мероприятие!');
            loadEvents(currentEventsPage);
            
            // Обновляем счетчик уведомлений после регистрации
            setTimeout(() => {
                loadUnreadNotificationsCount();
            }, 1000);
        } else {
            const error = await response.json();
            alert(`Ошибка регистрации: ${error.detail}`);
        }
    } catch (error) {
        console.error('Register for event error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Просмотр деталей мероприятия
async function viewEventDetails(eventId) {
    try {
        const response = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/${eventId}`);
        
        if (response.ok) {
            const event = await response.json();
            
            // Загрузка участников
            const participantsResponse = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/${eventId}/participants`);
            const participants = participantsResponse.ok ? await participantsResponse.json() : [];
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <h2>${event.title}</h2>
                <p><strong>Категория:</strong> ${getCategoryName(event.category)}</p>
                <p><strong>Описание:</strong> ${event.description || 'Отсутствует'}</p>
                <p><strong>Местоположение:</strong> ${event.location || 'Не указано'}</p>
                <p><strong>Дата начала:</strong> ${formatDate(event.start_date)}</p>
                ${event.end_date ? `<p><strong>Дата окончания:</strong> ${formatDate(event.end_date)}</p>` : ''}
                <p><strong>Участники:</strong> ${event.current_participants}${event.max_participants ? `/${event.max_participants}` : ''}</p>
                
                ${participants.length > 0 ? `
                    <h3>Список участников:</h3>
                    <ul>
                        ${participants.map(p => `<li>Пользователь #${p.user_id}</li>`).join('')}
                    </ul>
                ` : '<p>Пока нет участников</p>'}
                
                ${currentUser ? `
                    <div class="modal-actions">
                        <button class="btn btn-primary" onclick="registerForEvent(${event.id})">
                            <i class="fas fa-user-plus"></i> Зарегистрироваться
                        </button>
                    </div>
                ` : ''}
            `;
            
            document.getElementById('eventModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('View event details error:', error);
        alert('Ошибка загрузки деталей мероприятия');
    }
}

// Загрузка моих мероприятий
async function loadMyEvents() {
    if (!currentUser) {
        document.getElementById('myCreatedEvents').innerHTML = `
            <div class="no-events">
                <i class="fas fa-lock"></i>
                <h3>Для просмотра мероприятий необходимо войти в систему</h3>
                <button class="btn btn-primary" onclick="showSection('login')">
                    <i class="fas fa-sign-in-alt"></i> Войти
                </button>
            </div>
        `;
        document.getElementById('myRegisteredEvents').innerHTML = '';
        return;
    }
    
    try {
        // Созданные мероприятия
        const createdResponse = await fetch(`${API_CONFIG.EVENT_SERVICE}/users/me/events`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (createdResponse.ok) {
            const createdEvents = await createdResponse.json();
            renderMyEvents('created', createdEvents);
        }
        
        // Зарегистрированные мероприятия
        const registeredResponse = await fetch(`${API_CONFIG.EVENT_SERVICE}/users/me/registered-events`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (registeredResponse.ok) {
            const registeredEvents = await registeredResponse.json();
            renderMyEvents('registered', registeredEvents);
        }
    } catch (error) {
        console.error('Load my events error:', error);
    }
}

// Отображение моих мероприятий
function renderMyEvents(type, events) {
    const containerId = type === 'created' ? 'myCreatedEvents' : 'myRegisteredEvents';
    const container = document.getElementById(containerId);
    
    if (!events || events.length === 0) {
        container.innerHTML = `
            <div class="no-events">
                <i class="fas fa-calendar-times"></i>
                <h3>${type === 'created' ? 'Вы еще не создали мероприятия' : 'Вы еще не зарегистрировались на мероприятия'}</h3>
                ${type === 'created' ? `
                    <button class="btn btn-primary" onclick="showSection('create-event')">
                        <i class="fas fa-plus"></i> Создать первое мероприятие
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    container.innerHTML = events.map(event => `
        <div class="event-card">
            <div class="event-header">
                <h3>${event.title}</h3>
                <span class="event-category">${getCategoryName(event.category)}</span>
            </div>
            <div class="event-body">
                <p>${event.description || 'Описание отсутствует'}</p>
                <div class="event-info">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${event.location || 'Местоположение не указано'}</span>
                </div>
                <div class="event-info">
                    <i class="fas fa-calendar"></i>
                    <span>${formatDate(event.start_date)}</span>
                </div>
                <div class="event-info">
                    <i class="fas fa-users"></i>
                    <span>Участников: ${event.current_participants}${event.max_participants ? `/${event.max_participants}` : ''}</span>
                </div>
            </div>
            <div class="event-actions">
                <button class="btn btn-outline" onclick="viewEventDetails(${event.id})">
                    <i class="fas fa-eye"></i> Подробнее
                </button>
                ${type === 'created' ? `
                    <button class="btn btn-danger" onclick="deleteEvent(${event.id})">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                ` : `
                    <button class="btn btn-danger" onclick="unregisterFromEvent(${event.id})">
                        <i class="fas fa-user-minus"></i> Отменить регистрацию
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

// Удаление мероприятия
async function deleteEvent(eventId) {
    if (!confirm('Вы уверены, что хотите удалить это мероприятие?')) return;
    
    try {
        const response = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/${eventId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            alert('Мероприятие удалено');
            loadMyEvents();
        } else {
            const error = await response.json();
            alert(`Ошибка удаления: ${error.detail}`);
        }
    } catch (error) {
        console.error('Delete event error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Отмена регистрации
async function unregisterFromEvent(eventId) {
    if (!confirm('Вы уверены, что хотите отменить регистрацию?')) return;
    
    try {
        const response = await fetch(`${API_CONFIG.EVENT_SERVICE}/events/${eventId}/unregister`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            alert('Регистрация отменена');
            loadMyEvents();
        } else {
            const error = await response.json();
            alert(`Ошибка отмены регистрации: ${error.detail}`);
        }
    } catch (error) {
        console.error('Unregister error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Загрузка уведомлений
async function loadNotifications() {
    if (!currentUser) {
        document.getElementById('notificationsList').innerHTML = `
            <div class="no-notifications">
                <i class="fas fa-lock"></i>
                <h3>Для просмотра уведомлений необходимо войти в систему</h3>
                <button class="btn btn-primary" onclick="showSection('login')">
                    <i class="fas fa-sign-in-alt"></i> Войти
                </button>
            </div>
        `;
        document.getElementById('markAllReadBtn').style.display = 'none';
        return;
    }
    
    try {
        const response = await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/notifications/?user_id=${currentUser.id}`);
        
        if (response.ok) {
            const notifications = await response.json();
            renderNotifications(notifications);
            
            // Показываем кнопку "Отметить все как прочитанные" если есть уведомления
            if (notifications.length > 0) {
                document.getElementById('markAllReadBtn').style.display = 'block';
            } else {
                document.getElementById('markAllReadBtn').style.display = 'none';
            }
            
            // После загрузки уведомлений обновляем счетчик
            loadUnreadNotificationsCount();
        }
    } catch (error) {
        console.error('Load notifications error:', error);
        document.getElementById('notificationsList').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки уведомлений</p>
            </div>
        `;
    }
}

// Отображение уведомлений
function renderNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    
    if (!notifications || notifications.length === 0) {
        container.innerHTML = `
            <div class="no-notifications">
                <i class="fas fa-bell-slash"></i>
                <h3>Нет уведомлений</h3>
                <p>Здесь появятся уведомления о ваших мероприятиях</p>
            </div>
        `;
        document.getElementById('markAllReadBtn').style.display = 'none';
        return;
    }
    
    container.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.is_read ? '' : 'unread'}" id="notification-${notification.id}">
            <div class="notification-content">
                <h4>${getNotificationTitle(notification.notification_type)}</h4>
                <p>${notification.message}</p>
                <span class="notification-time">${formatDate(notification.created_at)}</span>
            </div>
            <div class="notification-actions">
                ${!notification.is_read ? `
                    <button class="btn btn-outline btn-sm" onclick="markAsRead(${notification.id})">
                        <i class="fas fa-check"></i> Прочитано
                    </button>
                ` : ''}
                <button class="btn btn-outline btn-sm" onclick="deleteNotification(${notification.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Пометить уведомление как прочитанное
async function markAsRead(notificationId) {
    try {
        const response = await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
        
        if (response.ok) {
            // Обновляем отображение уведомления
            const notificationElement = document.getElementById(`notification-${notificationId}`);
            if (notificationElement) {
                notificationElement.classList.remove('unread');
            }
            
            // Обновляем счетчик
            loadUnreadNotificationsCount();
        }
    } catch (error) {
        console.error('Mark as read error:', error);
    }
}

// Пометить все как прочитанные
async function markAllAsRead() {
    try {
        const response = await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/notifications/?user_id=${currentUser.id}`);
        
        if (response.ok) {
            const notifications = await response.json();
            const unreadNotifications = notifications.filter(n => !n.is_read);
            
            for (const notification of unreadNotifications) {
                await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/notifications/${notification.id}/read`, {
                    method: 'PUT'
                });
            }
            
            loadNotifications();
        }
    } catch (error) {
        console.error('Mark all as read error:', error);
    }
}

// Удаление уведомления
async function deleteNotification(notificationId) {
    if (!confirm('Удалить это уведомление?')) return;
    
    try {
        const response = await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/notifications/${notificationId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Удаляем элемент из DOM
            const notificationElement = document.getElementById(`notification-${notificationId}`);
            if (notificationElement) {
                notificationElement.remove();
            }
            
            // Обновляем счетчик
            loadUnreadNotificationsCount();
        }
    } catch (error) {
        console.error('Delete notification error:', error);
    }
}

// Функция для загрузки количества непрочитанных уведомлений
async function loadUnreadNotificationsCount() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_CONFIG.NOTIFICATION_SERVICE}/users/${currentUser.id}/unread-count`);
        
        if (response.ok) {
            const data = await response.json();
            const count = data.unread_count;
            
            // Обновляем все бейджи
            updateNotificationBadges(count);
            
            // Сохраняем в localStorage для быстрого доступа
            localStorage.setItem('unreadNotifications', count);
        }
    } catch (error) {
        console.error('Error loading unread notifications count:', error);
    }
}

// Функция для обновления бейджей уведомлений
function updateNotificationBadges(count) {
    const badges = [
        document.getElementById('userNotificationBadge'),
        document.getElementById('dropdownNotificationBadge')
    ];
    
    if (count > 0) {
        badges.forEach(badge => {
            if (badge) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
                
                // Добавляем анимацию для новых уведомлений
                if (count > (parseInt(localStorage.getItem('lastNotificationCount') || 0))) {
                    badge.classList.add('pulse');
                    setTimeout(() => badge.classList.remove('pulse'), 1000);
                }
            }
        });
        
        // Обновляем title страницы
        document.title = `(${count}) Event Platform`;
    } else {
        hideAllNotificationBadges();
        document.title = 'Event Platform';
    }
    
    localStorage.setItem('lastNotificationCount', count);
}

// Функция для скрытия всех бейджей
function hideAllNotificationBadges() {
    const badges = [
        document.getElementById('userNotificationBadge'),
        document.getElementById('dropdownNotificationBadge')
    ];
    
    badges.forEach(badge => {
        if (badge) {
            badge.style.display = 'none';
        }
    });
    
    document.title = 'Event Platform';
}

// Функция для загрузки информации профиля
async function loadProfileInfo() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_CONFIG.AUTH_SERVICE}/users/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            displayProfileInfo(userData);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Функция для отображения информации профиля
function displayProfileInfo(user) {
    const profileInfo = document.getElementById('profileInfo');
    const profileEmail = document.getElementById('profileEmail');
    
    if (!profileInfo) return;
    
    if (profileEmail) {
        profileEmail.textContent = user.email;
    }
    
    profileInfo.innerHTML = `
        <div class="info-row">
            <i class="fas fa-user"></i>
            <span class="info-label">Имя пользователя:</span>
            <span class="info-value">${user.username}</span>
        </div>
        <div class="info-row">
            <i class="fas fa-envelope"></i>
            <span class="info-label">Email:</span>
            <span class="info-value">${user.email}</span>
        </div>
        <div class="info-row">
            <i class="fas fa-id-card"></i>
            <span class="info-label">Полное имя:</span>
            <span class="info-value">${user.full_name || 'Не указано'}</span>
        </div>
        <div class="info-row">
            <i class="fas fa-calendar"></i>
            <span class="info-label">Дата регистрации:</span>
            <span class="info-value">${formatDate(user.created_at)}</span>
        </div>
        <div class="info-row">
            <i class="fas fa-check-circle"></i>
            <span class="info-label">Статус аккаунта:</span>
            <span class="info-value">${user.is_active ? 'Активен' : 'Неактивен'}</span>
        </div>
    `;
}

// Функция для перехода к редактированию профиля
function editProfile() {
    // Заполняем форму текущими данными
    document.getElementById('editFullName').value = currentUser.full_name || '';
    document.getElementById('editEmail').value = currentUser.email || '';
    document.getElementById('editUsername').value = currentUser.username || '';
    document.getElementById('editPassword').value = '';
    document.getElementById('editConfirmPassword').value = '';
    
    showSection('edit-profile');
}

// Обработчик формы редактирования профиля
async function handleEditProfile(e) {
    e.preventDefault();
    
    const formData = {
        full_name: document.getElementById('editFullName').value,
        email: document.getElementById('editEmail').value,
        username: document.getElementById('editUsername').value
    };
    
    const password = document.getElementById('editPassword').value;
    const confirmPassword = document.getElementById('editConfirmPassword').value;
    
    if (password) {
        if (password !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }
        formData.password = password;
    }
    
    try {
        // В реальном приложении здесь бы был PUT запрос к API
        // Для демонстрации просто обновляем локальные данные
        Object.assign(currentUser, formData);
        
        alert('Профиль успешно обновлен!');
        showSection('profile');
        displayProfileInfo(currentUser);
        updateAuthUI(true);
        
        // В реальном приложении:
        // const response = await fetch(`${API_CONFIG.AUTH_SERVICE}/users/me`, {
        //     method: 'PUT',
        //     headers: {
        //         'Content-Type': 'application/json',
        //         'Authorization': `Bearer ${authToken}`
        //     },
        //     body: JSON.stringify(formData)
        // });
        // 
        // if (response.ok) {
        //     const updatedUser = await response.json();
        //     currentUser = updatedUser;
        //     alert('Профиль успешно обновлен!');
        //     showSection('profile');
        //     loadProfileInfo();
        // } else {
        //     const error = await response.json();
        //     alert(`Ошибка обновления: ${error.detail}`);
        // }
        
    } catch (error) {
        console.error('Edit profile error:', error);
        alert('Ошибка соединения с сервером');
    }
}

// Функция для показа секций
function showSection(sectionId) {
    // Скрыть все секции
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    
    // Закрыть выпадающее меню пользователя
    const dropdown = document.getElementById('userDropdownContent');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Показать выбранную секцию
    const section = document.getElementById(sectionId);
    if (section) {
        section.style.display = 'block';
        
        // Автоматически загружать данные для секции
        switch(sectionId) {
            case 'events':
                loadEvents();
                break;
            case 'my-events':
                loadMyEvents();
                break;
            case 'notifications':
                loadNotifications();
                break;
            case 'profile':
                loadProfileInfo();
                break;
        }
    }
    
    // Скрыть мобильное меню
    document.getElementById('navMenu').classList.remove('active');
}

// Показать табы в разделе "Мои мероприятия"
function showMyEventsTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent.includes(tab === 'created' ? 'Созданные' : 'Зарегистрированные')) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('myCreatedEvents').style.display = tab === 'created' ? 'grid' : 'none';
    document.getElementById('myRegisteredEvents').style.display = tab === 'registered' ? 'grid' : 'none';
}

// Переключение мобильного меню
function toggleMenu() {
    const navMenu = document.getElementById('navMenu');
    navMenu.classList.toggle('active');
}

// Переключение выпадающего меню пользователя
function toggleUserDropdown() {
    const dropdown = document.getElementById('userDropdownContent');
    dropdown.classList.toggle('show');
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('eventModal').style.display = 'none';
}

// Запуск периодической проверки уведомлений
function startNotificationPolling() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
    }
    
    notificationCheckInterval = setInterval(() => {
        if (currentUser) {
            loadUnreadNotificationsCount();
        }
    }, 30000); // Проверяем каждые 30 секунд
}

// Остановка периодической проверки уведомлений
function stopNotificationPolling() {
    if (notificationCheckInterval) {
        clearInterval(notificationCheckInterval);
        notificationCheckInterval = null;
    }
}

// Вспомогательные функции
function formatDate(dateString) {
    if (!dateString) return 'Не указано';
    
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getCategoryName(category) {
    const categories = {
        'conference': 'Конференция',
        'workshop': 'Воркшоп',
        'seminar': 'Семинар',
        'meetup': 'Митап',
        'party': 'Вечеринка',
        'sports': 'Спорт',
        'other': 'Другое'
    };
    return categories[category] || category;
}

function getNotificationTitle(type) {
    const titles = {
        'event_created': 'Мероприятие создано',
        'event_registration': 'Регистрация на мероприятие',
        'event_updated': 'Мероприятие обновлено',
        'event_cancelled': 'Мероприятие отменено'
    };
    return titles[type] || 'Уведомление';
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modal = document.getElementById('eventModal');
    if (event.target === modal) {
        closeModal();
    }
};