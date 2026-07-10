/* Order page: cart on server-rendered menu rows, validation,
   and order placement via api/place-order.php. */

(function () {
  const summaryList = document.getElementById("summary-list");
  const summaryTotal = document.getElementById("summary-total");
  const errorMsg = document.getElementById("order-error");
  const placeBtn = document.getElementById("place-order");
  const csrf = document.querySelector('meta[name="csrf-token"]').content;

  // cart[id] = { name, qty, price }
  const cart = {};

  const rupees = (n) => "₹" + n.toLocaleString("en-IN");

  // Wire up +/- controls on each server-rendered menu row
  document.querySelectorAll(".menu-item").forEach((row) => {
    const id = row.dataset.id;
    const name = row.dataset.name;
    const price = parseFloat(row.dataset.price);
    const qtyEl = row.querySelector(".qty");

    function setQty(newQty) {
      newQty = Math.max(0, Math.min(999, newQty));
      qtyEl.textContent = String(newQty);
      if (newQty === 0) {
        delete cart[id];
      } else {
        cart[id] = { name, qty: newQty, price };
      }
      renderSummary();
    }

    row.querySelector(".qty-minus").addEventListener("click", () =>
      setQty((cart[id]?.qty || 0) - 1)
    );
    row.querySelector(".qty-plus").addEventListener("click", () =>
      setQty((cart[id]?.qty || 0) + 1)
    );
  });

  function renderSummary() {
    const ids = Object.keys(cart);
    summaryList.innerHTML = "";

    if (ids.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Nothing selected yet — use the + buttons above.";
      summaryList.appendChild(li);
      summaryTotal.textContent = rupees(0);
      return;
    }

    let total = 0;
    ids.forEach((id) => {
      const { name, qty, price } = cart[id];
      total += qty * price;
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.textContent = name + " × " + qty;
      const right = document.createElement("span");
      right.textContent = rupees(qty * price);
      li.append(left, right);
      summaryList.appendChild(li);
    });
    summaryTotal.textContent = rupees(total);
  }

  // Saved-address radios: show the new-address fields only when "new" is chosen
  const newAddressFields = document.getElementById("new-address-fields");
  const addressChoices = document.querySelectorAll('input[name="address_choice"]');
  addressChoices.forEach((radio) =>
    radio.addEventListener("change", () => {
      newAddressFields.hidden = radio.value !== "new" || !radio.checked;
    })
  );

  function selectedAddress() {
    const checked = document.querySelector('input[name="address_choice"]:checked');
    if (checked && checked.value === "pickup") {
      return { address_id: null, address_text: "" };
    }
    if (checked && checked.value !== "new") {
      return { address_id: parseInt(checked.value, 10), address_text: "" };
    }
    return {
      address_id: null,
      address_text: document.getElementById("address").value.trim(),
      lat: document.getElementById("lat").value || null,
      lng: document.getElementById("lng").value || null,
    };
  }

  function validate() {
    if (Object.keys(cart).length === 0) {
      return "Please choose at least one dish with the + buttons (Step 1).";
    }
    if (!document.getElementById("cust-name").value.trim()) {
      return "Please write your name (Step 2).";
    }
    const phone = document.getElementById("cust-phone").value.replace(/\D/g, "");
    if (phone.length < 10) {
      return "Please write a 10-digit phone number (Step 2).";
    }
    if (!document.getElementById("when").value.trim()) {
      return "Please tell us when you need the food (Step 2).";
    }
    return "";
  }

  placeBtn.addEventListener("click", async () => {
    const problem = validate();
    errorMsg.textContent = problem;
    if (problem) {
      errorMsg.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    placeBtn.disabled = true;
    placeBtn.textContent = "Placing your order…";

    const body = {
      items: Object.entries(cart).map(([id, it]) => ({ id: parseInt(id, 10), qty: it.qty })),
      name: document.getElementById("cust-name").value.trim(),
      phone: document.getElementById("cust-phone").value.trim(),
      occasion: document.getElementById("occasion").value,
      needed_on: document.getElementById("when").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      ...selectedAddress(),
    };

    try {
      const res = await fetch("api/place-order.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Something went wrong. Please try again or call us.");
      }
      window.location.href = "order-success.php?o=" + data.order_id;
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.scrollIntoView({ behavior: "smooth", block: "center" });
      placeBtn.disabled = false;
      placeBtn.textContent = "🍽️ Place Order";
    }
  });
})();
