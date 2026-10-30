import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getLocalUser,
  setLocalUser,
} from "../api/client";
import RetroButton from "./RetroButton";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [user, setUser] = useState(getLocalUser());
  const [editingUser, setEditingUser] = useState(false);
  const [tempName, setTempName] = useState(user.name);

  const fetchUnread = async () => {
    try {
      const res = await getUnreadNotificationCount();
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  const fetchList = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      fetchList();
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      setLocalUser(tempName.trim());
      setUser(getLocalUser());
    }
    setEditingUser(false);
  };

  return (
    <header className="navbar-container">
      <div className="navbar-content">
        <Link to="/" className="navbar-brand">
          <span className="brand-glow">⚡ GRABPIC</span>
          <span className="brand-tag">AI LAB</span>
        </Link>

        <div className="navbar-actions">
          {/* User Profile Pill */}
          <div className="user-profile-pill">
            {editingUser ? (
              <div className="user-edit-box">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="user-input-sm"
                  maxLength={20}
                  autoFocus
                />
                <button onClick={handleSaveName} className="user-btn-save">
                  ✓
                </button>
              </div>
            ) : (
              <span
                onClick={() => setEditingUser(true)}
                title="Click to edit display name"
                className="user-display-name"
              >
                👤 {user.name}
              </span>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="notification-bell-wrapper">
            <button
              onClick={handleOpenNotifications}
              className={`bell-btn ${unreadCount > 0 ? "bell-btn--active" : ""}`}
              aria-label="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span className="bell-badge">{unreadCount}</span>
              )}
            </button>

            {/* Notifications Dropdown */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="notifications-dropdown"
                >
                  <div className="notif-header">
                    <span className="notif-title">NOTIFICATIONS</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="notif-mark-all-btn"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${
                            !n.is_read ? "notif-item--unread" : ""
                          }`}
                          onClick={() => !n.is_read && handleMarkRead(n.id)}
                        >
                          <div className="notif-item-header">
                            <span className="notif-item-title">{n.title}</span>
                            <span className="notif-item-time">
                              {new Date(n.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="notif-item-msg">{n.message}</p>
                          {n.data?.matchedPhotos && (
                            <span className="notif-item-tag">
                              📸 {n.data.matchedPhotos.length} photos
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}

