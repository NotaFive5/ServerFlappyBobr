import logging
import requests
from aiogram import Bot, Dispatcher, Router
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command
import os
import asyncio
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton

# Настройки
API_TOKEN = os.getenv('API_TOKEN')  # Токен Telegram-бота
SERVER_URL = 'https://serverflappybobr-production.up.railway.app'  # Публичный URL вашего сервера

if not API_TOKEN:
    raise ValueError("Не найден API_TOKEN! Убедитесь, что переменная окружения настроена правильно.")

logging.basicConfig(level=logging.INFO)

bot = Bot(token=API_TOKEN)
dp = Dispatcher()
router = Router()

# 🚦 **Создание inline-клавиатуры**
ikb_scoreResult = InlineKeyboardMarkup(inline_keyboard=[
    [InlineKeyboardButton(text='Мои очки', callback_data="my_score")],
    [InlineKeyboardButton(text='Топ 10', callback_data="leaderboard_10")],
    [InlineKeyboardButton(text='Топ 20', callback_data="leaderboard_20")]
])

# 🚦 **Создание клавиатуры команд рядом с полем ввода**
commands_keyboard = ReplyKeyboardMarkup(
    keyboard=[
        [KeyboardButton(text="Меню")]
    ],
    resize_keyboard=True,
    one_time_keyboard=True,
    input_field_placeholder="Выберите команду"
)

# 🚦 **Приветственное сообщение с кнопками (для /start)**
@router.message(Command(commands=["start"]))
async def send_start_message(message: Message):
    welcome_text = (
        "🐾 Добро пожаловать в захватывающий мир бобров! 🐾\n\n"
        "🎮 Эта игра создана специально для проекта @BKRVCoin, "
        "чтобы подарить вам увлекательные приключения и незабываемые эмоции!\n\n"
        "💎 Играй, побеждай и зарабатывай! Впереди множество квестов, соревнований "
        "и возможностей получить награды от @BKRVCoin.\n\n"
        "🚀 Начни своё путешествие прямо сейчас! Нажимай кнопку ниже и окунись в удивительный мир бобров!"
    )
    
    await message.reply(
        welcome_text,
        reply_markup=commands_keyboard
    )

# 🚦 **Сообщение с inline-кнопками (для "Меню")**
@router.message(lambda message: message.text == "Меню")
async def send_hi(message: Message):
    await message.reply(
        "Ты можешь посмотреть результаты игры здесь:",
        reply_markup=ikb_scoreResult
    )

# 🚦 **Обработка нажатий на inline-кнопки**
@router.callback_query()
async def handle_callback_query(callback_query: CallbackQuery):
    data = callback_query.data

    if data == "my_score":
        await send_my_score(callback_query)
    elif data == "leaderboard_10":
        await send_leaderboard(callback_query, limit=10)
    elif data == "leaderboard_20":
        await send_leaderboard(callback_query, limit=20)

    await callback_query.answer()

# 🚦 **Вывод лучшего счёта конкретного пользователя**
async def send_my_score(callback_query: CallbackQuery):
    username = callback_query.from_user.username
    if not username:
        await callback_query.answer(
            "У вас отсутствует username в Telegram. Установите его в настройках Telegram.",
            show_alert=True
        )
        return

    try:
        response = requests.get(f"{SERVER_URL}/api/user_score/{username}", timeout=10)
        response.raise_for_status()

        logging.info(f"Ответ от сервера для пользователя {username}: {response.text}")

    except requests.RequestException as e:
        logging.error(f"Ошибка при запросе данных пользователя {username}: {e}")
        await callback_query.answer("Не удалось получить ваш лучший результат. Попробуйте позже.", show_alert=True)
        return

    data = response.json()
    best_score = data.get("best_score", 0)
    await callback_query.message.answer(f"Ваш лучший результат: {best_score} очков.")

# 🚦 **Таблица лидеров с динамическим количеством участников**
async def send_leaderboard(callback_query: CallbackQuery, limit: int = 10):
    try:
        response = requests.get(f"{SERVER_URL}/api/leaderboard?limit={limit}", timeout=10)
        response.raise_for_status()

        leaderboard = response.json()

        if not leaderboard:
            await callback_query.answer("Пока нет данных для таблицы лидеров.", show_alert=True)
            return

        leaderboard_text = "🏆 <b>Таблица лидеров:</b>\n\n"
        for index, entry in enumerate(leaderboard, start=1):
            username = entry.get("username", "Неизвестный")
            score = entry.get("score", 0)
            leaderboard_text += f"{index}. @{username}: {score}\n"

        await callback_query.message.answer(leaderboard_text, parse_mode="HTML")

    except requests.RequestException as e:
        logging.error(f"Ошибка при запросе таблицы лидеров: {e}")
        await callback_query.answer("Не удалось получить таблицу лидеров. Попробуйте позже.", show_alert=True)

# 🚦 **Запуск бота**
async def main():
    dp.include_router(router)
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

if __name__ == '__main__':
    asyncio.run(main())
