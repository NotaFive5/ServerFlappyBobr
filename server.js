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
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT 'Unknown',
        best_score INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error("❌ Ошибка при создании таблицы:", err.message);
    } else {
        console.log("🆕 Таблица 'scores' успешно создана.");
    }
});

// Получение лучшего результата пользователя
app.get('/api/user_score/:telegramUserId', (req, res) => {
    const userId = req.params.telegramUserId;
    db.get('SELECT best_score FROM scores WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            console.error("❌ Ошибка запроса к базе данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда
app.post('/api/score', (req, res) => {
    const { user_id, username, score } = req.body;
    if (!user_id || !username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing user_id, username, or score' });
    }

    db.run(`
        INSERT INTO scores (user_id, username, best_score)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE 
        SET best_score = MAX(best_score, ?), username = ?
    `, [user_id, username, score, score, username], (err) => {
        if (err) {
            console.error("❌ Ошибка при сохранении рекорда:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Таблица лидеров (топ-10 игроков)
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT user_id, username, best_score FROM scores ORDER BY best_score DESC LIMIT 10', (err, rows) => {
        if (err) {
            console.error("❌ Ошибка при получении таблицы лидеров:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        const leaderboard = rows.map((row, index) => ({
            position: index + 1,
            user_id: row.user_id,
            username: row.username,
            score: row.best_score
        }));

        res.json(leaderboard);
    });
});

// 📦 Маршрут для получения всех данных из таблицы scores
app.get('/api/all_scores', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scores');
        res.json(result.rows);
    } catch (err) {
        console.error("Ошибка при получении всех данных из таблицы:", err);
        res.status(500).json({ error: 'Database error' });
    }
});


app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
