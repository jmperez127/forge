import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Bot, User, Sparkles, Check, AlertCircle } from "lucide-react";

const conversation = [
  {
    role: "user",
    message: "Add a feature where users can mark tickets as urgent",
  },
  {
    role: "ai",
    thinking: true,
    message: "Reading app.forge... Found Ticket entity with priority field.",
  },
  {
    role: "ai",
    message: "I'll add an 'urgent' priority level and a rule for notifications:",
    code: `# Add to entity Ticket
priority: enum(low, medium, high, urgent) = medium

# Add notification hook
hook Ticket.after_update {
  if priority == urgent {
    enqueue notify_urgent_team
  }
}

# Add the job
job notify_urgent_team {
  input: Ticket
  needs: Ticket.org.members where role == agent
  effect: email.send, slack.notify
}`,
  },
  {
    role: "user",
    message: "Perfect. Now make it so only admins can set urgent priority",
  },
  {
    role: "ai",
    message: "Adding an access rule:",
    code: `rule Ticket.update {
  forbid if priority == urgent and user.role != admin
    emit URGENT_ADMIN_ONLY
}

message URGENT_ADMIN_ONLY {
  level: error
  default: "Only admins can mark tickets as urgent."
}`,
  },
];

const traditionalProblem = [
  "Reads 47 files to understand the codebase",
  "Guesses at the middleware chain",
  "Generates code that might conflict with existing patterns",
  "Misses edge cases in permission logic",
  "Creates security vulnerabilities",
  "Needs 3 more prompts to debug",
];

const forgeAdvantage = [
  "Reads 1 file to understand everything",
  "Sees complete business logic at a glance",
  "Changes are always consistent with spec",
  "Permissions compile to database constraints",
  "Security is mathematically enforced",
  "Works on first try",
];

export function LLMNative() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [visibleMessages, setVisibleMessages] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const showNext = () => {
      setVisibleMessages((prev) => {
        if (prev < conversation.length) {
          return prev + 1;
        }
        return prev;
      });
    };

    // Show messages with delays
    const timers: ReturnType<typeof setTimeout>[] = [];
    conversation.forEach((_, index) => {
      const timer = setTimeout(showNext, 800 * (index + 1));
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  return (
    <section ref={ref} className="section relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-forge-950/5 to-background" />

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
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-forge-500/20 to-cyan-500/20 border border-forge-500/20 mb-6"
            >
              <Bot className="w-8 h-8 text-forge-400" />
            </motion.div>

            <h2 className="section-heading mb-4">
              Built for the <span className="text-gradient">AI age.</span>
            </h2>
            <p className="section-subheading mx-auto">
              A web language designed for humans AND AI to write together.
            </p>
          </motion.div>

          {/* Comparison grid */}
          <div className="grid lg:grid-cols-2 gap-8 mb-16">
            {/* Traditional: The Problem */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10" />
              <div className="relative bg-card border border-red-500/20 rounded-2xl p-6 h-full">
                <h3 className="flex items-center gap-2 font-semibold text-red-400 mb-4">
                  <AlertCircle className="w-5 h-5" />
                  Traditional codebases are mazes
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  LLMs get lost in your controllers, confused by your middleware,
                  hallucinate your business logic.
                </p>
                <div className="space-y-3">
                  {traditionalProblem.map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      className="flex items-start gap-3 text-sm"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400/50 mt-2" />
                      <span className="text-muted-foreground">{item}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* FORGE: The Advantage */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-forge-500/10 to-emerald-500/10" />
              <div className="relative bg-card border border-forge-500/20 rounded-2xl p-6 h-full glow">
                <h3 className="flex items-center gap-2 font-semibold text-forge-400 mb-4">
                  <Sparkles className="w-5 h-5" />
                  FORGE specs are crystal clear
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Declarative. Structured. Predictable. An LLM can read your
                  entire app in one file.
                </p>
                <div className="space-y-3">
                  {forgeAdvantage.map((item, index) => (
                    <motion.div
                      key={item}
                      initial={{ opacity: 0, x: -10 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.4 + index * 0.05 }}
                      className="flex items-start gap-3 text-sm"
                    >
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5" />
                      <span className="text-foreground">{item}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Interactive conversation demo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-forge-500/10 via-transparent to-cyan-500/10 rounded-3xl blur-2xl" />

            <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <h3 className="font-semibold flex items-center gap-2">
                  <Bot className="w-5 h-5 text-forge-400" />
                  Ask Claude to add a feature
                </h3>
                <p className="text-sm text-muted-foreground">
                  Watch how easily AI can understand and modify a FORGE spec
                </p>
              </div>

              <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
                {conversation.slice(0, visibleMessages).map((msg, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : ""
                    }`}
                  >
                    {msg.role === "ai" && (
                      <div className="w-8 h-8 rounded-lg bg-forge-500/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-forge-400" />
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] ${
                        msg.role === "user"
                          ? "bg-forge-500/20 border-forge-500/30"
                          : "bg-muted/50 border-border"
                      } border rounded-xl px-4 py-3`}
                    >
                      <p
                        className={`text-sm ${
                          "thinking" in msg && msg.thinking
                            ? "text-muted-foreground italic"
                            : ""
                        }`}
                      >
                        {msg.message}
                      </p>
                      {"code" in msg && msg.code && (
                        <pre className="mt-3 p-3 bg-background/50 rounded-lg text-xs overflow-x-auto">
                          <code className="text-forge-300">{msg.code}</code>
                        </pre>
                      )}
                    </div>

                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}

                {visibleMessages < conversation.length && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg bg-forge-500/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-forge-400" />
                    </div>
                    <div className="bg-muted/50 border border-border rounded-xl px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-forge-400 animate-bounce" />
                        <div
                          className="w-2 h-2 rounded-full bg-forge-400 animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        />
                        <div
                          className="w-2 h-2 rounded-full bg-forge-400 animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Key insight */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-12 text-center"
          >
            <p className="text-xl text-muted-foreground">
              <span className="text-foreground font-medium">3 lines changed.</span>{" "}
              Feature complete.{" "}
              <span className="text-emerald-400">Security enforced.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
