# ai-service/app/services/blob_storage.py

import os
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone

from azure.storage.blob import (
    BlobServiceClient,
    generate_blob_sas,
    BlobSasPermissions,
)

from app.config import settings

logger = logging.getLogger(__name__)

blob_service_client = None

if settings.AZURE_STORAGE_CONNECTION_STRING:
    try:
        blob_service_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
    except Exception:
        logger.exception("Failed to initialize Azure Blob Storage")


def save_image_bytes(event_id: str, filename: str, content: bytes) -> dict:
    """
    Save the original image locally and optionally upload it to Azure.
    """

    # # 1. Save original image locally
    # image_dir = (
    #     Path(settings.BASE_DATA_DIR)
    #     / "events"
    #     / event_id
    #     / "images"
    # )
    # image_dir.mkdir(parents=True, exist_ok=True)

    # image_path = image_dir / filename

    # with image_path.open("wb") as image_file:
    #     image_file.write(content)

    # logger.info("Image saved locally: %s", image_path)

    # result = {
    #     "filename": filename,
    #     "local_path": str(image_path),
    #     "blob_path": None,
    # }
    result={}
    # 2. Upload to Azure only if enabled
    if settings.USE_BLOB_STORAGE:
        if not blob_service_client:
            raise RuntimeError(
                "Azure is enabled, but BlobServiceClient is unavailable"
            )

        blob_path = f"events/{event_id}/images/{filename}"

        container_client = blob_service_client.get_container_client(
            settings.AZURE_CONTAINER_NAME
        )

        container_client.upload_blob(
            name=blob_path,
            data=content,
            overwrite=True,
        )

        result["blob_path"] = blob_path

        logger.info("Azure upload successful: %s", blob_path)

    return result


def generate_download_sas(blob_name: str) -> str:
    """Generate a temporary read-only Azure download URL."""

    if not settings.USE_BLOB_STORAGE or not blob_service_client:
        raise ValueError("Azure Blob Storage is unavailable")

    conn_dict = dict(
        item.split("=", 1)
        for item in settings.AZURE_STORAGE_CONNECTION_STRING.split(";")
        if "=" in item
    )

    account_name = conn_dict.get("AccountName")
    account_key = conn_dict.get("AccountKey")

    if not account_name or not account_key:
        raise ValueError("Azure account credentials are missing")

    sas_token = generate_blob_sas(
        account_name=account_name,
        account_key=account_key,
        container_name=settings.AZURE_CONTAINER_NAME,
        blob_name=blob_name,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(minutes=10),
        content_disposition=(
            f'attachment; filename="{Path(blob_name).name}"'
        ),
    )

    return (
        f"https://{account_name}.blob.core.windows.net/"
        f"{settings.AZURE_CONTAINER_NAME}/{blob_name}?{sas_token}"
    )


def delete_event_blobs(event_id: str):
    """Delete Azure blobs belonging to one event."""

    if not settings.USE_BLOB_STORAGE or not blob_service_client:
        return

    container_client = blob_service_client.get_container_client(
        settings.AZURE_CONTAINER_NAME
    )

    prefix = f"events/{event_id}/"

    for blob in container_client.list_blobs(name_starts_with=prefix):
        container_client.delete_blob(blob.name)
        logger.info("Deleted Azure blob: %s", blob.name)


def delete_event_local_images(event_id: str):
    """Delete local files belonging to one event."""

    event_dir = (
        Path(settings.BASE_DATA_DIR)
        / "events"
        / event_id
    )

    if event_dir.exists():
        import shutil
        shutil.rmtree(event_dir)
        logger.info("Deleted local event directory: %s", event_dir)
