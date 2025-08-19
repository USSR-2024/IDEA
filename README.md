# 🚚 TMS (Transport Management System)

## 📋 Описание проекта

TMS - современная система управления транспортной логистикой, разработанная для оптимизации процессов доставки заказов. Система интегрируется с внешними OMS (Order Management System) и предоставляет полный контроль над логистическими операциями.

## 🎯 Основные возможности

- 📦 **Интеграция с OMS** - автоматическое получение заказов готовых к доставке
- 🚛 **Управление курьерами** - 18 активных курьеров с различными типами транспорта
- 🗺️ **Оптимизация маршрутов** - построение оптимальных маршрутов доставки
- 📍 **Real-time трекинг** - отслеживание курьеров в реальном времени через WebSocket
- 📊 **Аналитика** - детальные отчеты и KPI метрики
- 🔔 **Уведомления** - система оповещений о важных событиях

## 🏗️ Архитектура

### Микросервисная архитектура
- **API Gateway** (порт 3000) - единая точка входа, WebSocket сервер
- **Auth Service** (порт 3001) - аутентификация и авторизация
- **Order Service** (порт 3002) - управление заказами, интеграция с OMS
- **Courier Service** (порт 3003) - управление курьерами
- **Vehicle Service** (порт 3004) - управление транспортом
- **Route Service** (порт 3005) - маршрутизация
- **Location Service** (порт 3006) - геолокация
- **Analytics Service** (порт 3007) - аналитика
- **Notification Service** (порт 3008) - уведомления

### Технологический стек
- **Backend:** Node.js, TypeScript, Express.js
- **Database:** PostgreSQL + PostGIS (Supabase)
- **Real-time:** Socket.io
- **Cache:** Redis
- **Frontend:** React + TypeScript (в разработке)

## 📁 Структура проекта

```
IDEA/
├── tms-backend/                 # Backend микросервисы
│   ├── api-gateway/            # API Gateway
│   ├── services/               # Микросервисы
│   │   ├── auth/              # Сервис аутентификации
│   │   ├── order/             # Сервис заказов
│   │   ├── courier/           # Сервис курьеров
│   │   └── ...                # Другие сервисы
│   ├── shared/                # Общие модули
│   │   ├── config/            # Конфигурация
│   │   └── database/          # База данных
│   └── package.json           # Корневой package.json
├── idea-shop/                  # Прототип интернет-магазина
├── *.sql                      # SQL скрипты для БД
├── *.js                       # Утилиты для работы с БД
└── TMS_*.md                   # Документация

```

## 🚀 Быстрый старт

### Предварительные требования
- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL с PostGIS (или аккаунт Supabase)

### Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/USSR-2024/IDEA.git
cd IDEA
```

2. Установите зависимости:
```bash
cd tms-backend
npm install
```

3. Настройте переменные окружения:
```bash
cp .env.example .env
# Отредактируйте .env файл с вашими настройками
```

4. Инициализируйте базу данных:
```bash
node init-tms-database.js
node add-users-and-couriers.js
```

5. Запустите все сервисы:
```bash
npm run dev
```

## 💾 База данных

### Supabase подключение
```
URL: https://kvxcxindciifqhxqhenf.supabase.co
Connection: postgresql://postgres.kvxcxindciifqhxqhenf:[PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
```

### Основные таблицы
- `users` - пользователи системы (менеджеры)
- `couriers` - курьеры (18 записей)
- `vehicles` - транспортные средства
- `orders` - заказы на доставку
- `routes` - маршруты доставки
- `stores` - склады/магазины

## 📊 Текущий статус

### ✅ Завершено
- База данных с PostGIS
- Микросервисная архитектура
- API Gateway с WebSocket
- Auth Service
- Order Service с OMS интеграцией
- Тестовые данные (18 курьеров, 3 ТС, 2 склада)

### 🚧 В разработке
- Courier Service
- Route Service с оптимизацией
- Frontend приложение

### 📅 Планируется
- Мобильное приложение для курьеров
- Продвинутая аналитика
- Machine Learning для прогнозирования

## 📚 Документация

- [Системная документация](TMS_SYSTEM_DOCUMENTATION.md)
- [Статус проекта](TMS_PROJECT_STATUS.md)
- [Настройка Supabase](SUPABASE_SETUP.md)
- [Архитектурные диаграммы](TMS_ARCHITECTURE_DIAGRAMS.html)
- [API Documentation](tms-backend/api-gateway/swagger.yaml)

## 📈 Метрики

- **Курьеров в системе:** 18
- **Средний рейтинг:** 4.82 ⭐
- **Всего доставок выполнено:** 17,745
- **Целевое время доставки:** < 3 часа
- **Uptime SLA:** 99.9%

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие проекта! Пожалуйста, ознакомьтесь с [руководством по внесению изменений](CONTRIBUTING.md).

## 📞 Контакты

- **Email:** support@tms-logistics.ru
- **Documentation:** https://docs.tms-logistics.ru

## 📄 Лицензия

Proprietary Software - All Rights Reserved

---

*Разработано с ❤️ командой TMS*

*Последнее обновление: 2025-01-19*