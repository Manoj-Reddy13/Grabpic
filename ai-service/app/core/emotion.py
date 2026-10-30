# ai-service/app/core/emotion.py
"""
Facial expression classification module.
Note: Classifies visible facial cues and expression geometry (smile, eye opening, mouth curvature).
Does not determine actual internal feelings or psychological states.
"""

import numpy as np

EMOTION_CATEGORIES = [
    "Happy / Smiling",
    "Neutral",
    "Sad",
    "Angry",
    "Surprised",
]


class EmotionDetector:
    """
    Classifies facial expressions using facial landmark geometry and feature analysis.
    Supported categories: Happy / Smiling, Neutral, Sad, Angry, Surprised.
    Uses InsightFace 68-landmark 3D mesh when available, with robust 5-landmark fallback.
    """

    def __init__(self, enabled: bool = True):
        self.enabled = enabled

    def classify_face(self, face, image=None) -> dict:
        """
        Classifies visible expression for a detected face.

        Args:
            face: InsightFace Face object with 'landmark_3d_68', 'kps' (5 landmarks), and 'bbox'.
            image: Full image numpy array (optional).

        Returns:
            dict with 'dominant' label and 'scores' dict.
        """
        if not self.enabled or face is None:
            return {
                "dominant": "Neutral",
                "scores": {cat: (1.0 if cat == "Neutral" else 0.0) for cat in EMOTION_CATEGORIES},
            }

        lm68 = getattr(face, "landmark_3d_68", None)
        kps = getattr(face, "kps", None)
        bbox = getattr(face, "bbox", None)

        smile_val = 0.0
        surprised_val = 0.0
        sad_val = 0.0
        angry_val = 0.0

        if lm68 is not None and len(lm68) >= 68:
            # 68-landmark 3D mesh
            # Eyes: left outer corner 36, right outer corner 45
            iod = np.linalg.norm(lm68[45, :2] - lm68[36, :2])
            if iod <= 0:
                iod = 1.0

            # Mouth corners: left 48, right 54
            mouth_w = np.linalg.norm(lm68[54, :2] - lm68[48, :2])
            mouth_ratio = mouth_w / iod

            # Mouth height: upper lip center 51, lower lip center 57
            mouth_h = np.linalg.norm(lm68[57, :2] - lm68[51, :2])
            mouth_open = mouth_h / iod

            # Corner lift: corners vs upper lip center
            corners_y = (lm68[48, 1] + lm68[54, 1]) / 2.0
            lip_c_y = lm68[51, 1]
            lift = (lip_c_y - corners_y) / iod  # positive = lifted corners (smile)

            # Eyebrow height: left eyebrow 19, right eyebrow 24 vs eyes 37, 44
            brow_dist = ((lm68[37, 1] - lm68[19, 1]) + (lm68[44, 1] - lm68[24, 1])) / (2.0 * iod)

            # Features:
            # 1. Smile: mouth widens (>0.67 iod) and corners lift (lift > -0.09)
            if mouth_ratio > 0.65 or lift > -0.09:
                smile_val = max(0.0, (mouth_ratio - 0.64) * 3.5) + max(0.0, (lift + 0.10) * 3.0)

            # 2. Surprised: mouth open (>0.24) and high eyebrows
            if mouth_open > 0.22 or brow_dist > 0.32:
                surprised_val = max(0.0, (mouth_open - 0.20) * 4.0) + max(0.0, (brow_dist - 0.28) * 2.5)

            # 3. Sad: downturned mouth corners (lift < -0.13) and narrower mouth
            if lift < -0.12 and mouth_ratio < 0.63:
                sad_val = max(0.0, (-0.12 - lift) * 4.0)

            # 4. Angry: lowered eyebrows / furrowed brows
            if brow_dist < 0.22:
                angry_val = max(0.0, (0.24 - brow_dist) * 3.5)

        elif kps is not None and len(kps) >= 5:
            # 5-point fallback
            left_eye, right_eye = kps[0], kps[1]
            nose = kps[2]
            left_mouth, right_mouth = kps[3], kps[4]

            iod = np.linalg.norm(right_eye - left_eye)
            if iod <= 0:
                iod = 1.0

            mouth_w = np.linalg.norm(right_mouth - left_mouth)
            mouth_ratio = mouth_w / iod

            if mouth_ratio > 0.68:
                smile_val = max(0.0, (mouth_ratio - 0.66) * 3.0)

            face_w = max(1.0, bbox[2] - bbox[0]) if bbox is not None else 1.0
            face_h = max(1.0, bbox[3] - bbox[1]) if bbox is not None else 1.0
            aspect = face_h / face_w
            if aspect > 1.30:
                surprised_val = max(0.0, (aspect - 1.25) * 2.0)

        # Baseline weights
        raw_happy = 0.20 + (smile_val * 1.5)
        raw_surprised = 0.15 + (surprised_val * 1.4)
        raw_sad = 0.15 + (sad_val * 1.4)
        raw_angry = 0.15 + (angry_val * 1.4)
        
        # Neutral is high only when other expressions are low
        non_neutral_max = max(smile_val, surprised_val, sad_val, angry_val)
        raw_neutral = max(0.15, 0.55 - (non_neutral_max * 0.8))

        # Softmax normalization
        exp_scores = np.exp([raw_happy, raw_neutral, raw_sad, raw_angry, raw_surprised])
        probs = exp_scores / np.sum(exp_scores)

        scores_dict = {
            "Happy / Smiling": round(float(probs[0]), 3),
            "Neutral": round(float(probs[1]), 3),
            "Sad": round(float(probs[2]), 3),
            "Angry": round(float(probs[3]), 3),
            "Surprised": round(float(probs[4]), 3),
        }

        dominant = max(scores_dict.items(), key=lambda x: x[1])[0]

        return {
            "dominant": dominant,
            "scores": scores_dict,
        }
