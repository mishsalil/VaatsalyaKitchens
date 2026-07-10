/* Shared client logic for the account page and the order-success page:
   PIN set/change, address add/remove/set-default. Each block activates
   only if its elements exist on the current page. */

(function () {
  const csrf = document.querySelector('meta[name="csrf-token"]').content;

  async function api(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Something went wrong. Please try again.");
    }
    return data;
  }

  // ---- PIN form (order-success.php and my-account.php) ----
  const pinForm = document.getElementById("pin-form");
  if (pinForm) {
    pinForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("pin-status");
      const pin = document.getElementById("pin").value.trim();
      if (!/^\d{4}$/.test(pin)) {
        status.textContent = "The PIN must be exactly 4 digits.";
        return;
      }
      try {
        await api("api/set-pin.php", { pin });
        status.textContent = "✅ PIN saved! You can now sign in from any device.";
        pinForm.querySelector("input").value = "";
      } catch (err) {
        status.textContent = err.message;
      }
    });
  }

  // ---- Address book (my-account.php) ----
  const addressForm = document.getElementById("address-form");
  if (addressForm) {
    addressForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("addr-status");
      try {
        await api("api/addresses.php", {
          action: "add",
          label: document.getElementById("addr-label").value.trim(),
          address_text: document.getElementById("address").value.trim(),
          lat: document.getElementById("lat").value || null,
          lng: document.getElementById("lng").value || null,
        });
        window.location.reload();
      } catch (err) {
        status.textContent = err.message;
      }
    });
  }

  const addressList = document.getElementById("address-list");
  if (addressList) {
    addressList.addEventListener("click", async (e) => {
      const row = e.target.closest("[data-id]");
      if (!row) return;
      const id = parseInt(row.dataset.id, 10);
      try {
        if (e.target.classList.contains("addr-delete")) {
          if (!confirm("Remove this address?")) return;
          await api("api/addresses.php", { action: "delete", id });
          row.remove();
        } else if (e.target.classList.contains("addr-default")) {
          await api("api/addresses.php", { action: "set_default", id });
          window.location.reload();
        }
      } catch (err) {
        alert(err.message);
      }
    });
  }
})();
