// Используем ES Module синтаксис вместо require
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';

// Настройки пути для ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Инициализация базы данных
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

// Загрузка данных из базы при старте
async function initDB() {
    await db.read();
    db.data ||= { scores: [] };
    await db.write();
}
initDB();

// Секретный ключ для HMAC
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR_SECRET_KEY';

// Создание сервера
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ограничение частоты запросов (Rate Limiting)
const scoreLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 10, // не более 10 запросов в минуту
    message: "Слишком много запросов. Попробуйте позже."
});
app.use('/api/score', scoreLimiter);

// Проверка подписи HMAC
function validateSignature(req, res, next) {
    const signature = req.headers['x-signature'];
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');

    if (signature !== expectedSignature) {
        console.error('Ошибка: Неверная подпись запроса.');
        return res.status(403).json({ error: "Неверная подпись" });
    }
    next();
}

//  Получение лучшего счёта пользователя
app.get('/api/user_score/:username', async (req, res) => {
    const { username } = req.params;
    await db.read();

    const userData = db.data.scores.find(user => user.username === username);
    if (userData) {
        res.json({ best_score: userData.score });
    } else {
        res.json({ best_score: 0 });
    }
});

//  Сохранение нового рекорда
app.post('/api/score', validateSignature, async (req, res) => {
    try {
        console.log('Получен POST запрос на /api/score');
        console.log('Тело запроса:', req.body);

        const { username, score } = req.body;

        if (!username || typeof score !== 'number' || score <= 0) {
            return res.status(400).json({ error: "Некорректные данные" });
        }

        await db.read();
        const existingUser = db.data.scores.find(user => user.username === username);

        if (existingUser) {
            if (score > existingUser.score) {
                existingUser.score = score;
                await db.write();
                console.log(`Обновлен рекорд для ${username}: ${score}`);
            }
        } else {
            db.data.scores.push({ username, score });
            await db.write();
            console.log(`Добавлен новый игрок ${username} с результатом ${score}`);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Ошибка при обработке запроса на /api/score:', error);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

//  Очистка базы данных (обнуление)
app.post('/api/reset_db', async (req, res) => {
    try {
        db.data = { scores: [] }; // Обнуляем данные
        await db.write(); // Сохраняем пустую базу данных
        console.log('База данных успешно обнулена.');
        res.json({ success: true, message: 'База данных обнулена.' });
    } catch (error) {
        console.error('Ошибка при обнулении базы данных:', error);
        res.status(500).json({ error: 'Ошибка при обнулении базы данных' });
    }
});

//  Получение глобального рейтинга (топ-10 игроков)
app.get('/api/leaderboard', async (req, res) => {
    await db.read();

    const limit = parseInt(req.query.limit) || 10; // Чтение лимита из параметров запроса
    console.log(`Запрос таблицы лидеров (лимит: ${limit})`);

    const leaderboard = db.data.scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry, index) => ({
            position: index + 1,
            username: entry.username,
            score: entry.score
        }));

    if (leaderboard.length === 0) {
        console.log("Таблица лидеров пуста.");
        return res.json([]);
    }

    console.log("Отправка таблицы лидеров:", leaderboard);
    res.json(leaderboard);
});

//  Запуск сервера с обработкой ошибок
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Ошибка при запуске сервера:', err);
});
