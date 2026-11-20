/*
 * Email gate for the static legal pages.
 *
 * The address is never part of the HTML. It is stored as XOR-encoded bytes and only
 * assembled after the visitor answers a small human challenge. This is a deterrent for
 * naive scrapers; a determined bot can still read this file, so it is not a substitute
 * for a server-verified CAPTCHA.
 */
(function () {
  "use strict";

  var KEY = 0x5a;
  var CODE = [60, 40, 26, 62, 51, 63, 56, 51, 41, 116, 62, 63];

  var CHALLENGES = [
    { question: "Welches Zeichen bedeutet „Tee“?", options: ["茶", "水", "书"], answer: 0 },
    { question: "Welches Zeichen bedeutet „Wasser“?", options: ["木", "水", "火"], answer: 1 },
    { question: "Wie viel ist 7 + 5?", options: ["10", "12", "13"], answer: 1 },
    { question: "Wie viele Striche hat 一?", options: ["1", "2", "3"], answer: 0 },
    { question: "Welches Zeichen bedeutet „Buch“?", options: ["书", "茶", "水"], answer: 0 },
    { question: "Wie viel ist 9 − 4?", options: ["4", "5", "6"], answer: 1 },
    { question: "Welches Zeichen bedeutet „Feuer“?", options: ["水", "火", "木"], answer: 1 }
  ];

  function emailAddress() {
    return String.fromCharCode.apply(
      null,
      CODE.map(function (code) {
        return code ^ KEY;
      })
    );
  }

  function randomIndex(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function init() {
    var gate = document.querySelector("[data-email-gate]");
    if (!gate) return;

    var start = gate.querySelector("[data-email-start]");
    var challengeBox = gate.querySelector("[data-email-challenge]");
    var result = gate.querySelector("[data-email-result]");
    if (!start || !challengeBox || !result) return;

    var error = null;

    function showError(message) {
      if (!error) {
        error = element("p", "email-gate__error");
        error.setAttribute("role", "alert");
        challengeBox.appendChild(error);
      }
      error.textContent = message;
    }

    function clearError() {
      if (error) {
        error.remove();
        error = null;
      }
    }

    function reveal() {
      challengeBox.hidden = true;
      result.hidden = false;
      result.replaceChildren();

      var address = emailAddress();
      var ready = element("p", "email-gate__ready", "E-Mail-Adresse freigeschaltet:");
      var link = element("a", "email-gate__mail", address);
      link.href = "mailto:" + address;

      var actions = element("div", "email-gate__actions");
      actions.appendChild(link);

      var copy = element("button", "email-gate__copy", "Kopieren");
      copy.type = "button";
      copy.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(address).then(
            function () {
              copy.textContent = "Kopiert";
            },
            function () {
              copy.textContent = "Bitte manuell kopieren";
            }
          );
        } else {
          copy.textContent = "Bitte manuell kopieren";
        }
      });
      actions.appendChild(copy);

      result.appendChild(ready);
      result.appendChild(actions);
      link.focus();
    }

    function renderChallenge(failed) {
      clearError();
      challengeBox.replaceChildren();

      var item = CHALLENGES[randomIndex(CHALLENGES.length)];
      var question = element("p", "email-gate__question", item.question);
      var options = element("div", "email-gate__options");

      item.options.forEach(function (label, index) {
        var button = element("button", "email-gate__option", label);
        button.type = "button";
        button.addEventListener("click", function () {
          if (index === item.answer) {
            reveal();
          } else {
            renderChallenge(true);
          }
        });
        options.appendChild(button);
      });

      challengeBox.appendChild(question);
      challengeBox.appendChild(options);
      if (failed) {
        showError("Das war nicht richtig. Bitte noch einmal versuchen.");
      }
    }

    start.addEventListener("click", function () {
      start.hidden = true;
      challengeBox.hidden = false;
      renderChallenge(false);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
