"use client";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import { Icon } from "./Icon";
export default function Nav() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const html = document.documentElement;
    const sync = () =>
      setTheme(html.dataset.theme === "dark" ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("glui-theme", next);
    } catch {}
    setTheme(next);
  }
  return (
    <header className="nav-shell">
      <nav className="nav-glass" aria-label="Main navigation">
        <a href="#main" className="nav-logo" aria-label="GLUI home">
          <Logo />
        </a>
        <div className="nav-links">
          <a href="#agents">Agents</a>
          <a href="#features">The experience</a>
          <a
            href="https://github.com/Youssef2430/clui"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <Icon name="arrow-up-right" size={12} />
          </a>
        </div>
        <div className="nav-actions">
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="icon-button theme-toggle"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
          <a href="#install" className="nav-cta">
            Get GLUI <Icon name="arrow-down" size={13} />
          </a>
        </div>
      </nav>
    </header>
  );
}
