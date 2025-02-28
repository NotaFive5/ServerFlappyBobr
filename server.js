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
    db.data ||= { scores: [], referrals: [] };
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
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 10, // не более 10 запросов в минуту
    message: "Слишком много запросов. Попробуйте позже."
});
app.use(limiter);

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

// 🚦 Генерация и получение реферальной ссылки
app.get('/api/referral_link/:username', async (req, res) => {
    const { username } = req.params;
    await db.read();

    if (!db.data.referrals) {
        db.data.referrals = [];
    }

    let referral = db.data.referrals.find(r => r.username === username);

    if (!referral) {
        referral = {
            username,
            referral_link: `https://t.me/BotName?start=ref_${username}`
        };
        db.data.referrals.push(referral);
        await db.write();
    }

    res.json({ referral_link: referral.referral_link });
});

// 🚦 Получение лучшего счёта пользователя
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

// 🚀 Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Ошибка при запуске сервера:', err);
});
