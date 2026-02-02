import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Cpu, Database, Code2 } from "lucide-react";

const evolution = [
  {
    era: "1970s",
    problem: "Write machine code",
    solution: "Compilers handle it",
    tech: "Assembly → C/Fortran",
    icon: Cpu,
  },
  {
    era: "1990s",
    problem: "Write SQL everywhere",
    solution: "ORMs handle it",
    tech: "Raw SQL → ActiveRecord/Hibernate",
    icon: Database,
  },
  {
    era: "2020s",
    problem: "Write controllers/APIs",
    solution: "FORGE handles it",
    tech: "Frameworks → Intent specs",
    icon: Code2,
    highlight: true,
  },
];

const keyDifferences = [
  {
    traditional: "Hope your middleware runs",
    forge: "Security is architecturally guaranteed",
  },
  {
    traditional: "Test every permission path",
    forge: "Permissions compile to database constraints",
  },
  {
    traditional: "Debug with logs and prayers",
    forge: "Rules are visible and auditable",
  },
  {
    traditional: "Refactor = rewrite everything",
    forge: "Change spec, regenerate code",
  },
];

export function Paradigm() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-emerald-950/5 to-background" />

      <div className="container relative z-10 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="section-heading mb-4">
              Every generation{" "}
              <span className="text-gradient">deletes a layer.</span>
            </h2>
            <p className="section-subheading mx-auto">
              We stopped writing assembly. We stopped writing SQL by hand.
              <br />
              Now we stop writing glue code.
            </p>
          </motion.div>

          {/* Evolution timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-20"
          >
            <div className="relative">
              {/* Connection line */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-muted via-forge-500/50 to-forge-500 -translate-y-1/2 hidden md:block" />

              <div className="grid md:grid-cols-3 gap-6">
                {evolution.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.era}
                      initial={{ opacity: 0, y: 20 }}
                      animate={isInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className="relative"
                    >
                      <div
                        className={`
                          relative bg-card border rounded-2xl p-6 h-full
                          ${item.highlight
                            ? "border-forge-500/30 glow"
                            : "border-border"
                          }
                        `}
                      >
                        {/* Era badge */}
                        <div
                          className={`
                            inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4
                            ${item.highlight
                              ? "bg-forge-500/20 text-forge-400"
                              : "bg-muted text-muted-foreground"
                            }
                          `}
                        >
                          <Icon className="w-4 h-4" />
                          {item.era}
                        </div>

                        {/* Problem */}
                        <p className="text-sm text-muted-foreground mb-2">
                          <span className="line-through">{item.problem}</span>
                        </p>

                        {/* Solution */}
                        <p
                          className={`font-medium ${
                            item.highlight ? "text-forge-400" : "text-foreground"
                          }`}
                        >
                          {item.solution}
                        </p>

                        {/* Tech transition */}
                        <p className="text-xs text-muted-foreground mt-3 font-mono">
                          {item.tech}
                        </p>
                      </div>

                      {/* Arrow to next (desktop) */}
                      {index < evolution.length - 1 && (
                        <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                          <ArrowRight className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Key differences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-semibold">The real difference</h3>
            </div>

            <div className="divide-y divide-border">
              {keyDifferences.map((diff, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="grid md:grid-cols-2"
                >
                  {/* Traditional */}
                  <div className="px-6 py-4 bg-red-500/5">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-400/50 mt-2" />
                      <span className="text-sm text-muted-foreground">
                        {diff.traditional}
                      </span>
                    </div>
                  </div>

                  {/* FORGE */}
                  <div className="px-6 py-4 bg-forge-500/5">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-forge-400 mt-2" />
                      <span className="text-sm text-foreground font-medium">
                        {diff.forge}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* The breakthrough */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <blockquote className="relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-transparent via-forge-500 to-transparent" />
              <p className="text-xl md:text-2xl text-foreground font-medium max-w-3xl mx-auto leading-relaxed">
                "Designed from scratch for{" "}
                <span className="text-cyan-400">distributed systems</span>,{" "}
                <span className="text-emerald-400">real-time</span>, and{" "}
                <span className="text-forge-400">AI collaboration</span>."
              </p>
              <footer className="mt-4 text-sm text-muted-foreground">
                — The breakthrough Rails would look like if invented in 2024
              </footer>
            </blockquote>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
