import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import apiRoutes from "./server/routes"; // Đảm bảo trong routes cũng đã bỏ Firebase
import rateLimit from "express-rate-limit";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Trust the first proxy in front of the server (needed for X-Forwarded-For)
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(express.json());

  // Security - Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per 15 minutes
    standardHeaders: true, 
    legacyHeaders: false, 
    validate: { default: false }, 
  });
  app.use("/api", limiter);

  // Authentication Middleware (Đã gỡ Firebase - Nếu cần xác thực API, dùng Supabase JWT Verification ở đây)
  app.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      // Tích hợp logic verify JWT của Supabase tại đây nếu API của bạn yêu cầu bảo mật
      (req as any).token = token;
    }
    next();
  });

  // API Routes
  app.use("/api", apiRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong! Please try again later." });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
