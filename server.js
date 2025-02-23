const express = require('express');
const { Client } = require('pg');
const app = express();
const port = process.env.PORT || 5000;

// Подключение к базе данных PostgreSQL
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Подключаемся к базе данных
client.connect()
    .then(() => console.log('✅ Успешное подключение к базе данных PostgreSQL'))
    .catch(err => console.error('❌ Ошибка подключения к базе данных:', err));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Создание таблицы при запуске сервера
client.query(`
    CREATE TABLE IF NOT EXISTS scores (
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT 'Unknown',
        best_score INTEGER DEFAULT 0
    )
`).then(() => console.log("🆕 Таблица 'scores' успешно создана."))
  .catch(err => console.error("❌ Ошибка при создании таблицы:", err));

// 🚦 Получение лучшего результата пользователя
app.get('/api/user_score/:telegramUserId', async (req, res) => {
    const userId = req.params.telegramUserId;
    try {
        const result = await client.query('SELECT best_score FROM scores WHERE user_id = $1', [userId]);
        res.json({ best_score: result.rows.length > 0 ? result.rows[0].best_score : 0 });
    } catch (err) {
        console.error('❌ Ошибка при получении результата:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 🚀 Сохранение нового рекорда
app.post('/api/score', async (req, res) => {
    const { user_id, username, score } = req.body;
    if (!user_id || !username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing user_id, username, or score' });
    }

    try {
        await client.query(`
            INSERT INTO scores (user_id, username, best_score)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE 
            SET best_score = GREATEST(scores.best_score, $3), username = $2
        `, [user_id, username, score]);

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Ошибка при сохранении рекорда:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 📈 Таблица лидеров (топ-10 игроков)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await client.query('SELECT user_id, username, best_score FROM scores ORDER BY best_score DESC LIMIT 10');
        const leaderboard = result.rows.map((row, index) => ({
            position: index + 1,
            user_id: row.user_id,
            username: row.username,
            score: row.best_score
        }));
        res.json(leaderboard);
    } catch (err) {
        console.error("❌ Ошибка при получении таблицы лидеров:", err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
