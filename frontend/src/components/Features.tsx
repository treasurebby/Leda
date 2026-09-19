import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  Camera,
  Check,
  MessagesSquare,
  MoveRight,
} from "lucide-react";
import { SectionLabel, Waveform } from "./ui";
import { IMAGES } from "../config/images";

const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: easeOut } },
};

export default function Features() {
  return (
    <section id="features" className="relative py-24 lg:py-32">
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>02 &middot; Sabi-Decoding engine</SectionLabel>
          <h2 className="text-balance mt-4 text-[34px] font-black leading-[1.06] tracking-[-0.02em] text-olive sm:text-[44px] lg:text-[52px]">
            It speaks fluent market.{" "}
            <span className="text-gold">It writes perfect ledger.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-olive/65">
            Trained on thousands of hours of real ordering conversations from
            Nigeria&rsquo;s biggest wholesale markets, generator noise and all.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-120px" }}
          className="mt-16 grid gap-6 md:grid-cols-3"
        >
          {/* card 1 — voice to text */}
          <motion.article
            variants={rise}
            className="group flex flex-col rounded-2xl border border-olive/10 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold text-gold">01</span>
              <AudioLines className="size-5 text-olive/30 transition-colors duration-300 group-hover:text-forest" />
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[19px] font-extrabold tracking-tight text-olive">
              Voice <MoveRight className="size-4 text-gold" /> Text
            </h3>
            <p className="mt-2.5 flex-1 text-[14.5px] leading-relaxed text-olive/65">
              That 42-second voice note with a generator humming behind it?
              Transcribed, punctuated, and split into exact quantities in
              under a second.
            </p>

            <div className="mt-6 rounded-xl bg-cream-deep/50 p-4 ring-1 ring-olive/[0.07]">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest text-cream">
                  <AudioLines className="size-3.5" />
                </span>
                <Waveform playing progress={1} barClass="bg-forest/80" className="h-6" />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 ring-1 ring-olive/[0.07]">
                <Check className="mt-0.5 size-3.5 shrink-0 text-forest" />
                <p className="text-[12px] font-semibold leading-snug text-olive/80">
                  &ldquo;Forty bags, the fifty-kg Stallion&hellip;&rdquo;{" "}
                  <span className="font-mono text-[11px] text-forest">
                    &rarr; qty 40 &middot; RSR-50
                  </span>
                </p>
              </div>
            </div>
          </motion.article>

          {/* card 2 — photo to data */}
          <motion.article
            variants={rise}
            className="group flex flex-col rounded-2xl border border-olive/10 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold text-gold">02</span>
              <Camera className="size-5 text-olive/30 transition-colors duration-300 group-hover:text-forest" />
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[19px] font-extrabold tracking-tight text-olive">
              Photo <MoveRight className="size-4 text-gold" /> Data
            </h3>
            <p className="mt-2.5 flex-1 text-[14.5px] leading-relaxed text-olive/65">
              Blurry, tilted, shot on a cracked Tecno in bad light. Leda still
              recognises the brand, the pack size, and the SKU. Every time.
            </p>

            <div className="mt-6 rounded-xl bg-cream-deep/50 p-4 ring-1 ring-olive/[0.07]">
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-olive/10">
                  <img
                    src={IMAGES.chatSacks}
                    alt="Blurry product snapshot"
                    className="h-full w-full scale-110 object-cover blur-[2px] saturate-[0.8]"
                  />
                </div>
                <ArrowRight className="size-4 shrink-0 text-gold" />
                <div className="min-w-0">
                  <p className="font-mono text-[12.5px] font-semibold text-forest">
                    RSR-50
                  </p>
                  <p className="truncate text-[11.5px] font-medium text-olive/55">
                    Royal Stallion &middot; 50kg bag
                  </p>
                  <p className="font-mono text-[10px] font-medium text-gold">
                    98.4% confidence
                  </p>
                </div>
              </div>
            </div>
          </motion.article>

          {/* card 3 — slang to SKU */}
          <motion.article
            variants={rise}
            className="group flex flex-col rounded-2xl border border-olive/10 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] font-semibold text-gold">03</span>
              <MessagesSquare className="size-5 text-olive/30 transition-colors duration-300 group-hover:text-forest" />
            </div>
            <h3 className="mt-5 flex items-center gap-2 text-[19px] font-extrabold tracking-tight text-olive">
              Slang <MoveRight className="size-4 text-gold" /> SKU
            </h3>
            <p className="mt-2.5 flex-1 text-[14.5px] leading-relaxed text-olive/65">
              &ldquo;The red-cap one&rdquo;, &ldquo;Ghana-must-go of
              garri&rdquo;, &ldquo;half-bale of ankara&rdquo;. Everyday market
              language, mapped to the exact item in your catalog.
            </p>

            <div className="mt-6 space-y-2 rounded-xl bg-cream-deep/50 p-4 ring-1 ring-olive/[0.07]">
              <div className="flex items-center justify-between gap-2">
                <p className="rounded-lg rounded-bl-sm bg-white px-3 py-2 text-[12px] font-medium text-olive/75 ring-1 ring-olive/[0.07]">
                  &ldquo;That red-cap oil, 25 litre&rdquo;
                </p>
                <ArrowRight className="size-3.5 shrink-0 text-gold" />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-forest/[0.07] px-3 py-2">
                <span className="font-mono text-[11.5px] font-semibold text-forest">
                  KVO-25R &middot; Kings Oil 25L
                </span>
                <Check className="size-3.5 text-forest" />
              </div>
            </div>
          </motion.article>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: easeOut, delay: 0.2 }}
          className="mx-auto mt-12 max-w-xl text-center text-[13.5px] font-medium leading-relaxed text-olive/55"
        >
          Fluent in{" "}
          <span className="font-bold text-olive">
            Pidgin, Yor&ugrave;b&aacute;, Hausa, &Igrave;gb&ograve;
          </span>{" "}
          and English, plus the everyday market slang your customers actually
          use.
        </motion.p>
      </div>
    </section>
  );
}
