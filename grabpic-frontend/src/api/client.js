import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

// Persistent guest identity in browser localStorage
export function getLocalUser() {
  let userId = localStorage.getItem("grabpic_user_id");
  let userName = localStorage.getItem("grabpic_user_name");
  let userEmail = localStorage.getItem("grabpic_user_email");

  if (!userId) {
    userId = `guest_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem("grabpic_user_id", userId);
  }
  if (!userName) {
    userName = `Guest_${userId.slice(-4)}`;
    localStorage.setItem("grabpic_user_name", userName);
  }
  if (!userEmail) {
    userEmail = `${userId}@grabpic.local`;
    localStorage.setItem("grabpic_user_email", userEmail);
  }

  return { id: userId, name: userName, email: userEmail };
}

export function setLocalUser(name, email) {
  if (name) localStorage.setItem("grabpic_user_name", name);
  if (email) localStorage.setItem("grabpic_user_email", email);
}

const api = axios.create({
  baseURL,
});

// Attach user headers to all outgoing requests
api.interceptors.request.use((config) => {
  const user = getLocalUser();
  config.headers["x-user-id"] = user.id;
  config.headers["x-user-name"] = user.name;
  config.headers["x-user-email"] = user.email;
  return config;
});

// Event Core
export const createEvent = (data = {}) => api.post("/events", data);
export const getEvent = (eventId) => api.get(`/events/${eventId}`);

export const uploadImages = (eventId, formData) =>
  api.post(`/events/${eventId}/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

export const searchImages = (eventId, formData, page = 1, size = 20) =>
  api.post(`/events/${eventId}/search?page=${page}&size=${size}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

export const downloadAllImages = (eventId) => {
  window.open(`${baseURL}/events/${eventId}/download`, "_blank");
};

// Social Features (Likes & Comments)
export const togglePhotoLike = (eventId, photoId) =>
  api.post(`/events/${eventId}/photos/${photoId}/like`);

export const getPhotoLikes = (eventId, photoId) =>
  api.get(`/events/${eventId}/photos/${photoId}/likes`);

export const getEventLikesSummary = (eventId, photoIds = []) =>
  api.get(`/events/${eventId}/likes-summary?photoIds=${photoIds.join(",")}`);

export const getPhotoComments = (eventId, photoId, page = 1, size = 20) =>
  api.get(`/events/${eventId}/photos/${photoId}/comments?page=${page}&size=${size}`);

export const addPhotoComment = (eventId, photoId, text) =>
  api.post(`/events/${eventId}/photos/${photoId}/comments`, { text });

export const deletePhotoComment = (eventId, commentId) =>
  api.delete(`/events/${eventId}/comments/${commentId}`);

// Collaborator Management
export const getEventCollaborators = (eventId) =>
  api.get(`/events/${eventId}/collaborators`);

export const inviteCollaborator = (eventId, email, role = "viewer") =>
  api.post(`/events/${eventId}/collaborators/invite`, { email, role });

export const respondCollaboratorInvite = (eventId, accept = true) =>
  api.post(`/events/${eventId}/collaborators/respond`, { accept });

export const updateCollaboratorRole = (eventId, userId, role) =>
  api.patch(`/events/${eventId}/collaborators/${userId}/role`, { role });

export const removeCollaborator = (eventId, userId) =>
  api.delete(`/events/${eventId}/collaborators/${userId}`);

export const getEventActivity = (eventId, limit = 50) =>
  api.get(`/events/${eventId}/collaborators/activity?limit=${limit}`);

// Notifications & Biometrics
export const getNotifications = (unreadOnly = false) =>
  api.get(`/notifications?unreadOnly=${unreadOnly}`);

export const getUnreadNotificationCount = () =>
  api.get("/notifications/unread-count");

export const markNotificationRead = (id) =>
  api.patch(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.patch("/notifications/read-all");

export const getNotificationPreferences = () =>
  api.get("/notifications/preferences");

export const updateNotificationPreferences = (prefs) =>
  api.put("/notifications/preferences", prefs);

export const registerGuestFaceProfile = (eventId, data) =>
  api.post(`/events/${eventId}/register-profile`, data);

export const deleteGuestFaceProfile = (eventId) =>
  api.delete(`/events/${eventId}/register-profile`);

// Advanced AI Features: Filtering, Natural Language Search & Stats
export const getEventStats = (eventId) =>
  api.get(`/events/${eventId}/stats`);

export const getPhotoAnalysis = (eventId, photoId) =>
  api.get(`/events/${eventId}/photos/${photoId}/analysis`);

export const filterEventPhotos = (eventId, filters) =>
  api.post(`/events/${eventId}/filter`, filters);

export const naturalLanguageSearch = (eventId, query) =>
  api.post(`/events/${eventId}/nl-search`, { query });

export default api;
