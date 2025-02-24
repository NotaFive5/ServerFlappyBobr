const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Подключение к SQLite базе данных
const db = new sqlite3.Database('./scores.db', (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к базе данных:', err.message);
    } else {
        console.log('✅ Подключение к базе данных SQLite успешно!');
    }
});

// Создание таблицы при запуске сервера
db.run(`
    CREATE TABLE IF NOT EXISTS scores (
        username TEXT PRIMARY KEY,
        best_score INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error("❌ Ошибка при создании таблицы:", err.message);
    } else {
        console.log("🆕 Таблица 'scores' успешно создана.");
    }
});

// Получение лучшего результата пользователя по имени
app.get('/api/user_score/:username', (req, res) => {
    const username = req.params.username;
    db.get('SELECT best_score FROM scores WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error("❌ Ошибка запроса к базе данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда
app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing username or score' });
    }

    db.run(`
        INSERT INTO scores (username, best_score)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE 
        SET best_score = MAX(best_score, ?)
    `, [username, score, score], (err) => {
        if (err) {
            console.error("❌ Ошибка при сохранении рекорда:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Таблица лидеров (топ-10 игроков)
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT username, best_score FROM scores ORDER BY best_score DESC LIMIT 10', (err, rows) => {
        if (err) {
            console.error("❌ Ошибка при получении таблицы лидеров:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        const leaderboard = rows.map((row, index) => ({
            position: index + 1,
            username: row.username,
            score: row.best_score
        }));

        res.json(leaderboard);
    });
});

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
