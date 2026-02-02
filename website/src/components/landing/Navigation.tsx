import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Github, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-500 to-forge-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="font-bold text-xl">FORGE</span>
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <Link
              to="/tutorial"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Tutorial
            </Link>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/forge-lang/forge"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://github.com/forge-lang/forge"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm">
                <Github className="w-4 h-4 mr-2" />
                Star
              </Button>
            </a>
            <Link to="/tutorial">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border py-4"
          >
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </a>
              <Link
                to="/tutorial"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Tutorial
              </Link>
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Docs
              </a>
              <a
                href="https://github.com/forge-lang/forge"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <div className="pt-4 border-t border-border">
                <Link to="/tutorial">
                  <Button className="w-full">Get Started</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.nav>
  );
}
