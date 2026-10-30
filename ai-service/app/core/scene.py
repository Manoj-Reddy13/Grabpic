# ai-service/app/core/scene.py
"""
Scene recognition module for event photos.
Classifies visual content into categories:
Stage, Audience, Group Photo, Outdoor, Indoor, Food, Ceremony, Sports, Decoration, Selfie.
Supports multi-label confidence scores.
"""

import cv2
import numpy as np

SCENE_CATEGORIES = [
    "Stage",
    "Audience",
    "Group Photo",
    "Outdoor",
    "Indoor",
    "Food",
    "Ceremony",
    "Sports",
    "Decoration",
    "Selfie",
]


class SceneClassifier:
    """
    Classifies event photos using composition, face distribution, and color/texture features.
    Designed with a modular architecture so external vision models can be plugged in.
    """

    def __init__(self, confidence_threshold: float = 0.35):
        self.confidence_threshold = confidence_threshold

    def classify(self, image: np.ndarray, faces: list = None) -> list:
        """
        Classifies an image into one or more scene categories.

        Args:
            image: Image in BGR format (numpy array).
            faces: Detected InsightFace face objects.

        Returns:
            list of dicts: [ {"label": str, "confidence": float}, ... ]
            Sorted by confidence descending.
        """
        if image is None or image.size == 0:
            return [{"label": "Indoor", "confidence": 0.5}]

        h, w = image.shape[:2]
        img_area = float(h * w)
        face_count = len(faces) if faces else 0

        # Feature 1: Face Coverage & Distribution
        max_face_area_ratio = 0.0
        total_face_area_ratio = 0.0
        face_y_centers = []

        if faces:
            for f in faces:
                bbox = getattr(f, "bbox", None)
                if bbox is not None:
                    fw = max(0, bbox[2] - bbox[0])
                    fh = max(0, bbox[3] - bbox[1])
                    fa = (fw * fh) / img_area
                    total_face_area_ratio += fa
                    if fa > max_face_area_ratio:
                        max_face_area_ratio = fa
                    face_y_centers.append((bbox[1] + bbox[3]) / (2.0 * h))

        # Feature 2: Color Space Analysis (HSV)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]
        hue = hsv[:, :, 0]

        mean_sat = float(np.mean(sat))
        mean_val = float(np.mean(val))
        std_val = float(np.std(val))  # High variance = high contrast (e.g. spotlight on stage)

        # Sky/Blue pixels: Hue 90-130, Sat > 50, Val > 80
        blue_mask = (hue >= 90) & (hue <= 130) & (sat > 40) & (val > 70)
        blue_ratio = float(np.sum(blue_mask)) / img_area

        # Foliage/Green pixels: Hue 35-85, Sat > 40
        green_mask = (hue >= 35) & (hue <= 85) & (sat > 35) & (val > 40)
        green_ratio = float(np.sum(green_mask)) / img_area

        # Warm/Gold/Red/Amber pixels (Food, Ceremony, Indoor): Hue 0-25 or 160-180
        warm_mask = ((hue <= 25) | (hue >= 160)) & (sat > 50) & (val > 60)
        warm_ratio = float(np.sum(warm_mask)) / img_area

        # Feature 3: Contrast & Lighting (Stage vs Indoor)
        # Top 10% brightness vs bottom 10%
        val_sorted = np.sort(val.ravel())
        top_bright = float(np.mean(val_sorted[-int(len(val_sorted) * 0.05):]))
        bottom_dark = float(np.mean(val_sorted[:int(len(val_sorted) * 0.40):]))
        contrast_ratio = (top_bright - bottom_dark) / 255.0

        # Calculate scores for categories
        raw_scores = {}

        # 1. Selfie: 1 or 2 prominent faces occupying large portion of frame
        if face_count in (1, 2) and max_face_area_ratio > 0.08:
            raw_scores["Selfie"] = min(0.95, 0.45 + (max_face_area_ratio * 3.5))
        else:
            raw_scores["Selfie"] = 0.05

        # 2. Group Photo: 3 or more faces
        if face_count >= 3:
            raw_scores["Group Photo"] = min(0.96, 0.55 + min(0.4, (face_count - 2) * 0.1))
        elif face_count == 2:
            raw_scores["Group Photo"] = 0.45
        else:
            raw_scores["Group Photo"] = 0.05

        # 3. Outdoor: high blue (sky) or green (foliage/park)
        outdoor_score = min(0.95, (blue_ratio * 2.5) + (green_ratio * 2.8) + (0.1 if mean_val > 140 else 0.0))
        raw_scores["Outdoor"] = max(0.1, outdoor_score)

        # 4. Stage: dark ambient background, bright spotlights (high contrast), or performers
        if contrast_ratio > 0.50 and mean_val < 130:
            stage_score = min(0.92, 0.4 + (contrast_ratio * 0.7))
        else:
            stage_score = max(0.05, contrast_ratio * 0.3)
        raw_scores["Stage"] = stage_score

        # 5. Audience: multiple small faces in lower/middle portion of image
        if face_count >= 4 and max_face_area_ratio < 0.04:
            raw_scores["Audience"] = min(0.90, 0.5 + (face_count * 0.04))
        else:
            raw_scores["Audience"] = 0.05

        # 6. Food: Warm close-up colors, centered plate arrangement, zero or low faces
        if face_count == 0 and warm_ratio > 0.20 and mean_sat > 80:
            raw_scores["Food"] = min(0.88, 0.35 + (warm_ratio * 1.5))
        else:
            raw_scores["Food"] = 0.05

        # 7. Decoration: High vibrancy, high saturation, colorful patterns
        if mean_sat > 110 and face_count <= 2:
            raw_scores["Decoration"] = min(0.85, 0.3 + (mean_sat / 255.0) * 0.8)
        else:
            raw_scores["Decoration"] = 0.08

        # 8. Ceremony: Formal event, floral/warm/white accents
        if (stage_score > 0.3 or warm_ratio > 0.15) and face_count >= 2:
            raw_scores["Ceremony"] = min(0.86, 0.35 + (warm_ratio * 0.8) + (0.2 if face_count >= 2 else 0.0))
        else:
            raw_scores["Ceremony"] = 0.10

        # 9. Sports: Outdoor turf/greens, active poses
        if green_ratio > 0.25 and face_count <= 4 and std_val > 45:
            raw_scores["Sports"] = min(0.85, 0.35 + (green_ratio * 1.4))
        else:
            raw_scores["Sports"] = 0.05

        # 10. Indoor: Baseline ambient lighting when not strongly outdoor
        if raw_scores["Outdoor"] < 0.45:
            raw_scores["Indoor"] = min(0.90, max(0.45, 0.85 - raw_scores["Outdoor"]))
        else:
            raw_scores["Indoor"] = 0.15

        # Sort results
        sorted_scenes = sorted(
            [{"label": label, "confidence": round(float(score), 2)} for label, score in raw_scores.items()],
            key=lambda x: x["confidence"],
            reverse=True,
        )

        # Return scenes above threshold (at least top 2)
        filtered = [s for s in sorted_scenes if s["confidence"] >= self.confidence_threshold]
        if len(filtered) < 2:
            filtered = sorted_scenes[:2]

        return filtered
