import { useCallback, useRef } from "react";

export default function Landing() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      return;
    }

    const actionLinks = doc.querySelectorAll<HTMLAnchorElement>("a.btn[href='#']");
    actionLinks.forEach((link) => {
      link.href = "/login";
      link.target = "_top";
      link.rel = "noopener";
    });

    const contactSalesButton = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>("a.btn.btn-outline.btn-large"),
    ).find((link) => link.textContent?.includes("联系销售团队"));

    if (contactSalesButton) {
      contactSalesButton.textContent = "登录平台";
      contactSalesButton.href = "/login";
      contactSalesButton.target = "_top";
    }
  }, []);

  return (
    <div className="h-screen w-full overflow-hidden">
      <iframe
        ref={iframeRef}
        title="platform-portal"
        src="/landing-original.html"
        className="h-full w-full border-0"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
