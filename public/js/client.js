const URL = 'localhost';

let socket;
let activeUser = null;
let users = [];
let operatorName = localStorage.getItem('operator') || 'Оператор';

const usersList             = document.querySelector('.users__list');
const messagesContent       = document.querySelector('.messages');
const form                  = document.querySelector('.messages__form');
const messageInput          = form.querySelector('.messages__input');
const selectMessage         = document.querySelector('.message__select_chat');
const messagesList          = document.querySelector('.messages__list');
const messagesWrapperList   = document.querySelector('.message__wrapper_list');
const searchBar             = document.querySelector('.users__search');
const logoutButton          = document.querySelector('.users__logout');
const notificationSound     = document.getElementById('notification-sound');
const attachmentBtn         = document.querySelector('.messages__attachment-btn');
const fileInput             = document.querySelector('.messages__file-input');
const filePreview           = document.querySelector('.messages__file-preview');
const filePreviewName       = document.querySelector('.messages__file-preview-name');
const filePreviewRemove     = document.querySelector('.messages__file-preview-remove');

let pendingFile = null;

// ── Context menu ──────────────────────────────────────────────────────────────

const contextMenu = document.createElement('div');
contextMenu.className = 'contextmenu';
contextMenu.innerHTML = `
    <ul class="contextmenu-list">
        <li class="contextmenu-item contextmenu-item--serve">Обслуживать</li>
        <li class="contextmenu-item contextmenu-item--delete">Удалить</li>
    </ul>`;
document.body.append(contextMenu);

let contextMenuTarget = null;

document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
});

contextMenu.querySelector('.contextmenu-item--serve').addEventListener('click', () => {
    if (contextMenuTarget) setActiveUser(contextMenuTarget);
});

contextMenu.querySelector('.contextmenu-item--delete').addEventListener('click', () => {
    if (contextMenuTarget) {
        users = users.filter(u => u.phoneNumber !== contextMenuTarget);
        document.getElementById(contextMenuTarget)?.remove();
        if (activeUser === contextMenuTarget) cancelActiveUser();
        contextMenuTarget = null;
    }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWebSocket() {
    socket = new WebSocket(`ws://${URL}:8081`);
    socket.onmessage = handleIncomingMessage;
    socket.onclose = () => {
        console.warn('WebSocket closed, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
    };
    socket.onerror = err => console.error('WebSocket error:', err);
}

connectWebSocket();

// ── Logout ────────────────────────────────────────────────────────────────────

logoutButton.addEventListener('click', async () => {
    try {
        const res = await fetch(`http://${URL}:8082/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (res.ok) { localStorage.clear(); window.location.href = '/'; }
    } catch (err) { console.error('Error during logout:', err); }
});

// ── Search ────────────────────────────────────────────────────────────────────

searchBar.addEventListener('input', () => {
    const q = searchBar.value.toLowerCase().trim();
    document.querySelectorAll('.users__item').forEach(el => {
        const name = el.querySelector('.users__name')?.textContent.toLowerCase() || '';
        el.style.display = name.includes(q) ? '' : 'none';
    });
});

// ── Emoji quick-insert ────────────────────────────────────────────────────────

const emojiMap = { smile: '😂', like: '👍', angry: '😡', 'ok-hand': '👌', 'hi-hand': '👋' };

document.querySelectorAll('.messages__smile-icons use').forEach(use => {
    const id = use.getAttribute('xlink:href')?.replace('#', '');
    if (id && emojiMap[id]) {
        use.closest('svg').style.cursor = 'pointer';
        use.closest('svg').addEventListener('click', () => {
            const pos = messageInput.selectionStart;
            const val = messageInput.value;
            messageInput.value = val.slice(0, pos) + emojiMap[id] + val.slice(pos);
            messageInput.setSelectionRange(pos + 2, pos + 2);
            messageInput.focus();
        });
    }
});

// ── File attachment ───────────────────────────────────────────────────────────

attachmentBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    pendingFile = file;
    filePreviewName.textContent = file.name;
    filePreview.classList.remove('visually-hidden');
    messageInput.focus();
});

filePreviewRemove.addEventListener('click', () => {
    pendingFile = null;
    fileInput.value = '';
    filePreview.classList.add('visually-hidden');
});

// ── User list ─────────────────────────────────────────────────────────────────

function addUserToUI(user) {
    if (!user.phoneNumber || user.phoneNumber === 'Unknown User') return;
    if (document.getElementById(user.phoneNumber)) return;

    const li = document.createElement('li');
    li.classList.add('users__item');
    li.id = user.phoneNumber;
    li.innerHTML = `
        <div class="users__picture">
            <img src="${user.profilePic || '/img/avatar.jpg'}" alt="${user.name}" width="46" height="46">
        </div>
        <div class="users__info">
            <h3 class="users__name">${user.name || 'Unknown User'}</h3>
            <p class="users__text">${user.lastMessage || 'Нет сообщений'}</p>
            <span class="new-message-indicator"></span>
        </div>
        <button class="users__edit-btn" title="Меню">
            <svg width="15" height="5"><use xlink:href="#three-points"></use></svg>
            <span class="visually-hidden">edit</span>
        </button>
        <img class="users__platform-icon" src="/assets/${user.platform}.ico" alt="${user.platform}">
    `;

    li.querySelector('.users__edit-btn').addEventListener('click', e => {
        e.stopPropagation();
        contextMenuTarget = user.phoneNumber;
        contextMenu.querySelector('.contextmenu-item--serve').textContent =
            activeUser === user.phoneNumber ? 'Не обслуживать' : 'Обслуживать';
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
    });

    li.addEventListener('click', e => {
        if (!e.target.closest('.users__edit-btn')) setActiveUser(user.phoneNumber);
    });

    usersList.appendChild(li);
}

function loadClients() {
    fetch(`http://${URL}:8082/api/clients`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(clients => {
            usersList.innerHTML = '';
            users = [];
            clients.forEach(client => {
                const user = {
                    phoneNumber: client.phone_number,
                    name: client.sender_name || 'Unknown User',
                    platform: client.platform,
                    profilePic: client.sender_profile_pic || '/img/avatar.jpg',
                    lastMessage: client.last_message || 'Нет сообщений',
                    messages: []
                };
                users.push(user);
                addUserToUI(user);
            });
        })
        .catch(err => console.error('Error loading clients:', err));
}

// ── Message rendering ─────────────────────────────────────────────────────────

function renderAttachment(attachment) {
    if (!attachment) return '';

    const validUrl = attachment.url && attachment.url !== 'null' ? attachment.url : null;
    const dataSrc  = attachment.data && attachment.mime
        ? `data:${attachment.mime};base64,${attachment.data}`
        : null;
    const src = dataSrc || validUrl;

    const fileIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/></svg>`;

    const unavailable = `<span class="messages__attachment-file messages__attachment-unavailable">
        ${fileIcon} ${attachment.name || 'файл'} <em>(недоступен)</em>
    </span>`;

    if (attachment.type === 'image') {
        if (!src) return unavailable;
        return `<a href="${src}" target="_blank">
            <img class="messages__attachment-img" src="${src}" alt="${attachment.name}">
        </a>`;
    }

    if (attachment.type === 'audio') {
        if (!src) return unavailable;
        return `<audio class="messages__attachment-audio" controls src="${src}"></audio>`;
    }

    if (attachment.type === 'video') {
        if (!src) return unavailable;
        return `<video class="messages__attachment-video" controls src="${src}"></video>`;
    }

    // Generic file
    if (!src) return unavailable;
    return `<a class="messages__attachment-file" href="${src}" target="_blank" download="${attachment.name}">
        ${fileIcon} ${attachment.name}
    </a>`;
}

function messageClass(msgType, platform) {
    if (msgType === 'operator') return 'messages__item_bot';
    return platform === 'telegram' ? 'messages__item_telegram' : 'messages__item_client';
}

function buildMessageHTML(text, cssClass, attachment = null) {
    const safe = (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const attachHTML = attachment ? renderAttachment(attachment) : '';
    const textHTML = safe ? `<span class="messages__item__text">${safe}</span>` : '';
    return `<li class="messages__item ${cssClass}">${textHTML}${attachHTML}</li>`;
}

function addMessageToUI(phoneNumber, message, from, platform, attachment = null) {
    const isActive = activeUser === phoneNumber;

    if (isActive) {
        const cssClass = from === 'operator'
            ? 'messages__item_bot'
            : messageClass('client', platform || from);
        messagesList.insertAdjacentHTML('beforeend', buildMessageHTML(message, cssClass, attachment));
        scrollToBottom();
    } else {
        const el = document.getElementById(phoneNumber);
        if (el) {
            el.querySelector('.new-message-indicator').classList.add('new-message-indicator--visible');
            if (message) el.querySelector('.users__text').textContent = message;
        }
        if (from !== 'operator') playNotification();
    }
}

function scrollToBottom() {
    messagesWrapperList.scrollTop = messagesWrapperList.scrollHeight;
}

function playNotification() {
    if (notificationSound) { notificationSound.currentTime = 0; notificationSound.play().catch(() => {}); }
}

// ── Send message ──────────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!activeUser || (!text && !pendingFile)) return;

    const user = users.find(u => u.phoneNumber === activeUser);
    if (!user) return;

    // Send file if attached
    if (pendingFile) {
        // Capture references before clearing state
        const file = pendingFile;
        const chatId = activeUser;
        const chatPlatform = user.platform;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('phoneNumber', chatId);
        formData.append('platform', chatPlatform);
        formData.append('operatorName', operatorName);

        // Clear state immediately
        pendingFile = null;
        fileInput.value = '';
        filePreview.classList.add('visually-hidden');

        // Optimistic UI — show locally before server responds
        const reader = new FileReader();
        reader.onload = ev => {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/');
            const isVideo = file.type.startsWith('video/');
            const attachment = {
                type: isImage ? 'image' : isAudio ? 'audio' : isVideo ? 'video' : 'file',
                name: file.name,
                data: ev.target.result.split(',')[1],
                mime: file.type
            };
            addMessageToUI(chatId, text, 'operator', chatPlatform, attachment);
        };
        reader.readAsDataURL(file);

        fetch(`http://${URL}:8082/api/send-file`, { method: 'POST', body: formData })
            .then(r => { if (!r.ok) r.text().then(t => console.error('send-file error:', t)); })
            .catch(err => console.error('Error sending file:', err));
    }

    // Send text if not empty
    if (text && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            platform: user.platform,
            phoneNumber: activeUser,
            inputText: text,
            operatorName
        }));
        addMessageToUI(activeUser, text, 'operator');
        messageInput.value = '';
    } else {
        messageInput.value = '';
    }
});

// ── Active user ───────────────────────────────────────────────────────────────

function setActiveUser(chatId) {
    const user = users.find(u => u.phoneNumber === chatId);
    if (!user) return;

    const roleEl = document.querySelector('.page__settings-operator-role');
    const isAnalyst = roleEl && roleEl.dataset.role === 'analyst';

    if (!isAnalyst && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'setActiveUser', phoneNumber: chatId, operatorName, platform: user.platform }));
    }

    document.querySelectorAll('.users__item').forEach(el => el.classList.remove('users__item--active'));
    document.getElementById(chatId)?.classList.add('users__item--active');
    document.getElementById(chatId)?.querySelector('.new-message-indicator')?.classList.remove('new-message-indicator--visible');

    activeUser = chatId;
    messagesContent.style.justifyContent = 'space-between';
    selectMessage.classList.add('visually-hidden');
    form.classList.remove('visually-hidden');
    messagesList.innerHTML = '';
    messagesWrapperList.classList.remove('visually-hidden');
    messageInput.focus();

    fetch(`http://${URL}:8082/api/messages/${chatId}`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
            messagesList.innerHTML = '';
            data.forEach(msg => {
                const cssClass = messageClass(msg.message_type, msg.platform);
                const attachment = msg.attachment_type ? {
                    type: msg.attachment_type,
                    name: msg.attachment_name,
                    url:  msg.attachment_url
                } : null;
                messagesList.insertAdjacentHTML('beforeend', buildMessageHTML(msg.message_text, cssClass, attachment));
            });
            scrollToBottom();
        })
        .catch(err => console.error('Error fetching messages:', err));
}

function cancelActiveUser() {
    activeUser = null;
    document.querySelectorAll('.users__item').forEach(el => el.classList.remove('users__item--active'));
    messagesContent.style.justifyContent = 'center';
    selectMessage.classList.remove('visually-hidden');
    form.classList.add('visually-hidden');
    messagesList.innerHTML = '';
    messagesWrapperList.classList.add('visually-hidden');
    pendingFile = null;
    fileInput.value = '';
    filePreview.classList.add('visually-hidden');
}

// ── Incoming messages ─────────────────────────────────────────────────────────

function handleIncomingMessage(event) {
    try {
        const data = JSON.parse(event.data);

        if (data.action === 'clientTaken') { cancelActiveUser(); alert(data.message); return; }
        if (data.action === 'assignClient') return;
        if (!data.phoneNumber) return;

        let user = users.find(u => u.phoneNumber === data.phoneNumber);
        if (!user) {
            user = {
                phoneNumber: data.phoneNumber,
                name: data.name || 'Unknown User',
                platform: data.platform,
                profilePic: data.profilePic || '/img/avatar.jpg',
                lastMessage: data.message || '',
                messages: []
            };
            users.push(user);
            addUserToUI(user);
        } else if (data.message) {
            user.lastMessage = data.message;
            const el = document.getElementById(user.phoneNumber);
            if (el) el.querySelector('.users__text').textContent = data.message;
        }

        // Don't re-render operator messages that were already shown locally
        if (data.from === 'operator' && data.phoneNumber === activeUser) return;

        addMessageToUI(data.phoneNumber, data.message, data.from || data.platform, data.platform, data.attachment || null);
    } catch (err) {
        console.error('Error handling incoming message:', err);
    }
}

// ── Keyboard & misc ───────────────────────────────────────────────────────────

window.addEventListener('keydown', e => { if (e.key === 'Escape') cancelActiveUser(); });
messagesWrapperList.addEventListener('click', () => messageInput.focus());
document.body.addEventListener('contextmenu', e => e.preventDefault());

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    loadClients();
    document.querySelector('.page__settings_user-name').textContent = operatorName;

    const roleEl        = document.querySelector('.page__settings-operator-role');
    const addOperatorLink = document.querySelector('.page__settings-add-operator');
    const deleteDb      = document.querySelector('.page__settings-delete-db');

    const roleLabels = { admin: 'Администратор', operator: 'Оператор', analyst: 'Аналитик' };

    try {
        const res = await fetch(`http://${URL}:8082/getRole`);
        if (!res.ok) throw new Error('Failed to get role');
        const data = await res.json();
        const role = data.role || 'operator';
        roleEl.textContent = roleLabels[role] || role;
        roleEl.dataset.role = role;

        if (data.username) {
            operatorName = data.username;
            localStorage.setItem('operator', operatorName);
            document.querySelector('.page__settings_user-name').textContent = operatorName;
        }

        addOperatorLink.style.display = role === 'admin' ? 'flex' : 'none';
        deleteDb.style.display        = role === 'admin' ? 'flex' : 'none';
        if (role === 'analyst') form.remove();
    } catch (err) { console.error('Ошибка при загрузке роли:', err); }

    document.querySelector('.page__settings-form').addEventListener('submit', e => {
        e.preventDefault();
        window.location.href = '/add-operator';
    });

    deleteDb.addEventListener('click', () => {
        const dialog = document.querySelector('.confirm');
        dialog.classList.add('confirm--opened');

        const okHandler = async e => {
            e.preventDefault();
            await fetch(`http://${URL}:8082/clearDb`, { method: 'POST' }).catch(() => {});
            window.location.reload();
        };
        const cancelHandler = () => {
            dialog.classList.remove('confirm--opened');
            dialog.querySelector('.confirm__ok').removeEventListener('submit', okHandler);
            dialog.querySelector('.confirm__cancel').removeEventListener('click', cancelHandler);
        };
        dialog.querySelector('.confirm__ok').addEventListener('submit', okHandler, { once: true });
        dialog.querySelector('.confirm__cancel').addEventListener('click', cancelHandler, { once: true });
    });
});
