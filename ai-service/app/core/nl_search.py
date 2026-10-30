# ai-service/app/core/nl_search.py
"""
Natural Language Photo Search Engine.
Translates human queries into structured filters across:
- Facial expressions (Happy / Smiling, Surprised, Neutral, Sad, Angry)
- Scene categories (Stage, Audience, Group Photo, Outdoor, Indoor, Food, Ceremony, Sports, Decoration, Selfie)
- Group vs Solo photos (min_faces, max_faces, is_group)
- Self/Face constraint (requires_user_match: True/False)
"""

import re
from typing import Dict, Any

EXPRESSION_MAP = {
    "happy": "Happy / Smiling",
    "smile": "Happy / Smiling",
    "smiling": "Happy / Smiling",
    "cheerful": "Happy / Smiling",
    "laugh": "Happy / Smiling",
    "laughing": "Happy / Smiling",
    "joy": "Happy / Smiling",
    "fun": "Happy / Smiling",
    "excited": "Happy / Smiling",
    "neutral": "Neutral",
    "calm": "Neutral",
    "serious": "Neutral",
    "sad": "Sad",
    "unhappy": "Sad",
    "crying": "Sad",
    "angry": "Angry",
    "mad": "Angry",
    "frowning": "Angry",
    "surprised": "Surprised",
    "shocked": "Surprised",
    "amazed": "Surprised",
}

SCENE_MAP = {
    "stage": "Stage",
    "podium": "Stage",
    "performance": "Stage",
    "presentation": "Stage",
    "audience": "Audience",
    "crowd": "Audience",
    "spectator": "Audience",
    "spectators": "Audience",
    "outdoor": "Outdoor",
    "outdoors": "Outdoor",
    "outside": "Outdoor",
    "nature": "Outdoor",
    "park": "Outdoor",
    "sun": "Outdoor",
    "indoor": "Indoor",
    "indoors": "Indoor",
    "inside": "Indoor",
    "hall": "Indoor",
    "room": "Indoor",
    "food": "Food",
    "dinner": "Food",
    "lunch": "Food",
    "breakfast": "Food",
    "buffet": "Food",
    "meal": "Food",
    "snack": "Food",
    "ceremony": "Ceremony",
    "award": "Ceremony",
    "awards": "Ceremony",
    "ritual": "Ceremony",
    "convocation": "Ceremony",
    "sports": "Sports",
    "game": "Sports",
    "athletic": "Sports",
    "field": "Sports",
    "decoration": "Decoration",
    "decor": "Decoration",
    "stage decor": "Decoration",
    "lighting": "Decoration",
    "lights": "Decoration",
    "selfie": "Selfie",
    "close up": "Selfie",
    "closeup": "Selfie",
    "portrait": "Selfie",
    "group": "Group Photo",
    "friends": "Group Photo",
    "team": "Group Photo",
    "group photo": "Group Photo",
    "gathering": "Group Photo",
}


class NLQueryParser:
    """
    Parses unstructured text search queries into structured filter parameters.
    """

    @staticmethod
    def parse(query: str) -> Dict[str, Any]:
        q = (query or "").lower().strip()
        result = {
            "raw_query": query,
            "requires_user_match": False,
            "expression": None,
            "scene": None,
            "is_group": False,
            "min_faces": None,
            "max_faces": None,
            "keywords": [],
        }

        # Check for self references ("my", "me", "myself", "i am")
        if re.search(r"\b(my|me|myself|i|i'm)\b", q):
            result["requires_user_match"] = True

        # Check for group references ("group", "friends", "team", "together", "multiple people")
        if re.search(r"\b(group|friends|team|together|multiple|crowd|everyone)\b", q):
            result["is_group"] = True
            result["min_faces"] = 2

        # Check for solo references ("solo", "single", "only me", "alone")
        if re.search(r"\b(solo|single|alone|just me|only me)\b", q):
            result["max_faces"] = 1
            result["is_group"] = False

        # Extract expressions
        for word, expr in EXPRESSION_MAP.items():
            if re.search(rf"\b{word}\b", q):
                result["expression"] = expr
                break

        # Extract scenes
        for word, scn in SCENE_MAP.items():
            if re.search(rf"\b{word}\b", q):
                result["scene"] = scn
                break

        # Keywords fallback
        tokens = [w for w in re.findall(r"\w+", q) if len(w) > 3]
        result["keywords"] = tokens

        return result

