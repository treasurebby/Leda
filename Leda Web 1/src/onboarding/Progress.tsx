import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { STEPS } from "./model";

export default function Progress({ step, reached, finished, disabled, onNavigate }: {
  step: number;
  reached: number;
  finished: boolean;
  disabled: boolean;
  onNavigate: (step: number) => void;
}) {
  return (
    <nav className="setup-progress" aria-label="Onboarding progress">
      <ol>
        {STEPS.map((item, index) => {
          const complete = index < step || finished;
          const current = index === step && !finished;
          return (
            <li key={item.name} className={current ? "progress-current" : complete ? "progress-complete" : ""}>
              <button type="button" onClick={() => onNavigate(index)} disabled={disabled || index > reached} aria-current={current ? "step" : undefined} aria-label={`${index + 1}. ${item.name}: ${item.description}${complete ? ", completed" : ""}`}>
                <span className="progress-track" aria-hidden="true">
                  <motion.span initial={false} animate={{ width: complete || current ? "100%" : "0%" }} transition={{ duration: 0.45, ease: "easeInOut" }} />
                </span>
                <span className="progress-label">
                  <span className="progress-number" aria-hidden="true">{complete ? <Check size={13} strokeWidth={2.2} /> : String(index + 1).padStart(2, "0")}</span>
                  <span className="progress-full-name">{item.name}</span>
                  <span className="progress-short-name">{item.short}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}