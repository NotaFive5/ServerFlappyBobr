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
    db.data ||= { scores: [], referrals: [] }; // Добавляем поле для рефералов
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

// Генерация реферального кода
function generateReferralCode(username) {
    return crypto.createHash('sha256').update(username + Date.now()).digest('hex').slice(0, 8);
}

// Получение реферального кода пользователя
async function getReferralCode(username) {
    await db.read();
    const user = db.data.scores.find(user => user.username === username);
    if (user && user.referral_code) {
        return user.referral_code;
    }
    return null;
}

// Регистрация нового пользователя с рефералом
async function registerUser(username, score, referredBy = null) {
    await db.read();
    const referralCode = generateReferralCode(username);

    // Добавляем пользователя в таблицу scores
    db.data.scores.push({ username, score, referral_code: referralCode, invited_by: referredBy, invited_users: [] });
    await db.write();

    // Если есть реферал, обновляем его данные
    if (referredBy) {
        const referrer = db.data.scores.find(user => user.referral_code === referredBy);
        if (referrer) {
            referrer.invited_users.push(username);
            await db.write();
        }
    }

    return referralCode;
}

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

// 🚦 Сохранение нового рекорда
app.post('/api/score', validateSignature, async (req, res) => {
    try {
        const { username, score, referredBy } = req.body;

        if (!username || typeof score !== 'number' || score <= 0) {
            return res.status(400).json({ error: "Некорректные данные" });
        }

        await db.read();
        const existingUser = db.data.scores.find(user => user.username === username);

        if (existingUser) {
            if (score > existingUser.score) {
                existingUser.score = score;
                await db.write();
            }
        } else {
            await registerUser(username, score, referredBy);
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Ошибка при обработке запроса на /api/score:', error);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

// 🚦 Получение реферальной ссылки
app.get('/api/referral_link/:username', async (req, res) => {
    const { username } = req.params;
    const referralCode = await getReferralCode(username);

    if (referralCode) {
        res.json({ referral_link: `https://t.me/ваш_бот?start=${referralCode}` });
    } else {
        res.status(404).json({ error: "Пользователь не найден" });
    }
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Ошибка при запуске сервера:', err);
});
