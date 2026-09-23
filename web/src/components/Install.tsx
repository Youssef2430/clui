"use client";
import { useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import { Icon } from "./Icon";
const commands =
  "git clone https://github.com/Youssef2430/clui.git\ncd clui\nnpm install\nnpm run setup\nnpm run dev";
export default function Install() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(commands);
      setCopied(true);
      setCopyError(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <section
      className="install content-width"
      id="install"
      aria-labelledby="install-title"
    >
      <div className="install-copy">
        <Logo compact />
        <p className="eyebrow">MAKE YOURSELF AT HOME</p>
        <h2 id="install-title">
          Meet your new
          <br />
          <span>little workspace.</span>
        </h2>
        <p>
          Bring your CLI. Bring your ideas.
          <br />
          GLUI brings it all together.
        </p>
        <a
          className="button-primary"
          href="https://github.com/Youssef2430/clui/releases"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="apple" size={18} /> Browse Mac releases{" "}
          <Icon name="arrow-up-right" size={16} />
        </a>
        <span className="install-note">macOS 13+ · Free & open source</span>
      </div>
      <div className="source-install">
        <div className="source-header">
          <span>
            <Icon name="terminal" size={17} /> Build it yourself
          </span>
          <button
            className="copy-button"
            onClick={copy}
            aria-label={copied ? "Commands copied" : "Copy install commands"}
          >
            <Icon name={copied ? "check" : "copy"} size={15} />
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <pre tabIndex={0} aria-label="Source installation commands">
          <code>
            {commands.split("\n").map((line, i) => (
              <span className="code-line" key={line}>
                <span className="line-number" aria-hidden="true">
                  0{i + 1}
                </span>
                {line}
              </span>
            ))}
          </code>
        </pre>
        {copyError && (
          <p className="copy-error" role="status">
            Select the commands above to copy them manually.
          </p>
        )}
        <div className="source-notes">
          <p>
            Requires Node.js 24.13.1+, Rust 1.95+, and Xcode command line tools.{" "}
            <a
              href="https://github.com/Youssef2430/clui#run-locally"
              target="_blank"
              rel="noreferrer"
            >
              Setup guide <Icon name="arrow-up-right" size={12} />
            </a>
          </p>
          <p>
            Sign in to at least one agent CLI before your first prompt. GLUI
            uses your existing authentication.
          </p>
        </div>
      </div>
    </section>
  );
}
