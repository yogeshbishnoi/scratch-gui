/**
 * Thinkzy ↔ TurboWarp Parent Bridge
 *
 * Bundled directly into the self-hosted TurboWarp build.
 * Communicates project state to the Thinkzy parent page via postMessage.
 *
 * Runs on the same origin as TurboWarp — no cross-origin restrictions.
 */
(function () {
  'use strict';

  // Only activate when loaded inside an iframe (embedded in Thinkzy)
  if (window === window.parent) return;

  // ── Wait for VM to be available ──────────────────────────────────

  var MAX_WAIT = 30000; // 30 seconds max
  var POLL_INTERVAL = 300;
  var waited = 0;

  function waitForVM() {
    if (window.vm) {
      initBridge(window.vm);
    } else if (waited < MAX_WAIT) {
      waited += POLL_INTERVAL;
      setTimeout(waitForVM, POLL_INTERVAL);
    }
  }

  // ── Bridge logic ─────────────────────────────────────────────────

  function initBridge(vm) {
    var runtime = vm.runtime;

    // ── Force a clean stage size for blank-start missions ──────────────
    // Mission 2-1 loads with no starter_project_url, and scratch-render
    // can land in a state where drawables exist but nothing renders to
    // the visible canvas (pick() returns -1, readPixels returns garbage).
    // Calling setStageSize(480, 360) forces scratch-vm/runtime to re-
    // initialise the renderer's projection + customStageSize and unstick
    // the pipeline. Safe to call even when the VM is already at 480x360
    // — it's idempotent.
    try {
      if (vm.setStageSize) vm.setStageSize(480, 360);
    } catch (e) { /* swallow — never block bridge init */ }

    // ── Force a renderer.resize() + draw() on the visible canvas.
    //    scratch-gui's stage.jsx only calls renderer.resize() from
    //    componentDidMount/Update (driven by stageSize/isFullScreen/
    //    dimensions props), so container-driven resizes leave the
    //    drawing buffer stale and the projection matrix wrong. Doing
    //    this once on bridge init unsticks the WebGL pipeline for
    //    blank-start missions where pick() returns -1 even though
    //    drawables are correctly registered.
    //
    //    The bridge often runs before <Stage> has mounted its <canvas>
    //    (initBridge triggers as soon as window.vm is set), so we poll
    //    for the canvas with non-zero dimensions before kicking the
    //    renderer + setting up the long-lived ResizeObserver.
    function forceRendererSync(canvas) {
      try {
        if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0
            && vm.renderer && vm.renderer.resize) {
          vm.renderer.resize(canvas.clientWidth, canvas.clientHeight);
          vm.renderer.draw();
        }
      } catch (err) { /* ignore */ }
    }
    function ensureStageReady(attemptsLeft) {
      if (attemptsLeft <= 0) return;
      var cvs = document.querySelector('[class*="stage_stage"] canvas');
      if (!cvs || cvs.clientWidth === 0 || cvs.clientHeight === 0) {
        setTimeout(function () { ensureStageReady(attemptsLeft - 1); }, 250);
        return;
      }
      forceRendererSync(cvs);
      if (typeof ResizeObserver !== 'undefined' && !window.__thinkzyCanvasRO) {
        window.__thinkzyCanvasRO = new ResizeObserver(function () {
          forceRendererSync(cvs);
        });
        window.__thinkzyCanvasRO.observe(cvs);
      }
    }
    ensureStageReady(40); // poll up to 10s

    function getBlockTypes(blocks) {
      var opcodes = {};
      var allBlocks = blocks._blocks || {};
      for (var id in allBlocks) {
        var opcode = allBlocks[id].opcode || '';
        if (opcode) {
          var category = opcode.split('_')[0];
          opcodes[category] = (opcodes[category] || 0) + 1;
        }
      }
      return opcodes;
    }

    function hasBlockOfType(blocks, targetOpcodes) {
      var allBlocks = blocks._blocks || {};
      for (var id in allBlocks) {
        var opcode = allBlocks[id].opcode || '';
        for (var i = 0; i < targetOpcodes.length; i++) {
          if (opcode === targetOpcodes[i]) return true;
        }
      }
      return false;
    }

    var KEY_EVENT_OPCODES = [
      'event_whenkeypressed',
      'sensing_keypressed'
    ];

    var MOVE_OPCODES = [
      'motion_movesteps',
      'motion_gotoxy',
      'motion_changexby',
      'motion_changeyby',
      'motion_glideto',
      'motion_glide'
    ];

    var VARIABLE_OPCODES = [
      'data_setvariableto',
      'data_changevariableby',
      'data_showvariable',
      'data_hidevariable'
    ];

    var CONDITION_OPCODES = [
      'control_if',
      'control_if_else',
      'control_wait_until',
      'control_repeat_until'
    ];

    var LOOP_OPCODES = [
      'control_repeat',
      'control_forever',
      'control_repeat_until'
    ];

    function getProjectState() {
      var targets = runtime.targets;
      var sprites = [];

      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (t.isStage) continue;

        var blockKeys = Object.keys(t.blocks._blocks || {});
        var vars = {};
        for (var varId in t.variables) {
          var v = t.variables[varId];
          vars[v.name] = { value: v.value, type: v.type };
        }

        // Collect the lowercase names of `when X key pressed` handlers
        // ("left arrow", "right arrow", "space", …) so the parent can verify
        // that BOTH expected arrow keys are wired (not just any key event).
        var keyHandlers = [];
        for (var bid in t.blocks._blocks) {
          var blk = t.blocks._blocks[bid];
          if (!blk || blk.opcode !== 'event_whenkeypressed') continue;
          var fields = blk.fields || {};
          var ko = fields.KEY_OPTION;
          var keyName = ko && (ko.value || (ko[1] && ko[1][0])) || '';
          if (keyName) keyHandlers.push(String(keyName).toLowerCase());
        }

        sprites.push({
          id: t.id,
          name: t.getName(),
          blockCount: blockKeys.length,
          scriptCount: t.blocks.getScripts().length,
          costumeCount: (t.getCostumes ? t.getCostumes() : []).length,
          variables: vars,
          blockCategories: getBlockTypes(t.blocks),
          hasKeyEvent: hasBlockOfType(t.blocks, KEY_EVENT_OPCODES),
          hasMoveBlock: hasBlockOfType(t.blocks, MOVE_OPCODES),
          hasVariable: hasBlockOfType(t.blocks, VARIABLE_OPCODES),
          hasCondition: hasBlockOfType(t.blocks, CONDITION_OPCODES),
          hasLoop: hasBlockOfType(t.blocks, LOOP_OPCODES),
          keyHandlers: keyHandlers
        });
      }

      // Stage (global) variables
      var stage = runtime.getTargetForStage();
      var globalVars = {};
      if (stage) {
        for (var gvId in stage.variables) {
          var gv = stage.variables[gvId];
          globalVars[gv.name] = { value: gv.value, type: gv.type };
        }
      }

      return {
        spriteCount: sprites.length,
        sprites: sprites,
        globalVariables: globalVars,
        totalBlocks: sprites.reduce(function (s, sp) { return s + sp.blockCount; }, 0),
        totalScripts: sprites.reduce(function (s, sp) { return s + sp.scriptCount; }, 0),
        timestamp: Date.now()
      };
    }

    // ── Respond to parent requests ──────────────────────────────────

    window.addEventListener('message', function (event) {
      var data = event.data || {};

      if (data.type === 'GET_PROJECT_STATE') {
        window.parent.postMessage({
          type: 'PROJECT_STATE',
          requestId: data.requestId,
          data: getProjectState()
        }, '*');
      }

      // ── Export .sb3 project as Base64 string ─────────────────────────
      if (data.type === 'GET_PROJECT_SB3_BASE64') {
        vm.saveProjectSb3('blob').then(function (blob) {
          var reader = new FileReader();
          reader.onload = function () {
            var base64 = reader.result.split(',')[1];
            window.parent.postMessage({
              type: 'PROJECT_SB3_BASE64',
              requestId: data.requestId,
              data: base64,
              size: blob.size
            }, '*');
          };
          reader.readAsDataURL(blob);
        }).catch(function (err) {
          window.parent.postMessage({
            type: 'PROJECT_SB3_ERROR',
            requestId: data.requestId,
            error: err.message || 'Export failed'
          }, '*');
        });
      }

      // ── Resize: recalculate stage dimensions after layout change ────
      if (data.type === 'RESIZE') {
        window.dispatchEvent(new Event('resize'));
      }

      // ── Force-resize: parent-triggered "stage is sleeping" recovery ─
      // Fires from the canvas-error retry UI. Re-runs the same stage-
      // initialisation sequence we do on bridge init, forcing the
      // renderer to rebuild its projection + drawing buffer.
      if (data.type === 'FORCE_RESIZE') {
        try {
          if (vm.setStageSize) vm.setStageSize(480, 360);
          var cvs = document.querySelector('[class*="stage_stage"] canvas');
          if (cvs && vm.renderer && vm.renderer.resize) {
            vm.renderer.resize(cvs.clientWidth || 480, cvs.clientHeight || 360);
            vm.renderer.draw();
          }
          window.parent.postMessage({ type: 'FORCE_RESIZE_DONE' }, '*');
        } catch (err) {
          window.parent.postMessage({
            type: 'FORCE_RESIZE_ERROR',
            error: (err && err.message) || 'force resize failed'
          }, '*');
        }
      }

      // ── Apply mission-specific UI mode (chrome-hiding allow-list) ───
      // Adds `thinkzy-mode-2-X` body class so editor.html CSS can hide
      // file menu, project rename, sprite library, etc. per mission.
      if (data.type === 'SET_THINKZY_MODE') {
        var missionId = data.mission || '';
        var ui = data.ui || {};
        var body = document.body;
        if (body) {
          // Remove any prior thinkzy-mode-* / thinkzy-allow-* classes
          var keep = [];
          var cls = (body.className || '').split(/\s+/);
          for (var ci = 0; ci < cls.length; ci++) {
            var cn = cls[ci];
            if (cn && cn.indexOf('thinkzy-mode-') !== 0 && cn.indexOf('thinkzy-allow-') !== 0) {
              keep.push(cn);
            }
          }
          body.className = keep.join(' ');
          if (missionId) {
            body.classList.add('thinkzy-mode-' + missionId);
            body.classList.add('thinkzy-mode-2');
          }
          if (ui.addBackdrop) body.classList.add('thinkzy-allow-backdrop');
          if (ui.addSound) body.classList.add('thinkzy-allow-sound');
          if (ui.spriteLibrary) body.classList.add('thinkzy-allow-add-sprite');
        }
      }

      // ── Resize a sprite by name to a target percent ────────────────
      // Used by the parent to auto-size newly added sprites (50% for
      // rocket, 70% for asteroid) so kids don't drag a 100% sprite that
      // dwarfs the canvas. Best-effort: tries the VM target API first,
      // then falls back to the size input field.
      if (data.type === 'RESIZE_SPRITE' && data.sprite) {
        var spriteName = String(data.sprite);
        var targetSize = Math.max(10, Math.min(400, Number(data.size) || 100));
        var resized = false;
        if (vm && vm.runtime && vm.runtime.targets) {
          for (var ri = 0; ri < vm.runtime.targets.length; ri++) {
            var rt = vm.runtime.targets[ri];
            if (!rt || rt.isStage) continue;
            var rname = rt.getName ? rt.getName() : rt.sprite && rt.sprite.name;
            if (rname === spriteName && typeof rt.setSize === 'function') {
              try { rt.setSize(targetSize); resized = true; } catch (err) { /* fall through */ }
              break;
            }
          }
        }
        if (!resized) {
          // Fallback: drive the sprite-info-panel size input via DOM events
          var sprites = document.querySelectorAll('[class*="sprite-selector_sprite_"]');
          for (var si = 0; si < sprites.length; si++) {
            var sNode = sprites[si];
            if ((sNode.textContent || '').toLowerCase().indexOf(spriteName.toLowerCase()) !== -1) {
              sNode.click();
              setTimeout(function () {
                var sizeInput = document.querySelector('[class*="sprite-info_size-input"] input');
                if (!sizeInput) return;
                var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(sizeInput, String(targetSize));
                sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
                sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
              }, 80);
              break;
            }
          }
        }
      }

      // ── Visual guidance: pulse a category button ────────────────────
      if (data.type === 'HIGHLIGHT_CATEGORY') {
        var categoryName = (data.category || '').toLowerCase();
        // Clear existing pulses
        var existing = document.querySelectorAll('.thinkzy-pulse');
        for (var p = 0; p < existing.length; p++) existing[p].classList.remove('thinkzy-pulse');

        var buttons = document.querySelectorAll('[class*="scratchCategoryMenu"] [class*="categoryMenuItem"]');
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var text = (btn.textContent || '').toLowerCase().trim();
          if (text === categoryName || text.indexOf(categoryName) === 0) {
            btn.classList.add('thinkzy-pulse');
            btn.click();
            // Auto-remove after 5s or on kid click
            (function(el) {
              var remove = function() { el.classList.remove('thinkzy-pulse'); el.removeEventListener('click', remove); };
              el.addEventListener('click', remove);
              setTimeout(remove, 5000);
            })(btn);
            break;
          }
        }
      }

      // ── Show/hide categories: dim irrelevant ones ───────────────────
      if (data.type === 'SET_VISIBLE_CATEGORIES') {
        var visibleList = (data.categories || []).map(function(c) { return c.toLowerCase(); });
        var showAll = data.showAll === true;
        var allBtns = document.querySelectorAll('[class*="scratchCategoryMenu"] [class*="categoryMenuItem"]');
        for (var j = 0; j < allBtns.length; j++) {
          var b = allBtns[j];
          var bText = (b.textContent || '').toLowerCase().trim();
          if (showAll) {
            b.classList.remove('thinkzy-dimmed');
          } else {
            var found = false;
            for (var k = 0; k < visibleList.length; k++) {
              if (bText === visibleList[k] || bText.indexOf(visibleList[k]) === 0) { found = true; break; }
            }
            if (found) { b.classList.remove('thinkzy-dimmed'); } else { b.classList.add('thinkzy-dimmed'); }
          }
        }
      }

      // ── Clear all guidance ──────────────────────────────────────────
      if (data.type === 'CLEAR_GUIDANCE') {
        document.querySelectorAll('.thinkzy-pulse').forEach(function(el) { el.classList.remove('thinkzy-pulse'); });
        document.querySelectorAll('.thinkzy-dimmed').forEach(function(el) { el.classList.remove('thinkzy-dimmed'); });
      }

      // ── Inject Scratch blocks into workspace from XML ──────────────
      if (data.type === 'CREATE_BLOCKS') {
        var SB = window.ScratchBlocks;
        var workspace = SB && SB.getMainWorkspace();
        if (!workspace || !data.xml) {
          window.parent.postMessage({
            type: 'BLOCKS_CREATED',
            success: false,
            error: !SB ? 'ScratchBlocks not available' : !workspace ? 'No workspace' : 'No XML provided'
          }, '*');
          return;
        }
        try {
          SB.Events.setGroup(true);
          var dom = SB.Xml.textToDom('<xml>' + data.xml + '</xml>');
          SB.Xml.domToWorkspace(dom, workspace);
          SB.Events.setGroup(false);
          // Notify parent that blocks were created
          window.parent.postMessage({ type: 'BLOCKS_CREATED', success: true }, '*');
        } catch (err) {
          SB.Events.setGroup(false);
          console.error('[Thinkzy] CREATE_BLOCKS error:', err);
          window.parent.postMessage({
            type: 'BLOCKS_CREATED',
            success: false,
            error: err.message || 'Block injection failed'
          }, '*');
        }
      }
    });

    // ── Push changes to parent (throttled: max 1 per 2s) ────────────

    var lastPush = 0;
    var pendingPush = null;

    function pushChange(eventType) {
      var now = Date.now();
      if (now - lastPush < 2000) {
        if (!pendingPush) {
          pendingPush = setTimeout(function () {
            pendingPush = null;
            lastPush = Date.now();
            window.parent.postMessage({
              type: eventType,
              data: getProjectState()
            }, '*');
          }, 2000 - (now - lastPush));
        }
        return;
      }
      lastPush = now;
      window.parent.postMessage({
        type: eventType,
        data: getProjectState()
      }, '*');
    }

    vm.on('PROJECT_CHANGED', function () {
      pushChange('PROJECT_CHANGED');
    });

    vm.on('TARGETS_UPDATE', function () {
      pushChange('TARGETS_UPDATED');
    });

    // ── Render-health telemetry ────────────────────────────────────
    // Periodically checks whether the WebGL drawing buffer is usable
    // and reports STAGE_RENDER_OK or STAGE_RENDER_ERROR to the parent.
    // Parent uses this to show the "stage is sleeping" error state
    // and to log STAGE_RENDER_ERROR metrics.
    function checkRenderHealth() {
      try {
        var r = vm.runtime && vm.runtime.renderer;
        var gl = r && r.gl;
        if (!gl) return;
        var w = gl.drawingBufferWidth;
        var h = gl.drawingBufferHeight;
        var ok = w > 0 && h > 0 && gl.getError() === gl.NO_ERROR;
        window.parent.postMessage({
          type: ok ? 'STAGE_RENDER_OK' : 'STAGE_RENDER_ERROR',
          data: { bufferWidth: w, bufferHeight: h }
        }, '*');
      } catch (e) { /* ignore */ }
    }
    setTimeout(checkRenderHealth, 3000);
    setTimeout(checkRenderHealth, 8000);

    // ── Sprite-rendered signal (fires once per new sprite) ───────────
    // Used by parent for the "first sprite" delight beat and the
    // add-sprite funnel metric. Also forces a renderer.resize() + draw()
    // because scratch-render can be in a state where the projection
    // matrix is stale and newly-added drawables don't actually rasterise
    // — this kick unsticks it in the same call frame as the sprite add.
    var _knownSpriteIds = new Set();
    runtime.on('targetWasCreated', function (target) {
      if (!target || target.isStage) return;
      var id = target.id;
      if (_knownSpriteIds.has(id)) return;
      _knownSpriteIds.add(id);
      setTimeout(function () {
        var cvs = document.querySelector('[class*="stage_stage"] canvas');
        forceRendererSync(cvs);
        window.parent.postMessage({
          type: 'SPRITE_RENDERED',
          data: { name: target.getName ? target.getName() : '', id: id }
        }, '*');
      }, 100);
    });

    // ── Signal ready ────────────────────────────────────────────────

    window.parent.postMessage({ type: 'TURBOWARP_BRIDGE_READY' }, '*');

    // Send initial state after a short delay
    setTimeout(function () {
      window.parent.postMessage({
        type: 'PROJECT_STATE',
        requestId: 'initial',
        data: getProjectState()
      }, '*');
    }, 2000);
  }

  // Start waiting for VM
  waitForVM();
})();
