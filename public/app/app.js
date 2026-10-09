const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const countries = [
  "Nigeria", "Ghana", "Kenya", "South Africa",
  "United States", "United Kingdom", "Canada",
  "Australia", "India", "United Arab Emirates",
  "France", "Germany", "Japan", "China", "Other"
];

const languages = [
  "English", "French", "Arabic", "Spanish",
  "Portuguese", "Hindi", "Swahili", "Chinese",
  "Japanese", "German"
];

const currencies = [
  "NGN", "USD", "GBP", "EUR", "GHS", "KES",
  "ZAR", "CAD", "AUD", "INR", "AED", "JPY",
  "CNY", "XOF", "XAF"
];

const symbols = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "GH₵",
  KES: "KSh",
  ZAR: "R",
  CAD: "C$",
  AUD: "A$",
  INR: "₹",
  AED: "د.إ",
  JPY: "¥",
  CNY: "¥",
  XOF: "CFA",
  XAF: "FCFA"
};

let me = null;
let isAdmin = false;

const esc = x =>
  String(x ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

function fill(el, values, chosen) {
  el.innerHTML = values.map(x =>
    `<option ${x === chosen ? "selected" : ""}>${esc(x)}</option>`
  ).join("");
}

fill($("#country"), countries, "Nigeria");
fill($("#language"), languages, "English");
fill($("#currency"), currencies, "NGN");

$("#country").addEventListener("change", e => {
  const currencyByCountry = {
    Nigeria: "NGN",
    Ghana: "GHS",
    Kenya: "KES",
    "South Africa": "ZAR",
    "United States": "USD",
    "United Kingdom": "GBP",
    Canada: "CAD",
    Australia: "AUD",
    India: "INR",
    "United Arab Emirates": "AED",
    France: "EUR",
    Germany: "EUR",
    Japan: "JPY",
    China: "CNY"
  };

  if (currencyByCountry[e.target.value]) {
    $("#currency").value = currencyByCountry[e.target.value];
  }
});

function msg(el, text, error = false) {
  el.textContent = text || "";
  el.classList.toggle("error", error);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw Error(data.error || "Request failed");
  }

  return data;
}

function obj(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function only(id) {
  ["auth", "worker", "adminLogin", "admin"].forEach(name => {
    $("#" + name).classList.toggle("hidden", name !== id);
  });

  $("#menu").classList.toggle(
    "hidden",
    !["worker", "admin"].includes(id)
  );
}

function panel(id) {
  ["buy", "withdrawPanel", "faq"].forEach(name => {
    $("#" + name).classList.toggle("hidden", name !== id);
  });

  if (id) {
    $("#" + id).scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function worker(user) {
  me = user;
  isAdmin = false;

  only("worker");

  $("#greeting").textContent = "Welcome, " + user.name + "! 👋";

  $("#amount").textContent =
    (symbols[user.currency] || user.currency + " ") +
    "200,000.00";

  $("#curLabel").textContent = user.currency + " · Demo only";

  $("#ngFields").classList.toggle(
    "hidden",
    user.country.toLowerCase() !== "nigeria"
  );

  $("#intlFields").classList.toggle(
    "hidden",
    user.country.toLowerCase() === "nigeria"
  );
}

/* Login and signup tabs */
$$("[data-tab]").forEach(button => {
  button.onclick = () => {
    const selected = button.dataset.tab;

    $("#login").classList.toggle("hidden", selected !== "login");
    $("#signup").classList.toggle("hidden", selected !== "signup");

    $$("[data-tab]").forEach(tab => {
      tab.style.background = tab === button ? "white" : "transparent";
    });

    msg($("#authMsg"), "");
  };
});

/* Worker signup */
$("#signup").onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await api("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(obj(event.target))
    });

    worker(result.user);
  } catch (error) {
    msg($("#authMsg"), error.message, true);
  }
};

/* Worker login */
$("#login").onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await api("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(obj(event.target))
    });

    worker(result.user);
  } catch (error) {
    msg($("#authMsg"), error.message, true);
  }
};

/* Logout */
async function logout() {
  await api("/api/logout", {
    method: "POST"
  });

  me = null;
  isAdmin = false;
  only("auth");
}

$("#logout").onclick = logout;
$("#adminLogout").onclick = logout;

/* Admin entry through the top menu */
$("#menu").onclick = () => {
  if (isAdmin) {
    return only("admin");
  }

  const answer = prompt("Type ADMIN to open admin login.");

  if (answer && answer.trim().toUpperCase() === "ADMIN") {
    only("adminLogin");
  }
};

/* Admin login */
$("#adminForm").onsubmit = async event => {
  event.preventDefault();

  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(obj(event.target))
    });

    isAdmin = true;
    only("admin");

    await loadAdmin();
  } catch (error) {
    msg($("#adminMsg"), error.message, true);
  }
};

/* Open and close dashboard sections */
$$("[data-panel]").forEach(button => {
  button.onclick = () => panel(button.dataset.panel);
});

$$("[data-close]").forEach(button => {
  button.onclick = () => panel(null);
});

/* Copy bank account number */
$$("[data-copy]").forEach(button => {
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
    } catch {
      button.textContent = button.dataset.copy;
    }
  };
});

/* Nigerian bank transfer: upload receipt */
$("#bank").onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await api("/api/payment/bank-transfer", {
      method: "POST",
      body: new FormData(event.target)
    });

    msg($("#payMsg"), result.message);
    event.target.reset();
  } catch (error) {
    msg($("#payMsg"), error.message, true);
  }
};

/* International payment: enter issued digit key */
$("#digit").onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await api("/api/payment/issued-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(obj(event.target))
    });

    msg($("#payMsg"), result.message);
    event.target.reset();
  } catch (error) {
    msg($("#payMsg"), error.message, true);
  }
};

/* Withdrawal button opens the BPC entry step */
$("#withdraw").onclick = () => {
  panel("withdrawPanel");

  $("#bpc").classList.remove("hidden");
  $("#details").classList.add("hidden");

  msg($("#wdMsg"), "");
};

/* Correct BPC code opens the withdrawal details portal */
$("#bpc").onsubmit = async event => {
  event.preventDefault();

  try {
    await api("/api/withdrawal/validate-bpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(obj(event.target))
    });

    $("#bpc").classList.add("hidden");
    $("#details").classList.remove("hidden");
  } catch (error) {
    msg($("#wdMsg"), error.message, true);
  }
};

/* Submit bank or PayPal withdrawal details */
$("#details").onsubmit = async event => {
  event.preventDefault();

  try {
    const result = await api("/api/withdrawal/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...obj(event.target),
        country: me.country
      })
    });

    msg($("#wdMsg"), result.message);

    event.target.reset();

    $("#details").classList.add("hidden");
    $("#bpc").classList.remove("hidden");
  } catch (error) {
    msg($("#wdMsg"), error.message, true);
  }
};

/* Admin dashboard helpers */
function badge(status) {
  return `<span class="badge ${esc(status)}">${esc(status)}</span>`;
}

async function action(url, body) {
  await api(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  await loadAdmin();
}

/* Load workers, payment submissions and withdrawals */
async function loadAdmin() {
  const host = $("#adminData");
  host.innerHTML = "Loading…";

  try {
    const data = await api("/api/admin/data");

    let html = `
      <section class="section">
        <h2>Workers (${data.users.length})</h2>
        ${
          data.users.map(user => `
            <div class="item">
              <b>${esc(user.name)}</b>
              <p>
                ${esc(user.email)} ·
                ${esc(user.country)} ·
                ${esc(user.currency)}<br>
                Payment approved: ${user.paymentApproved ? "Yes" : "No"}
              </p>
            </div>
          `).join("") || "<p>No workers yet.</p>"
        }
      </section>

      <section class="section">
        <h2>Payment requests</h2>
        ${
          data.payments.map(payment => `
            <div class="item">
              <b>${esc(payment.workerName)}</b>
              ${badge(payment.status)}
              <p>
                ${esc(payment.workerEmail)}<br>
                Method: ${esc(payment.method)}<br>
                ${esc(payment.createdAt)}
              </p>

              ${
                payment.digitKey
                  ? `<p>Submitted issued key: <b>${esc(payment.digitKey)}</b></p>`
                  : ""
              }

              ${
                payment.receiptFile
                  ? `<p><a target="_blank" rel="noopener"
                    href="/api/admin/receipt/${encodeURIComponent(payment.receiptFile)}">
                    View payment screenshot</a></p>`
                  : ""
              }

              <div class="actions">
                <button class="primary"
                  data-pay="${payment.id}"
                  data-status="APPROVED">Approve</button>

                <button class="secondary"
                  data-pay="${payment.id}"
                  data-status="DECLINED">Decline</button>
              </div>
            </div>
          `).join("") || "<p>No payment requests.</p>"
        }
      </section>

      <section class="section">
        <h2>Withdrawal requests</h2>
        ${
          data.withdrawals.map(withdrawal => `
            <div class="item">
              <b>${esc(withdrawal.workerName)}</b>
              ${badge(withdrawal.status)}
              <p>
                ${esc(withdrawal.workerEmail)} ·
                ${esc(withdrawal.country)}<br>
                ${esc(JSON.stringify(withdrawal.details))}
              </p>

              <div class="actions">
                <button class="secondary"
                  data-wd="${withdrawal.id}"
                  data-status="PROCESSING">Processing</button>

                <button class="primary"
                  data-wd="${withdrawal.id}"
                  data-status="PAID">Mark paid</button>

                <button class="secondary"
                  data-wd="${withdrawal.id}"
                  data-status="DECLINED">Decline</button>
              </div>
            </div>
          `).join("") || "<p>No withdrawal requests.</p>"
        }
      </section>
    `;

    host.innerHTML = html;

    /* Admin approves or declines payment requests */
    $$("[data-pay]", host).forEach(button => {
      button.onclick = async () => {
        try {
          await action(
            "/api/admin/payment/" + button.dataset.pay,
            { status: button.dataset.status }
          );

          msg($("#adminActionMsg"), "Payment status updated.");
        } catch (error) {
          msg($("#adminActionMsg"), error.message, true);
        }
      };
    });

    /* Admin updates withdrawal status */
    $$("[data-wd]", host).forEach(button => {
      button.onclick = async () => {
        try {
          await action(
            "/api/admin/withdrawal/" + button.dataset.wd,
            { status: button.dataset.status }
          );

          msg($("#adminActionMsg"), "Withdrawal status updated.");
        } catch (error) {
          msg($("#adminActionMsg"), error.message, true);
        }
      };
    });
  } catch (error) {
    host.textContent = error.message;
  }
}

/* Restore the current session after page refresh */
async function refresh() {
  try {
    const result = await api("/api/me");

    if (result.admin) {
      isAdmin = true;
      only("admin");
      await loadAdmin();
    } else if (result.user) {
      worker(result.user);
    } else {
      only("auth");
    }
  } catch {
    only("auth");
  }
}

refresh();
