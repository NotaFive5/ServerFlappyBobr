const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 80;

// Подключение к новой базе данных SQLite
const dbPath = path.join(__dirname, 'board.db');

// Проверка существования новой базы данных, если нет — создаем
if (!fs.existsSync(dbPath)) {
    console.log('🆕 Новая база данных не найдена. Создание board.db...');
    fs.openSync(dbPath, 'w');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к базе данных board.db:', err.message);
    } else {
        console.log('✅ Подключение к базе данных board.db успешно!');
    }
});

// Создание таблицы в новой базе данных при запуске сервера
db.run(`
    CREATE TABLE IF NOT EXISTS board (
        username TEXT PRIMARY KEY,
        best_score INTEGER DEFAULT 0
    )
`, (err) => {
    if (err) {
        console.error("❌ Ошибка при создании таблицы board:", err.message);
    } else {
        console.log("🆕 Таблица 'board' успешно создана.");
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Получение лучшего результата пользователя по username из новой базы данных
app.get('/api/user_score/:username', (req, res) => {
    const username = req.params.username;
    console.log(`Запрос на получение данных для пользователя: ${username}`);
    db.get('SELECT best_score FROM board WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error("❌ Ошибка базы данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
            console.warn(`Пользователь ${username} не найден в базе данных.`);
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Проверка данных в базе данных
app.get('/api/check_db', (req, res) => {
    db.all('SELECT * FROM board', (err, rows) => {
        if (err) {
            console.error("❌ Ошибка при чтении данных из board.db:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ data: rows });
    });
});

// Сохранение нового рекорда по username в новой базе данных
app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing username or score' });
    }

    db.run(`
        INSERT INTO board (username, best_score)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE 
        SET best_score = MAX(best_score, ?)
    `, [username, score, score], (err) => {
        if (err) {
            console.error("❌ Ошибка при сохранении рекорда:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log(`Рекорд пользователя ${username} успешно сохранен: ${score}`);
        res.json({ success: true });
    });
});

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
