import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { Send, Shield, Wifi } from "lucide-react";

interface Message {
  id: string;
  user: string;
  text: string;
  time: string;
}

const initialMessages: Message[] = [
  { id: "1", user: "Alice", text: "Hey team, anyone available for a quick sync?", time: "2:34 PM" },
  { id: "2", user: "Bob", text: "I'm free in 10 minutes", time: "2:35 PM" },
];

export function Demo() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const [showSecurityDemo, setShowSecurityDemo] = useState(false);
  const [securityAttempt, setSecurityAttempt] = useState<string | null>(null);

  // Simulate real-time sync between tabs
  const sendMessage = (tab: "A" | "B", text: string) => {
    if (!text.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      user: tab === "A" ? "Alice" : "Bob",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMessage]);
    if (tab === "A") setInputA("");
    else setInputB("");
  };

  // Security demo
  const attemptUnauthorizedAccess = () => {
    setSecurityAttempt("pending");
    setTimeout(() => {
      setSecurityAttempt("blocked");
    }, 1500);
    setTimeout(() => {
      setSecurityAttempt(null);
    }, 4000);
  };

  return (
    <section ref={ref} className="section relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-cyan-950/5 to-background" />

      <div className="container relative z-10 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="section-heading mb-4">
              See it. <span className="text-cyan-400">Break it.</span> Believe it.
            </h2>
            <p className="section-subheading mx-auto">
              Real-time sync. Database-enforced security. Zero WebSocket code.
            </p>
          </motion.div>

          {/* Demo tabs */}
          <div className="flex justify-center gap-4 mb-8">
            <button
              onClick={() => setShowSecurityDemo(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                !showSecurityDemo
                  ? "bg-forge-500/20 text-forge-400 border border-forge-500/30"
                  : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
              }`}
            >
              <Wifi className="w-4 h-4 inline mr-2" />
              Real-time Demo
            </button>
            <button
              onClick={() => setShowSecurityDemo(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showSecurityDemo
                  ? "bg-forge-500/20 text-forge-400 border border-forge-500/30"
                  : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted"
              }`}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Security Demo
            </button>
          </div>

          {!showSecurityDemo ? (
            /* Real-time demo */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/10 via-forge-500/10 to-cyan-500/10 rounded-3xl blur-2xl" />

              <div className="relative grid md:grid-cols-2 gap-6">
                {/* Tab A */}
                <ChatWindow
                  title="Browser Tab A"
                  user="Alice"
                  messages={messages}
                  input={inputA}
                  setInput={setInputA}
                  onSend={() => sendMessage("A", inputA)}
                  isInView={isInView}
                />

                {/* Tab B */}
                <ChatWindow
                  title="Browser Tab B"
                  user="Bob"
                  messages={messages}
                  input={inputB}
                  setInput={setInputB}
                  onSend={() => sendMessage("B", inputB)}
                  isInView={isInView}
                />
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ delay: 0.5 }}
                className="mt-8 text-center"
              >
                <p className="text-sm text-muted-foreground">
                  Type in one tab, watch it appear in the other.{" "}
                  <span className="text-cyan-400 font-medium">
                    No WebSocket code. It just works.
                  </span>
                </p>
              </motion.div>
            </motion.div>
          ) : (
            /* Security demo */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative max-w-2xl mx-auto"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-red-500/10 via-forge-500/10 to-red-500/10 rounded-3xl blur-2xl" />

              <div className="relative bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-forge-400" />
                    <span className="font-medium">Access Control Test</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Logged in as: guest@example.com
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  <p className="text-sm text-muted-foreground">
                    Try to access data from another organization. This request would
                    succeed in most apps if the developer forgot a permission check.
                  </p>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <code className="text-sm font-mono">
                      <span className="text-emerald-400">GET</span>{" "}
                      <span className="text-foreground">/api/tickets</span>
                      <br />
                      <span className="text-muted-foreground">
                        ?org_id=<span className="text-red-400">other-company-uuid</span>
                      </span>
                    </code>
                  </div>

                  <button
                    onClick={attemptUnauthorizedAccess}
                    disabled={securityAttempt !== null}
                    className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {securityAttempt === "pending" ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        Attempting access...
                      </span>
                    ) : (
                      "Try to Access Other Company's Data"
                    )}
                  </button>

                  {securityAttempt === "blocked" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4"
                    >
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-emerald-400 mt-0.5" />
                        <div>
                          <p className="font-medium text-emerald-400">Access Denied</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Row-level security blocked this query at the database level.
                            Not because of middleware—because it's{" "}
                            <span className="text-foreground font-medium">
                              mathematically impossible
                            </span>
                            .
                          </p>
                          <div className="mt-3 p-2 bg-background/50 rounded text-xs font-mono text-muted-foreground">
                            PostgreSQL RLS Policy: org_id = current_user_org()
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="pt-4 border-t border-border">
                    <h4 className="text-sm font-medium mb-3">How FORGE prevents this:</h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-forge-400 mt-2" />
                        <span>
                          Access rules compile to PostgreSQL RLS policies
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-forge-400 mt-2" />
                        <span>
                          Every query is filtered at the database level
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-forge-400 mt-2" />
                        <span>
                          No code path can bypass the security model
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* The point */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Not because of middleware.{" "}
              <span className="text-foreground font-medium">
                Because it's impossible.
              </span>
              <br />
              <span className="text-forge-400">That's the difference.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ChatWindow({
  title,
  user,
  messages,
  input,
  setInput,
  onSend,
  isInView,
}: {
  title: string;
  user: string;
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isInView: boolean;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageCount = useRef(messages.length);

  useEffect(() => {
    // Only scroll when new messages are added, not on initial render
    if (messages.length > initialMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* Window header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/50" />
          </div>
          <span className="text-sm font-medium ml-2">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wifi className="w-3 h-3 text-emerald-400" />
          <span>Connected</span>
        </div>
      </div>

      {/* Messages */}
      <div className="h-[300px] overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.user === user ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                msg.user === user
                  ? "bg-forge-500/20 text-forge-400"
                  : "bg-cyan-500/20 text-cyan-400"
              }`}
            >
              {msg.user[0]}
            </div>
            <div
              className={`max-w-[70%] px-3 py-2 rounded-xl ${
                msg.user === user
                  ? "bg-forge-500/20 border border-forge-500/30"
                  : "bg-muted/50 border border-border"
              }`}
            >
              <p className="text-sm">{msg.text}</p>
              <p className="text-xs text-muted-foreground mt-1">{msg.time}</p>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-muted/20">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
            placeholder={`Message as ${user}...`}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-forge-500/50"
          />
          <button
            onClick={onSend}
            className="px-3 py-2 bg-forge-500/20 border border-forge-500/30 rounded-lg text-forge-400 hover:bg-forge-500/30 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
