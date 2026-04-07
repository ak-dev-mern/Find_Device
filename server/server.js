import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import dns from "dns";
import crypto from "crypto";

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://find-device-server.onrender.com",
  "https://find-device-client.onrender.com",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

dns.setDefaultResultOrder("ipv4first");

// MongoDB Connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/finddevice";

mongoose
  .connect(MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 5000 })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err.message));

// Admin Schema
const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "admin" },
  },
  { timestamps: true },
);

const Admin = mongoose.model("Admin", adminSchema);

// Tracking Link Schema
const trackingLinkSchema = new mongoose.Schema(
  {
    linkId: { type: String, required: true, unique: true },
    shortCode: { type: String, required: true, unique: true },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    personName: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(+new Date() + 24 * 60 * 60 * 1000),
    },
    currentLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    locationHistory: [
      {
        lat: Number,
        lng: Number,
        accuracy: Number,
        timestamp: Date,
      },
    ],
  },
  { timestamps: true },
);

const TrackingLink = mongoose.model("TrackingLink", trackingLinkSchema);

// Store active tracking sessions
const adminSessions = new Map();

// Helper function to generate short code
const generateShortCode = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ================== SOCKET.IO ==================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const linkId = socket.handshake.query?.linkId;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret-key");
      socket.user = decoded;
      socket.isAdmin = true;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  } else if (linkId) {
    socket.linkId = linkId;
    socket.isTrackedDevice = true;
    next();
  } else {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", async (socket) => {
  console.log("🟢 New connection:", socket.id);

  // Handle admin connection
  if (socket.isAdmin && socket.user) {
    const { userId, username } = socket.user;

    adminSessions.set(userId, {
      socketId: socket.id,
      username,
    });

    console.log(`✅ Admin connected: ${username}`);

    // Send all active tracking links with their locations
    const activeLinks = await TrackingLink.find({
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    console.log(`Sending ${activeLinks.length} active links to admin`);
    socket.emit("active-tracking-links", activeLinks);

    // Send current locations for all links that have them
    for (const link of activeLinks) {
      if (link.currentLocation && link.currentLocation.lat) {
        console.log(`Sending existing location for: ${link.personName}`);
        socket.emit("location-update", {
          linkId: link.linkId,
          shortCode: link.shortCode,
          location: link.currentLocation,
          personName: link.personName,
          timestamp: link.currentLocation.updatedAt || new Date(),
        });
      }
    }

    socket.on("deactivate-link", async ({ linkId }) => {
      console.log("Deactivating link:", linkId);
      await TrackingLink.findOneAndUpdate({ linkId }, { isActive: false });
      io.emit("link-deactivated", { linkId });
    });

    socket.on("delete-link", async ({ linkId }) => {
      console.log("Deleting link:", linkId);
      await TrackingLink.findOneAndDelete({ linkId });
      io.emit("link-deleted", { linkId });
    });
  }

  // Handle tracked device (silent tracking)
  if (socket.isTrackedDevice && socket.linkId) {
    const { linkId } = socket;
    console.log(`📱 Tracked device connecting for linkId: ${linkId}`);

    const link = await TrackingLink.findOne({ linkId, isActive: true });
    if (!link || link.expiresAt < new Date()) {
      console.log(`❌ Link expired or invalid: ${linkId}`);
      socket.emit("error", "Link expired");
      socket.disconnect();
      return;
    }

    console.log(`✅ Valid tracking link for: ${link.personName}`);

    socket.on("share-location", async (data, callback) => {
      const { location } = data;
      console.log(`📍 Location received for ${link.personName}:`, location);

      if (!location || !location.lat || !location.lng) {
        console.log("❌ Invalid location data");
        if (callback) callback({ success: false, error: "Invalid location" });
        return;
      }

      const updatedLocation = {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy || 50,
        updatedAt: new Date(),
      };

      try {
        // Update database with new location
        const updatedLink = await TrackingLink.findOneAndUpdate(
          { linkId },
          {
            $set: { currentLocation: updatedLocation },
            $push: {
              locationHistory: { ...updatedLocation, timestamp: new Date() },
            },
          },
          { new: true }, // Return the updated document
        );

        console.log(`✅ Database updated for ${link.personName}`);
        console.log(
          `   Location: ${updatedLocation.lat}, ${updatedLocation.lng}`,
        );
        console.log(`   History count: ${updatedLink.locationHistory.length}`);

        // Acknowledge to the client
        if (callback) callback({ success: true, location: updatedLocation });

        // Broadcast to all connected admins
        console.log(`📡 Broadcasting to ${adminSessions.size} admins`);

        for (const [adminId, adminSession] of adminSessions) {
          console.log(`   Sending to admin: ${adminSession.username}`);
          io.to(adminSession.socketId).emit("location-update", {
            linkId,
            shortCode: link.shortCode,
            location: updatedLocation,
            personName: link.personName,
            timestamp: new Date(),
          });
        }
      } catch (err) {
        console.error("❌ Error updating database:", err);
        if (callback) callback({ success: false, error: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`🔴 Tracked device disconnected: ${link.personName}`);
    });
  }
});

// ================== API ROUTES ==================

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET || "secret-key",
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate tracking link
app.post("/api/admin/generate-link", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret-key");
    const admin = await Admin.findById(decoded.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const { personName } = req.body;
    if (!personName) return res.status(400).json({ error: "Name required" });

    const linkId = crypto.randomBytes(16).toString("hex");
    const shortCode = generateShortCode();

    const trackingLink = new TrackingLink({
      linkId,
      shortCode,
      adminId: admin._id,
      personName,
    });

    await trackingLink.save();

    const trackingUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/track/${linkId}`;
    const shortUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/l/${shortCode}`;

    res.json({
      linkId,
      shortCode,
      trackingUrl,
      shortUrl,
      personName,
      expiresAt: trackingLink.expiresAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Redirect short URL
app.get("/api/short/:shortCode", async (req, res) => {
  try {
    const { shortCode } = req.params;
    const link = await TrackingLink.findOne({ shortCode, isActive: true });

    if (!link || link.expiresAt < new Date()) {
      return res.status(404).send("Link not found or expired");
    }

    // Redirect browser automatically
    res.redirect(`/track/${link.linkId}`);
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// Get all tracking links
app.get("/api/admin/tracking-links", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret-key");
    const admin = await Admin.findById(decoded.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const links = await TrackingLink.find({ adminId: admin._id }).sort({
      createdAt: -1,
    });
    res.json({ links });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify tracking link
app.get("/api/track/:linkId", async (req, res) => {
  try {
    const { linkId } = req.params;
    console.log("Verifying linkId:", linkId);

    const link = await TrackingLink.findOne({ linkId, isActive: true });

    if (!link || link.expiresAt < new Date()) {
      return res.status(404).json({ error: "Link expired" });
    }

    res.json({ valid: true, personName: link.personName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint
app.get("/api/admin/debug-links", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret-key");
    const admin = await Admin.findById(decoded.userId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }

    const links = await TrackingLink.find({ adminId: admin._id })
      .sort({ createdAt: -1 })
      .select(
        "linkId shortCode personName isActive currentLocation locationHistory",
      );

    res.json({
      links: links.map((link) => ({
        ...link.toObject(),
        hasLocation: !!link.currentLocation?.lat,
        locationHistoryCount: link.locationHistory?.length || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Setup admin
app.post("/api/setup-admin", async (req, res) => {
  try {
    const { secretKey, username, email, password } = req.body;

    if (secretKey !== process.env.ADMIN_SECRET_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const existingAdmin = await Admin.findOne();
    if (existingAdmin) {
      return res.status(400).json({ error: "Admin exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Admin({ username, email, password: hashedPassword });
    await admin.save();

    res.json({ success: true, message: "Admin created!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Direct API endpoint for location tracking (alternative to WebSocket)
app.post("/api/track-location/:linkId", async (req, res) => {
  try {
    const { linkId } = req.params;
    const { location } = req.body;

    console.log(`📍 Location received via API for linkId: ${linkId}`, location);

    if (!location || !location.lat || !location.lng) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid location" });
    }

    const updatedLocation = {
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy || 50,
      updatedAt: new Date(),
    };

    // Update database
    const updatedLink = await TrackingLink.findOneAndUpdate(
      { linkId, isActive: true },
      {
        $set: { currentLocation: updatedLocation },
        $push: {
          locationHistory: { ...updatedLocation, timestamp: new Date() },
        },
      },
      { new: true },
    );

    if (!updatedLink) {
      return res
        .status(404)
        .json({ success: false, error: "Link not found or inactive" });
    }

    console.log(`✅ Database updated for ${updatedLink.personName}`);
    console.log(`   History count: ${updatedLink.locationHistory.length}`);

    // Broadcast to all connected admins via WebSocket
    for (const [adminId, adminSession] of adminSessions) {
      io.to(adminSession.socketId).emit("location-update", {
        linkId,
        shortCode: updatedLink.shortCode,
        location: updatedLocation,
        personName: updatedLink.personName,
        timestamp: new Date(),
      });
    }

    res.json({ success: true, location: updatedLocation });
  } catch (error) {
    console.error("Error saving location:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Allowed origins:`, allowedOrigins);
});
