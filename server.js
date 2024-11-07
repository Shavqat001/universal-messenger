require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('ws');
const { Telegraf } = require('telegraf');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./public/js/auth');
const connection = require('./public/js/db');

const app = express();
const port = process.env.SERVER_PORT;

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: [`http://${process.env.URL}:8082`],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

function isAuthenticated(req, res, next) {
    if (req.session.username) {
        next();
    } else {
        res.redirect('/');
    }
}

app.use('/auth', authRoutes);

app.get('/', (req, res) => res.sendFile(path.resolve('authorization.html')));
app.get('/add-operator', isAuthenticated, (req, res) => res.sendFile(path.resolve('add-operator.html')));
app.get('/index', isAuthenticated, (req, res) => {
    if (!req.session.username) {
        return res.redirect('/authorization');
    }
    res.sendFile(path.resolve('index.html'));
});

app.get('/auth', (req, res) => res.sendFile(path.resolve(__dirname, 'authorization.html')));

app.get('/api/last_message/:phoneNumber', (req, res) => {
    const phoneNumber = req.params.phoneNumber;
    const query = 'SELECT * FROM messages WHERE phone_number = ? ORDER BY timestamp DESC LIMIT 1';

    connection.query(query, [phoneNumber], (err, results) => {
        if (err) {
            console.error('Error fetching last message:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            res.json(results[0] || {});
        }
    });
});
app.post('/api/save_message', (req, res) => {
    const { phoneNumber, messageText, messageType, platform } = req.body;

    const query = `
        INSERT INTO messages (phone_number, platform, message_text, message_type)
        VALUES (?, ?, ?, ?)
    `;
    connection.query(query, [phoneNumber, platform, messageText, messageType], (err, result) => {
        if (err) {
            console.error('Error saving message to database:', err);
            res.status(500).json({ error: 'Failed to save message to database' });
        } else {
            res.status(200).json({ success: true, message: 'Message saved successfully' });
        }
    });
});
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.status(200).json({ message: 'Logged out successfully' });
});

const wss = new Server({ port: process.env.WS_PORT });

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start();

bot.on('text', async (ctx) => {
    const chatId = ctx.chat.id;
    const name = ctx.chat.first_name || 'Telegram User';
    const phoneNumber = chatId.toString();

    let profilePicUrl = await getTelegramProfilePic(chatId) || './img/avatar.jpg';

    try {
        const photos = await bot.telegram.getUserProfilePhotos(chatId);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const fileLink = await bot.telegram.getFileLink(fileId);
            profilePicUrl = fileLink.href;
        }
    } catch (error) {
        console.error('Error getting Telegram profile picture:', error);
    }

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({
                platform: 'telegram',
                phoneNumber: phoneNumber,
                name: name,
                message: ctx.message.text,
                profilePic: profilePicUrl
            }));
        }
    });

    const query = `
        INSERT INTO messages (phone_number, platform, sender_name, sender_profile_pic, message_text, message_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    connection.query(query, [phoneNumber, 'telegram', name, profilePicUrl, ctx.message.text, 'client'], (err, result) => {
        if (err) {
            console.error('Error saving client message to database:', err);
        } else {
            console.log('Client message saved to database');
        }
    });
});

bot.launch()
    .then(() => console.log('Telegram bot launched successfully'))
    .catch(err => console.error('Failed to launch Telegram bot:', err));

const whatsappClient = new Client({
    authStrategy: new LocalAuth()
});

whatsappClient.on('qr', (qr) => qrcode.generate(qr, { small: true }));
whatsappClient.on('ready', () => console.log('WhatsApp client is ready'));

whatsappClient.on('message', async message => {
    const contact = await whatsappClient.getContactById(message.from);
    const displayName = contact.pushname || contact.name || 'WhatsApp User';
    const realPhoneNumber = contact.number || message.from.replace('@c.us', '');

    let profilePicUrl = './img/avatar.jpg';
    try {
        profilePicUrl = await contact.getProfilePicUrl();
    } catch (err) {
        console.error('Error getting WhatsApp profile picture:', err);
    }

    wss.clients.forEach(function each(client) {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({
                platform: 'whatsapp',
                phoneNumber: realPhoneNumber,
                name: displayName,
                message: message.body,
                profilePic: profilePicUrl
            }));
        }
    });

    const query = `
        INSERT INTO messages (phone_number, platform, sender_name, sender_profile_pic, message_text, message_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    connection.query(query, [realPhoneNumber, 'whatsapp', displayName, profilePicUrl, message.body, 'client'], (err, result) => {
        if (err) throw err;
    });
});

async function getTelegramProfilePic(chatId) {
    return new Promise((resolve) => {
        const defaultPic = './img/avatar.jpg';

        // Проверяем, есть ли фото в базе
        connection.query('SELECT sender_profile_pic FROM messages WHERE phone_number = ? LIMIT 1', [chatId], async (err, results) => {
            if (err) {
                console.error('Error checking profile picture:', err);
                return resolve(defaultPic);
            }

            // Если фото уже есть в базе, возвращаем его
            if (results.length > 0 && results[0].sender_profile_pic) {
                return resolve(results[0].sender_profile_pic);
            }

            // Иначе запрашиваем у Telegram
            try {
                const photos = await bot.telegram.getUserProfilePhotos(chatId);
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const fileLink = await bot.telegram.getFileLink(fileId);

                    // Сохраняем ссылку на фото в базу
                    const profilePicUrl = fileLink.href;
                    connection.query('UPDATE messages SET sender_profile_pic = ? WHERE phone_number = ?', [profilePicUrl, chatId]);
                    return resolve(profilePicUrl);
                }
            } catch (error) {
                console.error('Error getting Telegram profile picture:', error);
            }

            // Если не удалось получить фото, возвращаем дефолтное
            resolve(defaultPic);
        });
    });
}

whatsappClient.initialize()
    .then(() => '')
    .catch(err => console.error('Failed to initialize WhatsApp client:', err));

const clientsMap = {};

wss.on('connection', (ws) => {
    ws.on('message', async (msg) => {
        const data = JSON.parse(msg);

        const inputText = data.inputText || '';
        const phoneNumber = data.phoneNumber;

        // Обработка действия setActiveUser
        if (data.action === 'setActiveUser' && data.phoneNumber && data.operatorName) {
            const { phoneNumber, operatorName } = data;
        
            // Проверка, привязан ли клиент к другому оператору
            if (!clientsMap[phoneNumber]) {
                clientsMap[phoneNumber] = operatorName;
        
                const greetingMessage = `Привет! оператор: ${operatorName} готов ответить на ваши вопросы.`;
                bot.telegram.sendMessage(phoneNumber, greetingMessage)
                    .then(() => console.log('Greeting message sent to Telegram'))
                    .catch(err => console.error('Failed to send greeting message to Telegram:', err));
        
                // Уведомляем текущего оператора, что клиент назначен ему
                ws.send(JSON.stringify({ action: 'assignClient', success: true }));
            } else if (clientsMap[phoneNumber] !== operatorName) {
                // Если клиент уже обслуживается другим оператором, показываем alert и отменяем действие
                ws.send(JSON.stringify({ action: 'clientTaken', message: 'Этот клиент занят другим оператором' }));
            }
        }
        // Обработка сообщений
        if (inputText.trim()) {
            connection.query('SELECT * FROM messages WHERE phone_number = ? LIMIT 1', [phoneNumber], (err, results) => {
                if (err) {
                    console.error('Error fetching profile picture:', err);
                    return;
                }

                const userProfilePic = results.length > 0 ? results[0].sender_profile_pic : './img/avatar.jpg';

                // Отправка сообщения всем подключенным клиентам
                wss.clients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        client.send(JSON.stringify({
                            platform: data.platform,
                            message: inputText,
                            phoneNumber: phoneNumber,
                            from: 'operator',
                            profilePic: userProfilePic
                        }));
                    }
                });

                // Отправляем сообщение только если текст не пустой
                if (data.platform === 'telegram') {
                    bot.telegram.sendMessage(phoneNumber, inputText)
                        .then(() => console.log('Message sent to Telegram'))
                        .catch(err => console.error('Failed to send message to Telegram:', err));
                } else if (data.platform === 'whatsapp') {
                    whatsappClient.sendMessage(phoneNumber + '@c.us', inputText)
                        .then(() => console.log('Message sent to WhatsApp'))
                        .catch(err => console.error('Failed to send message to WhatsApp:', err));
                }

                // Сохраняем сообщение в базе данных
                const query = `
                        INSERT INTO messages (phone_number, platform, sender_name, sender_profile_pic, message_text, message_type)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;
                connection.query(query, [phoneNumber, data.platform, 'Operator', userProfilePic, inputText, 'operator'], (err, result) => {
                    if (err) {
                        console.error('Error saving message to database:', err);
                    } else {
                        console.log('Message saved to database');
                    }
                });
            });
        }
    });

    ws.on('close', () => {
        // Удаляем оператора из clientsMap при разрыве соединения
        for (let client in clientsMap) {
            if (clientsMap[client] === ws.operatorName) {
                delete clientsMap[client];
            }
        }
    });
});


app.get('/api/clients', (req, res) => {
    const query = 'SELECT DISTINCT phone_number, sender_name, platform, sender_profile_pic FROM messages';

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching clients:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            res.json(results);
        }
    });
});

app.get('/api/messages/:phoneNumber', (req, res) => {
    const phoneNumber = req.params.phoneNumber;
    const query = 'SELECT * FROM messages WHERE phone_number = ? ORDER BY timestamp ASC';
    connection.query(query, [phoneNumber], (err, results) => {
        if (err) {
            console.error('Error fetching messages:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else {
            res.json(results);
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://${process.env.URL}:${port}`);
});