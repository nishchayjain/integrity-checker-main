/**
 * Integrity Monitor — Client-side behavioral detection
 * Detects: screen capture, iframe embedding, AI browsers, focus/blur, clipboard,
 *          DOM mutations, shadow DOM injections, prototype tampering, right-click,
 *          keyboard shortcuts, tab switching patterns
 * Sends signals to /api/signal endpoint for server-side scoring
 */
(function () {
  "use strict";

  let _sessionId = null;
  const _signalQueue = [];
  let _flushTimer = null;

  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3847'
    : 'https://integrity-checker-main.onrender.com';
  let _mutationObserver = null;
  let _focusLostCount = 0;
  const _seenSignals = new Set(); // deduplicate identical signals

  function init(sessionId) {
    _sessionId = sessionId;
    _focusLostCount = 0;

    // Consume early interceptor signals captured in <head> before this script loaded
    if (window.__integritySignals && window.__integritySignals.length > 0) {
      window.__integritySignals.forEach(function (sig) {
        _signalQueue.push({
          type: sig.type,
          detail: sig.detail || "",
          timestamp: new Date(sig.ts).toISOString(),
        });
      });
      window.__integritySignals = [];
    }

    // Continue monitoring for new interceptor signals periodically
    setInterval(function () {
      if (window.__integritySignals && window.__integritySignals.length > 0) {
        window.__integritySignals.forEach(function (sig) {
          _signalQueue.push({
            type: sig.type,
            detail: sig.detail || "",
            timestamp: new Date(sig.ts).toISOString(),
          });
        });
        window.__integritySignals = [];
      }
    }, 2000);

    detectIframe();
    detectAiBrowser();
    detectScreenCapture();
    monitorFocus();
    monitorClipboard();
    monitorDevTools();
    monitorDOMMutations();
    monitorKeyboardShortcuts();
    monitorRightClick();
    monitorPrototypeTamper();
    scanShadowDOM();
    monitorWindowProperties();
    monitorMouseTrajectory();
    monitorFocusMicroPatterns();
    _flushTimer = setInterval(flushSignals, 3000);
  }

  function addSignal(type, detail) {
    // Deduplicate repeated identical signals
    var key = type + "::" + (detail || "");
    if (_seenSignals.has(key)) return;
    _seenSignals.add(key);
    _signalQueue.push({
      type: type,
      detail: detail || "",
      timestamp: new Date().toISOString(),
    });
  }

  // Allow duplicate signals for things like focus_lost which recur
  function addRecurringSignal(type, detail) {
    _signalQueue.push({
      type: type,
      detail: detail || "",
      timestamp: new Date().toISOString(),
    });
  }

  async function flushSignals() {
    if (!_sessionId || _signalQueue.length === 0) return;
    var batch = _signalQueue.splice(0, _signalQueue.length);
    try {
      await fetch(API_BASE_URL + "/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: _sessionId, signals: batch }),
      });
    } catch (e) {
      // Put back failed signals
      for (var i = batch.length - 1; i >= 0; i--) {
        _signalQueue.unshift(batch[i]);
      }
    }
  }

  // --- DETECTION 1: Iframe embedding ---
  function detectIframe() {
    try {
      if (window.self !== window.top) {
        addSignal("iframe_detected", "Page is loaded inside an iframe");
      }
    } catch (e) {
      addSignal(
        "iframe_detected",
        "Cross-origin iframe detected (access denied)",
      );
    }
  }

  // --- DETECTION 2: AI browser fingerprinting (comprehensive) ---
  function detectAiBrowser() {
    var ua = navigator.userAgent || "";

    // Comprehensive UA pattern matching
    var uaChecks = [
      { pattern: /OPR.*Neon/i, name: "Opera Neon" },
      { pattern: /OPR/i, name: "Opera (AI Features)" },
      { pattern: /Opera/i, name: "Opera (AI Features)" },
      { pattern: /ArcBrowser/i, name: "Arc Browser" },
      { pattern: /Comet/i, name: "Comet AI Browser" },
      { pattern: /YaBrowser/i, name: "Yandex Browser (Alice AI)" },
      { pattern: /Vivaldi/i, name: "Vivaldi (AI Features)" },
      { pattern: /HeadlessChrome/i, name: "Headless Chrome (Bot)" },
      { pattern: /PhantomJS/i, name: "PhantomJS (Bot)" },
    ];
    for (var i = 0; i < uaChecks.length; i++) {
      if (uaChecks[i].pattern.test(ua)) {
        addSignal("ai_browser_detected", uaChecks[i].name);
        break;
      }
    }

    // WebDriver detection (Selenium, Puppeteer, Playwright)
    if (navigator.webdriver) {
      addSignal(
        "ai_browser_detected",
        "WebDriver detected (automated browser)",
      );
    }

    // Automation framework globals
    if (window.Cypress) addSignal("ai_browser_detected", "Cypress detected");
    if (window.__nightmare)
      addSignal("ai_browser_detected", "Nightmare.js detected");
    if (window.callPhantom || window._phantom)
      addSignal("ai_browser_detected", "PhantomJS detected");

    // Sidebar gap detection (AI sidebars shrink viewport)
    var sidebarGap = window.outerWidth - window.innerWidth;
    if (sidebarGap > 150) {
      addSignal(
        "ai_browser_detected",
        "AI Sidebar detected (viewport gap: " + sidebarGap + "px)",
      );
    }

    // CSS custom property detection (Comet, Copilot)
    try {
      var computedStyles = window.getComputedStyle(document.documentElement);
      if (computedStyles.getPropertyValue("--sidebar-width") !== "") {
        addSignal(
          "ai_browser_detected",
          "Comet AI browser (sidebar CSS detected)",
        );
      }
      if (computedStyles.getPropertyValue("--copilot-width") !== "") {
        addSignal("ai_browser_detected", "Copilot sidebar (CSS detected)");
      }
    } catch (e) {
      /* ignore */
    }

    // Comprehensive AI tool DOM element scanning (delayed for injection)
    var aiSelectors = [
      "[data-cluely]",
      "[data-operator]",
      "[data-claude]",
      "[data-grammarly]",
      "#cluely-root",
      "#operator-root",
      "#claude-sidebar",
      '[class*="mynext"]',
      '[id*="mynext"]',
      '[class*="copilot"]',
      '[id*="copilot-sidebar"]',
      '[class*="perplexity"]',
      '[id*="perplexity"]',
      'iframe[src*="cluely"]',
      'iframe[src*="operator"]',
      'iframe[src*="chatgpt"]',
      'iframe[src*="claude"]',
      '[data-testid*="ai-"]',
      '[data-testid*="copilot"]',
    ];

    function scanForAIElements() {
      for (var j = 0; j < aiSelectors.length; j++) {
        try {
          if (document.querySelector(aiSelectors[j])) {
            addSignal(
              "ai_browser_detected",
              "AI tool element found: " + aiSelectors[j],
            );
          }
        } catch (e) {
          /* ignore invalid selectors */
        }
      }
    }

    // Scan multiple times as extensions inject asynchronously
    setTimeout(scanForAIElements, 1000);
    setTimeout(scanForAIElements, 3000);
    setTimeout(scanForAIElements, 6000);
  }

  // --- DETECTION 3: Screen capture / screen sharing ---
  function detectScreenCapture() {
    var _screenCaptureDetected = false;

    function flagCapture(detail) {
      if (!_screenCaptureDetected) {
        _screenCaptureDetected = true;
        addSignal("screen_capture_detected", detail);
        triggerScreenShareLockout(detail);
      }
    }

    // ---- METHOD A: Viewport height monitoring ---- DISABLED
    // Too many false positives from browser UI changes, scrollbars, proxy preview.
    // Chrome's tab-sharing bar detection is not reliable via viewport alone.

    // ---- METHOD B: Visual Viewport API ---- DISABLED
    // Same false-positive issues as Method A.

    // ---- METHOD C: getDisplayMedia interception ----
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      var origGDM = navigator.mediaDevices.getDisplayMedia;
      navigator.mediaDevices.getDisplayMedia = function () {
        flagCapture("getDisplayMedia called from page context");
        return origGDM.apply(this, arguments);
      };
    }

    // ---- METHOD D: Permissions API ----
    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions
          .query({ name: "display-capture" })
          .then(function (status) {
            if (status.state === "granted") {
              flagCapture("display-capture permission is granted");
            }
            status.addEventListener("change", function () {
              if (status.state === "granted") {
                flagCapture("display-capture permission changed to granted");
              }
            });
          })
          .catch(function () { });
      } catch (e) {
        /* ignore */
      }
    }

    // ---- METHOD E: Frame rate anomaly ---- DISABLED
    // This heuristic is fundamentally broken: avg 25-40ms = normal 30fps display.
    // It fires on every standard computer. Keeping code for reference only.
    // var lastTime = performance.now();
    // var frameTimes = [];
    // function checkFrameRate() { ... }
    // requestAnimationFrame(checkFrameRate);

    // ---- METHOD F: Extension iframe scanning ----
    setTimeout(function () {
      var iframes = document.querySelectorAll("iframe");
      for (var m = 0; m < iframes.length; m++) {
        try {
          var src = iframes[m].src || "";
          if (
            src.indexOf("chrome-extension://") === 0 ||
            src.indexOf("moz-extension://") === 0
          ) {
            addSignal(
              "ai_browser_detected",
              "Browser extension iframe: " + src.substring(0, 60),
            );
          }
        } catch (e) {
          /* cross-origin */
        }
      }
    }, 3000);
  }

  // When screen sharing is detected mid-assessment, show lockout
  function triggerScreenShareLockout(detail) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++)
      screens[i].classList.remove("active");

    var warningEl = document.getElementById("ai-warning");
    if (warningEl) {
      warningEl.classList.add("active");
      var detailEl = document.getElementById("ai-warning-detail");
      if (detailEl) detailEl.textContent = "Screen sharing detected: " + detail;
    }

    if (_sessionId) {
      fetch(API_BASE_URL + "/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: _sessionId,
          signals: [
            {
              type: "screen_capture_detected",
              detail: detail,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      }).catch(function () { });
    }
  }

  // When AI extension is detected mid-assessment, show lockout
  function triggerExtensionLockout(detail) {
    var screens = document.querySelectorAll(".screen");
    for (var i = 0; i < screens.length; i++)
      screens[i].classList.remove("active");

    var warningEl = document.getElementById("ai-warning");
    if (warningEl) {
      warningEl.classList.add("active");
      var detailEl = document.getElementById("ai-warning-detail");
      if (detailEl) detailEl.textContent = "AI Extension detected: " + detail;
    }

    if (_sessionId) {
      fetch(API_BASE_URL + "/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: _sessionId,
          signals: [
            {
              type: "ai_extension_lockout",
              detail: detail,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      }).catch(function () { });
    }
  }

  // --- DETECTION 4: Focus / Blur / Visibility ---
  function monitorFocus() {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        _focusLostCount++;
        addRecurringSignal(
          "focus_lost",
          "Tab became hidden (count: " + _focusLostCount + ")",
        );
      }
    });

    window.addEventListener("blur", function () {
      _focusLostCount++;
      addRecurringSignal(
        "focus_lost",
        "Window lost focus (count: " + _focusLostCount + ")",
      );
    });
  }

  // --- DETECTION 5: Clipboard ---
  function monitorClipboard() {
    document.addEventListener("paste", function (e) {
      var text = "";
      try {
        text = (e.clipboardData || window.clipboardData).getData("text") || "";
      } catch (err) {
        /* ignore */
      }
      addRecurringSignal(
        "clipboard_paste",
        "Paste event: " +
        text.substring(0, 50) +
        (text.length > 50 ? "..." : ""),
      );
    });

    document.addEventListener("copy", function () {
      addRecurringSignal("clipboard_copy", "Copy event detected");
    });
  }

  // --- DETECTION 6: DevTools open detection ---
  function monitorDevTools() {
    var threshold = 160;
    var devToolsDetected = false;
    var check = function () {
      var widthDiff = window.outerWidth - window.innerWidth > threshold;
      var heightDiff = window.outerHeight - window.innerHeight > threshold;
      if ((widthDiff || heightDiff) && !devToolsDetected) {
        devToolsDetected = true;
        addSignal("devtools_open", "DevTools appears to be open");
      } else if (!widthDiff && !heightDiff) {
        devToolsDetected = false;
      }
    };
    setInterval(check, 5000);
  }

  // --- DETECTION 7: DOM Mutation monitoring (from new-oda IntegrityDetector) ---
  function monitorDOMMutations() {
    // Watch for injected AI tool elements
    var aiPatterns =
      /cluely|operator|claude|copilot|perplexity|chatgpt|mynext|ai-assist|grammarly/i;

    _mutationObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        // Check added nodes
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (node.nodeType !== 1) continue; // Element nodes only

          var tag = node.tagName || "";
          var id = node.id || "";
          var cls = node.className || "";
          var src = "";

          // Check iframes
          if (tag === "IFRAME") {
            src = node.src || "";
            if (
              src.indexOf("chrome-extension://") === 0 ||
              src.indexOf("moz-extension://") === 0
            ) {
              addSignal(
                "extension_injected",
                "Extension iframe injected: " + src.substring(0, 60),
              );
              // Trigger lockout for extension iframes during assessment
              triggerExtensionLockout("Extension iframe: " + src.substring(0, 60));
            }
            if (aiPatterns.test(src)) {
              addSignal(
                "ai_tool_injected",
                "AI tool iframe injected: " + src.substring(0, 60),
              );
              // Trigger lockout for AI tool iframes during assessment
              triggerExtensionLockout("AI tool iframe: " + src.substring(0, 60));
            }
          }

          // Check for AI-related attributes
          var idStr = typeof id === "string" ? id : "";
          var clsStr = typeof cls === "string" ? cls : "";
          if (aiPatterns.test(idStr) || aiPatterns.test(clsStr)) {
            addSignal(
              "ai_tool_injected",
              "AI tool element injected: <" +
              tag +
              ' id="' +
              idStr +
              '" class="' +
              clsStr.substring(0, 40) +
              '">',
            );
            // Trigger lockout for AI tool elements during assessment
            triggerExtensionLockout("AI tool element: " + idStr + " " + clsStr.substring(0, 40));
          }

          // Check for shadow roots on injected elements
          if (node.shadowRoot) {
            try {
              var shadowHTML = node.shadowRoot.innerHTML || "";
              if (aiPatterns.test(shadowHTML)) {
                addSignal(
                  "ai_tool_injected",
                  "AI tool shadow DOM injected in <" + tag + ">",
                );
                // Trigger lockout for AI tool shadow DOM during assessment
                triggerExtensionLockout("AI tool in shadow DOM: <" + tag + ">");
              }
            } catch (e) {
              /* closed shadow root */
            }
          }
        }
      }
    });

    _mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // --- DETECTION 8: Keyboard shortcut monitoring ---
  function monitorKeyboardShortcuts() {
    document.addEventListener("keydown", function (e) {
      // Detect common AI assistant shortcuts
      var ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+I (DevTools)
      if (ctrl && e.shiftKey && e.key === "I") {
        addSignal("devtools_shortcut", "Ctrl+Shift+I pressed (DevTools)");
      }
      // Ctrl+Shift+J (Console)
      if (ctrl && e.shiftKey && e.key === "J") {
        addSignal("devtools_shortcut", "Ctrl+Shift+J pressed (Console)");
      }
      // F12 (DevTools)
      if (e.key === "F12") {
        addSignal("devtools_shortcut", "F12 pressed (DevTools)");
      }
      // Ctrl+U (View Source)
      if (ctrl && e.key === "u") {
        addSignal("view_source_shortcut", "Ctrl+U pressed (View Source)");
      }
    });
  }

  // --- DETECTION 9: Right-click / context menu ---
  function monitorRightClick() {
    document.addEventListener("contextmenu", function () {
      addRecurringSignal("right_click", "Context menu opened");
    });
  }

  // --- DETECTION 10: Prototype tamper detection (from new-oda IntegrityDetector) ---
  function monitorPrototypeTamper() {
    // Check if key native functions have been tampered with
    // (AI tools sometimes wrap fetch, XMLHttpRequest, etc.)
    var nativeFunctions = [
      {
        obj: window,
        name: "fetch",
        expected: "function fetch() { [native code] }",
      },
    ];

    setTimeout(function () {
      for (var i = 0; i < nativeFunctions.length; i++) {
        var fn = nativeFunctions[i];
        try {
          var current = fn.obj[fn.name];
          if (typeof current === "function") {
            var str = Function.prototype.toString.call(current);
            // Native functions contain "[native code]"
            if (str.indexOf("[native code]") === -1) {
              addSignal(
                "prototype_tamper",
                fn.name + " has been overridden (non-native)",
              );
            }
          }
        } catch (e) {
          /* ignore */
        }
      }
    }, 2000);
  }

  // --- DETECTION 11: Shadow DOM scanning (from new-oda IntegrityDetector) ---
  function scanShadowDOM() {
    var aiPatterns =
      /cluely|operator|claude|copilot|perplexity|chatgpt|ai-assist/i;

    function scan() {
      try {
        var allElements = document.querySelectorAll("*");
        for (var i = 0; i < allElements.length; i++) {
          var el = allElements[i];
          if (el.shadowRoot) {
            try {
              var shadowHTML = el.shadowRoot.innerHTML || "";
              if (aiPatterns.test(shadowHTML)) {
                addSignal(
                  "ai_tool_shadow_dom",
                  "AI tool detected in shadow DOM of <" + el.tagName + ">",
                );
              }
            } catch (e) {
              /* closed shadow root */
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    // Scan at multiple intervals as extensions inject asynchronously
    setTimeout(scan, 2000);
    setTimeout(scan, 5000);
    setTimeout(scan, 10000);
  }

  // --- DETECTION 12: Window property anomalies ---
  function monitorWindowProperties() {
    // Check for known AI tool globals
    var suspiciousGlobals = [
      "__CLUELY__",
      "__OPERATOR__",
      "__CLAUDE__",
      "__copilotState",
      "__aiAssistant",
    ];

    setTimeout(function () {
      for (var i = 0; i < suspiciousGlobals.length; i++) {
        if (window[suspiciousGlobals[i]] !== undefined) {
          addSignal(
            "ai_tool_global",
            "Suspicious global detected: window." + suspiciousGlobals[i],
          );
        }
      }

      // Check for excessive number of iframes (AI tools often inject multiple)
      var iframeCount = document.querySelectorAll("iframe").length;
      if (iframeCount > 3) {
        addSignal(
          "excessive_iframes",
          "Found " + iframeCount + " iframes (possible AI tool injection)",
        );
      }
    }, 3000);
  }

  // ================================================================
  // CLUELY / DESKTOP OVERLAY DETECTION (Strategies 13-15)
  // These detect screen-capture-based AI tools that operate as OS
  // overlays and never touch the browser DOM or JS environment.
  // ================================================================

  // --- DETECTION 13: Mouse trajectory for overlay interaction ---
  // Cluely's widget sits at the top of the viewport. When users click
  // the "Ask" button, the mouse exits the browser content area toward
  // the top, interacts briefly, then returns. We fingerprint this.
  function monitorMouseTrajectory() {
    var exitCount = 0;
    var topExitCount = 0;
    var lastExitTime = 0;
    var rapidReturnCount = 0;
    var topZoneStart = null;
    var topZoneAccum = 0;

    document.addEventListener("mouseleave", function (e) {
      exitCount++;
      lastExitTime = Date.now();
      // Mouse exited through the TOP of the viewport (toward overlay widget)
      if (e.clientY <= 10) {
        topExitCount++;
        if (topExitCount >= 2) {
          addSignal(
            "mouse_exit_top",
            "Mouse exited viewport through top edge " +
            topExitCount +
            " times (overlay tool pattern)",
          );
        }
      }
    });

    document.addEventListener("mouseenter", function () {
      if (lastExitTime > 0) {
        var gap = Date.now() - lastExitTime;
        // Rapid exit→return (< 5s) is characteristic of clicking an overlay
        if (gap > 100 && gap < 5000) {
          rapidReturnCount++;
          if (rapidReturnCount >= 2) {
            addSignal(
              "overlay_interaction",
              "Rapid mouse exit/return detected (" +
              rapidReturnCount +
              " cycles, last gap " +
              gap +
              "ms) — consistent with desktop overlay tool",
            );
          }
        }
      }
    });

    // Track cumulative time in top 60px zone (where Cluely widget sits)
    document.addEventListener("mousemove", function (e) {
      if (e.clientY <= 60) {
        if (!topZoneStart) topZoneStart = Date.now();
      } else {
        if (topZoneStart) {
          topZoneAccum += Date.now() - topZoneStart;
          topZoneStart = null;
        }
      }
    });

    setInterval(function () {
      if (topZoneStart) {
        topZoneAccum += Date.now() - topZoneStart;
        topZoneStart = Date.now();
      }
      if (topZoneAccum > 8000) {
        addSignal(
          "top_zone_hover",
          "Spent " +
          Math.round(topZoneAccum / 1000) +
          "s near top of viewport — possible overlay tool interaction zone",
        );
        topZoneAccum = 0;
      }
    }, 15000);
  }

  // --- DETECTION 14: Focus/blur micro-patterns (overlay clicks) ---
  // When a user clicks a desktop overlay like Cluely, the browser fires
  // blur then focus in quick succession (100ms–3s). Normal alt-tab is
  // longer. Multiple rapid cycles = strong overlay signal.
  function monitorFocusMicroPatterns() {
    var blurTs = [];
    var rapidCycles = 0;

    window.addEventListener("blur", function () {
      blurTs.push(Date.now());
    });

    window.addEventListener("focus", function () {
      var now = Date.now();
      if (blurTs.length > 0) {
        var lastBlur = blurTs[blurTs.length - 1];
        var gap = now - lastBlur;
        // Overlay interaction: blur→focus in 100ms–4s
        if (gap >= 80 && gap <= 4000) {
          rapidCycles++;
          if (rapidCycles >= 3) {
            addSignal(
              "rapid_focus_cycle",
              rapidCycles +
              " rapid blur/focus cycles (<4s each) — pattern matches desktop overlay tool interaction",
            );
          }
        }
      }
    });
  }

  // --- DETECTION 15: Per-question timing analysis ---
  // AI-assisted answering has a signature: consistent timing across
  // questions and suspiciously fast responses (question appears → pause
  // for AI to process screenshot → answer). We collect per-question
  // timings and analyze the statistical pattern.
  var _questionTimings = [];

  function recordQuestionTiming(questionId, responseTimeMs, selectedOption) {
    _questionTimings.push({
      questionId: questionId,
      responseTimeMs: responseTimeMs,
      selectedOption: selectedOption,
      timestamp: Date.now(),
    });

    // After 3+ questions, analyze the pattern
    if (_questionTimings.length >= 3) {
      analyzeTimingPattern();
    }
  }

  function analyzeTimingPattern() {
    var times = [];
    for (var i = 0; i < _questionTimings.length; i++) {
      times.push(_questionTimings[i].responseTimeMs);
    }
    var sum = 0;
    for (var j = 0; j < times.length; j++) sum += times[j];
    var avg = sum / times.length;

    // Coefficient of variation (stdDev / mean)
    var variance = 0;
    for (var k = 0; k < times.length; k++) {
      variance += Math.pow(times[k] - avg, 2);
    }
    variance /= times.length;
    var stdDev = Math.sqrt(variance);
    var cv = avg > 0 ? stdDev / avg : 1;

    // AI-assisted patterns:
    // 1. Very consistent timing (CV < 0.20) — AI answers at predictable speed
    // 2. All answers fast (avg < 6s)
    // 3. The "read → wait for AI → answer" cycle is typically 3-8 seconds
    if (cv < 0.2 && avg < 8000 && times.length >= 3) {
      addSignal(
        "timing_consistency",
        "Response timing unusually consistent (CV=" +
        cv.toFixed(2) +
        ", avg=" +
        Math.round(avg) +
        "ms across " +
        times.length +
        "q) — matches AI-assisted pattern",
      );
    }

    if (avg < 4000 && times.length >= 3) {
      addSignal(
        "speed_anomaly",
        "Avg response " +
        Math.round(avg) +
        "ms across " +
        times.length +
        " questions — faster than human reading+thinking baseline",
      );
    }

    // Check for "burst" pattern: very fast answers after a consistent delay
    // (user waits for AI, then quickly clicks)
    var fastAnswers = 0;
    for (var m = 0; m < times.length; m++) {
      if (times[m] < 5000) fastAnswers++;
    }
    if (fastAnswers === times.length && times.length >= 4) {
      addSignal(
        "all_fast_answers",
        "All " +
        times.length +
        " answers under 5s — strong indicator of AI-assisted answering",
      );
    }
  }

  // ================================================================
  // SHERLOCK-INSPIRED: WEBCAM PROCTORING ENGINE (Strategy 16)
  // Two cheating vectors:
  //   A) Same-device: Cluely PRO, overlays → handled by anti-OCR + traps
  //   B) External device: phone camera, second laptop → handled HERE
  //
  // Detection stack (priority order):
  //   1. face-api.js (TinyFaceDetector + 68-point landmarks) — most reliable
  //   2. Native FaceDetector API (Chrome/Edge experimental) — decent
  //   3. Skin-tone YCbCr fallback — last resort
  //
  // Detects: face absence, head turns (via landmarks), multiple faces.
  // Shows visible webcam PIP as deterrent (like Sherlock AI).
  // Captures snapshots at violation moments for admin review.
  // ================================================================

  var _webcamStream = null;
  var _proctorVideo = null;
  var _proctorCanvas = null;
  var _proctorCtx = null;
  var _proctorTimer = null;
  var _faceDetector = null;
  var _hasFaceDetectorAPI = false;
  var _hasFaceApiJS = false;
  var _faceApiLoaded = false;
  var _proctorActive = false;

  // Tracking state
  var _facePresent = true;
  var _faceAbsentSince = 0;
  var _faceAbsentCount = 0;
  var _totalFaceAbsentMs = 0;
  var _multipleFaceCount = 0;
  var _headTurnCount = 0;
  var _headTurnSince = 0;
  var _totalHeadTurnMs = 0;
  var _baselineFaceBox = null;
  var _baselineLandmarks = null;
  var _consecutiveNoFace = 0;
  var _consecutiveMultiFace = 0;
  var _proctorEvents = [];
  var _snapshotQueue = [];
  var _lastSnapshotTime = 0;

  // Camera obstruction detection
  var _consecutiveBlackFrames = 0;
  var _cameraObstructedSince = 0;
  var _cameraObstructed = false;

  // Real-time enforcement callback
  // assessment.js registers this to react to violations (show warning, pause, auto-submit)
  var _violationCallback = null;
  var _currentViolationLevel = 0; // 0=ok, 1=warning, 2=paused, 3=auto-submit

  // Peripheral detection state
  var _peripheralWarnings = [];
  var _externalMonitorDetected = false;

  // WebGazer eye tracking state
  var _webgazerReady = false;
  var _webgazerCalibrated = false;
  var _gazeOffscreenSince = 0;
  var _gazeOffscreenCount = 0;
  var _totalGazeOffscreenMs = 0;
  var _consecutiveOffscreenFrames = 0;
  var _gazeCheckTimer = null;

  // Skin-tone detection thresholds (YCbCr color space) — last-resort fallback
  var SKIN_CB_MIN = 77,
    SKIN_CB_MAX = 127;
  var SKIN_CR_MIN = 133,
    SKIN_CR_MAX = 173;

  // face-api.js model URL (official GitHub Pages)
  var FACE_API_MODEL_URL =
    "https://justadudewhohacks.github.io/face-api.js/models";

  // --- Load face-api.js models ---
  async function loadFaceApiModels() {
    if (typeof faceapi === "undefined") {
      _hasFaceApiJS = false;
      return false;
    }
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_MODEL_URL);
      _hasFaceApiJS = true;
      _faceApiLoaded = true;
      return true;
    } catch (e) {
      _hasFaceApiJS = false;
      return false;
    }
  }

  // ================================================================
  // WEBGAZER EYE TRACKING — detects gaze direction
  // When face is in frame but eyes look off-screen (e.g., at adjacent
  // monitor), face-api.js can't catch it. WebGazer fills this gap.
  // ================================================================

  // --- Wait for a deferred script to load ---
  function waitForGlobal(name, timeoutMs) {
    return new Promise(function (resolve) {
      var elapsed = 0;
      var interval = 200;
      var timer = setInterval(function () {
        if (typeof window[name] !== "undefined") {
          clearInterval(timer);
          resolve(true);
        } else {
          elapsed += interval;
          if (elapsed >= timeoutMs) {
            clearInterval(timer);
            resolve(false);
          }
        }
      }, interval);
    });
  }

  // --- Initialize WebGazer (call after webcam is already granted) ---
  async function initWebGazer() {
    // WebGazer loads via defer CDN — may not be ready yet; wait up to 15s
    if (typeof webgazer === "undefined") {
      console.log("[Proctor] Waiting for WebGazer.js to load...");
      var loaded = await waitForGlobal("webgazer", 15000);
      if (!loaded) {
        console.warn("[Proctor] WebGazer.js did not load within 15s");
        return false;
      }
    }
    try {
      // Hide WebGazer's built-in UI — we use our own PIP
      // Method names vary between WebGazer versions; be defensive
      if (webgazer.showVideoPreview) webgazer.showVideoPreview(false);
      else if (webgazer.showVideo) webgazer.showVideo(false);
      if (webgazer.showPredictionPoints) webgazer.showPredictionPoints(false);
      if (webgazer.showFaceOverlay) webgazer.showFaceOverlay(false);
      if (webgazer.showFaceFeedbackBox) webgazer.showFaceFeedbackBox(false);

      // Use ridge regression for best accuracy
      if (webgazer.setRegression) webgazer.setRegression("ridge");

      // Start WebGazer — it will request its own camera access
      // (browser shares the same physical camera, no second permission prompt)
      await webgazer.begin();

      // Hide any elements WebGazer may have injected into the DOM
      var wgVideo = document.getElementById("webgazerVideoFeed");
      if (wgVideo) wgVideo.style.display = "none";
      var wgFace = document.getElementById("webgazerFaceFeedbackBox");
      if (wgFace) wgFace.style.display = "none";
      var wgOverlay = document.getElementById("webgazerFaceOverlay");
      if (wgOverlay) wgOverlay.style.display = "none";
      var wgDot = document.getElementById("webgazerGazeDot");
      if (wgDot) wgDot.style.display = "none";

      _webgazerReady = true;
      console.log("[Proctor] WebGazer initialized successfully");
      return true;
    } catch (e) {
      console.warn("[Proctor] WebGazer init failed:", e.message || e);
      _webgazerReady = false;
      return false;
    }
  }

  // --- Start gaze monitoring during assessment ---
  function startGazeTracking() {
    if (!_webgazerReady || !_webgazerCalibrated) return;

    // Check gaze every 500ms
    _gazeCheckTimer = setInterval(async function () {
      if (!_proctorActive) {
        clearInterval(_gazeCheckTimer);
        return;
      }

      try {
        // getCurrentPrediction returns a Promise in WebGazer 2.x
        var prediction = await webgazer.getCurrentPrediction();
        if (!prediction || prediction.x == null || prediction.y == null) return;

        var x = prediction.x;
        var y = prediction.y;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        // Off-screen margin: allow 80px beyond viewport edges before flagging
        var margin = 80;
        var isOffscreen =
          x < -margin || x > vw + margin || y < -margin || y > vh + margin;

        if (isOffscreen) {
          _consecutiveOffscreenFrames++;
          if (_consecutiveOffscreenFrames >= 4) {
            // ~2s sustained off-screen gaze
            var now = Date.now();
            if (_gazeOffscreenSince === 0) {
              _gazeOffscreenSince = now;
              _gazeOffscreenCount++;
              captureViolationSnapshot("gaze_offscreen");
            }
            var gazeDuration = now - _gazeOffscreenSince;
            if (gazeDuration > 3000) {
              addProctorEvent(
                "gaze_offscreen",
                "Eyes looking off-screen for " +
                Math.round(gazeDuration / 1000) +
                "s (gaze: " +
                Math.round(x) +
                "," +
                Math.round(y) +
                " viewport: " +
                vw +
                "x" +
                vh +
                ") — candidate may be reading from adjacent screen.",
              );
            }
            updatePIPStatus("head_turn"); // Re-use look-away indicator
          }
        } else {
          if (_gazeOffscreenSince > 0) {
            _totalGazeOffscreenMs += Date.now() - _gazeOffscreenSince;
            _gazeOffscreenSince = 0;
          }
          _consecutiveOffscreenFrames = 0;
          // Don't reset PIP here — face detection manages its own PIP state
        }
      } catch (e) {
        // WebGazer prediction error — ignore
      }
    }, 500);
  }

  // --- Stop gaze tracking ---
  function stopGazeTracking() {
    if (_gazeCheckTimer) {
      clearInterval(_gazeCheckTimer);
      _gazeCheckTimer = null;
    }
    if (_webgazerReady && typeof webgazer !== "undefined") {
      try {
        webgazer.end();
      } catch (e) { }
    }
  }

  // --- Peripheral / multi-screen detection ---
  async function detectPeripherals() {
    var warnings = [];

    // 1. Multi-screen detection (Chrome 100+, no permission needed)
    //    NOTE: screen.isExtended is FALSE for mirrored displays (by design)
    try {
      if (typeof window.screen !== "undefined" && window.screen.isExtended) {
        _externalMonitorDetected = true;
        warnings.push({
          type: "external_monitor",
          detail:
            "Multiple monitors detected (screen.isExtended) — candidate could display answers on second screen.",
        });
      }
    } catch (e) { }

    // 2. getScreenDetails() is handled by the "Scan Displays" button in assessment.js
    //    (requires user gesture for the browser permission prompt)

    // 3. Mirrored display heuristic: DPR mismatch
    //    MacBook Retina has DPR=2.0; connecting a non-Retina external via VGA/HDMI
    //    and mirroring can change the effective DPR or resolution
    try {
      var dpr = window.devicePixelRatio || 1;
      var screenW = window.screen.width;
      var screenH = window.screen.height;

      // Detect resolution that doesn't match common built-in laptop displays
      // Common built-in: 1440x900, 1680x1050, 1920x1080, 1920x1200, 2560x1600, 2880x1800
      var commonBuiltIn = [
        "1440x900",
        "1680x1050",
        "1920x1080",
        "1920x1200",
        "2560x1440",
        "2560x1600",
        "2880x1800",
        "3024x1964",
        "3456x2234",
        "1366x768",
        "1536x864",
      ];
      var currentRes = screenW + "x" + screenH;
      var isCommonRes = commonBuiltIn.indexOf(currentRes) !== -1;

      // VGA-typical resolutions that suggest an external display is active
      var vgaResolutions = [
        "1024x768",
        "1280x720",
        "1280x800",
        "1280x1024",
        "1360x768",
        "1600x900",
        "1600x1200",
      ];
      var isVGARes = vgaResolutions.indexOf(currentRes) !== -1;

      if (isVGARes && !_externalMonitorDetected) {
        _externalMonitorDetected = true;
        warnings.push({
          type: "external_monitor",
          detail:
            "Screen resolution (" +
            currentRes +
            ") matches external VGA/HDMI display — " +
            "possible mirrored or external monitor connected.",
        });
      }

      // DPR=1 on a device that should have Retina (macOS + non-standard res)
      if (
        dpr === 1 &&
        !isCommonRes &&
        navigator.platform &&
        navigator.platform.indexOf("Mac") !== -1 &&
        !_externalMonitorDetected
      ) {
        warnings.push({
          type: "external_monitor",
          detail:
            "Non-Retina display detected on macOS (DPR=" +
            dpr +
            ", " +
            currentRes +
            ") — likely mirroring to external monitor.",
        });
        _externalMonitorDetected = true;
      }

      // Log diagnostic info for debugging
      console.log(
        "[Proctor] Basic screen check:",
        "resolution=" + currentRes,
        "DPR=" + dpr,
        "isExtended=" + (window.screen.isExtended || false),
        "isVGA=" + isVGARes,
        "isCommon=" + isCommonRes,
        "colorDepth=" + window.screen.colorDepth,
        "platform=" + (navigator.platform || "unknown"),
      );
    } catch (e) { }

    // 4. Screen resolution heuristic: unusually wide viewport = extended desktop
    try {
      if (window.screen.width > 3000 && !_externalMonitorDetected) {
        warnings.push({
          type: "wide_resolution",
          detail:
            "Very wide screen resolution (" +
            window.screen.width +
            "x" +
            window.screen.height +
            ") — may indicate extended/virtual desktop.",
        });
      }
    } catch (e) { }

    // 5. Gamepad detection (someone could use a game controller to signal answers)
    try {
      var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
          warnings.push({
            type: "gamepad_connected",
            detail:
              'Gamepad detected: "' +
              gamepads[i].id +
              '" — unusual peripheral during assessment.',
          });
        }
      }
    } catch (e) { }

    _peripheralWarnings = warnings;
    return warnings;
  }

  // --- Monitor for new peripherals during assessment ---
  function startPeripheralMonitoring() {
    // Listen for gamepad connections
    window.addEventListener("gamepadconnected", function (e) {
      addProctorEvent(
        "peripheral_connected",
        'Gamepad connected during assessment: "' + e.gamepad.id + '"',
      );
    });

    // Re-check screen configuration periodically
    var _peripheralCheckTimer = setInterval(function () {
      if (!_proctorActive) {
        clearInterval(_peripheralCheckTimer);
        return;
      }
      try {
        if (window.screen.isExtended && !_externalMonitorDetected) {
          _externalMonitorDetected = true;
          addProctorEvent(
            "external_monitor",
            "External monitor connected during assessment — possible cheating vector.",
          );
          captureViolationSnapshot("external_monitor");
        }
      } catch (e) { }
    }, 10000);
  }

  function initProctoring(stream) {
    _webcamStream = stream;
    _proctorActive = true;

    // Detection stack: face-api.js > FaceDetector API > skin-tone fallback
    if (!_faceApiLoaded) {
      // Try native FaceDetector as second priority
      if (typeof window.FaceDetector === "function") {
        try {
          _faceDetector = new window.FaceDetector({
            fastMode: true,
            maxDetectedFaces: 5,
          });
          _hasFaceDetectorAPI = true;
        } catch (e) {
          _hasFaceDetectorAPI = false;
        }
      }
    }

    // Use the existing video element in the PIP overlay (set up by assessment.js)
    _proctorVideo = document.getElementById("proctor-video");
    if (!_proctorVideo) {
      _proctorVideo = document.createElement("video");
      _proctorVideo.style.position = "fixed";
      _proctorVideo.style.top = "-9999px";
      document.body.appendChild(_proctorVideo);
    }
    _proctorVideo.srcObject = stream;
    _proctorVideo.setAttribute("playsinline", "");
    _proctorVideo.muted = true;
    _proctorVideo.play();

    // Analysis canvas (offscreen)
    _proctorCanvas = document.createElement("canvas");
    _proctorCanvas.width = 320;
    _proctorCanvas.height = 240;
    _proctorCtx = _proctorCanvas.getContext("2d", { willReadFrequently: true });

    // Start peripheral monitoring
    startPeripheralMonitoring();

    // Report peripheral warnings as signals
    _peripheralWarnings.forEach(function (w) {
      addSignal(w.type, w.detail);
    });

    // Start monitoring after brief warm-up for camera auto-exposure
    setTimeout(function () {
      _proctorTimer = setInterval(proctorAnalyzeFrame, 600);
    }, 1500);

    var detectionMethod = _faceApiLoaded
      ? "face-api.js (TinyFaceDetector + landmarks)"
      : _hasFaceDetectorAPI
        ? "FaceDetector API"
        : "skin-tone fallback";
    addProctorEvent(
      "proctoring_started",
      "Webcam proctoring active (" + detectionMethod + ")",
    );
  }

  var _lastProctorEventTime = {};
  function addProctorEvent(type, detail) {
    // Throttle: same event type max once every 8 seconds to avoid flooding
    var now = Date.now();
    if (
      _lastProctorEventTime[type] &&
      now - _lastProctorEventTime[type] < 8000
    ) {
      // Still update PIP status even if throttled
      updatePIPStatus(type);
      return;
    }
    _lastProctorEventTime[type] = now;
    var evt = { type: type, detail: detail, ts: now };
    _proctorEvents.push(evt);
    // Also send as behavioral signal for server scoring
    addSignal(type, detail);
    // Update PIP status indicator
    updatePIPStatus(type);
  }

  function updatePIPStatus(eventType) {
    var indicator = document.getElementById("proctor-status");
    var statusText = document.getElementById("proctor-status-text");
    if (!indicator || !statusText) return;

    if (eventType === "face_absent" || eventType === "extended_face_absent") {
      indicator.className = "proctor-indicator proctor-danger";
      statusText.textContent = "Face not detected";
    } else if (eventType === "multiple_faces") {
      indicator.className = "proctor-indicator proctor-danger";
      statusText.textContent = "Multiple faces";
    } else if (eventType === "head_turn") {
      indicator.className = "proctor-indicator proctor-warning";
      statusText.textContent = "Look at screen";
    } else {
      indicator.className = "proctor-indicator proctor-ok";
      statusText.textContent = "Proctoring active";
    }
  }

  // --- Violation callback registration ---
  function setViolationCallback(cb) {
    _violationCallback = cb;
  }

  // --- Notify assessment.js of violation level changes ---
  // level: 0=ok, 1=warning, 2=paused, 3=auto-submit
  // reason: string description
  function notifyViolation(level, reason) {
    // Always notify for level changes, level 0 (clear), or level >= 2 (update message with duration)
    if (level !== _currentViolationLevel || level === 0 || level >= 2) {
      _currentViolationLevel = level;
      if (_violationCallback) {
        _violationCallback(level, reason);
      }
    }
  }

  // --- Camera obstruction detection (black/covered frame) ---
  function checkCameraObstruction() {
    var imageData = _proctorCtx.getImageData(0, 0, 320, 240);
    var data = imageData.data;
    var totalBrightness = 0;
    var sampleCount = 0;

    // Sample every 16th pixel for performance
    for (var i = 0; i < data.length; i += 64) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      sampleCount++;
    }

    var avgBrightness = sampleCount > 0 ? totalBrightness / sampleCount : 128;

    // Average brightness < 12 = camera is covered/obstructed (phone, hand, tape)
    if (avgBrightness < 12) {
      _consecutiveBlackFrames++;
      if (_consecutiveBlackFrames >= 4) {
        // ~2.4s of black frames
        if (!_cameraObstructed) {
          _cameraObstructed = true;
          _cameraObstructedSince = Date.now();
          addProctorEvent(
            "camera_obstructed",
            "Camera appears covered or obstructed (avg brightness: " +
            avgBrightness.toFixed(1) +
            ") — possible phone placed over webcam.",
          );
          captureViolationSnapshot("camera_obstructed");
          updatePIPStatus("face_absent");
        }
        return true; // Obstructed
      }
    } else {
      if (_cameraObstructed) {
        var obstructedMs = Date.now() - _cameraObstructedSince;
        addProctorEvent(
          "camera_unobstructed",
          "Camera obstruction cleared after " +
          Math.round(obstructedMs / 1000) +
          "s.",
        );
        _cameraObstructed = false;
        _cameraObstructedSince = 0;
      }
      _consecutiveBlackFrames = 0;
    }
    return false;
  }

  // --- Real-time escalation engine ---
  // Called after every detection cycle to determine enforcement level
  function evaluateViolationLevel() {
    var now = Date.now();

    // Camera obstructed = treat same as face absent, but more severe
    if (_cameraObstructed) {
      var obstructedDuration = now - _cameraObstructedSince;
      if (obstructedDuration > 15000) {
        notifyViolation(
          2,
          "Camera has been covered for " +
          Math.round(obstructedDuration / 1000) +
          "s. Assessment is paused.",
        );
        return;
      }
      if (obstructedDuration > 4000) {
        notifyViolation(
          1,
          "Your camera appears to be covered. Please uncover it to continue.",
        );
        return;
      }
    }

    // Face absent escalation
    if (!_facePresent && _faceAbsentSince > 0) {
      var absentDuration = now - _faceAbsentSince;
      var totalAbsent = _totalFaceAbsentMs + absentDuration;

      // Auto-submit after 90s cumulative absence
      if (totalAbsent > 90000) {
        notifyViolation(
          3,
          "Face absent for over 90 seconds total. Assessment will be auto-submitted.",
        );
        return;
      }
      // Pause after 15s continuous absence
      if (absentDuration > 15000) {
        notifyViolation(
          2,
          "Face not detected for " +
          Math.round(absentDuration / 1000) +
          "s. Assessment is paused until you return.",
        );
        return;
      }
      // Warning after 5s continuous absence
      if (absentDuration > 5000) {
        notifyViolation(
          1,
          "Face not detected. Please look at the screen to continue your assessment.",
        );
        return;
      }
    }

    // Multiple faces — immediate warning
    if (_consecutiveMultiFace >= 3) {
      notifyViolation(
        1,
        "Multiple people detected in frame. Only the candidate should be visible.",
      );
      return;
    }

    // Head turn escalation (same progressive model as face absence)
    if (_headTurnSince > 0) {
      var turnDuration = now - _headTurnSince;
      var totalTurnTime = _totalHeadTurnMs + turnDuration;

      // Pause after 10s continuous head turn
      if (turnDuration > 10000) {
        notifyViolation(
          2,
          "You have been looking away for " +
          Math.round(turnDuration / 1000) +
          "s. Assessment is paused — please face the screen to continue.",
        );
        return;
      }
      // Warning after 3s continuous head turn
      if (turnDuration > 3000) {
        notifyViolation(
          1,
          "Please look at the screen. Looking away is being recorded and may affect your assessment.",
        );
        return;
      }
    }

    // Eye gaze off-screen escalation (WebGazer)
    if (_gazeOffscreenSince > 0) {
      var gazeDuration = now - _gazeOffscreenSince;

      // Pause after 8s continuous off-screen gaze
      if (gazeDuration > 8000) {
        notifyViolation(
          2,
          "Your eyes have been looking away from the screen for " +
          Math.round(gazeDuration / 1000) +
          "s. Assessment is paused — please focus on your screen.",
        );
        return;
      }
      // Warning after 3s continuous off-screen gaze
      if (gazeDuration > 3000) {
        notifyViolation(
          1,
          "Eye tracking detected you looking away from the screen. Please keep your eyes on the assessment.",
        );
        return;
      }
    }

    // All clear — dismiss any active warning
    if (_currentViolationLevel > 0) {
      notifyViolation(0, "");
    }
  }

  // --- Main analysis loop (runs every 600ms) ---
  function proctorAnalyzeFrame() {
    if (!_proctorActive || !_proctorVideo) return;
    if (_proctorVideo.readyState < 2) return;

    _proctorCtx.drawImage(_proctorVideo, 0, 0, 320, 240);

    // FIRST: Check if camera is obstructed (phone covering lens, tape, etc.)
    var isObstructed = checkCameraObstruction();
    if (isObstructed) {
      // Still count as no-face for tracking purposes
      handleNoFace(Date.now());
      evaluateViolationLevel();
      return;
    }

    // Priority 1: face-api.js (most reliable — works across all browsers)
    if (_faceApiLoaded && typeof faceapi !== "undefined") {
      faceApiDetection();
      return;
    }

    // Priority 2: Native FaceDetector API (Chrome/Edge with flags)
    if (_hasFaceDetectorAPI && _faceDetector) {
      _faceDetector
        .detect(_proctorCanvas)
        .then(function (faces) {
          processNativeFaceResults(faces);
          evaluateViolationLevel();
        })
        .catch(function () {
          fallbackSkinToneDetection();
          evaluateViolationLevel();
        });
      return;
    }

    // Priority 3: Skin-tone fallback (last resort)
    fallbackSkinToneDetection();
    evaluateViolationLevel();
  }

  // =============================================
  // TIER 1: face-api.js detection (recommended)
  // Uses TinyFaceDetector + 68-point landmarks
  // =============================================
  async function faceApiDetection() {
    try {
      var options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.4,
      });

      var detections = await faceapi
        .detectAllFaces(_proctorCanvas, options)
        .withFaceLandmarks(true);

      var now = Date.now();
      var faceCount = detections.length;

      if (faceCount === 0) {
        handleNoFace(now);
      } else if (faceCount === 1) {
        handleOneFaceWithLandmarks(detections[0], now);
      } else {
        handleMultipleFaces(faceCount, now);
      }
    } catch (e) {
      // face-api.js error — fall through to skin-tone
      fallbackSkinToneDetection();
    }
    evaluateViolationLevel();
  }

  // --- Handle single face with 68-point landmark head pose estimation ---
  function handleOneFaceWithLandmarks(detection, now) {
    _consecutiveMultiFace = 0;

    // Face returned after absence
    if (!_facePresent && _faceAbsentSince > 0) {
      var absentMs = now - _faceAbsentSince;
      _totalFaceAbsentMs += absentMs;
      _faceAbsentSince = 0;
      if (absentMs > 3000) {
        addProctorEvent(
          "face_returned",
          "Face returned after " +
          Math.round(absentMs / 1000) +
          "s absence (total absent: " +
          Math.round(_totalFaceAbsentMs / 1000) +
          "s).",
        );
      }
      updatePIPStatus("ok");
    }
    _facePresent = true;
    _consecutiveNoFace = 0;

    var box = detection.detection.box;
    var landmarks = detection.landmarks;
    var positions = landmarks.positions;

    // --- Head turn detection via facial landmarks ---
    // Key points: nose tip (30), left eye outer (36), right eye outer (45),
    //             jaw left (0), jaw right (16)
    var noseTip = positions[30];
    var leftEyeOuter = positions[36];
    var rightEyeOuter = positions[45];
    var jawLeft = positions[0];
    var jawRight = positions[16];

    // Method 1: Nose-to-eye distance ratio (horizontal rotation)
    // When facing camera: left-nose ≈ right-nose distances
    // When turned: one side gets much shorter
    var noseToLeft = Math.abs(noseTip.x - leftEyeOuter.x);
    var noseToRight = Math.abs(noseTip.x - rightEyeOuter.x);
    var eyeSpan = Math.abs(leftEyeOuter.x - rightEyeOuter.x);
    var asymmetryRatio =
      eyeSpan > 10 ? Math.abs(noseToLeft - noseToRight) / eyeSpan : 0;

    // Method 2: Jaw width ratio vs baseline (profile = narrow jaw)
    var jawWidth = Math.abs(jawLeft.x - jawRight.x);

    // Method 3: Nose position relative to face bounding box center
    var faceCenterX = box.x + box.width / 2;
    var noseOffsetRatio =
      box.width > 10 ? Math.abs(noseTip.x - faceCenterX) / box.width : 0;

    // Method 4: Vertical head tilt — nose below eyes by too much = looking down
    var eyeCenterY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
    var noseDropRatio =
      box.height > 10 ? (noseTip.y - eyeCenterY) / box.height : 0;

    // Store baseline on first good detection
    if (!_baselineLandmarks) {
      _baselineLandmarks = {
        jawWidth: jawWidth,
        asymmetryRatio: asymmetryRatio,
        noseOffsetRatio: noseOffsetRatio,
      };
      _baselineFaceBox = {
        cx: faceCenterX,
        cy: box.y + box.height / 2,
        w: box.width,
      };
    }

    // Determine if head is turned using multiple signals
    var jawShrinkRatio =
      _baselineLandmarks.jawWidth > 0
        ? jawWidth / _baselineLandmarks.jawWidth
        : 1;

    // Head is turned if:
    //   - Nose-eye asymmetry > 0.35 (nose significantly off-center between eyes)
    //   - OR jaw width shrunk to < 65% of baseline (profile view)
    //   - OR nose offset from box center > 0.18 combined with asymmetry > 0.2
    var isTurned =
      asymmetryRatio > 0.35 ||
      jawShrinkRatio < 0.65 ||
      (noseOffsetRatio > 0.18 && asymmetryRatio > 0.2);

    // Looking down detection (nose drops below normal ratio)
    var isLookingDown = noseDropRatio > 0.55;

    if (isTurned || isLookingDown) {
      if (_headTurnSince === 0) {
        _headTurnSince = now;
        _headTurnCount++;
        // Immediately update PIP on first detection
        updatePIPStatus("head_turn");
      }
      var turnDuration = now - _headTurnSince;
      // Log signal after 2s sustained turn (snapshot on first occurrence)
      if (turnDuration > 2000) {
        var turnDetail = isTurned
          ? "Head turned away " +
          _headTurnCount +
          " times (asymmetry: " +
          asymmetryRatio.toFixed(2) +
          ", jaw ratio: " +
          jawShrinkRatio.toFixed(2) +
          ")"
          : "Head looking down " +
          _headTurnCount +
          " times (nose drop: " +
          noseDropRatio.toFixed(2) +
          ")";
        addProctorEvent(
          "head_turn",
          turnDetail +
          " — candidate not looking at screen (possible phone, notes, or second device).",
        );
        if (_headTurnCount <= 5) {
          captureViolationSnapshot("head_turn");
        }
      }
    } else {
      if (_headTurnSince > 0) {
        _totalHeadTurnMs += now - _headTurnSince;
        _headTurnSince = 0;
        updatePIPStatus("ok");
      }
      // Slowly adapt baseline
      _baselineLandmarks.jawWidth =
        _baselineLandmarks.jawWidth * 0.93 + jawWidth * 0.07;
      _baselineLandmarks.asymmetryRatio =
        _baselineLandmarks.asymmetryRatio * 0.9 + asymmetryRatio * 0.1;
      if (_baselineFaceBox) {
        _baselineFaceBox.cx = _baselineFaceBox.cx * 0.92 + faceCenterX * 0.08;
        _baselineFaceBox.w = _baselineFaceBox.w * 0.95 + box.width * 0.05;
      }
    }
  }

  // =============================================
  // Common handlers (used by all detection tiers)
  // =============================================
  function handleNoFace(now) {
    _consecutiveNoFace++;
    _consecutiveMultiFace = 0;

    // Require 3 consecutive no-face frames (~1.8s) to avoid false positives
    if (_consecutiveNoFace >= 3) {
      if (_faceAbsentSince === 0) {
        _faceAbsentSince = now;
        _faceAbsentCount++;
        captureViolationSnapshot("face_absent");
      }
      _facePresent = false;

      var absentDuration = now - _faceAbsentSince;

      if (_faceAbsentCount >= 2 && absentDuration > 3000) {
        addProctorEvent(
          "face_absent",
          "Face not detected " +
          _faceAbsentCount +
          " times — " +
          "currently absent for " +
          Math.round(absentDuration / 1000) +
          "s. " +
          "Candidate may be looking at phone or external device.",
        );
      }

      if (_totalFaceAbsentMs + absentDuration > 20000) {
        addProctorEvent(
          "extended_face_absent",
          "Face absent for total " +
          Math.round((_totalFaceAbsentMs + absentDuration) / 1000) +
          "s — strong indicator of external device cheating (phone, second screen).",
        );
      }
    }
  }

  // --- Handle single face from native FaceDetector API (no landmarks) ---
  function handleOneFaceNative(face, now) {
    _consecutiveMultiFace = 0;

    if (!_facePresent && _faceAbsentSince > 0) {
      var absentMs = now - _faceAbsentSince;
      _totalFaceAbsentMs += absentMs;
      _faceAbsentSince = 0;
      if (absentMs > 3000) {
        addProctorEvent(
          "face_returned",
          "Face returned after " +
          Math.round(absentMs / 1000) +
          "s absence (total absent: " +
          Math.round(_totalFaceAbsentMs / 1000) +
          "s).",
        );
      }
      updatePIPStatus("ok");
    }
    _facePresent = true;
    _consecutiveNoFace = 0;

    var box = face.boundingBox;
    var faceCenterX = box.x + box.width / 2;
    var faceCenterY = box.y + box.height / 2;

    if (!_baselineFaceBox) {
      _baselineFaceBox = { cx: faceCenterX, cy: faceCenterY, w: box.width };
    } else {
      var dxRatio =
        Math.abs(faceCenterX - _baselineFaceBox.cx) / _baselineFaceBox.w;
      var sizeRatio = box.width / _baselineFaceBox.w;
      var isTurned = dxRatio > 0.4 || sizeRatio < 0.6;

      if (isTurned) {
        if (_headTurnSince === 0) {
          _headTurnSince = now;
          _headTurnCount++;
          updatePIPStatus("head_turn");
        }
        var turnDuration = now - _headTurnSince;
        if (turnDuration > 2000) {
          addProctorEvent(
            "head_turn",
            "Head turned away " +
            _headTurnCount +
            " times — " +
            "candidate not looking at screen (possible second device or person).",
          );
          if (_headTurnCount <= 5) {
            captureViolationSnapshot("head_turn");
          }
        }
      } else {
        if (_headTurnSince > 0) {
          _totalHeadTurnMs += now - _headTurnSince;
          _headTurnSince = 0;
          updatePIPStatus("ok");
        }
        _baselineFaceBox.cx = _baselineFaceBox.cx * 0.92 + faceCenterX * 0.08;
        _baselineFaceBox.cy = _baselineFaceBox.cy * 0.92 + faceCenterY * 0.08;
        _baselineFaceBox.w = _baselineFaceBox.w * 0.95 + box.width * 0.05;
      }
    }
  }

  function processNativeFaceResults(faces) {
    var now = Date.now();
    var faceCount = faces.length;
    if (faceCount === 0) {
      handleNoFace(now);
    } else if (faceCount === 1) {
      handleOneFaceNative(faces[0], now);
    } else {
      handleMultipleFaces(faceCount, now);
    }
  }

  function handleMultipleFaces(count, now) {
    _consecutiveMultiFace++;
    _consecutiveNoFace = 0;
    _facePresent = true;

    if (_consecutiveMultiFace >= 3) {
      _multipleFaceCount++;
      if (_multipleFaceCount <= 3) {
        addProctorEvent(
          "multiple_faces",
          count +
          " faces detected — possible assistance from another person nearby.",
        );
        captureViolationSnapshot("multiple_faces");
      }
    }
  }

  // =============================================
  // TIER 3: Skin-tone fallback (last resort)
  // =============================================
  function fallbackSkinToneDetection() {
    var imageData = _proctorCtx.getImageData(0, 0, 320, 240);
    var data = imageData.data;
    var w = 320,
      h = 240;

    var centerSkin = 0,
      centerTotal = 0;
    var leftSkin = 0,
      rightSkin = 0,
      edgeTotal = 0;

    for (var y = 30; y < 210; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var r = data[idx],
          g = data[idx + 1],
          b = data[idx + 2];

        var cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
        var cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);
        var isSkin =
          cb >= SKIN_CB_MIN &&
          cb <= SKIN_CB_MAX &&
          cr >= SKIN_CR_MIN &&
          cr <= SKIN_CR_MAX;

        if (x >= 80 && x <= 240) {
          centerTotal++;
          if (isSkin) centerSkin++;
        } else {
          edgeTotal++;
          if (isSkin) {
            if (x < 80) leftSkin++;
            else rightSkin++;
          }
        }
      }
    }

    var centerRatio = centerTotal > 0 ? centerSkin / centerTotal : 0;
    var now = Date.now();

    if (centerRatio < 0.03) {
      handleNoFace(now);
    } else if (centerRatio >= 0.03) {
      var leftRatio = edgeTotal > 0 ? leftSkin / (edgeTotal / 2) : 0;
      var rightRatio = edgeTotal > 0 ? rightSkin / (edgeTotal / 2) : 0;

      var pseudoFace = {
        boundingBox: {
          x: 80,
          y: 30,
          width: 160,
          height: 180,
        },
      };

      if (leftRatio > rightRatio * 1.8) {
        pseudoFace.boundingBox.x = 40;
      } else if (rightRatio > leftRatio * 1.8) {
        pseudoFace.boundingBox.x = 140;
      }

      pseudoFace.boundingBox.width = Math.max(
        80,
        Math.min(200, centerRatio * 1600),
      );

      handleOneFaceNative(pseudoFace, now);

      if (leftRatio > 0.08 && rightRatio > 0.08 && centerRatio > 0.05) {
        _consecutiveMultiFace++;
        if (_consecutiveMultiFace >= 4) {
          _multipleFaceCount++;
          if (_multipleFaceCount <= 3) {
            addProctorEvent(
              "multiple_faces",
              "Skin detected in multiple regions — possible second person nearby.",
            );
            captureViolationSnapshot("multiple_faces");
          }
        }
      } else {
        _consecutiveMultiFace = 0;
      }
    }
  }

  // --- Snapshot capture for admin review ---
  function captureViolationSnapshot(reason) {
    var now = Date.now();
    // Limit: max 1 snapshot every 5 seconds
    if (now - _lastSnapshotTime < 5000) return;
    _lastSnapshotTime = now;

    try {
      var snapCanvas = document.createElement("canvas");
      snapCanvas.width = 320;
      snapCanvas.height = 240;
      var snapCtx = snapCanvas.getContext("2d");
      snapCtx.drawImage(_proctorVideo, 0, 0, 320, 240);

      // Add timestamp + reason overlay
      snapCtx.fillStyle = "rgba(0,0,0,0.6)";
      snapCtx.fillRect(0, 220, 320, 20);
      snapCtx.fillStyle = "#fff";
      snapCtx.font = "11px sans-serif";
      snapCtx.fillText(
        reason + " | " + new Date().toLocaleTimeString(),
        4,
        234,
      );

      var dataUrl = snapCanvas.toDataURL("image/jpeg", 0.6);
      _snapshotQueue.push({ reason: reason, ts: now, image: dataUrl });

      // Send snapshot to server
      if (_sessionId) {
        sendSnapshot(dataUrl, reason, now);
      }
    } catch (e) {
      // Canvas tainted or other error — skip
    }
  }

  function sendSnapshot(dataUrl, reason, ts) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE_URL + "/api/proctor-snapshot", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(
        JSON.stringify({
          sessionId: _sessionId,
          reason: reason,
          timestamp: ts,
          image: dataUrl,
        }),
      );
    } catch (e) {
      /* silent fail */
    }
  }

  function stopProctoring() {
    if (_proctorTimer) clearInterval(_proctorTimer);
    if (_webcamStream) {
      _webcamStream.getTracks().forEach(function (t) {
        t.stop();
      });
    }
    _proctorActive = false;

    // Stop eye gaze tracking
    stopGazeTracking();

    // Send final summary signal
    if (
      _faceAbsentCount > 0 ||
      _headTurnCount > 0 ||
      _multipleFaceCount > 0 ||
      _gazeOffscreenCount > 0
    ) {
      addSignal(
        "proctor_summary",
        "Proctoring summary: face absent " +
        _faceAbsentCount +
        " times (" +
        Math.round(_totalFaceAbsentMs / 1000) +
        "s total), head turns " +
        _headTurnCount +
        " (" +
        Math.round(_totalHeadTurnMs / 1000) +
        "s), " +
        "gaze off-screen " +
        _gazeOffscreenCount +
        " times (" +
        Math.round(_totalGazeOffscreenMs / 1000) +
        "s), " +
        "multiple faces " +
        _multipleFaceCount +
        " times, " +
        _snapshotQueue.length +
        " violation snapshots captured.",
      );
    }
  }

  function getProctoringSummary() {
    // Include current ongoing absence in the total
    var currentAbsenceMs = 0;
    if (!_facePresent && _faceAbsentSince > 0) {
      currentAbsenceMs = Date.now() - _faceAbsentSince;
    }
    return {
      faceAbsentCount: _faceAbsentCount,
      totalFaceAbsentMs: _totalFaceAbsentMs + currentAbsenceMs,
      headTurnCount: _headTurnCount,
      totalHeadTurnMs: _totalHeadTurnMs,
      multipleFaceCount: _multipleFaceCount,
      snapshotCount: _snapshotQueue.length,
      events: _proctorEvents,
      hasFaceDetectorAPI: _hasFaceDetectorAPI,
      faceApiLoaded: _faceApiLoaded,
      cameraObstructed: _cameraObstructed,
      webgazerReady: _webgazerReady,
      webgazerCalibrated: _webgazerCalibrated,
      gazeOffscreenCount: _gazeOffscreenCount,
      totalGazeOffscreenMs:
        _totalGazeOffscreenMs +
        (_gazeOffscreenSince > 0 ? Date.now() - _gazeOffscreenSince : 0),
    };
  }

  function destroy() {
    flushSignals();
    if (_flushTimer) clearInterval(_flushTimer);
    if (_mutationObserver) {
      _mutationObserver.disconnect();
      _mutationObserver = null;
    }
    stopProctoring();
  }

  // Expose API
  window.IntegrityMonitor = {
    init: init,
    addSignal: addSignal,
    flushSignals: flushSignals,
    destroy: destroy,
    recordQuestionTiming: recordQuestionTiming,
    initProctoring: initProctoring,
    stopProctoring: stopProctoring,
    getProctoringSummary: getProctoringSummary,
    loadFaceApiModels: loadFaceApiModels,
    detectPeripherals: detectPeripherals,
    setViolationCallback: setViolationCallback,
    initWebGazer: initWebGazer,
    startGazeTracking: startGazeTracking,
    stopGazeTracking: stopGazeTracking,
    setWebgazerCalibrated: function (val) {
      _webgazerCalibrated = !!val;
    },
  };
})();
