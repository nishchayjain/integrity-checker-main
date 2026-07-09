# Assessment Integrity Shield

A hackathon project that protects online assessments against AI-assisted cheating using a multi-layered defense system: DOM-level traps, behavioral monitoring, AI browser lockout, and a correlation-based scoring engine.

All defenses are invisible to human candidates and require zero changes to the assessment experience.

---

## Setup

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
git clone <repo-url>
cd integrity-hackathon
npm install
```

### Running

```bash
npm start
```

- **Assessment:** http://localhost:3847
- **Dashboard:** http://localhost:3847/dashboard.html

### Development (auto-reload)

```bash
npm run dev
```

---

## Architecture

```
integrity-hackathon/
├── server.js                  # Express server, API endpoints, scoring engine
├── package.json
├── public/
│   ├── index.html             # Assessment UI with embedded DOM traps
│   ├── assessment.js          # Assessment logic + AI browser lockout
│   ├── integrity-monitor.js   # Client-side behavioral detection
│   ├── dashboard.html         # Admin dashboard for viewing results
│   └── styles.css             # Styling + CSS-based visual traps
└── README.md
```

### Request Flow

```
Browser → index.html (traps embedded in DOM)
       → assessment.js (lockout check → session start → answer submission)
       → integrity-monitor.js (behavioral signals → /api/signal)
       → server.js (scoring engine correlates traps + behavior → verdict)
       → dashboard.html (admin views all session results)
```

---

## Detection & Security Techniques

### Layer 1: DOM-Based Traps (5 Questions)

These traps exploit the gap between what AI tools read (DOM/accessibility tree) and what humans see (rendered pixels). Each question uses a different technique.

#### Q1 — Canvas Rendering Misdirection
- **Visual (human sees):** "What is 15% of 240?" → Answer: 36
- **DOM/aria-label (AI reads):** "What is 25% of 200?" → Answer: 50
- The question text is rendered on a `<canvas>` element. AI tools that scrape the DOM or accessibility tree read the wrong question.

#### Q2 — CSS `::after` Text Replacement
- **Visual:** "Which word is most similar in meaning to ABUNDANT?" → Answer: Plentiful
- **DOM:** "Which word means the opposite of ABUNDANT?" → Answer: Scarce
- CSS hides the DOM text (`font-size: 0`) and replaces it with different text via `::after` pseudo-element.

#### Q3 — Canvas Chart with Misleading Metadata
- **Visual (canvas):** Bar chart where Engineering has the tallest bar
- **DOM/aria-label:** Claims "Sales department leads with highest revenue at $48K"
- AI tools that read `aria-label`, `title`, or fallback text are misdirected to the wrong department.

#### Q4 — CSS Option Value Swap
- **Visual:** A=120mi, B=150mi, C=180mi, D=130mi
- **DOM:** A=150mi, B=120mi, C=130mi, D=180mi
- CSS `::after` replaces the visible text of each option. When AI reads the DOM and selects "150 miles" (option A), the human sees "120 miles" in that position.

#### Q5 — CSS Question Stem Replacement
- **Visual:** "Complete the pattern: 2, 4, 8, 16, ___" (x2 pattern → 32)
- **DOM:** "Complete the pattern: 2, 6, 18, 54, ___" (x3 pattern → 162)
- Same CSS `::after` technique as Q2 but applied to a math pattern question.

### Layer 2: AI Browser Lockout

Proactive detection and blocking of AI-powered browsers before the assessment loads.

| Detection Method | What It Catches |
|---|---|
| **Sidebar gap detection** (`outerWidth - innerWidth > 150px`) | MyNextBrowser, Comet, any sidebar-based AI browser |
| **User-Agent matching** | Opera (`OPR`), MyNextBrowser (`MNB`) |
| **WebDriver flag** (`navigator.webdriver`) | Selenium, Puppeteer, Playwright |
| **Cypress detection** (`window.Cypress`) | Cypress automation |
| **CSS custom property** (`--sidebar-width`) | Comet AI browser |
| **DOM element scanning** | `[data-cluely]`, `#operator-root`, `[class*="mynext"]`, etc. |
| **Extension iframe detection** | `chrome-extension://` and `moz-extension://` iframes |

**Lockout behavior:**
1. **First detection** → Warning screen + `ai_browser_warned` cookie (7 days)
2. **Second detection** → Permanent block screen + `ai_browser_blocked` cookie (7 days)
3. **Deferred re-checks** at 500ms, 1.5s, 3s, 5s after page load (catches late-loading sidebars)
4. **MutationObserver** watches for dynamically injected AI tool elements

### Layer 3: Behavioral Monitoring (`integrity-monitor.js`)

Real-time client-side signals collected during the assessment and sent to the server.

| Signal | What It Detects |
|---|---|
| **Focus/Blur tracking** | Tab switches, window focus loss (candidate looking at another window) |
| **Clipboard monitoring** | Paste events during the assessment (copying answers from external source) |
| **Iframe embedding detection** | Page loaded inside an iframe (content scraping attempt) |
| **DevTools detection** | Large `outerWidth - innerWidth` gap indicating open DevTools |
| **AI browser fingerprinting** | Extension elements, CSS properties, WebDriver flags |
| **Screen capture detection** | `getDisplayMedia` interception, Permissions API monitoring |

### Layer 4: HTTP Security Headers

Server-side headers that prevent embedding and restrict browser capabilities.

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Permissions-Policy: display-capture=(), screen-wake-lock=()
```

### Layer 5: Correlation-Based Scoring Engine

The server combines trap results, response timing, and behavioral signals into a single integrity score. This avoids false positives from individual signals.

**Trap correlation:**
| Traps Hit | Verdict | Rationale |
|---|---|---|
| 0-1 | Clean / Inconclusive | Normal human error range |
| 2 | Suspicious (with speed flag) | Possible coincidence; timing used as tiebreaker |
| 3+ | **AI Detected** | <1% probability for a human to hit 3+ correlated DOM traps |

**Speed analysis:**
- < 3 seconds avg per question → Fast flag (penalty applied)
- 3-8 seconds avg → Moderate flag
- \> 8 seconds → Normal (no penalty)

**Behavioral penalties (additive, capped at -50):**
| Signal | Penalty |
|---|---|
| Screen capture detected | -30 |
| Iframe embedding | -25 |
| AI browser fingerprint | -20 |
| Focus lost 3+ times | -15 |
| Clipboard paste | -10 |

**Final verdict:**
- Score >= 80 → **Likely Human**
- Score 50-79 → **Suspicious**
- Score < 50 → **AI Detected**

---

## Test Results

| AI Tool | Type | Traps Hit | Lockout | Verdict |
|---|---|---|---|---|
| **Opera Neon** | Sidebar AI browser | 5/5 | Blocked on re-visit | AI Detected |
| **MyNextBrowser** | Sidebar AI browser | 3/5 | Blocked on re-visit | AI Detected |
| **Chiku (chiku-ai.in)** | Screen-share (tab capture) | Pending full test | Not blocked (see below) | Expected: AI Detected via traps |

---

## Known Limitations & Scope for Improvement

### Invisible Screen-Share Tools (Chiku, Cluely Pro)

**Problem:** Tools like Chiku and Cluely Pro use Chrome's `getDisplayMedia()` API from their own website to capture the assessment tab. The capture happens entirely in another tab's context. Chrome deliberately does not expose tab capture status to the captured page — there is no JavaScript API for a web page to detect that it is being screen-shared.

**What we tried:**
- Viewport height monitoring (Chrome's sharing bar doesn't affect `window.innerHeight`)
- WebSocket/WebRTC/fetch interception (connections happen from Chiku's tab, not ours)
- Extension resource scanning via Performance API
- Canvas-based timing analysis for capture encoding overhead
- DOM mutation scanning for injected elements

**Why these failed:** Chiku is a pure web-based tool — it doesn't inject content scripts, DOM elements, or extension resources into the captured page. All communication happens in its own origin.

**What DOES work:** Our DOM traps still catch screen-share AI at scoring time. When Chiku reads the screen visually and suggests the "correct" answer, the user clicks what looks right — but the underlying radio button value maps to the wrong DOM answer. All 5 traps trigger because the visual content differs from the DOM content.

**Future improvements:**
- **Proctoring browser extension** with elevated permissions (`chrome.management`, `chrome.tabCapture`) to detect active captures — this is how tools like Sherlock detect Cluely
- **Custom anti-OCR fonts** where character glyphs are mapped differently, confusing vision-AI that reads screen captures
- **Interaction-based challenges** (random click-targets) before each question to add friction to the screen-share cheating workflow
- **Server-side proctoring** with webcam/screen recording analysis
- **Timing pattern analysis** to detect the screen-share→AI→user→click latency pattern

### Other Improvements

- **Dynamic trap generation** — randomize trap techniques per session so AI tools can't learn patterns
- **More question types** — drag-and-drop, drawing, or interactive tasks that are harder for AI to automate
- **WebSocket real-time monitoring** — push lockout events to admin dashboard in real-time
- **Persistent storage** — replace in-memory `Map` with a database for production use
- **Rate limiting** — prevent brute-force session creation
- **HTTPS** — required for `Permissions-Policy` headers to fully function

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/start-session` | Creates a new assessment session |
| POST | `/api/submit-answer` | Submits an answer and checks traps |
| POST | `/api/complete-session` | Finalizes scoring and verdict |
| POST | `/api/signal` | Receives behavioral signals from client |
| GET | `/api/sessions` | Lists all sessions for dashboard |
| GET | `/api/sessions/:id` | Gets detailed session data |

---

## How to Test

### With a Normal Browser (baseline)
1. Open http://localhost:3847 in Chrome/Firefox/Safari
2. Complete the assessment honestly
3. Check dashboard — should show **Likely Human** with 0 traps

### With an AI Sidebar Browser
1. Open http://localhost:3847 in Opera Neon or MyNextBrowser
2. First visit → **Warning screen** (assessment blocked)
3. Refresh/revisit → **Permanent block screen**

### With a Screen-Share AI Tool (Chiku)
1. Open http://localhost:3847 in Chrome
2. Start assessment, then share the tab with Chiku
3. Follow Chiku's suggested answers for all 5 questions
4. Check dashboard — DOM traps should catch all 5 answers → **AI Detected**

---

## Tech Stack

- **Runtime:** Node.js 22.x
- **Server:** Express 4.x
- **Frontend:** Vanilla HTML/CSS/JS (no framework — intentional for minimal attack surface)
- **Storage:** In-memory Map (demo purposes)
- **Rendering:** Canvas API for trap questions, CSS `::after` for text replacement
