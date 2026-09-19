const MARKETS = [
  "Onitsha Main Market",
  "Alaba International",
  "Kantin Kwari, Kano",
  "Ariaria, Aba",
  "Oyingbo, Lagos",
  "Trade Fair Complex",
  "Computer Village, Ikeja",
  "Wuse Market, Abuja",
  "Balogun Market",
  "Gbagi, Ibadan",
];

export default function TrustMarquee() {
  const row = (
    <div className="flex shrink-0 items-center">
      {MARKETS.map((m) => (
        <span key={m} className="flex items-center">
          <span className="whitespace-nowrap text-[14px] font-semibold tracking-wide text-olive/45">
            {m}
          </span>
          <span className="mx-8 text-olive/25" aria-hidden>
            &middot;
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <section className="relative bg-cream-deep/60 py-8">
      <p className="mb-5 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-olive/40">
        Powering distribution across Nigeria&rsquo;s biggest markets
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="marquee-track flex w-max animate-marquee">
          {row}
          {row}
        </div>
      </div>
    </section>
  );
}
