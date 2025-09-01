const admin = require("firebase-admin");
const https = require("https");

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("Failed to initialize Firebase Admin SDK:", e.message);
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
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
    res.status(500).json({ error: "An internal server error occurred." });
  }
};
