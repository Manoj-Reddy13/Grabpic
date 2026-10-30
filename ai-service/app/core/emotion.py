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
    """

    def __init__(self, enabled: bool = True):
        self.enabled = enabled

    def classify_face(self, face, image=None) -> dict:
        """
        Classifies visible expression for a detected face.

        Args:
            face: InsightFace Face object with 'kps' (5 landmarks) and 'bbox'.
            image: Full image numpy array (optional).

        Returns:
            dict with 'dominant' label and 'scores' dict.
        """
        if not self.enabled or face is None:
            return {
                "dominant": "Neutral",
                "scores": {cat: (1.0 if cat == "Neutral" else 0.0) for cat in EMOTION_CATEGORIES},
            }

        kps = getattr(face, "kps", None)
        bbox = getattr(face, "bbox", None)

        if kps is None or len(kps) < 5 or bbox is None:
            return {
                "dominant": "Neutral",
                "scores": {
                    "Happy / Smiling": 0.2,
                    "Neutral": 0.6,
                    "Sad": 0.05,
                    "Angry": 0.05,
                    "Surprised": 0.1,
                },
            }

        # Landmarks: 0: left_eye, 1: right_eye, 2: nose, 3: left_mouth, 4: right_mouth
        left_eye, right_eye = kps[0], kps[1]
        nose = kps[2]
        left_mouth, right_mouth = kps[3], kps[4]

        # Inter-ocular distance (reference scale)
        iod = np.linalg.norm(right_eye - left_eye)
        if iod <= 0:
            iod = 1.0

        # Mouth width
        mouth_width = np.linalg.norm(right_mouth - left_mouth)
        mouth_ratio = mouth_width / iod  # Typically ~0.8-1.3 for smile

        # Mouth center & vertical position relative to nose
        mouth_center = (left_mouth + right_mouth) / 2.0
        nose_to_mouth_y = mouth_center[1] - nose[1]
        mouth_elevation = (left_mouth[1] + right_mouth[1]) / 2.0 - mouth_center[1]

        # Smile detection: smiling widens mouth significantly and lifts mouth corners
        # Eye level tilt
        eye_dy = right_eye[1] - left_eye[1]
        eye_dx = right_eye[0] - left_eye[0]
        angle = np.arctan2(eye_dy, eye_dx)

        # Rotate mouth corners to align with eye line
        c, s = np.cos(-angle), np.sin(-angle)
        rot_mat = np.array([[c, -s], [s, c]])

        rel_mouth_l = rot_mat @ (left_mouth - nose)
        rel_mouth_r = rot_mat @ (right_mouth - nose)

        # In horizontal face coordinates:
        # If corners are higher than expected relative to center, curvature is positive (smile)
        corner_avg_y = (rel_mouth_l[1] + rel_mouth_r[1]) / 2.0
        # Check aspect ratio
        face_w = max(1.0, bbox[2] - bbox[0])
        face_h = max(1.0, bbox[3] - bbox[1])
        aspect = face_h / face_w

        # Feature indicators
        smile_indicator = max(0.0, (mouth_ratio - 0.85) * 2.5)
        surprised_indicator = max(0.0, (aspect - 1.25) * 3.0)
        sad_indicator = max(0.0, (0.80 - mouth_ratio) * 2.0)
        angry_indicator = max(0.0, 0.4 - min(0.4, (nose_to_mouth_y / iod) * 0.5))

        # Raw scores
        raw_happy = 0.15 + (smile_indicator * 0.8)
        raw_surprised = 0.05 + (surprised_indicator * 0.6)
        raw_sad = 0.05 + (sad_indicator * 0.5)
        raw_angry = 0.05 + (angry_indicator * 0.4)
        raw_neutral = max(0.1, 1.0 - (raw_happy * 0.8 + raw_surprised * 0.5 + raw_sad * 0.5))

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
