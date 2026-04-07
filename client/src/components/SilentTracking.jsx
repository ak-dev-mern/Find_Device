// src/components/SilentTracking.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import io from "socket.io-client";
import axios from "axios";

const SilentTracking = () => {
  const { linkId } = useParams();
  const [personName, setPersonName] = useState("");
  const [status, setStatus] = useState("Verifying link...");
  const [socket, setSocket] = useState(null);

  const API = "https://find-device-server.onrender.com";

  useEffect(() => {
    // 1️⃣ Verify the tracking link with backend
    const verifyLink = async () => {
      try {
        const res = await axios.get(`${API}/api/track/${linkId}`);
        if (res.data.valid) {
          setPersonName(res.data.personName);
          setStatus("Tracking started...");
        } else {
          setStatus("Invalid or expired link");
        }
      } catch (err) {
        console.error(err);
        setStatus("Error verifying link");
      }
    };

    verifyLink();
  }, [linkId]);

  useEffect(() => {
    if (!personName) return;

    // 2️⃣ Connect Socket.IO for real-time updates (optional)
    const newSocket = io(API, {
      query: { linkId },
    });

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO server:", newSocket.id);
    });

    newSocket.on("error", (err) => {
      console.error("Socket error:", err);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [personName, linkId]);

  useEffect(() => {
    if (!personName) return;

    // 3️⃣ Capture geolocation continuously
    const sendLocation = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const locationData = { lat: latitude, lng: longitude, accuracy };

      // Send via API
      axios
        .post(`${API}/api/track-location/${linkId}`, {
          location: locationData,
        })
        .then((res) => {
          if (res.data.success) {
            console.log("Location sent:", locationData);
          }
        })
        .catch((err) => console.error("Error sending location:", err));

      // Optional: Send via Socket.IO for real-time updates
      if (socket) {
        socket.emit("share-location", { location: locationData }, (res) => {
          if (res.success) console.log("Socket location sent");
        });
      }
    };

    const handleError = (err) => {
      console.error("Geolocation error:", err.message);
      setStatus(`Error: ${err.message}`);
    };

    // Start watching position
    if (navigator.geolocation) {
      const watcher = navigator.geolocation.watchPosition(
        sendLocation,
        handleError,
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        },
      );

      return () => {
        navigator.geolocation.clearWatch(watcher);
      };
    } else {
      setStatus("Geolocation not supported on this device");
    }
  }, [personName, socket, linkId]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Silent Tracking</h1>
      <p>Person: {personName || "—"}</p>
      <p>Status: {status}</p>
      <p>This page will silently send your location to the server.</p>
    </div>
  );
};

export default SilentTracking;
