import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

const API =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://find-device-server.onrender.com";

const SilentTracking = () => {
  const { linkId } = useParams();
  const locationSentRef = useRef(false);

  useEffect(() => {
    console.log("Tracking page loaded for linkId:", linkId);

    const sendLocationViaAPI = async () => {
      if (locationSentRef.current) return;
      locationSentRef.current = true;

      if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        alert("Your device does not support location tracking.");
        setTimeout(() => window.close(), 1500);
        return;
      }

      // Check HTTPS
      if (
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost"
      ) {
        console.warn("⚠️ Geolocation may be blocked on non-HTTPS page.");
        alert("Please access this link via HTTPS for location tracking.");
      }

      console.log("Requesting location...");

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };

          console.log("Location obtained:", location);

          try {
            const response = await fetch(
              `${API}/api/track-location/${linkId}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ location }),
              },
            );

            const result = await response.json();
            console.log("API response:", result);

            if (result.success) {
              console.log("✅ Location saved successfully!");
            } else {
              console.error("Failed to save location:", result.error);
            }
          } catch (error) {
            console.error("Error sending location:", error);
          }

          // Close after sending
          setTimeout(() => window.close(), 1000);
        },
        (error) => {
          console.error("Geolocation error:", error);
          if (error.code === error.PERMISSION_DENIED) {
            alert("Location permission denied. Enable it in browser settings.");
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            alert("Unable to determine location.");
          } else if (error.code === error.TIMEOUT) {
            alert("Location request timed out. Try again.");
          }
          setTimeout(() => window.close(), 2000);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000, // Increased timeout for mobile GPS
          maximumAge: 0,
        },
      );
    };

    sendLocationViaAPI();

    // Force close after 35 seconds as a backup
    const forceCloseTimer = setTimeout(() => window.close(), 35000);

    return () => clearTimeout(forceCloseTimer);
  }, [linkId]);

  return null;
};

export default SilentTracking;
