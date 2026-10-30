import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RetroButton from "./RetroButton";
import {
  togglePhotoLike,
  getPhotoLikes,
  getPhotoComments,
  addPhotoComment,
  deletePhotoComment,
  getLocalUser,
} from "../api/client";

/**
 * ImageModal — Fullscreen lightbox with keyboard navigation,
 * real-time likes, interactive comments, and AI metadata tags.
 */
export default function ImageModal({
  eventId,
  images = [],
  selectedIndex,
  onClose,
  onNavigate,
  getImageSrc,
  getDownloadHref,
  userRole = "viewer",
}) {
  const isOpen = selectedIndex !== null && selectedIndex !== undefined;
  const currentImage = isOpen ? images[selectedIndex] : null;

  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const currentUser = getLocalUser();
  const photoId = currentImage?.imageId || currentImage?.filename || "";

  // Fetch likes and comments for current image
  const fetchSocialData = useCallback(async () => {
    if (!eventId || !photoId) return;

    try {
      const likesRes = await getPhotoLikes(eventId, photoId);
      setLikeCount(likesRes.data.likeCount || 0);
      setHasLiked(Boolean(likesRes.data.hasLiked));
    } catch {
      // ignore
    }

    try {
      setLoadingComments(true);
      const commentsRes = await getPhotoComments(eventId, photoId);
      setComments(commentsRes.data.comments || []);
    } catch {
      // ignore
    } finally {
      setLoadingComments(false);
    }
  }, [eventId, photoId]);

  useEffect(() => {
    if (isOpen && currentImage) {
      fetchSocialData();
    }
  }, [isOpen, currentImage, fetchSocialData]);

  const handleLikeToggle = async () => {
    if (!eventId || !photoId) return;

    // Optimistic UI update
    setHasLiked(!hasLiked);
    setLikeCount((c) => (hasLiked ? Math.max(0, c - 1) : c + 1));

    try {
      const res = await togglePhotoLike(eventId, photoId);
      setHasLiked(res.data.liked);
      setLikeCount(res.data.likeCount);
    } catch {
      // Revert on failure
      setHasLiked(hasLiked);
      setLikeCount(likeCount);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      const res = await addPhotoComment(eventId, photoId, newComment.trim());
      setComments((prev) => [...prev, res.data]);
      setNewComment("");
    } catch {
      alert("Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await deletePhotoComment(eventId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete comment");
    }
  };

  const goLeft = useCallback(() => {
    if (selectedIndex > 0) onNavigate(selectedIndex - 1);
  }, [selectedIndex, onNavigate]);

  const goRight = useCallback(() => {
    if (selectedIndex < images.length - 1) onNavigate(selectedIndex + 1);
  }, [selectedIndex, images.length, onNavigate]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goLeft();
      if (e.key === "ArrowRight") goRight();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, goLeft, goRight, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // AI tag badges
  const isGroup = currentImage?.is_group_photo || (currentImage?.face_count && currentImage.face_count >= 2);
  const faceCount = currentImage?.face_count;
  const primaryScene = currentImage?.primary_scene || (currentImage?.scenes && currentImage.scenes[0]?.label);
  const dominantExpr = currentImage?.dominant_expression;

  return (
    <AnimatePresence>
      {isOpen && currentImage && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-content-enhanced"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <RetroButton
              variant="icon"
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </RetroButton>

            {/* Nav Left */}
            {selectedIndex > 0 && (
              <RetroButton
                variant="icon"
                className="modal-nav modal-nav--left"
                onClick={goLeft}
                aria-label="Previous image"
              >
                ◀
              </RetroButton>
            )}

            {/* Main Stage */}
            <div className="modal-stage">
              <img
                src={getImageSrc(currentImage)}
                alt={`Photo ${selectedIndex + 1}`}
                className="modal-image"
              />

              {/* AI Badges Overlay */}
              <div className="modal-ai-badges">
                {isGroup && (
                  <span className="ai-badge ai-badge--magenta">
                    👥 Group ({faceCount || "Multiple"} faces)
                  </span>
                )}
                {primaryScene && (
                  <span className="ai-badge ai-badge--cyan">
                    🎬 {primaryScene}
                  </span>
                )}
                {dominantExpr && (
                  <span className="ai-badge ai-badge--amber">
                    ✨ {dominantExpr}
                  </span>
                )}
              </div>
            </div>

            {/* Nav Right */}
            {selectedIndex < images.length - 1 && (
              <RetroButton
                variant="icon"
                className="modal-nav modal-nav--right"
                onClick={goRight}
                aria-label="Next image"
              >
                ▶
              </RetroButton>
            )}

            {/* Bottom Action Bar */}
            <div className="modal-bottom-bar">
              <div className="modal-social-actions">
                {/* Like Button */}
                <button
                  onClick={handleLikeToggle}
                  className={`action-btn-like ${hasLiked ? "action-btn-like--active" : ""}`}
                >
                  <span className="like-heart">{hasLiked ? "❤️" : "🤍"}</span>
                  <span className="like-counter">{likeCount}</span>
                </button>

                {/* Comments Toggle */}
                <button
                  onClick={() => setShowComments(!showComments)}
                  className={`action-btn-comment ${showComments ? "action-btn-comment--active" : ""}`}
                >
                  💬 Comments ({comments.length})
                </button>
              </div>

              {/* Download */}
              <div className="modal-download-action">
                <a
                  href={getDownloadHref(currentImage)}
                  download
                  className="btn btn--primary"
                >
                  ↓ DOWNLOAD
                </a>
              </div>
            </div>

            {/* Expandable Comments Drawer */}
            <AnimatePresence>
              {showComments && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="modal-comments-section"
                >
                  <h4 className="comments-heading">
                    COMMENTS ({comments.length})
                  </h4>

                  <div className="comments-scroll-list">
                    {loadingComments ? (
                      <p className="comments-loading">Loading comments...</p>
                    ) : comments.length === 0 ? (
                      <p className="comments-empty">
                        No comments yet. Be the first to comment!
                      </p>
                    ) : (
                      comments.map((c) => {
                        const canDelete =
                          c.user_id === currentUser.id ||
                          userRole === "owner" ||
                          userRole === "admin";
                        return (
                          <div key={c.id} className="comment-bubble">
                            <div className="comment-bubble-header">
                              <span className="comment-author">
                                {c.user_name}
                              </span>
                              <span className="comment-time">
                                {new Date(c.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteComment(c.id)}
                                  className="comment-del-btn"
                                  title="Delete comment"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                            <p className="comment-text">{c.comment_text}</p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Comment Form */}
                  <form onSubmit={handleAddComment} className="comment-input-form">
                    <input
                      type="text"
                      placeholder={`Comment as ${currentUser.name}...`}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      maxLength={500}
                      className="comment-input-field"
                    />
                    <RetroButton
                      variant="primary"
                      disabled={!newComment.trim() || submittingComment}
                      style={{ padding: "8px 16px", minWidth: "80px" }}
                    >
                      {submittingComment ? "..." : "Send"}
                    </RetroButton>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
