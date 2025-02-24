// Получение лучшего результата пользователя
app.get('/api/user_score/:username', (req, res) => {
    const username = req.params.username;
    db.get('SELECT best_score FROM scores WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error("❌ Ошибка запроса к базе данных:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ best_score: row ? row.best_score : 0 });
    });
});

// Сохранение нового рекорда
app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || typeof score === 'undefined') {
        return res.status(400).json({ error: 'Missing username or score' });
    }

    db.run(`
        INSERT INTO scores (username, best_score)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE 
        SET best_score = MAX(best_score, ?)
    `, [username, score, score], (err) => {
        if (err) {
            console.error("❌ Ошибка при сохранении рекорда:", err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ success: true });
    });
});
