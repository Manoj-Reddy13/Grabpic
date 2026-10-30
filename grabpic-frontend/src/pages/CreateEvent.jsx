import { useState } from "react";
import { createEvent, uploadImages } from "../api/client";
import { motion, AnimatePresence } from "framer-motion";
import PageWrapper from "../components/PageWrapper";
import RetroButton from "../components/RetroButton";
import DropZone from "../components/DropZone";
import Navbar from "../components/Navbar";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" },
};

export default function CreateEvent() {
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareLink = eventId
    ? `${window.location.origin}/events/${eventId}`
    : "";

  // Current step (1-based)
  const currentStep = !eventId ? 1 : !uploaded && !loading ? 2 : uploaded ? 4 : 3;

  // ---- HANDLERS ----
  const handleCreateEvent = async () => {
    try {
      setLoading(true);
      const res = await createEvent({ title: title.trim() || "Untitled Event" });
      setEventId(res.data.eventId);
    } catch {
      alert("Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!files.length) return;
    try {
      setLoading(true);
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      await uploadImages(eventId, formData);
      setUploaded(true);
    } catch {
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <Navbar />
      <PageWrapper centered>
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{
            fontSize: "28px",
            color: "var(--accent-cyan)",
            textShadow: "0 0 16px rgba(0, 255, 224, 0.4)",
            marginBottom: "8px",
          }}
        >
          CREATE EVENT
        </motion.h2>

        {/* Step Indicator */}
        <div className="step-indicator mb-24">
          {[1, 2, 3, 4].map((step, i) => (
            <span key={step}>
              {i > 0 && <span className="step-line" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "12px" }} />}
              <span
                className={`step-dot ${
                  step === currentStep
                    ? "step-dot--active"
                    : step < currentStep
                    ? "step-dot--done"
                    : ""
                }`}
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1 — Initialize */}
          {currentStep === 1 && (
            <motion.div key="step1" {...fadeUp} className="flex flex-col items-center gap-16 w-full" style={{ maxWidth: "380px" }}>
              <p className="text-muted" style={{ fontSize: "13px", letterSpacing: "0.1em" }}>
                STEP 01 — INITIALIZE EVENT
              </p>
              <input
                type="text"
                placeholder="Event Name (e.g. Tech Fest 2026)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="collab-input text-center w-full"
                maxLength={60}
              />
              <RetroButton
                variant="primary"
                onClick={handleCreateEvent}
                disabled={loading}
              >
                {loading ? "Initializing..." : "Create Event"}
              </RetroButton>
            </motion.div>
          )}

          {/* STEP 2 — Upload Photos */}
          {currentStep === 2 && (
            <motion.div key="step2" {...fadeUp} className="card w-full" style={{ maxWidth: "440px" }}>
              <p className="text-muted mb-8" style={{ fontSize: "11px", letterSpacing: "0.1em" }}>
                STEP 02 — UPLOAD PHOTOS
              </p>
              <div
                className="mb-16 font-mono"
                style={{
                  fontSize: "12px",
                  color: "var(--accent-cyan)",
                  wordBreak: "break-all",
                  background: "rgba(0, 255, 224, 0.05)",
                  padding: "8px 12px",
                  border: "1px solid rgba(0, 255, 224, 0.2)",
                  borderRadius: "2px",
                }}
              >
                EVENT: {title || "Untitled"} // {eventId}
              </div>

              <DropZone
                label="Select Event Photos"
                sublabel="Select or drag batch photos to index"
                maxFiles={500}
                onFiles={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
                accept="image/*"
                files={files}
                onClear={() => setFiles([])}
              />

              <div className="flex justify-end gap-12 mt-16">
                <RetroButton
                  variant="primary"
                  onClick={handleUpload}
                  disabled={files.length === 0}
                >
                  Upload {files.length ? `(${files.length})` : ""}
                </RetroButton>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — Processing */}
          {currentStep === 3 && (
            <motion.div key="step3" {...fadeUp} className="flex flex-col items-center gap-16">
              <p className="text-muted" style={{ fontSize: "13px", letterSpacing: "0.1em" }}>
                STEP 03 — PROCESSING IMAGES
              </p>
              <div className="skeleton-item shimmer" style={{ width: "240px", height: "40px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                Detecting faces, analyzing expressions & indexing photos...
              </p>
            </motion.div>
          )}

          {/* STEP 4 — Share */}
          {currentStep === 4 && (
            <motion.div key="step4" {...fadeUp} className="card w-full" style={{ maxWidth: "440px" }}>
              <p className="text-muted mb-8" style={{ fontSize: "11px", letterSpacing: "0.1em" }}>
                STEP 04 — SHARE EVENT
              </p>

              <div
                className="mb-16 font-mono"
                style={{
                  fontSize: "12px",
                  color: "var(--text)",
                  wordBreak: "break-all",
                  background: "var(--surface)",
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "2px",
                }}
              >
                {shareLink}
              </div>

              <div className="flex gap-12">
                <RetroButton
                  variant={copied ? "cyan" : "primary"}
                  onClick={copyLink}
                  style={{ flex: 1 }}
                >
                  {copied ? "COPIED!" : "Copy Link"}
                </RetroButton>
                <RetroButton
                  variant="secondary"
                  onClick={() => (window.location.href = `/events/${eventId}`)}
                  style={{ flex: 1 }}
                >
                  Open Event
                </RetroButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageWrapper>
    </>
  );
}
