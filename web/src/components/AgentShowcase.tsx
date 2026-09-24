"use client";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";
import { ProviderIcon } from "./ProviderIcon";
import { Icon } from "./Icon";
const agents = [
  {
    id: "claude",
    name: "Claude Code",
    reply:
      "A little warmth. A little clarity. I’ve refined the spacing and softened the details so everything feels more at home.",
  },
  {
    id: "codex",
    name: "Codex",
    reply:
      "A clearer canvas for your ideas. I’ve brought the pieces together with a lighter layout and a little room to breathe.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    reply:
      "Same project, a fresh perspective. I’ve carried the context forward and polished the details, right down to the last pixel.",
  },
] as const;
export default function AgentShowcase() {
  const [agent, setAgent] = useState<(typeof agents)[number]>(agents[1]);
  const [expanded, setExpanded] = useState(true);
  const [settings, setSettings] = useState(false);
  const [surface, setSurface] = useState("Liquid Glass");
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settings) return;
    const close = (event: PointerEvent) => {
      if (
        !settingsRef.current?.contains(event.target as Node) &&
        !settingsButtonRef.current?.contains(event.target as Node)
      )
        setSettings(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettings(false);
        settingsButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [settings]);
  return (
    <div
      className={`product-stage${expanded ? "" : " is-collapsed"}`}
      data-surface={surface}
    >
      <div
        className="preview-window"
        aria-label="Interactive GLUI design preview"
      >
        <div className="demo-thread glass-panel" hidden={!expanded}>
          <div className="demo-toolbar">
            <div className="demo-thread-title">
              <LogoMark />
              <span>A little more clarity</span>
              <span className="demo-tag">Preview</span>
            </div>
            <div className="demo-window-actions">
              <a
                className="demo-icon"
                href="https://github.com/Youssef2430/glui#conversations"
                aria-label="Learn about opening sessions in your CLI"
                title="Open in CLI — available in the app"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="terminal" size={15} />
              </a>
              <button
                className="demo-icon"
                onClick={() => {
                  setExpanded(false);
                  setSettings(false);
                }}
                aria-label="Collapse preview"
              >
                <Icon name="minus" size={16} />
              </button>
            </div>
          </div>
          <div className="demo-conversation" aria-live="polite">
            <div className="demo-user">
              Let’s make this feel a little more like us.
            </div>
            <div className="demo-agent-label">
              <ProviderIcon provider={agent.id} size={17} />
              <span>{agent.name}</span>
              <span className="demo-agent-status">Done</span>
            </div>
            <p className="demo-response" key={agent.id}>
              {agent.reply}
            </p>
            <div className="demo-tool">
              <span className="tool-check">
                <Icon name="check" size={12} />
              </span>
              <span>Updated 3 files</span>
              <span className="demo-diff">
                +48 <span>−12</span>
              </span>
            </div>
          </div>
          <div className="demo-context">
            <span>
              <Icon name="folder" size={13} /> your-next-idea
            </span>
            <span>
              Local workspace <span className="status-dot" />
            </span>
          </div>
        </div>
        <div className="demo-composer glass-panel">
          <button
            className="demo-icon composer-expand"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse preview" : "Expand preview"}
            aria-expanded={expanded}
          >
            <Icon name={expanded ? "minus" : "plus"} size={19} />
          </button>
          <button className="composer-prompt" onClick={() => setExpanded(true)}>
            What should we build next?
          </button>
          <button
            ref={settingsButtonRef}
            className={`demo-icon settings-button${settings ? " active" : ""}`}
            aria-label="Preview appearance settings"
            aria-expanded={settings}
            aria-controls="preview-settings"
            onClick={() => setSettings(!settings)}
          >
            <Icon name="sliders" size={18} />
          </button>
          <span className="composer-send" aria-hidden="true">
            <Icon name="arrow-up" size={19} />
          </span>
        </div>
        {settings && (
          <div
            ref={settingsRef}
            className="demo-settings"
            id="preview-settings"
          >
            <div className="demo-settings-title">
              Appearance{" "}
              <button
                className="demo-icon"
                onClick={() => {
                  setSettings(false);
                  settingsButtonRef.current?.focus();
                }}
                aria-label="Close appearance settings"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            <p>Make this little space yours.</p>
            <div
              className="appearance-options"
              role="group"
              aria-label="Preview material"
            >
              {["Liquid Glass", "Burgundy", "Tidal"].map((name) => (
                <button
                  key={name}
                  onClick={() => setSurface(name)}
                  aria-pressed={surface === name}
                >
                  <span
                    className={`appearance-swatch appearance-${name.split(" ")[0].toLowerCase()}`}
                  />
                  {name}
                  {surface === name && <Icon name="check" size={14} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="demo-controls">
        <div
          className="agent-switcher"
          role="group"
          aria-label="Choose an agent to preview"
        >
          {agents.map((item) => (
            <button
              key={item.id}
              aria-pressed={agent.id === item.id}
              onClick={() => {
                setAgent(item);
                setExpanded(true);
              }}
            >
              <ProviderIcon provider={item.id} size={16} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <p>
          Take a look around. <span>Try an agent, or fold it away.</span>
        </p>
      </div>
    </div>
  );
}
