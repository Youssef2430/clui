import Logo from "./Logo";
import { Icon } from "./Icon";
export default function Footer() {
  return (
    <footer className="footer content-width">
      <div className="footer-brand">
        <a href="#main" aria-label="GLUI home">
          <Logo />
        </a>
        <span>A little glue for your next big idea.</span>
      </div>
      <div className="footer-bottom">
        <p>
          © 2026 GLUI <span>·</span> Made for macOS <span>·</span> Open source,
          MIT.
        </p>
        <div>
          {["GitHub", "Releases", "Issues"].map((label, i) => (
            <a
              key={label}
              href={`https://github.com/Youssef2430/clui${["", "/releases", "/issues"][i]}`}
              target="_blank"
              rel="noreferrer"
            >
              {label} <Icon name="arrow-up-right" size={12} />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
