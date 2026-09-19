import { Mail, MapPin } from "lucide-react";
import { BrandLogo } from "./ui";
import { IMAGES } from "../config/images";

const COLS = [
  {
    title: "Product",
    links: ["Sabi-Decoding", "Ledger & invoicing", "Payment matching", "Changelog"],
  },
  {
    title: "Company",
    links: ["About", "Distributors", "Careers", "Press kit"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms of service", "Data processing", "Security"],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-forest-deep">
      {/* background photo + green overlay */}
      <img
        src={IMAGES.footerMarket}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-forest-deep/[0.88]" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-b from-forest-ink/60 to-forest-deep/40"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-5 py-16 md:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <BrandLogo dark />
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-cream/70">
              The invisible bridge between your customers&rsquo; WhatsApp and a
              professional, balanced ledger.
            </p>
            <div className="mt-6 space-y-2 text-[13px] font-medium text-cream/70">
              <p className="flex items-center gap-2">
                <MapPin className="size-3.5 text-gold-bright" />
                12B Ogunlana Drive, Surulere, Lagos
              </p>
              <a
                href="mailto:hello@leda.africa"
                className="flex items-center gap-2 transition-colors hover:text-cream"
              >
                <Mail className="size-3.5 text-gold-bright" />
                hello@leda.africa
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.title}>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-bright">
                  {col.title}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#top"
                        className="text-[14px] font-medium text-cream/75 transition-colors hover:text-cream"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[12.5px] font-medium text-cream/55">
            &copy; 2026 Leda Technologies Ltd. All rights reserved. &middot; RC
            1882406
          </p>
          <p className="text-[12.5px] font-semibold text-cream/65">
            Built in Lagos, Nigeria
          </p>
        </div>
      </div>
    </footer>
  );
}
