/* =====================================================================
   EDIT THIS FILE to update your menu and contact number.
   No other file needs to change — the order page builds itself from here.
   ===================================================================== */

// Your WhatsApp / phone number in international format, digits only.
// Example: "919876543210" for +91 98765 43210.
const KITCHEN_WHATSAPP = "919623836382";
const KITCHEN_PHONE_DISPLAY = "+91 96238 36382";

// Menu: each category has a name and a list of items { name, price, unit }.
// "unit" is shown next to the price, e.g. "per plate", "per kg", "per 10 pcs".
const MENU = [
  {
    category: "Party Snacks & Starters",
    items: [
      { name: "Paneer Tikka", price: 250, unit: "per plate (8 pcs)" },
      { name: "Hara Bhara Kabab", price: 180, unit: "per plate (8 pcs)" },
      { name: "Dahi Ke Sholey", price: 200, unit: "per plate (8 pcs)" },
      { name: "Assorted Pakoda Platter", price: 220, unit: "per platter" },
    ],
  },
  {
    category: "Kitty Party Specials",
    items: [
      { name: "Chaat Counter (Golgappa + Papdi Chaat)", price: 150, unit: "per person" },
      { name: "Sandwich & Wraps Platter", price: 350, unit: "per platter (10 pcs)" },
      { name: "Dhokla & Khandvi Platter", price: 280, unit: "per platter" },
      { name: "Tea / Coffee Kettle", price: 300, unit: "serves 10" },
    ],
  },
  {
    category: "Main Course (Bulk Friendly)",
    items: [
      { name: "Shahi Paneer", price: 320, unit: "per kg" },
      { name: "Dal Makhani", price: 260, unit: "per kg" },
      { name: "Mix Veg", price: 240, unit: "per kg" },
      { name: "Chole", price: 240, unit: "per kg" },
      { name: "Jeera Rice", price: 180, unit: "per kg" },
      { name: "Veg Biryani", price: 280, unit: "per kg" },
      { name: "Tawa Roti", price: 8, unit: "per piece" },
      { name: "Butter Naan", price: 25, unit: "per piece" },
    ],
  },
  {
    category: "Desserts",
    items: [
      { name: "Gulab Jamun", price: 200, unit: "per 10 pcs" },
      { name: "Moong Dal Halwa", price: 350, unit: "per kg" },
      { name: "Kheer", price: 250, unit: "per kg" },
    ],
  },
];
