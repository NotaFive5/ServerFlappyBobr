const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'scores.db');

// ❌ Удаление старой базы данных, если существует
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Старая база данных удалена.');
}

// 📦 Создание новой базы данных
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка при создании базы данных:', err.message);
    } else {
        console.log('Создана новая база данных.');
    }
});

// 🛠️ Создание таблицы с нужной структурой
db.run(`
    CREATE TABLE IF NOT EXISTS scores (
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT 'Unknown',
        best_score INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error('Ошибка при создании таблицы:', err.message);
    } else {
        console.log('Таблица "scores" успешно создана.');
    }
});

// Получение лучшего результата пользователя
app.get('/api/user_score/:telegramUserId', (req, res) => {
    const userId = req.params.telegramUserId;
    db.get('SELECT best_score FROM scores WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда
app.post('/api/score', (req, res) => {
    const { user_id, username, score } = req.body;
    if (!user_id || !username || typeof score === 'undefined') {
        console.error('Invalid data received:', req.body);
        return res.status(400).json({ error: 'Missing user_id, username, or score' });
    }

    db.run(`
        INSERT INTO scores (user_id, username, best_score)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE 
        SET best_score = MAX(best_score, ?), username = ?
    `, [user_id, username, score, score, username], (err) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Получение таблицы лидеров (топ-10 игроков)
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT user_id, username, best_score FROM scores ORDER BY best_score DESC LIMIT 10', (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (rows.length === 0) {
            console.log('Нет данных для таблицы лидеров.');
            return res.json([]);
        }

        const leaderboard = rows.map((row, index) => ({
            position: index + 1,
            user_id: row.user_id,
            username: row.username, 
            score: row.best_score
        }));

        console.log('Отправка таблицы лидеров:', leaderboard);
        res.json(leaderboard);
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
