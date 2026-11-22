/*
 * Compact tester dashboard.
 *
 * The token stays in sessionStorage; nothing secret lives in this file.
 * Automation first: new signups can be invited automatically, the closing
 * survey can be scheduled, and the Play list is always copied in full.
 */
(function () {
  "use strict";

  var API_BASE = "https://yuban-api.binfloo.workers.dev";
  var TOKEN_KEY = "yuban_admin_token";
  var PLAY_KEY = "yuban_play_copied";
  var PLAY_KNOWN = "yuban_play_known";

  var tokenInput = document.getElementById("admin-token");
  var loadButton = document.getElementById("load-button");
  var clearButton = document.getElementById("clear-button");
  var status = document.getElementById("admin-status");
  var overview = document.getElementById("overview");
  var summary = document.getElementById("summary");
  var progressBar = document.getElementById("progress-bar");
  var progressLabel = document.getElementById("progress-label");
  var inviteOpenButton = document.getElementById("invite-open-button");
  var rows = document.getElementById("tester-rows");
  if (!tokenInput || !rows) return;

  var toastNode = document.getElementById("toast");
  var toastTimer = null;

  var autoInvite = document.getElementById("auto-invite");
  var surveyUrl = document.getElementById("survey-url");
  var surveyAt = document.getElementById("survey-at");
  var settingsSave = document.getElementById("settings-save");
  var surveyButton = document.getElementById("survey-button");
  var autoHint = document.getElementById("auto-hint");

  var playCount = document.getElementById("play-count");
  var copyPlayButton = document.getElementById("copy-play-button");
  var csvButton = document.getElementById("csv-button");
  var playStatus = document.getElementById("play-status");
  var playPreview = document.getElementById("play-preview");
  var playPreviewWrap = document.getElementById("play-preview-wrap");
  var playPaste = document.getElementById("play-paste");
  var playCompareButton = document.getElementById("play-compare-button");
  var playMissingButton = document.getElementById("play-missing-button");
  var playDiff = document.getElementById("play-diff");

  var mailKey = document.getElementById("mail-key");
  var mailSubject = document.getElementById("mail-subject");
  var mailBody = document.getElementById("mail-body");
  var mailHint = document.getElementById("mail-hint");
  var mailSave = document.getElementById("mail-save");
  var mailReset = document.getElementById("mail-reset");
  var mailStatus = document.getElementById("mail-status");

  var testers = null;
  var settings = null;
  var mailTemplates = [];
  var busy = false;

  var saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) tokenInput.value = saved;

  function token() {
    return tokenInput.value.trim();
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function setText(node, message, isError) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error", Boolean(isError));
  }

  function toast(message, isError) {
    if (!toastNode) return;
    toastNode.textContent = message;
    toastNode.classList.toggle("error", Boolean(isError));
    toastNode.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastNode.classList.remove("show");
    }, 3200);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function statusLabel(value) {
    if (value === "invited") return "eingeladen";
    if (value === "declined") return "abgesagt";
    return "offen";
  }

  function statusClass(value) {
    if (value === "invited") return "status status-invited";
    if (value === "declined") return "status status-declined";
    return "status status-pending";
  }

  function shortDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function longDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toInputValue(ms) {
    var date = new Date(ms);
    function pad(value) {
      return String(value).padStart(2, "0");
    }
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      "T" +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes())
    );
  }

  function parseInputValue(value) {
    if (!value) return null;
    var parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function playEmails() {
    if (!testers) return [];
    return testers
      .filter(function (tester) {
        return tester.status !== "declined";
      })
      .map(function (tester) {
        return tester.google_email;
      });
  }

  function copiedSet() {
    try {
      var raw = localStorage.getItem(PLAY_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  function newSinceCopy() {
    var copied = copiedSet();
    return playEmails().filter(function (email) {
      return !copied.has(email);
    }).length;
  }

  function knownEmails() {
    try {
      var raw = localStorage.getItem(PLAY_KNOWN);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  function parseEmails(text) {
    var matches = String(text || "").toLowerCase().match(/[^\s,;<>()]+@[^\s,;<>()]+/g) || [];
    return matches.map(function (value) {
      return value.replace(/[.,;:]+$/, "");
    });
  }

  function comparePlayList() {
    var emails = parseEmails(playPaste ? playPaste.value : "");
    if (emails.length === 0) {
      setText(playStatus, "Bitte zuerst die Play-Liste einfügen.", true);
      return;
    }
    localStorage.setItem(PLAY_KNOWN, JSON.stringify(Array.from(new Set(emails))));
    renderPlay();
    setText(playStatus, emails.length + " Adressen aus Play übernommen.", false);
  }

  function missingInPlay() {
    var known = knownEmails();
    return playEmails().filter(function (email) {
      return !known.has(email);
    });
  }

  function downloadMissing() {
    var missing = missingInPlay();
    if (missing.length === 0) return;
    var blob = new Blob([missing.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "yuban-play-missing.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
    setText(playStatus, missing.length + " fehlende Adressen als CSV gespeichert.", false);
  }

  function renderSummary() {
    if (!testers) return;
    var counts = { pending: 0, invited: 0, declined: 0 };
    testers.forEach(function (tester) {
      counts[tester.status] = (counts[tester.status] || 0) + 1;
    });

    summary.replaceChildren();
    [
      [testers.length + " Anmeldungen", ""],
      [(counts.pending || 0) + " offen", "status-pending"],
      [(counts.invited || 0) + " eingeladen", "status-invited"],
      [(counts.declined || 0) + " abgesagt", "status-declined"],
    ].forEach(function (entry) {
      summary.appendChild(element("span", "chip " + entry[1], entry[0]));
    });

    var invited = counts.invited || 0;
    var target = 12;
    progressBar.style.width = Math.min(100, (invited / target) * 100) + "%";
    progressLabel.textContent =
      invited + " von " + target + " Testern eingeladen · " + target + " × 14 Tage für den Produktionszugang";

    var open = (counts.pending || 0) > 0;
    inviteOpenButton.hidden = !open;
  }

  function renderTable() {
    rows.replaceChildren();
    if (!testers || testers.length === 0) {
      var empty = document.createElement("tr");
      var cell = element("td", "muted", "Noch keine Anmeldungen.");
      cell.colSpan = 4;
      empty.appendChild(cell);
      rows.appendChild(empty);
      return;
    }

    testers.forEach(function (tester) {
      var tr = document.createElement("tr");
      tr.appendChild(element("td", "nowrap", shortDate(tester.created_at)));

      var emailCell = document.createElement("td");
      emailCell.className = "email-cell";
      emailCell.appendChild(element("span", "email-main", tester.google_email));
      if (tester.contact_email && tester.contact_email !== tester.google_email) {
        emailCell.appendChild(element("span", "email-sub", tester.contact_email));
      }
      tr.appendChild(emailCell);

      var statusCell = document.createElement("td");
      statusCell.className = "status-cell";
      statusCell.appendChild(
        element("span", statusClass(tester.status), statusLabel(tester.status)),
      );
      if (sentRecently[tester.id]) {
        statusCell.appendChild(element("span", "pill ok", "gesendet"));
      }
      tr.appendChild(statusCell);

      var actions = element("div", "row-actions compact");
      var invite = element("button", "small-button", "Einladen");
      invite.type = "button";
      invite.disabled = tester.status === "invited" || tester.status === "declined";
      invite.addEventListener("click", function () {
        callAction(tester.id, "invite", invite, actions, tester.google_email);
      });

      var decline = element("button", "small-button danger", "Absagen");
      decline.type = "button";
      decline.disabled = tester.status === "declined";
      decline.addEventListener("click", function () {
        callAction(tester.id, "decline", decline, actions, tester.google_email);
      });

      var problem = element("button", "small-button", "Link");
      problem.type = "button";
      problem.title = "Korrektur-Link an den Tester senden";
      problem.addEventListener("click", function () {
        callAction(tester.id, "problem", problem, actions, tester.google_email);
      });

      actions.appendChild(invite);
      actions.appendChild(decline);
      actions.appendChild(problem);
      var actionCell = document.createElement("td");
      actionCell.appendChild(actions);
      tr.appendChild(actionCell);
      rows.appendChild(tr);
    });
  }

  function renderPlay() {
    var emails = playEmails();
    var known = knownEmails();
    var knownList = Array.from(known);
    var emailSet = new Set(emails);
    var missing = emails.filter(function (email) {
      return !known.has(email);
    });
    var extra = knownList.filter(function (email) {
      return !emailSet.has(email);
    });

    if (known.size > 0) {
      playCount.textContent = emails.length + " Adressen · " + missing.length + " fehlen";
    } else {
      var fresh = newSinceCopy();
      playCount.textContent =
        emails.length + (fresh > 0 ? " · " + fresh + " neu" : "") + " Adressen";
    }

    if (playPreview) playPreview.value = emails.join(", ");
    if (playPreviewWrap) playPreviewWrap.hidden = emails.length === 0;
    if (copyPlayButton) copyPlayButton.disabled = emails.length === 0;
    if (csvButton) csvButton.disabled = (testers || []).length === 0;
    if (playMissingButton) playMissingButton.disabled = missing.length === 0;

    if (!playDiff) return;
    playDiff.replaceChildren();
    if (known.size === 0) {
      playDiff.appendChild(
        element(
          "p",
          "muted",
          "Play-Liste einfügen und abgleichen – dann siehst du genau, wer fehlt.",
        ),
      );
      return;
    }
    if (missing.length === 0) {
      playDiff.appendChild(element("p", "diff-ok", "Alle Tester stehen in der Play-Liste."));
    } else {
      playDiff.appendChild(element("p", "diff-title", "Fehlen in Play (" + missing.length + ")"));
      var missingList = element("div", "diff-list");
      missing.forEach(function (email) {
        missingList.appendChild(element("code", null, email));
      });
      playDiff.appendChild(missingList);
    }
    if (extra.length > 0) {
      playDiff.appendChild(element("p", "diff-title", "Nur in Play (" + extra.length + ")"));
      var extraList = element("div", "diff-list muted");
      extra.forEach(function (email) {
        extraList.appendChild(element("code", null, email));
      });
      playDiff.appendChild(extraList);
    }
  }

  function renderSettings() {
    if (!settings) return;
    autoInvite.checked = Boolean(settings.autoInvite);
    surveyUrl.value = settings.surveyUrl || "";
    surveyAt.value = settings.surveyAt ? toInputValue(settings.surveyAt) : "";

    if (settings.surveySentAt) {
      setText(autoHint, "Umfrage gesendet am " + longDate(settings.surveySentAt) + ".", false);
    } else if (settings.surveyAt) {
      setText(autoHint, "Umfrage geht automatisch am " + longDate(settings.surveyAt) + " raus.", false);
    } else {
      setText(autoHint, "", false);
    }

    autoInvite.disabled = false;
    settingsSave.disabled = false;
    surveyButton.disabled = false;
  }

  var sentRecently = {};

  async function callAction(id, action, button, container, email) {
    if (busy) return;
    var labels = { invite: "Einladung", decline: "Absage", problem: "Korrektur-Link" };
    var label = labels[action] || action;
    if (!window.confirm(label + " an " + email + " senden?")) return;

    busy = true;
    var previousLabel = button ? button.textContent : "";
    if (button) {
      button.textContent = "Sendet…";
      button.disabled = true;
    }
    if (container) container.classList.add("is-busy");

    try {
      var response = await fetch(API_BASE + "/testers/" + action, {
        method: "POST",
        headers: {
          authorization: "Bearer " + token(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: id }),
      });
      var body = await response.json().catch(function () { return {}; });

      if (response.ok) {
        sentRecently[id] = true;
        setStatus(label + " gesendet: " + email, false);
        toast(label + " gesendet: " + email, false);
        await load();
        return;
      }

      var message = label + " konnte nicht gesendet werden.";
      if (response.status === 401) message = "Der Admin-Token ist falsch.";
      else if (body.error === "already_invited") message = "Bereits eingeladen.";
      else if (body.error === "opt_in_not_configured") message = "Der Play-Opt-in-Link fehlt im Worker.";
      else if (body.error === "mail_not_configured") message = "Resend ist im Worker nicht eingerichtet.";
      setStatus(message, true);
      toast(message, true);
    } catch {
      setStatus("Keine Verbindung zum Worker.", true);
      toast("Keine Verbindung zum Worker.", true);
    } finally {
      busy = false;
      if (button) {
        button.textContent = previousLabel;
        button.disabled = false;
      }
      if (container) container.classList.remove("is-busy");
    }
  }

  async function inviteAllOpen() {
    if (!testers || busy) return;
    var open = testers.filter(function (tester) {
      return tester.status === "pending";
    });
    if (open.length === 0) return;
    if (!window.confirm(open.length + " offene Tester jetzt einladen?")) return;

    busy = true;
    inviteOpenButton.disabled = true;
    var sent = 0;
    var failed = 0;
    for (var i = 0; i < open.length; i++) {
      try {
        var response = await fetch(API_BASE + "/testers/invite", {
          method: "POST",
          headers: {
            authorization: "Bearer " + token(),
            "content-type": "application/json",
          },
          body: JSON.stringify({ id: open[i].id }),
        });
        if (response.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    inviteOpenButton.disabled = false;
    busy = false;
    setStatus(sent + " eingeladen." + (failed ? " " + failed + " fehlgeschlagen." : ""), failed > 0);
    await load();
  }

  async function saveSettings(extra) {
    var payload = extra || {};
    if (!extra) {
      payload = {
        surveyUrl: surveyUrl.value.trim(),
        surveyAt: surveyAt.value ? new Date(parseInputValue(surveyAt.value)).toISOString() : 0,
      };
    }

    try {
      var response = await fetch(API_BASE + "/admin/settings", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token(),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.ok) {
        settings = body;
        if (extra) {
          // Toggling auto-invite must not overwrite unsaved survey fields.
          autoInvite.checked = Boolean(body.autoInvite);
        } else {
          renderSettings();
          setText(autoHint, "Einstellungen gespeichert.", false);
        }
        return true;
      }
      if (response.status === 401) {
        setText(autoHint, "Der Admin-Token ist falsch.", true);
      } else if (body.error === "invalid_form_url") {
        setText(autoHint, "Der Link ist keine gültige Google-Forms-URL.", true);
      } else {
        setText(autoHint, "Einstellungen konnten nicht gespeichert werden.", true);
      }
    } catch {
      setText(autoHint, "Keine Verbindung zum Worker.", true);
    }
    return false;
  }

  async function sendSurveyNow() {
    var formUrl = surveyUrl.value.trim();
    if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/i.test(formUrl)) {
      setText(autoHint, "Bitte einen gültigen Google-Forms-Link einfügen.", true);
      return;
    }
    var recipients = (testers || []).filter(function (tester) {
      return tester.status !== "declined";
    });
    if (recipients.length === 0) {
      setText(autoHint, "Keine Tester für die Umfrage.", true);
      return;
    }
    if (!window.confirm("Umfrage an " + recipients.length + " Tester senden?")) return;

    surveyButton.disabled = true;
    try {
      var response = await fetch(API_BASE + "/testers/survey", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ formUrl: formUrl }),
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.ok) {
        setText(
          autoHint,
          body.sent + " Mails gesendet." + (body.failed ? " " + body.failed + " fehlgeschlagen." : ""),
          body.failed > 0,
        );
      } else if (body.error === "invalid_form_url") {
        setText(autoHint, "Der Link ist keine gültige Google-Forms-URL.", true);
      } else {
        setText(autoHint, "Umfrage konnte nicht gesendet werden.", true);
      }
    } catch {
      setText(autoHint, "Keine Verbindung zum Worker.", true);
    } finally {
      surveyButton.disabled = false;
    }
  }

  async function copyPlayList() {
    var text = playPreview ? playPreview.value.trim() : "";
    if (!text) {
      setText(playStatus, "Keine Adressen vorhanden.", true);
      return;
    }
    var emails = playEmails();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (playPreview) {
        playPreview.select();
        document.execCommand("copy");
      }
      localStorage.setItem(PLAY_KEY, JSON.stringify(emails));
      renderPlay();
      setText(
        playStatus,
        emails.length + " Adressen kopiert. In der Play Console einfügen und speichern.",
        false,
      );
    } catch {
      if (playPreview) playPreview.select();
      setText(playStatus, "Kopieren blockiert – Text ist markiert, bitte Strg+C.", true);
    }
  }

  function csvCell(value) {
    var text = value == null ? "" : String(value);
    if (/[";\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadCsv() {
    if (!testers || testers.length === 0) return;
    var lines = [["Datum", "Google", "Kontakt", "Status", "Eingeladen am"].join(";")];
    testers.forEach(function (tester) {
      lines.push(
        [
          csvCell(longDate(tester.created_at)),
          csvCell(tester.google_email),
          csvCell(tester.contact_email || ""),
          csvCell(statusLabel(tester.status)),
          csvCell(tester.invited_at ? longDate(tester.invited_at) : ""),
        ].join(";"),
      );
    });

    var blob = new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "yuban-tester-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
    setText(playStatus, testers.length + " Zeilen als CSV gespeichert.", false);
  }

  function currentTemplate() {
    if (!mailKey) return null;
    return (
      mailTemplates.filter(function (template) {
        return template.key === mailKey.value;
      })[0] || null
    );
  }

  function placeholderList(names) {
    return names
      .map(function (name) {
        return "{{" + name + "}}";
      })
      .join(", ");
  }

  function showTemplate() {
    var template = currentTemplate();
    if (!template) return;
    mailSubject.value = template.subject;
    mailBody.value = template.body;
    mailHint.textContent = template.placeholders.length
      ? "Pflicht-Platzhalter: " + placeholderList(template.placeholders)
      : "Diese Vorlage braucht keine Platzhalter.";
    mailReset.disabled = !template.custom;
    setText(mailStatus, template.custom ? "Eigene Fassung gespeichert." : "Standardtext aktiv.", false);
  }

  async function loadMailTemplates(selectKey) {
    try {
      var response = await fetch(API_BASE + "/admin/mails", {
        headers: { authorization: "Bearer " + token() },
      });
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        setText(
          mailStatus,
          response.status === 401
            ? "Der Admin-Token ist falsch."
            : "Die E-Mail-Vorlagen konnten nicht geladen werden.",
          true,
        );
        return;
      }

      mailTemplates = body.templates || [];
      mailKey.replaceChildren();
      mailTemplates.forEach(function (template) {
        var option = document.createElement("option");
        option.value = template.key;
        option.textContent = template.label + (template.custom ? " · eigene Fassung" : "");
        mailKey.appendChild(option);
      });
      if (selectKey) mailKey.value = selectKey;
      else if (!mailKey.value && mailTemplates.length > 0) mailKey.value = mailTemplates[0].key;

      mailKey.disabled = false;
      mailSubject.disabled = false;
      mailBody.disabled = false;
      mailSave.disabled = false;
      showTemplate();
    } catch {
      setText(mailStatus, "Keine Verbindung zum Worker.", true);
    }
  }

  async function postTemplate(payload, successMessage) {
    mailSave.disabled = true;
    setText(mailStatus, "Wird gespeichert …", false);
    try {
      var response = await fetch(API_BASE + "/admin/mails", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token(),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.ok) {
        await loadMailTemplates(payload.key);
        setText(mailStatus, successMessage, false);
      } else if (body.error === "missing_placeholder") {
        setText(mailStatus, "Es fehlen Platzhalter: " + placeholderList(body.missing || []), true);
      } else {
        setText(mailStatus, "Die Vorlage konnte nicht gespeichert werden.", true);
      }
    } catch {
      setText(mailStatus, "Keine Verbindung zum Worker.", true);
    } finally {
      mailSave.disabled = false;
    }
  }

  function saveTemplate() {
    var template = currentTemplate();
    if (!template) return;
    var subject = mailSubject.value.trim();
    var bodyText = mailBody.value.trim();
    if (!subject || !bodyText) {
      setText(mailStatus, "Betreff und Text dürfen nicht leer sein.", true);
      return;
    }
    var missing = template.placeholders.filter(function (name) {
      return bodyText.indexOf("{{" + name + "}}") === -1;
    });
    if (missing.length > 0) {
      setText(mailStatus, "Es fehlen Platzhalter: " + placeholderList(missing), true);
      return;
    }
    postTemplate(
      { key: template.key, subject: subject, body: bodyText },
      "Vorlage gespeichert. Sie gilt ab der nächsten Mail.",
    );
  }

  function resetTemplate() {
    var template = currentTemplate();
    if (!template) return;
    if (!window.confirm("Standardtext für „" + template.label + "“ wiederherstellen?")) return;
    postTemplate({ key: template.key, reset: true }, "Standardtext wiederhergestellt.");
  }

  async function load() {
    if (!token()) {
      setStatus("Bitte den Admin-Token eingeben.", true);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token());
    setStatus("Wird geladen …", false);

    try {
      var responses = await Promise.all([
        fetch(API_BASE + "/testers", { headers: { authorization: "Bearer " + token() } }),
        fetch(API_BASE + "/admin/settings", { headers: { authorization: "Bearer " + token() } }),
      ]);
      var testersResponse = responses[0];
      var settingsResponse = responses[1];
      var testersBody = await testersResponse.json().catch(function () { return {}; });
      var settingsBody = await settingsResponse.json().catch(function () { return {}; });

      if (testersResponse.status === 401 || settingsResponse.status === 401) {
        setStatus("Der Admin-Token ist falsch.", true);
        overview.hidden = true;
        return;
      }
      if (!testersResponse.ok) {
        setStatus("Die Übersicht konnte nicht geladen werden.", true);
        overview.hidden = true;
        return;
      }

      testers = testersBody.testers || [];
      settings = settingsBody;
      overview.hidden = false;
      setStatus("", false);
      renderSummary();
      renderTable();
      renderPlay();
      if (playPaste && !playPaste.value) {
        playPaste.value = Array.from(knownEmails()).join(", ");
      }
      renderSettings();
      await loadMailTemplates();
    } catch {
      setStatus("Keine Verbindung zum Worker.", true);
    }
  }

  function reset() {
    sessionStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    testers = null;
    settings = null;
    mailTemplates = [];
    overview.hidden = true;
    rows.replaceChildren();
    summary.replaceChildren();
    progressBar.style.width = "0%";
    progressLabel.textContent = "";
    if (surveyUrl) surveyUrl.value = "";
    if (surveyAt) surveyAt.value = "";
    if (autoInvite) autoInvite.checked = false;
    if (playPreview) playPreview.value = "";
    if (playPreviewWrap) playPreviewWrap.hidden = true;
    setText(playStatus, "", false);
    setText(autoHint, "", false);
    setText(mailStatus, "", false);
    if (mailKey) {
      mailKey.replaceChildren();
      mailKey.disabled = true;
    }
    if (mailSubject) {
      mailSubject.value = "";
      mailSubject.disabled = true;
    }
    if (mailBody) {
      mailBody.value = "";
      mailBody.disabled = true;
    }
    if (mailHint) mailHint.textContent = "";
    if (mailSave) mailSave.disabled = true;
    if (mailReset) mailReset.disabled = true;
    setStatus("Abgemeldet.", false);
  }

  loadButton.addEventListener("click", load);
  tokenInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") load();
  });
  clearButton.addEventListener("click", reset);

  autoInvite.addEventListener("change", function () {
    saveSettings({ autoInvite: autoInvite.checked });
  });
  settingsSave.addEventListener("click", function () {
    saveSettings();
  });
  surveyButton.addEventListener("click", sendSurveyNow);
  inviteOpenButton.addEventListener("click", inviteAllOpen);
  copyPlayButton.addEventListener("click", copyPlayList);
  csvButton.addEventListener("click", downloadCsv);
  if (playCompareButton) playCompareButton.addEventListener("click", comparePlayList);
  if (playMissingButton) playMissingButton.addEventListener("click", downloadMissing);
  if (mailKey) mailKey.addEventListener("change", showTemplate);
  if (mailSave) mailSave.addEventListener("click", saveTemplate);
  if (mailReset) mailReset.addEventListener("click", resetTemplate);

  if (saved) load();
})();
