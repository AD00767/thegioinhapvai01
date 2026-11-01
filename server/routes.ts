import { Router } from "express";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
// Import Supabase client thay cho Firebase
import { supabase } from "./supabase"; 

const router = Router();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Middleware to check authentication using Supabase JWT
const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Missing Token" });
  }

  const token = authHeader.split('Bearer ')[1];
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: "Unauthorized: Invalid Token" });
    }
    
    req.user = user; // Supabase user object uses .id instead of .uid
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized: Verification failed" });
  }
};

const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data: userDoc } = await supabase
      .from("users")
      .select("role")
      .eq("id", req.user.id)
      .single();

    if (!userDoc || userDoc.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const requireCreator = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { data: userDoc } = await supabase
      .from("users")
      .select("creatorStatus")
      .eq("id", req.user.id)
      .single();

    if (!userDoc || userDoc.creatorStatus !== true) {
      return res.status(403).json({ error: "Forbidden - Creator status required" });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

// ==========================================
// MIGRATION (Adapted for Supabase)
// ==========================================
router.get("/migrate-ids", async (req: any, res) => {
  try {
    async function generateAdminUniqueId(objectType: string, objectReference: string): Promise<string> {
      let uniqueId = '';
      let isUnique = false;
      
      while (!isUnique) {
        uniqueId = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        
        // Trong PostgreSQL thực tế nên dùng Sequence, nhưng ở đây mô phỏng lại logic Firebase cũ của bạn
        const { data: existingId } = await supabase.from('global_ids').select('numericId').eq('numericId', uniqueId).single();
        
        if (!existingId) {
          const { error } = await supabase.from('global_ids').insert({
            numericId: uniqueId,
            objectType: objectType,
            objectReference: objectReference,
            status: 'reserved',
            createdAt: new Date().toISOString()
          });

          if (!error) {
            isUnique = true;
            await supabase.from('audit_logs').insert({
              action: 'ID_RESERVED',
              numericId: uniqueId,
              objectType: objectType,
              objectReference: objectReference,
              createdAt: new Date().toISOString(),
              systemAction: true
            });
          }
        }
      }
      return uniqueId;
    }

    // Migrate Users
    console.log("Migrating users...");
    const { data: users } = await supabase.from("users").select("id, numericId");
    if (users) {
      for (const u of users) {
        if (!u.numericId) {
          const nid = await generateAdminUniqueId("user", u.id);
          await supabase.from("users").update({ numericId: nid }).eq("id", u.id);
        }
      }
    }

    // Migrate Characters
    console.log("Migrating characters...");
    const { data: chars } = await supabase.from("characters").select("id, numericId");
    if (chars) {
      for (const c of chars) {
        if (!c.numericId) {
          const nid = await generateAdminUniqueId("character", c.id);
          await supabase.from("characters").update({ numericId: nid }).eq("id", c.id);
        }
      }
    }

    // Migrate Prompts
    console.log("Migrating prompts...");
    const { data: prompts } = await supabase.from("prompts").select("id, numericId");
    if (prompts) {
      for (const p of prompts) {
        if (!p.numericId) {
          const nid = await generateAdminUniqueId("prompt", p.id);
          await supabase.from("prompts").update({ numericId: nid }).eq("id", p.id);
        }
      }
    }

    res.json({ success: true, message: "Migration complete" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// AUTH
// ==========================================
router.post("/auth/login/google", requireAuth, async (req: any, res) => {
  try {
    const uid = req.user.id; // Supabase dùng id thay vì uid
    const { data: userDoc } = await supabase.from("users").select("*").eq("id", uid).single();

    if (!userDoc) {
      // First time login
      const newUser = {
        id: uid,
        email: req.user.email,
        displayName: req.user.user_metadata?.full_name || req.user.user_metadata?.name || "User " + uid.substring(0, 5),
        avatar: req.user.user_metadata?.avatar_url || req.user.user_metadata?.picture || "",
        bio: "",
        socialLinks: {},
        role: "USER",
        creatorStatus: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await supabase.from("users").insert(newUser);
      
      await supabase.from("activity_logs").insert({
        userId: uid,
        action: "Account creation",
        createdAt: new Date().toISOString()
      });
      
      return res.json({ success: true, user: newUser });
    } else {
      await supabase.from("activity_logs").insert({
        userId: uid,
        action: "Login",
        createdAt: new Date().toISOString()
      });
      return res.json({ success: true, user: userDoc });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to login" });
  }
});

router.get("/auth/me", requireAuth, async (req: any, res) => {
  try {
    const { data: userDoc } = await supabase.from("users").select("*").eq("id", req.user.id).single();
    if (!userDoc) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user: userDoc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
// USER
// ==========================================
router.patch("/users/me", requireAuth, async (req: any, res) => {
  try {
    const schema = z.object({
      displayName: z.string().max(50).optional(),
      bio: z.string().max(600).optional(),
      avatar: z.string().optional(),
      socialLinks: z.record(z.string(), z.string()).optional()
    });
    
    const data = schema.parse(req.body);
    
    await supabase.from("users").update({
      ...data,
      updatedAt: new Date().toISOString()
    }).eq("id", req.user.id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Validation error" });
  }
});

// ==========================================
// CHARACTER
// ==========================================
router.get("/characters", async (req, res) => {
  try {
    const { data: characters, error } = await supabase
      .from("characters")
      .select("*")
      .is("deletedAt", null)
      .order("createdAt", { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ success: true, data: characters });
  } catch (err) {
    console.error("Failed to fetch characters", err);
    res.status(500).json({ error: "Failed to fetch characters" });
  }
});

router.post("/characters", requireCreator, async (req: any, res) => {
  try {
    const schema = z.object({
      name: z.string().max(50),
      avatar: z.string(),
      gender: z.string(),
      slogan: z.string().max(700),
      plot: z.string(),
      link: z.string().url().refine(val => val.includes("aistudio.google.com"), { message: "Must be a Google AI Studio link" }),
      tags: z.array(z.string().max(30)).max(6).optional()
    });
    const data = schema.parse(req.body);
    const timestamp = new Date().toISOString();
    
    const charData = {
      ...data,
      creatorId: req.user.id,
      viewsCount: 0,
      likesCount: 0,
      savesCount: 0,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    const { data: insertedChar, error } = await supabase.from("characters").insert(charData).select().single();
    if (error) throw error;
    
    // Process tags (upsert logically)
    if (data.tags) {
       for(const tag of data.tags) {
          const lowerTag = tag.toLowerCase();
          const { data: existingTag } = await supabase.from("tags").select("usageCount").eq("id", lowerTag).single();
          if (existingTag) {
            await supabase.from("tags").update({ usageCount: existingTag.usageCount + 1 }).eq("id", lowerTag);
          } else {
            await supabase.from("tags").insert({ id: lowerTag, name: tag, usageCount: 1 });
          }
       }
    }
    
    res.json({ success: true, data: insertedChar });
  } catch (err: any) {
    res.status(400).json({ error: "Validation error", details: err.errors });
  }
});

// ==========================================
// SEARCH & AI SEARCH (Unchanged mostly, just removes Firebase ties)
// ==========================================
router.post("/ai-search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });

    const rawQuery = query.trim();

    // Use Gemini to parse the query into structured criteria
    const prompt = `
    You are an intelligent search query parser for "Thế giới nhập vai_AD" - a Google AI Studio Roleplay community platform.
    Analyze the user's natural language search query in Vietnamese or English.
    Extract the search intent into a structured JSON object with the following fields:
    - type: "character" | "prompt" | "creator" | "all" (e.g. if searching for "nữ chính", "nhân vật", "ma cà rồng" -> "character"; if "prompt viết văn", "câu lệnh" -> "prompt"; if "tác giả", "người tạo" -> "creator"; else "all")
    - tags: string[] (relevant thematic genres, tags e.g. ["Học đường", "Hiện đại", "Fantasy", "Anime", "Huyền huyễn", "Kinh dị", "Trinh thám"])
    - gender: "Nam" | "Nữ" | "Khác" | null (only if gender intent is explicitly indicated)
    - keywords: string[] (key semantic nouns, adjectives, or character attributes without filler words)
    - summary: string (a short 1-sentence friendly explanation in Vietnamese of what user is looking for)

    User Query: "${rawQuery}"
    
    Respond ONLY with valid JSON.
    `;

    let criteria: any = null;
    
    if (process.env.GEMINI_API_KEY) {
      const candidateModels = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"];
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          });
          if (response?.text) {
            criteria = JSON.parse(response.text);
            break;
          }
        } catch (err: any) {
          continue;
        }
      }
    }

    // Fallback if Gemini models were unavailable or API key not present
    if (!criteria || typeof criteria !== "object") {
      const lower = rawQuery.toLowerCase();
      let type: 'character' | 'prompt' | 'creator' | 'all' = 'all';
      let gender: string | null = null;
      const tags: string[] = [];

      if (/(\bprompt\b|\bcâu lệnh\b|\blời nhắc\b|\bviết rp\b|\bwriting\b)/i.test(lower)) {
        type = 'prompt';
      } else if (/(\bcreator\b|\btác giả\b|\bngười tạo\b|\buser\b|\bauthor\b)/i.test(lower)) {
        type = 'creator';
      } else if (/(\bcharacter\b|\bnhân vật\b|\bnữ chính\b|\bnam chính\b|\bphản diện\b|\bbot\b)/i.test(lower)) {
        type = 'character';
      }

      if (/\b(nữ|nữ chính|cô gái|female|girl)\b/i.test(lower)) {
        gender = 'Nữ';
      } else if (/\b(nam|nam chính|chàng trai|male|boy)\b/i.test(lower)) {
        gender = 'Nam';
      }

      const commonTags = ['hiện đại', 'cổ đại', 'học đường', 'fantasy', 'kinh dị', 'trinh thám', 'anime', 'huyền huyễn', 'tổng tài', 'tiên hiệp', 'scifi', 'khoa học viễn tưởng', 'hài hước', 'tình cảm'];
      for (const ct of commonTags) {
        if (lower.includes(ct)) {
          tags.push(ct.charAt(0).toUpperCase() + ct.slice(1));
        }
      }

      const stopWords = new Set(['tìm', 'kiếm', 'cho', 'tôi', 'những', 'các', 'một', 'nhân', 'vật', 'prompt', 'creator', 'và', 'là', 'về', 'trong', 'với', 'hãy']);
      const words = rawQuery
        .split(/[\s,.;:!?/\\-]+/)
        .filter((w: string) => w.length > 1 && !stopWords.has(w.toLowerCase()));

      criteria = {
        type,
        gender,
        tags,
        keywords: words.length > 0 ? words : [rawQuery],
        summary: `Tìm kiếm nội dung phù hợp với "${rawQuery}"`
      };
    }
    
    res.json({ success: true, parsedCriteria: criteria });
  } catch (err) {
    console.error("AI Search route error:", err);
    res.status(500).json({ error: "AI Search failed" });
  }
});

export default router;
