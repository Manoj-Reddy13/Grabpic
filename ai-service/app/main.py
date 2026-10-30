from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Request, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

import os
import shutil
import uuid
import zipfile
import io
import time
import json
import asyncio
from typing import List
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.detector import FaceDetector
from app.core.embedder import FaceEmbedder
from app.core.indexer import FaceIndexer
from app.core.matcher import FaceMatcher
from app.services.processor import ImageProcessor
from app.services.search_service import SearchService
from app.core.security import verify_token
from app.core.limiter import is_rate_limited
from app.core.blob_service import (
    upload_image_bytes,
    delete_event_blobs,
    download_event_images as download_event_blobs,
    generate_download_sas,
)
from app.core.blob_storage import save_image_bytes
from app.core.nl_search import NLQueryParser


# -------------------------
# Initialize App
# -------------------------
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# -------------------------
# Single Source of Truth (IMPORTANT)
# -------------------------
BASE_DATA_DIR = settings.BASE_DATA_DIR  # should be /app/data

# Create events dir without mounting it publicly
events_dir = os.path.join(BASE_DATA_DIR, "events")
os.makedirs(events_dir, exist_ok=True)


# -------------------------
# Ensure required dirs exist
# -------------------------
os.makedirs(BASE_DATA_DIR, exist_ok=True)
os.makedirs(settings.QUERY_DIR, exist_ok=True)


# -------------------------
# Initialize Core Components
# -------------------------
detector = FaceDetector()
embedder = FaceEmbedder()

# -------------------------
# Background Cleanup Scheduler
# -------------------------
async def cleanup_expired_events():
    while True:
        try:
            events_path = os.path.join(settings.BASE_DATA_DIR, "events")
            if os.path.exists(events_path):
                now = int(time.time())
                for event_id in os.listdir(events_path):
                    event_dir = os.path.join(events_path, event_id)
                    meta_path = os.path.join(event_dir, "meta.json")
                    
                    if os.path.exists(meta_path):
                        with open(meta_path, "r") as f:
                            try:
                                meta = json.load(f)
                                expires_at = meta.get("expiresAt", 0)
                                if expires_at > 0 and now > expires_at:
                                    try:
                                        print(f"[CLEANUP] Event {event_id} expired. Deleting...")
                                        # Delete from Azure Blob first
                                        delete_event_blobs(event_id)
                                        # Then local
                                        shutil.rmtree(event_dir)
                                    except Exception as event_err:
                                        print(f"[CLEANUP] Failed to delete event {event_id}: {event_err}")
                            except json.JSONDecodeError:
                                print(f"[CLEANUP] Failed to parse meta.json for {event_id}")
        except Exception as e:
            print(f"[CLEANUP] Error during cleanup: {e}")
            
        await asyncio.sleep(600) 

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_expired_events())


# -------------------------
# Helpers
# -------------------------

def update_event_status(event_id: str, status: str):
    event_dir = os.path.join(settings.BASE_DATA_DIR, "events", event_id)
    status_path = os.path.join(event_dir, "status.json")
    os.makedirs(event_dir, exist_ok=True)
    with open(status_path, "w") as f:
        json.dump({"status": status}, f)

def background_process_images(event_id: str, images_data: list):
    print(f"[PROCESS START] Event: {event_id}")
    try:
        update_event_status(event_id, "processing")
        
        event_dir = os.path.join(settings.BASE_DATA_DIR, "events", event_id)
        index_dir = os.path.join(event_dir, "index")
        os.makedirs(index_dir, exist_ok=True)

        indexer = FaceIndexer(
            settings.EMBEDDING_DIM,
            index_path=os.path.join(index_dir, "faces.index"),
            meta_path=os.path.join(index_dir, "meta.json")
        )

        photos_meta_path = os.path.join(event_dir, "photos_meta.json")
        processor = ImageProcessor(detector, embedder, indexer, photos_meta_path=photos_meta_path)
        processor.process_images(images_data)
        
        update_event_status(event_id, "completed")
        print(f"[PROCESS DONE] Event: {event_id}")
    except Exception as e:
        print(f"[PROCESS FAILED] Event: {event_id}, Error: {e}")
        update_event_status(event_id, "failed")


# -------------------------
# API: Process Images
# -------------------------
@app.post("/process/{event_id}")
async def process_images(event_id: str, background_tasks: BackgroundTasks, files: List[UploadFile] = File(...)):
    event_dir = os.path.join(settings.BASE_DATA_DIR, "events", event_id)
    
    # Ensure required directories exist before writing any file
    os.makedirs(event_dir, exist_ok=True)
    os.makedirs(os.path.join(event_dir, "index"), exist_ok=True)

    # Initialize meta.json if it doesn't exist
    event_meta_path = os.path.join(event_dir, "meta.json")
    if not os.path.exists(event_meta_path):
        now = int(time.time())
        expiry = now + (settings.EVENT_EXPIRY_HOURS * 3600)
        meta_data = {
            "eventId": event_id,
            "createdAt": now,
            "expiresAt": expiry
        }
        with open(event_meta_path, "w") as f:
            json.dump(meta_data, f)

    images_data = []
    image_dir = os.path.join(event_dir, "images")
    os.makedirs(image_dir, exist_ok=True)

    for file in files:
        filename = f"{uuid.uuid4()}.jpg"
        content = await file.read()
        
        images_data.append((filename, content))

        image_path = os.path.join(image_dir, filename)
        with open(image_path, "wb") as image_file:
            image_file.write(content)
        
        # Dual-write: Upload to Azure Blob in background
        print(settings.USE_BLOB_STORAGE)
        if settings.USE_BLOB_STORAGE:
            background_tasks.add_task(upload_image_bytes, event_id, filename, content)

    # Trigger background processing
    background_tasks.add_task(background_process_images, event_id, images_data)

    return {
        "status": "processing_started",
        "eventId": event_id
    }


@app.get("/status/{event_id}")
async def get_processing_status(event_id: str):
    event_dir = os.path.join(settings.BASE_DATA_DIR, "events", event_id)
    status_path = os.path.join(event_dir, "status.json")
    
    if not os.path.exists(status_path):
        return {"status": "not_found"}
        
    try:
        with open(status_path, "r") as f:
            return json.load(f)
    except Exception:
        return {"status": "error"}


# -------------------------
# API: Serve Image Securely
# -------------------------
@app.get("/images/{event_id}/images/{filename}")
async def get_image(request: Request, event_id: str, filename: str, token: str = None):
    # Rate limiting: 60 requests per minute per IP
    # if is_rate_limited(request.client.host):
    #     raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        
    # if not verify_token(event_id, filename, token):
    #     raise HTTPException(status_code=403, detail="Invalid token, signature verification failed or token expired.")
        
    file_path = os.path.join(BASE_DATA_DIR, "events", event_id, "images", filename)
    if not os.path.exists(file_path):
        print("file not found with name ",filename)
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(file_path)







# -------------------------
# API: Search Images
# -------------------------
@app.post("/search/{event_id}")
async def search_images(event_id: str, files: List[UploadFile] = File(...)):
    import numpy as np
    import cv2

    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    index_dir = os.path.join(event_dir, "index")

    if not os.path.exists(event_dir):
        return {"error": "Invalid event_id"}

    images = []

    for file in files:
        try:
            contents = await file.read()

            np_arr = np.frombuffer(contents, np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if image is not None:
                images.append(image)

        except Exception as e:
            print(f"[ERROR] {e}")
            continue

    if not images:
        return {"error": "Invalid images"}

    indexer = FaceIndexer(
        settings.EMBEDDING_DIM,
        index_path=os.path.join(index_dir, "faces.index"),
        meta_path=os.path.join(index_dir, "meta.json")
    )

    matcher = FaceMatcher(indexer)
    search_service = SearchService(detector, embedder, matcher)

    return search_service.search(images)


# -------------------------
# API: Photos Metadata & Stats
# -------------------------
@app.get("/events/{event_id}/photos-metadata")
async def get_photos_metadata(event_id: str):
    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    meta_path = os.path.join(event_dir, "photos_meta.json")

    if not os.path.exists(meta_path):
        return {"photos": {}, "stats": {}}

    try:
        with open(meta_path, "r") as f:
            photos_data = json.load(f)

        total_photos = len(photos_data)
        group_photos = sum(1 for p in photos_data.values() if p.get("is_group_photo"))
        single_photos = sum(1 for p in photos_data.values() if p.get("face_count", 0) == 1)
        no_face_photos = sum(1 for p in photos_data.values() if p.get("face_count", 0) == 0)

        scene_counts = {}
        expr_counts = {}

        for p in photos_data.values():
            prim_scene = p.get("primary_scene")
            if prim_scene:
                scene_counts[prim_scene] = scene_counts.get(prim_scene, 0) + 1

            dom_expr = p.get("dominant_expression")
            if dom_expr:
                expr_counts[dom_expr] = expr_counts.get(dom_expr, 0) + 1

        return {
            "eventId": event_id,
            "photos": photos_data,
            "stats": {
                "total_photos": total_photos,
                "group_photos": group_photos,
                "single_photos": single_photos,
                "no_face_photos": no_face_photos,
                "scene_distribution": scene_counts,
                "expression_distribution": expr_counts,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed reading photo metadata: {e}")


# -------------------------
# API: Single Photo Analysis
# -------------------------
@app.get("/events/{event_id}/photos/{filename}/analysis")
async def get_single_photo_analysis(event_id: str, filename: str):
    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    meta_path = os.path.join(event_dir, "photos_meta.json")

    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Event metadata not found")

    try:
        with open(meta_path, "r") as f:
            photos_data = json.load(f)

        photo = photos_data.get(filename)
        if not photo:
            raise HTTPException(status_code=404, detail="Photo analysis not found")

        return photo
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------
# API: Filter Photos (Scene, Expression, Face Count)
# -------------------------
@app.post("/events/{event_id}/filter")
async def filter_event_photos(event_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    meta_path = os.path.join(event_dir, "photos_meta.json")

    if not os.path.exists(meta_path):
        return {"matches": [], "total": 0}

    with open(meta_path, "r") as f:
        photos_data = json.load(f)

    target_scene = body.get("scene")
    target_expression = body.get("expression")
    is_group = body.get("is_group")
    min_faces = body.get("min_faces")
    max_faces = body.get("max_faces")

    filtered = []
    for filename, p in photos_data.items():
        # Filter scene
        if target_scene:
            photo_scenes = [s["label"].lower() for s in p.get("scenes", [])]
            if target_scene.lower() not in photo_scenes and p.get("primary_scene", "").lower() != target_scene.lower():
                continue

        # Filter expression
        if target_expression:
            photo_expressions = [f["emotion"]["dominant"].lower() for f in p.get("faces", []) if "emotion" in f]
            if target_expression.lower() not in photo_expressions and p.get("dominant_expression", "").lower() != target_expression.lower():
                continue

        # Filter group / face count
        if is_group is True and not p.get("is_group_photo"):
            continue
        if is_group is False and p.get("is_group_photo"):
            continue
        if min_faces is not None and p.get("face_count", 0) < min_faces:
            continue
        if max_faces is not None and p.get("face_count", 0) > max_faces:
            continue

        filtered.append(p)

    return {
        "eventId": event_id,
        "total": len(filtered),
        "matches": filtered
    }


# -------------------------
# API: Natural Language Photo Search
# -------------------------
@app.post("/events/{event_id}/nl-search")
async def natural_language_search(event_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = body.get("query", "")
    parsed = NLQueryParser.parse(query)

    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    meta_path = os.path.join(event_dir, "photos_meta.json")

    if not os.path.exists(meta_path):
        return {"query": query, "parsed_filters": parsed, "matches": [], "total": 0}

    with open(meta_path, "r") as f:
        photos_data = json.load(f)

    scored_photos = []

    for filename, p in photos_data.items():
        score = 0.5  # base relevance

        # Scene match
        if parsed["scene"]:
            scenes = [s["label"].lower() for s in p.get("scenes", [])]
            if parsed["scene"].lower() in scenes or p.get("primary_scene", "").lower() == parsed["scene"].lower():
                score += 0.35
            else:
                score -= 0.25

        # Expression match
        if parsed["expression"]:
            expressions = [f["emotion"]["dominant"].lower() for f in p.get("faces", []) if "emotion" in f]
            if parsed["expression"].lower() in expressions or p.get("dominant_expression", "").lower() == parsed["expression"].lower():
                score += 0.35
            else:
                score -= 0.25

        # Group match
        if parsed["is_group"]:
            if p.get("is_group_photo"):
                score += 0.25
            else:
                score -= 0.20

        if parsed["min_faces"] is not None:
            if p.get("face_count", 0) >= parsed["min_faces"]:
                score += 0.15
            else:
                score -= 0.15

        if parsed["max_faces"] is not None:
            if p.get("face_count", 0) <= parsed["max_faces"]:
                score += 0.15
            else:
                score -= 0.15

        if score > 0.40:
            scored_photos.append({
                "photo": p,
                "relevance": round(float(score), 2)
            })

    scored_photos.sort(key=lambda x: x["relevance"], reverse=True)

    return {
        "query": query,
        "parsed_filters": parsed,
        "total": len(scored_photos),
        "matches": [item["photo"] for item in scored_photos]
    }


# -------------------------
# API: Match Registered Guest Profiles (Notifications)
# -------------------------
@app.post("/events/{event_id}/match-profiles")
async def match_guest_profiles(event_id: str, request: Request):
    try:
        body = await request.json()
        profiles = body.get("profiles", [])
    except Exception:
        profiles = []

    if not profiles:
        return {"matches": []}

    event_dir = os.path.join(BASE_DATA_DIR, "events", event_id)
    index_dir = os.path.join(event_dir, "index")

    if not os.path.exists(index_dir):
        return {"matches": []}

    indexer = FaceIndexer(
        settings.EMBEDDING_DIM,
        index_path=os.path.join(index_dir, "faces.index"),
        meta_path=os.path.join(index_dir, "meta.json")
    )

    results = []
    for profile in profiles:
        user_id = profile.get("userId")
        emb = profile.get("embedding")
        if not user_id or not emb:
            continue

        raw_matches = indexer.search(emb, top_k=20)
        strong_images = set()

        for m in raw_matches:
            if m["score"] >= settings.STRONG_THRESHOLD:
                strong_images.add(os.path.basename(m["image_path"]))

        if strong_images:
            results.append({
                "userId": user_id,
                "matchedPhotos": list(strong_images)
            })

    return {"matches": results}


# -------------------------
# API: Download Event Images
# -------------------------
@app.get("/events/{event_id}/download")
async def download_event_images(event_id: str):
    if (
        not event_id
        or event_id in {".", ".."}
        or os.path.basename(event_id) != event_id
        or ":" in event_id
        or "\x00" in event_id
    ):
        raise HTTPException(status_code=404, detail="Event not found")

    events_path = os.path.realpath(os.path.join(BASE_DATA_DIR, "events"))
    event_path = os.path.realpath(os.path.join(events_path, event_id))
    if os.path.commonpath([events_path, event_path]) != events_path:
        raise HTTPException(status_code=404, detail="Event not found")

    image_dir = os.path.join(event_path, "images")
    image_names = []
    if os.path.isdir(image_dir):
        image_names = sorted(
            name for name in os.listdir(image_dir)
            if os.path.isfile(os.path.join(image_dir, name))
        )

    blob_images = []
    if not image_names and settings.USE_BLOB_STORAGE:
        blob_images = download_event_blobs(event_id)

    if not image_names and not blob_images:
        raise HTTPException(status_code=404, detail="No images found for this event")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        if image_names:
            for image_name in image_names:
                archive.write(os.path.join(image_dir, image_name), arcname=image_name)
        else:
            for image_name, image_bytes in blob_images:
                archive.writestr(image_name, image_bytes)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="photos.zip"'},
    )


@app.get("/download/{blob_name:path}")
async def download_image(blob_name: str):
    """
    Generates a secure SAS URL for direct downloading from Azure Blob Storage.
    The Content-Disposition is set to attachment for direct browser download.
    """
    try:
        url = generate_download_sas(blob_name)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
