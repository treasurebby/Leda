import Nav from "./Nav";
import Hero from "./Hero";
import TrustMarquee from "./TrustMarquee";
import Decode from "./Decode";
import Features from "./Features";
import Proof from "./Proof";
import Cta from "./Cta";
import Footer from "./Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream font-sans text-olive">
      <Nav />
      <main>
        <Hero />
        <TrustMarquee />
        <Decode />
        <Features />
        <Proof />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}