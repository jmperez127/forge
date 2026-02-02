import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Insight } from "@/components/landing/Insight";
import { Language } from "@/components/landing/Language";
import { LLMNative } from "@/components/landing/LLMNative";
import { Demo } from "@/components/landing/Demo";
import { Paradigm } from "@/components/landing/Paradigm";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { Navigation } from "@/components/landing/Navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main>
        <Hero />
        <Problem />
        <Insight />
        <Language />
        <LLMNative />
        <Demo />
        <Paradigm />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
