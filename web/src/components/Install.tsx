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
        <a className="button-primary" href="/download?arch=arm64">
          <Icon name="apple" size={18} /> Download for Apple Silicon{" "}
          <Icon name="arrow-down" size={16} />
        </a>
        <a className="intel-download" href="/download?arch=x64">
          Intel support is deprecated.{" "}
          <span>
            Get legacy Clui v0.1.17 <Icon name="arrow-right" size={13} />
          </span>
        </a>
        <span className="install-note">macOS 13+ · Free & open source</span>
        <p className="install-note">
          Upgrading from Clui on Apple Silicon? Quit Clui and install GLUI from
          the DMG once. Your preferences are preserved; future updates are automatic.
        </p>
      </div>
      <div className="source-install">
        <div className="source-header">
          <span className="terminal-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="source-title">
            <Icon name="terminal" size={13} /> clui — zsh
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
        <pre tabIndex={0} aria-label="Terminal example: build GLUI from source">
          <code>
            <span className="shell-comment"># Make yourself at home.</span>
            {commands.split("\n").map((line, i) => (
              <span className="code-line" key={line}>
                <span className="shell-command">
                  <span className="shell-prompt" aria-hidden="true">
                    {i < 2 ? "~" : "clui"} <span>%</span>
                  </span>{" "}
                  <span>
                    <span className="shell-executable">
                      {line.split(" ")[0]}
                    </span>
                    {line.slice(line.indexOf(" "))}
                  </span>
                </span>
                {i === 0 && (
                  <span className="shell-output">
                    Cloning into &apos;clui&apos;…
                  </span>
                )}
                {i === 2 && (
                  <span className="shell-output">
                    {
                      "> electron-builder install-app-deps && bash scripts/patch-dev-icon.sh"
                    }
                  </span>
                )}
                {i === 3 && (
                  <span className="shell-output">
                    {"> node scripts/workspace.mjs install"}
                  </span>
                )}
                {i === 4 && (
                  <span className="shell-output shell-running">
                    {"> npm run build:workspace && npm run dev:overlay"}
                    <span className="shell-cursor" aria-hidden="true" />
                  </span>
                )}
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
          <h3>Prefer to build it yourself?</h3>
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
