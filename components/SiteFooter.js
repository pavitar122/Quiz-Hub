import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="site-footer-brand" aria-label="Quiz Hub home">
          <BrandMark size={22} />
          <span>Quiz<span>Hub</span></span>
        </Link>
        <p className="site-footer-meta">Civil objective practice · 8,000+ questions</p>
      </div>
    </footer>
  );
}
