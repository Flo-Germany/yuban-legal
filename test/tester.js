/*
 * Public tester signup. The form posts to the Yuban worker; the worker verifies
 * Turnstile, stores the address and sends the confirmation mail.
 */
(function () {
  "use strict";

  var API_BASE = "https://yuban-api.binfloo.workers.dev";
  var REQUEST_TIMEOUT_MS = 20000;
  var form = document.getElementById("tester-form");
  if (!form) return;

  var consent = document.getElementById("consent");
  var googleEmail = document.getElementById("google-email");
  var contactEmail = document.getElementById("contact-email");
  var submit = document.getElementById("submit-button");
  var status = document.getElementById("form-status");
  var successCard = document.getElementById("success-card");
  var successWarning = document.getElementById("success-warning");

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function captchaToken() {
    return window.__testerCaptchaToken || "";
  }

  function resetCaptcha() {
    window.__testerCaptchaToken = "";
    if (window.turnstile) window.turnstile.reset();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var email = googleEmail.value.trim();
    var contact = contactEmail.value.trim();
    var token = captchaToken();

    if (!consent.checked) {
      setStatus("Bitte bestätige zuerst die Einwilligung.", true);
      return;
    }
    if (!isEmail(email)) {
      setStatus("Bitte gib eine gültige Google-E-Mail-Adresse ein.", true);
      googleEmail.focus();
      return;
    }
    if (contact && !isEmail(contact)) {
      setStatus("Bitte gib eine gültige Kontaktadresse ein oder lass das Feld leer.", true);
      contactEmail.focus();
      return;
    }
    if (!token) {
      setStatus("Bitte schließe zuerst die CAPTCHA-Bestätigung ab.", true);
      return;
    }

    submit.disabled = true;
    setStatus("Wird gesendet …", false);

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    fetch(API_BASE + "/tester-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        googleEmail: email,
        contactEmail: contact,
        consent: true,
        token: token,
        source: "web",
      }),
      signal: controller.signal,
    })
      .then(function (response) {
        clearTimeout(timer);
        return response.json().then(function (body) {
          return { status: response.status, body: body };
        });
      })
      .then(function (result) {
        if (result.status === 201) {
          document.getElementById("form-card").hidden = true;
          successCard.hidden = false;
          if (result.body && result.body.mailSent === false) {
            successWarning.hidden = false;
            successWarning.textContent =
              "Die Anmeldung ist gespeichert. Die Bestätigungsmail konnte noch nicht " +
              "versendet werden — ich melde mich manuell.";
          }
          successCard.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        submit.disabled = false;
        resetCaptcha();

        if (result.status === 409) {
          setStatus("Diese Google-E-Mail-Adresse ist bereits angemeldet.", true);
        } else if (result.status === 400) {
          setStatus("Bitte prüfe die Eingaben und versuche es erneut.", true);
        } else if (result.status === 403) {
          setStatus("Die CAPTCHA-Prüfung ist abgelaufen. Bitte bestätige sie erneut.", true);
        } else if (result.status === 503) {
          setStatus(
            "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut.",
            true,
          );
        } else {
          setStatus("Die Anmeldung konnte nicht gesendet werden. Bitte später erneut.", true);
        }
      })
      .catch(function (error) {
        clearTimeout(timer);
        submit.disabled = false;
        resetCaptcha();
        if (error && error.name === "AbortError") {
          setStatus(
            "Die Verbindung dauert zu lange. Bitte prüfe dein VPN/Netz und versuche es erneut.",
            true,
          );
        } else {
          setStatus("Keine Verbindung. Bitte prüfe dein Netz und versuche es erneut.", true);
        }
      });
  });
})();
