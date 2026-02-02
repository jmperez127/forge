import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { ArrowRight, Github, Play } from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { highlightForge } from "@/lib/syntax-highlight";

const codeToDelete = [
  { text: "import express, { Request, Response, NextFunction } from 'express';", delay: 0 },
  { text: "import { authenticate } from '../middleware/auth';", delay: 15 },
  { text: "import { checkPermission } from '../middleware/permissions';", delay: 30 },
  { text: "import { validate } from '../middleware/validate';", delay: 45 },
  { text: "import { TicketService } from '../services/TicketService';", delay: 60 },
  { text: "import { TicketSerializer } from '../serializers/TicketSerializer';", delay: 75 },
  { text: "import { NotificationQueue } from '../queues/notifications';", delay: 90 },
  { text: "", delay: 105 },
  { text: "const router = express.Router();", delay: 120 },
  { text: "", delay: 135 },
  { text: "router.get('/',", delay: 150 },
  { text: "  authenticate,", delay: 165 },
  { text: "  checkPermission('ticket:read'),", delay: 180 },
  { text: "  async (req: Request, res: Response, next: NextFunction) => {", delay: 195 },
  { text: "    try {", delay: 210 },
  { text: "      const tickets = await TicketService.findAll({", delay: 225 },
  { text: "        where: { orgId: req.user!.orgId },", delay: 240 },
  { text: "        include: ['author', 'assignee'],", delay: 255 },
  { text: "      });", delay: 270 },
  { text: "      const serialized = TicketSerializer.serializeMany(tickets);", delay: 285 },
  { text: "      res.json({ data: serialized });", delay: 300 },
  { text: "    } catch (err) {", delay: 315 },
  { text: "      next(err);", delay: 330 },
  { text: "    }", delay: 345 },
  { text: "  }", delay: 360 },
  { text: ");", delay: 375 },
  { text: "", delay: 390 },
  { text: "router.post('/',", delay: 405 },
  { text: "  authenticate,", delay: 420 },
  { text: "  validate(ticketSchema),", delay: 435 },
  { text: "  checkPermission('ticket:create'),", delay: 450 },
  { text: "  async (req: Request, res: Response, next: NextFunction) => {", delay: 465 },
  { text: "    try {", delay: 480 },
  { text: "      const ticket = await TicketService.create({", delay: 495 },
  { text: "        ...req.body,", delay: 510 },
  { text: "        authorId: req.user!.id,", delay: 525 },
  { text: "        orgId: req.user!.orgId,", delay: 540 },
  { text: "        status: 'open'", delay: 555 },
  { text: "      });", delay: 570 },
  { text: "      await NotificationQueue.add('notifyAgent', {", delay: 585 },
  { text: "        ticketId: ticket.id,", delay: 600 },
  { text: "        type: 'new_ticket'", delay: 615 },
  { text: "      });", delay: 630 },
  { text: "      res.status(201).json({ data: ticket });", delay: 645 },
  { text: "    } catch (err) {", delay: 660 },
  { text: "      next(err);", delay: 675 },
  { text: "    }", delay: 690 },
  { text: "  }", delay: 705 },
  { text: ");", delay: 720 },
];

const forgeCode = `entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
}

access Ticket {
  read: user in org.members
  write: user == author
}

hook Ticket.after_create {
  enqueue notify_agent
}`;

export function Hero() {
  const [showDelete, setShowDelete] = useState(false);
  const [showForge, setShowForge] = useState(false);
  const [deletedLines, setDeletedLines] = useState<number[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setShowDelete(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showDelete) return;

    codeToDelete.forEach((_, index) => {
      setTimeout(() => {
        setDeletedLines((prev) => [...prev, index]);
      }, index * 50 + 1300);
    });

    setTimeout(() => {
      setShowForge(true);
    }, codeToDelete.length * 50 + 1600);
  }, [showDelete]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute inset-0 bg-grid opacity-[0.02]" />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-forge-500/10 rounded-full blur-3xl animate-float" />
      <div
        className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-forge-600/10 rounded-full blur-3xl animate-float"
        style={{ animationDelay: "1s" }}
      />

      <div className="container relative z-10 px-4 py-20">
        <div className="max-w-6xl mx-auto">
          {/* Main content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-forge-500/10 border border-forge-500/20 text-forge-400 text-sm font-medium mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-forge-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-forge-500"></span>
              </span>
              A web language that compiles intent into applications
            </motion.div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="block">Stop writing code.</span>
              <span className="block text-gradient pb-1.5">Start declaring intent.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Most software is the same boilerplate rewritten forever.
              <br />
              <span className="text-foreground font-medium">We're done with that.</span>
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/tutorial">
                <Button size="lg" className="group">
                  <Play className="w-4 h-4 mr-2" />
                  Build a Chat App
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <a
                href="https://github.com/forge-lang/forge"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="lg">
                  <Github className="w-4 h-4 mr-2" />
                  Star on GitHub
                </Button>
              </a>
            </div>
          </motion.div>

          {/* Code transformation visual */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative max-w-4xl mx-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-forge-500/20 via-forge-600/20 to-forge-500/20 blur-3xl opacity-30" />

            <div className="relative grid md:grid-cols-2 gap-4">
              {/* Before: Traditional code being deleted */}
              <div className="code-block overflow-hidden">
                <div className="code-header flex items-center justify-between">
                  <span className="text-red-400/80">ticketRoutes.ts</span>
                  <span className="text-xs text-muted-foreground">
                    {deletedLines.length} / {codeToDelete.length} lines deleted
                  </span>
                </div>
                <div className="code-content h-[400px] overflow-hidden">
                  <pre className="text-xs sm:text-sm">
                    <code>
                      {codeToDelete.map((line, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 1, x: 0, height: "auto" }}
                          animate={
                            deletedLines.includes(index)
                              ? {
                                  opacity: 0,
                                  x: -20,
                                  height: 0,
                                  color: "#ef4444",
                                }
                              : {}
                          }
                          transition={{ duration: 0.3 }}
                          className="whitespace-pre"
                        >
                          {line.text || " "}
                        </motion.div>
                      ))}
                    </code>
                  </pre>
                </div>
              </div>

              {/* After: Forge code appearing */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={showForge ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.5 }}
                className="code-block glow"
              >
                <div className="code-header flex items-center justify-between">
                  <span className="text-forge-400">app.forge</span>
                  <span className="text-xs text-emerald-400">
                    Same behavior. 96% less code.
                  </span>
                </div>
                <div className="code-content h-[400px]">
                  <pre className="text-xs sm:text-sm">
                    <code>
                      {showForge &&
                        forgeCode.split("\n").map((line, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="whitespace-pre"
                          >
                            <span dangerouslySetInnerHTML={{ __html: highlightForge(line) }} />
                          </motion.div>
                        ))}
                    </code>
                  </pre>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <span className="text-xs">Scroll to see the revolution</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-5 h-8 border-2 border-muted-foreground/30 rounded-full flex justify-center pt-1"
          >
            <div className="w-1 h-2 bg-muted-foreground/50 rounded-full" />
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

