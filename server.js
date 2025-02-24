const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

// Подключение к новой базе данных SQLite
const dbPath = path.join(__dirname, 'new_scores.db');

// Проверка существования новой базы данных, если нет — создаем
if (!fs.existsSync(dbPath)) {
    console.log('🆕 Новая база данных не найдена. Создание new_scores.db...');
    fs.openSync(dbPath, 'w');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к новой базе данных:', err.message);
    } else {
        console.log('✅ Подключение к базе данных new_scores.db успешно!');
    }
});

// Создание таблицы в новой базе данных при запуске сервера
db.run(`
    CREATE TABLE IF NOT EXISTS new_scores (
        username TEXT PRIMARY KEY,
        best_score INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error("❌ Ошибка при создании таблицы new_scores:", err.message);
    } else {
        console.log("🆕 Таблица 'new_scores' успешно создана.");
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Получение лучшего результата пользователя по username из новой базы данных
app.get('/api/user_score/:username', (req, res) => {
    const username = req.params.username;
    db.get('SELECT best_score FROM new_scores WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error("❌ Ошибка запроса к новой базе данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда по username в новой базе данных
app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing username or score' });
    }

    db.run(`
        INSERT INTO new_scores (username, best_score)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE 
        SET best_score = MAX(best_score, ?)
    `, [username, score, score], (err) => {
        if (err) {
            console.error("❌ Ошибка при сохранении рекорда в новую базу данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});

// Таблица лидеров (топ-10 игроков) из новой базы данных
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT username, best_score FROM new_scores ORDER BY best_score DESC LIMIT 10', (err, rows) => {
        if (err) {
            console.error("❌ Ошибка при получении таблицы лидеров из новой базы данных:", err.message);
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
