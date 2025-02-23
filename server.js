const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const db = new sqlite3.Database('./scores.db');

// Создание таблицы, если её нет
db.run(`
    CREATE TABLE IF NOT EXISTS scores (
        user_id TEXT PRIMARY KEY,
        best_score INTEGER DEFAULT 0
    )
`);

// Получение лучшего результата пользователя
app.get('/api/user_score/:telegramUserId', (req, res) => {
    const userId = req.params.telegramUserId;
    db.get('SELECT best_score FROM scores WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда
app.post('/api/score', (req, res) => {
    const { user_id, score } = req.body;
    if (!user_id || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing user_id or score' });
    }

    db.run(`
        INSERT INTO scores (user_id, best_score)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET best_score = MAX(best_score, ?)
    `, [user_id, score, score], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
