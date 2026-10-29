# import os

# # ai-service/app/config.py

# class Settings:
#     """
#     Central configuration for AI service.
#     Modify values here instead of hardcoding in logic.
#     """

#     # -------------------------
#     # MODEL CONFIG
#     # -------------------------
#     MODEL_NAME = "buffalo_l"
#     DETECTION_SIZE = (640, 640)

#     # -------------------------
#     # EMBEDDING CONFIG
#     # -------------------------
#     EMBEDDING_DIM = 512

#     # -------------------------
#     # SEARCH CONFIG
#     # -------------------------
#     TOP_K = 20   # number of nearest neighbors to fetch

#     # -------------------------
#     # MATCHING THRESHOLDS
#     # (tune based on real data)
#     # -------------------------
#     STRONG_THRESHOLD = 0.65
#     WEAK_THRESHOLD = 0.5

#     # -------------------------
#     # USER INPUT LIMITS
#     # -------------------------
#     MAX_SELFIES = 4
#     MIN_SELFIES = 1

#     # -------------------------
#     # IMAGE PROCESSING
#     # -------------------------
#     MAX_IMAGE_WIDTH = 800

#     # -------------------------
#     # STORAGE PATHS
#     # -------------------------
#     # STORAGE PATHS
#     BASE_DATA_DIR = os.getenv("BASE_DATA_DIR", "/app/data")
#     QUERY_DIR = os.getenv("QUERY_DIR", "/app/query_data")

#     # -------------------------
#     # SECURITY & EXPIRY
#     # -------------------------
#     IMAGE_TOKEN_SECRET = os.getenv("IMAGE_TOKEN_SECRET", "defaultSecretKeyForTokensIfEnvMissing")
#     EVENT_EXPIRY_HOURS = int(os.getenv("EVENT_EXPIRY_HOURS", "24"))

#     # -------------------------
#     # AZURE BLOB STORAGE
#     # -------------------------
#     AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
#     AZURE_CONTAINER_NAME = os.getenv("AZURE_CONTAINER_NAME", "events")
#     USE_BLOB_STORAGE = "false"


# # Singleton instance (use everywhere)
# settings = Settings()

# ai-service/app/config.py

import os
from dotenv import load_dotenv
load_dotenv()

class Settings:
    """
    Central configuration for the GrabPic AI service.
    Supports local development and Docker deployment.
    """

    # -------------------------
    # MODEL CONFIGURATION
    # -------------------------
    MODEL_NAME = os.getenv("MODEL_NAME", "buffalo_l")
    DETECTION_SIZE = (640, 640)

    # -------------------------
    # EMBEDDING CONFIGURATION
    # -------------------------
    EMBEDDING_DIM = 512

    # -------------------------
    # SEARCH CONFIGURATION
    # -------------------------
    TOP_K = 20

    # -------------------------
    # MATCHING THRESHOLDS
    # -------------------------
    STRONG_THRESHOLD = 0.65
    WEAK_THRESHOLD = 0.5

    # -------------------------
    # USER INPUT LIMITS
    # -------------------------
    MAX_SELFIES = 4
    MIN_SELFIES = 1

    # -------------------------
    # IMAGE PROCESSING
    # -------------------------
    MAX_IMAGE_WIDTH = 800

    # -------------------------
    # STORAGE PATHS
    # -------------------------
    # Local default: ai-service/data
    # Docker override: BASE_DATA_DIR=/app/data

    BASE_DATA_DIR = os.path.abspath(
        os.getenv(
            "BASE_DATA_DIR",
            os.path.join(os.path.dirname(__file__), "..", "data")
        )
    )

    QUERY_DIR = os.path.abspath(
        os.getenv(
            "QUERY_DIR",
            os.path.join(os.path.dirname(__file__), "..", "query_data")
        )
    )

    # -------------------------
    # SECURITY & EXPIRY
    # -------------------------
    IMAGE_TOKEN_SECRET = os.getenv(
        "IMAGE_TOKEN_SECRET",
        "defaultSecretKeyForTokensIfEnvMissing"
    )

    EVENT_EXPIRY_HOURS = int(
        os.getenv("EVENT_EXPIRY_HOURS", "24")
    )

    # -------------------------
    # AZURE BLOB STORAGE
    # -------------------------
    AZURE_STORAGE_CONNECTION_STRING = os.getenv(
        "AZURE_STORAGE_CONNECTION_STRING", ""
    )

    AZURE_CONTAINER_NAME = os.getenv(
        "AZURE_CONTAINER_NAME", "events"
    )

    # Set USE_BLOB_STORAGE=true to enable Azure uploads.
    USE_BLOB_STORAGE = os.getenv("USE_BLOB_STORAGE", "false").lower() == "true"


# -------------------------
# SINGLETON INSTANCE
# -------------------------
settings = Settings()
