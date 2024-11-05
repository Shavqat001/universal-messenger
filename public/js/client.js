const URL = 'localhost';
const socket = new WebSocket(`ws://${URL}:8081`);
let activeUser = null;
let users = [];

let usersList = document.querySelector('.users__list');
let messagesContent = document.querySelector('.messages');
let form = document.querySelector('.messages__form');
let messageInput = form.querySelector('.messages__input');
let selectMessage = document.querySelector('.message__select_chat');
let messagesList = document.querySelector('.messages__list');
let messagesWrapperList = document.querySelector('.message__wrapper_list');
let searchBar = document.querySelector('.users__search');
let logoutButton = document.querySelector('.users__logout');

logoutButton.addEventListener('click', async () => {
    try {
        console.log('Logout button clicked');

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

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    let user = users.find(u => u.phoneNumber === data.phoneNumber);

    if (!user) {
        user = {
            phoneNumber: data.phoneNumber,
            name: data.name || 'Unknown User',
            platform: data.platform,
            profilePic: data.profilePic || '/img/avatar.jpg',
            messages: []
        };
        users.push(user);

        const userElement = document.createElement('li');
        userElement.classList.add('users__item');
        userElement.id = data.phoneNumber;
        userElement.innerHTML = `
            <div class="users__picture">
                <img src="${user.profilePic}" alt="${data.name}" width="50">
            </div>
            <div class="users__info">
                <h3 class="users__name">${data.name}</h3>
                <p class="users__text">${data.message}</p>
                <span class="new-message-indicator"></span>
            </div>
            <img class="users__platform-icon" src="/assets/${data.platform}.ico" alt="${data.platform}" width="25">
        `;
        userElement.addEventListener('click', () => setActiveUser(data.phoneNumber));
        usersList.appendChild(userElement);
    }

    user.messages.push({
        text: data.message,
        from: data.from || data.platform
    });

    if (activeUser === user.phoneNumber) {
        const messageClass = data.from === 'operator' ? 'messages__item_bot' :
            data.platform === 'telegram' ? 'messages__item_telegram' : 'messages__item_whatsapp';

        messagesList.innerHTML += `
            <li class="messages__item ${messageClass}">
                ${data.message}
                <span class="messages__item_tail"></span>
            </li>`;
        scrollToBottom();
    } else {
        const userElement = document.getElementById(user.phoneNumber);
        userElement.querySelector('.new-message-indicator').classList.add('new-message-indicator--visible');
        userElement.querySelector('.users__text').textContent = data.message;
    }
};

function scrollToBottom() {
    messagesWrapperList.scrollTop = messagesList.scrollHeight;
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (activeUser && messageInput.value.trim() !== '') {
        const messageText = messageInput.value.trim();

        const user = users.find(u => u.phoneNumber === activeUser);

        if (!user) {
            return;
        }

        user.messages.push({ text: messageText, from: 'operator' });

        socket.send(JSON.stringify({
            platform: user.platform,
            phoneNumber: activeUser,
            inputText: messageText
        }));

        messageInput.value = '';
    }
});

function setActiveUser(chatId) {
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

    const user = users.find(u => u.phoneNumber === chatId);
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

    currentElement.querySelector('.new-message-indicator').classList.remove('new-message-indicator--visible');

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

searchBar.addEventListener('input', () => {
    const usersItem = document.querySelectorAll('.users__item');
    usersItem.forEach(user => {
        if (user.querySelector('.users__name')
            .textContent.toLowerCase() === searchBar.value.toLowerCase()) {
            usersItem.forEach(el => el.style.display = 'none');
            user.style.display = 'flex';
        }
        if (searchBar.value === '') {
            usersItem.forEach(el => el.style.display = 'flex');
        }
    });
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        cancelActiveUser();
    }
});

function cancelActiveUser() {
    const usersItem = document.querySelectorAll('.users__item');
    usersItem.forEach(el => el.classList.remove('users__item--active'));
    messagesContent.style.justifyContent = 'center';
    selectMessage.classList.remove('visually-hidden');
    form.classList.add('visually-hidden');
    messagesList.innerHTML = '';
    messagesWrapperList.classList.add('visually-hidden');
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
                            userElement = document.createElement('li');
                            userElement.classList.add('users__item');
                            userElement.id = client.phone_number;
                            userElement.innerHTML = `
                                <div class="users__picture">
                                    <img src="${client.sender_profile_pic || '/img/avatar.jpg'}" alt="${client.sender_name || 'Unknown User'}" width="50">
                                </div>
                                <div class="users__info">
                                    <h3 class="users__name">${client.sender_name || 'Unknown User'}</h3>
                                    <p class="users__text">${lastMessage.message_text || ''}</p>
                                    <span class="new-message-indicator"></span>
                                </div>
                                <img class="users__platform-icon" src="/assets/${client.platform}.ico" alt="${client.platform}" width="25">
                            `;

                            userElement.addEventListener('click', () => setActiveUser(client.phone_number));
                            usersList.appendChild(userElement);
                        } else {
                            userElement.querySelector('.users__picture img').src = client.sender_profile_pic || './img/avatar.jpg';
                            userElement.querySelector('.users__text').textContent = lastMessage.message_text || '';
                        }
                    })
                    .catch(err => console.error('Error loading last message:', err));
            });
        })
        .catch(err => console.error('Error loading clients:', err));
}

window.addEventListener('DOMContentLoaded', () => {
    loadClients();
    document.querySelector('.page__settings_user-name').textContent = localStorage.getItem('operator') || 'operator';
});

messagesWrapperList.addEventListener('click', () => {
    messageInput.focus();
});