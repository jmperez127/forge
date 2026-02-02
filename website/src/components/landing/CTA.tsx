import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Github, BookOpen, Star, Zap } from "lucide-react";
import { Link } from "react-router-dom";

export function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background to-forge-950/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-forge-500/10 via-transparent to-transparent" />

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-grid opacity-[0.02]" />

      <div className="container relative z-10 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main heading */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={isInView ? { scale: 1 } : {}}
              transition={{ type: "spring", delay: 0.2 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-forge-500/20 to-forge-600/20 border border-forge-500/30 mb-8 glow"
            >
              <Zap className="w-10 h-10 text-forge-400" />
            </motion.div>

            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Ready to{" "}
              <span className="text-gradient">delete some code?</span>
            </h2>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
              Build a complete, real-time chat application. See exactly how FORGE
              eliminates the boring parts while keeping all the behavior.
            </p>
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link to="/tutorial">
              <Button size="lg" className="group text-base px-8">
                Build a Chat App
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>

            <a
              href="https://github.com/forge-lang/forge"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" className="text-base px-8">
                <Github className="w-5 h-5 mr-2" />
                Star on GitHub
              </Button>
            </a>
          </motion.div>

          {/* Secondary links */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap items-center justify-center gap-6 text-sm"
          >
            <a
              href="#"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Read the Manifesto
            </a>
            <a
              href="#"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Star className="w-4 h-4" />
              View Examples
            </a>
          </motion.div>

          {/* Testimonial/Quote */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-20 pt-12 border-t border-border"
          >
            <blockquote className="relative">
              <p className="text-lg md:text-xl text-muted-foreground italic max-w-2xl mx-auto">
                "The goal isn't to write less code.
                <br />
                It's to{" "}
                <span className="text-foreground font-medium not-italic">
                  delete entire categories of problems
                </span>
                ."
              </p>
            </blockquote>
          </motion.div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
