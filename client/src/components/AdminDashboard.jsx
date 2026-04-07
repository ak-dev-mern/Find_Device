import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  ZoomControl,
} from "react-leaflet";
import { io } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import {
  LogOut,
  Wifi,
  WifiOff,
  Map as MapIcon,
  Activity,
  Search,
  Link as LinkIcon,
  Copy,
  Check,
  Clock,
  Trash2,
  User,
  Plus,
  X,
  Eye,
  Target,
  Users,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Navigation,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Zap,
  Circle,
  AlertTriangle,
  Shield,
  Compass,
  Layers,
  Satellite,
  AlertCircle,
} from "lucide-react";

// Fix leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Premium marker icons with glow effect
const createCustomIcon = (color, isSelected = false, isLive = true) => {
  const size = isSelected ? 38 : 28;
  const glowColor = isLive ? "#22c55e" : color;
  return L.divIcon({
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 15px ${glowColor}, 0 2px 8px rgba(0,0,0,0.3);
      position: relative;
      transition: all 0.3s ease;
      ${isSelected ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
      ${isLive ? "animation: glow 2s ease-in-out infinite;" : ""}
    ">
      <div style="
        position: absolute;
        bottom: -3px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 8px solid ${color};
      "></div>
    </div>
    <style>
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      @keyframes glow {
        0% { box-shadow: 0 0 5px ${glowColor}; }
        50% { box-shadow: 0 0 20px ${glowColor}; }
        100% { box-shadow: 0 0 5px ${glowColor}; }
      }
    </style>`,
    className: "custom-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

// Premium map tile layers
const tileLayers = {
  standard: {
    name: "Standard",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
  },
  terrain: {
    name: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
};

// Component to recenter map with smooth animation
function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom || 13, { duration: 1.2, easeLinearity: 0.5 });
    }
  }, [center, map, zoom]);
  return null;
}

// Component to add map controls
function MapControls() {
  const map = useMap();

  useEffect(() => {
    if (map.zoomControl) {
      map.zoomControl.setPosition("topright");
    }
  }, [map]);

  return null;
}

const API = "https://find-device-server.onrender.com";

const AdminDashboard = () => {
  const { user, token, logout } = useAuth();
  const socketRef = useRef(null);
  const [trackingLinks, setTrackingLinks] = useState([]);
  const [activeLocations, setActiveLocations] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [personToDelete, setPersonToDelete] = useState(null);
  const [personName, setPersonName] = useState("");
  const [copiedLink, setCopiedLink] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapType, setMapType] = useState("dark");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]);
  const [mapZoom, setMapZoom] = useState(4);
  const [lastUpdateTime, setLastUpdateTime] = useState({});
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [showStats, setShowStats] = useState(true);

  // Fetch tracking links
  const fetchTrackingLinks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/tracking-links`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTrackingLinks(data.links || []);
      }
    } catch (err) {
      console.error("Fetch links error:", err);
    }
  }, [token]);

  // Generate new tracking link
  const generateLink = async () => {
    if (!personName.trim()) return;

    try {
      const res = await fetch(`${API}/api/admin/generate-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ personName }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTrackingLinks();
        setShowCreateLink(false);
        setPersonName("");
        const shareUrl = `${window.location.origin}/track/${data.linkId}`;
        navigator.clipboard.writeText(shareUrl);
        setCopiedLink(data.linkId);
        setTimeout(() => setCopiedLink(null), 2000);
      }
    } catch (err) {
      console.error("Generate link error:", err);
    }
  };

  // Copy link to clipboard
  const copyToClipboard = (url, linkId) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(linkId);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // Show delete confirmation modal
  const confirmDelete = (linkId, personName) => {
    setPersonToDelete({ linkId, personName });
    setShowDeleteModal(true);
  };

  // Delete link permanently
  const deleteLink = async () => {
    if (!personToDelete) return;

    if (socketRef.current) {
      socketRef.current.emit("delete-link", { linkId: personToDelete.linkId });
    }
    await fetchTrackingLinks();
    if (selectedPerson === personToDelete.linkId) {
      setSelectedPerson(null);
    }
    setShowDeleteModal(false);
    setPersonToDelete(null);
  };

  // Get signal strength indicator
  const getSignalStrength = (accuracy) => {
    if (!accuracy) return "medium";
    if (accuracy < 20) return "high";
    if (accuracy < 50) return "medium";
    return "low";
  };

  const getSignalIcon = (accuracy) => {
    const strength = getSignalStrength(accuracy);
    switch (strength) {
      case "high":
        return <SignalHigh className="w-3 h-3 text-green-400" />;
      case "medium":
        return <SignalMedium className="w-3 h-3 text-yellow-400" />;
      default:
        return <SignalLow className="w-3 h-3 text-red-400" />;
    }
  };

  // Socket setup
  useEffect(() => {
    if (!token || !user) return;

    fetchTrackingLinks();

    const socket = io(API, {
      auth: { token },
      query: { token, userId: user.id },
      transports: ["websocket"],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("active-tracking-links", (links) => {
      setTrackingLinks(links || []);
    });

    socket.on(
      "location-update",
      ({ linkId, location, personName, timestamp }) => {
        setActiveLocations((prev) => ({
          ...prev,
          [linkId]: {
            location,
            personName,
            timestamp,
            isActive: true,
            accuracy: location.accuracy,
          },
        }));
        setLastUpdateTime((prev) => ({ ...prev, [linkId]: new Date() }));

        if (selectedPerson === linkId) {
          setMapCenter([location.lat, location.lng]);
          setMapZoom(14);
        }
      },
    );

    socket.on("link-deleted", ({ linkId }) => {
      setActiveLocations((prev) => {
        const newState = { ...prev };
        delete newState[linkId];
        return newState;
      });
      if (selectedPerson === linkId) setSelectedPerson(null);
      fetchTrackingLinks();
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [token, user, fetchTrackingLinks, selectedPerson]);

  // Filter links
  const filteredLinks = useMemo(() => {
    return (trackingLinks || []).filter((link) => {
      const matchesSearch = link?.personName
        ?.toLowerCase()
        .includes((searchQuery || "").toLowerCase());
      if (!matchesSearch) return false;
      const isActive = activeLocations[link.linkId] !== undefined;
      if (filterStatus === "active") return isActive;
      if (filterStatus === "inactive") return !isActive;
      return true;
    });
  }, [trackingLinks, searchQuery, filterStatus, activeLocations]);

  const activeCount = Object.keys(activeLocations || {}).length;

  // Get locations to display
  const locationsToDisplay = useMemo(() => {
    if (selectedPerson && activeLocations[selectedPerson]) {
      return { [selectedPerson]: activeLocations[selectedPerson] };
    }
    return activeLocations;
  }, [selectedPerson, activeLocations]);

  // Handle person click
  const handlePersonClick = (linkId, location) => {
    if (selectedPerson === linkId) {
      setSelectedPerson(null);
      setMapCenter([20.5937, 78.9629]);
      setMapZoom(4);
    } else {
      setSelectedPerson(linkId);
      if (location) {
        setMapCenter([location.lat, location.lng]);
        setMapZoom(14);
      } else if (activeLocations[linkId]) {
        setMapCenter([
          activeLocations[linkId].location.lat,
          activeLocations[linkId].location.lng,
        ]);
        setMapZoom(14);
      }
    }
  };

  // Get marker color based on status
  const getMarkerColor = (isActive, isSelected) => {
    if (isSelected) return "#3b82f6";
    if (isActive) return "#ef4444";
    return "#6b7280";
  };

  // Calculate stats
  const totalLocations = Object.keys(activeLocations).length;
  const avgAccuracy =
    totalLocations > 0
      ? Math.round(
          Object.values(activeLocations).reduce(
            (acc, curr) => acc + (curr.accuracy || 50),
            0,
          ) / totalLocations,
        )
      : 0;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Delete Confirmation Modal */}
      {showDeleteModal && personToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl p-6 w-full max-w-md border border-red-500/30 shadow-2xl transform animate-scaleIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-white">
                Delete Person
              </h3>
            </div>

            <p className="text-gray-300 mb-2">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-red-400">
                {personToDelete.personName}
              </span>{" "}
              from tracking?
            </p>
            <p className="text-gray-400 text-sm mb-6">
              This action cannot be undone. All location history for this person
              will be permanently deleted.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setPersonToDelete(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={deleteLink}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-all shadow-lg shadow-red-500/20"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Link Modal */}
      {showCreateLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl p-6 w-full max-w-md border border-blue-500/30 shadow-2xl transform animate-scaleIn">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <LinkIcon className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold">Create Tracking Link</h3>
              </div>
              <button
                onClick={() => setShowCreateLink(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              Generate a unique direct tracking link to share with anyone. When
              they click it, their location will be shared silently with high
              accuracy GPS.
            </p>

            <input
              type="text"
              placeholder="Enter person's name (e.g., John Doe)"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm mb-4 outline-none focus:border-blue-500 focus:bg-white/20 transition-all"
              autoFocus
              onKeyPress={(e) => e.key === "Enter" && generateLink()}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateLink(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={generateLink}
                disabled={!personName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate & Copy Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`relative z-20 flex flex-col bg-gradient-to-b from-gray-900 to-gray-950 border-r border-white/10 transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-80"
        }`}
      >
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute -right-3 top-6 z-30 w-6 h-6 bg-gray-800 border border-white/20 rounded-full flex items-center justify-center hover:bg-gray-700 transition-all hover:scale-110"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronLeft className="w-3 h-3" />
          )}
        </button>

        {sidebarCollapsed ? (
          <div className="flex flex-col items-center py-4 gap-4 h-full">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5" />
            </div>
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg">
              {user?.username?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="relative">
              <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                <span className="text-green-400 text-xs font-bold">
                  {activeCount}
                </span>
              </div>
              {activeCount > 0 && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
            </div>
            <button
              onClick={logout}
              className="mt-auto mb-4 p-2 hover:bg-red-500/20 rounded-xl transition-all hover:scale-110"
            >
              <LogOut className="w-5 h-5 text-red-400" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-bold text-lg">Live Tracker Pro</h1>
                  <div className="flex items-center gap-2 text-xs">
                    {isConnected ? (
                      <>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-green-400">
                          Real-time Connected
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-red-400 rounded-full" />
                        <span className="text-red-400">Reconnecting...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center font-bold text-sm shadow-lg">
                  {user?.username?.[0]?.toUpperCase() || "A"}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm truncate">
                    {user?.username || "Administrator"}
                  </p>
                  <p className="text-gray-400 text-xs">Admin Panel</p>
                </div>
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
            </div>

            {/* Stats Cards */}
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl p-3 text-center border border-blue-500/20 hover:border-blue-500/40 transition-all">
                <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-2xl font-bold">{trackingLinks.length}</p>
                <p className="text-xs text-gray-400">Total People</p>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl p-3 text-center border border-green-500/20 hover:border-green-500/40 transition-all">
                <div className="relative inline-block mx-auto mb-1">
                  <MapPin className="w-5 h-5 text-green-400 mx-auto" />
                  {activeCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  )}
                </div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-gray-400">Live Now</p>
              </div>
            </div>

            {/* Additional Stats */}
            {showStats && activeCount > 0 && (
              <div className="mx-4 mb-3 p-2 bg-white/5 rounded-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Avg Accuracy</span>
                  <span className="text-green-400">±{avgAccuracy}m</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-400">Active Sessions</span>
                  <span className="text-blue-400">{totalLocations}</span>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <div className="px-4 pb-2">
              <button
                onClick={() => setShowCreateLink(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-500/20 transform hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4" />
                Generate New Link
              </button>
            </div>

            {/* Filters */}
            <div className="px-4 py-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white/10 transition-all"
                />
              </div>

              <div className="flex gap-2">
                {[
                  { id: "all", label: "All", color: "blue" },
                  { id: "active", label: "Live", color: "green" },
                  { id: "inactive", label: "Offline", color: "gray" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterStatus(tab.id)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      filterStatus === tab.id
                        ? `bg-${tab.color}-600 text-white shadow-lg`
                        : "bg-white/5 hover:bg-white/10 text-gray-400"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* People List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  People List
                </h3>
                <span className="text-xs text-gray-500">
                  {filteredLinks.length} total
                </span>
              </div>

              {filteredLinks.length === 0 ? (
                <div className="text-center py-12">
                  <User className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No people found</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Click "Generate New Link" to start
                  </p>
                </div>
              ) : (
                filteredLinks.map((link) => {
                  const isActive = activeLocations[link.linkId];
                  const isSelected = selectedPerson === link.linkId;
                  const location = activeLocations[link.linkId]?.location;
                  const accuracy = activeLocations[link.linkId]?.accuracy;
                  const directUrl = `${window.location.origin}/track/${link.linkId}`;
                  const timeSince = lastUpdateTime[link.linkId]
                    ? Math.floor(
                        (new Date() - lastUpdateTime[link.linkId]) / 1000,
                      )
                    : null;

                  return (
                    <div
                      key={link.linkId}
                      onClick={() => handlePersonClick(link.linkId, location)}
                      className={`group relative p-3 rounded-xl transition-all cursor-pointer transform hover:scale-[1.02] ${
                        isSelected
                          ? "bg-gradient-to-r from-blue-500/20 to-blue-600/10 border-2 border-blue-500/50 shadow-lg shadow-blue-500/10"
                          : isActive
                            ? "bg-gradient-to-r from-green-500/10 to-green-600/5 border border-green-500/30 hover:border-green-500/50"
                            : "bg-white/5 border border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {/* Live Indicator */}
                      {isActive && (
                        <div className="absolute -top-1 -right-1">
                          <div className="relative">
                            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                            <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75" />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg ${
                            isActive
                              ? "bg-gradient-to-br from-green-500 to-emerald-600"
                              : "bg-gradient-to-br from-gray-600 to-gray-700"
                          }`}
                        >
                          {link.personName?.[0]?.toUpperCase()}
                          {isActive && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {link.personName}
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            {isActive ? (
                              <>
                                {getSignalIcon(accuracy)}
                                <span className="text-green-400">Live</span>
                                {timeSince !== null && timeSince < 10 && (
                                  <span className="text-green-300 text-xs">
                                    · just now
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <Circle className="w-2 h-2 text-gray-500" />
                                <span className="text-gray-500">Offline</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {location && (
                        <div className="text-xs text-gray-400 mb-3 font-mono">
                          📍 {location.lat.toFixed(4)}°,{" "}
                          {location.lng.toFixed(4)}°
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(directUrl, link.linkId);
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs transition-all group-hover:bg-white/15"
                        >
                          {copiedLink === link.linkId ? (
                            <>
                              <Check className="w-3 h-3" /> Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy Link
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(link.linkId, link.personName);
                          }}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs transition-all hover:scale-105"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm transition-all hover:scale-[1.02]"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          key={mapType}
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          preferCanvas={true}
        >
          <MapControls />
          <ZoomControl position="topright" />
          <MapController center={mapCenter} zoom={mapZoom} />

          <TileLayer
            url={tileLayers[mapType].url}
            attribution={tileLayers[mapType].attribution}
            className="map-tiles"
          />

          {Object.entries(locationsToDisplay).map(([linkId, data]) => {
            const isSelected = selectedPerson === linkId;
            const isLive = true;
            const markerColor = getMarkerColor(isLive, isSelected);
            return (
              <Marker
                key={linkId}
                position={[data.location.lat, data.location.lng]}
                icon={createCustomIcon(markerColor, isSelected, isLive)}
              >
                <Popup className="custom-popup">
                  <div className="text-center min-w-[200px]">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg ${
                        isSelected ? "bg-blue-500" : "bg-red-500"
                      }`}
                    >
                      <Target className="w-6 h-6 text-white" />
                    </div>
                    <p className="font-bold text-gray-800 text-lg">
                      {data.personName}
                    </p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <p className="text-xs text-green-600 font-semibold">
                        Live Tracking
                      </p>
                    </div>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-gray-500">
                        🕐 Last update:{" "}
                        {new Date(data.timestamp).toLocaleTimeString()}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        📍 Lat: {data.location.lat.toFixed(6)}°
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        📍 Lng: {data.location.lng.toFixed(6)}°
                      </p>
                      <p className="text-xs text-gray-500">
                        🎯 Accuracy: ±{Math.round(data.location.accuracy || 50)}
                        m
                      </p>
                      {data.location.accuracy &&
                        data.location.accuracy < 20 && (
                          <p className="text-xs text-green-600">
                            ✓ High precision GPS
                          </p>
                        )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Map Controls Menu */}
        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-2">
          <div className="relative">
            <button
              onClick={() => setShowMapMenu(!showMapMenu)}
              className="p-3 bg-gray-900/90 backdrop-blur rounded-xl border border-white/10 hover:bg-gray-800 transition-all shadow-lg hover:scale-105"
              title="Map Layers"
            >
              <Layers className="w-5 h-5" />
            </button>
            {showMapMenu && (
              <div className="absolute bottom-full mb-2 right-0 bg-gray-900/95 backdrop-blur rounded-xl border border-white/10 shadow-xl overflow-hidden animate-slideUp">
                {Object.entries(tileLayers).map(([key, layer]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setMapType(key);
                      setShowMapMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                      mapType === key ? "bg-blue-500/20 text-blue-400" : ""
                    }`}
                  >
                    {key === "satellite" ? (
                      <Satellite className="w-4 h-4" />
                    ) : (
                      <MapIcon className="w-4 h-4" />
                    )}
                    {layer.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (selectedPerson && activeLocations[selectedPerson]) {
                setMapCenter([
                  activeLocations[selectedPerson].location.lat,
                  activeLocations[selectedPerson].location.lng,
                ]);
                setMapZoom(15);
              }
            }}
            className="p-3 bg-gray-900/90 backdrop-blur rounded-xl border border-white/10 hover:bg-gray-800 transition-all shadow-lg hover:scale-105"
            title="Center on selected"
          >
            <Compass className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowStats(!showStats)}
            className="p-3 bg-gray-900/90 backdrop-blur rounded-xl border border-white/10 hover:bg-gray-800 transition-all shadow-lg hover:scale-105"
            title="Toggle Stats"
          >
            <Activity className="w-5 h-5" />
          </button>
        </div>

        {/* Info Badges */}
        <div className="absolute top-5 right-5 z-20 flex gap-2">
          {activeCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 backdrop-blur rounded-xl border border-green-500/30 text-green-300 text-sm shadow-lg animate-pulse">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {activeCount} Live {activeCount === 1 ? "Person" : "People"}
            </div>
          )}
        </div>

        {/* Selected Person Badge */}
        {selectedPerson && activeLocations[selectedPerson] && (
          <div className="absolute top-5 left-5 z-20 flex items-center gap-2 px-3 py-2 bg-blue-500/20 backdrop-blur rounded-xl border border-blue-500/30 text-blue-300 text-sm shadow-lg animate-slideIn">
            <Target className="w-4 h-4" />
            Tracking: {activeLocations[selectedPerson]?.personName}
            <button
              onClick={() => setSelectedPerson(null)}
              className="ml-2 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Connection Status */}
        <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur rounded-xl border border-white/10 text-xs shadow-lg">
          {isConnected ? (
            <>
              <Signal className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Real-time Connected</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span className="text-red-400">Reconnecting...</span>
            </>
          )}
        </div>
      </div>

      {/* Custom Animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.2s ease-out;
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
        .custom-popup .leaflet-popup-content-wrapper {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }
        .custom-popup .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.95);
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
