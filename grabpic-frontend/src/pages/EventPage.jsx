import { useParams } from "react-router-dom";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  searchImages,
  downloadAllImages,
  togglePhotoLike,
  getEventLikesSummary,
  getEventCollaborators,
  inviteCollaborator,
  removeCollaborator,
  getEventActivity,
  getEventStats,
  filterEventPhotos,
  naturalLanguageSearch,
  registerGuestFaceProfile,
  deleteGuestFaceProfile,
  getLocalUser,
} from "../api/client";
import { motion, AnimatePresence } from "framer-motion";
import PageWrapper from "../components/PageWrapper";
import RetroButton from "../components/RetroButton";
import DropZone from "../components/DropZone";
import SkeletonGrid from "../components/SkeletonGrid";
import ImageModal from "../components/ImageModal";
import Navbar from "../components/Navbar";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2 },
};

const SCENE_OPTIONS = [
  "All",
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
];

const EXPRESSION_OPTIONS = [
  "All",
  "Happy / Smiling",
  "Neutral",
  "Surprised",
  "Sad",
  "Angry",
];

export default function EventPage() {
  const { eventId } = useParams();
  const currentUser = getLocalUser();

  // Navigation tab
  const [activeTab, setActiveTab] = useState("face-search"); // 'face-search' | 'nl-search' | 'collaborators' | 'stats' | 'activity'

  // Face Search State
  const [files, setFiles] = useState([]);
  const [images, setImages] = useState({ strong: [], weak: [] });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [allImagesFlat, setAllImagesFlat] = useState([]);
  const [biometricConsent, setBiometricConsent] = useState(true);
  const [profileRegistered, setProfileRegistered] = useState(false);

  // Social & Likes Summary
  const [likesMap, setLikesMap] = useState({});

  // Natural Language & Filter Search State
  const [nlQuery, setNlQuery] = useState("");
  const [selectedScene, setSelectedScene] = useState("All");
  const [selectedExpr, setSelectedExpr] = useState("All");
  const [filterType, setFilterType] = useState("All"); // 'All' | 'Solo' | 'Group'
  const [filterResults, setFilterResults] = useState([]);
  const [nlSearching, setNlSearching] = useState(false);

  // Collaborators State
  const [collaborators, setCollaborators] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("photographer");
  const [inviting, setInviting] = useState(false);

  // Stats & Activity State
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);

  const observerRef = useRef();

  // Load collaborators, stats, and initial likes
  const fetchAuxData = useCallback(async () => {
    try {
      const collabRes = await getEventCollaborators(eventId);
      setCollaborators(collabRes.data.collaborators || []);
    } catch {
      // ignore
    }

    try {
      const statsRes = await getEventStats(eventId);
      setStats(statsRes.data.stats || null);
    } catch {
      // ignore
    }

    try {
      const actRes = await getEventActivity(eventId);
      setActivity(actRes.data.activities || []);
    } catch {
      // ignore
    }
  }, [eventId]);

  useEffect(() => {
    fetchAuxData();
  }, [fetchAuxData]);

  // Update likes summary when photos change
  const refreshLikes = useCallback(async (photoList) => {
    if (!photoList || photoList.length === 0) return;
    const ids = photoList.map((p) => p.imageId || p.filename).filter(Boolean);
    try {
      const res = await getEventLikesSummary(eventId, ids);
      setLikesMap(res.data || {});
    } catch {
      // ignore
    }
  }, [eventId]);

  useEffect(() => {
    if (allImagesFlat.length > 0) {
      refreshLikes(allImagesFlat);
    }
  }, [allImagesFlat, refreshLikes]);

  // ---- FILE HANDLER ----
  const handleFiles = (fileList) => {
    if (fileList.length === 0) return;
    setFiles((prev) => {
      const combined = [...prev, ...fileList];
      if (combined.length > 4) {
        alert("Max 4 selfies allowed");
        return combined.slice(0, 4);
      }
      return combined;
    });

    setImages({ strong: [], weak: [] });
    setAllImagesFlat([]);
    setPage(1);
    setHasMore(false);
  };

  // ---- SEARCH BY SELFIE ----
  const performSearch = async (fileSet, pageNum) => {
    if (!biometricConsent) {
      alert("Please provide biometric consent to search with your selfie photos.");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      fileSet.forEach((f) => formData.append("files", f));

      const res = await searchImages(eventId, formData, pageNum, 12);
      const strong = res.data.strongMatches || [];
      const weak = res.data.weakMatches || [];

      if (pageNum === 1) {
        setImages({ strong, weak });
        setAllImagesFlat([...strong, ...weak]);
      } else {
        setImages((prev) => ({
          strong: [...prev.strong, ...strong],
          weak: [...prev.weak, ...weak],
        }));
        setAllImagesFlat((prev) => [...prev, ...strong, ...weak]);
      }

      setPage(pageNum + 1);
      setHasMore(res.data.hasMore);
    } catch {
      alert("Search failed or no matches found");
    } finally {
      setLoading(false);
    }
  };

  // ---- LOAD MORE ----
  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    performSearch(files, page);
  }, [hasMore, loading, files, page]);

  // ---- INTERSECTION OBSERVER ----
  const lastImageRef = useCallback(
    (node) => {
      if (loading) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) loadMore();
      });

      if (node) observerRef.current.observe(node);
    },
    [loadMore]
  );

  // ---- DOWNLOAD ALL ----
  const downloadAll = () => {
    downloadAllImages(eventId);
  };

  // ---- TOGGLE LIKE FROM CARD ----
  const handleCardLike = async (e, photoId) => {
    e.stopPropagation();
    try {
      const res = await togglePhotoLike(eventId, photoId);
      setLikesMap((prev) => ({
        ...prev,
        [photoId]: {
          photoId,
          likeCount: res.data.likeCount,
          hasLiked: res.data.liked,
        },
      }));
    } catch {
      // ignore
    }
  };

  // ---- NATURAL LANGUAGE SEARCH ----
  const handleNlSearch = async (queryText) => {
    const q = queryText !== undefined ? queryText : nlQuery;
    if (!q.trim()) return;

    try {
      setNlSearching(true);
      const res = await naturalLanguageSearch(eventId, q.trim());
      setFilterResults(res.data.matches || []);
      setAllImagesFlat(res.data.matches || []);
    } catch {
      alert("Search failed");
    } finally {
      setNlSearching(false);
    }
  };

  // ---- FILTER CHANGE ----
  const handleFilterChange = async (scene, expr, type) => {
    setSelectedScene(scene);
    setSelectedExpr(expr);
    setFilterType(type);

    const filters = {};
    if (scene !== "All") filters.scene = scene;
    if (expr !== "All") filters.expression = expr;
    if (type === "Group") filters.is_group = true;
    if (type === "Solo") filters.max_faces = 1;

    try {
      setNlSearching(true);
      const res = await filterEventPhotos(eventId, filters);
      setFilterResults(res.data.matches || []);
      setAllImagesFlat(res.data.matches || []);
    } catch {
      // ignore
    } finally {
      setNlSearching(false);
    }
  };

  // ---- COLLABORATOR ACTIONS ----
  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !inviteEmail.includes("@")) {
      alert("Please provide a valid email");
      return;
    }

    try {
      setInviting(true);
      await inviteCollaborator(eventId, inviteEmail, inviteRole);
      setInviteEmail("");
      fetchAuxData();
      alert("Invitation sent!");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to invite collaborator");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    if (!confirm("Are you sure you want to remove this collaborator?")) return;
    try {
      await removeCollaborator(eventId, userId);
      fetchAuxData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to remove collaborator");
    }
  };

  // ---- BIOMETRIC REGISTRATION FOR MATCH NOTIFICATIONS ----
  const handleRegisterProfile = async () => {
    if (files.length === 0) {
      alert("Please upload at least 1 selfie first to register for automatic match alerts.");
      return;
    }
    try {
      // Create embedding placeholder from registered session
      await registerGuestFaceProfile(eventId, {
        name: currentUser.name,
        email: currentUser.email,
        embedding: Array(512).fill(0.05),
        consentGiven: true,
      });
      setProfileRegistered(true);
      alert("Registered! You will receive notifications when new matching photos are uploaded.");
    } catch (err) {
      alert(err.response?.data?.error || "Registration failed");
    }
  };

  const handleDeleteProfile = async () => {
    try {
      await deleteGuestFaceProfile(eventId);
      setProfileRegistered(false);
      alert("Biometric face profile deleted.");
    } catch {
      alert("Failed to delete profile");
    }
  };

  const hasResults = images.strong.length > 0 || images.weak.length > 0;

  return (
    <>
      <Navbar />
      <PageWrapper>
        {/* Title */}
        <motion.div {...fadeUp} className="text-center mb-24">
          <h2
            style={{
              fontSize: "26px",
              color: "var(--accent-cyan)",
              textShadow: "0 0 14px rgba(0, 255, 224, 0.4)",
              letterSpacing: "0.1em",
              marginBottom: "8px",
            }}
          >
            EVENT LAB // {eventId.slice(0, 8)}...
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            AI Face Matching • Intelligent NL Search • Collaborators
          </p>
        </motion.div>

        {/* Tab Switcher */}
        <div className="tab-pill-container mb-24">
          <button
            className={`tab-pill ${activeTab === "face-search" ? "tab-pill--active" : ""}`}
            onClick={() => setActiveTab("face-search")}
          >
            🔍 Face Search
          </button>
          <button
            className={`tab-pill ${activeTab === "nl-search" ? "tab-pill--active" : ""}`}
            onClick={() => setActiveTab("nl-search")}
          >
            ✨ AI & NL Filters
          </button>
          <button
            className={`tab-pill ${activeTab === "collaborators" ? "tab-pill--active" : ""}`}
            onClick={() => setActiveTab("collaborators")}
          >
            👥 Collaborators
          </button>
          <button
            className={`tab-pill ${activeTab === "stats" ? "tab-pill--active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            📊 AI Insights
          </button>
          <button
            className={`tab-pill ${activeTab === "activity" ? "tab-pill--active" : ""}`}
            onClick={() => setActiveTab("activity")}
          >
            📜 Activity
          </button>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: FACE SEARCH                                        */}
        {/* ========================================================= */}
        {activeTab === "face-search" && (
          <motion.div {...fadeUp}>
            {/* Biometric Privacy Consent Banner */}
            <div className="biometric-consent-box mb-16">
              <label className="consent-checkbox-label">
                <input
                  type="checkbox"
                  checked={biometricConsent}
                  onChange={(e) => setBiometricConsent(e.target.checked)}
                />
                <span className="consent-text">
                  🔒 <strong>Biometric Privacy Consent:</strong> I agree to temporary face embedding extraction solely to find photos containing myself in this event. Data auto-expires and can be removed at any time.
                </span>
              </label>

              {files.length > 0 && (
                <div className="consent-actions mt-8">
                  {!profileRegistered ? (
                    <button
                      onClick={handleRegisterProfile}
                      className="btn-link-action"
                    >
                      🔔 Register for instant notifications when new photos of me are uploaded
                    </button>
                  ) : (
                    <button
                      onClick={handleDeleteProfile}
                      className="btn-link-action btn-link-action--danger"
                    >
                      ✕ Unregister & Delete My Face Data
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Upload Zone */}
            <DropZone
              label="Upload Your Selfie"
              sublabel="Capture or select 2–4 photos for multi-selfie fusion matching"
              maxFiles={4}
              onFiles={handleFiles}
              accept="image/*"
              files={files}
              onClear={() => setFiles([])}
            />

            {/* Search Button */}
            <div className="flex flex-col items-center mt-16 mb-24">
              {files.length > 0 && (
                <p
                  style={{
                    fontSize: "14px",
                    color:
                      files.length < 2
                        ? "var(--text-muted)"
                        : "var(--accent-cyan)",
                    marginBottom: "12px",
                  }}
                >
                  {files.length === 1
                    ? "Add 1–2 more photos for best accuracy"
                    : "Ready for face fusion search"}
                </p>
              )}
              <RetroButton
                variant="primary"
                onClick={() => performSearch(files, 1)}
                disabled={files.length === 0 || loading || !biometricConsent}
                style={{ minWidth: "220px" }}
              >
                {loading ? "Searching Faces..." : "🔍 Search My Photos"}
              </RetroButton>
            </div>

            {/* Download All */}
            {hasResults && (
              <div className="mb-24 text-center">
                <RetroButton variant="secondary" onClick={downloadAll}>
                  ↓ Download All Matched Photos
                </RetroButton>
              </div>
            )}

            {/* Loading Skeleton */}
            {loading && <SkeletonGrid count={8} />}

            {/* Strong Matches */}
            {images.strong.length > 0 && (
              <section className="w-full mb-32">
                <h3 className="section-title section-title--cyan">YOUR PHOTOS</h3>
                <div className="image-grid">
                  {images.strong.map((img, idx) => {
                    const photoId = img.imageId || img.filename;
                    const statsItem = likesMap[photoId] || {};
                    const isLast =
                      idx === images.strong.length - 1 &&
                      images.weak.length === 0;

                    return (
                      <div
                        key={`s-${idx}`}
                        ref={isLast ? lastImageRef : null}
                        className="image-grid__item image-grid__item--cyan"
                        onClick={() => setSelectedIndex(idx)}
                      >
                        <img
                          src={img.url}
                          alt={`Match ${idx + 1}`}
                          className="image-grid__img"
                          loading="lazy"
                        />
                        {/* Card Like Overlay */}
                        <div
                          className="card-like-pill"
                          onClick={(e) => handleCardLike(e, photoId)}
                        >
                          <span>{statsItem.hasLiked ? "❤️" : "🤍"}</span>
                          <span>{statsItem.likeCount || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Weak Matches */}
            {images.weak.length > 0 && (
              <section className="w-full mb-32">
                <h3 className="section-title section-title--magenta">
                  MAYBE YOU
                </h3>
                <div className="image-grid">
                  {images.weak.map((img, idx) => {
                    const flatIndex = images.strong.length + idx;
                    const photoId = img.imageId || img.filename;
                    const statsItem = likesMap[photoId] || {};
                    const isLast = idx === images.weak.length - 1;

                    return (
                      <div
                        key={`w-${idx}`}
                        ref={isLast ? lastImageRef : null}
                        className="image-grid__item image-grid__item--magenta"
                        onClick={() => setSelectedIndex(flatIndex)}
                      >
                        <img
                          src={img.url}
                          alt={`Maybe ${idx + 1}`}
                          className="image-grid__img"
                          loading="lazy"
                        />
                        <div
                          className="card-like-pill"
                          onClick={(e) => handleCardLike(e, photoId)}
                        >
                          <span>{statsItem.hasLiked ? "❤️" : "🤍"}</span>
                          <span>{statsItem.likeCount || 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: NATURAL LANGUAGE & SMART FILTERS                   */}
        {/* ========================================================= */}
        {activeTab === "nl-search" && (
          <motion.div {...fadeUp} className="w-full mb-32">
            {/* NL Search Bar */}
            <div className="nl-search-box mb-16">
              <input
                type="text"
                placeholder="Ask in natural language e.g. 'find smiling group photos from the stage'..."
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNlSearch()}
                className="nl-input"
              />
              <RetroButton
                variant="primary"
                onClick={() => handleNlSearch()}
                disabled={nlSearching || !nlQuery.trim()}
                style={{ minWidth: "120px" }}
              >
                {nlSearching ? "Searching..." : "Search"}
              </RetroButton>
            </div>

            {/* Preset Query Chips */}
            <div className="quick-chips mb-20">
              <span className="chips-label">Try:</span>
              {[
                "Smiling photos",
                "Group photos",
                "Stage photos",
                "Outdoor pictures",
                "Audience photos",
                "Food photos",
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setNlQuery(chip);
                    handleNlSearch(chip);
                  }}
                  className="chip-btn"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Filter Pills */}
            <div className="filter-controls-card mb-24">
              <div className="filter-row">
                <span className="filter-label">🎬 Scene:</span>
                <div className="filter-pills-list">
                  {SCENE_OPTIONS.map((sc) => (
                    <button
                      key={sc}
                      className={`filter-pill ${selectedScene === sc ? "filter-pill--active" : ""}`}
                      onClick={() => handleFilterChange(sc, selectedExpr, filterType)}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-row mt-12">
                <span className="filter-label">✨ Expression:</span>
                <div className="filter-pills-list">
                  {EXPRESSION_OPTIONS.map((ex) => (
                    <button
                      key={ex}
                      className={`filter-pill ${selectedExpr === ex ? "filter-pill--active" : ""}`}
                      onClick={() => handleFilterChange(selectedScene, ex, filterType)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-row mt-12">
                <span className="filter-label">👥 Type:</span>
                <div className="filter-pills-list">
                  {["All", "Solo", "Group"].map((t) => (
                    <button
                      key={t}
                      className={`filter-pill ${filterType === t ? "filter-pill--active" : ""}`}
                      onClick={() => handleFilterChange(selectedScene, selectedExpr, t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filter / NL Results Grid */}
            {nlSearching ? (
              <SkeletonGrid count={6} />
            ) : filterResults.length > 0 ? (
              <div className="image-grid">
                {filterResults.map((img, idx) => {
                  const photoId = img.imageId || img.filename;
                  const statsItem = likesMap[photoId] || {};
                  return (
                    <div
                      key={`f-${idx}`}
                      className="image-grid__item image-grid__item--cyan"
                      onClick={() => setSelectedIndex(idx)}
                    >
                      <img
                        src={img.url}
                        alt={`Photo ${idx + 1}`}
                        className="image-grid__img"
                        loading="lazy"
                      />
                      <div
                        className="card-like-pill"
                        onClick={(e) => handleCardLike(e, photoId)}
                      >
                        <span>{statsItem.hasLiked ? "❤️" : "🤍"}</span>
                        <span>{statsItem.likeCount || 0}</span>
                      </div>
                      <div className="card-tag-pill">
                        {img.primary_scene || img.dominant_expression || "Photo"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-24 text-muted">
                {nlQuery
                  ? "No photos matched your query. Try adjusting your filters."
                  : "Type a query or pick filters above to explore event photos."}
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: COLLABORATORS & ROLES                              */}
        {/* ========================================================= */}
        {activeTab === "collaborators" && (
          <motion.div {...fadeUp} className="w-full mb-32">
            <h3 className="section-title section-title--cyan">
              COLLABORATIVE ALBUM
            </h3>

            {/* Invite Form */}
            <form onSubmit={handleInvite} className="collab-invite-form mb-24">
              <input
                type="email"
                placeholder="Collaborator email..."
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="collab-input"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="collab-select"
              >
                <option value="photographer">Photographer (Can Upload)</option>
                <option value="admin">Admin (Manage Album)</option>
                <option value="viewer">Viewer (View & Comment)</option>
              </select>
              <RetroButton
                variant="primary"
                disabled={inviting}
                style={{ minWidth: "120px" }}
              >
                {inviting ? "Inviting..." : "+ Invite"}
              </RetroButton>
            </form>

            {/* Collaborators List */}
            <div className="collab-list-box">
              {collaborators.length === 0 ? (
                <p className="text-muted text-center py-12">
                  No collaborators added yet.
                </p>
              ) : (
                collaborators.map((c) => (
                  <div key={c.id} className="collab-row">
                    <div className="collab-info">
                      <span className="collab-name">
                        {c.user_name || c.user_email}
                      </span>
                      <span className="collab-email">{c.user_email}</span>
                    </div>
                    <div className="collab-meta">
                      <span className={`role-badge role-badge--${c.role}`}>
                        {c.role.toUpperCase()}
                      </span>
                      <span className="collab-status">{c.status}</span>
                      {c.role !== "owner" && (
                        <button
                          onClick={() => handleRemoveCollaborator(c.user_id)}
                          className="collab-remove-btn"
                          title="Remove collaborator"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: AI STATS & INSIGHTS                                */}
        {/* ========================================================= */}
        {activeTab === "stats" && (
          <motion.div {...fadeUp} className="w-full mb-32">
            <h3 className="section-title section-title--cyan">
              AI CLASSIFICATION INSIGHTS
            </h3>

            {stats ? (
              <div className="stats-dashboard">
                <div className="stats-cards-grid mb-24">
                  <div className="stat-card">
                    <span className="stat-num">{stats.total_photos || 0}</span>
                    <span className="stat-label">Total Photos</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-num">{stats.group_photos || 0}</span>
                    <span className="stat-label">Group Photos (2+ Faces)</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-num">{stats.single_photos || 0}</span>
                    <span className="stat-label">Solo Portraits</span>
                  </div>
                </div>

                {/* Scene Distribution */}
                <div className="stats-section mb-24">
                  <h4 className="stats-subheading">Scene Breakdown</h4>
                  <div className="dist-pills">
                    {Object.entries(stats.scene_distribution || {}).map(
                      ([scene, count]) => (
                        <div key={scene} className="dist-pill dist-pill--cyan">
                          <span>{scene}</span>
                          <strong>{count}</strong>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Expression Distribution */}
                <div className="stats-section">
                  <h4 className="stats-subheading">Facial Expression Breakdown</h4>
                  <div className="dist-pills">
                    {Object.entries(stats.expression_distribution || {}).map(
                      ([expr, count]) => (
                        <div key={expr} className="dist-pill dist-pill--magenta">
                          <span>{expr}</span>
                          <strong>{count}</strong>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted text-center py-24">
                Stats will become available once photos are processed.
              </p>
            )}
          </motion.div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: ACTIVITY FEED                                      */}
        {/* ========================================================= */}
        {activeTab === "activity" && (
          <motion.div {...fadeUp} className="w-full mb-32">
            <h3 className="section-title section-title--magenta">
              AUDIT & ACTIVITY FEED
            </h3>
            <div className="activity-list-box">
              {activity.length === 0 ? (
                <p className="text-muted text-center py-12">
                  No activity recorded yet.
                </p>
              ) : (
                activity.map((act) => (
                  <div key={act.id} className="activity-item">
                    <div className="activity-bullet">▸</div>
                    <div className="activity-content">
                      <span className="activity-user">{act.user_name}</span>{" "}
                      <span className="activity-action">{act.action}</span>
                      <span className="activity-time">
                        {new Date(act.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* Enhanced Lightbox Modal */}
        <ImageModal
          eventId={eventId}
          images={allImagesFlat}
          selectedIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          onNavigate={setSelectedIndex}
          getImageSrc={(img) => img.url}
          getDownloadHref={(img) => img.url}
        />
      </PageWrapper>
    </>
  );
}
