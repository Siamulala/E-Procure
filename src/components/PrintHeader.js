import React from "react";
import CompanyLogo from "./CompanyLogo";

export default function PrintHeader({ title, subtitle }) {
  return (
    <header className="print-header">
      <div>
        <CompanyLogo className="print-company-logo" />
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        <p className="print-header-date">Printed on: {new Date().toLocaleString()}</p>
      </div>
      <button
        type="button"
        className="secondary-btn no-print"
        onClick={() => window.print()}
        aria-label={`Print ${title}`}
      >
        Print {title}
      </button>
    </header>
  );
}
