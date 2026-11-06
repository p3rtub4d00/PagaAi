require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const debtSchema = new mongoose.Schema({
  applicantName: { type: String, required: true, trim: true, maxlength: 100 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, required: true, trim: true, uppercase: true, maxlength: 2 },
  category: { type: String, required: true, enum: ["Energia Elétrica", "Água", "Aluguel", "Tratamento Médico", "Alimentação", "Educação", "Outro"] },
  amount: { type: Number, required: true, min: 1, max: 1000000 },
  description: { type: String, trim: true, maxlength: 1200, default: "" },
  status: { type: String, enum: ["pending", "verified", "funded", "rejected"], default: "pending" }
}, { timestamps: true });

const DebtRequest = mongoose.models.DebtRequest || mongoose.model("DebtRequest", debtSchema);

app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
}));

app.post("/api/debts", async (req, res) => {
  try {
    const { applicantName, city, state, category, amount, description } = req.body || {};
    if (!applicantName || !city || !state || !category || !Number.isFinite(Number(amount))) {
      return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    }
    if (String(state).trim().length !== 2) return res.status(400).json({ error: "Informe a sigla do estado." });
    const debt = await DebtRequest.create({
      applicantName, city, state, category, amount: Number(amount), description
    });
    return res.status(201).json({ message: "Solicitação recebida.", id: debt._id });
  } catch (error) {
    console.error("Erro ao criar solicitação:", error.message);
    return res.status(400).json({ error: "Não foi possível registrar a solicitação." });
  }
});

app.get("/api/debts", async (_req, res) => {
  try {
    const debts = await DebtRequest.find({ status: { $in: ["verified", "pending"] } })
      .select("city state category amount status createdAt")
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json(debts);
  } catch (error) {
    console.error("Erro ao consultar solicitações:", error.message);
    res.status(503).json({ error: "Serviço temporariamente indisponível." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("MongoDB conectado.");
    } catch (error) {
      console.error("Falha ao conectar ao MongoDB:", error.message);
    }
  } else {
    console.warn("MONGODB_URI não configurada. API de solicitações ficará indisponível.");
  }
  app.listen(PORT, () => console.log(`PagaAi disponível na porta ${PORT}`));
}

start();
