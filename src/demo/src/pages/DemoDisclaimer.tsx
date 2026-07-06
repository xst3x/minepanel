import '../styles/pages/DemoDisclaimer.css';

export default function DemoDisclaimer() {
  return (
    <div className="disclaimer-page">
      <div className="disclaimer-card">
        <div className="disclaimer-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>

        <h1 className="disclaimer-title">Demo Disclaimer</h1>

        <div className="disclaimer-body">
          <p className="disclaimer-intro">
            This is a <strong>demo version</strong> of MinePanel — a frontend-only showcase designed to demonstrate
            the interface, design, and overall functionality of the panel.
          </p>

          <div className="disclaimer-notice">
            <h3>⚠️ Important Information</h3>

            <h4>Backend errors are expected</h4>
            <p>This demo does not include a real backend. API requests may fail, return mock responses, or behave unexpectedly. This is completely normal.</p>

            <h4>All displayed data is simulated</h4>
            <p>Servers, users, files, backups, console logs, statistics, plugins, and all other content shown in the panel are generated mock data created purely for demonstration purposes.</p>

            <h4>Actions are non-functional</h4>
            <p>Most actions shown in the interface do not perform any real operation.</p>
            <p>Examples include:</p>
            <ul>
              <li>Starting or stopping servers</li>
              <li>Sending terminal commands</li>
              <li>Editing configuration files</li>
              <li>Uploading files</li>
              <li>Creating backups</li>
              <li>Managing users</li>
              <li>Installing plugins</li>
            </ul>
            <p>These actions exist only to showcase the user interface.</p>

            <h4>Some features may be incomplete</h4>
            <p>Certain sections of the panel may be partially functional, intentionally restricted, or disabled entirely in the demo build.</p>
            <p>This demo focuses on presenting the overall product experience rather than providing a fully working hosting panel.</p>
          </div>

          <div className="disclaimer-full-version">
            <h3>🚀 Full Version</h3>
            <p>The complete version of MinePanel includes:</p>
            <ul>
              <li>Full backend infrastructure</li>
              <li>Database integration</li>
              <li>Real Minecraft server management</li>
              <li>Plugin installation system</li>
              <li>File manager</li>
              <li>Authentication and permissions</li>
              <li>Discord integration</li>
              <li>All production features</li>
            </ul>
            <p>You can download the full version here:</p>
            <a
              href="https://github.com/xst3x/minepanel"
              target="_blank"
              rel="noopener noreferrer"
              className="disclaimer-link"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
              </svg>
              https://github.com/xst3x/minepanel
            </a>
          </div>
        </div>
      </div>

      <div className="disclaimer-footer-note">
        <p>
          Thank you for checking out MinePanel! If you like what you see, consider starring the repository on GitHub.
        </p>
      </div>
    </div>
  );
}
