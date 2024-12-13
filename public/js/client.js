const URL = 'localhost';
const socket = new WebSocket(`ws://${URL}:8081`);
let activeUser = null;
let users = [];

const usersList = document.querySelector('.users__list');
const messagesContent = document.querySelector('.messages');
const form = document.querySelector('.messages__form');
const messageInput = form.querySelector('.messages__input');
const selectMessage = document.querySelector('.message__select_chat');
const messagesList = document.querySelector('.messages__list');
const messagesWrapperList = document.querySelector('.message__wrapper_list');
const searchBar = document.querySelector('.users__search');
const logoutButton = document.querySelector('.users__logout');
const contextMenu = document.createElement('div');

contextMenu.className = 'contextmenu';
contextMenu.innerHTML = `
    <ul class="contextmenu-list">
	    <li class="contextmenu-item">
            ${activeUser ? 'Не обслуживать' : 'Обслуживать'}
        </li>
        <li class="contextmenu-item">Удалить</li>
    </ul>`;

document.body.append(contextMenu);

logoutButton.addEventListener('click', async () => {
    try {
        const response = await fetch(`http://${URL}:8082/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            localStorage.clear();
            window.location.href = '/';
        } else {
            console.error('Logout failed with status:', response.status);
        }
    } catch (error) {
        console.error('Error during logout:', error);
    }
});

socket.onmessage = handleIncomingMessage;

function addUserToUI(user) {
    if (!user.phoneNumber || user.phoneNumber === "Unknown User") return;

    const userElement = document.createElement('li');
    userElement.classList.add('users__item');
    userElement.id = user.phoneNumber;
    userElement.innerHTML = `
        <div class="users__picture">
            <img src="${user.profilePic || '/img/avatar.jpg'}" alt="${user.name}" width="50">
        </div>
        <div class="users__info">
            <h3 class="users__name">${user.name || "Unknown User"}</h3>
            <p class="users__text">${user.lastMessage || 'No messages yet'}</p>
            <span class="new-message-indicator"></span>
        </div>
        <img class="users__platform-icon" src="/assets/${user.platform}.ico" alt="${user.platform}" width="25">
        <button class="users__edit-btn">
            <svg width="15" height="5">
                <use xlink:href="#three-points"></use>
            </svg>
            <span class="visually-hidden">edit</span>
        </button>
    `;
    userElement.addEventListener('click', (e) => {
        setActiveUser(user.phoneNumber);
        if (e.target.classList.contains('users__edit-btn')) {
            contextMenu.style.height = "auto";
            contextMenu.style.padding = "10px";
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
            console.log(true);
        } else {
            contextMenu.style.height = "auto";
            contextMenu.style.padding = "0 10px";
            console.log(true);
        }
    });
    usersList.appendChild(userElement);
}

function fetchMessages(chatId) {
    loadMessagesForUser(chatId);
}

function loadClients() {
    fetch(`http://${URL}:8082/api/clients`)
        .then(response => response.json())
        .then(clients => {
            usersList.innerHTML = '';

            clients.forEach(client => {
                let user = users.find(u => u.phoneNumber === client.phone_number);

                if (!user) {
                    user = {
                        phoneNumber: client.phone_number,
                        name: client.sender_name || 'Unknown User',
                        platform: client.platform,
                        profilePic: client.sender_profile_pic || '/img/avatar.jpg',
                        messages: []
                    };
                    users.push(user);
                }

                fetch(`http://${URL}:8082/api/last_message/${client.phone_number}`)
                    .then(response => response.json())
                    .then(lastMessage => {
                        let userElement = document.getElementById(client.phone_number);
                        if (!userElement) {
                            addUserToUI(user);
                        } else {
                            userElement.querySelector('.users__picture img').src = user.profilePic; // Используем profilePic из user
                            userElement.querySelector('.users__text').textContent = lastMessage.message_text || '';
                        }
                    })
                    .catch(err => console.error('Error loading last message:', err));
            });
        })
        .catch(err => console.error('Error loading clients:', err));
}

function addMessageToUI(phoneNumber, message, from) {
    const user = users.find(u => u.phoneNumber === phoneNumber);

    if (user && activeUser === phoneNumber) {
        const messageClass = from === 'operator' ? 'messages__item_bot' :
            from === 'telegram' ? 'messages__item_telegram' : 'messages__item_whatsapp';

        messagesList.innerHTML += `
            <li class="messages__item ${messageClass}">
                <span class="messages__item__text">${message}</span>
                <span class="messages__item_tail"></span>
            </li>`;
        scrollToBottom();
    } else {
        const userElement = document.getElementById(phoneNumber);
        if (userElement) {
            userElement.querySelector('.new-message-indicator').classList.add('new-message-indicator--visible');
            userElement.querySelector('.users__text').textContent = message;
        }
    }
}

function scrollToBottom() {
    messagesWrapperList.scrollTop = messagesList.scrollHeight;
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeUser && messageInput.value.trim() !== '') {
        const messageText = messageInput.value.trim();
        const user = users.find(u => u.phoneNumber === activeUser);
        if (user) {
            user.messages.push({ text: messageText, from: 'operator' });
            socket.send(JSON.stringify({
                platform: user.platform,
                phoneNumber: activeUser,
                inputText: messageText
            }));
            addMessageToUI(activeUser, messageText, 'operator');
            messageInput.value = '';
        }
    }
});

function setActiveUser(chatId) {
    const operatorName = localStorage.getItem('operator');
    const user = users.find(u => u.phoneNumber === chatId);
    const platform = user ? user.platform : 'unknown';
    let role = document.querySelector('.page__settings-operator-role');

    if (role.textContent !== 'Аналитик') {
        socket.send(JSON.stringify({
            action: 'setActiveUser',
            phoneNumber: chatId,
            operatorName: operatorName,
            platform: platform
        }));
    }

    const usersItem = document.querySelectorAll('.users__item');
    usersItem.forEach((el) => el.classList.remove('users__item--active'));

    const currentElement = document.getElementById(chatId);
    currentElement.classList.add('users__item--active');

    messagesContent.style.justifyContent = 'space-between';
    selectMessage.classList.add('visually-hidden');
    form.classList.remove('visually-hidden');
    messageInput.focus();
    activeUser = chatId;
    messagesList.innerHTML = '';
    messagesWrapperList.classList.remove('visually-hidden');

    if (user && user.messages) {
        user.messages.forEach(msg => {
            const messageClass = msg.from === 'telegram' ? 'messages__item_telegram' :
                msg.from === 'whatsapp' ? 'messages__item_whatsapp' :
                    'messages__item_bot';

            messagesList.innerHTML += `
            <li class="messages__item ${messageClass}">
                ${msg.text}
                <span class="messages__item_tail"></span>
            </li>`;
        });
        scrollToBottom();
    }

    if (currentElement) {
        currentElement.querySelector('.new-message-indicator').classList.remove('new-message-indicator--visible');
    }

    fetch(`http://${URL}:8082/api/messages/${chatId}`)
        .then(response => response.json())
        .then(data => {
            messagesList.innerHTML = '';

            data.forEach(msg => {
                let messageClass = '';
                if (msg.message_type === 'client') {
                    messageClass = msg.platform === 'telegram' ? 'messages__item_telegram' :
                        msg.platform === 'whatsapp' ? 'messages__item_whatsapp' : 'messages__item_client';
                } else if (msg.message_type === 'operator') {
                    messageClass = 'messages__item_bot';
                }

                messagesList.innerHTML += `
                <li class="messages__item ${messageClass}">
                    ${msg.message_text}
                    <span class="messages__item_tail"></span>
                </li>`;
            });
            scrollToBottom();
        })
        .catch(err => console.error('Error fetching messages:', err));
}


function loadMessagesForUser(phoneNumber) {
    fetch(`http://${URL}:8082/api/messages/${phoneNumber}`)
        .then(response => response.json())
        .then(data => data.forEach(msg => addMessageToUI(phoneNumber, msg.message_text, msg.message_type)))
        .catch(err => console.error('Error loading messages:', err));
}

function cancelActiveUser() {
    activeUser = null;
    const usersItem = document.querySelectorAll('.users__item');
    usersItem.forEach(el => el.classList.remove('users__item--active'));
    messagesContent.style.justifyContent = 'center';
    selectMessage.classList.remove('visually-hidden');
    form.classList.add('visually-hidden');
    messagesList.innerHTML = '';
    messagesWrapperList.classList.add('visually-hidden');
}

function handleIncomingMessage(event) {
    const data = JSON.parse(event.data);

    if (data.action === 'clientTaken') {
        cancelActiveUser();
        alert(data.message);
        return;
    }

    if (data.action === 'assignClient' && data.phoneNumber === activeUser) {
        loadChatMessages(data.phoneNumber);
        return;
    }

    if (data.message && data.phoneNumber) {
        let user = users.find(u => u.phoneNumber === data.phoneNumber);

        if (!user) {
            user = {
                phoneNumber: data.phoneNumber,
                name: data.name || 'Unknown User',
                platform: data.platform,
                profilePic: data.profilePic || '/img/avatar.jpg',
                lastMessage: data.message,
                messages: []
            };
            users.push(user);
            addUserToUI(user);
        } else {
            user.lastMessage = data.message;
            const userElement = document.getElementById(user.phoneNumber);
            if (userElement) {
                userElement.querySelector('.users__text').textContent = data.message;
            }
        }

        if (!user.messages.some(msg => msg.text === data.message && msg.from === (data.from || data.platform))) {
            user.messages.push({ text: data.message, from: data.from || data.platform });

            if (activeUser === data.phoneNumber) {
                addMessageToUI(data.phoneNumber, data.message, data.from || data.platform);
            } else {
                const userElement = document.getElementById(data.phoneNumber);
                if (userElement) {
                    userElement.querySelector('.new-message-indicator').classList.add('new-message-indicator--visible');
                }
            }
        }
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    loadClients();
    const operatorName = localStorage.getItem('operator') || 'operator';
    document.querySelector('.page__settings_user-name').textContent = operatorName;

    const roleElement = document.querySelector('.page__settings-operator-role');
    const addOperatorLink = document.querySelector('.page__settings-add-operator');
    const deleteDb = document.querySelector('.page__settings-delete-db');

    const roleTranslations = {
        ru: {
            admin: 'Администратор',
            operator: 'Оператор',
            analyst: 'Аналитик',
            unknown: 'Неизвестная роль',
        },
        en: {
            admin: 'Administrator',
            operator: 'Operator',
            analyst: 'Analyst',
            unknown: 'Unknown Role',
        }
    };

    const currentLanguage = localStorage.getItem('language') || 'ru';

    try {
        const response = await fetch(`http://${URL}:8082/getRole`);
        if (!response.ok) {
            throw new Error('Не удалось получить роль пользователя');
        }

        const data = await response.json();

        if (data.role) {
            const translatedRole = roleTranslations[currentLanguage][data.role] || roleTranslations[currentLanguage].unknown;

            roleElement.textContent = translatedRole;
            addOperatorLink.style.display = data.role === 'admin' ? 'flex' : 'none';
            deleteDb.style.display = data.role === 'admin' ? 'flex' : 'none';
        } else {
            roleElement.textContent = roleTranslations[currentLanguage].unknown;
            addOperatorLink.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при загрузке роли пользователя:', error);
    }

    document.querySelector('.page__settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const adminRole = roleTranslations[currentLanguage].admin;
        if (roleElement.textContent === adminRole) {
            window.location.href = '/add-operator';
        } else {
            window.location.href = '/index';
        }
    });

    document.querySelector('.page__settings-delete-db').addEventListener('click', () => {
        const clearDbPrompt = document.querySelector('.confirm');
        clearDbPrompt.classList.add('confirm--opened');

        clearDbPrompt.querySelector('.confirm__ok').addEventListener('submit', async (e) => {
            e.preventDefault();
            const response = await fetch(`http://${URL}:8082/clearDb`, {
                method: 'POST',
            });
            window.location.reload();
            if (!response.ok) {
                throw new Error('Не удалось очистить БД');
            }
        });

        clearDbPrompt.querySelector('.confirm__cancel').addEventListener('click', () => {
            clearDbPrompt.classList.remove('confirm--opened');
        });
    });

    if (roleElement.textContent === roleTranslations.ru.analyst) {
        form.remove();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cancelActiveUser();
    }
});

messagesWrapperList.addEventListener('click', () => {
    messageInput.focus();
});

document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
})

window.addEventListener('click', () => {
    contextMenu.style.height = "0";
    contextMenu.style.padding = "0 10px";
})