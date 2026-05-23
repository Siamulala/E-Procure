import React from "react";
import "../styles/Pages.css";

export default function Purchase() {
  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Purchase Requests</h1>
        <p>Create and track purchase requests.</p>
      </div>
      <div className="card">
        <div className="card-title">New Requests</div>
        <div className="card-content">
          <p>Manage and approve purchase requests efficiently.</p>
        </div>
      </div>
    </div>
  );
}
