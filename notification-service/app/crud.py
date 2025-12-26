from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List

from . import models, schemas

def create_notification(db: Session, notification: schemas.NotificationCreate):
    db_notification = models.Notification(**notification.model_dump())
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification

def get_notification(db: Session, notification_id: int):
    return db.query(models.Notification).filter(models.Notification.id == notification_id).first()

def get_notifications(
    db: Session, 
    user_id: Optional[int] = None,
    is_read: Optional[bool] = None,
    skip: int = 0, 
    limit: int = 100
):
    query = db.query(models.Notification)
    
    if user_id is not None:
        query = query.filter(models.Notification.user_id == user_id)
    
    if is_read is not None:
        query = query.filter(models.Notification.is_read == is_read)
    
    return query.order_by(desc(models.Notification.created_at))\
        .offset(skip).limit(limit).all()

def update_notification(db: Session, notification_id: int, notification_update: schemas.NotificationUpdate):
    db_notification = get_notification(db, notification_id)
    if not db_notification:
        return None
    
    update_data = notification_update.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(db_notification, field, value)
    
    db.commit()
    db.refresh(db_notification)
    return db_notification

def delete_notification(db: Session, notification_id: int):
    db_notification = get_notification(db, notification_id)
    if not db_notification:
        return None
    
    db.delete(db_notification)
    db.commit()
    return db_notification

def get_unread_count(db: Session, user_id: int):
    return db.query(models.Notification)\
        .filter(
            models.Notification.user_id == user_id,
            models.Notification.is_read == False
        ).count()