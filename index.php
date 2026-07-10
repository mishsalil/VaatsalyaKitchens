<?php
require_once __DIR__ . '/includes/layout.php';

$cfg = config();
page_header([
    'title' => 'Vaatsalya Kitchens — Home-style Food for Parties, Kitties & Bulk Orders',
    'nav'   => [['#services', 'What We Do'], ['#how', 'How to Order'], ['#contact', 'Contact']],
]);
?>

  <main>
    <!-- Hero -->
    <section class="hero">
      <div class="container">
        <img class="logo-large" src="assets/logo.jpg" alt="Vaatsalya Kitchens logo — two decorated elephants beneath a mandala" />
        <h1><span class="devanagari" lang="hi">वात्सल्य</span> Kitchens</h1>
        <p class="tagline">Food made with the warmth of home — for your small parties, kitty gatherings and bulk orders. So simple, anyone from 12 to 70+ can order in minutes.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-big" style="width:auto" href="order.php">🍽️ Order Now</a>
          <a class="btn btn-outline" href="#services">See What We Offer</a>
        </div>
      </div>
    </section>

    <!-- Services -->
    <section id="services" class="section section-alt">
      <div class="container">
        <h2>What We Do</h2>
        <hr class="divider" />
        <p class="section-sub">From an intimate get-together to feeding a full hall — every meal is cooked fresh in our kitchen with the care of <em lang="hi">vaatsalya</em> (motherly affection).</p>
        <div class="card-grid">
          <div class="card">
            <div class="card-icon" aria-hidden="true">🎉</div>
            <h3>Small Parties</h3>
            <p>Birthdays, anniversaries and family functions for 10–50 guests. Curated veg menus, served hot, right on time.</p>
          </div>
          <div class="card">
            <div class="card-icon" aria-hidden="true">🫖</div>
            <h3>Kitty Parties</h3>
            <p>Delightful snack platters, chaat counters and light meals that make your kitty the talk of the group.</p>
          </div>
          <div class="card">
            <div class="card-icon" aria-hidden="true">🍛</div>
            <h3>Bulk Food Ordering</h3>
            <p>Office lunches, poojas, community events and large gatherings — 50 to 500+ portions with consistent taste.</p>
          </div>
          <div class="card">
            <div class="card-icon" aria-hidden="true">🏠</div>
            <h3>Daily Home-style Meals</h3>
            <p>Simple, wholesome tiffin-style meals when you want ghar ka khana without the effort.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How to order -->
    <section id="how" class="feature-strip">
      <div class="container">
        <h2>Ordering Is Easy — For Every Age</h2>
        <div class="steps">
          <div class="step">
            <span class="num" aria-hidden="true">1</span>
            <p>Tap <strong>Order Now</strong> and choose your dishes with simple + / − buttons.</p>
          </div>
          <div class="step">
            <span class="num" aria-hidden="true">2</span>
            <p>Tell us your name, phone number and when you need the food. We remember you the next time!</p>
          </div>
          <div class="step">
            <span class="num" aria-hidden="true">3</span>
            <p>Place the order — we confirm right away and keep you updated till it reaches you.</p>
          </div>
        </div>
        <p style="margin-top:2rem">
          <a class="btn btn-primary btn-big" style="width:auto" href="order.php">Start Your Order</a>
        </p>
      </div>
    </section>

    <!-- Contact -->
    <section id="contact" class="section">
      <div class="container">
        <h2>Contact Us</h2>
        <hr class="divider" />
        <ul class="contact-list">
          <li>📞 Phone / WhatsApp: <a href="tel:+<?= e($cfg['kitchen_whatsapp']) ?>"><strong><?= e($cfg['kitchen_phone_display']) ?></strong></a></li>
          <li>📧 Email: <a href="mailto:<?= e($cfg['kitchen_email']) ?>"><?= e($cfg['kitchen_email']) ?></a></li>
          <li>🕘 Order timings: 8:00 AM – 12:00 midnight, all days</li>
          <li>📍 Serving fresh from our cloud kitchen — delivery &amp; pickup available</li>
        </ul>
      </div>
    </section>
  </main>

<?php page_footer(); ?>
