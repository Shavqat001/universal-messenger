const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('./db');

const hashPassword = (password) =>
    crypto.createHash('sha256').update(password).digest('hex');

router.post('/register', async (req, res) => {
    const { username, role, password } = req.body;
    try {
        const existing = await db.query(
            'SELECT id FROM operators WHERE username = ?',
            [username]
        );
        if (existing.length > 0) {
            return res.send('Пользователь с таким именем уже существует.');
        }
        await db.query(
            'INSERT INTO operators (username, role, password) VALUES (?, ?, ?)',
            [username, role, hashPassword(password)]
        );
        res.send('success');
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).send('Ошибка сервера');
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const results = await db.query(
            'SELECT * FROM operators WHERE username = ?',
            [username]
        );
        if (results.length === 0) {
            return res.send('Неверное имя пользователя или пароль.');
        }
        const user = results[0];
        if (hashPassword(password) === user.password.toLowerCase()) {
            req.session.username = username;
            res.send('success');
        } else {
            res.send('Неверное имя пользователя или пароль.');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('Внутренняя ошибка сервера');
    }
});

module.exports = router;
