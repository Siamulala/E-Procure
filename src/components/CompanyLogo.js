import React from "react";
import { companyLogoDataUri } from "../utils/companyBrand";

export default function CompanyLogo({ className = "" }) {
  return <img className={`company-logo ${className}`.trim()} src={companyLogoDataUri} alt="Easy-Procure" />;
}
