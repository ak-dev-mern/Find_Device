import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = "http://localhost:4000";

const ShortRedirect = () => {
  const { shortCode } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const redirect = async () => {
      try {
        const res = await fetch(`${API}/api/short/${shortCode}`);
        if (res.ok) {
          const data = await res.json();
          // Redirect to the tracking page with the linkId
          navigate(data.trackingUrl);
        } else {
          setError("Link not found or expired");
        }
      } catch (err) {
        console.error("Redirect error:", err);
        setError("Error loading link");
      }
    };
    redirect();
  }, [shortCode, navigate]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#111",
          color: "white",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>Link Expired or Invalid</h2>
          <p style={{ color: "#888" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#111",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          border: "3px solid #3b82f6",
          borderTopColor: "transparent",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ShortRedirect;
