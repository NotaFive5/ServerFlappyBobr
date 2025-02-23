const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройки подключения к PostgreSQL через Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверка подключения к базе данных
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Ошибка подключения к базе данных:', err.stack);
    }
    console.log('✅ Подключение к базе данных PostgreSQL успешно!');
    release();
});

// Создание таблицы при запуске сервера
pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
        user_id TEXT PRIMARY KEY,
        username TEXT DEFAULT 'Unknown',
        best_score INTEGER DEFAULT 0
    )
`).then(() => console.log("🆕 Таблица 'scores' успешно создана."))
  .catch(err => console.error("❌ Ошибка при создании таблицы:", err));

// Эндпоинт для тестирования подключения
app.get('/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ message: 'Сервер работает!', time: result.rows[0] });
    } catch (err) {
        console.error('Ошибка выполнения запроса:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});
