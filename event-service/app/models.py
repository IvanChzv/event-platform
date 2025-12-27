from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from .database import Base

class EventCategory(str, enum.Enum):
    CONFERENCE = "conference"
    WORKSHOP = "workshop"
    SEMINAR = "seminar"
    MEETUP = "meetup"
    PARTY = "party"
    SPORTS = "sports"
    OTHER = "other"

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    description = Column(Text)
    category = Column(Enum(EventCategory), default=EventCategory.OTHER)
    location = Column(String)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True))
    organizer_id = Column(Integer, nullable=False)
    max_participants = Column(Integer)
    current_participants = Column(Integer, default=0)
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class Registration(Base):
    __tablename__ = "registrations"
    
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, nullable=False)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="confirmed")
    
    event = relationship("Event")