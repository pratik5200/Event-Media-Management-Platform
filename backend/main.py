import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import io
import uuid
import random
import hashlib
import requests
from typing import List
from dotenv import load_dotenv
from PIL import Image, ImageDraw



import boto3
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from passlib.context import CryptContext

import models, schemas
from database import engine, get_db, Base
from auth import get_password_hash, get_current_user, verify_password, create_access_token

# CONFIGURATION & CLOUD CLIENTS

load_dotenv()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

AWS_BUCKET_NAME = os.getenv('AWS_BUCKET_NAME')

s3_client = boto3.client(
    's3',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION')
)

rekognition_client = boto3.client(
    'rekognition',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
    region_name=os.getenv('AWS_REGION')
)

# Initialize database tables
Base.metadata.create_all(bind=engine)

# APP INITIALIZATION & MIDDLEWARE

app = FastAPI(title="Event & Media Management API")

origins = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://event-media-management-platform.vercel.app" # Your new Vercel link
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,     
    allow_credentials=True,  
    allow_methods=["*"],     
    allow_headers=["*"],     
)

os.makedirs("uploads", exist_ok=True)

# PYDANTIC SCHEMAS (Locally Defined)

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str

class VerifyOTPRequest(BaseModel):
    email: str
    name: str
    password: str
    otp: str
    role: str

class CommentCreate(BaseModel):
    text: str

class LinkRequest(BaseModel):
    url: str

# WEBSOCKET MANAGER

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass 

manager = ConnectionManager()

@app.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# AUTHENTICATION ROUTES

pending_otps = {}


def send_otp_email(receiver_email, otp_code):
    script_url = os.getenv("GOOGLE_SCRIPT_URL")
    
    if not script_url:
        print("⚠️ Missing GOOGLE_SCRIPT_URL in Render!")
        return

    payload = {
        "to": receiver_email,
        "subject": "Your EventHub Verification Code",
        "body": f"""
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
            <h2>Welcome to EventHub.io!</h2>
            <p>Your verification code is:</p>
            <h1 style="color: #6c5ce7; letter-spacing: 5px;">{otp_code}</h1>
        </div>
        """
    }

    try:
        # Sends data to your Google Script, completely bypassing Render's firewall!
        requests.post(script_url, json=payload)
        print(f"✅ OTP successfully sent via Google to {receiver_email}")
    except Exception as e:
        print(f"❌ Failed to send: {e}")


# --- UPDATED OTP ROUTE ---
@app.post("/signup/request-otp")
async def request_otp(user_data: SignupRequest, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = str(random.randint(100000, 999999))
    pending_otps[user_data.email] = otp
    
    # Send the REAL email automatically instead of printing to the terminal
    send_otp_email(user_data.email, otp)

    # Update the success message sent back to the frontend
    return {"message": "OTP sent! Please check your email inbox."}

@app.post("/signup/verify")
async def verify_otp_and_signup(data: VerifyOTPRequest, db: Session = Depends(get_db)):
    saved_otp = pending_otps.get(data.email)
    
    if not saved_otp or saved_otp != data.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    hashed_pw = pwd_context.hash(data.password) 
    new_user = models.User(
        name=data.name,
        email=data.email,
        password_hash=hashed_pw,
        role=data.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    del pending_otps[data.email]
    return {"message": "User successfully created!"}

@app.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}

# USER MANAGEMENT ROUTES

@app.get("/users/me/stats")
def get_user_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    events_count = db.query(models.Event).filter(models.Event.owner_id == current_user.id).count()
    photos_count = db.query(models.Media).filter(models.Media.owner_id == current_user.id).count()
    total_likes = db.query(func.sum(models.Media.likes)).filter(models.Media.owner_id == current_user.id).scalar()
    
    return {
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "events_count": events_count,
        "photos_count": photos_count,
        "likes_count": total_likes if total_likes is not None else 0, 
        "profile_picture_url": getattr(current_user, 'profile_picture_url', None)
    }

@app.post("/users/me/profile-picture")
def upload_profile_picture(
    file: UploadFile = File(...), 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"profiles/{current_user.id}/{uuid.uuid4()}.{file_extension}"
    
    try:
        s3_client.upload_fileobj(
            file.file, 
            AWS_BUCKET_NAME, 
            unique_filename,
            ExtraArgs={"ContentType": file.content_type}
        )
        s3_url = f"https://{AWS_BUCKET_NAME}.s3.amazonaws.com/{unique_filename}"
        
        current_user.profile_picture_url = s3_url
        db.commit()
        return {"message": "Profile picture updated!", "url": s3_url}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"S3 Upload Failed: {str(e)}")

# EVENT MANAGEMENT ROUTES

@app.post("/events/", response_model=schemas.EventResponse)
def create_event(
    event: schemas.EventCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user) 
):
    new_event = models.Event(
        title=event.title,
        description=event.description,
        location=event.location,
        date=event.date,
        owner_id=current_user.id,
        is_private=event.is_private
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event

@app.get("/events/", response_model=schemas.SplitDashboardResponse)
def get_all_events(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    my_events = db.query(models.Event).filter(models.Event.owner_id == current_user.id).all()
    other_events = db.query(models.Event).filter(
        models.Event.owner_id != current_user.id,
        models.Event.is_private == False
    ).all()
    
    return {
        "my_events": my_events,
        "other_events": other_events
    }

@app.delete("/events/{event_id}")
def delete_event(
    event_id: str, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    if event.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")
        
    db.delete(event)
    db.commit()
    return {"message": "Event and all associated media deleted successfully"}

# MEDIA UPLOAD & MANAGEMENT ROUTES

@app.post("/events/{event_id}/upload/", status_code=status.HTTP_201_CREATED)
async def upload_event_image(
    event_id: str, 
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
        
    content_type = file.content_type
    if content_type.startswith('image/'):
        media_type = 'image'
    elif content_type.startswith('video/'):
        media_type = 'video'
    elif 'zip' in content_type or 'tar' in content_type:
        media_type = 'archive'
    else:
        media_type = 'document'

    contents = await file.read() 
    file_fingerprint = hashlib.sha256(contents).hexdigest() 
    
    # Duplicate prevention mechanism
    existing_media = db.query(models.Media).filter(models.Media.file_hash == file_fingerprint).first()
    if existing_media:
        return {
            "id": existing_media.id,
            "message": "Duplicate detected! Using existing cloud file.", 
            "file_url": existing_media.file_url,
            "file_type": existing_media.file_type,
            "ai_smart_tags": existing_media.ai_tags.split(", ") if existing_media.ai_tags else []
        }
        
    await file.seek(0)

    try:
        file_extension = file.filename.split(".")[-1]
        unique_filename = f"events/{event_id}/{uuid.uuid4()}.{file_extension}"
        
        s3_client.upload_fileobj(
            file.file,
            AWS_BUCKET_NAME,
            unique_filename,
            ExtraArgs={"ContentType": file.content_type}
        )
        s3_url = f"https://{AWS_BUCKET_NAME}.s3.{os.getenv('AWS_REGION')}.amazonaws.com/{unique_filename}"
        
        smart_tags = [] 
        if media_type == 'image':
            ai_response = rekognition_client.detect_labels(
                Image={
                    'S3Object': {
                        'Bucket': AWS_BUCKET_NAME,
                        'Name': unique_filename
                    }
                },
                MaxLabels=5,       
                MinConfidence=75   
            )
            smart_tags = [label['Name'] for label in ai_response['Labels']]
        else:
            smart_tags = [media_type.capitalize()]
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloud/AI Process Failed: {str(e)}")
    
    tags_string = ", ".join(smart_tags) 
    
    new_media = models.Media(
        file_url=s3_url,
        file_type=media_type, 
        ai_tags=tags_string, 
        event_id=event.id,
        owner_id=current_user.id,
        file_hash=file_fingerprint
    )
    
    db.add(new_media)
    db.commit()
    db.refresh(new_media)

    await manager.broadcast(f"New media added to: {event.title}")
    
    return {
        "id": new_media.id,
        "message": f"{media_type.capitalize()} uploaded successfully!", 
        "file_url": s3_url,
        "file_type": media_type,
        "ai_smart_tags": smart_tags
    }

@app.post("/events/{event_id}/add-link", status_code=201)
def add_event_link(
    event_id: str,
    request: LinkRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    new_media = models.Media(
        file_url=request.url,
        file_type="link", 
        ai_tags="Web, Link",
        event_id=event.id,
        owner_id=current_user.id
    )

    db.add(new_media)
    db.commit()
    db.refresh(new_media)

    return new_media

@app.delete("/media/{media_id}")
def delete_photo(media_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    photo = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
        
    if photo.owner_id != current_user.id and current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="You do not have permission to delete this photo.")
        
    try:
        s3_key = photo.file_url.split(".com/")[1]
        s3_client.delete_object(Bucket=AWS_BUCKET_NAME, Key=s3_key)
    except Exception as e:
        print(f"AWS Cleanup Warning: {e}") 

    db.delete(photo)
    db.commit()
    return {"message": "Photo securely deleted from database and cloud."}

@app.get("/events/{event_id}/media")
def get_event_media(
    event_id: str, 
    skip: int = 0,    
    limit: int = 15,  
    db: Session = Depends(get_db)
):
    photos = db.query(models.Media)\
               .filter(models.Media.event_id == event_id)\
               .order_by(models.Media.id.desc())\
               .offset(skip)\
               .limit(limit)\
               .all()
    return photos

@app.get("/media/{media_id}", status_code=status.HTTP_200_OK)
def get_photo_details(media_id: str, db: Session = Depends(get_db)):
    photo = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
        
    like_count = db.query(models.Like).filter(models.Like.media_id == media_id).count()
    share_count = db.query(models.Share).filter(models.Share.media_id == media_id).count()
    comments = db.query(models.Comment).filter(models.Comment.media_id == media_id).all()
    
    return {
        "photo": photo,
        "likes": like_count,
        "shares": share_count,
        "comments": [{"text": c.content, "user_id": c.user_id} for c in comments]
    }

# SOCIAL ENGAGEMENT ROUTES

@app.post("/media/{media_id}/like", status_code=201)
def like_photo(media_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    media = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    existing_like = db.query(models.Like).filter(
        models.Like.media_id == media_id, 
        models.Like.user_id == current_user.id
    ).first()
    
    if existing_like:
        db.delete(existing_like)
        media.likes = max(0, (media.likes or 0) - 1)
        db.commit()
        message = "Photo unliked!"
    else:
        new_like = models.Like(media_id=media_id, user_id=current_user.id)
        db.add(new_like)
        media.likes = (media.likes or 0) + 1
        db.commit()
        message = "Photo liked! ❤️"
        
    return {"message": message, "likes": media.likes}

@app.post("/media/{media_id}/comments", status_code=201)
def add_comment(media_id: str, comment: CommentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    media = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    new_comment = models.Comment(media_id=media_id, user_id=current_user.id, text=comment.text)
    db.add(new_comment)
    
    media.comments_count = (media.comments_count or 0) + 1
    db.commit()
    db.refresh(new_comment)
    
    return {
        "id": new_comment.id,
        "text": new_comment.text,
        "user_name": current_user.name,
        "comments_count": media.comments_count 
    }

@app.get("/media/{media_id}/comments")
def get_comments(media_id: str, db: Session = Depends(get_db)):
    comments = db.query(models.Comment).filter(models.Comment.media_id == media_id).order_by(models.Comment.created_at.asc()).all()
    return [{"id": c.id, "text": c.text, "user_name": c.user.name} for c in comments]

@app.delete("/comments/{comment_id}")
def delete_comment(comment_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments!")

    media = db.query(models.Media).filter(models.Media.id == comment.media_id).first()
    db.delete(comment)
    
    if media and (media.comments_count or 0) > 0:
        media.comments_count -= 1
        
    db.commit()
    return {"message": "Comment deleted!", "comments_count": media.comments_count if media else 0}

@app.post("/media/{media_id}/share", status_code=status.HTTP_201_CREATED)
def share_photo(media_id: str, platform: str = "copy_link", db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    new_share = models.Share(
        platform=platform,
        media_id=media_id,
        user_id=current_user.id
    )
    db.add(new_share)
    db.commit()
    
    photo = db.query(models.Media).filter(models.Media.id == media_id).first()
    return {
        "message": f"Tracked a share on {platform}! 🚀", 
        "share_link": photo.file_url if photo else "Photo not found"
    }

# ADVANCED SEARCH & PROCESSING

@app.get("/media/search/tags", status_code=status.HTTP_200_OK)
def search_photos_by_ai(
    tag: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) 
):
    search_results = db.query(models.Media).filter(models.Media.ai_tags.ilike(f"%{tag}%")).all()
    if not search_results:
        return {"message": f"No photos found with the AI tag: {tag}", "results": []}
        
    return {
        "message": f"Found {len(search_results)} photos matching '{tag}'!",
        "results": search_results
    }

@app.post("/events/{event_id}/find-me")
async def find_me_in_event(
    event_id: str, 
    file: UploadFile = File(...), 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    selfie_bytes = await file.read()
    event_photos = db.query(models.Media).filter(
        models.Media.event_id == event_id,
        models.Media.file_type == 'image' 
    ).all()
    
    matched_photos = []

    for photo in event_photos:
        try:
            photo_key = photo.file_url.split(".com/")[-1]
            response = rekognition_client.compare_faces(
                SourceImage={'Bytes': selfie_bytes},
                TargetImage={'S3Object': {'Bucket': AWS_BUCKET_NAME, 'Name': photo_key}},
                SimilarityThreshold=85  
            )
            
            if len(response.get('FaceMatches', [])) > 0:
                matched_photos.append(photo)
                
        except Exception as e:
            print(f"Skipping photo {photo.id}: No faces detected or error.")
            pass

    return matched_photos

@app.get("/media/{media_id}/download")
def download_watermarked_media(media_id: str, db: Session = Depends(get_db)):
    media = db.query(models.Media).filter(models.Media.id == media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    try:
        response = requests.get(media.file_url)
        image = Image.open(io.BytesIO(response.content))

        draw = ImageDraw.Draw(image)
        watermark_text = "EventHub Verified"
        
        width, height = image.size
        text_bbox = draw.textbbox((0, 0), watermark_text)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        
        x = width - text_width - 20
        y = height - text_height - 20
        
        draw.rectangle([x - 5, y - 5, x + text_width + 5, y + text_height + 5], fill=(0,0,0,160))
        draw.text((x, y), watermark_text, fill="white")

        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format=image.format or 'JPEG')
        img_byte_arr.seek(0) 

        return StreamingResponse(
            img_byte_arr, 
            media_type=f"image/{image.format.lower() if image.format else 'jpeg'}", 
            headers={"Content-Disposition": f"attachment; filename=Watermarked_{media_id}.jpg"}
        )

    except Exception as e:
        print(f"Watermark Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process image")

# STATIC FILES 

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")