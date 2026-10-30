// ============================================================
// Alex Rivera — Warm Personal Website
// Nav toggle, year, reveal-on-scroll, friendly contact form
// ============================================================

(function () {
  "use strict";

  // ---- Current year in footer ----
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---- Mobile nav toggle ----
  var burger = document.getElementById("navBurger");
  var menu = document.getElementById("navMenu");
  if (burger && menu) {
    var toggleMenu = function (open) {
      var isOpen = open !== undefined ? open : !menu.classList.contains("is-open");
      menu.classList.toggle("is-open", isOpen);
      burger.classList.toggle("is-open", isOpen);
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };
    burger.addEventListener("click", function () { toggleMenu(); });
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { toggleMenu(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggleMenu(false);
    });
  }

  // ---- Reveal on scroll ----
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var delay = parseInt(entry.target.getAttribute("data-delay") || "0", 10);
          setTimeout(function () { entry.target.classList.add("is-in"); }, delay);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-in"); });
  }

  // ---- Contact form → Supabase (contacts table) ----
  // POST /rest/v1/contacts with the publishable key. The anon role needs an
  // INSERT policy on the table, otherwise Supabase answers 401.
  var CONTACT_URL = "https://vfidvmqimodmlgkaehrl.supabase.co";
  var CONTACT_KEY = "sb_publishable_4wedj56abTuhBVqfnUgB8g_KmqT2W--";

  var form = document.getElementById("contactForm");
  var note = document.getElementById("formNote");
  if (form && note) {
    var sending = false;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (sending) return;

      var name = form.querySelector("#name");
      var email = form.querySelector("#email");
      var message = form.querySelector("#message");

      var missing = [];
      if (name && !name.value.trim()) missing.push("your name");
      if (email && !email.value.trim()) missing.push("an email");
      if (message && !message.value.trim()) missing.push("a message");

      if (missing.length) {
        note.style.color = "var(--coral-dark)";
        note.textContent = "Mind adding " + missing.join(", ") + "? 🌷";
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var who = name.value.trim().split(" ")[0];
      sending = true;
      if (submitBtn) submitBtn.disabled = true;
      note.style.color = "";
      note.textContent = "Sending your note…";

      try {
        var res = await fetch(CONTACT_URL + "/rest/v1/contacts", {
          method: "POST",
          headers: {
            "apikey": CONTACT_KEY,
            "Authorization": "Bearer " + CONTACT_KEY,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            name: name.value.trim(),
            email: email.value.trim(),
            message: message.value.trim()
          })
        });
        if (!res.ok) throw new Error("HTTP " + res.status);

        note.style.color = "#2A8C5A";
        note.textContent = "Thanks, " + who + "! Your note is on its way. I'll write back soon. 💛";
        form.reset();
      } catch (err) {
        note.style.color = "var(--coral-dark)";
        note.textContent = "Sorry, " + who + " — your note didn't send. Please try again in a moment.";
      } finally {
        sending = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
})();

// ============================================================
// To-Do List App — on Projects page
// Backed by Supabase (todos table). Add, complete, edit, delete.
// Schema: id bigint (DB-generated), task text, date, is_complete bool,
// created_at timestamptz. Optional prio text column (probed at init).
// ============================================================
(function () {
  "use strict";

  var form = document.getElementById("todoForm");
  if (!form) return;

  var input = document.getElementById("todoInput");
  var dateEl = document.getElementById("todoDate");
  var list = document.getElementById("todoList");
  var empty = document.getElementById("todoEmpty");
  var count = document.getElementById("todoCount");
  var statusEl = document.getElementById("todoStatus");
  var prioGroup = document.querySelector(".todo__prio-group");
  // New: toolbar, progress, search, filters, clear
  var toolbar = document.getElementById("todoToolbar");
  var searchInput = document.getElementById("todoSearch");
  var statusFilters = document.querySelectorAll("[data-filter]");
  var prioFilters = document.querySelectorAll("[data-prio-filter]");
  var clearBtn = document.getElementById("todoClear");
  var progress = document.getElementById("todoProgress");
  var progressBar = document.getElementById("todoProgressBar");
  var progressText = document.getElementById("todoProgressText");
  var emojiGroup = document.getElementById("todoEmojiGroup");
  var dateShortcuts = document.querySelectorAll("[data-days]");

  // ---- Supabase config ----
  var SUPA_URL = "https://gmpoesrzzwdcyhvokhpg.supabase.co";
  var SUPA_KEY = "sb_publishable_dGW0B86hWz3LzOGGR7TfIQ_lAAlhTEI";
  var TABLE = "todos";
  var client = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPA_URL, SUPA_KEY)
    : null;
  var useLocal = !client; // true when Supabase is unavailable — fallback to localStorage

  // ---- Local storage fallback for tasks ----
  var LOCAL_KEY = "todoTasksV1";
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]") || []; }
    catch (e) { return []; }
  }
  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch (e) {}
  }
  var localSeq = 0;
  function genLocalId() { return "local-" + Date.now() + "-" + (++localSeq); }

  var selectedPrio = "medium";
  var hasPrio = false; // probed at init; true if todos.prio column exists
  var PRIO = {
    low:    { emoji: "🟢", label: "Low" },
    medium: { emoji: "🟡", label: "Medium" },
    high:   { emoji: "🔴", label: "High" }
  };

  // ---- Emoji icon picker ----
  var EMOJIS = ["✨", "⭐", "📚", "💼", "🎯", "💡", "🛒", "🍽️", "🏃", "💊",
                "🧹", "🏠", "📞", "✉️", "🎉", "🎵", "🐶", "💰", "🎁", "✈️"];
  var DEFAULT_EMOJI = "✨";
  var selectedEmoji = DEFAULT_EMOJI;
  var hasEmoji = false; // probed at init; true if todos.emoji column exists
  // Local fallback so icons survive reloads even without a DB column
  var EMOJI_STORE_KEY = "todoEmojiV1";
  function loadEmojiStore() {
    try { return JSON.parse(localStorage.getItem(EMOJI_STORE_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  var emojiStore = loadEmojiStore();
  function saveEmojiStore() {
    try { localStorage.setItem(EMOJI_STORE_KEY, JSON.stringify(emojiStore)); } catch (e) {}
  }
  function itemEmoji(item) {
    return item.emoji || emojiStore[item.id] || DEFAULT_EMOJI;
  }
  function getDateState(iso, done) {
    if (!iso || done) return "";
    var p = String(iso).split("T")[0].split("-");
    if (p.length !== 3) return "";
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var t = new Date();
    var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var diff = Math.round((due - today0) / 86400000);
    if (diff === 0) return "today";
    if (diff < 0) return "overdue";
    return "";
  }
  var EMPTY_MSG = "🌱 Nothing here yet — add your first task above.";
  var FILTERED_EMPTY_MSG = "🔍 No tasks match these filters.";
  var SEARCH_EMPTY_MSG = "🔎 No tasks contain \"{query}\".";

  // New: filter + search state
  var statusFilter = "all";   // all | active | done
  var prioFilter = "all";    // all | low | medium | high
  var searchTerm = "";

  // Default the calendar to today
  var now = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  dateEl.value = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

  var items = [];

  // ---- helpers ----
  async function columnExists(col) {
    if (!client) return false;
    try {
      var res = await client.from(TABLE).select(col).limit(1);
      return !res.error;
    } catch (e) { return false; }
  }
  function formatDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("T")[0].split("-");
    if (p.length !== 3) return iso;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalizeRow(r) {
    return {
      id: String(r.id),
      text: r.task || "",
      date: r.date || "",
      prio: PRIO[r.prio] ? r.prio : "medium",
      emoji: r.emoji || "",
      done: !!r.is_complete
    };
  }
  var statusTimer = null;
  function setStatus(msg, isError) {
    if (!statusEl) return;
    if (!msg) { statusEl.hidden = true; statusEl.textContent = ""; return; }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("todo__status--ok", !isError);
    statusEl.classList.toggle("todo__status--err", !!isError);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.hidden = true; }, 4000);
  }

  // ---- helpers: filtering ----
  function getVisibleItems() {
    var term = searchTerm.trim().toLowerCase();
    return items.filter(function (i) {
      if (statusFilter === "active" && i.done) return false;
      if (statusFilter === "done" && !i.done) return false;
      if (prioFilter !== "all" && (i.prio || "medium") !== prioFilter) return false;
      if (term && i.text.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function updateProgress(done, total) {
    if (!progress) return;
    if (!total) {
      progress.hidden = true;
      return;
    }
    progress.hidden = false;
    var pct = Math.round((done / total) * 100);
    if (progressBar) progressBar.style.width = pct + "%";
    if (progressText) progressText.textContent = pct + "%";
    var track = progress.querySelector("[role='progressbar']");
    if (track) track.setAttribute("aria-valuenow", String(pct));
  }

  // ---- render ----
  function render() {
    list.innerHTML = "";

    var doneCount = 0;
    items.forEach(function (i) { if (i.done) doneCount++; });
    var total = items.length;

    updateProgress(doneCount, total);

    // Count chip — based on ALL items (not the filtered subset)
    if (total) {
      count.hidden = false;
      var all = doneCount === total;
      count.classList.toggle("todo__count--done", all);
      var icon = all ? "🎉" : (doneCount === 0 ? "📋" : "⏳");
      var suffix = all ? " — nice work!" : "";
      count.textContent = icon + " " + doneCount + " of " + total +
        " task" + (total === 1 ? "" : "s") + " completed" + suffix;
    } else {
      count.hidden = true;
      count.classList.remove("todo__count--done");
    }

    // Toolbar + progress only make sense once there's at least one task
    if (toolbar) toolbar.hidden = !total;
    if (clearBtn) clearBtn.disabled = doneCount === 0;

    // Truly empty list — show the "add your first task" empty state
    if (!total) {
      empty.style.display = "";
      empty.textContent = EMPTY_MSG;
      empty.classList.remove("todo__empty--filtered");
      return;
    }

    var visible = getVisibleItems();

    // Tasks exist but none match the current filters / search
    if (!visible.length) {
      empty.style.display = "";
      empty.classList.add("todo__empty--filtered");
      if (searchTerm.trim()) {
        empty.textContent = SEARCH_EMPTY_MSG.replace("{query}", searchTerm.trim());
      } else {
        empty.textContent = FILTERED_EMPTY_MSG;
      }
      return;
    }
    empty.style.display = "none";
    empty.classList.remove("todo__empty--filtered");

    visible.forEach(function (item) {
      var p = PRIO[item.prio] || PRIO.medium;
      var dateState = getDateState(item.date, item.done);
      var li = document.createElement("li");
      li.className = "todo__item" + (item.done ? " todo__item--done" : "");
      li.dataset.id = item.id;
      li.dataset.prio = item.prio || "medium";
      li.innerHTML =
        '<label class="todo__check">' +
          '<input type="checkbox" class="todo__checkbox"' + (item.done ? " checked" : "") +
          ' aria-label="Mark task complete">' +
          '<span class="todo__box" aria-hidden="true"></span>' +
        '</label>' +
        '<span class="todo__emoji-badge" aria-hidden="true">' + itemEmoji(item) + '</span>' +
        '<div class="todo__content">' +
          '<p class="todo__text" title="Click to edit">' + escapeHtml(item.text) + '</p>' +
          '<div class="todo__meta">' +
            '<span class="todo__date' + (dateState ? ' todo__date--' + dateState : '') + '">📅 ' +
              escapeHtml(formatDate(item.date)) +
              (dateState === "today" ? ' · Today' : dateState === "overdue" ? ' · Overdue' : '') +
            '</span>' +
            '<span class="todo__prio-tag todo__prio-tag--' + (item.prio || "medium") + '">' +
              p.emoji + ' ' + p.label + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="todo__del" aria-label="Delete task">×</button>';
      list.appendChild(li);
    });
  }

  // ---- Supabase ops ----
  async function load() {
    if (useLocal) {
      items = loadLocal().map(function (r) {
        return {
          id: String(r.id), text: r.task || r.text || "", date: r.date || "",
          prio: PRIO[r.prio] ? r.prio : "medium", emoji: r.emoji || "",
          done: !!r.is_complete
        };
      });
      return;
    }
    try {
      var res = await client.from(TABLE).select("*").order("created_at", { ascending: false });
      if (res.error) throw res.error;
      items = (res.data || []).map(normalizeRow);
    } catch (e) {
      // Supabase unreachable — fall back to localStorage
      useLocal = true;
      items = loadLocal().map(function (r) {
        return {
          id: String(r.id), text: r.task || r.text || "", date: r.date || "",
          prio: PRIO[r.prio] ? r.prio : "medium", emoji: r.emoji || "",
          done: !!r.is_complete
        };
      });
    }
  }

  async function add(text, date, prio, emoji) {
    emoji = emoji || DEFAULT_EMOJI;
    if (useLocal) {
      var localItem = {
        id: genLocalId(), text: text, date: date, prio: prio,
        emoji: emoji, done: false
      };
      emojiStore[localItem.id] = emoji;
      saveEmojiStore();
      items.unshift(localItem);
      saveLocal();
      render();
      setStatus("✅ Task saved (local)", false);
      return;
    }
    var payload = { task: text, date: date, is_complete: false };
    if (hasPrio) payload.prio = prio;
    if (hasEmoji) payload.emoji = emoji;
    try {
      var res = await client.from(TABLE).insert([payload]).select().single();
      if (res.error) throw res.error;
    } catch (e) {
      // Supabase unreachable — fall back to localStorage
      useLocal = true;
      var fbItem = {
        id: genLocalId(), text: text, date: date, prio: prio,
        emoji: emoji, done: false
      };
      emojiStore[fbItem.id] = emoji;
      saveEmojiStore();
      items.unshift(fbItem);
      saveLocal();
      render();
      setStatus("✅ Task saved (local)", false);
      return;
    }
    var item = normalizeRow(res.data);
    if (!hasPrio) item.prio = prio;
    emojiStore[item.id] = emoji;
    saveEmojiStore();
    if (!item.emoji) item.emoji = emoji;
    items.unshift(item);
    render();
    setStatus("✅ Task saved", false);
  }

  async function toggle(id) {
    var item = items.find(function (i) { return i.id === String(id); });
    if (!item) return;
    item.done = !item.done;
    render();
    if (useLocal) { saveLocal(); return; }
    try {
      var res = await client.from(TABLE).update({ is_complete: item.done }).eq("id", id);
      if (res.error) throw res.error;
    } catch (e) {
      // Supabase unreachable — keep local change, no rollback needed
      useLocal = true;
      saveLocal();
    }
  }

  async function removeTask(id) {
    items = items.filter(function (i) { return i.id !== String(id); });
    delete emojiStore[id];
    saveEmojiStore();
    render();
    if (useLocal) { saveLocal(); setStatus("🗑️ Task deleted", false); return; }
    try {
      var res = await client.from(TABLE).delete().eq("id", id);
      if (res.error) throw res.error;
      setStatus("🗑️ Task deleted", false);
    } catch (e) {
      useLocal = true;
      saveLocal();
      setStatus("🗑️ Task deleted (local)", false);
    }
  }

  async function editText(id, newText) {
    var item = items.find(function (i) { return i.id === String(id); });
    if (!item) return;
    var prev = item.text;
    item.text = newText;
    render();
    if (useLocal) { saveLocal(); return; }
    try {
      var res = await client.from(TABLE).update({ task: newText }).eq("id", id);
      if (res.error) throw res.error;
    } catch (e) {
      useLocal = true;
      saveLocal();
    }
  }

  // ---- inline edit ----
  function startEdit(li, id) {
    var item = items.find(function (i) { return i.id === String(id); });
    if (!item) return;
    var p = li.querySelector(".todo__text");
    p.innerHTML = '<input type="text" class="todo__edit" maxlength="140" autocomplete="off" />';
    var editInput = p.querySelector(".todo__edit");
    editInput.value = item.text;
    editInput.focus();
    editInput.select();

    var settled = false;
    var commit = function () {
      if (settled) return;
      settled = true;
      var val = editInput.value.trim();
      if (!val || val === item.text) { render(); return; }
      editText(id, val);
    };
    var cancel = function () {
      if (settled) return;
      settled = true;
      render();
    };

    editInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    editInput.addEventListener("blur", commit);
  }

  // ---- build emoji picker ----
  if (emojiGroup) {
    EMOJIS.forEach(function (em) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "todo__emoji-btn" + (em === selectedEmoji ? " is-active" : "");
      b.dataset.emoji = em;
      b.textContent = em;
      b.setAttribute("aria-label", "Icon " + em);
      emojiGroup.appendChild(b);
    });
    emojiGroup.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo__emoji-btn");
      if (!btn) return;
      selectedEmoji = btn.dataset.emoji;
      emojiGroup.querySelectorAll(".todo__emoji-btn").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
    });
  }

  // ---- quick date chips: Today / Tomorrow / Next week ----
  dateShortcuts.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var d = new Date();
      d.setDate(d.getDate() + parseInt(btn.dataset.days, 10));
      dateEl.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      dateEl.focus();
    });
  });

  // ---- events ----
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    var date = dateEl.value;
    if (!text || !date) return;
    add(text, date, selectedPrio, selectedEmoji);
    input.value = "";
    // Reset icon picker to default for the next task
    selectedEmoji = DEFAULT_EMOJI;
    if (emojiGroup) {
      emojiGroup.querySelectorAll(".todo__emoji-btn").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.emoji === DEFAULT_EMOJI);
      });
    }
    input.focus();
  });

  if (prioGroup) {
    prioGroup.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo__prio");
      if (!btn) return;
      selectedPrio = btn.dataset.prio;
      prioGroup.querySelectorAll(".todo__prio").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
    });
  }

  list.addEventListener("click", function (e) {
    var li = e.target.closest(".todo__item");
    if (!li) return;
    var id = li.dataset.id;
    if (e.target.classList.contains("todo__checkbox")) {
      toggle(id);
    } else if (e.target.classList.contains("todo__del")) {
      li.style.opacity = "0";
      li.style.transform = "translateX(14px)";
      setTimeout(function () { removeTask(id); }, 180);
    } else {
      var textEl = e.target.closest(".todo__text");
      if (textEl && !textEl.querySelector(".todo__edit")) startEdit(li, id);
    }
  });

  // ---- search + filter + clear events ----
  if (searchInput) {
    var searchTimer = null;
    searchInput.addEventListener("input", function (e) {
      searchTerm = e.target.value || "";
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { render(); }, 140);
    });
  }

  if (statusFilters && statusFilters.length) {
    statusFilters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        statusFilter = btn.dataset.filter;
        statusFilters.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        render();
      });
    });
  }

  if (prioFilters && prioFilters.length) {
    prioFilters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        prioFilter = btn.dataset.prioFilter;
        prioFilters.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
        render();
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async function () {
      var doneIds = items.filter(function (i) { return i.done; }).map(function (i) { return i.id; });
      if (!doneIds.length) return;
      // Optimistically remove locally
      items = items.filter(function (i) { return !i.done; });
      render();
      setStatus("🧹 Cleared " + doneIds.length + " completed task" + (doneIds.length === 1 ? "" : "s"), false);
      if (useLocal) { saveLocal(); return; }
      var failed = [];
      for (var idx = 0; idx < doneIds.length; idx++) {
        try {
          var res = await client.from(TABLE).delete().eq("id", doneIds[idx]);
          if (res.error) failed.push(doneIds[idx]);
        } catch (e) { failed.push(doneIds[idx]); }
      }
      if (failed.length) {
        // Supabase failed — switch to local mode, tasks already removed from memory
        useLocal = true;
        saveLocal();
        setStatus("🧹 Cleared " + doneIds.length + " (local)", false);
      }
    });
  }

  // ---- init ----
  empty.style.display = "";
  empty.textContent = "⏳ Loading your tasks…";
  (async function init() {
    try {
      var results = await Promise.all([columnExists("prio"), columnExists("emoji")]);
      hasPrio = results[0];
      hasEmoji = results[1];
    } catch (e) {
      // Supabase probe failed — will fall back to localStorage in load()
    }
    await load();
    render();
  })();
})();

// ============================================================
// Weather App — on Projects page
// UAPI Weather API: GET https://uapis.cn/api/v1/misc/weather?city=<name>
// Success → { city, weather, weather_icon, temperature, ... }
// Unknown city → HTTP 404 { error: "LOCATION_NOT_FOUND" }
//
// UAPI fuzzy-matches its input and can answer with a random city for
// gibberish (e.g. "asdfgh" → 阿), OpenStreetMap holds tiny POIs named
// "海上", and the Photon geocoder itself fuzzy-matches short queries
// ("abc" → ABC-eilanden). So a name is only accepted when it resolves to a
// real city/region/country AND the resolved name corresponds to the input.
// No accepted place → "Couldn't find that city" without calling UAPI.
// ============================================================
(function () {
  "use strict";

  var form = document.getElementById("weatherForm");
  if (!form) return;

  var input = document.getElementById("weatherInput");
  var statusEl = document.getElementById("weatherStatus");
  var result = document.getElementById("weatherResult");
  var iconEl = document.getElementById("weatherIcon");
  var cityEl = document.getElementById("weatherCity");
  var tempEl = document.getElementById("weatherTemp");
  var condEl = document.getElementById("weatherCond");
  var forecastEl = document.getElementById("weatherForecast");
  var unitWrap = document.getElementById("weatherUnit");
  var rangeEl = document.getElementById("weatherRange");
  var detailsEl = document.getElementById("weatherDetails");
  var footEl = document.getElementById("weatherFoot");
  var clockEl = document.getElementById("weatherClock");
  var clockHMEl = document.getElementById("weatherClockHM");
  var clockSecEl = document.getElementById("weatherClockSec");
  var clockDateEl = document.getElementById("weatherClockDate");
  var clockZoneEl = document.getElementById("weatherClockZone");

  var API_URL = "https://uapis.cn/api/v1/misc/weather";
  var TIME_URL = "https://uapis.cn/api/v1/misc/worldtime";
  var PHOTON_URL = "https://photon.komoot.io/api/";

  // UTC offset (seconds) from the last Open-Meteo reply — used to show a local
  // time when the world-time API can't answer for the typed name.
  var meteoOffset = null;

  // Place types accepted as a real searchable location. Villages, hamlets and
  // POIs are left out on purpose, so an invented name can't resolve to them.
  var PLACE_TYPES = {
    city: 1, town: 1, municipality: 1, borough: 1,
    county: 1, province: 1, state: 1, region: 1, country: 1
  };

  // UAPI resolves city names. For a larger area — a country, state or region —
  // its fuzzy matcher answers with an arbitrary city ("China" → 福州市), so
  // only these place types are sent to it.
  var CITY_TYPES = { city: 1, town: 1, municipality: 1, borough: 1 };

  function hasCJK(s) {
    return /[\u4e00-\u9fff]/.test(s);
  }

  // Normalise a name for comparison: lowercase, drop accents and separators,
  // drop common administrative suffixes (北京市 → 北京, Mexico City → Mexico).
  function normalizeName(s) {
    var out = String(s).toLowerCase();
    if (out.normalize) out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out = out.replace(/[\s'’.\-·,()（）]/g, "");
    out = out.replace(/(市|省|區|区|縣|县|都)$/, "");
    out = out.replace(/(city|town|province|state|county|region)$/, "");
    return out;
  }

  // Does a resolved place actually correspond to what was typed?
  function nameMatches(input, placeName) {
    var a = normalizeName(input);
    var b = normalizeName(placeName);
    if (!a || !b) return false;
    if (a === b) return true;
    // Latin and CJK names can't be compared ("Beijing" → 北京市), so trust
    // the geocoder for cross-script matches.
    if (hasCJK(a) !== hasCJK(b)) return true;
    // Short queries pick up unrelated places by prefix ("ab" → Abruzzo,
    // "abc" → ABC-eilanden), so they have to match exactly.
    if (a.length <= 3 || b.length <= 3) return false;
    return b.indexOf(a) !== -1 || a.indexOf(b) !== -1;
  }

  // Resolve the typed text to a real place (Photon / OpenStreetMap). It is
  // CORS-open, so it works even when the page is opened from file://.
  // Returns { name, type, lat, lon }, or null when nothing matches.
  async function findPlace(city) {
    var res = await fetch(PHOTON_URL + "?q=" + encodeURIComponent(city) + "&limit=5");
    if (!res.ok) throw new Error("HTTP " + res.status);
    var features = (await res.json()).features || [];
    var fallback = null;
    for (var i = 0; i < features.length; i++) {
      var props = features[i].properties || {};
      if (props.osm_key !== "place" || !PLACE_TYPES[props.osm_value]) continue;
      if (!nameMatches(city, props.name || "")) continue;
      var coords = features[i].geometry.coordinates;
      var found = {
        name: props.name || city,
        type: props.osm_value,
        lat: coords[1],
        lon: coords[0]
      };
      // Prefer a city-level match — that is what UAPI can answer for; a
      // country/state/region match is kept only if nothing narrower shows up.
      if (CITY_TYPES[found.type]) return found;
      if (!fallback) fallback = found;
    }
    return fallback;
  }

  // ---- Primary source: the UAPI Weather API ----
  // Called only after the typed name was verified as a real place, so UAPI's
  // fuzzy matcher can't quietly answer with a different city.
  // Returns { notFound: true } when the API itself answers 404.
  async function weatherFromUapi(name) {
    var res = await fetch(API_URL + "?city=" + encodeURIComponent(name));
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    if (!data || data.temperature === undefined || !data.weather) return { notFound: true };
    return {
      city: data.city || name,
      temp: data.temperature,
      cond: data.weather,
      icon: iconFor(data.weather_icon)
    };
  }

  // ---- Fallback source: Open-Meteo ----
  // A page opened straight from disk (file://) reports its origin as "null",
  // which the UAPI API does not allow, so the browser blocks that call.
  // Open-Meteo allows every origin, which keeps the app working in that case.
  var WMO = {
    0: ["☀️", "晴"],        1: ["🌤️", "晴间多云"],  2: ["⛅", "多云"],
    3: ["☁️", "阴天"],      45: ["🌫️", "雾"],       48: ["🌫️", "雾凇"],
    51: ["🌦️", "毛毛雨"],   53: ["🌦️", "小雨"],     55: ["🌧️", "中雨"],
    56: ["🌧️", "冻雨"],     57: ["🌧️", "冻雨"],     61: ["🌦️", "小雨"],
    63: ["🌧️", "中雨"],     65: ["🌧️", "大雨"],     66: ["🌧️", "冻雨"],
    67: ["🌧️", "冻雨"],     71: ["🌨️", "小雪"],     73: ["🌨️", "中雪"],
    75: ["❄️", "大雪"],     77: ["🌨️", "雪粒"],     80: ["🌦️", "阵雨"],
    81: ["🌧️", "阵雨"],     82: ["⛈️", "强阵雨"],   85: ["🌨️", "阵雪"],
    86: ["❄️", "强阵雪"],   95: ["⛈️", "雷阵雨"],   96: ["⛈️", "雷阵雨伴冰雹"],
    99: ["⛈️", "雷阵雨伴冰雹"]
  };

  // Open-Meteo answers with the current conditions, the hourly visibility /
  // UV / rain-chance, and the 3-day daily forecast in a single call.
  async function fetchMeteo(place) {
    var f = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + place.lat +
      "&longitude=" + place.lon +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation," +
      "weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&hourly=visibility,uv_index,precipitation_probability" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max" +
      "&forecast_days=3&timezone=auto");
    if (!f.ok) throw new Error("METEO HTTP " + f.status);
    var data = await f.json();
    if (data && isFinite(data.utc_offset_seconds)) meteoOffset = Number(data.utc_offset_seconds);
    return data;
  }

  // Daily rows, ready to render: [{ date, icon, cond, hi, lo }]
  function daysFromMeteo(data) {
    var d = data && data.daily;
    if (!d || !d.time) return [];
    var out = [];
    for (var i = 0; i < d.time.length; i++) {
      var wmo = WMO[d.weather_code[i]] || ["🌡️", "—"];
      out.push({
        date: d.time[i],
        icon: wmo[0],
        cond: wmo[1],
        hi: d.temperature_2m_max[i],
        lo: d.temperature_2m_min[i]
      });
    }
    return out;
  }

  // ---- Conditions at a glance ----
  // Everything here comes from the same Open-Meteo reply, so the detail grid
  // stays in step with the temperature and forecast.
  function round1(n) {
    var v = Number(n);
    return isFinite(v) ? Math.round(v * 10) / 10 : null;
  }

  function compass(deg) {
    var dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    var n = Number(deg);
    if (!isFinite(n)) return "";
    return dirs[Math.round((((n % 360) + 360) % 360) / 22.5) % 16];
  }

  function uvLevel(v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    if (n < 3) return "Low";
    if (n < 6) return "Moderate";
    if (n < 8) return "High";
    if (n < 11) return "Very high";
    return "Extreme";
  }

  // Index of the hourly row that matches the current observation.
  function hourAt(data) {
    var cur = data && data.current && data.current.time;
    var times = data && data.hourly && data.hourly.time;
    if (!cur || !times) return -1;
    var key = String(cur).slice(0, 13);
    for (var i = 0; i < times.length; i++) {
      if (String(times[i]).slice(0, 13) === key) return i;
    }
    return -1;
  }

  function clockPart(iso) {
    var s = String(iso || "");
    return s.length >= 16 ? s.slice(11, 16) : "";
  }

  function detailsFromMeteo(data) {
    var cur = (data && data.current) || {};
    var daily = (data && data.daily) || {};
    var hourly = (data && data.hourly) || {};
    var i = hourAt(data);
    var out = [];

    if (cur.apparent_temperature !== undefined && cur.apparent_temperature !== null) {
      out.push({ icon: "🌡️", label: "Feels like", temp: cur.apparent_temperature });
    }
    if (cur.relative_humidity_2m !== undefined && cur.relative_humidity_2m !== null) {
      out.push({ icon: "💧", label: "Humidity", value: Math.round(cur.relative_humidity_2m) + "%" });
    }
    if (cur.wind_speed_10m !== undefined && cur.wind_speed_10m !== null) {
      var gust = round1(cur.wind_gusts_10m);
      out.push({
        icon: "💨",
        label: "Wind",
        value: Math.round(cur.wind_speed_10m) + " km/h",
        sub: [compass(cur.wind_direction_10m), gust !== null ? "gust " + gust + " km/h" : ""]
          .filter(Boolean).join(" · ")
      });
    }
    if (cur.pressure_msl !== undefined && cur.pressure_msl !== null) {
      out.push({ icon: "🧭", label: "Pressure", value: Math.round(cur.pressure_msl) + " hPa" });
    }
    if (cur.cloud_cover !== undefined && cur.cloud_cover !== null) {
      out.push({ icon: "☁️", label: "Cloud cover", value: Math.round(cur.cloud_cover) + "%" });
    }
    if (cur.precipitation !== undefined && cur.precipitation !== null) {
      var chance = i >= 0 && hourly.precipitation_probability ? hourly.precipitation_probability[i] : null;
      out.push({
        icon: "🌧️",
        label: "Precipitation",
        value: round1(cur.precipitation) + " mm",
        sub: chance !== null && chance !== undefined ? "chance " + Math.round(chance) + "%" : ""
      });
    }
    var vis = i >= 0 && hourly.visibility ? Number(hourly.visibility[i]) : NaN;
    if (isFinite(vis)) {
      out.push({
        icon: "👁️",
        label: "Visibility",
        value: vis >= 1000 ? round1(vis / 1000) + " km" : Math.round(vis) + " m"
      });
    }
    var uv = i >= 0 && hourly.uv_index ? Number(hourly.uv_index[i]) : NaN;
    if (!isFinite(uv) && daily.uv_index_max && daily.uv_index_max[0] !== undefined) {
      uv = Number(daily.uv_index_max[0]);
    }
    if (isFinite(uv)) {
      out.push({ icon: "☀️", label: "UV index", value: round1(uv), sub: uvLevel(uv) });
    }
    var rise = clockPart(daily.sunrise && daily.sunrise[0]);
    if (rise) out.push({ icon: "🌅", label: "Sunrise", value: rise });
    var set = clockPart(daily.sunset && daily.sunset[0]);
    if (set) out.push({ icon: "🌇", label: "Sunset", value: set });

    return out;
  }

  function highLowFromMeteo(data) {
    var d = data && data.daily;
    if (!d || !d.temperature_2m_max || d.temperature_2m_max[0] === undefined) return null;
    return { hi: d.temperature_2m_max[0], lo: d.temperature_2m_min[0] };
  }

  async function weatherFromPlace(place) {
    var data = await fetchMeteo(place);
    var current = data.current;
    if (!current || current.temperature_2m === undefined) return { notFound: true };

    var wmo = WMO[current.weather_code] || ["🌡️", "—"];
    var hl = highLowFromMeteo(data) || {};
    return {
      city: place.name,
      temp: current.temperature_2m,
      cond: wmo[1],
      icon: wmo[0],
      days: daysFromMeteo(data),
      details: detailsFromMeteo(data),
      hi: hl.hi,
      lo: hl.lo,
      source: "Open-Meteo"
    };
  }

  // HeWeather-style icon codes → emoji
  function iconFor(code) {
    var n = parseInt(code, 10);
    if (isNaN(n)) return "🌡️";
    if (n === 100) return "☀️";
    if (n === 101) return "⛅";
    if (n === 102 || n === 103) return "🌤️";
    if (n === 104) return "☁️";
    if (n >= 150 && n <= 153) return "🌙";
    if (n === 300 || n === 301) return "🌦️";
    if (n >= 302 && n <= 304) return "⛈️";
    if (n >= 300 && n < 400) return "🌧️";
    if (n === 402 || n === 403) return "❄️";
    if (n >= 400 && n < 500) return "🌨️";
    if (n >= 500 && n < 600) return "🌫️";
    if (n === 900) return "🥵";
    if (n === 901) return "🥶";
    return "🌡️";
  }

  function showStatus(msg, isError) {
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle("weather__status--err", !!isError);
  }

  function showNotFound() {
    showStatus("Couldn't find that city — check the spelling.", true);
  }

  // ---- Temperature unit (°C / °F) ----
  // Temperatures stay in Celsius and are converted only for display, so the
  // toggle can re-render the last result instantly without another request.
  var unit = "c";
  var last = null;

  function convTemp(c) {
    var n = Number(c);
    if (!isFinite(n)) return null;
    return unit === "f" ? n * 9 / 5 + 32 : n;
  }
  function fmtTemp(c) {
    var v = convTemp(c);
    return v === null ? "—" : Math.round(v) + (unit === "f" ? "°F" : "°C");
  }
  function fmtDayTemp(c) {
    var v = convTemp(c);
    return v === null ? "—" : Math.round(v) + "°";
  }

  // Weekday labels follow the language the user typed in: a Latin name gets
  // English weekdays, a Chinese name gets Chinese ones.
  var EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var ZH_DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var zhLabels = false;

  function dayLabel(iso) {
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var t = new Date();
    if (d.getTime() === new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) {
      return zhLabels ? "今天" : "Today";
    }
    return (zhLabels ? ZH_DAYS : EN_DAYS)[d.getDay()];
  }

  // ---- Live local time at the searched city ----
  // A UTC offset (seconds) is enough to keep the clock ticking every second:
  // Open-Meteo reports it for the exact coordinates, and when that call fails
  // the UAPI World Time API (English names only) can supply it instead.
  var EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var clockTimer = null;

  function pad2(n) { return String(n).padStart(2, "0"); }

  async function offsetFromUapi(name) {
    var res = await fetch(TIME_URL + "?city=" + encodeURIComponent(name));
    if (!res.ok) return null;
    var data = await res.json();
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
      .exec(String((data && data.datetime) || ""));
    if (!m) return null;
    var localMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var minutes = Math.round((localMs - Date.now()) / 60000);
    return isFinite(minutes) ? minutes * 60 : null;
  }

  function fmtZone(offset) {
    var sign = offset < 0 ? "-" : "+";
    var a = Math.abs(offset);
    return "UTC" + sign + pad2(Math.floor(a / 3600)) + ":" + pad2(Math.floor((a % 3600) / 60));
  }

  function clockDate(d) {
    if (zhLabels) {
      return ZH_DAYS[d.getUTCDay()] + " · " + (d.getUTCMonth() + 1) + "月" + d.getUTCDate() + "日";
    }
    return EN_DAYS[d.getUTCDay()] + ", " + EN_MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function renderClock() {
    if (!last || !clockHMEl) return;
    var d = new Date(Date.now() + last.offset * 1000);
    clockHMEl.textContent = pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
    if (clockSecEl) clockSecEl.textContent = ":" + pad2(d.getUTCSeconds());
    if (clockDateEl) clockDateEl.textContent = clockDate(d);
    if (clockZoneEl) clockZoneEl.textContent = fmtZone(last.offset);
  }

  function startClock() {
    if (!clockEl || last.offset === null || last.offset === undefined) return;
    clockEl.hidden = false;
    renderClock();
    if (clockTimer) return;
    clockTimer = setInterval(renderClock, 1000);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (clockEl) clockEl.hidden = true;
  }

  function fmtUpdated(ms, offset) {
    var d = new Date(ms + offset * 1000);
    return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
  }

  function renderForecast(days) {
    if (!forecastEl) return;
    forecastEl.textContent = "";
    if (!days || !days.length) { forecastEl.hidden = true; return; }
    days.forEach(function (day) {
      var cell = document.createElement("div");
      cell.className = "weather__day";

      var name = document.createElement("span");
      name.className = "weather__day-name";
      name.textContent = dayLabel(day.date);

      var icon = document.createElement("span");
      icon.className = "weather__day-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = day.icon;

      var cond = document.createElement("span");
      cond.className = "weather__day-cond";
      cond.textContent = day.cond;

      var temps = document.createElement("span");
      temps.className = "weather__day-temps";
      temps.textContent = fmtDayTemp(day.hi) + " / " + fmtDayTemp(day.lo);

      cell.appendChild(name);
      cell.appendChild(icon);
      cell.appendChild(cond);
      cell.appendChild(temps);
      forecastEl.appendChild(cell);
    });
    forecastEl.hidden = false;
  }

  function renderDetails() {
    if (!detailsEl) return;
    detailsEl.textContent = "";
    var list = (last && last.details) || [];
    if (!list.length) { detailsEl.hidden = true; return; }
    list.forEach(function (d) {
      var cell = document.createElement("div");
      cell.className = "weather__detail";

      var label = document.createElement("span");
      label.className = "weather__detail-label";
      label.textContent = d.icon + " " + d.label;

      var value = document.createElement("span");
      value.className = "weather__detail-value";
      value.textContent = d.temp !== undefined ? fmtTemp(d.temp) : d.value;

      cell.appendChild(label);
      cell.appendChild(value);

      if (d.sub) {
        var sub = document.createElement("span");
        sub.className = "weather__detail-sub";
        sub.textContent = d.sub;
        cell.appendChild(sub);
      }
      detailsEl.appendChild(cell);
    });
    detailsEl.hidden = false;
  }

  function renderFoot() {
    if (!footEl) return;
    if (!last || last.updated === undefined) { footEl.hidden = true; return; }
    footEl.textContent = "Updated " + fmtUpdated(last.updated, last.offset) + " local · " + last.source;
    footEl.hidden = false;
  }

  function render() {
    if (!last) return;
    iconEl.textContent = last.icon;
    cityEl.textContent = last.city;
    tempEl.textContent = fmtTemp(last.temp);
    condEl.textContent = last.cond;

    if (rangeEl) {
      if (last.hi !== undefined && last.lo !== undefined) {
        rangeEl.textContent = "↑ " + fmtDayTemp(last.hi) + "   ↓ " + fmtDayTemp(last.lo);
        rangeEl.hidden = false;
      } else {
        rangeEl.textContent = "";
        rangeEl.hidden = true;
      }
    }

    renderDetails();
    renderForecast(last.days);
    renderFoot();
    startClock();
  }

  function updateUnitButtons() {
    if (!unitWrap) return;
    var btns = unitWrap.querySelectorAll("[data-unit]");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-unit") === unit;
      btns[i].classList.toggle("is-active", on);
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  if (unitWrap) {
    unitWrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-unit]");
      if (!btn || !unitWrap.contains(btn)) return;
      var next = btn.getAttribute("data-unit");
      if (next === unit) return;
      unit = next;
      updateUnitButtons();
      render();
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var city = input.value.trim();
    result.hidden = true;
    stopClock();

    if (!city) { showStatus("Enter a city first.", true); return; }

    // Forecast weekday labels match the language of what was typed.
    zhLabels = hasCJK(city);
    meteoOffset = null;

    showStatus("Loading…", false);

    // The typed name must resolve to a real place before we ask for weather.
    // UAPI fuzzy-matches nonsense ("asdfgh" → 阿, "banana" → 重庆城区), and
    // OpenStreetMap holds tiny POIs named "海上", so without this gate an
    // invented name would come back with somebody else's weather.
    var place;
    try {
      place = await findPlace(city);
    } catch (err) {
      showStatus("⚠️ Couldn't reach the weather service — check your connection and try again.", true);
      return;
    }
    if (!place) { showNotFound(); return; }

    // Try the UAPI API first — but only for city-level places, because its
    // `city` parameter fuzzy-matches larger areas ("China" → 福州市). A page
    // opened from file:// has that call blocked by CORS, and UAPI may simply
    // not know the place, so fall back to Open-Meteo at the verified coords.
    var out = null;
    if (CITY_TYPES[place.type]) {
      try {
        out = await weatherFromUapi(city);
      } catch (err) {
        out = null;
      }
    }
    if (!out || out.notFound) {
      // UAPI unreachable (file://) or doesn't know the place — Open-Meteo
      // supplies both the current conditions and the 3-day forecast.
      try {
        out = await weatherFromPlace(place);
      } catch (err) {
        showStatus("⚠️ Couldn't reach the weather service — check your connection and try again.", true);
        return;
      }
    } else {
      // UAPI answered with the current weather, but its endpoint carries no
      // forecast or extra metrics, so those come from Open-Meteo at the same
      // coordinates.
      out.source = "UAPI + Open-Meteo";
      try {
        var meta = await fetchMeteo(place);
        out.days = daysFromMeteo(meta);
        out.details = detailsFromMeteo(meta);
        var hl = highLowFromMeteo(meta);
        if (hl) { out.hi = hl.hi; out.lo = hl.lo; }
      } catch (err) {
        out.days = [];
      }
    }

    if (out.notFound) { showNotFound(); return; }

    // UTC offset keeps the live clock on the city's wall time. Open-Meteo
    // reports it for the exact coordinates; the world-time API is a fallback
    // when that call failed, and the viewer's own offset is the last resort.
    var offset = meteoOffset;
    if (offset === null) {
      try {
        offset = await offsetFromUapi(city);
      } catch (err) {
        offset = null;
      }
    }
    if (offset === null) offset = -new Date().getTimezoneOffset() * 60;

    out.offset = offset;
    out.updated = Date.now();

    last = out;
    updateUnitButtons();
    render();
    statusEl.hidden = true;
    statusEl.textContent = "";
    result.hidden = false;
  });
})();
