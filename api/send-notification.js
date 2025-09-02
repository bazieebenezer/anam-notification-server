const admin = require("firebase-admin");
const https = require("https");
const cors = require("cors");

// Initialize CORS middleware
const corsHandler = cors({
  origin: "*", // Allow all origins. For production, you might want to restrict this to your app's domain.
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

module.exports = (req, res) => {
  // Use the cors middleware
  corsHandler(req, res, async () => {
    // Handle preflight request
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
      // Initialize Firebase Admin SDK inside the handler
      if (admin.apps.length === 0) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      const { title, description, recipientId } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Missing title or description" });
      }

      const db = admin.firestore();
      let playerIds = [];

      if (recipientId && recipientId !== "all") {
        const userDoc = await db.collection("users").doc(recipientId).get();
        if (userDoc.exists && userDoc.data().oneSignalPlayerId) {
          playerIds.push(userDoc.data().oneSignalPlayerId);
        }
      } else {
        const usersSnapshot = await db.collection("users").get();
        usersSnapshot.forEach((doc) => {
          if (doc.data().oneSignalPlayerId) {
            playerIds.push(doc.data().oneSignalPlayerId);
          }
        });
      }

      if (playerIds.length === 0) {
        return res.status(200).json({ message: "No subscribed players to notify." });
      }

      playerIds = [...new Set(playerIds)];

      const oneSignalRequest = {
        app_id: "a301deef-9c27-47b2-8f7f-a1b7ee7889ee",
        contents: { en: description },
        headings: { en: title },
        include_player_ids: playerIds,
      };

      const options = {
        hostname: "onesignal.com",
        port: 443,
        path: "/api/v1/notifications",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Basic ${process.env.ONESIGNAL_API_KEY}`,
        },
      };

      const request = https.request(options, (response) => {
        let data = "";
        response.on("data", (chunk) => (data += chunk));
        response.on("end", () => {
          res.status(response.statusCode).json(JSON.parse(data));
        });
      });

      request.on("error", (error) => {
        console.error("Error sending OneSignal notification:", error);
        res.status(500).json({ error: "Failed to send notification" });
      });

      request.write(JSON.stringify(oneSignalRequest));
      request.end();

    } catch (error) {
      console.error("Internal server error:", error);
      // Ensure CORS headers are set even on error
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(500).json({ error: "An internal server error occurred." });
    }
  });
};
