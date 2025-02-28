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
    if (!db.data || !db.data.scores) {
        db.data = { scores: [] };
        await db.write();
    }
    console.log('База данных успешно загружена:', db.data);
}
initDB();

// Генерация реферальной ссылки для Telegram-бота
function generateReferralLink(username) {
    const botUsername = "BoberGames_bot"; // Замените на имя вашего бота
    const referralCode = crypto.randomBytes(8).toString('hex'); // Генерация уникального кода
    return `https://t.me/${botUsername}?start=${referralCode}`;
}

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

// 🚦 Очистка базы данных (обнуление)
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

// 🚦 Получение глобального рейтинга (топ-10 игроков)
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

// 🚦 Генерация реферальной ссылки
app.post('/api/generate_referral', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: "Некорректные данные" });
        }

        await db.read();

        // Поиск пользователя в базе данных
        let user = db.data.scores.find(user => user.username === username);

        if (!user) {
            // Если пользователь не найден, создаём новую запись
            user = { username, score: 0, referralCode: null, referralLink: null };
            db.data.scores.push(user);
        }

        // Генерация реферального кода и ссылки, если их ещё нет
        if (!user.referralCode) {
            user.referralCode = crypto.randomBytes(8).toString('hex'); // Генерация уникального кода
            user.referralLink = generateReferralLink(username);
            await db.write(); // Сохраняем изменения в базе данных
            console.log(`Сгенерирована реферальная ссылка для ${username}: ${user.referralLink}`);
        }

        res.json({ referralLink: user.referralLink });
    } catch (error) {
        console.error('Ошибка при генерации реферальной ссылки:', error);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

// 🚦 Получение реферальной ссылки
app.get('/api/referral_link/:username', async (req, res) => {
    try {
        const { username } = req.params;

        await db.read();
        const user = db.data.scores.find(user => user.username === username);

        if (user && user.referralLink) {
            res.json({ referralLink: user.referralLink });
        } else {
            res.status(404).json({ error: "Реферальная ссылка не найдена" });
        }
    } catch (error) {
        console.error('Ошибка при получении реферальной ссылки:', error);
        res.status(500).json({ error: "Внутренняя ошибка сервера" });
    }
});

app.post('/api/process_referral', async (req, res) => {
    try {
        const { username, referral_code } = req.body;

        if (!username || !referral_code) {
            return res.status(400).json({ success: false, message: "Некорректные данные" });
        }

        await db.read();

        // Находим пользователя, который создал реферальную ссылку
        const referrer = db.data.scores.find(user => user.referralLink.includes(referral_code));

        if (!referrer) {
            return res.status(404).json({ success: false, message: "Реферальная ссылка не найдена" });
        }

        // Проверяем, не использовал ли пользователь уже реферальную ссылку
        if (referrer.referrals && referrer.referrals.includes(username)) {
            return res.json({ success: false, message: "Вы уже использовали реферальную ссылку." });
        }

        // Добавляем пользователя в список рефералов
        if (!referrer.referrals) {
            referrer.referrals = [];  // Инициализируем массив, если его нет
        }
        referrer.referrals.push(username);
        await db.write();

        res.json({ success: true, message: "Реферальная ссылка успешно применена!" });
    } catch (error) {
        console.error('Ошибка при обработке реферальной ссылки:', error);
        res.status(500).json({ success: false, message: "Внутренняя ошибка сервера" });
    }
});

app.get('/api/my_referrals/:username', async (req, res) => {
    try {
        const { username } = req.params;

        await db.read();

        // Находим пользователя в базе данных
        const user = db.data.scores.find(user => user.username === username);

        if (!user) {
            return res.status(404).json({ success: false, message: "Пользователь не найден" });
        }

        // Возвращаем количество рефералов
        const referralCount = user.referrals ? user.referrals.length : 0;
        res.json({ success: true, referralCount });
    } catch (error) {
        console.error('Ошибка при получении количества рефералов:', error);
        res.status(500).json({ success: false, message: "Внутренняя ошибка сервера" });
    }
});

app.get('/api/all_referrals', async (req, res) => {
    try {
        await db.read();

        // Формируем список пользователей с количеством их рефералов
        const referralList = db.data.scores
            .filter(user => user.referrals && user.referrals.length > 0)
            .map(user => ({
                username: user.username,
                referralCount: user.referrals.length
            }));

        res.json({ success: true, referralList });
    } catch (error) {
        console.error('Ошибка при получении общего списка рефералов:', error);
        res.status(500).json({ success: false, message: "Внутренняя ошибка сервера" });
    }
});

// 🚀 Запуск сервера с обработкой ошибок
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Ошибка при запуске сервера:', err);
});
