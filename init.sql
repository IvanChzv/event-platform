-- Инициализация баз данных для микросервисов
\c postgres;

-- Создаем базы данных
CREATE DATABASE auth_db;
CREATE DATABASE event_db;
CREATE DATABASE notification_db;

-- Даем права пользователю postgres
GRANT ALL PRIVILEGES ON DATABASE auth_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE event_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE notification_db TO postgres;

-- Создаем схемы для каждого сервиса
\c auth_db;
CREATE SCHEMA IF NOT EXISTS auth_schema;

\c event_db;
CREATE SCHEMA IF NOT EXISTS event_schema;

\c notification_db;
CREATE SCHEMA IF NOT EXISTS notification_schema;