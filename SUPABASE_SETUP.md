# TMS Database Setup in Supabase

## Пошаговая инструкция по настройке базы данных TMS в Supabase

### 1. Подготовка Supabase проекта

1. Войдите в [Supabase Dashboard](https://app.supabase.com)
2. Создайте новый проект или используйте существующий
3. Запомните URL проекта и анонимный ключ (anon key) - они понадобятся для подключения

### 2. Включение расширений

В SQL Editor выполните:

```sql
-- Включение необходимых расширений
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 3. Применение основной схемы

1. Откройте SQL Editor в Supabase Dashboard
2. Скопируйте содержимое файла `tms-database-schema.sql`
3. Выполните SQL скрипт (может занять 1-2 минуты)

### 4. Применение дополнительных функций

1. После успешного выполнения основной схемы
2. Скопируйте содержимое файла `tms-supabase-functions.sql`
3. Выполните SQL скрипт

### 5. Настройка аутентификации

Создайте тестового пользователя для менеджера:

```sql
-- Создание тестового пользователя-менеджера
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'manager@tms.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Менеджер TMS"}',
    now(),
    now()
);

-- Связать с таблицей users в public схеме
INSERT INTO public.users (
    id,
    email,
    full_name,
    role
) 
SELECT 
    id,
    email,
    raw_user_meta_data->>'full_name',
    'manager'
FROM auth.users 
WHERE email = 'manager@tms.com';
```

### 6. Настройка Realtime

В настройках проекта Supabase:

1. Перейдите в Settings → Database
2. Включите Realtime для следующих таблиц:
   - orders
   - routes
   - route_orders
   - couriers
   - location_history
   - notifications

### 7. Настройка Storage (опционально)

Для хранения фото доставок и подписей:

```sql
-- Создание bucket для фото доставок
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-proofs', 'delivery-proofs', true);

-- Политики для bucket
CREATE POLICY "Anyone can upload delivery proofs" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'delivery-proofs');

CREATE POLICY "Anyone can view delivery proofs" ON storage.objects
FOR SELECT USING (bucket_id = 'delivery-proofs');
```

### 8. Подключение к приложению

Используйте следующие переменные окружения в вашем приложении:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 9. Проверка установки

Выполните тестовые запросы:

```sql
-- Проверка таблиц
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Проверка функций
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Проверка PostGIS
SELECT PostGIS_Version();

-- Тест функции поиска ближайшего курьера
SELECT * FROM find_nearest_available_courier(
    ST_GeogFromText('POINT(37.6173 55.7558)'),
    10
);

-- Тест получения метрик дашборда
SELECT * FROM get_dashboard_metrics(CURRENT_DATE);
```

### 10. Типы данных для TypeScript

После настройки БД, сгенерируйте типы для TypeScript:

```bash
npx supabase gen types typescript --project-id your-project-id > src/types/supabase.ts
```

## Важные замечания

### PostGIS в Supabase

- PostGIS уже предустановлен в Supabase
- Для работы с географическими данными используются типы GEOGRAPHY и GEOMETRY
- Координаты хранятся в формате WGS84 (SRID 4326)

### Row Level Security (RLS)

- RLS включен для всех таблиц
- Базовые политики уже настроены
- Для production окружения настройте более строгие политики

### Оптимизация

- Все необходимые индексы уже созданы
- Spatial индексы настроены для географических запросов
- Текстовый поиск оптимизирован через GIN индексы

### Мониторинг

В Supabase Dashboard доступны:
- Логи запросов
- Метрики производительности
- Мониторинг использования ресурсов

## Troubleshooting

### Ошибка "extension postgis does not exist"

PostGIS должен быть предустановлен в Supabase. Если возникает ошибка:
1. Проверьте версию Supabase проекта
2. Обратитесь в поддержку Supabase

### Ошибка с RLS политиками

Если возникают проблемы с доступом:
1. Временно отключите RLS для тестирования:
   ```sql
   ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
   ```
2. Проверьте JWT токен и claims
3. Убедитесь, что используете правильный ключ (anon или service_role)

### Производительность географических запросов

Для оптимизации:
1. Используйте ST_DWithin вместо ST_Distance для фильтрации
2. Создавайте составные индексы для часто используемых комбинаций
3. Рассмотрите партиционирование таблиц по дате для исторических данных