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

        connection.query('SELECT sender_profile_pic FROM messages WHERE phone_number = ? LIMIT 1', [chatId], async (err, results) => {
            if (err) {
                console.error('Error checking profile picture:', err);
                return resolve(defaultPic);
            }

            if (results.length > 0 && results[0].sender_profile_pic) {
                return resolve(results[0].sender_profile_pic);
            }

            try {
                const photos = await bot.telegram.getUserProfilePhotos(chatId);
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const fileLink = await bot.telegram.getFileLink(fileId);

                    const profilePicUrl = fileLink.href;
                    connection.query('UPDATE messages SET sender_profile_pic = ? WHERE phone_number = ?', [profilePicUrl, chatId]);
                    return resolve(profilePicUrl);
                }
            } catch (error) {
                console.error('Error getting Telegram profile picture:', error);
            }

            resolve(defaultPic);
        });
    });
}

whatsappClient.initialize()
    .then(() => '')
    .catch(err => console.error('Failed to initialize WhatsApp client:', err));

const clientsMap = {};
const greetingSentMap = {};

wss.on('connection', (ws) => {
    ws.on('message', async (msg) => {
        const data = JSON.parse(msg);

        if (data.action === 'setActiveUser' && data.phoneNumber && data.operatorName) {
            const { phoneNumber, operatorName, platform } = data;

            if (clientsMap[phoneNumber] && clientsMap[phoneNumber] !== operatorName) {
                ws.send(JSON.stringify({
                    action: 'clientTaken',
                    message: 'Этот клиент занят другим оператором!'
                }));
            } else {
                clientsMap[phoneNumber] = operatorName;

                if (!greetingSentMap[phoneNumber]) {
                    const greetingMessage = `Привет! оператор: ${operatorName} готов ответить на ваши вопросы.`;

                    if (platform === 'whatsapp') {
                        whatsappClient.sendMessage(phoneNumber + '@c.us', greetingMessage)
                            .then(() => {
                                console.log('Greeting message sent to WhatsApp');
                                greetingSentMap[phoneNumber] = true;
                                saveGreetingMessageToDB(phoneNumber, 'whatsapp', operatorName, greetingMessage);

                                ws.send(JSON.stringify({
                                    phoneNumber: phoneNumber,
                                    message: greetingMessage,
                                    from: 'operator'
                                }));
                            })
                            .catch(err => console.error('Failed to send greeting message to WhatsApp:', err));
                    } else if (platform === 'telegram') {
                        bot.telegram.sendMessage(phoneNumber, greetingMessage)
                            .then(() => {
                                console.log('Greeting message sent to Telegram');
                                greetingSentMap[phoneNumber] = true;
                                saveGreetingMessageToDB(phoneNumber, 'telegram', operatorName, greetingMessage);

                                ws.send(JSON.stringify({
                                    phoneNumber: phoneNumber,
                                    message: greetingMessage,
                                    from: 'operator'
                                }));
                            })
                            .catch(err => console.error('Failed to send greeting message to Telegram:', err));
                    }
                }

                ws.send(JSON.stringify({ action: 'assignClient', success: true }));
            }
            if (data.inputText && data.phoneNumber) {
                const phoneNumber = data.phoneNumber;
                const messageText = data.inputText;
                const operatorName = data.operatorName || "Unknown Operator";
    
                const query = `
                    INSERT INTO messages (phone_number, platform, sender_name, message_text, message_type)
                    VALUES (?, ?, ?, ?, ?)
                `;
                connection.query(query, [phoneNumber, 'web', operatorName, messageText, 'operator'], (err, result) => {
                    if (err) {
                        console.error('Error saving operator message to database:', err);
                    } else {
                        console.log('Operator message saved to database');
    
                        wss.clients.forEach(client => {
                            if (client.readyState === client.OPEN) {
                                client.send(JSON.stringify({
                                    platform: 'web',
                                    phoneNumber: phoneNumber,
                                    message: messageText,
                                    from: 'operator'
                                }));
                            }
                        });
                    }
                });
    
                if (platform === 'whatsapp') {
                    whatsappClient.sendMessage(phoneNumber + '@c.us', greetingMessage)
                        .then(() => {
                            console.log('Greeting message sent to WhatsApp');
                            greetingSentMap[phoneNumber] = true;
                            saveGreetingMessageToDB(phoneNumber, 'whatsapp', operatorName, greetingMessage);
    
                            ws.send(JSON.stringify({
                                phoneNumber: phoneNumber,
                                message: greetingMessage,
                                from: 'operator'
                            }));
                        })
                        .catch(err => console.error('Failed to send greeting message to WhatsApp:', err));
                } else if (platform === 'telegram') {
                    bot.telegram.sendMessage(phoneNumber, greetingMessage)
                        .then(() => {
                            console.log('Greeting message sent to Telegram');
                            greetingSentMap[phoneNumber] = true;
                            saveGreetingMessageToDB(phoneNumber, 'telegram', operatorName, greetingMessage);
    
                            ws.send(JSON.stringify({
                                phoneNumber: phoneNumber,
                                message: greetingMessage,
                                from: 'operator'
                            }));
                        })
                        .catch(err => console.error('Failed to send greeting message to Telegram:', err));
                }
            }
        }
    });

    ws.on('close', () => {
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

app.get('/getRole', (req, res) => {
    const username = req.session.username;
    
    const query = 'SELECT role FROM operators WHERE username = ? LIMIT 1';
    
    connection.query(query, [username], (err, result) => {
        if (err) {
            console.error('Ошибка при запросе к базе данных:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ role: result[0].role });
    });
})

function saveGreetingMessageToDB(phoneNumber, platform, operatorName, messageText) {
    console.log(`Inserting greeting message into DB for ${platform} user: ${phoneNumber}`);
    const query = `
        INSERT INTO messages (phone_number, platform, sender_name, message_text, message_type)
        VALUES (?, ?, ?, ?, ?)
    `;
    connection.query(query, [phoneNumber, platform, operatorName, messageText, 'operator'], (err, result) => {
        if (err) {
            console.error('Error saving greeting message to database:', err);
        } else {
            console.log('Greeting message saved to database');
        }
    });
}

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
