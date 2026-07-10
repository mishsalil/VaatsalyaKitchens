/* "Use my current location" button: browser geolocation + OpenStreetMap
   Nominatim reverse geocoding. Fills #address, #lat, #lng.
   Works on any page that has a #use-location button. */

(function () {
  const btn = document.getElementById("use-location");
  if (!btn) return;

  const status = document.getElementById("location-status");
  const addressField = document.getElementById("address");
  const latField = document.getElementById("lat");
  const lngField = document.getElementById("lng");

  btn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      status.textContent = "Your browser cannot share location — please type the address below.";
      return;
    }
    status.textContent = "Finding your location… (your browser may ask for permission)";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        latField.value = lat;
        lngField.value = lng;

        try {
          // Nominatim usage policy: identify the app, max 1 req/sec (we do 1 per click)
          const res = await fetch(
            "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
              "&lat=" + lat + "&lon=" + lng + "&addressdetails=1",
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          if (data && data.display_name) {
            addressField.value = data.display_name;
            status.textContent =
              "📍 Location found! Please check the address and add your house/flat number. (Location data © OpenStreetMap)";
          } else {
            throw new Error();
          }
        } catch {
          status.textContent =
            "📍 Location captured! We could not read the street name — please type your address below (we still received your map location).";
        }
        addressField.focus();
        btn.disabled = false;
      },
      (err) => {
        btn.disabled = false;
        status.textContent =
          err.code === err.PERMISSION_DENIED
            ? "No problem — please type your address below."
            : "Could not find your location — please type your address below.";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
})();
