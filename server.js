require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "pagaai_session";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const categories = ["Energia Elétrica", "Água", "Aluguel", "Tratamento Médico", "Alimentação", "Educação", "Outro"];
const states = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'self'"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"], imgSrc: ["'self'", "data:", "https:"],
    objectSrc: ["'none'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    connectSrc: ["'self'"]
  } },
  crossOriginResourcePolicy: { policy: "same-site" }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, _res, next) => {
  const raw = req.headers.cookie || "";
  req.cookies = Object.fromEntries(raw.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("="); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
  }));
  next();
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } });
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Limite de envios atingido. Tente novamente mais tarde." } });
const contributionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Muitas tentativas de gerar Pix em pouco tempo. Aguarde e tente novamente." } });
const phoneVerificationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Muitas solicitações de verificação. Aguarde e tente novamente mais tarde." } });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Envie somente PDF, JPG ou PNG."), allowed.includes(file.mimetype));
  }
});

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  cpf: { type: String, required: true, unique: true, select: false },
  phone: { type: String, required: true },
  phoneVerified: { type: Boolean, default: false },
  phoneVerificationStatus: { type: String, enum: ["none", "requested", "code_sent", "verified"], default: "none", index: true },
  phoneVerificationCodeHash: { type: String, default: undefined, select: false },
  phoneVerificationExpiresAt: { type: Date, default: null },
  phoneVerificationRequestedAt: { type: Date, default: null },
  phoneVerificationAttempts: { type: Number, default: 0 },
  termsAcceptedAt: { type: Date, required: true },
  privacyNoticeVersion: { type: String, required: true, default: "1.0" },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, required: true, uppercase: true, enum: states },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["beneficiary", "admin"], default: "beneficiary" },
  active: { type: Boolean, default: true }
}, { timestamps: true });
const requestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", required: true, index: true },
  category: { type: String, required: true, enum: categories },
  creditor: { type: String, trim: true, maxlength: 120, default: "" },
  amount: { type: Number, required: true, min: 1, max: 1000000 },
  dueDate: { type: Date, default: null },
  description: { type: String, trim: true, maxlength: 1200, default: "" },
  document: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiDocument", required: true },
  status: { type: String, enum: ["pending_review", "needs_more_info", "approved", "rejected", "goal_reached", "awaiting_payment", "paid"], default: "pending_review", index: true },
  raisedAmount: { type: Number, default: 0, min: 0 },
  publicProof: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiPublicProof", default: null },
  adminNote: { type: String, maxlength: 1000, default: "" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });
const documentSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiDebtRequest", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", required: true },
  filename: { type: String, required: true },
  contentType: { type: String, required: true, enum: ["application/pdf", "image/jpeg", "image/png"] },
  size: { type: Number, required: true, max: MAX_FILE_SIZE },
  sha256: { type: String, required: true, index: true },
  data: { type: Buffer, required: true, select: false }
}, { timestamps: true });

const contributionSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiDebtRequest", required: true, index: true },
  amount: { type: Number, required: true, min: 1, max: 1000000 },
  donorName: { type: String, trim: true, maxlength: 100, default: "" },
  donorType: { type: String, enum: ["person", "company"], default: "person" },
  anonymous: { type: Boolean, default: true },
  method: { type: String, enum: ["pix"], default: "pix" },
  status: { type: String, enum: ["pending", "received", "failed", "refunded", "chargeback"], default: "pending", index: true },
  asaasPaymentId: { type: String, default: "", index: true },
  externalReference: { type: String, default: "", index: true },
  processingFee: { type: Number, default: 0, min: 0, max: 100 },
  paidAt: { type: Date, default: null }
}, { timestamps: true });
const platformSupportSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 1, max: 1000000 },
  donorName: { type: String, trim: true, maxlength: 100, default: "" },
  anonymous: { type: Boolean, default: true },
  method: { type: String, enum: ["pix"], default: "pix" },
  status: { type: String, enum: ["pending", "received", "failed", "refunded", "chargeback"], default: "pending", index: true },
  asaasPaymentId: { type: String, default: "", index: true },
  externalReference: { type: String, default: "", index: true },
  paidAt: { type: Date, default: null }
}, { timestamps: true });
const platformSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "payments" },
  asaasPixProcessingFee: { type: Number, min: 0, max: 100, default: 1.99 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", default: null }
}, { timestamps: true });
const commentSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiDebtRequest", required: true, index: true },
  type: { type: String, enum: ["testimonial"], required: true },
  author: { type: String, trim: true, maxlength: 80, default: "Anônimo" },
  message: { type: String, trim: true, required: true, maxlength: 600 },
  anonymous: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "hidden"], default: "pending", index: true }
}, { timestamps: true });
const publicProofSchema = new mongoose.Schema({
  request: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiDebtRequest", required: true, index: true },
  filename: { type: String, required: true },
  contentType: { type: String, required: true, enum: ["application/pdf", "image/jpeg", "image/png"] },
  size: { type: Number, required: true, max: MAX_FILE_SIZE },
  data: { type: Buffer, required: true, select: false }
}, { timestamps: true });

const pushSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userAgent: { type: String, maxlength: 500, default: "" },
  lastUsedAt: { type: Date, default: Date.now }
}, { timestamps: true });
const adminNotificationSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "PagaAiUser", required: true, index: true },
  type: { type: String, required: true, maxlength: 40 },
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, maxlength: 500 },
  url: { type: String, default: "/admin", maxlength: 300 },
  entityId: { type: String, default: "", maxlength: 100 },
  readAt: { type: Date, default: null, index: true }
}, { timestamps: true });
adminNotificationSchema.index({ admin: 1, createdAt: -1 });

const User = mongoose.models.PagaAiUser || mongoose.model("PagaAiUser", userSchema);
const DebtRequest = mongoose.models.PagaAiDebtRequest || mongoose.model("PagaAiDebtRequest", requestSchema);
const DebtDocument = mongoose.models.PagaAiDocument || mongoose.model("PagaAiDocument", documentSchema);
const Contribution = mongoose.models.PagaAiContribution || mongoose.model("PagaAiContribution", contributionSchema);
const PlatformSupport = mongoose.models.PagaAiPlatformSupport || mongoose.model("PagaAiPlatformSupport", platformSupportSchema);
const PlatformSettings = mongoose.models.PagaAiPlatformSettings || mongoose.model("PagaAiPlatformSettings", platformSettingsSchema);
const PublicProof = mongoose.models.PagaAiPublicProof || mongoose.model("PagaAiPublicProof", publicProofSchema);
const PublicComment = mongoose.models.PagaAiPublicComment || mongoose.model("PagaAiPublicComment", commentSchema);
const PushSubscription = mongoose.models.PagaAiPushSubscription || mongoose.model("PagaAiPushSubscription", pushSubscriptionSchema);
const AdminNotification = mongoose.models.PagaAiAdminNotification || mongoose.model("PagaAiAdminNotification", adminNotificationSchema);

function configureWebPush() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:admin@pagaai.com.br").trim();
  if (!publicKey || !privateKey) {
    console.warn("Notificações push desativadas: configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render.");
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}
function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
async function sendAdminPush(payload, adminId = null) {
  if (!pushConfigured()) return { sent: 0, failed: 0, disabled: true };
  const subscriptions = await PushSubscription.find().populate("user", "role active").lean();
  const targets = subscriptions.filter(s => s.user?.role === "admin" && s.user?.active !== false && (!adminId || String(s.user._id) === String(adminId)));
  const results = await Promise.allSettled(targets.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
        { TTL: 86400 }
      );
      await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsedAt: new Date() } });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        console.error("Falha ao enviar push administrativo:", error.statusCode || "", error.message);
      }
      throw error;
    }
  }));
  return { sent: results.filter(result => result.status === "fulfilled").length, failed: results.filter(result => result.status === "rejected").length, disabled: false };
}
async function notifyAdmins({ type, title, body, url = "/admin", entityId = "", tag = "" }) {
  try {
    const admins = await User.find({ role: "admin", active: true }).select("_id").lean();
    if (!admins.length) return;
    await AdminNotification.insertMany(admins.map(admin => ({ admin: admin._id, type, title, body, url, entityId })));
    await sendAdminPush({ title: "PagaAi · " + title, body, url, tag: tag || "pagaai-" + type + "-" + (entityId || Date.now()), data: { type, entityId } });
  } catch (error) {
    console.error("Falha ao registrar notificação administrativa:", error.message);
  }
}
function cleanCpf(value) { return String(value || "").replace(/\D/g, ""); }
function validCpf(value) {
  const cpf = cleanCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11; if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}
function cleanCnpj(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function validCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digit = (base, weights) => {
    const sum = weights.reduce((total, weight, i) => total + Number(base[i]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  if (first !== Number(cnpj[12])) return false;
  const second = digit(cnpj.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return second === Number(cnpj[13]);
}
function hasValidFileSignature(file) {
  const b = file.buffer;
  if (file.mimetype === "application/pdf") return b.subarray(0, 5).toString() === "%PDF-";
  if (file.mimetype === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (file.mimetype === "image/png") return b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return false;
}
function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
function validPhone(value) { const p = normalizePhone(value); return p.length === 10 || p.length === 11; }
function signSession(user) { return jwt.sign({ sub: String(user._id), role: user.role }, JWT_SECRET, { expiresIn: "12h" }); }
function setSession(res, user) {
  res.cookie(COOKIE_NAME, signSession(user), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 12 * 60 * 60 * 1000, path: "/" });
}
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Faça login para continuar." });
    req.session = jwt.verify(token, JWT_SECRET); next();
  } catch { return res.status(401).json({ error: "Sua sessão expirou. Entre novamente." }); }
}
function requireAdmin(req, res, next) {
  if (req.session?.role !== "admin") return res.status(403).json({ error: "Acesso restrito à administração." });
  next();
}
function publicUser(user) {
  return { id: String(user._id), fullName: user.fullName, phone: user.phone, phoneVerified: user.phoneVerified, phoneVerificationStatus: user.phoneVerificationStatus || "none", city: user.city, state: user.state, role: user.role, createdAt: user.createdAt };
}
function phoneVerificationHash(userId, code) {
  return crypto.createHmac("sha256", JWT_SECRET).update(String(userId) + ":" + String(code)).digest("hex");
}
function publicRequest(item) {
  const raised = Math.min(Number(item.raisedAmount || 0), Number(item.amount || 0));
  return { id: String(item._id), city: item.user?.city || "", state: item.user?.state || "", category: item.category, amount: item.amount, raisedAmount: raised, remainingAmount: Math.max(0, item.amount - raised), progress: item.amount > 0 ? Math.min(100, Math.round(raised / item.amount * 100)) : 0, description: item.description, status: item.status, hasPublicProof: Boolean(item.publicProof), createdAt: item.createdAt };
}

app.get("/api/health", (_req, res) => res.json({
  status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  uploads: "private-mongodb", phoneVerification: "manual-whatsapp-code"
}));

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { fullName, cpf, phone, city, state, password, termsAccepted } = req.body || {};
    const normalizedCpf = cleanCpf(cpf), normalizedPhone = normalizePhone(phone), uf = String(state || "").toUpperCase();
    if (!fullName || String(fullName).trim().length < 5 || !validCpf(normalizedCpf) || !validPhone(normalizedPhone) || !city || !states.includes(uf) || String(password || "").length < 10 || termsAccepted !== "true") {
      return res.status(400).json({ error: "Confira os dados: nome completo, CPF válido, telefone com DDD, cidade, UF e senha com pelo menos 10 caracteres." });
    }
    if (await User.findOne({ cpf: normalizedCpf })) return res.status(409).json({ error: "Já existe uma conta cadastrada com este CPF. Tente entrar." });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ fullName: String(fullName).trim(), cpf: normalizedCpf, phone: normalizedPhone, city: String(city).trim(), state: uf, passwordHash, termsAcceptedAt: new Date(), privacyNoticeVersion: "1.0" });
    await notifyAdmins({ type: "new_user", title: "Novo beneficiário cadastrado", body: user.fullName + " criou uma conta no PagaAi.", url: "/admin#pa-admin-users", entityId: String(user._id) });
    setSession(res, user);
    res.status(201).json({ user: publicUser(user), message: "Cadastro realizado. O telefone ainda precisa ser confirmado." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "CPF já cadastrado." });
    console.error("register:", error.message); res.status(500).json({ error: "Não foi possível criar a conta." });
  }
});
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const cpf = cleanCpf(req.body?.cpf), password = String(req.body?.password || "");
    const user = await User.findOne({ cpf }).select("+cpf +passwordHash");
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "CPF ou senha incorretos." });
    setSession(res, user); res.json({ user: publicUser(user) });
  } catch (error) { console.error("login:", error.message); res.status(500).json({ error: "Não foi possível entrar." }); }
});
app.post("/api/admin/login", authLimiter, async (req, res) => {
  try {
    const cpf = cleanCpf(req.body?.cpf), password = String(req.body?.password || "");
    const user = await User.findOne({ cpf }).select("+cpf +passwordHash");
    if (!user || !user.active || user.role !== "admin" || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Credenciais administrativas inválidas. Use o CPF e a senha configurados para o administrador do PagaAi." });
    }
    setSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (error) { console.error("admin login:", error.message); res.status(500).json({ error: "Não foi possível acessar a administração." }); }
});

app.get("/api/push/public-key", requireAuth, requireAdmin, (_req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: "Notificações push ainda não configuradas no servidor." });
  res.set("Cache-Control", "no-store").json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});
app.post("/api/push/admin-subscription", requireAuth, requireAdmin, async (req, res) => {
  try {
    const subscription = req.body?.subscription || {};
    const endpoint = String(subscription.endpoint || "").trim();
    const p256dh = String(subscription.keys?.p256dh || "").trim();
    const auth = String(subscription.keys?.auth || "").trim();
    if (!endpoint || !p256dh || !auth || endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
      return res.status(400).json({ error: "Assinatura de notificações inválida." });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { user: req.session.sub, endpoint, keys: { p256dh, auth }, userAgent: String(req.headers["user-agent"] || "").slice(0, 500), lastUsedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, message: "Notificações ativadas neste dispositivo." });
  } catch (error) {
    console.error("push subscription:", error.message);
    res.status(400).json({ error: "Não foi possível ativar as notificações neste dispositivo." });
  }
});
app.delete("/api/push/admin-subscription", requireAuth, requireAdmin, async (req, res) => {
  const endpoint = String(req.body?.endpoint || "").trim();
  if (endpoint) await PushSubscription.deleteOne({ endpoint, user: req.session.sub });
  res.json({ ok: true });
});
app.post("/api/admin/notifications/test-push", requireAuth, requireAdmin, async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: "Push não configurado. Confira VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Render." });
  const subscriptionCount = await PushSubscription.countDocuments({ user: req.session.sub });
  if (!subscriptionCount) return res.status(409).json({ error: "Este dispositivo ainda não está inscrito. Clique primeiro em Ativar notificações neste celular." });
  const result = await sendAdminPush({ title: "PagaAi · teste de notificação", body: "Se você recebeu este aviso, o push está funcionando neste dispositivo.", url: "/admin", tag: "pagaai-push-test-" + Date.now() }, req.session.sub);
  if (!result.sent) return res.status(502).json({ error: "O servidor tentou enviar o push, mas o provedor recusou a entrega. Consulte os logs do Render." });
  res.json({ ok: true, sent: result.sent, failed: result.failed, message: "Notificação de teste enviada para " + result.sent + " assinatura(s)." });
});
app.get("/api/admin/notifications", requireAuth, requireAdmin, async (req, res) => {
  const adminId = req.session.sub;
  const [items, unread] = await Promise.all([
    AdminNotification.find({ admin: adminId }).sort({ createdAt: -1 }).limit(100).lean(),
    AdminNotification.countDocuments({ admin: adminId, readAt: null })
  ]);
  res.set("Cache-Control", "no-store").json({ unread, items: items.map(item => ({
    id: String(item._id), type: item.type, title: item.title, body: item.body,
    url: item.url, entityId: item.entityId, read: Boolean(item.readAt), createdAt: item.createdAt
  })) });
});
app.patch("/api/admin/notifications/:id/read", requireAuth, requireAdmin, async (req, res) => {
  await AdminNotification.updateOne({ _id: req.params.id, admin: req.session.sub, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});
app.post("/api/admin/notifications/read-all", requireAuth, requireAdmin, async (req, res) => {
  await AdminNotification.updateMany({ admin: req.session.sub, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
});

app.post("/api/my/phone-verification/request", requireAuth, phoneVerificationLimiter, async (req, res) => {
  if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Apenas beneficiários podem solicitar a confirmação do telefone." });
  const user = await User.findById(req.session.sub);
  if (!user || !user.active) return res.status(404).json({ error: "Conta não encontrada." });
  if (user.phoneVerified) return res.status(409).json({ error: "Seu telefone já está confirmado." });
  const now = new Date();
  if (user.phoneVerificationStatus === "requested" && user.phoneVerificationRequestedAt && now - user.phoneVerificationRequestedAt < 10 * 60 * 1000) {
    return res.json({ ok: true, status: "requested", message: "Sua solicitação já está na fila da equipe. Aguarde o contato pelo WhatsApp." });
  }
  if (user.phoneVerificationStatus === "code_sent" && user.phoneVerificationExpiresAt && user.phoneVerificationExpiresAt > now) {
    return res.json({ ok: true, status: "code_sent", message: "A equipe já enviou um código. Confira o WhatsApp cadastrado e informe o código abaixo." });
  }
  user.phoneVerificationStatus = "requested";
  user.phoneVerificationRequestedAt = now;
  user.phoneVerificationCodeHash = undefined;
  user.phoneVerificationExpiresAt = null;
  user.phoneVerificationAttempts = 0;
  await user.save();
  await notifyAdmins({ type: "phone_verification", title: "Confirmação de telefone solicitada", body: user.fullName + " solicitou a confirmação do telefone.", url: "/admin#pa-admin-phone-verifications", entityId: String(user._id), tag: "phone-verification-" + String(user._id) });
  res.json({ ok: true, status: "requested", message: "Solicitação enviada. A equipe PagaAi vai gerar seu código e enviar pelo WhatsApp cadastrado." });
});
app.post("/api/my/phone-verification/confirm", requireAuth, phoneVerificationLimiter, async (req, res) => {
  if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Apenas beneficiários podem confirmar o telefone." });
  const code = String(req.body?.code || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Informe o código de 6 números recebido pelo WhatsApp." });
  const user = await User.findById(req.session.sub).select("+phoneVerificationCodeHash");
  if (!user || !user.active) return res.status(404).json({ error: "Conta não encontrada." });
  if (user.phoneVerified) return res.json({ ok: true, phoneVerified: true, message: "Telefone já confirmado." });
  if (user.phoneVerificationStatus !== "code_sent" || !user.phoneVerificationCodeHash) return res.status(409).json({ error: "Ainda não existe um código ativo. Solicite a confirmação e aguarde a equipe." });
  if (!user.phoneVerificationExpiresAt || user.phoneVerificationExpiresAt <= new Date()) {
    user.phoneVerificationStatus = "requested"; user.phoneVerificationCodeHash = undefined; user.phoneVerificationExpiresAt = null; user.phoneVerificationAttempts = 0; await user.save();
    return res.status(410).json({ error: "O código expirou. Sua solicitação voltou para a fila da equipe." });
  }
  if (user.phoneVerificationAttempts >= 5) return res.status(429).json({ error: "Limite de tentativas atingido. Aguarde um novo código da equipe." });
  const expected = Buffer.from(user.phoneVerificationCodeHash, "hex");
  const actual = Buffer.from(phoneVerificationHash(user._id, code), "hex");
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!valid) {
    user.phoneVerificationAttempts += 1;
    if (user.phoneVerificationAttempts >= 5) {
      user.phoneVerificationStatus = "requested"; user.phoneVerificationCodeHash = undefined; user.phoneVerificationExpiresAt = null;
    }
    await user.save();
    return res.status(400).json({ error: user.phoneVerificationAttempts >= 5 ? "Código incorreto. Limite atingido; aguarde um novo código da equipe." : "Código incorreto. Confira a mensagem e tente novamente." });
  }
  user.phoneVerified = true;
  user.phoneVerificationStatus = "verified";
  user.phoneVerificationCodeHash = undefined;
  user.phoneVerificationExpiresAt = null;
  user.phoneVerificationAttempts = 0;
  await user.save();
  await notifyAdmins({ type: "phone_verified", title: "Telefone confirmado", body: user.fullName + " concluiu a confirmação do celular.", url: "/admin#pa-admin-users", entityId: String(user._id) });
  res.json({ ok: true, phoneVerified: true, message: "Telefone confirmado com sucesso. Agora a equipe pode analisar sua solicitação." });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }); res.json({ ok: true });
});
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.sub);
  if (!user || !user.active) return res.status(401).json({ error: "Conta indisponível." });
  res.json({ user: publicUser(user) });
});

app.post("/api/debts", requireAuth, uploadLimiter, upload.single("document"), async (req, res) => {
  let createdDoc = null, createdRequest = null;
  try {
    if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Somente beneficiários podem cadastrar pedidos." });
    const user = await User.findById(req.session.sub);
    if (!user || !user.active) return res.status(401).json({ error: "Conta não encontrada." });
    if (!user.phoneVerified || user.phoneVerificationStatus !== "verified") {
      return res.status(403).json({ error: "Confirme seu telefone antes de cadastrar uma dívida. Solicite o código pelo WhatsApp e informe os 6 números recebidos." });
    }
    const { category, creditor, amount, dueDate, description } = req.body || {};
    const value = Number(String(amount || "").replace(",", "."));
    if (!categories.includes(category) || !Number.isFinite(value) || value < 1 || value > 1000000 || !req.file) {
      return res.status(400).json({ error: "Informe a categoria, um valor válido e anexe o comprovante da dívida." });
    }
    if (!hasValidFileSignature(req.file)) return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a PDF, JPG ou PNG válido." });
    const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const duplicateDocument = await DebtDocument.findOne({ owner: user._id, sha256: fileHash });
    if (duplicateDocument) {
      const duplicateRequest = await DebtRequest.findOne({ _id: duplicateDocument.request, status: { $in: ["pending_review", "needs_more_info", "approved"] } });
      if (duplicateRequest) return res.status(409).json({ error: "Este mesmo comprovante já foi enviado em uma solicitação ativa." });
    }
    createdRequest = await DebtRequest.create({ user: user._id, category, creditor, amount: value, dueDate: dueDate ? new Date(dueDate) : null, description, document: new mongoose.Types.ObjectId() });
    createdDoc = await DebtDocument.create({
      _id: createdRequest.document, request: createdRequest._id, owner: user._id,
      filename: path.basename(req.file.originalname).slice(0, 140), contentType: req.file.mimetype,
      size: req.file.size, sha256: fileHash, data: req.file.buffer
    });
    await notifyAdmins({ type: "new_debt", title: "Nova dívida para análise", body: user.fullName + " enviou uma solicitação de " + category + ".", url: "/admin#pa-admin-pending", entityId: String(createdRequest._id) });
    res.status(201).json({ id: createdRequest._id, status: createdRequest.status, message: "Pedido enviado. Ele ficará privado enquanto aguarda análise documental." });
  } catch (error) {
    if (createdDoc) await DebtDocument.deleteOne({ _id: createdDoc._id }).catch(() => {});
    if (createdRequest) await DebtRequest.deleteOne({ _id: createdRequest._id }).catch(() => {});
    console.error("create debt:", error.message);
    res.status(400).json({ error: error.message?.includes("File too large") ? "O arquivo ultrapassa o limite de 5 MB." : error.message || "Não foi possível registrar a solicitação." });
  }
});
async function asaasRequest(endpoint, options = {}) {
  if (!process.env.ASAAS_API_KEY) throw new Error("Integração Asaas não configurada no servidor.");
  const response = await fetch("https://api.asaas.com/v3" + endpoint, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", "User-Agent": "PagaAi/1.0", access_token: process.env.ASAAS_API_KEY },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Asaas API:", response.status, JSON.stringify(data).slice(0, 1200));
    throw new Error(data.errors?.[0]?.description || "O Asaas não conseguiu processar a cobrança.");
  }
  return data;
}
async function getPaymentSettings() {
  const saved = await PlatformSettings.findOne({ key: "payments" }).lean();
  const fee = Number(saved?.asaasPixProcessingFee);
  return { asaasPixProcessingFee: Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : 1.99 };
}
function asaasDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
}
async function createAsaasPix(customerId, amount, description, externalReference) {
  const payment = await asaasRequest("/payments", { method: "POST", body: {
    customer: customerId, billingType: "PIX", value: amount, dueDate: asaasDate(),
    description: description.slice(0, 500), externalReference
  }});
  const qr = await asaasRequest("/payments/" + encodeURIComponent(payment.id) + "/pixQrCode");
  return { paymentId: payment.id, encodedImage: qr.encodedImage, payload: qr.payload, expirationDate: qr.expirationDate };
}
app.post("/api/public/debts/:id/contributions", contributionLimiter, async (req, res) => {
  let contribution, support;
  try {
    const rawAmount = String(req.body?.amount ?? "").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    const normalizedAmount = rawAmount.includes(",") ? rawAmount.replace(/\./g, "").replace(",", ".") : rawAmount;
    const value = Math.round(Number(normalizedAmount) * 100) / 100;
    const rawSupport = String(req.body?.supportAmount ?? "0").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    const normalizedSupport = rawSupport.includes(",") ? rawSupport.replace(/\./g, "").replace(",", ".") : rawSupport;
    const supportValue = Math.round(Number(normalizedSupport || 0) * 100) / 100;
    const anonymous = req.body?.anonymous === true || req.body?.anonymous === "true";
    const donorType = req.body?.donorType === "company" ? "company" : "person";
    const donorName = anonymous ? "" : String(req.body?.donorName || "").trim().slice(0, 100);
    const legalName = String(req.body?.legalName || "").trim().slice(0, 120);
    const cpfCnpj = donorType === "company" ? cleanCnpj(req.body?.cpfCnpj) : cleanCpf(req.body?.cpfCnpj);
    if (!Number.isFinite(value) || value < 1 || value > 1000000) return res.status(400).json({ error: "Informe uma contribuição de pelo menos R$ 1,00." });
    if (!Number.isFinite(supportValue) || supportValue < 0 || supportValue > 1000000 || (supportValue > 0 && supportValue < 1)) return res.status(400).json({ error: "A contribuição voluntária deve ser zero ou de pelo menos R$ 1,00." });
    if (!anonymous && !donorName) return res.status(400).json({ error: "Informe como deseja ser identificado ou escolha contribuir anonimamente." });
    if (legalName.length < 3) return res.status(400).json({ error: "Informe o nome completo ou razão social do titular do documento." });
    if (donorType === "company" ? !validCnpj(cpfCnpj) : !validCpf(cpfCnpj)) return res.status(400).json({ error: donorType === "company" ? "Informe um CNPJ válido." : "Informe um CPF válido." });
    const item = await DebtRequest.findOne({ _id: req.params.id, status: "approved" });
    if (!item) return res.status(404).json({ error: "Este pedido não está recebendo contribuições no momento." });
    const remaining = Math.max(0, item.amount - Number(item.raisedAmount || 0));
    if (value > remaining) return res.status(400).json({ error: "A contribuição ultrapassa o valor que falta. Restam " + remaining.toFixed(2) + "." });
    const paymentSettings = await getPaymentSettings();
    const processingFee = paymentSettings.asaasPixProcessingFee;
    const totalValue = Math.round((value + supportValue + processingFee) * 100) / 100;
    if (totalValue > 1000000) return res.status(400).json({ error: "O total do Pix ultrapassa o limite permitido." });
    const customer = await asaasRequest("/customers", { method: "POST", body: {
      name: legalName,
      cpfCnpj,
      notificationDisabled: true
    }});
    contribution = await Contribution.create({ request: item._id, amount: value, processingFee, donorName, donorType, anonymous, method: "pix", status: "pending" });
    const externalReference = "pagaai-total-" + String(contribution._id);
    if (supportValue >= 1) {
      support = await PlatformSupport.create({ amount: supportValue, donorName, anonymous, method: "pix", status: "pending" });
    }
    const totalPix = await createAsaasPix(
      customer.id,
      totalValue,
      supportValue >= 1
        ? "PagaAi - contribuição para campanha e apoio voluntário"
        : "PagaAi - contribuição para campanha",
      externalReference
    );
    contribution.asaasPaymentId = totalPix.paymentId;
    contribution.externalReference = externalReference;
    await contribution.save();
    if (support) {
      support.asaasPaymentId = totalPix.paymentId;
      support.externalReference = externalReference;
      await support.save();
    }
    res.set("Cache-Control", "no-store").status(201).json({
      ok: true,
      message: "Pix único criado. A contribuição, o apoio voluntário e o custo operacional serão identificados separadamente após a confirmação do pagamento.",
      pix: {
        amount: totalValue,
        campaignAmount: value,
        supportAmount: supportValue,
        processingFee,
        qrCode: totalPix.encodedImage,
        payload: totalPix.payload,
        expirationDate: totalPix.expirationDate
      }
    });
  } catch (error) {
    if (contribution && !contribution.asaasPaymentId) await Contribution.deleteOne({ _id: contribution._id }).catch(() => {});
    if (support && !support.asaasPaymentId) await PlatformSupport.deleteOne({ _id: support._id }).catch(() => {});
    console.error("Asaas Pix creation:", error.message);
    res.status(502).json({ error: error.message || "Não foi possível gerar o Pix. Tente novamente." });
  }
});
app.post("/api/webhooks/asaas", async (req, res) => {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const received = req.get("asaas-access-token");
  if (!expected || !received || received !== expected) return res.status(401).json({ error: "Webhook não autorizado." });
  try {
    const event = String(req.body?.event || "");
    const paymentId = String(req.body?.payment?.id || "");
    if (!paymentId) return res.status(200).json({ received: true });
    const receivedEvents = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
    const negativeEvents = ["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"];
    if (!receivedEvents.includes(event) && !negativeEvents.includes(event)) return res.status(200).json({ received: true });
    const payment = await asaasRequest("/payments/" + encodeURIComponent(paymentId));
    const isReceived = receivedEvents.includes(event) && ["RECEIVED", "CONFIRMED"].includes(payment.status);
    const nextStatus = isReceived ? "received" : "refunded";
    const campaign = await Contribution.findOneAndUpdate(
      { asaasPaymentId: paymentId, status: "pending" },
      { $set: { status: nextStatus, paidAt: isReceived ? new Date(payment.paymentDate || payment.clientPaymentDate || Date.now()) : null } },
      { new: true }
    );
    if (campaign && isReceived) {
      await notifyAdmins({ type: "contribution_received", title: "Contribuição recebida", body: "Uma contribuição de R$ " + Number(campaign.amount).toFixed(2).replace(".", ",") + " foi confirmada pelo Asaas.", url: "/admin#pa-admin-contributions", entityId: String(campaign._id) });
      const updated = await DebtRequest.findOneAndUpdate(
        { _id: campaign.request, status: "approved", $expr: { $lte: [{ $add: [{ $ifNull: ["$raisedAmount", 0] }, campaign.amount] }, "$amount"] } },
        { $inc: { raisedAmount: campaign.amount } }, { new: true }
      );
      if (updated && updated.raisedAmount >= updated.amount) {
        updated.raisedAmount = updated.amount;
        updated.status = "goal_reached";
        await updated.save();
      }
      if (!updated) console.error("PagaAi: pagamento recebido fora do saldo restante da campanha", String(campaign._id));
    }
    const platformSupport = await PlatformSupport.findOneAndUpdate({ asaasPaymentId: paymentId, status: "pending" }, { $set: { status: nextStatus, paidAt: isReceived ? new Date(payment.paymentDate || payment.clientPaymentDate || Date.now()) : null } }, { new: true });
    if (platformSupport && isReceived) {
      await notifyAdmins({ type: "platform_support_received", title: "Apoio à plataforma recebido", body: "Um apoio voluntário de R$ " + Number(platformSupport.amount).toFixed(2).replace(".", ",") + " foi confirmado pelo Asaas.", url: "/admin#pa-admin-supports", entityId: String(platformSupport._id) });
    }
    if (campaign && !isReceived) {
      await notifyAdmins({ type: "payment_reversed", title: "Pagamento estornado ou contestado", body: "Uma contribuição teve o status atualizado para " + event + ".", url: "/admin#pa-admin-contributions", entityId: String(campaign._id) });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Asaas webhook:", error.message);
    return res.status(500).json({ error: "Falha ao processar notificação." });
  }
});
app.get("/api/public/payment-settings", async (_req, res) => {
  try { res.set("Cache-Control", "no-store").json(await getPaymentSettings()); }
  catch (error) { console.error("payment settings:", error.message); res.status(500).json({ error: "Não foi possível consultar o custo operacional." }); }
});
app.get("/api/public/impact", async (_req, res) => {
  try {
    const paid = await DebtRequest.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, amount: { $sum: "$amount" }, people: { $addToSet: "$user" }, count: { $sum: 1 } } }]);
    const totals = paid[0] || { amount: 0, people: [], count: 0 };
    res.set("Cache-Control", "no-store").json({ peopleHelped: totals.people.length, amountHelped: totals.amount, paidRequests: totals.count });
  } catch (error) { console.error("public impact:", error.message); res.status(503).json({ error: "Indicadores indisponíveis." }); }
});
app.get("/api/debts", async (_req, res) => {
  try {
    const items = await DebtRequest.find({ status: { $in: ["approved", "goal_reached", "awaiting_payment", "paid"] } }).populate("user", "city state").sort({ createdAt: -1 }).limit(50).lean();
    res.json(items.map(publicRequest));
  } catch (error) { console.error("public debts:", error.message); res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
});
app.get("/api/my/debts", requireAuth, async (req, res) => {
  const items = await DebtRequest.find({ user: req.session.sub }).sort({ createdAt: -1 }).lean();
  res.json(items.map(item => ({ id: String(item._id), category: item.category, creditor: item.creditor, amount: item.amount, raisedAmount: item.raisedAmount || 0, remainingAmount: Math.max(0, item.amount - (item.raisedAmount || 0)), status: item.status, adminNote: item.adminNote, hasPublicProof: Boolean(item.publicProof), createdAt: item.createdAt })));
});
app.post("/api/my/debts/:id/updated-bill", requireAuth, uploadLimiter, upload.single("document"), async (req, res) => {
  try {
    if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Apenas o beneficiário pode enviar o boleto atualizado." });
    if (!req.file || !hasValidFileSignature(req.file)) return res.status(400).json({ error: "Anexe um boleto atualizado válido em PDF, JPG ou PNG." });
    const item = await DebtRequest.findOne({ _id: req.params.id, user: req.session.sub, status: "goal_reached" });
    if (!item) return res.status(409).json({ error: "O pedido ainda não atingiu a meta ou o boleto já foi enviado." });
    const replacement = await DebtDocument.create({ request: item._id, owner: req.session.sub, filename: path.basename(req.file.originalname).slice(0, 140), contentType: req.file.mimetype, size: req.file.size, sha256: crypto.createHash("sha256").update(req.file.buffer).digest("hex"), data: req.file.buffer });
    const previousId = item.document;
    item.document = replacement._id;
    item.status = "awaiting_payment";
    item.adminNote = "Boleto atualizado recebido. Aguardando conferência e pagamento pela equipe PagaAi.";
    await item.save();
    await DebtDocument.deleteOne({ _id: previousId });
    const owner = await User.findById(req.session.sub).select("fullName");
    await notifyAdmins({ type: "updated_bill", title: "Boleto atualizado recebido", body: (owner?.fullName || "Um beneficiário") + " enviou o boleto atualizado.", url: "/admin#pa-admin-pending", entityId: String(item._id) });
    res.json({ ok: true, message: "Boleto atualizado enviado. A equipe PagaAi fará a conferência." });
  } catch (error) {
    console.error("updated bill:", error.message);
    res.status(400).json({ error: "Não foi possível enviar o boleto atualizado." });
  }
});

app.post("/api/my/debts/:id/complement", requireAuth, uploadLimiter, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Anexe o novo comprovante." });
    if (!hasValidFileSignature(req.file)) return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a PDF, JPG ou PNG válido." });
    const item = await DebtRequest.findOne({ _id: req.params.id, user: req.session.sub, status: "needs_more_info" });
    if (!item) return res.status(404).json({ error: "Solicitação não encontrada ou não está aguardando complemento." });
    const replacement = await DebtDocument.create({
      request: item._id, owner: req.session.sub, filename: path.basename(req.file.originalname).slice(0, 140),
      contentType: req.file.mimetype, size: req.file.size, sha256: crypto.createHash("sha256").update(req.file.buffer).digest("hex"), data: req.file.buffer
    });
    const previousId = item.document;
    item.document = replacement._id;
    item.status = "pending_review";
    item.adminNote = "";
    item.reviewedBy = null;
    item.reviewedAt = null;
    await item.save();
    await DebtDocument.deleteOne({ _id: previousId });
    const owner = await User.findById(req.session.sub).select("fullName");
    await notifyAdmins({ type: "debt_complement", title: "Complemento de dívida recebido", body: (owner?.fullName || "Um beneficiário") + " enviou um novo comprovante.", url: "/admin#pa-admin-pending", entityId: String(item._id) });
    res.json({ ok: true, message: "Novo comprovante enviado. A solicitação voltou para análise." });
  } catch (error) {
    console.error("complement:", error.message);
    res.status(400).json({ error: error.message || "Não foi possível enviar o complemento." });
  }
});
app.get("/api/public/debts/:id/payment-proof", async (req, res) => {
  try {
    const item = await DebtRequest.findOne({ _id: req.params.id, status: "paid" }).select("publicProof");
    if (!item?.publicProof) return res.status(404).json({ error: "Comprovante público indisponível." });
    const proof = await PublicProof.findById(item.publicProof).select("+data");
    if (!proof) return res.status(404).json({ error: "Comprovante não encontrado." });
    res.setHeader("Content-Type", proof.contentType);
    res.setHeader("Content-Disposition", "inline; filename=" + encodeURIComponent("comprovante-pagaai-" + proof._id + (proof.contentType === "application/pdf" ? ".pdf" : proof.contentType === "image/png" ? ".png" : ".jpg")));
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(proof.data);
  } catch { res.status(404).json({ error: "Comprovante público indisponível." }); }
});
app.get("/api/public/debts/:id/comments", async (req, res) => {
  try {
    const item = await DebtRequest.findOne({ _id: req.params.id, status: "paid" }).select("_id");
    if (!item) return res.status(404).json({ error: "Mural disponível somente após a quitação." });
    const comments = await PublicComment.find({ request: item._id, type: "testimonial", status: "approved" }).sort({ createdAt: 1 }).limit(100).lean();
    res.set("Cache-Control", "no-store").json(comments.map(c => ({ id: String(c._id), type: c.type, status: c.status, author: c.anonymous ? "Anônimo" : c.author, message: c.message, createdAt: c.createdAt })));
  } catch { res.status(404).json({ error: "Não foi possível carregar o mural." }); }
});
app.post("/api/my/debts/:id/testimonial", requireAuth, contributionLimiter, async (req, res) => {
  try {
    if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Apenas o beneficiário pode publicar um agradecimento." });
    const item = await DebtRequest.findOne({ _id: req.params.id, user: req.session.sub, status: "paid" }).select("_id");
    if (!item) return res.status(409).json({ error: "O agradecimento fica disponível somente após a quitação do seu pedido." });
    if (await PublicComment.exists({ request: item._id, type: "testimonial", status: { $in: ["pending", "approved"] } })) return res.status(409).json({ error: "Você já enviou um agradecimento para este pedido." });
    const message = String(req.body?.message || "").trim();
    const anonymous = req.body?.anonymous === true || req.body?.anonymous === "true";
    if (message.length < 8 || message.length > 600) return res.status(400).json({ error: "Escreva um agradecimento entre 8 e 600 caracteres." });
    const user = await User.findById(req.session.sub).select("fullName");
    const comment = await PublicComment.create({ request: item._id, type: "testimonial", author: user?.fullName || "Beneficiário", anonymous, message, status: "pending" });
    await notifyAdmins({ type: "testimonial", title: "Novo agradecimento para moderar", body: (user?.fullName || "Um beneficiário") + " enviou um agradecimento.", url: "/admin#pa-admin-comments", entityId: String(comment._id) });
    res.status(201).json({ ok: true, id: String(comment._id), message: "Agradecimento enviado para moderação. Ele aparecerá no mural após aprovação." });
  } catch (error) { console.error("testimonial:", error.message); res.status(400).json({ error: "Não foi possível enviar o agradecimento." }); }
});
app.get("/api/admin/comments", requireAuth, requireAdmin, async (_req, res) => {
  const comments = await PublicComment.find({ type: "testimonial", status: { $in: ["pending", "hidden"] } }).populate("request", "category status").sort({ createdAt: 1 }).limit(300).lean();
  res.json(comments.map(c => ({ id: String(c._id), requestId: String(c.request?._id || ""), category: c.request?.category || "", type: c.type, author: c.anonymous ? "Anônimo" : c.author, message: c.message, createdAt: c.createdAt })));
});
app.patch("/api/admin/comments/:id", requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["approved", "hidden"].includes(status)) return res.status(400).json({ error: "Ação de moderação inválida." });
  const comment = await PublicComment.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!comment) return res.status(404).json({ error: "Mensagem não encontrada." });
  res.json({ ok: true, status: comment.status });
});
app.delete("/api/admin/comments/:id", requireAuth, requireAdmin, async (req, res) => {
  const deleted = await PublicComment.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Mensagem não encontrada." });
  res.json({ ok: true });
});
app.get("/api/admin/payment-settings", requireAuth, requireAdmin, async (_req, res) => {
  res.set("Cache-Control", "no-store").json(await getPaymentSettings());
});
app.patch("/api/admin/payment-settings", requireAuth, requireAdmin, async (req, res) => {
  const raw = String(req.body?.asaasPixProcessingFee ?? "").trim().replace(",", ".");
  const fee = Number(raw);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100 || Math.round(fee * 100) !== fee * 100) return res.status(400).json({ error: "Informe uma tarifa entre R$ 0,00 e R$ 100,00, com até duas casas decimais." });
  const settings = await PlatformSettings.findOneAndUpdate({ key: "payments" }, { $set: { asaasPixProcessingFee: Math.round(fee * 100) / 100, updatedBy: req.session.sub } }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  res.set("Cache-Control", "no-store").json({ ok: true, asaasPixProcessingFee: settings.asaasPixProcessingFee, message: "Custo operacional atualizado. Novos Pix usarão este valor." });
});
app.get("/api/admin/platform-support", requireAuth, requireAdmin, async (_req, res) => { const items = await PlatformSupport.find().sort({ createdAt: -1 }).limit(500).lean(); res.json(items.map(x => ({ id: String(x._id), amount: x.amount, donorName: x.anonymous ? "Anônimo" : x.donorName, status: x.status, asaasPaymentId: x.asaasPaymentId, createdAt: x.createdAt }))); });
app.get("/api/admin/contributions", requireAuth, requireAdmin, async (_req, res) => {
  const items = await Contribution.find().populate("request", "category amount").sort({ createdAt: -1 }).limit(500).lean();
  res.json(items.map(x => ({ id: String(x._id), requestId: String(x.request?._id || ""), category: x.request?.category || "", goal: x.request?.amount || 0, amount: x.amount, processingFee: x.processingFee || 0, donorName: x.anonymous ? "Anônimo" : x.donorName, donorType: x.donorType, anonymous: x.anonymous, status: x.status, method: x.method, asaasPaymentId: x.asaasPaymentId, createdAt: x.createdAt })));
});
app.post("/api/admin/requests/:id/mark-paid", requireAuth, requireAdmin, upload.single("proof"), async (req, res) => {
  let proof;
  try {
    if (!req.file || !hasValidFileSignature(req.file)) return res.status(400).json({ error: "Anexe o comprovante de pagamento já rasurado em PDF, JPG ou PNG." });
    const item = await DebtRequest.findOne({ _id: req.params.id, status: "awaiting_payment" });
    if (!item) return res.status(409).json({ error: "O pedido precisa estar aguardando pagamento para ser concluído." });
    proof = await PublicProof.create({ request: item._id, filename: path.basename(req.file.originalname).slice(0, 140), contentType: req.file.mimetype, size: req.file.size, data: req.file.buffer });
    item.publicProof = proof._id;
    item.status = "paid";
    item.adminNote = "Pagamento confirmado pela equipe PagaAi.";
    item.reviewedBy = req.session.sub;
    item.reviewedAt = new Date();
    await item.save();
    res.json({ ok: true, message: "Pagamento marcado como concluído. O comprovante enviado será exibido publicamente." });
  } catch (error) {
    if (proof) await PublicProof.deleteOne({ _id: proof._id }).catch(() => {});
    console.error("mark paid:", error.message);
    res.status(400).json({ error: "Não foi possível concluir o pagamento." });
  }
});
app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [users, requests, byStatus, paid, receivedTotals, supportTotals] = await Promise.all([
    User.countDocuments({ role: "beneficiary" }), DebtRequest.countDocuments(),
    DebtRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    DebtRequest.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, amount: { $sum: "$amount" }, people: { $addToSet: "$user" }, count: { $sum: 1 } } }]),
    Contribution.aggregate([{ $match: { status: "received" } }, { $group: { _id: null, amount: { $sum: "$amount" }, processingFees: { $sum: "$processingFee" }, count: { $sum: 1 } } }]),
    PlatformSupport.aggregate([{ $match: { status: "received" } }, { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } }])
  ]);
  const counts = Object.fromEntries(byStatus.map(x => [x._id, x.count]));
  const settled = paid[0] || { amount: 0, people: [], count: 0 };
  const received = receivedTotals[0] || { amount: 0, count: 0 };
  res.set("Cache-Control", "no-store").json({ users, requests, pending: counts.pending_review || 0, needsMoreInfo: counts.needs_more_info || 0, approved: counts.approved || 0, rejected: counts.rejected || 0, paid: counts.paid || 0, amountHelped: settled.amount, peopleHelped: settled.people.length, paidRequests: settled.count, receivedAmount: received.amount, receivedContributions: received.count, processingFeesReceived: received.processingFees || 0, platformSupportAmount: supportTotals[0]?.amount || 0, platformSupportCount: supportTotals[0]?.count || 0 });
});
app.post("/api/admin/reset", requireAuth, requireAdmin, async (req, res) => {
  if (String(req.body?.confirmation || "") !== "ZERAR PAGAAI") {
    return res.status(400).json({ error: "Confirmação inválida. A limpeza não foi executada." });
  }
  try {
    const contributions = await Contribution.deleteMany({});
    const platformSupports = await PlatformSupport.deleteMany({});
    const comments = await PublicComment.deleteMany({});
    const notifications = await AdminNotification.deleteMany({});
    const proofs = await PublicProof.deleteMany({});
    const documents = await DebtDocument.deleteMany({});
    const requests = await DebtRequest.deleteMany({});
    const beneficiaries = await User.deleteMany({ role: "beneficiary" });
    const administratorsKept = await User.countDocuments({ role: "admin" });
    res.set("Cache-Control", "no-store").json({
      ok: true,
      message: "Sistema zerado. O acesso administrativo e as configurações foram preservados.",
      deleted: {
        beneficiaries: beneficiaries.deletedCount || 0,
        requests: requests.deletedCount || 0,
        documents: documents.deletedCount || 0,
        publicProofs: proofs.deletedCount || 0,
        contributions: contributions.deletedCount || 0,
        platformSupports: platformSupports.deletedCount || 0,
        comments: comments.deletedCount || 0,
        notifications: notifications.deletedCount || 0
      },
      administratorsKept
    });
  } catch (error) {
    console.error("admin system reset:", error.message);
    res.status(500).json({ error: "A limpeza foi interrompida por um erro no banco. Atualize o painel e confira os registros antes de tentar novamente." });
  }
});

app.get("/api/admin/phone-verifications", requireAuth, requireAdmin, async (_req, res) => {
  const users = await User.find({ role: "beneficiary", phoneVerified: false, phoneVerificationStatus: { $in: ["requested", "code_sent"] } })
    .select("fullName phone phoneVerificationStatus phoneVerificationRequestedAt phoneVerificationExpiresAt createdAt")
    .sort({ phoneVerificationRequestedAt: 1 }).limit(300).lean();
  res.json(users.map(user => ({ id: String(user._id), fullName: user.fullName, phone: user.phone, status: user.phoneVerificationStatus, requestedAt: user.phoneVerificationRequestedAt, expiresAt: user.phoneVerificationExpiresAt, createdAt: user.createdAt })));
});
app.post("/api/admin/users/:id/phone-verification-code", requireAuth, requireAdmin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: "beneficiary" }).select("+phoneVerificationCodeHash");
  if (!user) return res.status(404).json({ error: "Beneficiário não encontrado." });
  if (user.phoneVerified) return res.status(409).json({ error: "Este telefone já está confirmado." });
  if (!["requested", "code_sent"].includes(user.phoneVerificationStatus)) return res.status(409).json({ error: "O beneficiário ainda não solicitou a confirmação." });
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  user.phoneVerificationCodeHash = phoneVerificationHash(user._id, code);
  user.phoneVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.phoneVerificationStatus = "code_sent";
  user.phoneVerificationAttempts = 0;
  await user.save();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, code, phone: user.phone, fullName: user.fullName, expiresAt: user.phoneVerificationExpiresAt, message: "Código gerado. Envie pelo WhatsApp cadastrado; ele expira em 10 minutos." });
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await User.find({ role: "beneficiary" }).select("+cpf fullName phone phoneVerified city state createdAt").sort({ createdAt: -1 }).limit(500).lean();
  res.json(users.map(user => ({ id: String(user._id), fullName: user.fullName, cpf: user.cpf, phone: user.phone, phoneVerified: user.phoneVerified, city: user.city, state: user.state, createdAt: user.createdAt })));
});
app.get("/api/admin/requests", requireAuth, requireAdmin, async (_req, res) => {
  const items = await DebtRequest.find().populate("user", "+cpf fullName phone phoneVerified city state").sort({ createdAt: -1 }).limit(500).lean();
  res.json(items.map(item => ({
    id: String(item._id), userId: String(item.user?._id || ""), fullName: item.user?.fullName, cpf: item.user?.cpf || "", phone: item.user?.phone, phoneVerified: item.user?.phoneVerified,
    city: item.user?.city, state: item.user?.state, category: item.category, creditor: item.creditor, amount: item.amount,
    description: item.description, status: item.status, raisedAmount: item.raisedAmount || 0, remainingAmount: Math.max(0, item.amount - (item.raisedAmount || 0)), hasPublicProof: Boolean(item.publicProof), adminNote: item.adminNote, createdAt: item.createdAt, documentId: String(item.document)
  })));
});
app.get("/api/admin/documents/:id", requireAuth, requireAdmin, async (req, res) => {
  const doc = await DebtDocument.findById(req.params.id).select("+data");
  if (!doc) return res.status(404).json({ error: "Documento não encontrado." });
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Content-Disposition", (doc.contentType === "application/pdf" ? "attachment" : "inline") + "; filename=" + encodeURIComponent(doc.filename));
  res.setHeader("Cache-Control", "no-store"); res.send(doc.data);
});
app.patch("/api/admin/requests/:id", requireAuth, requireAdmin, async (req, res) => {
  const allowed = ["approved", "rejected", "needs_more_info"];
  const { status, note } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status inválido." });
  const existing = await DebtRequest.findById(req.params.id).populate("user", "phoneVerified");
  if (!existing) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (status === "approved" && !existing.user?.phoneVerified) return res.status(409).json({ error: "Confirme o telefone do beneficiário antes de aprovar e publicar o pedido." });
  if (status === "approved" && !["pending_review", "needs_more_info", "rejected"].includes(existing.status)) return res.status(409).json({ error: "Este pedido não pode voltar para aprovação nesta etapa." });
  existing.status = status;
  existing.adminNote = String(note || "").slice(0, 1000);
  existing.reviewedBy = req.session.sub;
  existing.reviewedAt = new Date();
  await existing.save();
  res.json({ ok: true, status: existing.status });
});
app.patch("/api/admin/users/:id/phone-verification", requireAuth, requireAdmin, async (req, res) => {
  if (req.body?.verified === true) return res.status(409).json({ error: "A confirmação deve ser feita pelo código enviado ao beneficiário." });
  const user = await User.findByIdAndUpdate(req.params.id, { phoneVerified: false, phoneVerificationStatus: "none", phoneVerificationCodeHash: undefined, phoneVerificationExpiresAt: null, phoneVerificationAttempts: 0 }, { new: true });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
  await DebtRequest.updateMany({ user: user._id, status: "approved" }, { $set: { status: "pending_review", adminNote: "Telefone precisa ser confirmado novamente." } });
  res.json({ ok: true, phoneVerified: user.phoneVerified });
});

app.use((error, _req, res, _next) => {
  console.error("Falha na requisição:", error.message);
  const tooLarge = error.code === "LIMIT_FILE_SIZE";
  res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? "O arquivo ultrapassa o limite de 5 MB." : error.message || "Não foi possível processar a solicitação." });
});
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error("Configure JWT_SECRET com pelo menos 32 caracteres."); process.exit(1); }
  if (!process.env.MONGODB_URI) { console.error("MONGODB_URI não configurada."); process.exit(1); }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    configureWebPush();
    console.log("MongoDB conectado.");
    if (process.env.ADMIN_CPF && process.env.ADMIN_PASSWORD && process.env.ADMIN_NAME) {
      const cpf = cleanCpf(process.env.ADMIN_CPF);
      if (!validCpf(cpf) || process.env.ADMIN_PASSWORD.length < 14) console.error("ADMIN_CPF inválido ou ADMIN_PASSWORD menor que 14 caracteres.");
      else {
        let admin = await User.findOne({ cpf }).select("+cpf +passwordHash");
        if (!admin) {
          await User.create({
            fullName: process.env.ADMIN_NAME, cpf, phone: normalizePhone(process.env.ADMIN_PHONE || "00000000000"),
            city: "Administração", state: "RO", role: "admin", phoneVerified: true,
            passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), termsAcceptedAt: new Date(), privacyNoticeVersion: "1.0"
          });
          console.log("Conta administrativa inicial criada.");
        } else if (admin.role !== "admin") { admin.role = "admin"; await admin.save(); }
      }
    } else console.warn("Configure ADMIN_NAME, ADMIN_CPF e ADMIN_PASSWORD no Render para criar o administrador.");
    app.listen(PORT, () => console.log("PagaAi disponível na porta " + PORT));
  } catch (error) { console.error("Falha ao iniciar PagaAi:", error.message); process.exit(1); }
}
start();