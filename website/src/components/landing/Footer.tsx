import { Github, Twitter } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-500 to-forge-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">F</span>
              </div>
              <span className="font-bold text-xl">FORGE</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-4">
              Stop writing code.
              <br />
              Start declaring intent.
            </p>
            <div className="flex gap-3">
              <a
                href="https://github.com/forge-lang/forge"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Features
                </a>
              </li>
              <li>
                <Link to="/tutorial" className="hover:text-foreground transition-colors">
                  Tutorial
                </Link>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Examples
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Roadmap
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  API Reference
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Spec Language
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/forge-lang/forge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-semibold mb-4">Community</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Discord
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-foreground transition-colors">
                  Contributing
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} FORGE. Open source under MIT license.
          </p>
          <p className="text-sm text-muted-foreground">
            Built with intent. Deployed without controllers.
          </p>
        </div>
      </div>
    </footer>
  );
}
