import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

const forgeFlow = [
  {
    name: "Intent",
    description: "What you want to happen",
    example: "User closes a ticket",
    color: "from-blue-500 to-cyan-500",
  },
  {
    name: "Rule",
    description: "When it's allowed",
    example: "forbid if status == closed",
    color: "from-cyan-500 to-emerald-500",
  },
  {
    name: "Transition",
    description: "What changes",
    example: "status: open -> closed",
    color: "from-emerald-500 to-amber-500",
  },
  {
    name: "Effect",
    description: "What happens next",
    example: "enqueue notify_customer",
    color: "from-amber-500 to-orange-500",
  },
  {
    name: "Message",
    description: "What the user sees",
    example: "emit TICKET_CLOSED",
    color: "from-orange-500 to-forge-500",
  },
];

const beforeAfter = {
  before: {
    lines: 487,
    files: 12,
    items: [
      "TicketsController.rb",
      "TicketPolicy.rb",
      "TicketSerializer.rb",
      "CloseTicketService.rb",
      "create_tickets.rb (migration)",
      "add_status_to_tickets.rb",
      "TicketMailer.rb",
      "ticket_closed.html.erb",
      "NotifyCustomerJob.rb",
      "routes.rb (partial)",
      "ticket_spec.rb",
      "ticket_policy_spec.rb",
    ],
  },
  after: {
    lines: 23,
    files: 1,
    items: ["app.forge"],
  },
};

export function Insight() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-forge-950/10 to-background" />

      <div className="container relative z-10 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={isInView ? { scale: 1 } : {}}
              transition={{ type: "spring", delay: 0.2 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forge-500/10 border border-forge-500/20 mb-6"
            >
              <Sparkles className="w-8 h-8 text-forge-400" />
            </motion.div>

            <h2 className="section-heading mb-4">
              What if you just... <span className="text-gradient">didn't?</span>
            </h2>
            <p className="section-subheading mx-auto">
              You describe WHAT your app does. FORGE handles HOW.
            </p>
          </motion.div>

          {/* The FORGE flow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-20"
          >
            <div className="relative bg-card border border-border rounded-2xl p-8 overflow-hidden">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-r from-forge-500/5 via-transparent to-forge-500/5" />

              <h3 className="relative text-center text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">
                The FORGE Mental Model
              </h3>

              {/* Flow diagram */}
              <div className="relative flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2">
                {forgeFlow.map((step, index) => (
                  <motion.div
                    key={step.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="relative flex-1 w-full md:w-auto"
                  >
                    {/* Arrow between steps (desktop) */}
                    {index < forgeFlow.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                        <ArrowRight className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="relative group">
                      {/* Glow effect */}
                      <div
                        className={`absolute -inset-px rounded-xl bg-gradient-to-r ${step.color} opacity-0 group-hover:opacity-20 blur transition-opacity`}
                      />

                      <div className="relative bg-muted/50 border border-border rounded-xl p-4 text-center">
                        <div
                          className={`text-sm font-bold bg-gradient-to-r ${step.color} bg-clip-text text-transparent mb-1`}
                        >
                          {step.name}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {step.description}
                        </div>
                        <code className="text-xs font-mono text-foreground/70 bg-background/50 px-2 py-1 rounded">
                          {step.example}
                        </code>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Before/After comparison */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid md:grid-cols-2 gap-8"
          >
            {/* Before */}
            <div className="relative group">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 opacity-50" />
              <div className="relative bg-card border border-red-500/20 rounded-2xl p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-red-400">Traditional Stack</h3>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold text-red-400">
                      {beforeAfter.before.lines}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      lines across {beforeAfter.before.files} files
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {beforeAfter.before.items.map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.5 + index * 0.03 }}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400/50" />
                      <code className="font-mono text-xs">{item}</code>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* After */}
            <div className="relative group">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-forge-500/20 to-emerald-500/20 opacity-50" />
              <div className="relative bg-card border border-forge-500/20 rounded-2xl p-6 h-full glow">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-forge-400">FORGE</h3>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold text-emerald-400">
                      {beforeAfter.after.lines}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      lines in {beforeAfter.after.files} file
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : {}}
                    transition={{ type: "spring", delay: 0.8 }}
                    className="text-6xl font-mono font-bold text-forge-400 mb-2"
                  >
                    1
                  </motion.div>
                  <code className="font-mono text-sm text-muted-foreground">
                    app.forge
                  </code>
                </div>

                <div className="absolute bottom-6 left-6 right-6 text-center">
                  <span className="text-sm font-medium text-emerald-400">
                    Same behavior. 95% less code.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* The key insight */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              FORGE is not a framework.{" "}
              <span className="text-foreground font-medium">
                It's a compiler + sealed runtime.
              </span>
              <br />
              Your spec compiles into an application that{" "}
              <span className="text-forge-400 font-medium">
                cannot violate your business logic.
              </span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
