from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List
import enum

class EventCategory(str, enum.Enum):
    CONFERENCE = "conference"
    WORKSHOP = "workshop"
    SEMINAR = "seminar"
    MEETUP = "meetup"
    PARTY = "party"
    SPORTS = "sports"
    OTHER = "other"

class EventBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    category: EventCategory = EventCategory.OTHER
    location: Optional[str] = None
    start_date: datetime
    end_date: Optional[datetime] = None
    max_participants: Optional[int] = Field(None, gt=0)

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[EventCategory] = None
    location: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    max_participants: Optional[int] = Field(None, gt=0)
    is_published: Optional[bool] = None

class Event(EventBase):
    id: int
    organizer_id: int
    current_participants: int
    is_published: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class RegistrationBase(BaseModel):
    event_id: int
    user_id: int

class RegistrationCreate(RegistrationBase):
    pass

class Registration(RegistrationBase):
    id: int
    registered_at: datetime
    status: str
    
    class Config:
        from_attributes = True

class Participant(BaseModel):
    user_id: int
    email: str
    username: str
    full_name: Optional[str]
    registered_at: datetime

class PaginatedResponse(BaseModel):
    items: List[Event]
    total: int
    page: int
    size: int
    pages: int