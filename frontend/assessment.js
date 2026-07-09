(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3847'
    : 'https://integrity-shield-backend.onrender.com'; // Replace with Render URL

  // ============================================================
  // AI BROWSER LOCKOUT — runs before assessment loads
  // ============================================================

  function detectAiBrowserType() {
    const ua = navigator.userAgent || "";

    // --- Method 1: Comprehensive User-Agent pattern matching ---
    const uaPatterns = [
      { pattern: /OPR.*Neon/i, name: "Opera Neon" },
      { pattern: /OPR/i, name: "Opera (AI Features)" },
      { pattern: /Opera/i, name: "Opera (AI Features)" },
      { pattern: /MyNextBrowser/i, name: "MyNextBrowser" },
      { pattern: /MNB/i, name: "MyNextBrowser" },
      { pattern: /mynext/i, name: "MyNextBrowser" },
      { pattern: /ArcBrowser/i, name: "Arc Browser" },
      { pattern: /Comet/i, name: "Comet AI Browser" },
      { pattern: /BraveBrowser.*AI/i, name: "Brave Leo AI" },
      { pattern: /SamsungBrowser.*AI/i, name: "Samsung AI Browser" },
      { pattern: /YaBrowser/i, name: "Yandex Browser (Alice AI)" },
      { pattern: /Maxthon/i, name: "Maxthon AI Browser" },
      { pattern: /Naver/i, name: "Naver Whale AI" },
      { pattern: /Vivaldi/i, name: "Vivaldi (AI Features)" },
      { pattern: /HeadlessChrome/i, name: "Headless Chrome (Bot)" },
      { pattern: /PhantomJS/i, name: "PhantomJS (Bot)" },
      { pattern: /Browser Agent/i, name: "Browser Agent AI" },
    ];
    for (const { pattern, name } of uaPatterns) {
      if (pattern.test(ua)) return name;
    }

    // --- Method 2: WebDriver / Automation ---
    if (navigator.webdriver) return "Automated Browser (WebDriver)";
    if (window.Cypress) return "Cypress Automation";
    if (window.__nightmare) return "Nightmare.js Automation";
    if (window.callPhantom || window._phantom) return "PhantomJS";

    // --- Method 3: Sidebar gap detection ---
    // MyNextBrowser and similar AI browsers show a sidebar that reduces innerWidth
    const sidebarGap = window.outerWidth - window.innerWidth;
    console.log("[AI Detection] Sidebar gap:", sidebarGap);
    if (sidebarGap > 150)
      return "AI Sidebar Browser (gap: " + sidebarGap + "px)";

    // --- Method 4: CSS custom property detection ---
    try {
      const styles = window.getComputedStyle(document.documentElement);
      if (styles.getPropertyValue("--sidebar-width") !== "")
        return "Comet AI Browser";
      if (styles.getPropertyValue("--copilot-width") !== "")
        return "Copilot Sidebar";
    } catch (e) {
      /* ignore */
    }

    // --- Method 5: Injected DOM elements from AI tools ---
    const aiSelectors = [
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
    for (const sel of aiSelectors) {
      try {
        if (document.querySelector(sel)) return "AI Extension (" + sel + ")";
      } catch (e) {
        /* ignore */
      }
    }

    // --- Method 6: Extension iframes ---
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        const src = iframe.src || "";
        if (
          src.startsWith("chrome-extension://") ||
          src.startsWith("moz-extension://")
        ) {
          return "Browser Extension (" + src.substring(0, 60) + ")";
        }
      } catch (e) {
        /* cross-origin */
      }
    }

    // --- Method 7: Shadow DOM scanning ---
    try {
      const allElements = document.querySelectorAll("*");
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowHtml = el.shadowRoot.innerHTML || "";
          if (/claude|copilot|cluely|operator|ai-assist/i.test(shadowHtml)) {
            return "AI Tool (Shadow DOM: " + el.tagName + ")";
          }
        }
      }
    } catch (e) {
      /* ignore */
    }

    return null;
  }

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(^| )" + name + "=([^;]+)"),
    );
    return match ? match[2] : null;
  }

  function setCookie(name, value, maxAgeSec) {
    document.cookie =
      name + "=" + value + "; path=/; max-age=" + maxAgeSec + "; SameSite=Lax";
  }

  function reportLockout(lockoutType, browserName) {
    fetch(API_BASE_URL + "/api/report-lockout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        browserName: browserName,
        lockoutType: lockoutType,
        detail: "UA: " + navigator.userAgent,
      }),
    }).catch(() => {});
  }

  function runLockoutCheck() {
    const aiBrowser = detectAiBrowserType();
    const previousWarning = getCookie("ai_browser_warned");
    const isBlocked = getCookie("ai_browser_blocked");

    if (isBlocked) {
      $$(".screen").forEach((s) => s.classList.remove("active"));
      $("#ai-blocked").classList.add("active");
      const detail = $("#ai-blocked-detail");
      if (detail)
        detail.textContent =
          "Detected: " +
          (aiBrowser || isBlocked) +
          " | Blocked at: " +
          new Date().toLocaleTimeString();
      reportLockout("blocked", isBlocked);
      return false;
    }

    if (aiBrowser) {
      if (previousWarning) {
        setCookie("ai_browser_blocked", aiBrowser, 86400 * 7);
        $$(".screen").forEach((s) => s.classList.remove("active"));
        $("#ai-blocked").classList.add("active");
        const detail = $("#ai-blocked-detail");
        if (detail)
          detail.textContent =
            "Detected: " +
            aiBrowser +
            " | Blocked at: " +
            new Date().toLocaleTimeString();
        reportLockout("blocked", aiBrowser);
        return false;
      } else {
        setCookie("ai_browser_warned", aiBrowser, 86400 * 7);
        $$(".screen").forEach((s) => s.classList.remove("active"));
        $("#ai-warning").classList.add("active");
        const detail = $("#ai-warning-detail");
        if (detail)
          detail.textContent =
            "Detected: " + aiBrowser + " | " + new Date().toLocaleTimeString();
        reportLockout("warned", aiBrowser);
        return false;
      }
    }

    return true;
  }

  // Run lockout check immediately
  let lockoutTriggered = !runLockoutCheck();

  // Delayed re-checks
  function deferredLockoutCheck() {
    if (lockoutTriggered) return;
    if (!runLockoutCheck()) {
      lockoutTriggered = true;
    }
  }
  setTimeout(deferredLockoutCheck, 500);
  setTimeout(deferredLockoutCheck, 1500);
  setTimeout(deferredLockoutCheck, 3000);
  setTimeout(deferredLockoutCheck, 5000);

  // MutationObserver for late-injected sidebars — runs indefinitely until lockout or assessment starts
  const lockoutObserver = new MutationObserver(() => {
    if (lockoutTriggered) {
      lockoutObserver.disconnect();
      return;
    }
    const detected = detectAiBrowserType();
    if (detected) {
      runLockoutCheck();
      lockoutTriggered = true;
      lockoutObserver.disconnect();
    }
  });
  lockoutObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  // No timeout — observer keeps running until assessment starts or lockout triggers

  // Window resize listener for AI sidebar detection (MyNextBrowser, etc.)
  // These browsers don't inject DOM — they resize the viewport when sidebar opens
  window.addEventListener("resize", () => {
    if (lockoutTriggered) return;
    const detected = detectAiBrowserType();
    if (detected) {
      console.log("[AI Detection] Sidebar detected on resize:", detected);
      runLockoutCheck();
      lockoutTriggered = true;
    }
  });

  if (lockoutTriggered) return;

  // ============================================================
  // ASSESSMENT CODE (only runs if lockout check passes)
  // ============================================================

  let sessionId = null;
  let candidateInfo = null;
  let currentQuestion = "q1";
  let questionStartTime = null;
  let assessmentStartTime = null;
  let timerInterval = null;
  const totalQuestions = 5;
  const questionOrder = ["q1", "q2", "q3", "q4", "q5"];

  // ============================================================
  // ADVERSARIAL ANTI-OCR CANVAS RENDERING ENGINE v2
  // Inspired by Sherlock AI's adversarial ML approach.
  // Uses multi-layer rendering to confuse screenshot-based AI:
  //   Layer 0: Adversarial decoy text (WRONG question, lighter)
  //   Layer 1: Background noise + high-frequency adversarial patterns
  //   Layer 2: Real question text with character-level distortion
  //   Layer 3: Post-render adversarial perturbation overlay
  // Humans read the dark text easily; AI models see overlapping
  // contradictory text and adversarial artifacts.
  // ============================================================

  const FONT_FAMILY =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Re-render timer — redraws canvas every few seconds with
  // different random seeds so each Cluely screenshot capture
  // gets different distortion patterns
  let _canvasReRenderTimer = null;

  // --- LAYER 0: Adversarial decoy text ---
  // Draws a WRONG version of the question in a semi-visible color
  // underneath the real text. AI models analyzing the screenshot
  // see BOTH texts and cannot determine which is real.
  // The decoy text leads to a WRONG answer (our trap option).
  function drawDecoyText(ctx, decoyText, startX, y, fontSize) {
    if (!decoyText) return;
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.font = "500 " + fontSize + "px " + FONT_FAMILY;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    // Draw decoy at slight offset so it overlaps but doesn't perfectly align
    ctx.fillStyle = "#64748b";
    ctx.fillText(decoyText, startX + 1.5, y + 0.8);
    // Second pass at different offset for more confusion
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#475569";
    ctx.fillText(decoyText, startX - 0.5, y - 0.5);
    ctx.restore();
  }

  // --- LAYER 1: Adversarial noise + high-frequency patterns ---
  function addAntiOCRNoise(ctx, width, height) {
    // Sub-layer 1a: Dense micro-dots (more than before)
    ctx.globalAlpha = 0.045;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle =
        Math.random() > 0.5
          ? "#94a3b8"
          : Math.random() > 0.5
            ? "#cbd5e1"
            : "#64748b";
      ctx.beginPath();
      ctx.arc(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 2.0 + 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Sub-layer 1b: Crossing hairlines
    ctx.globalAlpha = 0.04;
    ctx.lineWidth = 0.5;
    for (let j = 0; j < 12; j++) {
      ctx.strokeStyle = Math.random() > 0.5 ? "#475569" : "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      // Use bezier curves instead of straight lines — harder for OCR
      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
      );
      ctx.stroke();
    }

    // Sub-layer 1c: Adversarial high-frequency checkerboard
    // Neural networks are extremely sensitive to these patterns —
    // they disrupt the feature extraction in early CNN layers
    ctx.globalAlpha = 0.022;
    const blockSize = 3;
    for (let bx = 0; bx < width; bx += blockSize * 2) {
      for (let by = 0; by < height; by += blockSize * 2) {
        if (Math.random() > 0.7) {
          ctx.fillStyle =
            (bx + by) % (blockSize * 4) === 0 ? "#94a3b8" : "#cbd5e1";
          ctx.fillRect(bx, by, blockSize, blockSize);
        }
      }
    }

    // Sub-layer 1d: Decoy character fragments (larger and more numerous)
    ctx.globalAlpha = 0.035;
    const decoyChars = "abcdefghijklmnopqrstuvwxyz0123456789%$?+=";
    for (let d = 0; d < 20; d++) {
      ctx.font = 6 + Math.random() * 4 + "px " + FONT_FAMILY;
      ctx.fillStyle = Math.random() > 0.5 ? "#94a3b8" : "#b0b8c4";
      ctx.save();
      ctx.translate(Math.random() * width, Math.random() * height);
      ctx.rotate((Math.random() - 0.5) * 0.5);
      ctx.fillText(
        decoyChars[Math.floor(Math.random() * decoyChars.length)],
        0,
        0,
      );
      ctx.restore();
    }

    // Sub-layer 1e: Subtle vertical grid with slight wave
    ctx.globalAlpha = 0.02;
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 0.3;
    for (let gx = 0; gx < width; gx += 8 + Math.random() * 6) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx + Math.sin(gx * 0.1) * 4, height);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  // --- LAYER 2: Character-by-character anti-OCR text ---
  // Each character gets: micro-jitter, color variation, tiny rotation,
  // baseline wave (sine), horizontal width scaling, and stroke+fill
  // dual rendering for non-standard pixel patterns.
  function drawAntiOCRText(ctx, text, startX, y, opts) {
    opts = opts || {};
    const fontSize = opts.fontSize || 18;
    const weight = opts.weight || "500";
    const baseR = opts.r || 30;
    const baseG = opts.g || 41;
    const baseB = opts.b || 59;
    const jitterX = opts.jitterX !== undefined ? opts.jitterX : 1.5;
    const jitterY = opts.jitterY !== undefined ? opts.jitterY : 1.8;
    const rotRange = opts.rotRange || 0.03;
    const colorShift = opts.colorShift || 14;
    const waveAmplitude = opts.waveAmplitude || 1.0;
    const waveFrequency = opts.waveFrequency || 0.25;

    ctx.font = weight + " " + fontSize + "px " + FONT_FAMILY;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    let curX = startX;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      // Per-character color variation
      const dr = Math.floor((Math.random() - 0.5) * colorShift * 2);
      const dg = Math.floor((Math.random() - 0.5) * colorShift * 2);
      const db = Math.floor((Math.random() - 0.5) * colorShift * 2);
      const r = Math.max(0, Math.min(255, baseR + dr));
      const g = Math.max(0, Math.min(255, baseG + dg));
      const b = Math.max(0, Math.min(255, baseB + db));

      // Per-character micro-jitter
      const dx = (Math.random() - 0.5) * jitterX;
      const dy = (Math.random() - 0.5) * jitterY;
      const angle = (Math.random() - 0.5) * rotRange;

      // Baseline wave — text follows subtle sine curve
      const waveY = Math.sin(i * waveFrequency) * waveAmplitude;

      // Character width scaling (slight horizontal stretch/squeeze)
      const scaleX = 1 + (Math.random() - 0.5) * 0.06;

      ctx.save();
      ctx.translate(curX + dx, y + dy + waveY);
      ctx.scale(scaleX, 1);
      ctx.rotate(angle);

      // Dual rendering: thin stroke outline + fill
      // Creates non-standard pixel pattern that confuses OCR font matching
      if (Math.random() > 0.6) {
        ctx.strokeStyle = "rgb(" + r + "," + g + "," + (b + 20) + ")";
        ctx.lineWidth = 0.3;
        ctx.strokeText(ch, 0, 0);
      }
      ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      ctx.fillText(ch, 0, 0);

      ctx.restore();

      // Advance cursor with spacing variation
      curX += ctx.measureText(ch).width + (Math.random() - 0.5) * 0.8;
    }
  }

  // --- LAYER 3: Post-render adversarial perturbation ---
  // After all text is drawn, apply pixel-level perturbation
  // that disrupts neural network feature extraction.
  function addAdversarialPerturbation(ctx, width, height) {
    // Get the current pixel data
    const imageData = ctx.getImageData(
      0,
      0,
      width * (window.devicePixelRatio || 1),
      height * (window.devicePixelRatio || 1),
    );
    const data = imageData.data;
    const dpr = window.devicePixelRatio || 1;

    // Apply targeted perturbation only to pixels near text edges
    // (where dark meets light — the critical boundary for OCR)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const brightness = (r + g + b) / 3;

      // Target the transition zone between text (dark) and background (light)
      // This is where OCR detects character edges
      if (brightness > 60 && brightness < 200) {
        // Add high-frequency perturbation to edge pixels
        const perturbation = Math.floor((Math.random() - 0.5) * 16);
        data[i] = Math.max(0, Math.min(255, r + perturbation));
        data[i + 1] = Math.max(
          0,
          Math.min(
            255,
            g + perturbation + Math.floor((Math.random() - 0.5) * 8),
          ),
        );
        data[i + 2] = Math.max(0, Math.min(255, b + perturbation));
      }

      // Randomly perturb a few "clean" pixels to add noise
      if (Math.random() < 0.005) {
        data[i] = Math.max(
          0,
          Math.min(255, r + Math.floor((Math.random() - 0.5) * 30)),
        );
        data[i + 1] = Math.max(
          0,
          Math.min(255, g + Math.floor((Math.random() - 0.5) * 30)),
        );
        data[i + 2] = Math.max(
          0,
          Math.min(255, b + Math.floor((Math.random() - 0.5) * 30)),
        );
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // --- Helper: prepare a canvas element ---
  function prepCanvas(canvasId, w, h) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  // === QUESTION RENDERERS ===
  // Each question has: decoy text → noise → real text → perturbation
  // The decoy text contains the WRONG question that leads to a trap answer.

  // --- Q1: Real="What is 15% of 240?" Decoy="What is 25% of 200?" ---
  function renderQ1Canvas() {
    const ctx = prepCanvas("q1-canvas", 660, 50);
    if (!ctx) return;
    drawDecoyText(ctx, "What is 25% of 200?", 0, 25, 18);
    addAntiOCRNoise(ctx, 660, 50);
    drawAntiOCRText(ctx, "What is 15% of 240?", 0, 25);
    addAdversarialPerturbation(ctx, 660, 50);
  }

  // --- Q2: Real="similar to ABUNDANT" Decoy="opposite of ABUNDANT" ---
  function renderQ2Canvas() {
    const ctx = prepCanvas("q2-canvas", 660, 50);
    if (!ctx) return;
    drawDecoyText(
      ctx,
      'Which word means the opposite of "ABUNDANT"?',
      0,
      25,
      18,
    );
    addAntiOCRNoise(ctx, 660, 50);
    drawAntiOCRText(
      ctx,
      'Which word is most similar in meaning to "ABUNDANT"?',
      0,
      25,
    );
    addAdversarialPerturbation(ctx, 660, 50);
  }

  // --- Q3: Bar chart (canvas shows Marketing highest, DOM says Sales) ---
  function renderQ3Canvas() {
    const ctx = prepCanvas("q3-canvas", 660, 300);
    if (!ctx) return;

    const departments = [
      { name: "Sales", value: 32, color: "#60a5fa" },
      { name: "Marketing", value: 45, color: "#34d399" },
      { name: "Engineering", value: 28, color: "#fbbf24" },
      { name: "Finance", value: 21, color: "#f87171" },
    ];
    const maxVal = 50;
    const chartLeft = 70;
    const chartRight = 620;
    const chartTop = 30;
    const chartBottom = 260;
    const chartHeight = chartBottom - chartTop;
    const barWidth = 80;
    const gap =
      (chartRight - chartLeft - departments.length * barWidth) /
      (departments.length + 1);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 5; i++) {
      const y = chartTop + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.font = "11px " + FONT_FAMILY;
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("$" + (maxVal - i * 10) + "K", chartLeft - 8, y);
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    ctx.lineTo(chartRight, chartBottom);
    ctx.stroke();

    addAntiOCRNoise(ctx, 660, 300);

    departments.forEach((dept, i) => {
      const x = chartLeft + gap + i * (barWidth + gap);
      const barHeight = (dept.value / maxVal) * chartHeight;
      const y = chartBottom - barHeight;

      ctx.fillStyle = dept.color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 4);
      ctx.fill();

      ctx.font = "bold 12px " + FONT_FAMILY;
      ctx.fillStyle = "#334155";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("$" + dept.value + "K", x + barWidth / 2, y - 4);

      ctx.font = "12px " + FONT_FAMILY;
      ctx.fillStyle = "#64748b";
      ctx.textBaseline = "top";
      ctx.fillText(dept.name, x + barWidth / 2, chartBottom + 8);
    });

    addAdversarialPerturbation(ctx, 660, 300);
  }

  // --- Q4: Real="60 mph for 2.5 hours" Decoy="60 mph for 3 hours" ---
  function renderQ4Canvas() {
    const ctx = prepCanvas("q4-canvas", 660, 50);
    if (!ctx) return;
    drawDecoyText(
      ctx,
      "If a train travels at 60 mph for 3 hours, how far does it travel?",
      0,
      25,
      17,
    );
    addAntiOCRNoise(ctx, 660, 50);
    drawAntiOCRText(
      ctx,
      "If a train travels at 60 mph for 2.5 hours, how far does it travel?",
      0,
      25,
      { fontSize: 17 },
    );
    addAdversarialPerturbation(ctx, 660, 50);
  }

  // --- Q5: Real="2, 4, 8, 16, ___" Decoy="2, 6, 18, 54, ___" ---
  function renderQ5Canvas() {
    const ctx = prepCanvas("q5-canvas", 660, 50);
    if (!ctx) return;
    drawDecoyText(
      ctx,
      "Complete the number pattern: 2, 6, 18, 54, ___",
      0,
      25,
      18,
    );
    addAntiOCRNoise(ctx, 660, 50);
    drawAntiOCRText(
      ctx,
      "Complete the number pattern: 2, 4, 8, 16, ___",
      0,
      25,
    );
    addAdversarialPerturbation(ctx, 660, 50);
  }

  function initCanvases() {
    renderQ1Canvas();
    renderQ2Canvas();
    renderQ3Canvas();
    renderQ4Canvas();
    renderQ5Canvas();

    // Re-render canvases every 4 seconds with new random seeds
    // so each Cluely screenshot capture gets different distortion
    _canvasReRenderTimer = setInterval(function () {
      const active = document.querySelector(".question-card:not(.hidden)");
      if (!active) return;
      const qId = active.getAttribute("data-question");
      if (qId === "q1") renderQ1Canvas();
      else if (qId === "q2") renderQ2Canvas();
      else if (qId === "q3") renderQ3Canvas();
      else if (qId === "q4") renderQ4Canvas();
      else if (qId === "q5") renderQ5Canvas();
    }, 4000);
  }

  // --- Screen management ---

  function showScreen(screenId) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $(`#${screenId}`).classList.add("active");
  }

  function updateProgress() {
    const idx = questionOrder.indexOf(currentQuestion);
    const pct = (idx / totalQuestions) * 100;
    $("#progress-fill").style.width = `${pct}%`;
    $("#question-counter").textContent =
      `Question ${idx + 1} of ${totalQuestions}`;
    // Update question type badge
    const card = $(`#${currentQuestion}`);
    if (card && card.dataset.type) {
      $("#question-type").textContent = card.dataset.type;
    }
  }

  function startTimer() {
    assessmentStartTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - assessmentStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      $("#timer").textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function showQuestion(qId) {
    $$(".question-card").forEach((q) => q.classList.add("hidden"));
    $(`#${qId}`).classList.remove("hidden");
    currentQuestion = qId;
    questionStartTime = Date.now();
    $("#next-btn").disabled = true;
    // Update button text for last question
    const idx = questionOrder.indexOf(qId);
    $("#next-btn").textContent =
      idx === questionOrder.length - 1 ? "Submit Assessment" : "Next Question";
    updateProgress();
  }

  function getSelectedOption(qId) {
    const checked = $(`input[name="${qId}"]:checked`);
    return checked ? checked.value : null;
  }

  // --- Registration form validation ---

  function validateForm() {
    let valid = true;
    const firstName = $("#reg-firstName").value.trim();
    const lastName = $("#reg-lastName").value.trim();
    const email = $("#reg-email").value.trim();
    const consent = $("#reg-consent").checked;

    // Clear previous errors
    $$(".form-error").forEach((e) => (e.textContent = ""));
    $$(".form-group input").forEach((e) => e.classList.remove("invalid"));

    if (!firstName) {
      $("#err-firstName").textContent = "First name is required";
      $("#reg-firstName").classList.add("invalid");
      valid = false;
    }
    if (!lastName) {
      $("#err-lastName").textContent = "Last name is required";
      $("#reg-lastName").classList.add("invalid");
      valid = false;
    }
    if (!email) {
      $("#err-email").textContent = "Email is required";
      $("#reg-email").classList.add("invalid");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $("#err-email").textContent = "Please enter a valid email address";
      $("#reg-email").classList.add("invalid");
      valid = false;
    }
    if (!consent) {
      $("#err-consent").textContent = "You must agree to the integrity policy";
      valid = false;
    }

    return valid
      ? { firstName, lastName, email, phone: $("#reg-phone").value.trim() }
      : null;
  }

  // --- API calls ---

  async function startSession(info) {
    try {
      const res = await fetch(API_BASE_URL + "/api/start-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateInfo: info }),
      });
      const data = await res.json();
      sessionId = data.sessionId;
      if (window.IntegrityMonitor) {
        window.IntegrityMonitor.init(sessionId);
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }

  async function submitAnswer(qId, option, responseTimeMs) {
    try {
      const res = await fetch(API_BASE_URL + "/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: qId,
          selectedOption: option,
          responseTimeMs,
        }),
      });
      return await res.json();
    } catch (err) {
      console.error("Failed to submit answer:", err);
      return { nextQuestion: null };
    }
  }

  async function completeSession() {
    try {
      if (window.IntegrityMonitor) {
        await window.IntegrityMonitor.flushSignals();
      }
      const res = await fetch(API_BASE_URL + "/api/complete-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (window.IntegrityMonitor) {
        window.IntegrityMonitor.destroy();
      }
      return await res.json();
    } catch (err) {
      console.error("Failed to complete session:", err);
      return null;
    }
  }

  function renderResults(data) {
    if (!data) {
      $("#results-content").innerHTML = "<p>Error loading results.</p>";
      return;
    }

    const scoreClass =
      data.integrityScore >= 80
        ? "success"
        : data.integrityScore >= 50
          ? "warning"
          : "danger";
    const durationSec = Math.round(data.durationMs / 1000);

    const verdictLabels = {
      clean: "Human",
      inconclusive: "Inconclusive",
      suspicious: "Suspicious",
      ai_detected: "AI Detected",
    };
    const verdictLabel = verdictLabels[data.verdict] || "Unknown";

    let flagsHtml = "";
    if (data.flags && data.flags.length > 0) {
      flagsHtml = `
        <div class="flags-list full-width">
          <div class="result-label">Detection Signals</div>
          ${data.flags
            .map(
              (f) => `
            <div class="flag-item flag-${f.severity}">
              <span>${f.severity === "critical" ? "\u{1F6A8}" : f.severity === "low" ? "\u{2139}\u{FE0F}" : "\u{26A0}\u{FE0F}"}</span>
              <span>${f.message}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    }

    let analysisHtml = "";
    if (data.analysis) {
      analysisHtml = `
        <div class="analysis-box full-width">
          <div class="result-label">Why This Verdict?</div>
          <p class="analysis-note">${data.analysis.falsePositiveNote}</p>
          <div class="analysis-details">
            <span>Trap answers: <strong>${data.analysis.trapCount}/${data.analysis.totalTraps}</strong></span>
            <span>Avg speed: <strong>${Math.round(data.analysis.avgResponseTimeMs / 1000)}s/question</strong> (${data.analysis.speedFlag})</span>
          </div>
        </div>
      `;
    }

    $("#results-content").innerHTML = `
      <div class="results-grid">
        <div class="result-item">
          <div class="result-label">Integrity Score</div>
          <div class="result-value ${scoreClass}">${data.integrityScore}/100</div>
        </div>
        <div class="result-item">
          <div class="result-label">Trap Answers Hit</div>
          <div class="result-value">${data.trapsTriggered} / ${data.totalTraps}</div>
        </div>
        <div class="result-item">
          <div class="result-label">Duration</div>
          <div class="result-value">${durationSec}s</div>
        </div>
        <div class="result-item">
          <div class="result-label">Verdict</div>
          <div class="result-value ${scoreClass}">${verdictLabel}</div>
        </div>
        ${analysisHtml}
        ${flagsHtml}
      </div>
    `;
  }

  // --- Event listeners ---

  document.addEventListener("click", (e) => {
    const option = e.target.closest(".option");
    if (!option) return;

    const questionCard = option.closest(".question-card");
    if (!questionCard) return;

    questionCard
      .querySelectorAll(".option")
      .forEach((o) => o.classList.remove("selected"));
    option.classList.add("selected");
    option.querySelector('input[type="radio"]').checked = true;
    $("#next-btn").disabled = false;
  });

  // Landing → Registration form
  $("#start-btn").addEventListener("click", () => {
    // Re-run extension check when user clicks Start Assessment
    // User may have opened page hours ago; extensions could have injected since
    const detectedAI = detectAiBrowserType();
    if (detectedAI) {
      if (!runLockoutCheck()) {
        lockoutTriggered = true;
        return;
      }
    }
    showScreen("register-screen");
  });

  // Registration form submission → go to proctoring setup
  let _proctorStream = null;

  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const info = validateForm();
    if (!info) return;

    // Re-run extension check before proceeding to proctoring setup
    // Extensions may have injected after initial page load
    const detectedAI = detectAiBrowserType();
    if (detectedAI) {
      if (!runLockoutCheck()) {
        lockoutTriggered = true;
        return;
      }
    }

    candidateInfo = info;
    const btn = $("#register-btn");
    btn.disabled = true;
    btn.textContent = "Starting...";

    await startSession(info);

    // Set candidate name in topbar
    $("#candidate-name").textContent = info.firstName + " " + info.lastName;

    // Go to proctoring setup screen
    showScreen("proctor-setup");
    initProctorSetup();
  });

  // --- Proctoring Setup Logic ---
  function initProctorSetup() {
    const setupVideo = $("#proctor-setup-video");
    const setupMsg = $("#proctor-setup-msg");
    const cameraCheck = $("#check-camera");
    const cameraIcon = $("#check-camera-icon");
    const faceCheck = $("#check-face");
    const faceIcon = $("#check-face-icon");
    const lightCheck = $("#check-lighting");
    const lightIcon = $("#check-lighting-icon");
    // const peripheralCheck = $("#check-peripherals");
    // const peripheralIcon = $("#check-peripherals-icon");
    // const eyetrackCheck = $("#check-eyetracking");
    // const eyetrackIcon = $("#check-eyetracking-icon");
    const readyBtn = $("#proctor-ready-btn");

    let faceDetected = false;
    let lightingOk = false;
    // let peripheralsOk = false;
    // let eyetrackingCalibrated = false;
    let faceApiReady = false;
    // let webgazerReady = false;
    // let calibrationStarted = false;
    let setupCheckTimer = null;
    let extensionCheckTimer = null;

    // --- Continuous extension check during proctoring setup ---
    // Extensions may inject at any time; check every 2 seconds
    // No timeout — keeps running until user clicks Begin Assessment
    extensionCheckTimer = setInterval(() => {
      const detectedAI = detectAiBrowserType();
      if (detectedAI) {
        clearInterval(extensionCheckTimer);
        if (setupCheckTimer) clearInterval(setupCheckTimer);
        if (!runLockoutCheck()) {
          lockoutTriggered = true;
        }
      }
    }, 2000);

    // --- Phase 1: Load face-api.js + WebGazer models in background ---
    setupMsg.textContent = "Loading detection models...";
    if (window.IntegrityMonitor && window.IntegrityMonitor.loadFaceApiModels) {
      window.IntegrityMonitor.loadFaceApiModels().then((loaded) => {
        faceApiReady = loaded;
        if (loaded) {
          console.log("[Proctor] face-api.js models loaded successfully");
        } else {
          console.warn("[Proctor] face-api.js unavailable, using fallback");
        }
      });
    }

    /* --- WebGazer + Peripheral/device detection disabled for now ---
    // Initialize WebGazer in background (non-blocking)
    if (window.IntegrityMonitor && window.IntegrityMonitor.initWebGazer) {
      window.IntegrityMonitor.initWebGazer().then((ready) => {
        webgazerReady = ready;
        if (ready) {
          console.log("[Proctor] WebGazer initialized — awaiting calibration");
        } else {
          console.warn(
            "[Proctor] WebGazer unavailable — eye tracking disabled",
          );
          eyetrackingCalibrated = true;
          eyetrackCheck.classList.add("passed");
          eyetrackIcon.innerHTML = "&#10003;";
          const label = eyetrackCheck.querySelector("span:last-child");
          if (label) label.textContent = "Eye tracking (unavailable — skipped)";
        }
      });
    } else {
      eyetrackingCalibrated = true;
      eyetrackCheck.classList.add("passed");
      eyetrackIcon.innerHTML = "&#10003;";
    }

    // --- Phase 2: Peripheral / multi-screen detection ---
    // Step A: Run basic checks (screen.isExtended, resolution, DPR, devices)
    // These don't require user gesture
    const scanBtn = $("#scan-displays-btn");
    let basicWarnings = [];

    if (window.IntegrityMonitor && window.IntegrityMonitor.detectPeripherals) {
      window.IntegrityMonitor.detectPeripherals().then((warnings) => {
        basicWarnings = warnings;
        applyPeripheralResults(warnings);
      });
    } else {
      peripheralsOk = true;
      peripheralCheck.classList.add("passed");
      peripheralIcon.innerHTML = "&#10003;";
      if (scanBtn) scanBtn.style.display = "none";
    }

    // Step B: "Scan Displays" button triggers getScreenDetails() with user gesture
    // This is the ONLY way to get the browser permission prompt
    if (scanBtn) {
      scanBtn.addEventListener("click", async () => {
        scanBtn.textContent = "Scanning...";
        scanBtn.disabled = true;
        try {
          if ("getScreenDetails" in window) {
            const screenDetails = await window.getScreenDetails();
            if (screenDetails.screens && screenDetails.screens.length > 1) {
              const screenInfo = screenDetails.screens
                .map(
                  (s) =>
                    `${s.label || "Display"} (${s.width}x${s.height}, ${s.isPrimary ? "primary" : "external"})`,
                )
                .join(", ");
              basicWarnings.push({
                type: "multi_screen_detail",
                detail: `${screenDetails.screens.length} screens detected: ${screenInfo}`,
              });
              if (window.IntegrityMonitor) {
                window.IntegrityMonitor.addSignal(
                  "multi_screen_detail",
                  `${screenDetails.screens.length} screens detected: ${screenInfo}`,
                );
              }
              applyPeripheralResults(basicWarnings);
            }
            // Listen for screen changes during the session
            if (screenDetails.addEventListener) {
              screenDetails.addEventListener("screenschange", () => {
                if (
                  screenDetails.screens.length > 1 &&
                  window.IntegrityMonitor
                ) {
                  window.IntegrityMonitor.addSignal(
                    "external_monitor",
                    "Screen configuration changed — now " +
                      screenDetails.screens.length +
                      " screens.",
                  );
                }
              });
            }
          }
          // Also enumerate media devices (detect extra webcams, USB audio = hub indicator)
          if (
            navigator.mediaDevices &&
            navigator.mediaDevices.enumerateDevices
          ) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === "videoinput");
            const audioOutputs = devices.filter(
              (d) => d.kind === "audiooutput",
            );
            // Multiple video inputs = external webcam or capture card
            if (videoInputs.length > 1) {
              const devNames = videoInputs
                .map((d) => d.label || "Camera")
                .join(", ");
              basicWarnings.push({
                type: "external_device",
                detail: `${videoInputs.length} cameras detected (${devNames}) — external webcam or capture card connected.`,
              });
              if (window.IntegrityMonitor) {
                window.IntegrityMonitor.addSignal(
                  "external_device",
                  `${videoInputs.length} cameras: ${devNames}`,
                );
              }
            }
            // Many audio outputs = USB hub / dock with audio
            if (audioOutputs.length > 3) {
              basicWarnings.push({
                type: "external_device",
                detail: `${audioOutputs.length} audio outputs detected — USB hub or dock connected.`,
              });
              if (window.IntegrityMonitor) {
                window.IntegrityMonitor.addSignal(
                  "external_device",
                  `${audioOutputs.length} audio outputs — USB hub/dock detected.`,
                );
              }
            }
            // Log diagnostic info
            console.log(
              "[Proctor] Devices:",
              devices.map((d) => `${d.kind}: ${d.label || "(no label)"}`),
            );
          }
        } catch (e) {
          console.warn("[Proctor] Scan failed:", e.message);
        }

        // Log screen diagnostics
        console.log(
          "[Proctor] Screen info:",
          "resolution=" + screen.width + "x" + screen.height,
          "DPR=" + window.devicePixelRatio,
          "isExtended=" + (screen.isExtended || false),
          "colorDepth=" + screen.colorDepth,
        );

        applyPeripheralResults(basicWarnings);
        scanBtn.textContent = "Scanned ✓";
        scanBtn.classList.add("done");
      });
    }

    function applyPeripheralResults(warnings) {
      // disabled
    }
    --- end of disabled block */

    // --- Phase 3: Request webcam ---
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      })
      .then((stream) => {
        _proctorStream = stream;
        setupVideo.srcObject = stream;
        setupVideo.play();

        // Camera check passed
        cameraCheck.classList.add("passed");
        cameraIcon.innerHTML = "&#10003;";
        setupMsg.textContent = "Position your face in the oval";

        // Setup analysis canvas
        const setupCanvas = document.createElement("canvas");
        setupCanvas.width = 320;
        setupCanvas.height = 240;
        const setupCtx = setupCanvas.getContext("2d", {
          willReadFrequently: true,
        });

        // --- Face detection loop (uses face-api.js when ready) ---
        setupCheckTimer = setInterval(async () => {
          if (setupVideo.readyState < 2) return;
          setupCtx.drawImage(setupVideo, 0, 0, 320, 240);

          // Priority 1: face-api.js (reliable across all browsers)
          if (faceApiReady && typeof faceapi !== "undefined") {
            try {
              const options = new faceapi.TinyFaceDetectorOptions({
                inputSize: 224,
                scoreThreshold: 0.4,
              });
              const detections = await faceapi
                .detectAllFaces(setupCanvas, options)
                .withFaceLandmarks(true);
              updateSetupChecks(detections.length, setupCtx);
              return;
            } catch (e) {
              // Fall through to fallback
            }
          }

          // Priority 2: Native FaceDetector API
          if (typeof window.FaceDetector === "function") {
            try {
              const detector = new window.FaceDetector({
                fastMode: true,
                maxDetectedFaces: 5,
              });
              const faces = await detector.detect(setupCanvas);
              updateSetupChecks(faces.length, setupCtx);
              return;
            } catch (e) {
              // Fall through
            }
          }

          // Priority 3: Skin-tone fallback
          fallbackSetupCheck(setupCtx);
        }, 600);

        function fallbackSetupCheck(ctx) {
          const imageData = ctx.getImageData(0, 0, 320, 240);
          const data = imageData.data;
          let skinPixels = 0;
          let totalPixels = 0;
          let brightnessSum = 0;

          for (let y = 30; y < 210; y++) {
            for (let x = 80; x < 240; x++) {
              const idx = (y * 320 + x) * 4;
              const r = data[idx],
                g = data[idx + 1],
                b = data[idx + 2];
              const cb = 128 + (-0.168736 * r - 0.331264 * g + 0.5 * b);
              const cr = 128 + (0.5 * r - 0.418688 * g - 0.081312 * b);
              if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) skinPixels++;
              totalPixels++;
              brightnessSum += (r + g + b) / 3;
            }
          }

          const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
          const avgBrightness =
            totalPixels > 0 ? brightnessSum / totalPixels : 0;
          const faceCount = skinRatio > 0.04 ? 1 : 0;

          updateSetupChecks(faceCount, null, avgBrightness);
        }

        function updateSetupChecks(faceCount, ctx, avgBright) {
          // Face check
          if (faceCount >= 1) {
            if (!faceDetected) {
              faceDetected = true;
              faceCheck.classList.add("passed");
              faceIcon.innerHTML = "&#10003;";
            }
          } else {
            faceDetected = false;
            faceCheck.classList.remove("passed");
            faceIcon.innerHTML = "&#9675;";
          }

          // Lighting check
          let brightness = avgBright;
          if (brightness === undefined && ctx) {
            const imgData = ctx.getImageData(0, 0, 320, 240);
            let sum = 0;
            for (let i = 0; i < imgData.data.length; i += 16) {
              sum +=
                (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) /
                3;
            }
            brightness = sum / (imgData.data.length / 16);
          }

          if (brightness > 50 && brightness < 240) {
            if (!lightingOk) {
              lightingOk = true;
              lightCheck.classList.add("passed");
              lightIcon.innerHTML = "&#10003;";
            }
          } else {
            lightingOk = false;
            lightCheck.classList.remove("passed");
            lightIcon.innerHTML = "&#9675;";
          }

          // Update message and button (require face + lighting only)
          if (faceDetected && lightingOk) {
            setupMsg.textContent = "Ready! Click Begin Assessment";
            readyBtn.disabled = false;
          } else if (faceDetected && !lightingOk) {
            setupMsg.textContent = "Adjust lighting — too dark or too bright";
            readyBtn.disabled = true;
          } else if (!faceDetected) {
            setupMsg.textContent = faceApiReady
              ? "Position your face in the oval"
              : "Loading detection models... position your face";
            readyBtn.disabled = true;
          } else {
            setupMsg.textContent = "Checking environment...";
            readyBtn.disabled = true;
          }
        }

        /* --- Eye tracking calibration disabled for now ---
        function startCalibration() { ... }
        --- end disabled block */
      })
      .catch(() => {
        setupMsg.textContent = "Camera access denied";
        if (window.IntegrityMonitor) {
          window.IntegrityMonitor.addSignal(
            "webcam_denied",
            "Webcam access denied — proctoring unavailable",
          );
        }
        // Allow proceeding without camera (but flagged)
        readyBtn.disabled = false;
        readyBtn.textContent = "Continue Without Camera";
      });

    // Begin Assessment button
    readyBtn.addEventListener("click", () => {
      // Re-run extension check before starting assessment
      // Extensions may have injected during proctoring setup
      const detectedAI = detectAiBrowserType();
      if (detectedAI) {
        if (!runLockoutCheck()) {
          lockoutTriggered = true;
          // Stop setup detection loops
          if (setupCheckTimer) clearInterval(setupCheckTimer);
          if (extensionCheckTimer) clearInterval(extensionCheckTimer);
          return;
        }
      }

      // Stop setup detection loops
      if (setupCheckTimer) clearInterval(setupCheckTimer);
      if (extensionCheckTimer) clearInterval(extensionCheckTimer);

      // Stop the setup video preview
      if (setupVideo.srcObject) {
        setupVideo.pause();
      }

      // Initialize the proctoring engine with the stream
      if (_proctorStream && window.IntegrityMonitor) {
        window.IntegrityMonitor.initProctoring(_proctorStream);
        // Register real-time enforcement callback
        window.IntegrityMonitor.setViolationCallback(handleProctorViolation);
        // Eye gaze tracking disabled for now
        // if (window.IntegrityMonitor.startGazeTracking) {
        //   window.IntegrityMonitor.startGazeTracking();
        // }
      }

      // Transition to assessment
      showScreen("question-screen");
      showQuestion("q1");
      startTimer();
      initCanvases();
    });
  }

  // =============================================================
  // REAL-TIME PROCTORING ENFORCEMENT
  // Called by IntegrityMonitor when violation levels change.
  // Level 0 = OK, 1 = Warning, 2 = Paused, 3 = Auto-submit
  // =============================================================
  let _timerPaused = false;
  let _pausedElapsedMs = 0;
  let _autoSubmitting = false;
  let _warningOverlayTimerInterval = null;

  function handleProctorViolation(level, reason) {
    const overlay = $("#proctor-warning-overlay");
    const title = $("#proctor-warning-title");
    const message = $("#proctor-warning-message");
    const timerEl = $("#proctor-warning-timer");
    if (!overlay) return;

    // --- Level 0: All clear — dismiss overlay, resume timer ---
    if (level === 0) {
      overlay.classList.add("hidden");
      overlay.className = "proctor-warning-overlay hidden";
      if (_warningOverlayTimerInterval) {
        clearInterval(_warningOverlayTimerInterval);
        _warningOverlayTimerInterval = null;
      }
      if (_timerPaused) {
        resumeTimer();
      }
      return;
    }

    // --- Level 1: Warning (yellow) — show overlay but don't pause ---
    if (level === 1) {
      overlay.className = "proctor-warning-overlay level-1";
      title.textContent = "⚠ Proctoring Warning";
      message.textContent = reason;
      timerEl.textContent =
        "This warning will be recorded. Please comply to continue.";
      // Resume timer if it was paused (e.g., downgraded from level 2)
      if (_timerPaused) {
        resumeTimer();
      }
      return;
    }

    // --- Level 2: Assessment Paused (red) — blur questions, stop timer ---
    if (level === 2) {
      overlay.className = "proctor-warning-overlay level-2";
      title.textContent = "⛔ Assessment Paused";
      message.textContent = reason;
      if (!_timerPaused) {
        pauseTimer();
      }
      // Show countdown to auto-submit
      if (_warningOverlayTimerInterval)
        clearInterval(_warningOverlayTimerInterval);
      _warningOverlayTimerInterval = setInterval(() => {
        const summary = window.IntegrityMonitor
          ? window.IntegrityMonitor.getProctoringSummary()
          : null;
        if (summary) {
          const totalAbsent = summary.totalFaceAbsentMs;
          const remaining = Math.max(
            0,
            Math.ceil((90000 - totalAbsent) / 1000),
          );
          timerEl.textContent =
            "Assessment will auto-submit in " +
            remaining +
            "s if face is not detected.";
        }
      }, 1000);
      return;
    }

    // --- Level 3: Auto-submit (critical) ---
    if (level === 3 && !_autoSubmitting) {
      _autoSubmitting = true;
      overlay.className = "proctor-warning-overlay level-3";
      title.textContent = "⛔ Assessment Terminated";
      message.textContent =
        "Your face was not detected for an extended period. The assessment is being submitted automatically.";
      timerEl.textContent = "Submitting...";
      if (_warningOverlayTimerInterval) {
        clearInterval(_warningOverlayTimerInterval);
        _warningOverlayTimerInterval = null;
      }

      // Add auto-submit signal
      if (window.IntegrityMonitor) {
        window.IntegrityMonitor.addSignal(
          "proctor_auto_submit",
          "Assessment auto-submitted due to prolonged face absence (>90s cumulative).",
        );
      }

      // Auto-submit after brief delay so user sees the message
      setTimeout(async () => {
        clearInterval(timerInterval);
        if (_canvasReRenderTimer) clearInterval(_canvasReRenderTimer);
        const pip = $("#proctor-pip");
        if (pip) pip.style.display = "none";
        overlay.classList.add("hidden");
        const finalResults = await completeSession();
        showScreen("results");
        renderResults(finalResults);
      }, 2500);
    }
  }

  function pauseTimer() {
    if (_timerPaused) return;
    _timerPaused = true;
    _pausedElapsedMs = Date.now() - assessmentStartTime;
    clearInterval(timerInterval);
    // Visual indicator that timer is paused
    const timerEl = $("#timer");
    if (timerEl) {
      timerEl.style.color = "#dc2626";
      timerEl.textContent += " ⏸";
    }
  }

  function resumeTimer() {
    if (!_timerPaused) return;
    _timerPaused = false;
    // Adjust start time to account for paused duration
    assessmentStartTime = Date.now() - _pausedElapsedMs;
    // Restart timer interval
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - assessmentStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      $("#timer").textContent = `${mins}:${secs}`;
    }, 1000);
    // Reset timer styling
    const timerEl = $("#timer");
    if (timerEl) {
      timerEl.style.color = "";
    }
  }

  $("#next-btn").addEventListener("click", async () => {
    const option = getSelectedOption(currentQuestion);
    if (!option) return;

    const btn = $("#next-btn");
    btn.disabled = true;

    const responseTimeMs = Date.now() - questionStartTime;

    // Record timing for behavioral analysis (Cluely detection)
    if (
      window.IntegrityMonitor &&
      window.IntegrityMonitor.recordQuestionTiming
    ) {
      window.IntegrityMonitor.recordQuestionTiming(
        currentQuestion,
        responseTimeMs,
        option,
      );
    }

    const result = await submitAnswer(currentQuestion, option, responseTimeMs);

    if (result.nextQuestion) {
      showQuestion(result.nextQuestion);
    } else {
      clearInterval(timerInterval);
      if (_canvasReRenderTimer) clearInterval(_canvasReRenderTimer);
      btn.textContent = "Submitting...";
      // Hide proctoring PIP before leaving question screen
      const pip = $("#proctor-pip");
      if (pip) pip.style.display = "none";
      const finalResults = await completeSession();
      showScreen("results");
      renderResults(finalResults);
    }
  });

  // Render canvases on load
  initCanvases();
})();
