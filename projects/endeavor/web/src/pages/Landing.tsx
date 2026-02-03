import { Link } from 'react-router-dom'
import { useTheme } from '@/context/ThemeContext'
import { STATE_INFO, STATE_ORDER } from '@/lib/philosophy'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

// Universal manifesto for the landing page
const LANDING_MANIFESTO = {
  creation: "Creation is how we know ourselves. Through making things, we discover our limits, refine our judgment, and shape our character. What we build reveals who we are becoming.",

  rhythm: "Life moves in cycles. There are times to explore, times to commit, and times to step back. Progress does not require urgency, and rest is not failure. What matters is honesty about where your energy belongs.",

  alignment: "Success is not comparison or visibility. It's alignment—acting with integrity, growing with intention, and moving forward without betraying what you stand for.",
}

export function Landing() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <div className="landing-page min-h-screen">
      {/* Minimal header - barely there */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <span className="font-serif text-lg tracking-wide text-emerald-800 dark:text-emerald-300">Endeavor</span>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors duration-300"
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Link
                to="/login"
                className="text-sm text-emerald-700/70 dark:text-emerald-400/70 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors duration-300"
              >
                Enter
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero - Central invitation */}
      <section className="min-h-screen flex items-center justify-center px-6 lg:px-8 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/[0.04] rounded-full blur-3xl animate-breathe" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/[0.03] rounded-full blur-3xl animate-breathe-delayed" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative">
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl leading-[1.8] text-foreground/85 mb-12 animate-fade-in-slow">
            Projects are not tasks to complete.<br />
            <span className="text-emerald-700 dark:text-emerald-400">They are containers for becoming.</span>
          </h1>

          <p className="text-base text-muted-foreground/70 mb-16 animate-fade-in-slower max-w-lg mx-auto leading-relaxed">
            Endeavor is a different way to hold your work. No deadlines. No guilt. Just four stages, honest reflection, and space to grow.
          </p>

          <div className="animate-fade-in-slowest">
            <Link
              to="/login?tab=register"
              className="inline-block text-sm tracking-wide text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 border-b border-emerald-600/30 hover:border-emerald-600/50 pb-1 transition-all duration-500"
            >
              Begin
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-fade-in-slowest">
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-emerald-600/30 to-transparent" />
        </div>
      </section>

      {/* Philosophy Introduction */}
      <section className="py-32 sm:py-40 px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <p className="font-serif text-xl sm:text-2xl leading-[1.9] text-foreground/80 text-center">
            Most tools ask <em>"what's the progress?"</em><br />
            Endeavor asks <em className="text-emerald-700 dark:text-emerald-400">"where does this live?"</em>
          </p>
        </div>
      </section>

      {/* The Manifesto - Flowing prose */}
      <section className="py-24 sm:py-32 px-6 lg:px-8 bg-muted/30">
        <div className="max-w-2xl mx-auto space-y-20">
          <ManifestoBlock
            title="On Creation"
            content={LANDING_MANIFESTO.creation}
          />
          <ManifestoBlock
            title="On Rhythm"
            content={LANDING_MANIFESTO.rhythm}
          />
          <ManifestoBlock
            title="On Alignment"
            content={LANDING_MANIFESTO.alignment}
          />
        </div>
      </section>

      {/* The Four Stages - Vertical journey */}
      <section className="py-32 sm:py-40 px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-24">
            <h2 className="font-serif text-2xl sm:text-3xl text-foreground/90 mb-6">
              How Endeavor Organizes Your Work
            </h2>
            <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
              No kanban columns. No sprint deadlines. Instead, four stages that mirror how creative work actually moves—not a linear march toward "done," but a living cycle you return to.
            </p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-8 sm:left-12 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-600/0 via-emerald-600/20 to-emerald-600/0 hidden sm:block" />

            <div className="space-y-16 sm:space-y-24">
              {STATE_ORDER.map((stateKey, index) => {
                const state = STATE_INFO[stateKey]
                return (
                  <StageBlock
                    key={stateKey}
                    number={index + 1}
                    title={state.title}
                    question={state.question}
                    description={state.description}
                    stateKey={stateKey}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* What This Is Not - Typography only */}
      <section className="py-24 sm:py-32 px-6 lg:px-8 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-muted-foreground/60 mb-8">This is not</p>
          <div className="space-y-3 mb-12">
            {['a hustle tracker', 'a task micromanager', 'a gamified dopamine system', 'another kanban board'].map((item) => (
              <p key={item} className="font-serif text-lg sm:text-xl text-muted-foreground/40 line-through decoration-muted-foreground/20">
                {item}
              </p>
            ))}
          </div>
          <div className="w-12 h-px bg-emerald-600/30 mx-auto mb-12" />
          <p className="text-muted-foreground/60 mb-8">This is</p>
          <p className="font-serif text-xl sm:text-2xl text-foreground/80 leading-relaxed">
            a space for intentional work,<br />
            a holder of intentions,<br />
            a calm companion for reflection
          </p>
        </div>
      </section>

      {/* Principles - No checkmarks, just typography */}
      <section className="py-32 sm:py-40 px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground/90 text-center mb-20">
            Core Principles
          </h2>

          <div className="space-y-16">
            <PrincipleBlock
              title="No tasks, only intentions"
              description="You don't track what to do. You hold what you intend. An intention is a direction, not a checklist."
            />
            <PrincipleBlock
              title="Transitions require reflection"
              description="Moving between stages is meaningful. Each transition asks: why?"
            />
            <PrincipleBlock
              title="State over status"
              description="We don't ask 'what's the progress?' We ask 'where does this live?'"
            />
            <PrincipleBlock
              title="Pulse without pressure"
              description="Projects show how recently you've been present with them. But a quiet pulse is not failure—some work needs incubation, some needs rest."
            />
          </div>
        </div>
      </section>

      {/* Final Quote */}
      <section className="py-32 sm:py-40 px-6 lg:px-8 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-8 h-px bg-emerald-600/30 mx-auto mb-12" />
          <blockquote className="font-serif text-xl sm:text-2xl leading-[1.9] text-foreground/80 mb-8">
            "I am not in a hurry to become someone else.<br />
            I am committed to becoming myself, fully and honestly, over time."
          </blockquote>
        </div>
      </section>

      {/* Gentle CTA */}
      <section className="py-32 sm:py-40 px-6 lg:px-8">
        <div className="max-w-xl mx-auto text-center">
          <p className="font-serif text-lg sm:text-xl text-muted-foreground mb-12 leading-relaxed">
            Begin with what's already calling to you.<br />
            There's no wrong place to start.
          </p>
          <Link
            to="/login?tab=register"
            className="inline-block px-8 py-4 text-sm tracking-wide bg-emerald-600/10 hover:bg-emerald-600/20 text-foreground/80 hover:text-foreground rounded-lg transition-all duration-500 border border-emerald-600/20"
          >
            Create your space
          </Link>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="py-16 px-6 lg:px-8 border-t border-emerald-600/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <span className="font-serif text-sm text-emerald-700/60 dark:text-emerald-400/60">Endeavor</span>
            <p className="text-xs text-muted-foreground/40">
              A space for deliberate living through projects
            </p>
          </div>
        </div>
      </footer>

      {/* Custom styles */}
      <style>{`
        .landing-page {
          --font-serif: 'Libre Baskerville', Georgia, 'Times New Roman', serif;
        }

        .landing-page .font-serif {
          font-family: var(--font-serif);
        }

        @keyframes breathe {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }

        @keyframes breathe-delayed {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.08); }
        }

        .animate-breathe {
          animation: breathe 8s ease-in-out infinite;
        }

        .animate-breathe-delayed {
          animation: breathe-delayed 10s ease-in-out infinite;
          animation-delay: 2s;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
        }

        .animate-fade-in-slow {
          animation: fade-in 1s ease-out 0.2s forwards;
          opacity: 0;
        }

        .animate-fade-in-slower {
          animation: fade-in 1s ease-out 0.5s forwards;
          opacity: 0;
        }

        .animate-fade-in-slowest {
          animation: fade-in 1s ease-out 0.8s forwards;
          opacity: 0;
        }

        /* Stage state colors */
        .stage-threshold { color: hsl(var(--state-threshold)); }
        .stage-forge { color: hsl(var(--state-forge)); }
        .stage-embodiment { color: hsl(var(--state-embodiment)); }
        .stage-clearing { color: hsl(var(--state-clearing)); }

        .stage-dot-threshold { background-color: hsl(var(--state-threshold) / 0.4); }
        .stage-dot-forge { background-color: hsl(var(--state-forge) / 0.4); }
        .stage-dot-embodiment { background-color: hsl(var(--state-embodiment) / 0.4); }
        .stage-dot-clearing { background-color: hsl(var(--state-clearing) / 0.4); }
      `}</style>
    </div>
  )
}

function ManifestoBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="text-center">
      <h3 className="text-xs tracking-[0.2em] uppercase text-muted-foreground/50 mb-6">
        {title}
      </h3>
      <p className="font-serif text-lg sm:text-xl leading-[1.9] text-foreground/75">
        {content}
      </p>
    </div>
  )
}

function StageBlock({
  number,
  title,
  question,
  description,
  stateKey
}: {
  number: number
  title: string
  question: string
  description: string
  stateKey: string
}) {
  return (
    <div className="flex gap-6 sm:gap-12">
      {/* Number/dot indicator */}
      <div className="flex-shrink-0 w-16 sm:w-24 flex flex-col items-center">
        <div className={cn(
          "w-4 h-4 rounded-full mb-4",
          `stage-dot-${stateKey}`
        )} />
        <span className="text-xs text-muted-foreground/40 font-mono">{String(number).padStart(2, '0')}</span>
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <h3 className={cn(
          "font-serif text-xl sm:text-2xl mb-3",
          `stage-${stateKey}`
        )}>
          {title}
        </h3>
        <p className="font-serif text-base sm:text-lg italic text-muted-foreground/60 mb-4">
          "{question}"
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}

function PrincipleBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center">
      <h3 className="font-serif text-lg sm:text-xl text-foreground/85 mb-4">
        {title}
      </h3>
      <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
        {description}
      </p>
    </div>
  )
}
