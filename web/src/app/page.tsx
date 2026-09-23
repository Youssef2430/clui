import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AgentShowcase from "@/components/AgentShowcase";
import Install from "@/components/Install";
import { LogoMark } from "@/components/Logo";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Icon } from "@/components/Icon";

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> A little more native. A lot more
              you.
            </p>
            <h1 id="hero-title">
              All your agents.
              <br />
              <span>One clear space.</span>
            </h1>
            <p className="hero-description">
              Claude Code, Codex, and OpenCode. Together in a
              <br className="desktop-break" /> beautifully light workspace that
              feels at home on your Mac.
            </p>
            <div className="hero-actions">
              <a
                className="button-primary"
                href="/download?arch=arm64"
                aria-label="Download GLUI for Mac (Apple Silicon)"
              >
                <Icon name="apple" size={18} /> Download for Mac{" "}
                <Icon name="arrow-down" size={16} />
              </a>
              <a
                className="text-link"
                href="https://github.com/Youssef2430/clui"
                target="_blank"
                rel="noreferrer"
              >
                Explore the source <Icon name="arrow-up-right" size={16} />
              </a>
            </div>
            <p className="hero-meta">
              Apple Silicon <span>·</span>{" "}
              <a href="/download?arch=x64">Download for Intel</a> <span>·</span>{" "}
              Free & open source
            </p>
          </div>
          <div className="hero-scene">
            <div className="scene-art" aria-hidden="true" />
            <AgentShowcase />
          </div>
        </section>
        <section
          className="provider-section content-width"
          id="agents"
          aria-label="Supported coding agents"
        >
          <p>
            Three powerful agents.
            <br />
            <strong>One familiar place.</strong>
          </p>
          <div className="provider-list">
            <span>
              <ProviderIcon provider="claude" size={27} /> Claude Code
            </span>
            <span>
              <ProviderIcon provider="codex" size={27} /> Codex
            </span>
            <span>
              <ProviderIcon provider="opencode" size={25} /> OpenCode
            </span>
          </div>
        </section>
        <section
          className="features content-width"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">LESS IN THE WAY. MORE IN YOUR FLOW.</p>
              <h2 id="features-title">
                A smaller window.
                <br />
                <span>A bigger flow.</span>
              </h2>
            </div>
            <p>
              Keep the power of your CLI.
              <br />
              Give it a little room to breathe.
            </p>
          </div>
          <div className="feature-columns">
            <article>
              <div
                className="feature-visual shortcut-visual"
                aria-hidden="true"
              >
                <kbd>
                  ⌥<small>option</small>
                </kbd>
                <kbd>space</kbd>
              </div>
              <span className="feature-number">01 / ALWAYS WITHIN REACH</span>
              <h3>One shortcut. Back in flow.</h3>
              <p>
                Summon GLUI over whatever you’re working on. Ask a question,
                make a change, and get right back to it.
              </p>
            </article>
            <article>
              <div className="feature-visual handoff-visual" aria-hidden="true">
                <span>
                  <ProviderIcon provider="claude" size={29} />
                </span>
                <Icon name="arrow-right" size={20} />
                <span>
                  <ProviderIcon provider="codex" size={29} />
                </span>
                <Icon name="arrow-right" size={20} />
                <span>
                  <ProviderIcon provider="opencode" size={25} />
                </span>
              </div>
              <span className="feature-number">02 / KEEP THE CONTEXT</span>
              <h3>A fresh take. The same thread.</h3>
              <p>
                Switch agents with a conversation handoff. Bring a different
                perspective to your project without starting from scratch.
              </p>
            </article>
            <article>
              <div
                className="feature-visual approval-visual"
                aria-hidden="true"
              >
                <div>
                  <Icon name="file" size={18} />
                  <span>Update App.tsx</span>
                  <span className="approval-check">
                    <Icon name="check" size={13} /> Allow
                  </span>
                </div>
              </div>
              <span className="feature-number">03 / YOU’RE IN CONTROL</span>
              <h3>Every step, in plain sight.</h3>
              <p>
                Follow tool activity, review approvals, and open your session in
                the terminal. Powerful agents, with you at the controls.
              </p>
            </article>
          </div>
        </section>
        <section
          className="glass-story content-width"
          aria-labelledby="glass-title"
        >
          <div className="story-orbit" aria-hidden="true" />
          <div className="story-copy">
            <p className="eyebrow">THOUGHTFULLY MAC. UNMISTAKABLY GLUI.</p>
            <h2 id="glass-title">
              A clearer view.
              <br />A lighter touch.
            </h2>
            <p>
              Liquid Glass lets a little of your world through. Burgundy brings
              the warmth. Light or dark, expanded or tucked away — it all feels
              right at home.
            </p>
            <span className="story-detail">
              Native Liquid Glass on macOS 26+
              <br />A frosted finish on earlier versions.
            </span>
          </div>
          <div
            className="story-preview"
            aria-label="Compact GLUI workspace preview"
          >
            <div className="story-caption">
              <span className="caption-line" /> Small enough to stay out of your
              way.
            </div>
            <div className="compact-glass">
              <LogoMark />
              <span>What’s on your mind?</span>
              <span className="compact-mic">
                <Icon name="mic" size={20} />
              </span>
            </div>
            <div
              className="story-swatches"
              aria-label="Burgundy, Tidal, and Liquid Glass themes"
            >
              <span>
                <i className="swatch-burgundy" /> Burgundy
              </span>
              <span>
                <i className="swatch-tidal" /> Tidal
              </span>
              <span>
                <i className="swatch-glass" /> Liquid Glass
              </span>
            </div>
          </div>
        </section>
        <Install />
      </main>
      <Footer />
    </>
  );
}
