/*
 * Public tester signup. The form posts to the Yuban worker; the worker verifies
 * Turnstile, stores the address and sends the confirmation mail.
 */
(function () {
  "use strict";

  var API_BASE = "https://yuban-api.binfloo.workers.dev";
  var EN = document.documentElement.lang === "en";
  function t(de, en) { return EN ? en : de; }
  var REQUEST_TIMEOUT_MS = 20000;

  var params = new URLSearchParams(window.location.search);
  var fixId = params.get("fix");
  var fixToken = params.get("t");
  var fixCard = document.getElementById("fix-card");

  if (fixId && fixToken && fixCard) {
    initFix(fixId, fixToken);
    return;
  }

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
      setStatus(t("Bitte bestätige zuerst die Einwilligung.", "Please confirm the consent first."), true);
      return;
    }
    if (!isEmail(email)) {
      setStatus(t("Bitte gib eine gültige Google-E-Mail-Adresse ein.", "Please enter a valid Google email address."), true);
      googleEmail.focus();
      return;
    }
    if (contact && !isEmail(contact)) {
      setStatus(t("Bitte gib eine gültige Kontaktadresse ein oder lass das Feld leer.", "Please enter a valid contact address or leave the field empty."), true);
      contactEmail.focus();
      return;
    }
    if (!token) {
      setStatus(t("Bitte schließe zuerst die CAPTCHA-Bestätigung ab.", "Please complete the CAPTCHA first."), true);
      return;
    }

    submit.disabled = true;
    setStatus(t("Wird gesendet …", "Sending …"), false);

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
            successWarning.textContent = t(
              "Die Anmeldung ist gespeichert. Die Bestätigungsmail konnte noch nicht " +
              "versendet werden — ich melde mich manuell.",
              "Your signup is saved. The confirmation email could not be sent yet — I will contact you manually.",
            );
          }
          successCard.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }

        submit.disabled = false;
        resetCaptcha();

        if (result.status === 409) {
          setStatus(t("Diese Google-E-Mail-Adresse ist bereits angemeldet.", "This Google email address is already registered."), true);
        } else if (result.status === 400) {
          setStatus(t("Bitte prüfe die Eingaben und versuche es erneut.", "Please check your input and try again."), true);
        } else if (result.status === 403) {
          setStatus(t("Die CAPTCHA-Prüfung ist abgelaufen. Bitte bestätige sie erneut.", "The CAPTCHA check expired. Please confirm it again."), true);
        } else if (result.status === 503) {
          setStatus(
            t(
              "Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut.",
              "Signup is not possible right now. Please try again later.",
            ),
            true,
          );
        } else {
          setStatus(t("Die Anmeldung konnte nicht gesendet werden. Bitte später erneut.", "The signup could not be sent. Please try again later."), true);
        }
      })
      .catch(function (error) {
        clearTimeout(timer);
        submit.disabled = false;
        resetCaptcha();
        if (error && error.name === "AbortError") {
          setStatus(
            t(
              "Die Verbindung dauert zu lange. Bitte prüfe dein VPN/Netz und versuche es erneut.",
              "The connection is taking too long. Check your VPN/network and try again.",
            ),
            true,
          );
        } else {
          setStatus(t("Keine Verbindung. Bitte prüfe dein Netz und versuche es erneut.", "No connection. Check your network and try again."), true);
        }
      });
  });
  function initFix(id, token) {
    document.getElementById("form-card").hidden = true;
    fixCard.hidden = false;

    var fixForm = document.getElementById("fix-form");
    var google = document.getElementById("fix-google");
    var contact = document.getElementById("fix-contact");
    var submit = document.getElementById("fix-submit");
    var note = document.getElementById("fix-status");

    function setFixStatus(message, isError) {
      note.textContent = message;
      note.classList.toggle("error", Boolean(isError));
    }

    fixForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = google.value.trim();
      var contactValue = contact.value.trim();
      if (!isEmail(email)) {
        setFixStatus(t("Bitte gib eine gültige Google-E-Mail-Adresse ein.", "Please enter a valid Google email address."), true);
        google.focus();
        return;
      }
      if (contactValue && !isEmail(contactValue)) {
        setFixStatus(t("Bitte prüfe die Kontaktadresse.", "Please check the contact address."), true);
        contact.focus();
        return;
      }

      submit.disabled = true;
      setFixStatus(t("Wird gespeichert …", "Saving …"), false);

      fetch(API_BASE + "/tester-fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: id,
          t: token,
          googleEmail: email,
          contactEmail: contactValue,
        }),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { status: response.status, body: body };
          });
        })
        .then(function (result) {
          if (result.status === 200) {
            fixCard.replaceChildren();
            var title = document.createElement("h1");
            title.textContent = t("Adresse gespeichert.", "Address saved.");
            var text = document.createElement("p");
            text.textContent =
              result.body && result.body.autoInvited
                ? t(
                    "Die Einladung mit dem Opt-in-Link ist unterwegs. Öffne sie auf deinem Android-Gerät mit genau dieser Adresse.",
                    "The invitation with the opt-in link is on its way. Open it on your Android device with exactly this address.",
                  )
                : t(
                    "Die Adresse ist gespeichert. Du bekommst die Einladung, sobald der nächste Platz vergeben wird.",
                    "The address is saved. You will get the invitation as soon as the next slot is assigned.",
                  );
            fixCard.appendChild(title);
            fixCard.appendChild(text);
            return;
          }
          submit.disabled = false;
          if (result.status === 403) {
            setFixStatus(
              t(
                "Dieser Link ist ungültig oder abgelaufen. Bitte antworte auf die letzte E-Mail.",
                "This link is invalid or expired. Please reply to the last email.",
              ),
              true,
            );
          } else if (result.status === 409) {
            setFixStatus(t("Diese Adresse ist bereits für den Test angemeldet.", "This address is already registered for the test."), true);
          } else {
            setFixStatus(t("Das hat nicht geklappt. Bitte versuche es später erneut.", "That did not work. Please try again later."), true);
          }
        })
        .catch(function () {
          submit.disabled = false;
          setFixStatus("Keine Verbindung. Bitte prüfe dein Netz und versuche es erneut.", true);
        });
    });
  }
})();
