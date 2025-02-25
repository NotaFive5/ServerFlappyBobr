// Используем ES Module синтаксис вместо require
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Low, JSONFile } from 'lowdb';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Создание сервера
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

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
app.post('/api/score', async (req, res) => {
    const { username, score } = req.body;

    if (!username || !score) {
        return res.status(400).json({ error: "Необходимо указать username и score" });
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
});

// 🚦 Получение глобального рейтинга (топ-10 игроков)
app.get('/api/leaderboard', async (req, res) => {
    await db.read();

    const leaderboard = db.data.scores
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    res.json(leaderboard);
});

// 🚀 Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
