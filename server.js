const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]); // Use Google DNS (fixes SRV lookup on some networks)

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const config = require("./config");
const path = require("path");

// Import routes
const paymentRoutes = require("./routes/paymentRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");

const app = express();

// ── Middleware ────────────────────────────────
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────
app.use("/api/payment", paymentRoutes);
app.use("/api/subscription", subscriptionRoutes);

// ── Swagger API Docs ─────────────────────────
app.get("/api-docs", (req, res) => {
  res.sendFile(path.join(__dirname, "swagger-ui.html"));
});
app.get("/swagger.json", (req, res) => {
  res.sendFile(path.join(__dirname, "swagger.json"));
});

// ── Health Check ─────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "🚀 SSLCommerz Subscription Payment Server",
    version: "2.0.0",
    mode: config.sslcommerz.isLive ? "LIVE" : "SANDBOX",
    swaggerDocs: "/api-docs",
    endpoints: {
      "POST /api/payment/init": "⭐ Payment করো (শুধু এই 1টা API call করো — বাকি সব auto)",
      "GET /api/subscription/plans": "Plans ও Pricing দেখো",
      "GET /api/subscription/user/:userId": "Active Subscription দেখো",
      "GET /api/subscription/user/:userId/history": "Subscription History",
      "POST /api/subscription/calculate-price": "Price Preview",
      "POST /api/subscription/check-validity": "Subscription Valid কিনা চেক করো",
    },
  });
});

// ── Payment Result Page ──────────────────────
// SSLCommerz redirects here after payment
// Flutter WebView detects this URL and navigates accordingly
const Subscription = require("./models/Subscription");
app.get("/payment-result", async (req, res) => {
  const { status, tran_id, subscription_id } = req.query;

  const isSuccess = status === "success";
  const title = isSuccess ? "Payment Successful!" : status === "cancelled" ? "Payment Cancelled" : "Payment Failed";
  const emoji = isSuccess ? "✅" : status === "cancelled" ? "🚫" : "❌";
  const color = isSuccess ? "#4CAF50" : status === "cancelled" ? "#FF9800" : "#f44336";
  const message = isSuccess 
    ? "Your subscription has been activated successfully." 
    : status === "cancelled" 
    ? "You cancelled the payment. You can try again." 
    : "Payment could not be completed. Please try again.";

  // ── Fetch subscription details from DB if available ──
  let sub = null;
  if (subscription_id) {
    try {
      sub = await Subscription.findById(subscription_id);
    } catch (e) {
      // ignore — page still renders without details
    }
  }

  // Format dates for display
  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  // Build subscription details HTML (only for success with data)
  const detailsHtml = (isSuccess && sub) ? `
        <div class="details">
          <div class="detail-row"><span class="label">Plan</span><span class="value">${sub.planLabel || '—'}</span></div>
          <div class="detail-row"><span class="label">Plan Type</span><span class="value">${sub.planType === 'self_managed' ? 'Self Managed' : 'Company Managed'}</span></div>
          <div class="detail-row"><span class="label">Units</span><span class="value">${sub.units || '—'}</span></div>
          <div class="detail-row"><span class="label">Amount</span><span class="value">৳${sub.totalPrice?.toLocaleString() || '—'}</span></div>
          <div class="detail-row"><span class="label">Start Date</span><span class="value">${formatDate(sub.startDate)}</span></div>
          <div class="detail-row"><span class="label">End Date</span><span class="value">${formatDate(sub.endDate)}</span></div>
          <div class="detail-row"><span class="label">Payment Method</span><span class="value">${sub.cardType || '—'}</span></div>
        </div>` : '';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
        .card { background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 420px; width: 90%; }
        .emoji { font-size: 64px; margin-bottom: 16px; }
        .title { font-size: 24px; font-weight: 700; color: ${color}; margin-bottom: 8px; }
        .message { font-size: 16px; color: #666; margin-bottom: 24px; }
        .info { font-size: 12px; color: #999; margin-top: 16px; word-break: break-all; }
        .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; background: ${color}; color: white; font-weight: 600; font-size: 14px; }
        .details { margin-top: 24px; text-align: left; border-top: 1px solid #eee; padding-top: 16px; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; }
        .detail-row .label { font-size: 14px; color: #888; }
        .detail-row .value { font-size: 14px; font-weight: 600; color: #333; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="emoji">${emoji}</div>
        <div class="title">${title}</div>
        <div class="message">${message}</div>
        <div class="status-badge">${status ? status.toUpperCase() : 'UNKNOWN'}</div>
        ${detailsHtml}
        ${tran_id ? `<div class="info">Transaction: ${tran_id}</div>` : ''}
      </div>
    </body>
    </html>
  `);
});

// ── SSLCommerz Return Redirects ──────────────
// When Flutter passes its own URLs as success/fail/cancel callbacks,
// SSLCommerz POSTs back here. We 303-redirect to the Flutter app route.
app.post("/api/sslcommerz/return/success", (req, res) => {
  res.redirect(303, "/#/payment/success");
});

app.post("/api/sslcommerz/return/fail", (req, res) => {
  res.redirect(303, "/#/payment/success");
});

app.post("/api/sslcommerz/return/cancel", (req, res) => {
  res.redirect(303, "/#/payment/success");
});

// ── Connect to MongoDB & Start Server ────────
mongoose
  .connect(config.mongodbUri)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📡 Base URL: ${config.baseUrl}`);
      console.log(`🔑 Store ID: ${config.sslcommerz.storeId}`);
      console.log(`🌐 Mode: ${config.sslcommerz.isLive ? "LIVE" : "SANDBOX"}`);
      console.log(`🖥️  Frontend: ${config.frontendUrl}`);
      console.log(`\n📋 API Docs: ${config.baseUrl}/`);
      console.log(`📖 Swagger UI: ${config.baseUrl}/api-docs`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

module.exports = app;
