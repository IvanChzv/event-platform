from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import requests
import logging
from typing import Optional, List

from . import models, schemas, crud, database
from .dependencies import get_db, verify_token

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Event Service API",
    description="API для управления мероприятиями",
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

# Создание таблиц при запуске
@app.on_event("startup")
async def startup():
    models.Base.metadata.create_all(bind=database.engine)
    logger.info("Таблицы базы данных созданы")

# Корневой эндпоинт
@app.get("/")
def read_root():
    return {
        "message": "Event Service API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

# Эндпоинты для мероприятий
@app.post("/events/", response_model=schemas.Event, tags=["Мероприятия"])
def create_event(
    event: schemas.EventCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Создание нового мероприятия"""
    logger.info(f"Создание мероприятия: {event.title} пользователем {current_user['email']}")
    
    try:
        db_event = crud.create_event(db=db, event=event, user_id=current_user["user_id"])
        
        # Отправка уведомления о создании мероприятия
        notification_data = {
            "user_id": current_user["user_id"],
            "event_id": db_event.id,
            "notification_type": "event_created",
            "message": f"Вы создали мероприятие '{event.title}'"
        }
        
        # Асинхронная отправка уведомления
        try:
            requests.post(
                "http://notification-service:8000/notifications/",
                json=notification_data,
                timeout=1
            )
        except:
            logger.warning("Не удалось отправить уведомление")
        
        return db_event
    except Exception as e:
        logger.error(f"Ошибка при создании мероприятия: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/events/", response_model=List[schemas.Event], tags=["Мероприятия"])
def read_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: Optional[str] = None,
    location: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получение списка мероприятий с фильтрацией"""
    logger.info(f"Получение мероприятий с фильтрами: category={category}, location={location}")
    
    events = crud.get_events_with_filters(
        db, 
        skip=skip, 
        limit=limit,
        category=category,
        location=location,
        date_from=date_from,
        date_to=date_to
    )
    return events

@app.get("/events/{event_id}", response_model=schemas.Event, tags=["Мероприятия"])
def read_event(event_id: int, db: Session = Depends(get_db)):
    """Получение информации о конкретном мероприятии"""
    db_event = crud.get_event(db, event_id=event_id)
    if db_event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return db_event

@app.put("/events/{event_id}", response_model=schemas.Event, tags=["Мероприятия"])
def update_event(
    event_id: int,
    event_update: schemas.EventUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Обновление мероприятия"""
    logger.info(f"Обновление мероприятия {event_id} пользователем {current_user['email']}")
    
    db_event = crud.get_event(db, event_id=event_id)
    if db_event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if db_event.organizer_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this event")
    
    return crud.update_event(db=db, event_id=event_id, event_update=event_update)

@app.delete("/events/{event_id}", tags=["Мероприятия"])
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Удаление мероприятия"""
    logger.info(f"Удаление мероприятия {event_id} пользователем {current_user['email']}")
    
    db_event = crud.get_event(db, event_id=event_id)
    if db_event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if db_event.organizer_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")
    
    crud.delete_event(db=db, event_id=event_id)
    return {"message": "Event deleted successfully"}

# Эндпоинты для регистрации на мероприятия
@app.post("/events/{event_id}/register", tags=["Регистрации"])
def register_for_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Регистрация пользователя на мероприятие"""
    logger.info(f"Регистрация пользователя {current_user['email']} на мероприятие {event_id}")
    
    db_event = crud.get_event(db, event_id=event_id)
    if db_event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Проверка, не зарегистрирован ли уже пользователь
    existing_registration = crud.get_registration(db, event_id, current_user["user_id"])
    if existing_registration:
        raise HTTPException(status_code=400, detail="Already registered for this event")
    
    # Проверка максимального количества участников
    if db_event.max_participants and db_event.current_participants >= db_event.max_participants:
        raise HTTPException(status_code=400, detail="Event is full")
    
    registration = crud.create_registration(db, event_id, current_user["user_id"])
    
    # Обновление счетчика участников
    crud.update_event_participants(db, event_id, increment=True)
    
    # Отправка уведомления о регистрации
    notification_data = {
        "user_id": current_user["user_id"],
        "event_id": event_id,
        "notification_type": "event_registration",
        "message": f"Вы зарегистрировались на мероприятие '{db_event.title}'"
    }
    
    try:
        requests.post(
            "http://notification-service:8000/notifications/",
            json=notification_data,
            timeout=1
        )
    except:
        logger.warning("Не удалось отправить уведомление о регистрации")
    
    return {"message": "Successfully registered for the event", "registration": registration}

@app.delete("/events/{event_id}/unregister", tags=["Регистрации"])
def unregister_from_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Отмена регистрации на мероприятие"""
    registration = crud.get_registration(db, event_id, current_user["user_id"])
    if not registration:
        raise HTTPException(status_code=404, detail="Registration not found")
    
    crud.delete_registration(db, registration.id)
    
    # Обновление счетчика участников
    crud.update_event_participants(db, event_id, increment=False)
    
    return {"message": "Successfully unregistered from the event"}

@app.get("/events/{event_id}/participants", tags=["Регистрации"])
def get_event_participants(
    event_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Получение списка участников мероприятия"""
    participants = crud.get_event_participants(db, event_id, skip, limit)
    return participants

@app.get("/users/me/events", response_model=List[schemas.Event], tags=["Пользователь"])
def get_user_events(
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Получение мероприятий текущего пользователя"""
    events = crud.get_events_by_organizer(db, current_user["user_id"])
    return events

@app.get("/users/me/registered-events", response_model=List[schemas.Event], tags=["Пользователь"])
def get_user_registered_events(
    db: Session = Depends(get_db),
    current_user: dict = Depends(verify_token)
):
    """Получение мероприятий, на которые зарегистрирован пользователь"""
    events = crud.get_registered_events(db, current_user["user_id"])
    return events

@app.get("/health", tags=["Система"])
def health_check():
    """Проверка здоровья сервиса"""
    try:
        # Проверяем подключение к БД
        db = database.SessionLocal()
        db.execute("SELECT 1")
        db.close()
        return {
            "status": "healthy",
            "service": "event-service",
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