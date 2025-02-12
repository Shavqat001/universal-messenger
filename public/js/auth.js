const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('./db');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

router.post('/register', (req, res) => {
    const { username, role, password } = req.body;
    db.query('SELECT * FROM operators WHERE username = ?', [username], (err, results) => {
        if (results.length > 0) {
            return res.send('Пользователь с таким именем уже существует.');
        } else {
            const hashedPassword = hashPassword(password);
            db.query('INSERT INTO operators (username, role, password) VALUES (?, ?, ?)',
                [username, role, hashedPassword], (err, result) => {
                    if (err) throw err;
                    res.send('success');
                });
        }
    });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM operators WHERE username = ?', [username], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (results.length === 0) {
            return res.send('Неверное имя пользователя или пароль.');
        } else {
            const user = results[0];
            if (hashPassword(password) === user.password) {
                req.session.username = username; // Устанавливаем сессию
                res.send('success');
            } else {
                res.send('Неверное имя пользователя или пароль.');
            }
        }
    });
});

module.exports = router;
