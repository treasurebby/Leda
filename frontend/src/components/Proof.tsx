import { motion, type Variants } from "framer-motion";
import { SectionLabel } from "./ui";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.85, ease: easeOut } },
};

const VOICES = [
  {
    quote:
      "Evenings used to mean four hours reconciling chats with my boys. Now the ledger closes itself before dinner.",
    name: "Chief Emeka Okonkwo",
    role: "Beverages & provisions \u00B7 Onitsha Main Market",
  },
  {
    quote:
      "My customers still order exactly how they like: voice note, slang, anything. Leda just makes sure nothing gets lost between the chat and the books.",
    name: "Alhaji Musa Bello",
    role: "Grains & oils \u00B7 Kantin Kwari, Kano",
  },
  {
    quote:
      "Stock that walks away unnoticed is how shops die. Every photo my resellers send becomes data I can act on the same day.",
    name: "Mrs. Yetunde Alabi",
    role: "Electronics \u00B7 Alaba International",
  },
];

export default function Proof() {
  return (
    <section id="voices" className="relative bg-cream-deep/50 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>Trusted where trade happens</SectionLabel>
          <h2 className="text-balance mt-4 text-[34px] font-black leading-[1.06] tracking-[-0.02em] text-olive sm:text-[44px] lg:text-[52px]">
            The market keeps its voice.{" "}
            <span className="text-forest">You keep perfect books.</span>
          </h2>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mt-14 grid gap-6 md:grid-cols-3"
        >
          {VOICES.map((v) => (
            <motion.figure
              key={v.name}
              variants={rise}
              className="flex flex-col rounded-2xl border border-olive/10 bg-white p-8 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift"
            >
              <blockquote className="flex-1 text-[15.5px] leading-relaxed text-olive/85">
                &ldquo;{v.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-7">
                <p className="text-[14.5px] font-extrabold text-olive">{v.name}</p>
                <p className="mt-1 text-[12.5px] font-medium text-olive/55">{v.role}</p>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
