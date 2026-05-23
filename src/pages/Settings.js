// src/pages/Settings.js
import React, { useState } from "react";

export default function Settings({ user, setUser }) {
  const [profile, setProfile] = useState(user);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((current) => ({ ...current, [name]: value }));
  };

  const handleProfilePicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfile((current) => ({ ...current, profilePic: imageUrl }));
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    setUser(profile); // ✅ updates global state
    alert("Profile updated successfully!");
  };

  return (
    <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
      <h1>Settings</h1>
      <form onSubmit={handleSave} style={{ marginTop: "20px" }}>
        <h2>Profile Information</h2>
        <label>
          Name:
          <input
            type="text"
            name="name"
            value={profile.name}
            onChange={handleProfileChange}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <br />
        <label>
          Role:
          <input
            type="text"
            name="role"
            value={profile.role}
            onChange={handleProfileChange}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <br />
        <label>
          Profile Picture:
          <input
            type="file"
            accept="image/*"
            onChange={handleProfilePicUpload}
            style={{ marginLeft: "10px" }}
          />
        </label>
        <br />
        {profile.profilePic && (
          <img
            src={profile.profilePic}
            alt="Profile Preview"
            style={{ width: "80px", height: "80px", borderRadius: "50%", marginTop: "10px" }}
          />
        )}
        <br />
        <button type="submit" style={{ marginTop: "10px" }}>
          Save Profile
        </button>
      </form>
    </div>
  );
}
