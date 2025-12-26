
1. Веб-клиент: http://localhost:8080

2. API документация (Swagger):

Auth Service: http://localhost:8000/docs

Event Service: http://localhost:8001/docs

Notification Service: http://localhost:8002/docs

3. Health checks:

Auth Service: http://localhost:8000/health

Event Service: http://localhost:8001/health

Notification Service: http://localhost:8002/health

4. База данных:

pgAdmin: http://localhost:5050

Email: admin@admin.com

Password: admin

Host name/address: postgres

Port: 5432

Database: postgres

Username: postgres

Password: ZZZivanchzv2002

5. Запуск:

docker-compose up --build

6. Остановка:

docker-compose down 

7. Очистка кэша:

docker volume prune -f   
docker system prune -a -f


