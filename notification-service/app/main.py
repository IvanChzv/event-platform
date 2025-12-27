from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from . import models, schemas, crud, database
from .dependencies import get_db
from .email_service import send_email_notification

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Notification Service API",
    description="API для управления уведомлениями",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Корневой эндпоинт
@app.get("/")
def read_root():
    return {
        "message": "Notification Service API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создание таблиц при запуске
@app.on_event("startup")
async def startup():
    models.Base.metadata.create_all(bind=database.engine)
    logger.info("Таблицы базы данных созданы")

@app.post("/notifications/", response_model=schemas.Notification)
async def create_notification(
    notification: schemas.NotificationCreate,
    db: Session = Depends(get_db)
):
    """Создание нового уведомления"""
    logger.info(f"Создание уведомления для пользователя {notification.user_id}")
    
    try:
        db_notification = crud.create_notification(db=db, notification=notification)
        
        if notification.notification_type in ["event_created", "event_registration"]:
            await send_email_notification(db_notification)
        
        return db_notification
    except Exception as e:
        logger.error(f"Ошибка при создании уведомления: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/notifications/", response_model=List[schemas.Notification])
def read_notifications(
    user_id: Optional[int] = None,
    is_read: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Получение списка уведомлений с фильтрацией"""
    notifications = crud.get_notifications(
        db, 
        user_id=user_id,
        is_read=is_read,
        skip=skip, 
        limit=limit
    )
    return notifications

@app.get("/notifications/{notification_id}", response_model=schemas.Notification)
def read_notification(notification_id: int, db: Session = Depends(get_db)):
    """Получение конкретного уведомления"""
    db_notification = crud.get_notification(db, notification_id=notification_id)
    if db_notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return db_notification

@app.put("/notifications/{notification_id}/read")
def mark_as_read(notification_id: int, db: Session = Depends(get_db)):
    """Отметить уведомление как прочитанное"""
    db_notification = crud.get_notification(db, notification_id=notification_id)
    if db_notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db_notification.is_read = True
    db_notification.read_at = datetime.utcnow()
    db.commit()
    db.refresh(db_notification)
    
    return {"message": "Notification marked as read", "notification": db_notification}

@app.delete("/notifications/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    """Удаление уведомления"""
    db_notification = crud.get_notification(db, notification_id=notification_id)
    if db_notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    crud.delete_notification(db=db, notification_id=notification_id)
    return {"message": "Notification deleted successfully"}

@app.get("/users/{user_id}/unread-count")
def get_unread_count(user_id: int, db: Session = Depends(get_db)):
    """Получение количества непрочитанных уведомлений пользователя"""
    count = crud.get_unread_count(db, user_id)
    return {"user_id": user_id, "unread_count": count}

@app.post("/email-test/")
async def send_test_email(email: str):
    """Тестирование отправки email"""
    try:
        await send_email_notification(
            schemas.Notification(
                id=1,
                user_id=1,
                notification_type="test",
                message="Тестовое сообщение",
                is_read=False,
                created_at=datetime.utcnow()
            ),
            recipient_email=email
        )
        return {"message": "Test email sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    """Проверка здоровья сервиса"""
    return {"status": "healthy", "service": "notification-service"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)