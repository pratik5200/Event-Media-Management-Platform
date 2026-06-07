import sqlalchemy
from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey,TIMESTAMP, text
from sqlalchemy.dialects.postgresql import UUID 
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
print("HELLO! PYTHON IS SUCCESSFULLY READING THE REAL MODELS.PY FILE!")
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="Club Member") # Default role from PDF requirements
    
    # The magical link: A user can own many events
    events = relationship("Event", back_populates="owner")
    profile_picture_url = Column(String, nullable=True) 

class Event(Base):
    __tablename__ = "events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(String)
    location = Column(String)
    date = Column(DateTime)
    
    # The Foreign Key: This column stores the exact ID of the User who made it
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    is_private = Column(Boolean, default=False)
    
    # The magical link: The event belongs to one owner
    owner = relationship("User", back_populates="events")
    media_items = relationship("Media", back_populates="event", cascade="all, delete-orphan")

class Media(Base):
    __tablename__ = "media"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    file_url = Column(String, nullable=False)
    ai_tags = Column(String, nullable=True) 
    file_type = Column(String, default="image")
    likes = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    file_hash = Column(String, index=True) 
    event_id = Column(String, ForeignKey("events.id", ondelete="CASCADE"))
    owner_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'), nullable=False)
    
    # Magical relationships
    event = relationship("Event", back_populates="media_items")
    owner = relationship("User")



class Comment(Base):
    __tablename__ = "comments"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    media_id = Column(String, ForeignKey("media.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    text = Column(String, nullable=False) 
    
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=sqlalchemy.text('now()'), nullable=False)
    
    user = relationship("User")

class Like(Base):
    __tablename__ = "likes"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    media_id = Column(String, ForeignKey("media.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'), nullable=False)

class Share(Base):
    __tablename__ = "shares"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    platform = Column(String, nullable=True) 
    
    media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('now()'), nullable=False)