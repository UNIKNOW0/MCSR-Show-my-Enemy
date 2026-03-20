# MCSR Show Enemy

Стриминг-оверлей для MCSR Ranked. Автоматически показывает карточку оппонента когда находится матч.

![overlay preview](https://img.shields.io/badge/OBS-Browser_Source-blueviolet)

## Возможности

- Автоматический детект матча через MCSR Ranked API
- Карточка оппонента: 3D голова, ник, MMR, ранг
- График последних 20 игр (победы/поражения)
- Shimmer-рамка с цветом ранга (Coal, Iron, Gold, Emerald, Diamond, Netherite)
- Анимация появления/исчезновения (10 сек показ)
- Прозрачный фон — готово для OBS Browser Source

## Установка

Установщик 


Билд проекта:

```bash
npm install
npm start
```

Сервер запустится на `http://localhost:3001`.

## Настройка

1. Открой `http://localhost:3001/setup.html`
2. Введи свой Minecraft ник и нажми **Сохранить**
3. Нажми **Тест** чтобы проверить карточку

## OBS

1. Добавь **Browser Source**
2. URL: `http://localhost:3001`

## Как это работает

```
Polling /live (каждые 5 сек)
  → Нашёл матч → Fetch данных оппонента
    → WebSocket → Overlay показывает карточку
      → 10 сек → Карточка улетает вверх
```

## Ранги

| Elo | Ранг | Цвет рамки |
|-----|------|------------|
| 0-599 | Coal | Тёмно-серый |
| 600-899 | Iron | Серебряный |
| 900-1199 | Gold | Золотой |
| 1200-1499 | Emerald | Зелёный |
| 1500-1999 | Diamond | Голубой |
| 2000+ | Netherite | Тёмно-коричневый |

## Технологии

- Node.js + Express + WebSocket (`ws`)
- Vanilla HTML/CSS/JS
- Chart.js (CDN)
- MCSR Ranked API — `api.mcsrranked.com`
- Crafatar — 3D головы Minecraft
