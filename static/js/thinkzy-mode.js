/**
 * Thinkzy editor-chrome customisation for TurboWarp.
 *
 * Loaded by editor.html (referenced from src/playground/index.ejs). Activates
 * when the iframe URL contains `?thinkzy=true` and adapts further when
 * `?mission=2-X` is present (Phase 2 Space Dodger missions).
 *
 * Two layers:
 *   1. `?thinkzy=true` → hide menu bar, compact tabs, custom play/stop pill,
 *      draggable workspace ↔ stage divider with Pointer Capture.
 *   2. `?mission=2-X` → adds `body.thinkzy-mode-2-X` so per-mission CSS
 *      rules (sprite library, backdrop, sounds tab) can scope chrome-hiding.
 *
 * Source-controlled (not a hand-edited build artifact). Survives
 * `npm run clean && npm run build` because CopyWebpackPlugin copies
 * `static/` → `build/` on every build.
 */
(function () {
  'use strict';

  // ── Apply mission-specific body class from URL param early ──────────
  // Runs before TurboWarp mounts so per-mission CSS rules don't flash.
  try {
    var u = new URL(window.location.href);
    var mission = u.searchParams.get('mission');
    if (mission && /^2-[1-5]$/.test(mission)) {
      var apply = function () {
        if (!document.body) return;
        document.body.classList.add('thinkzy-mode-' + mission);
        document.body.classList.add('thinkzy-mode-2');
      };
      if (document.body) apply();
      else document.addEventListener('DOMContentLoaded', apply);
    }
  } catch (e) { /* ignore */ }

  // ── Bail out if we're not in Thinkzy embed mode ─────────────────────
  if (location.search.indexOf('thinkzy=true') === -1) return;

  // ── Inject Thinkzy CSS ──────────────────────────────────────────────
  var s = document.createElement('style');
  s.textContent = [
    /* ── HIDE unnecessary chrome ──────────────────────────── */
    /* Menu bar items except green flag + stop */
    '[class*="menu-bar_main-menu"] { display: none !important; }',
    '[class*="menu-bar_account-info"] { display: none !important; }',
    '[class*="menu-bar_file-group"] { display: none !important; }',
    /* Hide ALL menu-bar items — green flag is in stage header, not here */
    '[class*="menu-bar_menu-bar-item"] { display: none !important; }',
    /* Compact menu bar — just a thin strip */
    '[class*="menu-bar_menu-bar"] { height: 0px !important; min-height: 0px !important; padding: 0 !important; overflow: hidden !important; }',
    /* Hide backpack & alerts only */
    '[class*="backpack_backpack-container"] { display: none !important; }',
    '[class*="alerts_alerts-inner"] { display: none !important; }',
    /* KEEP tab bar (Code/Costumes/Sounds) — compact it */
    '[class*="gui_tab-list"] { height: 32px !important; min-height: 32px !important; }',
    '[class*="gui_tab-list"] li { font-size: 11px !important; padding: 4px 10px !important; }',
    /* Hide Extensions + My Blocks category buttons */
    '.scratchCategoryMenu .categoryMenuItem:last-child { display: none !important; }',
    '.scratchCategoryMenu .categoryMenuItem:nth-last-child(2) { display: none !important; }',
    /* Sprite selector pane — flexible height, scrollable */
    '[class*="sprite-selector_sprite-selector"] { min-height: unset !important; }',
    /* Hide stage header entirely — we inject custom play/stop buttons via JS */
    '[class*="stage-header_stage-header-wrapper"] { display: none !important; }',
    /* Compact category items */
    '.scratchCategoryMenu .categoryMenuItem { padding: 4px 6px !important; min-height: 28px !important; font-size: 11px !important; }',
    /* ── Layout: gui_flex-wrapper is the REAL parent (editor | stage) ── */
    '[class*="gui_flex-wrapper"] { display: flex !important; flex-direction: row !important; overflow: hidden !important; }',
    /* Editor: 50% default (no !important on width — JS divider overrides it) */
    '[class*="gui_editor-wrapper"] { flex: none !important; width: 50%; min-width: 200px !important; overflow: hidden !important; }',
    /* Stage panel: fill ALL remaining space */
    '[class*="gui_stage-and-target-wrapper"] { flex: 1 1 0% !important; min-width: 200px !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; }',
    /* Stage wrapper: fill container width, let height be proportional */
    '[class*="stage-wrapper_stage-wrapper"] { width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; overflow: hidden !important; }',
    /* Stage canvas area: override inline 480px width to fill parent */
    '[class*="stage_stage"] { width: 100% !important; height: auto !important; aspect-ratio: 4/3 !important; }',
    '[class*="stage_stage"] > div { width: 100% !important; height: 100% !important; }',
    '[class*="stage_stage"] canvas { width: 100% !important; height: 100% !important; }',
    /* Stage overlays match */
    '[class*="stage_stage-overlays"] { width: 100% !important; }',
    '[class*="stage_stage-bottom-wrapper"] { width: 100% !important; height: auto !important; aspect-ratio: 4/3 !important; }',
    /* Sprite info pane: fill remaining vertical space */
    '[class*="gui_target-wrapper"] { flex: 1 1 auto !important; max-height: none !important; background: #e8edf1 !important; overflow-y: auto !important; }',
    /* Hide stage size toggle */
    '[class*="stage-header_stage-size-toggle-group"] { display: none !important; }',
    /* ── Draggable divider ── */
    '.thinkzy-divider { flex: 0 0 10px !important; cursor: col-resize; z-index: 100; background: #2a2a3a; transition: background 0.15s; display: flex; align-items: center; justify-content: center; position: relative; }',
    '.thinkzy-divider:hover, .thinkzy-divider.dragging { background: #FF9F1C; }',
    '.thinkzy-divider::before { content: ""; position: absolute; top: 0; left: -6px; right: -6px; bottom: 0; z-index: 101; }',
    '.thinkzy-divider::after { content: "\u22ee\u22ee"; color: rgba(255,255,255,0.7); font-size: 12px; letter-spacing: 2px; pointer-events: none; writing-mode: vertical-lr; }',
    /* Pulse animation for guided steps */
    '@keyframes thinkzy-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,159,28,0.7); } 50% { box-shadow: 0 0 0 10px rgba(255,159,28,0); } 100% { box-shadow: 0 0 0 0 rgba(255,159,28,0); } }',
    '.thinkzy-pulse { animation: thinkzy-pulse 1.2s ease-in-out infinite !important; outline: 3px solid #FF9F1C !important; outline-offset: 2px !important; border-radius: 8px !important; z-index: 10 !important; position: relative !important; }',
    '.thinkzy-dimmed { opacity: 0.2 !important; pointer-events: none !important; filter: grayscale(1) !important; }',
    /* ── PHASE 2 mission-specific UI hiding ──────────────────────── */
    /* Add Sprite "+" button — sprites are pre-loaded per mission via */
    /* the starter .sb3, kids should not be adding random ones.       */
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-add-sprite) [class*="sprite-selector_add-button"] { display: none !important; }',
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-add-sprite) [class*="action-menu_main-button"] { display: none !important; }',
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-add-sprite) button[aria-label*="Choose a Sprite" i] { display: none !important; }',
    /* Add Backdrop — only allowed in 2-4 / 2-5                      */
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-backdrop) [class*="stage-selector_add-button"] { display: none !important; }',
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-backdrop) button[aria-label*="Choose a Backdrop" i] { display: none !important; }',
    /* Sounds tab — only allowed in 2-5                               */
    'body[class*="thinkzy-mode-2"]:not(.thinkzy-allow-sound) [class*="react-tabs_react-tabs__tab"]:nth-of-type(3) { display: none !important; }',
    /* Find / search box — distracts kids during step-by-step builds */
    'body[class*="thinkzy-mode-2"] input[type="search"] { display: none !important; }',
    'body[class*="thinkzy-mode-2"] [class*="menu-bar_title-field"] { display: none !important; }',
    'body[class*="thinkzy-mode-2"] [class*="author-info_project-title"] { display: none !important; }'
  ].join('\n');
  document.head.appendChild(s);

  // ── Wait for TurboWarp to render, then inject draggable divider ──
  var _setupDone = false;
  function setupThinkzyLayout() {
    if (_setupDone) return;
    var flexWrapper = document.querySelector('[class*="gui_flex-wrapper"]');
    var editorWrapper = document.querySelector('[class*="gui_editor-wrapper"]');
    var stageWrapper = document.querySelector('[class*="gui_stage-and-target-wrapper"]');
    if (!flexWrapper || !editorWrapper || !stageWrapper) return;
    _setupDone = true;
    console.log('[Thinkzy] Layout setup: injecting divider between editor and stage');

    // Insert divider BETWEEN editor and stage as a flex sibling
    var divider = document.createElement('div');
    divider.className = 'thinkzy-divider';
    flexWrapper.insertBefore(divider, stageWrapper);
    console.log('[Thinkzy] Divider injected, editor width:', editorWrapper.offsetWidth);

    // Draggable divider logic — uses Pointer Capture to beat Blockly
    var isDragging = false;
    var startX, startWidth;
    divider.style.touchAction = 'none';  // Required for pointer capture

    divider.addEventListener('pointerdown', function(e) {
      isDragging = true;
      startX = e.clientX;
      startWidth = editorWrapper.offsetWidth;
      divider.setPointerCapture(e.pointerId);  // ALL pointer events go to divider now
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    divider.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      var totalWidth = flexWrapper.offsetWidth;
      var newWidth = startWidth + (e.clientX - startX);
      newWidth = Math.max(totalWidth * 0.2, Math.min(totalWidth * 0.75, newWidth));
      editorWrapper.style.setProperty('width', newWidth + 'px', 'important');
      e.preventDefault();
    });

    divider.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      divider.releasePointerCapture(e.pointerId);
      divider.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Tell TurboWarp to recalculate
      window.dispatchEvent(new Event('resize'));
    });

    // Initial resize
    window.dispatchEvent(new Event('resize'));

    // ── Inject custom Play / Stop buttons above the stage ──
    var stageCanvas = stageWrapper.querySelector('[class*="stage_stage"]');
    if (stageCanvas) {
      // Make stage area a positioning context
      stageCanvas.parentElement.style.position = 'relative';

      var btnBar = document.createElement('div');
      btnBar.id = 'thinkzy-play-bar';
      btnBar.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:200;display:flex;gap:10px;align-items:center;background:rgba(30,30,46,0.85);border-radius:24px;padding:6px 16px;backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.3);';

      var playBtn = document.createElement('button');
      playBtn.id = 'thinkzy-play-btn';
      playBtn.innerHTML = '\u25B6';
      playBtn.title = 'Run (Green Flag)';
      playBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:50%;background:#00C875;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 0 8px rgba(0,200,100,0.4);';
      playBtn.onmouseenter = function() { playBtn.style.transform = 'scale(1.15)'; playBtn.style.boxShadow = '0 0 16px rgba(0,200,100,0.7)'; };
      playBtn.onmouseleave = function() { playBtn.style.transform = 'scale(1)'; playBtn.style.boxShadow = '0 0 8px rgba(0,200,100,0.4)'; };
      playBtn.onclick = function() {
        var gf = document.querySelector('[class*="green-flag_green-flag"]');
        if (gf) gf.click();
      };

      var stopBtn = document.createElement('button');
      stopBtn.id = 'thinkzy-stop-btn';
      stopBtn.innerHTML = '\u23F9';
      stopBtn.title = 'Stop';
      stopBtn.style.cssText = 'width:36px;height:36px;border:none;border-radius:50%;background:#FF4757;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.15s,box-shadow 0.15s;box-shadow:0 0 8px rgba(255,50,50,0.4);';
      stopBtn.onmouseenter = function() { stopBtn.style.transform = 'scale(1.15)'; stopBtn.style.boxShadow = '0 0 16px rgba(255,50,50,0.7)'; };
      stopBtn.onmouseleave = function() { stopBtn.style.transform = 'scale(1)'; stopBtn.style.boxShadow = '0 0 8px rgba(255,50,50,0.4)'; };
      stopBtn.onclick = function() {
        var sa = document.querySelector('[class*="stop-all_stop-all"]');
        if (sa) sa.click();
      };

      btnBar.appendChild(playBtn);
      btnBar.appendChild(stopBtn);
      stageCanvas.parentElement.insertBefore(btnBar, stageCanvas);
      console.log('[Thinkzy] Custom play/stop buttons injected');
    }
  }

  // Poll until TurboWarp DOM is ready (max 20s)
  var _attempts = 0;
  var _poll = setInterval(function() {
    _attempts++;
    if (document.querySelector('[class*="gui_flex-wrapper"]')) {
      clearInterval(_poll);
      setupThinkzyLayout();
    } else if (_attempts > 40) {
      clearInterval(_poll);
    }
  }, 500);
})();
