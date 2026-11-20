/*
 * Contact gate for the static legal site.
 *
 * The address is not part of this repository. Cloudflare Turnstile verifies the visitor,
 * then the Yuban worker returns the address from a server-side secret.
 */
(function () {
  "use strict";

  var API_BASE = "https://yuban-api.binfloo.workers.dev";
  var gate = document.querySelector("[data-email-gate]");
  if (!gate) return;

  var result = gate.querySelector("[data-email-result]");
  var error = gate.querySelector("[data-email-error]");

  function showError(message) {
    if (!error) return;
    error.hidden = false;
    error.textContent = message;
  }

  function clearError() {
    if (!error) return;
    error.hidden = true;
    error.textContent = "";
  }

  function showEmail(address) {
    if (!result) return;
    result.hidden = false;
    result.replaceChildren();

    var ready = document.createElement("p");
    ready.className = "email-gate__ready";
    ready.textContent = "E-Mail-Adresse freigeschaltet:";

    var actions = document.createElement("div");
    actions.className = "email-gate__actions";

    var link = document.createElement("a");
    link.className = "email-gate__mail";
    link.href = "mailto:" + address;
    link.textContent = address;

    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "email-gate__copy";
    copy.textContent = "Kopieren";
    copy.addEventListener("click", function () {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        copy.textContent = "Bitte manuell kopieren";
        return;
      }
      navigator.clipboard.writeText(address).then(
        function () {
          copy.textContent = "Kopiert";
        },
        function () {
          copy.textContent = "Bitte manuell kopieren";
        }
      );
    });

    actions.appendChild(link);
    actions.appendChild(copy);
    result.appendChild(ready);
    result.appendChild(actions);
    link.focus();
  }

  window.onYubanCaptcha = function (token) {
    clearError();
    fetch(API_BASE + "/contact-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: token }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || typeof data.email !== "string" || !data.email) {
          throw new Error("missing email");
        }
        showEmail(data.email);
      })
      .catch(function () {
        showError("Bestätigung fehlgeschlagen. Bitte versuchen Sie es erneut.");
        if (window.turnstile) window.turnstile.reset();
      });
  };
})();
