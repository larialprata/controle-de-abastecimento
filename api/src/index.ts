import express from "express";
import cors from "cors";
import { envValidated } from "./config";
import adminRouter from "./routes/admin";
import obrasRouter from "./routes/obras";
import authRouter from "./routes/auth";
import movimentacoesRouter from "./routes/movimentacoes";
import equipamentosRouter from "./routes/equipamentos";
import mobileErrorsRouter from "./routes/mobileErrors";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

// Log básico de requests para facilitar debug no terminal.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.log(`[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    melosa_db_columns: "ativo_melosa_texto,ativo_equipamento_texto",
  }),
);

app.use("/v1/admin", adminRouter);
app.use("/v1", obrasRouter);
app.use("/v1", authRouter);
app.use("/v1", movimentacoesRouter);
app.use("/v1", equipamentosRouter);
app.use("/v1", mobileErrorsRouter);

// Tratador global de erros (caso algum erro escape de try/catch).
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("[API] Unhandled error:", err);
  return res.status(500).json({ error: "Internal server error" });
});

app.listen(envValidated.PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`API running on 0.0.0.0:${envValidated.PORT}`);
});

