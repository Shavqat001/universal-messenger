const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('./db');

const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

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