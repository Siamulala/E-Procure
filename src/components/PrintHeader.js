import React from "react";
import CompanyLogo from "./CompanyLogo";
import { getCompanyDetails } from "../utils/companyBrand";

export default function PrintHeader({ title, subtitle }) {
  const company = getCompanyDetails();
  const contactDetails = [
    company.phone && `Phone: ${company.phone}`,
    company.email && `Email: ${company.email}`,
  ].filter(Boolean).join(" | ");

  return (
    <>
      <header className="print-header">
        <div>
          <CompanyLogo className="print-company-logo" />
          <div className="print-company-details">
            <strong>{company.name}</strong>
            {company.address ? <span>{company.address}</span> : null}
            {contactDetails ? <span>{contactDetails}</span> : null}
          </div>
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          <p className="print-header-date">Printed on: {new Date().toLocaleString()}</p>
        </div>
      </header>
      <div className="print-watermark" aria-hidden="true">{company.name}</div>
    </>
  );
}
