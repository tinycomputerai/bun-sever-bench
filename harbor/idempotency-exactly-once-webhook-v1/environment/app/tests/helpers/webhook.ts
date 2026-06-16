import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = "webhook-secret";

export type WebhookEvent = {
  event_id: string;
  type: "increment" | "set";
  resource_id: string;
  sequence: number;
  data: { amount?: number; balance?: number };
};

export function signWebhook(body: string, secret = WEBHOOK_SECRET): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export async function postWebhook(baseUrl: string, event: WebhookEvent, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  return fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": signWebhook(body, secret),
    },
    body,
  });
}

export async function getResource(baseUrl: string, id: string) {
  return fetch(`${baseUrl}/resources/${encodeURIComponent(id)}`);
}
