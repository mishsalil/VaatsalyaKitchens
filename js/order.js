/* Order page logic: renders the menu from js/menu.js, keeps a simple cart,
   and sends the order as a WhatsApp message (no backend needed). */

(function () {
  const menuRoot = document.getElementById("menu-root");
  const summaryList = document.getElementById("summary-list");
  const summaryTotal = document.getElementById("summary-total");
  const errorMsg = document.getElementById("order-error");

  // cart[itemName] = { qty, price, unit }
  const cart = {};

  const rupees = (n) => "₹" + n.toLocaleString("en-IN");

  // Keep call links in sync with the number configured in js/menu.js
  document.querySelectorAll("#nav-call, #call-instead").forEach((a) => {
    a.href = "tel:+" + KITCHEN_WHATSAPP;
  });

  function renderMenu() {
    MENU.forEach((cat) => {
      const section = document.createElement("section");
      section.className = "menu-category";

      const heading = document.createElement("h3");
      heading.textContent = cat.category;
      section.appendChild(heading);

      cat.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "menu-item";

        const info = document.createElement("div");
        info.className = "item-info";
        info.innerHTML =
          '<div class="item-name"></div><div class="item-price"></div>';
        info.querySelector(".item-name").textContent = item.name;
        info.querySelector(".item-price").textContent =
          rupees(item.price) + " " + item.unit;
        row.appendChild(info);

        const control = document.createElement("div");
        control.className = "qty-control";

        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";
        minus.setAttribute("aria-label", "Remove one " + item.name);

        const qty = document.createElement("span");
        qty.className = "qty";
        qty.textContent = "0";
        qty.setAttribute("aria-live", "polite");

        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Add one " + item.name);

        function setQty(newQty) {
          newQty = Math.max(0, newQty);
          qty.textContent = String(newQty);
          if (newQty === 0) {
            delete cart[item.name];
          } else {
            cart[item.name] = { qty: newQty, price: item.price, unit: item.unit };
          }
          renderSummary();
        }

        minus.addEventListener("click", () =>
          setQty((cart[item.name]?.qty || 0) - 1)
        );
        plus.addEventListener("click", () =>
          setQty((cart[item.name]?.qty || 0) + 1)
        );

        control.append(minus, qty, plus);
        row.appendChild(control);
        section.appendChild(row);
      });

      menuRoot.appendChild(section);
    });
  }

  function renderSummary() {
    const names = Object.keys(cart);
    summaryList.innerHTML = "";

    if (names.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Nothing selected yet — use the + buttons above.";
      summaryList.appendChild(li);
      summaryTotal.textContent = rupees(0);
      return;
    }

    let total = 0;
    names.forEach((name) => {
      const { qty, price } = cart[name];
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

  function buildWhatsAppMessage() {
    const name = document.getElementById("cust-name").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const occasion = document.getElementById("occasion").value;
    const when = document.getElementById("when").value.trim();
    const address = document.getElementById("address").value.trim();
    const notes = document.getElementById("notes").value.trim();

    const lines = [];
    lines.push("Namaste Vaatsalya Kitchens! I would like to place an order:");
    lines.push("");
    let total = 0;
    Object.keys(cart).forEach((itemName) => {
      const { qty, price, unit } = cart[itemName];
      total += qty * price;
      lines.push("• " + itemName + " — " + qty + " (" + unit + ")");
    });
    lines.push("");
    lines.push("Estimated total: ₹" + total.toLocaleString("en-IN"));
    lines.push("");
    lines.push("Name: " + name);
    lines.push("Phone: " + phone);
    if (occasion) lines.push("Occasion: " + occasion);
    lines.push("Needed on: " + when);
    lines.push(address ? "Delivery address: " + address : "Pickup order");
    if (notes) lines.push("Notes: " + notes);

    return lines.join("\n");
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

  document.getElementById("send-whatsapp").addEventListener("click", () => {
    const problem = validate();
    errorMsg.textContent = problem;
    if (problem) {
      errorMsg.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const url =
      "https://wa.me/" +
      KITCHEN_WHATSAPP +
      "?text=" +
      encodeURIComponent(buildWhatsAppMessage());
    window.open(url, "_blank");
  });

  renderMenu();
})();
