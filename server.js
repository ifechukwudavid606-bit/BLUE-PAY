const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_ACCESS_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;
const BPC = process.env.BPC_CODE || "L2O6R5D";
const DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UP = path.join(DIR, "receipts");
const DB = path.join(DIR, "db.json");

fs.mkdirSync(UP, { recursive: true });

if (!fs.existsSync(DB)) {
  fs.writeFileSync(
    DB,
    JSON.stringify({
      users: [],
      payments: [],
      withdrawals: []
    })
  );
}

const read = () => JSON.parse(fs.readFileSync(DB));
const write = d =>
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
const uid = () => crypto.randomUUID();
const clean = (v, n = 160) =>
  String(v || "").trim().slice(0, n);

app.use(helmet());
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: "bluepay.sid",
    secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 28800000
    }
  })
);

app.use(
  "/api",
  rateLimit({
    windowMs: 900000,
    limit: 180
  })
);

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: UP,
    filename: (_req, file, cb) => {
      cb(
        null,
        Date.now() +
          "-" +
          crypto.randomBytes(6).toString("hex") +
          path.extname(file.originalname).toLowerCase()
      );
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ].includes(file.mimetype);

    cb(
      allowed ? null : new Error("Use JPG, PNG or WEBP."),
      allowed
    );
  }
});

const user = (req, res, next) =>
  req.session.userId
    ? next()
    : res.status(401).json({ error: "Please log in." });

const admin = (req, res, next) =>
  req.session.isAdmin
    ? next()
    : res.status(401).json({ error: "Admin login required." });

const pub = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  country: u.country,
  language: u.language,
  currency: u.currency,
  paymentApproved: u.paymentApproved,
  bpcIssued: !!u.bpcCode,
  demoBalance: true
});

app.get("/api/me", (req, res) => {
  if (req.session.isAdmin) {
    return res.json({ admin: true });
  }

  const u = read().users.find(
    x => x.id === req.session.userId
  );

  res.json({ user: u ? pub(u) : null });
});

app.post("/api/signup", async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");

  if (
    name.length < 2 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8
  ) {
    return res.status(400).json({
      error: "Enter your name, valid email and password of at least 8 characters."
    });
  }

  const data = read();

  if (data.users.some(u => u.email === email)) {
    return res.status(409).json({
      error: "Email already registered."
    });
  }

  const u = {
    id: uid(),
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    country: clean(req.body.country, 80) || "Nigeria",
    language: clean(req.body.language, 50) || "English",
    currency: clean(req.body.currency, 12) || "NGN",
    paymentApproved: false,
    bpcCode: null,
    createdAt: new Date().toISOString()
  };

  data.users.push(u);
  write(data);

  req.session.userId = u.id;
  req.session.isAdmin = false;

  res.json({ user: pub(u) });
});

app.post("/api/login", async (req, res) => {
  const data = read();
  const email = clean(req.body.email).toLowerCase();

  const u = data.users.find(x => x.email === email);

  if (
    !u ||
    !await bcrypt.compare(
      String(req.body.password || ""),
      u.passwordHash
    )
  ) {
    return res.status(401).json({
      error: "Email or password is incorrect."
    });
  }

  req.session.userId = u.id;
  req.session.isAdmin = false;

  res.json({ user: pub(u) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post(
  "/api/payment/bank-transfer",
  user,
  upload.single("receipt"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Upload the payment screenshot."
      });
    }

    const data = read();

    data.payments.push({
      id: uid(),
      userId: req.session.userId,
      method: "bank-transfer",
      receiptFile: req.file.filename,
      status: "PENDING",
      createdAt: new Date().toISOString()
    });

    write(data);

    res.json({
      message: "Receipt submitted for admin verification."
    });
  }
);

app.post("/api/payment/issued-key", user, (req, res) => {
  const key = clean(req.body.digitKey, 120);

  if (!key) {
    return res.status(400).json({
      error: "Enter your issued digit key."
    });
  }

  const data = read();

  data.payments.push({
    id: uid(),
    userId: req.session.userId,
    method: "issued-digit-key",
    digitKey: key,
    status: "PENDING",
    createdAt: new Date().toISOString()
  });

  write(data);

  res.json({
    message: "Digit key submitted for admin verification."
  });
});

app.post(
  "/api/withdrawal/validate-bpc",
  user,
  (req, res) => {
    const data = read();
    const u = data.users.find(
      x => x.id === req.session.userId
    );

    if (!u || !u.paymentApproved) {
      return res.status(403).json({
        error: "Payment must be approved first."
      });
    }

    if (clean(req.body.bpcCode, 80) !== (u.bpcCode || BPC)) {
      return res.status(400).json({
        error: "Invalid BPC code."
      });
    }

    req.session.bpcUnlocked = true;
    res.json({ ok: true });
  }
);

app.post("/api/withdrawal/submit", user, (req, res) => {
  if (!req.session.bpcUnlocked) {
    return res.status(403).json({
      error: "Enter a valid BPC code first."
    });
  }

  const data = read();
  const u = data.users.find(
    x => x.id === req.session.userId
  );

  const country = clean(req.body.country || u.country, 80);
  let details;

  if (country.toLowerCase() === "nigeria") {
    details = {
      bankName: clean(req.body.bankName, 100),
      accountNumber: clean(req.body.accountNumber, 40),
      accountName: clean(req.body.accountName, 120)
    };

    if (
      !details.bankName ||
      !/^\d{10}$/.test(details.accountNumber) ||
      !details.accountName
    ) {
      return res.status(400).json({
        error: "Enter bank name, 10-digit account number and account name."
      });
    }
  } else {
    details = {
      paypalEmail: clean(req.body.paypalEmail, 160),
      paypalUsername: clean(req.body.paypalUsername, 100)
    };

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.paypalEmail) ||
      !details.paypalUsername
    ) {
      return res.status(400).json({
        error: "Enter valid PayPal email and username."
      });
    }
  }

  data.withdrawals.push({
    id: uid(),
    userId: u.id,
    country,
    details,
    status: "PENDING",
    createdAt: new Date().toISOString()
  });

  write(data);
  req.session.bpcUnlocked = false;

  res.json({
    message: "Withdrawal details submitted. Status: PENDING."
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_KEY) {
    return res.status(503).json({
      error: "Set ADMIN_ACCESS_KEY in server environment."
    });
  }

  if (String(req.body.key || "") !== ADMIN_KEY) {
    return res.status(401).json({
      error: "Invalid admin key."
    });
  }

  req.session.isAdmin = true;
  req.session.userId = null;

  res.json({ ok: true });
});

app.get("/api/admin/data", admin, (req, res) => {
  const data = read();

  res.json({
    users: data.users.map(u => ({
      ...pub(u),
      createdAt: u.createdAt
    })),

    payments: data.payments.map(p => ({
      ...p,
      workerName:
        data.users.find(u => u.id === p.userId)?.name || "Unknown",
      workerEmail:
        data.users.find(u => u.id === p.userId)?.email || ""
    })),

    withdrawals: data.withdrawals.map(w => ({
      ...w,
      workerName:
        data.users.find(u => u.id === w.userId)?.name || "Unknown",
      workerEmail:
        data.users.find(u => u.id === w.userId)?.email || ""
    }))
  });
});

app.get("/api/admin/receipt/:file", admin, (req, res) => {
  const file = path.join(UP, path.basename(req.params.file));

  if (!fs.existsSync(file)) {
    return res.sendStatus(404);
  }

  res.sendFile(file);
});

app.post("/api/admin/payment/:pid", admin, (req, res) => {
  if (!["APPROVED", "DECLINED"].includes(req.body.status)) {
    return res.status(400).json({
      error: "Invalid status."
    });
  }

  const data = read();
  const payment = data.payments.find(
    x => x.id === req.params.pid
  );

  if (!payment) {
    return res.sendStatus(404);
  }

  payment.status = req.body.status;

  const u = data.users.find(x => x.id === payment.userId);

  if (u) {
    u.paymentApproved = payment.status === "APPROVED";

    if (u.paymentApproved && !u.bpcCode) {
      u.bpcCode = BPC;
    }
  }

  write(data);
  res.json({ ok: true });
});

app.post(
  "/api/admin/withdrawal/:wid",
  admin,
  (req, res) => {
    if (
      !["PROCESSING", "PAID", "DECLINED"].includes(req.body.status)
    ) {
      return res.status(400).json({
        error: "Invalid status."
      });
    }

    const data = read();
    const withdrawal = data.withdrawals.find(
      x => x.id === req.params.wid
    );

    if (!withdrawal) {
      return res.sendStatus(404);
    }

    withdrawal.status = req.body.status;
    withdrawal.updatedAt = new Date().toISOString();

    write(data);
    res.json({ ok: true });
  }
);

app.use((err, req, res, next) => {
  res.status(400).json({
    error: err.message || "Request failed."
  });
});

app.listen(PORT, () => {
  console.log("BLUEPAY running on port " + PORT);
});
