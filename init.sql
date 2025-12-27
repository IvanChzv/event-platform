
\c postgres;

CREATE DATABASE auth_db;
CREATE DATABASE event_db;
CREATE DATABASE notification_db;

GRANT ALL PRIVILEGES ON DATABASE auth_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE event_db TO postgres;
GRANT ALL PRIVILEGES ON DATABASE notification_db TO postgres;
ъ