(function () {
  "use strict";

  var VERSION = 2;
  var MAX_SOURCE_BYTES = 2000000;
  var init = null;
  var scriptsReady = false;
  var started = false;
  var ready = false;
  var revision = 0;
  var changeTimer = null;
  var latestSnapshot = null;
  var pendingStartupError = null;
  var clipboardContent = "";
  var dialogSequence = 0;
  var sourceMigrated = false;
  var MISSING_MOTOR_IDENTIFIER = "ftcsimMissingMotorAsDcMotor";
  var FORWARDED_KEYBOARD_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);
  var JAVA_KEYWORDS = new Set([
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "goto", "if", "implements",
    "import", "instanceof", "int", "interface", "long", "native", "new", "package",
    "private", "protected", "public", "return", "short", "static", "strictfp",
    "super", "switch", "synchronized", "this", "throw", "throws", "transient",
    "try", "void", "volatile", "while", "true", "false", "null", "_",
  ]);

  function post(type, body) {
    if (!init) return;
    parent.postMessage(Object.assign({
      type: type,
      version: VERSION,
      nonce: init.nonce,
      documentId: init.documentId,
      configurationHash: init.hardware.configurationHash,
    }, body || {}), "*");
  }

  function postError(code, error, requestId, sourceSnapshot) {
    var payload = Object.assign({
      code: code,
      message: error instanceof Error ? error.message : String(error),
      requestId: requestId,
    }, sourceSnapshot || {});
    if (!init) {
      pendingStartupError = payload;
      return;
    }
    post("ftcsim.blocks.error", payload);
  }

  window.alert = function (message) {
    postError("FTC_BLOCKS_NOTICE", message);
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      // Dynamic scripts are async by default. Disabling async lets the browser
      // download this dependency graph in parallel while preserving the
      // manifest's execution order.
      script.async = false;
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(script);
    });
  }

  function installBlocklyDialogs() {
    // Browser prompts are blocked by the editor sandbox, and by cross-origin
    // documentation iframes. Blockly supports asynchronous dialog callbacks.
    function showDialog(kind, message, defaultValue, callback) {
      var dialog = document.createElement("dialog");
      dialog.className = "blockly-dialog";
      dialog.innerHTML = '<p></p>' +
        '<input type="text" autocomplete="off" spellcheck="false">' +
        '<div class="blockly-dialog-actions"><button type="button">Cancel</button>' +
        '<button type="button" data-accept>OK</button></div>';
      var label = dialog.querySelector("p");
      label.id = "blockly-dialog-message-" + (++dialogSequence);
      label.textContent = message;
      dialog.setAttribute("aria-labelledby", label.id);
      var input = dialog.querySelector("input");
      input.setAttribute("aria-labelledby", label.id);
      input.hidden = kind !== "prompt";
      input.value = defaultValue || "";
      var cancel = dialog.querySelector("button");
      var accept = dialog.querySelector("[data-accept]");
      cancel.hidden = kind === "alert";
      cancel.addEventListener("click", function () { dialog.close(); });
      accept.addEventListener("click", function () { dialog.close("ok"); });
      // Keep Blockly's workspace shortcuts out of the modal's keyboard path.
      dialog.addEventListener("keydown", function (event) {
        event.stopPropagation();
        // A modal inside an iframe must also keep Tab from reaching its host.
        if (event.key === "Tab") {
          var controls = dialog.querySelectorAll("input:not([hidden]), button:not([hidden])");
          var first = controls[0];
          var last = controls[controls.length - 1];
          if ((event.shiftKey && document.activeElement === first)
              || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }
        if (event.key === "Enter" && event.target === input && !event.isComposing) {
          event.preventDefault();
          dialog.close("ok");
        }
      });
      dialog.addEventListener("close", function () {
        var accepted = dialog.returnValue === "ok";
        dialog.remove();
        if (callback) callback(kind === "prompt" ? (accepted ? input.value : null) : accepted);
      }, { once: true });
      document.body.appendChild(dialog);
      post("ftcsim.blocks.keyboard", { phase: "reset" });
      dialog.showModal();
      if (kind === "prompt") {
        input.focus();
        input.select();
      } else {
        accept.focus();
      }
    }
    window.Blockly.prompt = function (message, defaultValue, callback) {
      showDialog("prompt", message, defaultValue, callback);
    };
    window.Blockly.alert = function (message, callback) {
      showDialog("alert", message, "", callback);
    };
    window.Blockly.confirm = function (message, callback) {
      showDialog("confirm", message, "", callback);
    };
  }

  async function loadRuntime() {
    var runtimeScripts = window.FTC_BLOCKS_RUNTIME_SCRIPTS;
    if (!Array.isArray(runtimeScripts)) throw new Error("Could not load the FTC Blocks asset manifest.");
    await Promise.all(runtimeScripts.map(loadScript));
    scriptsReady = true;
    startWhenReady();
  }

  function safeJavaIdentifierBase(name, index) {
    var identifier = String(name || "")
      .replace(/[^A-Za-z0-9_$]/g, "_")
      .replace(/^([0-9])/, "_$1");
    identifier = identifier || "motor" + (index + 1);
    return JAVA_KEYWORDS.has(identifier) ? "_" + identifier : identifier;
  }

  function allocateJavaIdentifier(name, index, used) {
    var base = safeJavaIdentifierBase(name, index);
    var identifier = base;
    var suffix = 2;
    while (used.has(identifier)) identifier = base + "_" + suffix++;
    used.add(identifier);
    return identifier;
  }

  function stableMotorBlockIdentifier(id) {
    var encoded = new TextEncoder().encode(String(id));
    var hexadecimal = Array.from(encoded, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    return "ftcsimMotor_" + hexadecimal + "AsDcMotor";
  }

  function escapeJavaString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/\u0008/g, "\\b");
  }

  function splitBlocksSource(sourceXml) {
    var workspaceEnd = sourceXml.indexOf("</xml>");
    if (workspaceEnd < 0) return { workspace: sourceXml, suffix: "" };
    workspaceEnd += 6;
    return {
      workspace: sourceXml.slice(0, workspaceEnd),
      suffix: sourceXml.slice(workspaceEnd),
    };
  }

  function sourceMotorIdentifiers(sourceXml) {
    try {
      var documentXml = new DOMParser().parseFromString(
        splitBlocksSource(sourceXml).workspace,
        "application/xml",
      );
      if (documentXml.querySelector("parsererror")) return [];
      return Array.from(documentXml.querySelectorAll("field"))
        .filter(function (field) {
          return /^(?:IDENTIFIER|IDENTIFIER1|IDENTIFIER2)$/.test(field.getAttribute("name") || "");
        })
        .map(function (field) { return (field.textContent || "").trim(); })
        .filter(function (identifier) { return identifier.endsWith("AsDcMotor"); });
    } catch (_error) {
      return [];
    }
  }

  function escapeRegularExpression(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function migrateLegacyMotorIdentifiers(sourceXml, aliases) {
    var split = splitBlocksSource(sourceXml);
    var migratedWorkspace = Object.keys(aliases).reduce(function (migrated, legacyIdentifier) {
      var fieldPattern = new RegExp(
        "(<field\\b(?=[^>]*\\bname\\s*=\\s*[\"'](?:IDENTIFIER|IDENTIFIER1|IDENTIFIER2)[\"'])[^>]*>\\s*)" +
          escapeRegularExpression(legacyIdentifier) + "(\\s*</field>)",
        "g",
      );
      return migrated.replace(fieldPattern, function (_match, before, after) {
        return before + aliases[legacyIdentifier] + after;
      });
    }, split.workspace);
    return migratedWorkspace + split.suffix;
  }

  function installProjectAndHardwareOverrides() {
    // This Blockly version serializes only variables already used by a block.
    // Preserve newly created variables through autosave and OpMode switches too.
    var originalWorkspaceToDom = window.Blockly.Xml.workspaceToDom;
    window.Blockly.Xml.workspaceToDom = function (workspace, skipId) {
      var xml = originalWorkspaceToDom(workspace, skipId);
      if (workspace !== window.workspace) return xml;
      var variables = window.Blockly.Xml.variablesToDom(workspace.getAllVariables());
      var existing = xml.getElementsByTagName("variables")[0];
      if (existing) xml.replaceChild(variables, existing);
      else if (variables.hasChildNodes()) xml.insertBefore(variables, xml.firstChild);
      return xml;
    };
    document.documentElement.dataset.configurationHash = init.hardware.configurationHash;
    var seenMotorIds = new Set();
    var motors = init.hardware.motors.filter(function (motor) {
      if (!motor || typeof motor.id !== "string" || motor.id.length === 0
          || typeof motor.name !== "string" || motor.name.length === 0
          || seenMotorIds.has(motor.id)) return false;
      seenMotorIds.add(motor.id);
      return true;
    });
    var usedJavaIdentifiers = new Set();
    var motorEntries = motors.map(function (motor, index) {
      var javaIdentifier = allocateJavaIdentifier(motor.name, index, usedJavaIdentifiers);
      return {
        id: motor.id,
        name: motor.name,
        javaIdentifier: javaIdentifier,
        blockIdentifier: stableMotorBlockIdentifier(motor.id),
        legacyBlockIdentifier: safeJavaIdentifierBase(motor.name, index) + "AsDcMotor",
      };
    });
    var byBlockIdentifier = Object.fromEntries(motorEntries.map(function (entry) {
      return [entry.blockIdentifier, entry];
    }));
    var aliasCandidates = {};
    function addAliasCandidate(identifier, entry) {
      var candidates = aliasCandidates[identifier] || [];
      if (!candidates.some(function (candidate) { return candidate.id === entry.id; })) {
        candidates.push(entry);
      }
      aliasCandidates[identifier] = candidates;
    }
    motorEntries.forEach(function (entry, index) {
      addAliasCandidate(entry.legacyBlockIdentifier, entry);
      addAliasCandidate("ftcsimMotor" + (index + 1) + "AsDcMotor", entry);
    });
    var legacyAliases = {};
    Object.keys(aliasCandidates).forEach(function (identifier) {
      var candidates = aliasCandidates[identifier];
      if (candidates.length === 1) {
        byBlockIdentifier[identifier] = candidates[0];
        legacyAliases[identifier] = candidates[0].blockIdentifier;
      }
    });
    // Blockly FieldDropdown discards an XML value that is not one of its
    // options. Migrate unambiguous name-based identifiers before deserializing
    // so an imported non-first motor cannot silently become the first choice.
    var migratedSourceXml = migrateLegacyMotorIdentifiers(init.sourceXml, legacyAliases);
    sourceMigrated = migratedSourceXml !== init.sourceXml;
    init.sourceXml = migratedSourceXml;
    var missingMotorIdentifiers = Array.from(new Set(sourceMotorIdentifiers(init.sourceXml)))
      .filter(function (identifier) { return !byBlockIdentifier[identifier]; });
    var dropdownChoices = [[
      motorEntries.length > 0 ? "Select a configured motor…" : "No configured motors",
      MISSING_MOTOR_IDENTIFIER,
    ]].concat(motorEntries.map(function (entry) {
      return [entry.name, entry.blockIdentifier];
    }), missingMotorIdentifiers.map(function (identifier) {
      return ["Missing motor · " + identifier.replace(/AsDcMotor$/, ""), identifier];
    }));

    window.fetchJavaScriptForHardware = function (callback) {
      callback("/* Hardware is supplied by FTC Simulator. */", "");
    };
    window.getParameterByName = function (name) {
      return name === "project" ? init.className : null;
    };
    window.getBlocksJavaClassName = function (_projectName, callback) {
      callback(init.className, "");
    };
    window.fetchBlkFileContent = function (_projectName, callback) {
      callback(init.sourceXml, "");
    };
    window.saveProject = function (_projectName, sourceXml, _javascript, callback) {
      void emitSnapshot(undefined, sourceXml);
      callback(true, "");
    };
    window.enableProject = function (_projectName, enabled, callback) {
      window.projectEnabled = Boolean(enabled);
      callback(true, "");
    };
    window.fetchClipboardContent = function (callback) {
      callback(clipboardContent, "");
    };
    window.saveClipboardContent = function (content, callback) {
      clipboardContent = content || "";
      callback(true, "");
    };
    window.setUpWebSocket = function () {};

    var originalDeviceName = window.getHardwareItemDeviceName;
    var originalJavaIdentifier = window.getHardwareItemIdentifierForFtcJava;
    window.getHardwareItemDeviceName = function (identifier) {
      return byBlockIdentifier[identifier]
        ? escapeJavaString(byBlockIdentifier[identifier].name)
        : identifier.endsWith("AsDcMotor")
          ? (function () { throw new Error("Motor “" + identifier.replace(/AsDcMotor$/, "") + "” is not in the current robot configuration."); })()
        : originalDeviceName(identifier);
    };
    window.getHardwareItemIdentifierForFtcJava = function (identifier) {
      return byBlockIdentifier[identifier]
        ? byBlockIdentifier[identifier].javaIdentifier
        : identifier.endsWith("AsDcMotor")
          ? (function () { throw new Error("Motor “" + identifier.replace(/AsDcMotor$/, "") + "” is not in the current robot configuration."); })()
        : originalJavaIdentifier(identifier);
    };
    window.createDcMotorDropdown = function () {
      return window.createFieldDropdown(dropdownChoices);
    };
    window.createDcMotorExDropdown = window.createDcMotorDropdown;

    window.allHardwareIdentifiers = window.allHardwareIdentifiers
      .filter(function (identifier) { return !identifier.endsWith("AsDcMotor"); })
      .concat(Object.keys(byBlockIdentifier), missingMotorIdentifiers, [MISSING_MOTOR_IDENTIFIER]);

    var originalJavaReservedWords = window.addReservedWordsForFtcJava;
    window.addReservedWordsForFtcJava = function () {
      // The imported offline runtime reserves identifiers for its original
      // six-motor sample. Those names are not real hardware requirements.
      // During reserved-word setup only, let missing legacy motor identifiers
      // pass through as inert names; actual blocks remain fail-closed in
      // importDeclareAssign_ below.
      var strictJavaIdentifier = window.getHardwareItemIdentifierForFtcJava;
      window.getHardwareItemIdentifierForFtcJava = function (identifier) {
        if (identifier.endsWith("AsDcMotor") && !byBlockIdentifier[identifier]) {
          return identifier.replace(/AsDcMotor$/, "");
        }
        return strictJavaIdentifier(identifier);
      };
      try {
        originalJavaReservedWords();
      } finally {
        window.getHardwareItemIdentifierForFtcJava = strictJavaIdentifier;
      }
      motorEntries.forEach(function (entry) {
        window.Blockly.FtcJava.addReservedWords(entry.javaIdentifier);
      });
    };
    var originalJavascriptReservedWords = window.addReservedWordsForJavaScript;
    window.addReservedWordsForJavaScript = function () {
      originalJavascriptReservedWords();
      motorEntries.forEach(function (entry) {
        window.Blockly.JavaScript.addReservedWords(entry.blockIdentifier);
      });
    };

    var originalImportDeclareAssign = window.Blockly.FtcJava.importDeclareAssign_;
    window.Blockly.FtcJava.importDeclareAssign_ = function (block, identifierFieldName, javaType) {
      if (identifierFieldName && (javaType === "DcMotor" || javaType === "DcMotorEx")) {
        var identifier = block.getFieldValue(identifierFieldName);
        if (!byBlockIdentifier[identifier]) {
          throw new Error("Motor “" + String(identifier).replace(/AsDcMotor$/, "") +
            "” is not in the current robot configuration. Rebind or replace this block.");
        }
      }
      return originalImportDeclareAssign(block, identifierFieldName, javaType);
    };

    var originalToolbox = window.getToolbox;
    window.getToolbox = function () {
      return originalToolbox().replace(
        /[A-Za-z_$][A-Za-z0-9_$]*AsDcMotor/g,
        function (identifier) {
          return byBlockIdentifier[identifier]
            ? byBlockIdentifier[identifier].blockIdentifier
            : MISSING_MOTOR_IDENTIFIER;
        },
      );
    };

    // The host owns generated Java display. Avoid doing a full Java generation
    // for every selection, viewport, and drag event in the legacy listener.
    window.showJava = function () {
      if (window.workspace && window.blocksFinishedLoading) markReady();
    };
  }

  function markReady() {
    if (ready) return;
    ready = true;
    window.savedBlkFileContent = window.getCurrentBlkFileContent();
    window.workspace.addChangeListener(function (event) {
      if (!ready || init.readOnly) return;
      if (event && (event.isUiEvent === true || event.type === "ui" || event.type === "selected"
          || event.type === "viewport_change" || event.type === "toolbox_item_select")) {
        return;
      }
      scheduleSnapshot();
    });
    document.body.classList.toggle("is-read-only", init.readOnly);
    post("ftcsim.blocks.ready");
    if (sourceMigrated && !init.readOnly) {
      sourceMigrated = false;
      window.setTimeout(function () {
        void emitSnapshot();
      }, 0);
    }
  }

  function scheduleSnapshot() {
    window.clearTimeout(changeTimer);
    changeTimer = window.setTimeout(function () {
      void emitSnapshot();
    }, 220);
  }

  async function sha256(source) {
    var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function emitSnapshot(requestId, suppliedSource) {
    if (!ready || !window.workspace) {
      if (requestId) postError("BLOCKS_NOT_READY", "The Blocks editor is still loading.", requestId);
      return;
    }
    var sourceXml;
    var sourceHash;
    try {
      sourceXml = suppliedSource === undefined ? window.getCurrentBlkFileContent() : suppliedSource;
      var sourceBytes = new TextEncoder().encode(sourceXml).byteLength;
      if (sourceBytes > MAX_SOURCE_BYTES) throw new Error("This Blocks OpMode is larger than the 2 MB project limit.");
      sourceHash = await sha256(sourceXml);
    } catch (error) {
      postError("BLOCKS_SOURCE_INVALID", error, requestId);
      return;
    }
    var sourceSnapshot = {
      revision: ++revision,
      sourceXml: sourceXml,
      sourceHash: sourceHash,
    };
    try {
      var generatedJava = window.generateJavaCode();
      if (new TextEncoder().encode(generatedJava).byteLength > MAX_SOURCE_BYTES) {
        throw new Error("Generated Java is larger than the 2 MB project limit.");
      }
      var snapshot = {
        revision: sourceSnapshot.revision,
        sourceXml: sourceSnapshot.sourceXml,
        generatedJava: generatedJava,
        sourceHash: sourceSnapshot.sourceHash,
        requestId: requestId,
      };
      latestSnapshot = snapshot;
      window.savedBlkFileContent = sourceXml;
      post("ftcsim.blocks.snapshot", snapshot);
    } catch (error) {
      window.savedBlkFileContent = sourceXml;
      postError("BLOCKS_GENERATION_FAILED", error, requestId, sourceSnapshot);
    }
  }

  function startWhenReady() {
    if (started || !scriptsReady || !init) return;
    started = true;
    try {
      installBlocklyDialogs();
      installProjectAndHardwareOverrides();
      window.setOnline(false);
      window.initializeFtcBlocks();
      window.setTimeout(function () {
        if (!ready && window.workspace) markReady();
      }, 500);
    } catch (error) {
      postError("BLOCKS_INITIALIZATION_FAILED", error);
    }
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parent || !event.data || event.data.version !== VERSION) return;
    if (event.data.type === "ftcsim.blocks.init") {
      if (init || typeof event.data.nonce !== "string" || typeof event.data.documentId !== "string") return;
      init = event.data;
      if (pendingStartupError) {
        post("ftcsim.blocks.error", pendingStartupError);
        pendingStartupError = null;
        return;
      }
      startWhenReady();
      return;
    }
    if (!init || event.data.nonce !== init.nonce || event.data.documentId !== init.documentId) return;
    if (event.data.type === "ftcsim.blocks.flush" && typeof event.data.requestId === "string") {
      window.clearTimeout(changeTimer);
      void emitSnapshot(event.data.requestId);
    }
  });

  window.addEventListener("keydown", function (event) {
    if (document.querySelector(".blockly-dialog[open]")) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      window.clearTimeout(changeTimer);
      void emitSnapshot();
      return;
    }
    if (!event.repeat && FORWARDED_KEYBOARD_CODES.has(event.code)
        && !(event.target instanceof Element
          && event.target.closest("input, textarea, select, [contenteditable='true']"))) {
      event.preventDefault();
      post("ftcsim.blocks.keyboard", { phase: "down", code: event.code });
    }
  }, true);

  window.addEventListener("keyup", function (event) {
    if (FORWARDED_KEYBOARD_CODES.has(event.code)) {
      post("ftcsim.blocks.keyboard", { phase: "up", code: event.code });
    }
  }, true);

  window.addEventListener("blur", function () {
    post("ftcsim.blocks.keyboard", { phase: "reset" });
  });

  window.addEventListener("resize", function () {
    if (window.workspace && window.resizeBlocklyArea) window.resizeBlocklyArea();
  });

  void loadRuntime().catch(function (error) {
    postError("BLOCKS_ASSET_LOAD_FAILED", error);
  });
})();
