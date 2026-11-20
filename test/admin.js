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
  if (!tokenInput || !rows) return;

  var saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) tokenInput.value = saved;

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
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

  function render(testers) {
    rows.replaceChildren();
    var counts = { pending: 0, invited: 0, declined: 0 };

    testers.forEach(function (tester) {
      counts[tester.status] = (counts[tester.status] || 0) + 1;
      var tr = document.createElement("tr");

      tr.appendChild(element("td", null, formatDate(tester.created_at)));
      tr.appendChild(element("td", null, tester.google_email));
      tr.appendChild(element("td", null, tester.contact_email || "—"));
      var statusCell = document.createElement("td");
      statusCell.appendChild(
        element("span", statusClass(tester.status), statusLabel(tester.status)),
      );
      tr.appendChild(statusCell);

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

      actions.appendChild(invite);
      actions.appendChild(decline);
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
      " abgesagt";
    tableWrap.hidden = testers.length === 0;
    if (testers.length === 0) {
      setStatus("Noch keine Anmeldungen.", false);
    }
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
        return;
      }
      if (response.status === 503) {
        setStatus("Der Admin-Bereich ist im Worker noch nicht eingerichtet.", true);
        return;
      }
      if (!response.ok) {
        setStatus("Die Übersicht konnte nicht geladen werden.", true);
        return;
      }
      setStatus("", false);
      render(body.testers || []);
    } catch {
      setStatus("Keine Verbindung zum Worker.", true);
    }
  }

  loadButton.addEventListener("click", load);
  tokenInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") load();
  });
  clearButton.addEventListener("click", function () {
    sessionStorage.removeItem(TOKEN_KEY);
    tokenInput.value = "";
    rows.replaceChildren();
    summary.textContent = "";
    tableWrap.hidden = true;
    setStatus("Abgemeldet.", false);
  });

  if (saved) load();
})();
