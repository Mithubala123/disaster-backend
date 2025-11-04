// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const compression = require("compression");
const path = require("path");
const cors = require("cors");
const { body, validationResult, param, query } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_IMAGE_BYTES = parseInt(process.env.MAX_IMAGE_BYTES || "2000000", 10);

if (!MONGO_URI) {
  console.error("Missing MONGO_URI in .env");
  process.exit(1);
}

app.use(compression());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Mongo Connection ----------
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB error", err);
    process.exit(1);
  });

// ---------- Schema ----------
const pinSchema = new mongoose.Schema({
  title: { type: String, default: "" },
  mainCategory: {
    type: String,
    enum: ["Hazard", "Impact", "Resource", "Alert"],
    required: true,
  },
  subType: {
    type: String,
    enum: [
      "Fire","Flood","Earthquake","Chemical Leak","Landslide","Storm",
      "Injury","Damage","Power Outage","Blocked Road",
      "Shelter","Medical Aid","Food/Water","Rescue Team",
      "Evacuation","Missing Person","Verified Info","Safety Tip"
    ],
    required: true,
  },
  status: { type: String, default: "Active" },
  votes: { type: Number, default: 0 },
  imageData: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
});
pinSchema.index({ location: "2dsphere" });
const Pin = mongoose.model("Pin", pinSchema);

// ---------- Helpers ----------
function sanitizeImageBase64(base64) {
  if (!base64) return null;
  if (typeof base64 !== "string") return null;
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) return null;
  return base64;
}

// ---------- Routes ----------

// GET /api/pins
app.get(
  "/api/pins",
  [
    query("page").optional().toInt(),
    query("limit").optional().toInt(),
    query("mainCategory").optional().isString(),
    query("subType").optional().isString(),
  ],
  async (req, res) => {
    try {
      const page = Math.max(1, req.query.page || 1);
      const limit = Math.min(500, req.query.limit || 200);
      const skip = (page - 1) * limit;
      const q = {};
      if (req.query.mainCategory) q.mainCategory = req.query.mainCategory;
      if (req.query.subType) q.subType = req.query.subType;

      const [pins, total] = await Promise.all([
        Pin.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Pin.countDocuments(q),
      ]);

      res.json({ pins, page, limit, total });
    } catch (err) {
      console.error("GET /api/pins", err);
      res.status(500).json({ error: "Failed to retrieve pins" });
    }
  }
);

// Nearby pins
app.get(
  "/api/pins/near",
  [
    query("lng").exists().isFloat(),
    query("lat").exists().isFloat(),
    query("maxDistance").optional().toInt(),
  ],
  async (req, res) => {
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const maxDistance = Math.min(parseInt(req.query.maxDistance || 50000, 10), 200000);

    try {
      const pins = await Pin.find({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: maxDistance,
          },
        },
      }).limit(200);
      res.json(pins);
    } catch (err) {
      console.error("nearby", err);
      res.status(500).json({ error: "Failed proximity search" });
    }
  }
);

// ---------- CREATE PIN ----------
app.post(
  "/api/pins",
  [
    body("mainCategory").exists().isString(),
    body("subType").exists().isString(),
    body("location").exists(),  
    body("location.coordinates").isArray({ min: 2, max: 2 }),
    body("location.coordinates.*").isFloat(),
    body("title").optional().isString().isLength({ max: 100 }),
    body("imageData").optional({ nullable: true }),
  ],
  async (req, res) => {
    console.log("Received POST /api/pins", req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { mainCategory, subType, title, location, imageData } = req.body;
      const sanitizedImage = sanitizeImageBase64(imageData);

      // Fix coordinate order: ensure [lng, lat]
      const [lng, lat] = location.coordinates;
      const pin = new Pin({
        mainCategory,
        subType,
        title: title || "",
        imageData: sanitizedImage,
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
      });

      await pin.save();
      console.log("Pin saved:", pin._id);
      res.json(pin);
    } catch (err) {
      console.error("Error creating pin:", err);
      res.status(500).json({ error: "Server error creating pin" });
    }
  }
);

// Vote (up/down)
app.patch(
  "/api/pins/:id/vote",
  [param("id").isMongoId(), body("vote").isInt({ min: -1, max: 1 })],
  async (req, res) => {
    const id = req.params.id;
    const { vote } = req.body;
    if (![1, -1].includes(Number(vote)))
      return res.status(400).json({ error: "vote must be 1 or -1" });

    try {
      const pin = await Pin.findByIdAndUpdate(id, { $inc: { votes: vote } }, { new: true });
      if (!pin) return res.status(404).json({ error: "Pin not found" });
      res.json(pin);
    } catch (err) {
      console.error("vote", err);
      res.status(500).json({ error: "Server error updating vote" });
    }
  }
);

// Delete pin
app.delete("/api/pins/:id", [param("id").isMongoId()], async (req, res) => {
  try {
    const result = await Pin.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: "Pin not found" });
    res.json({ message: "deleted" });
  } catch (err) {
    console.error("delete", err);
    res.status(500).json({ error: "Server error deleting pin" });
  }
});

// Summary endpoint
app.get("/api/summary", async (req, res) => {
  try {
    const all = await Pin.find();
    const summary = all.reduce(
      (acc, p) => {
        acc.total++;
        acc.byMain[p.mainCategory] = (acc.byMain[p.mainCategory] || 0) + 1;
        acc.bySub[p.subType] = (acc.bySub[p.subType] || 0) + 1;
        acc.votesTotal += p.votes || 0;
        return acc;
      },
      { total: 0, byMain: {}, bySub: {}, votesTotal: 0 }
    );

    res.json({
      totalPins: summary.total,
      byMainCategory: summary.byMain,
      bySubType: summary.bySub,
      avgVotes: summary.total ? summary.votesTotal / summary.total : 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute summary" });
  }
});

// ---------- SPA fallback ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
