from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta
import logging
import time
import os

from . import models, schemas, crud, auth, database
from .dependencies import get_db
from .auth import get_current_user, get_current_active_user

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Auth Service API",
    description="API для аутентификации и управления пользователями",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Функция для ожидания БД
def wait_for_db():
    """Ожидание готовности базы данных"""
    max_retries = 10
    retry_delay = 3
    
    for i in range(max_retries):
        try:
            # Пробуем подключиться к БД с использованием text()
            db = database.SessionLocal()
            db.execute(text("SELECT 1"))  # Используем text()
            db.close()
            logger.info("База данных готова")
            return True
        except Exception as e:
            logger.warning(f"Попытка {i+1}/{max_retries}: БД не готова. Ошибка: {e}")
            if i < max_retries - 1:
                time.sleep(retry_delay)
    
    logger.error("Не удалось подключиться к БД после всех попыток")
    return False

# Создание таблиц при запуске
@app.on_event("startup")
async def startup():
    logger.info("Запуск сервиса аутентификации...")
    
    # Ждем готовность БД
    if wait_for_db():
        try:
            models.Base.metadata.create_all(bind=database.engine)
            logger.info("Таблицы базы данных созданы успешно")
            
            # Создаем тестового пользователя если нужно
            db = database.SessionLocal()
            try:
                if not crud.get_user_by_email(db, "admin@example.com"):
                    test_user = schemas.UserCreate(
                        email="admin@example.com",
                        username="admin",
                        full_name="Admin User",
                        password="admin123"
                    )
                    crud.create_user(db=db, user=test_user)
                    logger.info("Тестовый пользователь создан")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Ошибка при создании таблиц: {e}")
    else:
        logger.error("Не удалось инициализировать БД")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@app.get("/")
def read_root():
    return {
        "message": "Auth Service API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.post("/register", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    logger.info(f"Попытка регистрации пользователя: {user.email}")
    
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        logger.warning(f"Пользователь с email {user.email} уже существует")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    new_user = crud.create_user(db=db, user=user)
    logger.info(f"Пользователь {new_user.email} успешно зарегистрирован")
    return new_user

@app.post("/token", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Аутентификация и получение токена"""
    logger.info(f"Попытка входа пользователя: {form_data.username}")
    
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        logger.warning(f"Неудачная попытка входа для пользователя: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    logger.info(f"Пользователь {user.email} успешно вошел в систему")
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
def read_users_me(
    current_user: schemas.User = Depends(get_current_active_user)
):
    """Получение информации о текущем пользователе"""
    return current_user

@app.put("/users/me", response_model=schemas.User)
def update_user_me(
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_active_user)
):
    """Обновление информации текущего пользователя"""
    logger.info(f"Обновление профиля пользователя {currentUser.email}")
    
    updated_user = crud.update_user(db, current_user.id, user_update)
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return updated_user

@app.get("/users/", response_model=list[schemas.User])
def read_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_active_user)
):
    """Получение списка пользователей"""
    users = crud.get_users(db, skip=skip, limit=limit)
    return users

@app.get("/users/{user_id}", response_model=schemas.User)
def read_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_active_user)
):
    """Получение информации о пользователе"""
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.get("/health")
def health_check():
    """Проверка здоровья сервиса"""
    try:
        # Проверяем подключение к БД с использованием text()
        db = database.SessionLocal()
        db.execute(text("SELECT 1")) 
        db.close()
        return {
            "status": "healthy",
            "service": "auth-service",
            "database": "connected"
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)