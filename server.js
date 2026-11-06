require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = "pagaai_session";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const categories = ["Energia Elétrica", "Água", "Aluguel", "Tratamento Médico", "Alimentação", "Educação", "Outro"];
const states = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
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
  status: { type: String, enum: ["pending_review", "needs_more_info", "approved", "rejected", "paid"], default: "pending_review", index: true },
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
  data: { type: Buffer, required: true, select: false }
}, { timestamps: true });

const User = mongoose.models.PagaAiUser || mongoose.model("PagaAiUser", userSchema);
const DebtRequest = mongoose.models.PagaAiDebtRequest || mongoose.model("PagaAiDebtRequest", requestSchema);
const DebtDocument = mongoose.models.PagaAiDocument || mongoose.model("PagaAiDocument", documentSchema);

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
  return { id: String(user._id), fullName: user.fullName, phone: user.phone, phoneVerified: user.phoneVerified, city: user.city, state: user.state, role: user.role, createdAt: user.createdAt };
}
function publicRequest(item) {
  return { id: String(item._id), city: item.user?.city || "", state: item.user?.state || "", category: item.category, amount: item.amount, description: item.description, status: item.status, createdAt: item.createdAt };
}

app.get("/api/health", (_req, res) => res.json({
  status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  uploads: "private-mongodb", phoneVerification: "manual-admin-review"
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
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" }); res.json({ ok: true });
});
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.sub);
  if (!user || !user.active) return res.status(401).json({ error: "Conta indisponível." });
  res.json({ user: publicUser(user) });
});

app.post("/api/debts", requireAuth, upload.single("document"), async (req, res) => {
  let createdDoc = null, createdRequest = null;
  try {
    if (req.session.role !== "beneficiary") return res.status(403).json({ error: "Somente beneficiários podem cadastrar pedidos." });
    const { category, creditor, amount, dueDate, description } = req.body || {};
    const value = Number(String(amount || "").replace(",", "."));
    if (!categories.includes(category) || !Number.isFinite(value) || value < 1 || value > 1000000 || !req.file) {
      return res.status(400).json({ error: "Informe a categoria, um valor válido e anexe o comprovante da dívida." });
    }
    if (!hasValidFileSignature(req.file)) return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a PDF, JPG ou PNG válido." });
    const user = await User.findById(req.session.sub);
    if (!user) return res.status(401).json({ error: "Conta não encontrada." });
    const duplicate = await DebtRequest.findOne({ user: user._id, category, amount: value, status: { $in: ["pending_review", "needs_more_info", "approved"] } });
    if (duplicate) return res.status(409).json({ error: "Você já possui uma solicitação semelhante em análise ou aprovada. Consulte seu painel." });
    createdRequest = await DebtRequest.create({ user: user._id, category, creditor, amount: value, dueDate: dueDate ? new Date(dueDate) : null, description, document: new mongoose.Types.ObjectId() });
    createdDoc = await DebtDocument.create({
      _id: createdRequest.document, request: createdRequest._id, owner: user._id,
      filename: path.basename(req.file.originalname).slice(0, 140), contentType: req.file.mimetype,
      size: req.file.size, data: req.file.buffer
    });
    res.status(201).json({ id: createdRequest._id, status: createdRequest.status, message: "Pedido enviado. Ele ficará privado enquanto aguarda análise documental." });
  } catch (error) {
    if (createdDoc) await DebtDocument.deleteOne({ _id: createdDoc._id }).catch(() => {});
    if (createdRequest) await DebtRequest.deleteOne({ _id: createdRequest._id }).catch(() => {});
    console.error("create debt:", error.message);
    res.status(400).json({ error: error.message?.includes("File too large") ? "O arquivo ultrapassa o limite de 5 MB." : error.message || "Não foi possível registrar a solicitação." });
  }
});
app.get("/api/debts", async (_req, res) => {
  try {
    const items = await DebtRequest.find({ status: "approved" }).populate("user", "city state").sort({ createdAt: -1 }).limit(50).lean();
    res.json(items.map(publicRequest));
  } catch (error) { console.error("public debts:", error.message); res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
});
app.get("/api/my/debts", requireAuth, async (req, res) => {
  const items = await DebtRequest.find({ user: req.session.sub }).sort({ createdAt: -1 }).lean();
  res.json(items.map(item => ({ id: String(item._id), category: item.category, creditor: item.creditor, amount: item.amount, status: item.status, adminNote: item.adminNote, createdAt: item.createdAt })));
});

app.post("/api/my/debts/:id/complement", requireAuth, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Anexe o novo comprovante." });
    if (!hasValidFileSignature(req.file)) return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a PDF, JPG ou PNG válido." });
    const item = await DebtRequest.findOne({ _id: req.params.id, user: req.session.sub, status: "needs_more_info" });
    if (!item) return res.status(404).json({ error: "Solicitação não encontrada ou não está aguardando complemento." });
    const replacement = await DebtDocument.create({
      request: item._id, owner: req.session.sub, filename: path.basename(req.file.originalname).slice(0, 140),
      contentType: req.file.mimetype, size: req.file.size, data: req.file.buffer
    });
    const previousId = item.document;
    item.document = replacement._id;
    item.status = "pending_review";
    item.adminNote = "";
    item.reviewedBy = null;
    item.reviewedAt = null;
    await item.save();
    await DebtDocument.deleteOne({ _id: previousId });
    res.json({ ok: true, message: "Novo comprovante enviado. A solicitação voltou para análise." });
  } catch (error) {
    console.error("complement:", error.message);
    res.status(400).json({ error: error.message || "Não foi possível enviar o complemento." });
  }
});
app.get("/api/admin/requests", requireAuth, requireAdmin, async (_req, res) => {
  const items = await DebtRequest.find().populate("user", "fullName phone phoneVerified city state").sort({ createdAt: -1 }).limit(200).lean();
  res.json(items.map(item => ({
    id: String(item._id), userId: String(item.user?._id || ""), fullName: item.user?.fullName, phone: item.user?.phone, phoneVerified: item.user?.phoneVerified,
    city: item.user?.city, state: item.user?.state, category: item.category, creditor: item.creditor, amount: item.amount,
    description: item.description, status: item.status, adminNote: item.adminNote, createdAt: item.createdAt, documentId: String(item.document)
  })));
});
app.get("/api/admin/documents/:id", requireAuth, requireAdmin, async (req, res) => {
  const doc = await DebtDocument.findById(req.params.id).select("+data");
  if (!doc) return res.status(404).json({ error: "Documento não encontrado." });
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Content-Disposition", "inline; filename=" + encodeURIComponent(doc.filename));
  res.setHeader("Cache-Control", "no-store"); res.send(doc.data);
});
app.patch("/api/admin/requests/:id", requireAuth, requireAdmin, async (req, res) => {
  const allowed = ["approved", "rejected", "needs_more_info"];
  const { status, note } = req.body || {};
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status inválido." });
  const existing = await DebtRequest.findById(req.params.id).populate("user", "phoneVerified");
  if (!existing) return res.status(404).json({ error: "Solicitação não encontrada." });
  if (status === "approved" && !existing.user?.phoneVerified) return res.status(409).json({ error: "Confirme o telefone do beneficiário antes de aprovar e publicar o pedido." });
  existing.status = status;
  existing.adminNote = String(note || "").slice(0, 1000);
  existing.reviewedBy = req.session.sub;
  existing.reviewedAt = new Date();
  await existing.save();
  res.json({ ok: true, status: existing.status });
});
app.patch("/api/admin/users/:id/phone-verification", requireAuth, requireAdmin, async (req, res) => {
  const verified = Boolean(req.body?.verified);
  const user = await User.findByIdAndUpdate(req.params.id, { phoneVerified: verified }, { new: true });
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
  if (!verified) await DebtRequest.updateMany({ user: user._id, status: "approved" }, { $set: { status: "pending_review", adminNote: "Telefone precisa ser confirmado novamente." } });
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