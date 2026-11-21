/*
 * Minimal admin overview for the closed test. The token is entered by the owner and kept
 * in sessionStorage; it is never part of the public page.
 */
(function () {
  "use strict";

  var API_BASE = "https://yuban-api.binfloo.workers.dev";
  var TOKEN_KEY = "yuban_admin_token";
  var tokenInput = document.getElementById("admin-token");
  var loadButton = document.getElementById("load-button");
  var clearButton = document.getElementById("clear-button");
  var status = document.getElementById("admin-status");
  var summary = document.getElementById("summary");
  var tableWrap = document.getElementById("table-wrap");
  var rows = document.getElementById("tester-rows");
  var surveyUrl = document.getElementById("survey-url");
  var surveyButton = document.getElementById("survey-button");
  var surveyStatus = document.getElementById("survey-status");
  var copyPlayButton = document.getElementById("copy-play-button");
  var markPlayButton = document.getElementById("mark-play-button");
  var csvButton = document.getElementById("csv-button");
  var playStatus = document.getElementById("play-status");
  var playPreview = document.getElementById("play-preview");
  var playPreviewWrap = document.getElementById("play-preview-wrap");
  var lastTesters = null;
  if (!tokenInput || !rows) return;

  var saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) tokenInput.value = saved;

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function setSurveyStatus(message, isError) {
    if (!surveyStatus) return;
    surveyStatus.textContent = message;
    surveyStatus.classList.toggle("error", Boolean(isError));
  }

  function setPlayStatus(message, isError) {
    if (!playStatus) return;
    playStatus.textContent = message;
    playStatus.classList.toggle("error", Boolean(isError));
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

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  async function callAction(id, action) {
    var label = action === "invite" ? "Einladen" : "Absagen";
    if (!window.confirm(label + " wirklich senden?")) return;

    try {
      var response = await fetch(API_BASE + "/testers/" + action, {
        method: "POST",
        headers: {
          authorization: "Bearer " + tokenInput.value.trim(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: id }),
      });
      var body = await response.json().catch(function () { return {}; });

      if (response.ok) {
        setStatus(label + " gesendet.", false);
        await load();
        return;
      }
      if (body.error === "opt_in_not_configured") {
        setStatus("Der Play-Opt-in-Link ist im Worker noch nicht hinterlegt.", true);
      } else if (body.error === "mail_not_configured") {
        setStatus("Resend ist im Worker noch nicht eingerichtet.", true);
      } else if (body.error === "already_invited") {
        setStatus("Diese Person wurde bereits eingeladen.", true);
      } else if (response.status === 401) {
        setStatus("Der Admin-Token ist falsch.", true);
      } else {
        setStatus(label + " konnte nicht gesendet werden.", true);
      }
    } catch {
      setStatus("Keine Verbindung zum Worker.", true);
    }
  }

  async function sendSurvey() {
    var token = tokenInput.value.trim();
    if (!token) {
      setSurveyStatus("Bitte den Admin-Token eingeben.", true);
      return;
    }
    if (!lastTesters) {
      setSurveyStatus("Bitte zuerst die Übersicht laden.", true);
      return;
    }

    var recipients = lastTesters.filter(function (tester) {
      return tester.status !== "declined";
    });
    if (recipients.length === 0) {
      setSurveyStatus("Keine offenen oder eingeladenen Tester.", true);
      return;
    }

    var formUrl = surveyUrl ? surveyUrl.value.trim() : "";
    if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/i.test(formUrl)) {
      setSurveyStatus(
        "Bitte einen gültigen Google-Forms-Link einfügen (forms.gle oder docs.google.com/forms).",
        true,
      );
      return;
    }
    if (!window.confirm("Umfrage an " + recipients.length + " Tester senden?")) return;

    surveyButton.disabled = true;
    setSurveyStatus("Wird gesendet …", false);

    try {
      var response = await fetch(API_BASE + "/testers/survey", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ formUrl: formUrl }),
      });
      var body = await response.json().catch(function () { return {}; });

      if (response.ok) {
        var message = body.sent + " Mails gesendet.";
        if (body.failed) message += " " + body.failed + " fehlgeschlagen.";
        setSurveyStatus(message, body.failed > 0);
      } else if (response.status === 401) {
        setSurveyStatus("Der Admin-Token ist falsch.", true);
      } else if (body.error === "mail_not_configured") {
        setSurveyStatus("Resend ist im Worker noch nicht eingerichtet.", true);
      } else if (body.error === "invalid_form_url") {
        setSurveyStatus("Der Link ist keine gültige Google-Forms-URL.", true);
      } else if (body.error === "too_many_recipients") {
        setSurveyStatus("Zu viele Empfänger (max. " + body.limit + ").", true);
      } else {
        setSurveyStatus("Die Umfrage konnte nicht gesendet werden.", true);
      }
    } catch {
      setSurveyStatus("Keine Verbindung zum Worker.", true);
    } finally {
      surveyButton.disabled = false;
    }
  }

  function playPendingEmails(testers) {
    return testers
      .filter(function (tester) {
        return tester.status !== "declined" && !tester.play_added_at;
      })
      .map(function (tester) {
        return tester.google_email;
      });
  }

  function renderPlayList() {
    var testers = lastTesters || [];
    var emails = playPendingEmails(testers);
    if (playPreview) playPreview.value = emails.join(", ");
    if (playPreviewWrap) playPreviewWrap.hidden = emails.length === 0;
    if (copyPlayButton) copyPlayButton.disabled = emails.length === 0;
    if (markPlayButton) markPlayButton.disabled = emails.length === 0;
    if (csvButton) csvButton.disabled = testers.length === 0;
  }

  async function copyPlayList() {
    var text = playPreview ? playPreview.value.trim() : "";
    if (!text) {
      setPlayStatus("Keine neuen Adressen – alle Tester stehen schon in Play.", true);
      return;
    }
    var count = text.split(",").length;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (playPreview) {
        playPreview.select();
        document.execCommand("copy");
      }
      setPlayStatus(
        count +
          " Adressen kopiert. In der Play Console einfügen, speichern und danach " +
          "„Als in Play eingetragen markieren“ klicken.",
        false,
      );
    } catch {
      if (playPreview) playPreview.select();
      setPlayStatus("Kopieren wurde blockiert. Der Text ist markiert – bitte mit Strg+C kopieren.", true);
    }
  }

  async function setPlayAdded(ids, added) {
    var token = tokenInput.value.trim();
    if (!token) {
      setPlayStatus("Bitte den Admin-Token eingeben.", true);
      return;
    }
    if (!ids || ids.length === 0) return;

    var question = added
      ? ids.length + " Tester als in Play eingetragen markieren?"
      : "Eintrag „in Play“ für diesen Tester zurücksetzen?";
    if (!window.confirm(question)) return;

    try {
      var response = await fetch(API_BASE + "/testers/play-list", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ids: ids, added: added }),
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.ok) {
        await load();
        setPlayStatus(
          added ? ids.length + " als in Play eingetragen markiert." : "Eintrag zurückgesetzt.",
          false,
        );
      } else if (response.status === 401) {
        setPlayStatus("Der Admin-Token ist falsch.", true);
      } else {
        setPlayStatus("Der Play-Status konnte nicht gespeichert werden.", true);
      }
    } catch {
      setPlayStatus("Keine Verbindung zum Worker.", true);
    }
  }

  function markPlayList() {
    var testers = lastTesters || [];
    var ids = testers
      .filter(function (tester) {
        return tester.status !== "declined" && !tester.play_added_at;
      })
      .map(function (tester) {
        return tester.id;
      });
    setPlayAdded(ids, true);
  }

  function csvCell(value) {
    var text = value == null ? "" : String(value);
    if (/[";\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadCsv() {
    if (!lastTesters || lastTesters.length === 0) return;
    var lines = [["Datum", "Google", "Kontakt", "Status", "In Play", "Eingeladen am"].join(";")];
    lastTesters.forEach(function (tester) {
      lines.push(
        [
          csvCell(formatDate(tester.created_at)),
          csvCell(tester.google_email),
          csvCell(tester.contact_email || ""),
          csvCell(statusLabel(tester.status)),
          csvCell(tester.play_added_at ? "eingetragen" : "neu"),
          csvCell(tester.invited_at ? formatDate(tester.invited_at) : ""),
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
    setPlayStatus(lastTesters.length + " Zeilen als CSV heruntergeladen.", false);
  }

  function render(testers) {
    lastTesters = testers;
    rows.replaceChildren();
    var counts = { pending: 0, invited: 0, declined: 0 };
    var inPlay = 0;

    testers.forEach(function (tester) {
      counts[tester.status] = (counts[tester.status] || 0) + 1;
      if (tester.play_added_at) inPlay++;
      var tr = document.createElement("tr");

      tr.appendChild(element("td", null, formatDate(tester.created_at)));
      tr.appendChild(element("td", null, tester.google_email));
      tr.appendChild(element("td", null, tester.contact_email || "—"));
      var statusCell = document.createElement("td");
      statusCell.appendChild(
        element("span", statusClass(tester.status), statusLabel(tester.status)),
      );
      tr.appendChild(statusCell);
      var playCell = document.createElement("td");
      playCell.appendChild(
        element(
          "span",
          tester.play_added_at ? "status status-play" : "status status-new",
          tester.play_added_at ? "eingetragen" : "neu",
        ),
      );
      tr.appendChild(playCell);

      var actions = element("div", "row-actions");
      var invite = element("button", "small-button", "Einladen");
      invite.type = "button";
      invite.disabled = tester.status === "invited";
      invite.addEventListener("click", function () {
        callAction(tester.id, "invite");
      });

      var decline = element("button", "small-button danger", "Absagen");
      decline.type = "button";
      decline.disabled = tester.status === "declined";
      decline.addEventListener("click", function () {
        callAction(tester.id, "decline");
      });

      var playToggle = element(
        "button",
        "small-button",
        tester.play_added_at ? "Play zurücksetzen" : "In Play eintragen",
      );
      playToggle.type = "button";
      playToggle.addEventListener("click", function () {
        setPlayAdded([tester.id], !tester.play_added_at);
      });

      actions.appendChild(invite);
      actions.appendChild(decline);
      actions.appendChild(playToggle);
      var actionCell = document.createElement("td");
      actionCell.appendChild(actions);
      tr.appendChild(actionCell);
      rows.appendChild(tr);
    });

    summary.textContent =
      testers.length +
      " Anmeldungen · " +
      (counts.pending || 0) +
      " offen · " +
      (counts.invited || 0) +
      " eingeladen · " +
      (counts.declined || 0) +
      " abgesagt · " +
      inPlay +
      " in Play";
    tableWrap.hidden = testers.length === 0;
    if (testers.length === 0) {
      setStatus("Noch keine Anmeldungen.", false);
    }
    renderPlayList();
  }

  async function load() {
    var token = tokenInput.value.trim();
    if (!token) {
      setStatus("Bitte den Admin-Token eingeben.", true);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);
    setStatus("Wird geladen …", false);

    try {
      var response = await fetch(API_BASE + "/testers", {
        headers: { authorization: "Bearer " + token },
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.status === 401) {
        setStatus("Der Admin-Token ist falsch.", true);
        tableWrap.hidden = true;
        lastTesters = null;
        renderPlayList();
        return;
      }
      if (response.status === 503) {
        setStatus("Der Admin-Bereich ist im Worker noch nicht eingerichtet.", true);
        lastTesters = null;
        renderPlayList();
        return;
      }
      if (!response.ok) {
        setStatus("Die Übersicht konnte nicht geladen werden.", true);
        lastTesters = null;
        renderPlayList();
        return;
      }
      setStatus("", false);
      render(body.testers || []);
    } catch {
      setStatus("Keine Verbindung zum Worker.", true);
    }
  }

  loadButton.addEventListener("click", load);
  if (surveyButton) surveyButton.addEventListener("click", sendSurvey);
  if (copyPlayButton) copyPlayButton.addEventListener("click", copyPlayList);
  if (markPlayButton) markPlayButton.addEventListener("click", markPlayList);
  if (csvButton) csvButton.addEventListener("click", downloadCsv);
  tokenInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") load();
  });
  clearButton.addEventListener("click", function () {
    sessionStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    rows.replaceChildren();
    summary.textContent = "";
    tableWrap.hidden = true;
    lastTesters = null;
    if (surveyUrl) surveyUrl.value = "";
    setSurveyStatus("", false);
    if (playPreview) playPreview.value = "";
    if (playPreviewWrap) playPreviewWrap.hidden = true;
    if (copyPlayButton) copyPlayButton.disabled = true;
    if (markPlayButton) markPlayButton.disabled = true;
    if (csvButton) csvButton.disabled = true;
    setPlayStatus("", false);
    setStatus("Abgemeldet.", false);
  });

  if (saved) load();
})();
