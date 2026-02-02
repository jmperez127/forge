import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";

const stackLayers = [
  { name: "Request", color: "bg-slate-600" },
  { name: "Route", color: "bg-slate-500" },
  { name: "Middleware (auth)", color: "bg-red-500/70", isOverhead: true },
  { name: "Middleware (permissions)", color: "bg-red-500/70", isOverhead: true },
  { name: "Controller", color: "bg-slate-500" },
  { name: "Validators", color: "bg-red-500/70", isOverhead: true },
  { name: "Service", color: "bg-slate-500" },
  { name: "Model", color: "bg-slate-500" },
  { name: "Serializer", color: "bg-red-500/70", isOverhead: true },
  { name: "Error Handlers", color: "bg-red-500/70", isOverhead: true },
  { name: "Response", color: "bg-slate-600" },
];

const boringTasks = [
  "Writing authentication middleware",
  "Building permission policies",
  "Creating data serializers",
  "Writing database migrations",
  "Setting up API routes",
  "Handling validation errors",
  "Building admin dashboards",
  "Implementing pagination",
  "Adding audit logging",
  "Managing user sessions",
];

export function Problem() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [developerCount, setDeveloperCount] = useState(0);
  const targetCount = 4827391;

  useEffect(() => {
    if (!isInView) return;

    const duration = 2000;
    const steps = 60;
    const increment = targetCount / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= targetCount) {
        setDeveloperCount(targetCount);
        clearInterval(timer);
      } else {
        setDeveloperCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isInView]);

  return (
    <section ref={ref} className="section relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-red-950/5 to-background" />

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
              You've written this before.
            </h2>
            <p className="section-subheading mx-auto">
              The same controllers. The same serializers. The same permission
              checks. Over and over and over.
            </p>
          </motion.div>

          {/* The traditional stack visualization */}
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-20">
            {/* Stack diagram */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-red-500/5 rounded-2xl blur-2xl" />
              <div className="relative bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                  The traditional request lifecycle
                </h3>
                <div className="space-y-2">
                  {stackLayers.map((layer, index) => (
                    <motion.div
                      key={layer.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      className={`
                        relative flex items-center justify-between px-4 py-2 rounded-lg
                        ${layer.color}
                        ${layer.isOverhead ? "border border-red-400/30" : ""}
                      `}
                    >
                      <span className="text-sm font-medium text-white">
                        {layer.name}
                      </span>
                      {layer.isOverhead && (
                        <span className="text-xs text-red-200 bg-red-500/30 px-2 py-0.5 rounded">
                          overhead
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Actual business logic:</span>
                    <span className="text-red-400 font-mono">~20%</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Scrolling tasks */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-br from-red-500/5 to-orange-500/5 rounded-2xl blur-2xl" />
              <div className="relative bg-card border border-border rounded-xl p-6 h-[400px] overflow-hidden">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">
                  Things you've done a hundred times
                </h3>

                {/* Infinite scroll effect */}
                <div className="relative h-[320px] overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-card to-transparent z-10" />
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent z-10" />

                  <motion.div
                    animate={{ y: [0, -200] }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="space-y-3"
                  >
                    {[...boringTasks, ...boringTasks].map((task, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg border border-border/50"
                      >
                        <div className="w-2 h-2 rounded-full bg-red-400/50" />
                        <span className="text-sm text-muted-foreground">
                          {task}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground/50 font-mono">
                          again
                        </span>
                      </div>
                    ))}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* The damning quote */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center"
          >
            <blockquote className="relative">
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-8xl text-muted-foreground/10 font-serif">
                "
              </div>
              <p className="text-2xl md:text-3xl font-medium text-foreground/90 max-w-3xl mx-auto leading-relaxed">
                Controllers. Serializers. Migrations. Permission checks.
                <br />
                <span className="text-red-400">
                  The same boilerplate. Forever.
                </span>
              </p>
            </blockquote>

            {/* Counter */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.8 }}
              className="mt-12 inline-flex flex-col items-center gap-2 px-8 py-4 bg-card border border-border rounded-xl"
            >
              <span className="text-sm text-muted-foreground">
                You are developer
              </span>
              <span className="text-3xl md:text-4xl font-mono font-bold text-foreground">
                #{developerCount.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                who has rewritten user authentication.
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
