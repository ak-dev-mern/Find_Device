import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

const API = "https://find-device-server.onrender.com";

const SilentTracking = () => {
  const { shortCode } = useParams();
  const locationSentRef = useRef(false);
  const [status, setStatus] = useState("Getting link info...");

  useEffect(() => {
    const startTracking = async () => {
      try {
        // Step 1: Resolve shortCode → linkId
        const res = await fetch(`${API}/api/short/${shortCode}`);
        if (!res.ok) {
          setStatus("Link expired or invalid");
          return;
        }
        const { trackingUrl } = await res.json();
        setStatus("Requesting location...");

        // Step 2: Parse linkId from trackingUrl
        const linkId = trackingUrl.split("/track/")[1];
        if (!linkId) {
          setStatus("Invalid tracking link");
          return;
        }

        // Step 3: Request geolocation after small delay
        await new Promise((r) => setTimeout(r, 300)); // ensures component mounted

        if (!navigator.geolocation) {
          setStatus("Geolocation not supported");
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            if (locationSentRef.current) return;
            locationSentRef.current = true;

            const location = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };

            // Step 4: Send to backend
            const trackRes = await fetch(
              `${API}/api/track-location/${linkId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ location }),
              },
            );
            const result = await trackRes.json();

            if (result.success) setStatus("Location sent successfully!");
            else setStatus("Failed to save location");
          },
          (err) => {
            if (err.code === err.PERMISSION_DENIED)
              setStatus("Permission denied");
            else setStatus("Unable to get location");
          },
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
        );
      } catch (err) {
        console.error(err);
        setStatus("Error tracking location");
      }
    };

    startTracking();
  }, [shortCode]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        flexDirection: "column",
        background: "#111",
        color: "#fff",
        fontFamily: "system-ui",
        textAlign: "center",
      }}
    >
      <div>{status}</div>
    </div>
  );
};

export default SilentTracking;
