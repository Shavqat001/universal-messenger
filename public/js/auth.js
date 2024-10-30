const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('./db');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

router.post('/register', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM operators WHERE username = ?', [username], (err, results) => {
        if (results.length > 0) {
            return res.send('Пользователь с таким именем уже существует.');
        } else {
            const hashedPassword = hashPassword(password);
            db.query('INSERT INTO operators (username, password) VALUES (?, ?)', 
                     [username, hashedPassword], (err, result) => {
                if (err) throw err;
                res.send('success'); 
            });
        }
    });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM operators WHERE username = ?', [username], (err, results) => {
        if (results.length === 0) {
            return res.send('Неверное имя пользователя или пароль.');
        } else {
            const user = results[0];
            if (hashPassword(password) === user.password) {
                res.send('success'); 
            } else {
                res.send('Неверное имя пользователя или пароль.');
            }
        }
    });
});

module.exports = router;