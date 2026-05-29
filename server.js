require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('ws');
const { Telegraf } = require('telegraf');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const authRoutes = require('./public/js/auth');
const db = require('./public/js/db');

const app = express();
const port = process.env.SERVER_PORT;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: [`http://${process.env.URL}:${process.env.SERVER_PORT}`],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

function isAuthenticated(req, res, next) {
    if (req.session.username) return next();
    res.redirect('/');
}

async function saveMessageToDB(phoneNumber, platform, senderName, messageText, messageType, attachment = null) {
    try {
        await db.query(
            `INSERT INTO messages
                (phone_number, platform, sender_name, message_text, message_type, attachment_url, attachment_name, attachment_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                phoneNumber, platform, senderName,
                messageText || '', messageType,
                attachment?.url || null,
                attachment?.name || null,
                attachment?.type || null
            ]
        );
    } catch (err) {
        console.error('Error saving message to database:', err);
    }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);

app.get('/', (req, res) => res.sendFile(path.resolve('authorization.html')));
app.get('/add-operator', isAuthenticated, (req, res) => res.sendFile(path.resolve('add-operator.html')));
app.get('/index', isAuthenticated, (req, res) => res.sendFile(path.resolve('index.html')));

app.get('/api/messages/:phoneNumber', isAuthenticated, async (req, res) => {
    try {
        const results = await db.query(
            `SELECT * FROM messages WHERE phone_number = ? ORDER BY timestamp ASC`,
            [req.params.phoneNumber]
        );
        res.json(results);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/clients', isAuthenticated, async (req, res) => {
    try {
        const results = await db.query(`
            SELECT
                m.phone_number,
                m.sender_name,
                m.platform,
                m.sender_profile_pic,
                (SELECT TOP 1 message_text
                 FROM messages sub
                 WHERE sub.phone_number = m.phone_number
                 ORDER BY sub.timestamp DESC) AS last_message
            FROM messages m
            WHERE m.message_type = 'client'
              AND m.id = (
                  SELECT MIN(id) FROM messages
                  WHERE phone_number = m.phone_number AND message_type = 'client'
              )
            ORDER BY (
                SELECT TOP 1 timestamp FROM messages sub2
                WHERE sub2.phone_number = m.phone_number
                ORDER BY sub2.timestamp DESC
            ) DESC
        `);
        res.json(results);
    } catch (err) {
        console.error('Error fetching clients:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getRole', isAuthenticated, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT TOP 1 role FROM operators WHERE username = ?',
            [req.session.username]
        );
        if (result.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        res.json({ role: result[0].role, username: req.session.username });
    } catch (err) {
        console.error('Error fetching role:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/clearDb', isAuthenticated, async (req, res) => {
    try {
        await db.query('DELETE FROM messages');
        res.json({ success: true });
    } catch (err) {
        console.error('Error clearing DB:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Send file from operator to client
app.post('/api/send-file', isAuthenticated, upload.single('file'), async (req, res) => {
    const { phoneNumber, platform, operatorName } = req.body;
    const file = req.file;

    if (!file || !phoneNumber) {
        return res.status(400).json({ error: 'Missing file or phoneNumber' });
    }

    const mime = file.mimetype;
    const fileType = mime.startsWith('image/') ? 'image'
                   : mime.startsWith('audio/') ? 'audio'
                   : mime.startsWith('video/') ? 'video'
                   : 'file';
    const attachment = { name: file.originalname, type: fileType, url: null };

    try {
        if (platform === 'telegram') {
            const input = { source: file.buffer, filename: file.originalname };
            try {
                if (fileType === 'image') {
                    await bot.telegram.sendPhoto(phoneNumber, input);
                } else if (fileType === 'audio') {
                    await bot.telegram.sendAudio(phoneNumber, input);
                } else if (fileType === 'video') {
                    await bot.telegram.sendVideo(phoneNumber, input);
                } else {
                    await bot.telegram.sendDocument(phoneNumber, input);
                }
            } catch {
                // Fallback: send as document if media-specific method fails
                await bot.telegram.sendDocument(phoneNumber, input);
            }
        }

        await saveMessageToDB(phoneNumber, platform || 'web', operatorName || 'Оператор', '', 'operator', attachment);

        const wsPayload = JSON.stringify({
            platform: platform || 'web',
            phoneNumber,
            message: '',
            from: 'operator',
            attachment: {
                name: file.originalname,
                type: fileType,
                data: file.buffer.toString('base64'),
                mime
            }
        });

        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) client.send(wsPayload);
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ error: 'Failed to send file' });
    }
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

const wss = new Server({ port: process.env.WS_PORT });
const clientsMap = {};

wss.on('connection', (ws) => {
    ws.on('message', async (msg) => {
        let data;
        try { data = JSON.parse(msg); } catch { return; }

        if (data.action === 'setActiveUser' && data.phoneNumber && data.operatorName) {
            const { phoneNumber, operatorName } = data;

            if (clientsMap[phoneNumber] && clientsMap[phoneNumber] !== operatorName) {
                ws.send(JSON.stringify({ action: 'clientTaken', message: 'Этот клиент занят другим оператором!' }));
                return;
            }

            clientsMap[phoneNumber] = operatorName;
            ws.operatorName = operatorName;
            ws.send(JSON.stringify({ action: 'assignClient', success: true, phoneNumber }));
        }

        if (data.action === 'releaseClient' && data.phoneNumber) {
            if (clientsMap[data.phoneNumber] === ws.operatorName) {
                delete clientsMap[data.phoneNumber];
            }
        }

        if (data.inputText && data.phoneNumber) {
            const { phoneNumber, inputText: messageText, operatorName = 'Оператор', platform } = data;

            await saveMessageToDB(phoneNumber, platform || 'web', operatorName, messageText, 'operator');

            wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ platform: platform || 'web', phoneNumber, message: messageText, from: 'operator' }));
                }
            });

            if (platform === 'telegram') {
                bot.telegram.sendMessage(phoneNumber, messageText)
                    .catch(err => console.error('Failed to send to Telegram:', err));
            }
        }
    });

    ws.on('close', () => {
        if (ws.operatorName) {
            for (const phone in clientsMap) {
                if (clientsMap[phone] === ws.operatorName) delete clientsMap[phone];
            }
        }
    });
});

// ── Telegram bot ──────────────────────────────────────────────────────────────

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.start((ctx) => {
    ctx.reply('Здравствуйте! Напишите ваш вопрос, и оператор скоро ответит.');
});

// Helper: broadcast incoming Telegram message to all operators
function broadcastToOperators(payload) {
    const json = JSON.stringify(payload);
    console.log('payload: ', payload);

    wss.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(json); });
}

async function saveIncomingTelegramMessage(ctx, messageText, attachment = null) {
    console.log("ctx: ", ctx);

    const chatId = ctx.chat.id;
    const name = ctx.chat.first_name || 'Telegram User';
    const phoneNumber = chatId.toString();
    const profilePicUrl = await getTelegramProfilePic(chatId);

    broadcastToOperators({
        platform: 'telegram', phoneNumber, name,
        message: messageText, profilePic: profilePicUrl,
        attachment
    });

    await db.query(
        `INSERT INTO messages
            (phone_number, platform, sender_name, sender_profile_pic, message_text, message_type, attachment_url, attachment_name, attachment_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [phoneNumber, 'telegram', name, profilePicUrl, messageText || '', 'client',
            attachment?.url || null, attachment?.name || null, attachment?.type || null]
    ).catch(err => console.error('Error saving client message:', err));
}

bot.on('text', async (ctx) => {
    await saveIncomingTelegramMessage(ctx, ctx.message.text);
});

bot.on('photo', async (ctx) => {
    const photo = ctx.message.photo.at(-1);
    const fileLink = await bot.telegram.getFileLink(photo.file_id);
    const caption = ctx.message.caption || '';
    await saveIncomingTelegramMessage(ctx, caption, {
        url: fileLink.href, name: 'photo.jpg', type: 'image'
    });
});

bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    const fileLink = await bot.telegram.getFileLink(doc.file_id);
    const caption = ctx.message.caption || '';
    await saveIncomingTelegramMessage(ctx, caption, {
        url: fileLink.href, name: doc.file_name || 'file', type: 'file'
    });
});

bot.on('voice', async (ctx) => {
    const fileLink = await bot.telegram.getFileLink(ctx.message.voice.file_id);
    await saveIncomingTelegramMessage(ctx, '🎤 Голосовое сообщение', {
        url: fileLink.href, name: 'voice.ogg', type: 'audio'
    });
});

bot.on('video', async (ctx) => {
    const fileLink = await bot.telegram.getFileLink(ctx.message.video.file_id);
    const caption = ctx.message.caption || '';
    await saveIncomingTelegramMessage(ctx, caption, {
        url: fileLink.href, name: 'video.mp4', type: 'video'
    });
});

async function getTelegramProfilePic(chatId) {
    const defaultPic = './img/avatar.jpg';
    try {
        const results = await db.query(
            `SELECT TOP 1 sender_profile_pic FROM messages
             WHERE phone_number = ? AND sender_profile_pic IS NOT NULL`,
            [chatId.toString()]
        );
        if (results.length > 0 && results[0].sender_profile_pic) return results[0].sender_profile_pic;

        const photos = await bot.telegram.getUserProfilePhotos(chatId);
        if (photos.total_count > 0) {
            const fileId = photos.photos[0][0].file_id;
            const fileLink = await bot.telegram.getFileLink(fileId);
            return fileLink.href;
        }
    } catch { }
    return defaultPic;
}

bot.launch()
    .then(() => console.log('Telegram bot launched'))
    .catch(err => console.error('Failed to launch Telegram bot:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(port, () => {
    console.log(`Server running on http://${process.env.URL}:${port}`);
});
