const companyLogoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="120" viewBox="0 0 520 120">
  <rect x="2" y="2" width="116" height="116" rx="22" fill="#172554"/>
  <path d="M37 33h44v11H49v12h29v11H49v20h-12z" fill="#fff"/>
  <path d="M88 33h-6v10h6c10 0 16 6 16 15s-6 15-16 15h-6v14h6c18 0 29-11 29-29S106 33 88 33z" fill="#38bdf8"/>
  <text x="142" y="63" fill="#0f172a" font-family="Arial, Helvetica, sans-serif" font-size="39" font-weight="700">Easy-Procure</text>
  <text x="145" y="91" fill="#475569" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="2">PROCUREMENT &amp; INVENTORY</text>
</svg>`;

export const companyLogoDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(companyLogoSvg)}`;

export function getCompanyLogoPngDataUrl() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 1040;
      canvas.height = 240;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not prepare the company logo for the document."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Could not load the company logo."));
    image.src = companyLogoDataUri;
  });
}
