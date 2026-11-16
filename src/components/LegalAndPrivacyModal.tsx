import { Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { LegalDocTab } from '../utils/legalRoutes';

export type { LegalDocTab };

interface LegalAndPrivacyModalProps {
  activeTab: LegalDocTab | null;
  onSelectTab: (tab: LegalDocTab) => void;
  onClose: () => void;
}

const EFFECTIVE_DATE = 'November 15, 2026';

export function LegalAndPrivacyModal({
  activeTab,
  onSelectTab,
  onClose,
}: LegalAndPrivacyModalProps) {
  if (!activeTab) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={
        activeTab === 'privacy'
          ? 'Privacy-First Policy'
          : 'Terms of Use and Release of Liability'
      }
    >
      <div
        className="modal-card legal-modal-card"
        id="legal-privacy-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {activeTab === 'privacy'
                ? 'Privacy-First Policy · 100% Local Data'
                : 'Terms of Use & Release of Liability'}
            </h2>
            <p className="modal-subtitle">
              Just Believe Fitness (JBF) · Effective {EFFECTIVE_DATE}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            id="close-legal-modal"
            onClick={onClose}
          >
            <X size={16} /> Back to Studio
          </button>
        </div>

        {/* Tab Switcher between Privacy Policy & Terms / Liability Release */}
        <div className="legal-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            id="legal-tab-privacy"
            aria-selected={activeTab === 'privacy'}
            className={`legal-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => onSelectTab('privacy')}
          >
            <Lock size={15} /> Privacy-First Policy
          </button>
          <button
            type="button"
            role="tab"
            id="legal-tab-terms"
            aria-selected={activeTab === 'terms'}
            className={`legal-tab-btn ${activeTab === 'terms' ? 'active' : ''}`}
            onClick={() => onSelectTab('terms')}
          >
            <ShieldAlert size={15} /> Terms &amp; Liability Release
          </button>
        </div>

        {activeTab === 'privacy' ? (
          <div className="legal-doc-body" id="privacy-policy-content">
            <div className="legal-highlight-box">
              <div className="legal-highlight-title">
                <ShieldCheck size={18} color="#12B981" />
                <span>Our Core Promise: No Accounts. No Tracking. No Paywalls. Just Be Fit.</span>
              </div>
              <p>
                You shouldn&apos;t have to hand over your personal identity, biometric health data,
                or a monthly subscription fee just to ride your own indoor bike.{' '}
                <strong>Just Believe Fitness does not operate a user database</strong> — we do not
                collect, store, sell, or monetize your personal data or workouts.
              </p>
            </div>

            <section className="legal-section">
              <h3>1. 100% Local-First Storage (On Your Device Only)</h3>
              <p>
                By default, everything you do in Just Believe Fitness stays strictly inside your own
                web browser on your phone, tablet, or computer:
              </p>
              <ul>
                <li>
                  <strong>Athlete Stats &amp; Preferences:</strong> Your display name, height,
                  weight, FTP, heart rate zones, gauge layout preference, and saved YouTube links
                  are stored locally in your browser&apos;s <code>localStorage</code>.
                </li>
                <li>
                  <strong>Saved Workouts:</strong> Your recorded power, cadence, resistance, heart
                  rate streams, and ride notes are saved locally in your browser&apos;s{' '}
                  <code>IndexedDB</code> database. Clearing your browser site data or clicking the
                  delete icon permanently removes them from your device.
                </li>
                <li>
                  <strong>Post-Ride Camera &amp; Stat Photos:</strong> When you take a photo or pick
                  an image from your gallery in the Photo Studio, the image is composited locally on
                  an HTML5 <code>&lt;canvas&gt;</code> on your device. Your photos are never
                  uploaded to any Just Believe Fitness server.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h3>2. Direct Bluetooth Sensor Connections</h3>
              <p>
                Just Believe Fitness uses your browser&apos;s native{' '}
                <strong>Web Bluetooth API</strong> to communicate directly between your device and
                your Echelon EX-3 bike or Bluetooth heart rate monitor. Live sensor telemetry is
                processed in memory on your device and is never streamed to us.
              </p>
            </section>

            <section className="legal-section">
              <h3>3. Optional Third-Party Integrations (Only When You Opt In)</h3>
              <p>
                Your workout data only leaves your device if you explicitly choose to use an
                optional integration:
              </p>
              <ul>
                <li>
                  <strong>Strava &amp; Garmin Connect Sync:</strong> If you connect your Strava or
                  Garmin Connect account, OAuth session tokens are stored only in your own
                  browser&apos;s <code>localStorage</code>. Our stateless Netlify pass-through
                  functions relay token exchange and <code>.TCX</code> workout uploads directly to
                  Strava or Garmin over HTTPS and{' '}
                  <strong>never store passwords, tokens, or workout files in any database</strong>.
                </li>
                <li>
                  <strong>YouTube Video Deck:</strong> Opening the optional YouTube player loads
                  standard YouTube embeds directly from Google/YouTube, which are governed by
                  Google&apos;s Privacy Policy when active.
                </li>
                <li>
                  <strong>Static Hosting:</strong> This web app is hosted as static assets on
                  Netlify, which processes standard anonymous HTTP network requests to deliver the
                  site over HTTPS.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h3>4. Full Data Portability &amp; Control</h3>
              <p>
                Your fitness data belongs to you. You can export any saved workout as an open
                standard <code>.TCX</code> file, disconnect Strava or Garmin at any time, or delete
                individual rides and local browser storage whenever you choose.
              </p>
            </section>
          </div>
        ) : (
          <div className="legal-doc-body" id="terms-liability-content">
            <div className="legal-highlight-box legal-warning-box">
              <div className="legal-highlight-title">
                <ShieldAlert size={18} color="#F97316" />
                <span>Important Health, Safety &amp; Release of Liability Notice</span>
              </div>
              <p>
                Indoor cycling and interval training involve vigorous cardiovascular and muscular
                exertion. By using Just Believe Fitness, you acknowledge that you participate
                voluntarily at your own risk and agree to the Medical Disclaimer and Release of
                Liability below.
              </p>
            </div>

            <section className="legal-section">
              <h3>1. Medical Disclaimer &amp; Safe Intensity Pacing</h3>
              <ul>
                <li>
                  <strong>Not Medical Advice:</strong> Just Believe Fitness is a free fitness
                  telemetry display and workout timer — it does not provide medical advice, clinical
                  monitoring, diagnosis, or treatment.
                </li>
                <li>
                  <strong>Consult a Physician:</strong> Consult a qualified healthcare professional
                  before starting or modifying any vigorous exercise program, especially if you have
                  a history of heart conditions, high blood pressure, dizziness, joint issues, or
                  other medical concerns.
                </li>
                <li>
                  <strong>Listen to Your Body &amp; Calibrate Your Zones:</strong> Starter defaults
                  (150W FTP, 180 BPM Max HR) and workout coaching cues are general recreational
                  estimates only. Never force yourself to match suggested wattages, cadences,
                  resistances, or heart rate zones.{' '}
                  <strong>
                    Stop exercising immediately if you feel faint, dizzy, lightheaded, nauseous, or
                    experience chest pain or unusual shortness of breath.
                  </strong>
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h3>2. Assumption of Risk &amp; Release of Liability</h3>
              <p>
                To the fullest extent permitted by applicable law, by accessing or using Just
                Believe Fitness:
              </p>
              <ul>
                <li>
                  <strong>Voluntary Assumption of Risk:</strong> You expressly understand and assume
                  all risks associated with indoor cycling and physical exercise, including but not
                  limited to overexertion, cardiovascular events, muscle strains, falls, equipment
                  malfunction, or inaccurate Bluetooth / power / heart rate readings.
                </li>
                <li>
                  <strong>Equipment Responsibility:</strong> You are solely responsible for
                  inspecting, setting up, and maintaining your exercise bike, pedals, footwear,
                  flooring, ventilation, and hydration prior to every ride.
                </li>
                <li>
                  <strong>Release &amp; Waiver:</strong> You hereby release, waive, discharge, and
                  hold harmless Just Believe Fitness, its creator(s), contributors, and open-source
                  authors from any and all claims, liabilities, demands, injuries, damages, or
                  losses (including personal injury, health complications, or property/equipment
                  damage) arising out of or connected with your use of this software or any workout
                  performed with it.
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h3>3. &ldquo;As-Is&rdquo; Free Software Disclaimer</h3>
              <p>
                Just Believe Fitness is provided free of charge, <strong>&ldquo;AS IS&rdquo;</strong>{' '}
                and <strong>&ldquo;AS AVAILABLE,&rdquo;</strong> without warranties of any kind,
                express or implied, including fitness for a particular purpose, accuracy of power
                curve or calorie estimates, uninterrupted Bluetooth connectivity, or compatibility
                with future firmware or third-party API changes.
              </p>
            </section>

            <section className="legal-section">
              <h3>4. Independent Project &amp; Third-Party Trademarks</h3>
              <p>
                Just Believe Fitness is an independent, rider-built web application and is not
                affiliated with, endorsed by, or sponsored by Echelon Fitness, Garmin Ltd., Strava
                Inc., Polar Electro, Wahoo Fitness, Google/YouTube, or any other hardware or
                platform vendor. All product and company names are trademarks of their respective
                holders and are referenced solely to describe user-owned sensor or export
                interoperability.
              </p>
            </section>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
            paddingTop: '4px',
          }}
        >
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Direct links: <code>/privacy</code> · <code>/terms</code>
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            id="legal-done-btn"
            onClick={onClose}
          >
            Back to Studio
          </button>
        </div>
      </div>
    </div>
  );
}
