# ai-service/test_ai_features.py
"""
Unit tests for AI enhancements:
- Group photo detection
- Facial expression / emotion classification
- Scene recognition
- Natural language query parsing
"""

import sys
import os
import unittest
import numpy as np

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.core.emotion import EmotionDetector, EMOTION_CATEGORIES
from app.core.scene import SceneClassifier, SCENE_CATEGORIES
from app.core.nl_search import NLQueryParser


class DummyFace:
    def __init__(self, bbox, kps=None, score=0.98):
        self.bbox = np.array(bbox)
        # default kps: left_eye, right_eye, nose, left_mouth, right_mouth
        if kps is None:
            self.kps = np.array([
                [bbox[0] + 20, bbox[1] + 30],
                [bbox[0] + 60, bbox[1] + 30],
                [bbox[0] + 40, bbox[1] + 50],
                [bbox[0] + 25, bbox[1] + 70],
                [bbox[0] + 55, bbox[1] + 70],
            ])
        else:
            self.kps = np.array(kps)
        self.det_score = score
        self.embedding = np.random.randn(512).astype(np.float32)


class TestAiFeatures(unittest.TestCase):
    def test_emotion_detector_categories(self):
        detector = EmotionDetector()
        face = DummyFace([10, 10, 90, 90])
        res = detector.classify_face(face)

        self.assertIn("dominant", res)
        self.assertIn("scores", res)
        self.assertIn(res["dominant"], EMOTION_CATEGORIES)
        for cat in EMOTION_CATEGORIES:
            self.assertIn(cat, res["scores"])
            self.assertTrue(0.0 <= res["scores"][cat] <= 1.0)

    def test_emotion_detector_smiling_geometry(self):
        detector = EmotionDetector()
        # Create smiling face geometry (wide mouth relative to eyes)
        wide_mouth_kps = [
            [30, 30],   # left eye
            [70, 30],   # right eye (iod = 40)
            [50, 50],   # nose
            [15, 68],   # left mouth (wide)
            [85, 68],   # right mouth (width = 70, ratio = 1.75)
        ]
        face = DummyFace([10, 10, 100, 100], kps=wide_mouth_kps)
        res = detector.classify_face(face)
        self.assertEqual(res["dominant"], "Happy / Smiling")
        self.assertGreater(res["scores"]["Happy / Smiling"], 0.40)

    def test_scene_classifier_group_photo(self):
        classifier = SceneClassifier()
        dummy_img = np.zeros((400, 600, 3), dtype=np.uint8)
        faces = [
            DummyFace([20, 50, 80, 130]),
            DummyFace([120, 50, 180, 130]),
            DummyFace([220, 50, 280, 130]),
            DummyFace([320, 50, 380, 130]),
        ]
        scenes = classifier.classify(dummy_img, faces)
        scene_labels = [s["label"] for s in scenes]
        self.assertIn("Group Photo", scene_labels)

    def test_scene_classifier_selfie(self):
        classifier = SceneClassifier()
        dummy_img = np.zeros((400, 400, 3), dtype=np.uint8)
        # Prominent single face occupying large portion
        faces = [DummyFace([50, 50, 350, 350])]
        scenes = classifier.classify(dummy_img, faces)
        scene_labels = [s["label"] for s in scenes]
        self.assertIn("Selfie", scene_labels)

    def test_nl_query_parser(self):
        q1 = "Show my photos from the stage."
        p1 = NLQueryParser.parse(q1)
        self.assertTrue(p1["requires_user_match"])
        self.assertEqual(p1["scene"], "Stage")

        q2 = "Find group photos where I am smiling."
        p2 = NLQueryParser.parse(q2)
        self.assertTrue(p2["requires_user_match"])
        self.assertTrue(p2["is_group"])
        self.assertEqual(p2["expression"], "Happy / Smiling")

        q3 = "Show photos taken outdoors."
        p3 = NLQueryParser.parse(q3)
        self.assertEqual(p3["scene"], "Outdoor")
        self.assertFalse(p3["requires_user_match"])


if __name__ == "__main__":
    unittest.main()

