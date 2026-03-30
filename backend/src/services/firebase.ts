import admin from "firebase-admin";
import { GoogleAuth } from "google-auth-library";

let initialized = false;

export function initFirebase(): void {
  if (initialized) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    console.warn(
      "[Firebase] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled"
    );
    return;
  }

  try {
    const sa = JSON.parse(serviceAccount);
    const auth = new GoogleAuth({
      credentials: sa,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    admin.initializeApp({
      credential: {
        getAccessToken: async () => {
          const client = await auth.getClient();
          const token = await client.getAccessToken();
          return { access_token: token.token!, expires_in: 3600 };
        },
      },
      projectId: sa.project_id,
    });
    initialized = true;
    console.log("[Firebase] Admin SDK initialized");
  } catch (err) {
    console.error("[Firebase] Failed to initialize:", err);
  }
}

export function isFirebaseReady(): boolean {
  return initialized;
}

export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ successCount: number; failedTokens: string[] }> {
  if (!initialized || tokens.length === 0) {
    return { successCount: 0, failedTokens: [] };
  }

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data ?? {},
    apns: {
      payload: {
        aps: { sound: "default", badge: 1 },
      },
    },
    android: {
      priority: "high",
      notification: { sound: "default", channelId: "price_alerts" },
    },
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  const failedTokens: string[] = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code;
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument" ||
        code === "messaging/third-party-auth-error"
      ) {
        failedTokens.push(tokens[idx]);
      }
    }
  });

  return { successCount: response.successCount, failedTokens };
}
