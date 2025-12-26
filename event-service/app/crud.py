from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from datetime import datetime
from typing import Optional, List
import logging

from . import models, schemas

logger = logging.getLogger(__name__)

# CRUD для мероприятий
def create_event(db: Session, event: schemas.EventCreate, user_id: int):
    db_event = models.Event(**event.model_dump(), organizer_id=user_id)
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    logger.info(f"Создано мероприятие {db_event.id} пользователем {user_id}")
    return db_event

def get_event(db: Session, event_id: int):
    return db.query(models.Event).filter(models.Event.id == event_id).first()

def get_events(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Event).filter(models.Event.is_published == True)\
        .order_by(desc(models.Event.start_date))\
        .offset(skip).limit(limit).all()

def get_events_with_filters(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    category: Optional[str] = None,
    location: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    query = db.query(models.Event).filter(models.Event.is_published == True)
    
    if category:
        query = query.filter(models.Event.category == category)
    
    if location:
        query = query.filter(models.Event.location.ilike(f"%{location}%"))
    
    if date_from:
        date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        query = query.filter(models.Event.start_date >= date_from_dt)
    
    if date_to:
        date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        query = query.filter(models.Event.start_date <= date_to_dt)
    
    return query.order_by(desc(models.Event.start_date))\
        .offset(skip).limit(limit).all()

def update_event(db: Session, event_id: int, event_update: schemas.EventUpdate):
    db_event = get_event(db, event_id)
    if not db_event:
        return None
    
    update_data = event_update.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(db_event, field, value)
    
    db.commit()
    db.refresh(db_event)
    logger.info(f"Обновлено мероприятие {event_id}")
    return db_event

def delete_event(db: Session, event_id: int):
    db_event = get_event(db, event_id)
    if not db_event:
        return None
    
    # Удаляем все регистрации на это мероприятие
    db.query(models.Registration).filter(models.Registration.event_id == event_id).delete()
    
    db.delete(db_event)
    db.commit()
    logger.info(f"Удалено мероприятие {event_id}")
    return db_event

def get_events_by_organizer(db: Session, organizer_id: int):
    return db.query(models.Event)\
        .filter(models.Event.organizer_id == organizer_id)\
        .order_by(desc(models.Event.created_at))\
        .all()

# CRUD для регистраций
def create_registration(db: Session, event_id: int, user_id: int):
    db_registration = models.Registration(event_id=event_id, user_id=user_id)
    db.add(db_registration)
    db.commit()
    db.refresh(db_registration)
    logger.info(f"Создана регистрация {db_registration.id} для мероприятия {event_id}")
    return db_registration

def get_registration(db: Session, event_id: int, user_id: int):
    return db.query(models.Registration)\
        .filter(
            models.Registration.event_id == event_id,
            models.Registration.user_id == user_id
        ).first()

def delete_registration(db: Session, registration_id: int):
    db_registration = db.query(models.Registration).filter(models.Registration.id == registration_id).first()
    if not db_registration:
        return None
    
    db.delete(db_registration)
    db.commit()
    logger.info(f"Удалена регистрация {registration_id}")
    return db_registration

def update_event_participants(db: Session, event_id: int, increment: bool = True):
    db_event = get_event(db, event_id)
    if not db_event:
        return
    
    if increment:
        db_event.current_participants += 1
    else:
        db_event.current_participants = max(0, db_event.current_participants - 1)
    
    db.commit()
    db.refresh(db_event)

def get_event_participants(db: Session, event_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Registration)\
        .filter(models.Registration.event_id == event_id)\
        .order_by(models.Registration.registered_at)\
        .offset(skip).limit(limit).all()

def get_registered_events(db: Session, user_id: int):
    return db.query(models.Event)\
        .join(models.Registration, models.Event.id == models.Registration.event_id)\
        .filter(models.Registration.user_id == user_id)\
        .order_by(desc(models.Event.start_date))\
        .all()