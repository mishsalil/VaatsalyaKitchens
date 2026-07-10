/* Push notification opt-in (order-success page).
   Shows the #push-box only when the browser supports push and the user
   hasn't decided yet; subscribes and stores the subscription server-side. */

(function () {
  const box = document.getElementById("push-box");
  if (!box) return;

  const vapidKey = document.querySelector('meta[name="vapid-key"]')?.content;
  const csrf = document.querySelector('meta[name="csrf-token"]').content;

  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported || !vapidKey || Notification.permission === "denied") return;

  const btn = document.getElementById("enable-push");
  const status = document.getElementById("push-status");
  box.hidden = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function subscribe() {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      status.textContent = "No problem — we will keep you updated by phone.";
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const res = await fetch("api/push-subscribe.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) throw new Error();

    btn.hidden = true;
    status.textContent = "🔔 Done! We will notify you about your order on this device.";
  }

  btn.addEventListener("click", () => {
    status.textContent = "Setting up…";
    subscribe().catch(() => {
      status.textContent = "Could not set up notifications — we will keep you updated by phone.";
    });
  });

  // If already subscribed on this device, keep the box hidden
  navigator.serviceWorker.getRegistration().then(async (reg) => {
    if (reg && (await reg.pushManager.getSubscription())) {
      box.hidden = true;
    }
  });
})();
