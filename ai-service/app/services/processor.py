# ai-service/app/services/processor.py

import json
import os
import cv2
import numpy as np
from app.utils.image import preprocess_image_from_bytes
from app.core.emotion import EmotionDetector
from app.core.scene import SceneClassifier


class ImageProcessor:
    """
    Handles bulk image processing pipeline:
    - Face detection & multi-face group photo detection
    - Bounding boxes and face landmarks extraction
    - Emotion & facial expression classification
    - Scene recognition
    - Face embeddings extraction and FAISS indexing
    - Photo metadata persistence
    """

    def __init__(self, detector, embedder, indexer, photos_meta_path=None):
        self.detector = detector
        self.embedder = embedder
        self.indexer = indexer
        self.photos_meta_path = photos_meta_path

        self.emotion_detector = EmotionDetector()
        self.scene_classifier = SceneClassifier()

        self.no_face_images = []
        self.photos_metadata = {}

        # Load existing photo metadata if available
        if self.photos_meta_path and os.path.exists(self.photos_meta_path):
            try:
                with open(self.photos_meta_path, "r") as f:
                    self.photos_metadata = json.load(f)
            except Exception:
                self.photos_metadata = {}

    def process_images(self, images_data):
        """
        Process a list of images and populate FAISS index + photo analysis metadata.

        Args:
            images_data: list of tuples (filename, content: bytes)
        """
        total_images = 0
        total_faces = 0
        total_embeddings = 0

        for filename, content in images_data:
            total_images += 1

            try:
                image = preprocess_image_from_bytes(content)

                # Step 1: Detect all faces (supports single & group photos)
                faces = self.detector.detect(image)
                face_count = len(faces) if faces is not None else 0

                # Convert to BGR for scene classification
                bgr_image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
                scenes = self.scene_classifier.classify(bgr_image, faces)

                photo_entry = {
                    "filename": filename,
                    "face_count": face_count,
                    "is_group_photo": bool(face_count >= 2),
                    "scenes": scenes,
                    "primary_scene": scenes[0]["label"] if scenes else "Indoor",
                    "faces": [],
                    "dominant_expression": "Neutral",
                }

                if faces is None or face_count == 0:
                    self.no_face_images.append(filename)
                    self.photos_metadata[filename] = photo_entry
                    continue

                total_faces += face_count

                # Step 2: Extract expression & bounding box for each face
                expressions_tally = {}
                for idx, face in enumerate(faces):
                    bbox = getattr(face, "bbox", None)
                    det_score = getattr(face, "det_score", 1.0)

                    bbox_list = [round(float(coord), 1) for coord in bbox] if bbox is not None else []
                    emotion_res = self.emotion_detector.classify_face(face, image)

                    dom_expr = emotion_res["dominant"]
                    expressions_tally[dom_expr] = expressions_tally.get(dom_expr, 0) + 1

                    photo_entry["faces"].append({
                        "face_id": idx,
                        "bbox": bbox_list,
                        "detection_score": round(float(det_score), 3) if det_score is not None else 1.0,
                        "emotion": emotion_res,
                    })

                # Dominant expression across the photo
                if expressions_tally:
                    photo_entry["dominant_expression"] = max(expressions_tally.items(), key=lambda x: x[1])[0]

                # Step 3: Extract face embeddings
                embeddings = self.embedder.extract(faces)

                if embeddings is None or len(embeddings) == 0:
                    self.no_face_images.append(filename)
                    self.photos_metadata[filename] = photo_entry
                    continue

                total_embeddings += len(embeddings)

                # Step 4: Map each embedding -> filename in FAISS
                filenames_batch = [filename] * len(embeddings)
                self.indexer.add(embeddings, filenames_batch)

                self.photos_metadata[filename] = photo_entry

            except Exception as e:
                print(f"[ERROR] Failed processing {filename}: {e}")
                continue

        # Step 5: Persist FAISS index
        self.indexer.save()

        # Step 6: Persist photos metadata JSON
        if self.photos_meta_path:
            try:
                os.makedirs(os.path.dirname(self.photos_meta_path), exist_ok=True)
                with open(self.photos_meta_path, "w") as f:
                    json.dump(self.photos_metadata, f, indent=2)
            except Exception as save_err:
                print(f"[ERROR] Failed saving photo metadata: {save_err}")

        return {
            "images_processed": total_images,
            "faces_detected": total_faces,
            "embeddings_created": total_embeddings,
            "no_face_images": len(self.no_face_images),
            "photos_analyzed": len(self.photos_metadata),
        }

    def get_no_face_images(self):
        return self.no_face_images
