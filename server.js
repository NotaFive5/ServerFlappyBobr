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

// Генерация реферальной ссылки
function generateReferralLink(userId) {
    const baseUrl = "https://yourwebsite.com/referral";
    const referralCode = crypto.randomBytes(8).toString('hex');
    return `${baseUrl}?ref=${referralCode}&user=${userId}`;
}

// Создание сервера
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🚦 Генерация реферальной ссылки
app.post('/api/generate_referral', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: "Некорректные данные" });
        }

        await db.read();
        const user = db.data.scores.find(user => user.username === username);

        if (user) {
            if (!user.referralLink) {
                user.referralLink = generateReferralLink(username);
                await db.write();
                console.log(`Сгенерирована реферальная ссылка для ${username}: ${user.referralLink}`);
            }
            res.json({ referralLink: user.referralLink });
        } else {
            res.status(404).json({ error: "Пользователь не найден" });
        }
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

// 🚀 Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Ошибка при запуске сервера:', err);
});
