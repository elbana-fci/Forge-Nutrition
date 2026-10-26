import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { z } from "zod";
import { searchProducts, aiIntent } from "./search.js";
const db = new PrismaClient(),
  app = express(),
  stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;
const origin = process.env.APP_URL || "http://localhost:3000";
app.use(helmet({ contentSecurityPolicy: false }));
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
      return res.sendStatus(503);
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      return res.sendStatus(400);
    }
    try {
      await db.$transaction(async (tx) => {
        if (await tx.webhookEvent.findUnique({ where: { id: event.id } }))
          return;
        const session = event.data.object;
        if (
          [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
            "checkout.session.expired",
            "checkout.session.async_payment_failed",
          ].includes(event.type)
        ) {
          const order = await tx.order.findUnique({
            where: { stripeSessionId: session.id },
            include: { items: true },
          });
          if (!order) throw Error("Order not yet linked; retry webhook");
          if (order.status === "PENDING") {
            if (session.payment_status === "paid")
              await tx.order.update({
                where: { id: order.id },
                data: { status: "PAID" },
              });
            else if (
              [
                "checkout.session.expired",
                "checkout.session.async_payment_failed",
              ].includes(event.type)
            ) {
              for (const item of order.items)
                await tx.product.update({
                  where: { id: item.productId },
                  data: { stock: { increment: item.quantity } },
                });
              await tx.order.update({
                where: { id: order.id },
                data: { status: "CANCELLED" },
              });
            }
          }
        }
        await tx.webhookEvent.create({ data: { id: event.id } });
      });
      res.json({ received: true });
    } catch {
      res
        .status(500)
        .json({ error: "Webhook processing failed; retry required" });
    }
  },
);
app.use(express.json({ limit: "50kb" }), cookieParser());
app.use("/api", rateLimit({ windowMs: 60000, limit: 120 }));
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== origin
  )
    return res.status(403).json({ error: "Invalid request origin" });
  next();
});
const auth = async (req, res, next) => {
  try {
    const s = await db.session.findUnique({
      where: { id: req.cookies.session || "" },
      include: { user: true },
    });
    if (!s || s.expiresAt < new Date())
      return res.status(401).json({ error: "Please sign in" });
    req.user = s.user;
    next();
  } catch (nextError) {
    next(nextError);
  }
};
const admin = (req, res, next) =>
  req.user.role === "ADMIN"
    ? next()
    : res.status(403).json({ error: "Admin access required" });
const userView = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
app.get("/api/health", (_, res) =>
  res.json({
    status: "ok",
    payments: !!stripe,
    ai: !!process.env.OPENAI_API_KEY,
  }),
);
app.get("/api/products", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").slice(0, 500);
    let intent = null;
    try {
      intent = await aiIntent(q);
    } catch {}
    const products = searchProducts(
      await db.product.findMany({ where: { published: true } }),
      q,
      req.query,
      intent,
    );
    res.json({ products, searchMode: intent ? "ai" : "catalog" });
  } catch (e) {
    next(e);
  }
});
app.get("/api/products/:slug", async (req, res, next) => {
  try {
    const p = await db.product.findUnique({ where: { slug: req.params.slug } });
    if (!p || !p.published)
      return res.status(404).json({ error: "Product not found" });
    res.json(p);
  } catch (e) {
    next(e);
  }
});
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
app.post("/api/auth/:action", authLimit, async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z.email().max(254),
        password: z.string().min(10).max(100),
        name: z.string().min(2).max(80).optional(),
      })
      .parse(req.body);
    input.email = input.email.toLowerCase();
    let user;
    if (req.params.action === "register") {
      if (!input.name)
        return res.status(400).json({ error: "Name is required" });
      user = await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: await bcrypt.hash(input.password, 12),
        },
      });
    } else if (req.params.action === "login") {
      user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !(await bcrypt.compare(input.password, user.passwordHash)))
        return res.status(401).json({ error: "Invalid email or password" });
    } else return res.sendStatus(404);
    const id = crypto.randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    res
      .cookie("session", id, {
        httpOnly: true,
        secure: origin.startsWith("https:"),
        sameSite: "lax",
        maxAge: 7 * 86400000,
        path: "/",
      })
      .json(userView(user));
  } catch (e) {
    if (e.code === "P2002")
      return res.status(409).json({ error: "Email already registered" });
    next(e);
  }
});
app.get("/api/me", auth, (req, res) => res.json(userView(req.user)));
app.post("/api/logout", auth, async (req, res, next) => {
  try {
    await db.session.deleteMany({ where: { id: req.cookies.session } });
    res.clearCookie("session").json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/orders", auth, async (req, res, next) => {
  try {
    res.json(
      await db.order.findMany({
        where: { userId: req.user.id },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/checkout", auth, async (req, res, next) => {
  if (!stripe)
    return res
      .status(503)
      .json({
        error:
          "Payments are not configured. Add Stripe credentials to enable checkout.",
      });
  let order;
  try {
    const input = z
      .object({
        items: z
          .array(
            z.object({
              id: z.string(),
              quantity: z.number().int().min(1).max(20),
            }),
          )
          .min(1)
          .max(50),
        shipping: z.object({
          name: z.string().min(2).max(100),
          address: z.string().min(5).max(250),
          city: z.string().min(2).max(100),
          postal: z.string().min(2).max(20),
          country: z.enum(["US"]),
        }),
      })
      .parse(req.body);
    if (new Set(input.items.map((x) => x.id)).size !== input.items.length)
      return res.status(400).json({ error: "Duplicate cart lines" });
    order = await db.$transaction(async (tx) => {
      let total = 0;
      const items = [];
      for (const line of input.items) {
        const p = await tx.product.findUnique({ where: { id: line.id } });
        if (!p || !p.published) throw Error("Product unavailable");
        const r = await tx.product.updateMany({
          where: { id: p.id, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (r.count !== 1) throw Error(`${p.name} has insufficient stock`);
        total += p.price * line.quantity;
        items.push({
          productId: p.id,
          name: p.name,
          price: p.price,
          quantity: line.quantity,
        });
      }
      const shippingCost = total >= 7500 ? 0 : 590;
      return tx.order.create({
        data: {
          userId: req.user.id,
          total: total + shippingCost,
          shipping: JSON.stringify(input.shipping),
          items: { create: items },
        },
        include: { items: true },
      });
    });
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: order.id,
        customer_email: req.user.email,
        line_items: [
          ...order.items.map((x) => ({
            price_data: {
              currency: "usd",
              product_data: { name: x.name },
              unit_amount: x.price,
            },
            quantity: x.quantity,
          })),
          ...(order.total -
            order.items.reduce((n, x) => n + x.price * x.quantity, 0) >
          0
            ? [
                {
                  price_data: {
                    currency: "usd",
                    product_data: { name: "Standard shipping" },
                    unit_amount: 590,
                  },
                  quantity: 1,
                },
              ]
            : []),
        ],
        success_url: `${origin}/?payment=success`,
        cancel_url: `${origin}/?payment=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 1800,
        metadata: { orderId: order.id },
      },
      { idempotencyKey: order.id },
    );
    await db.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });
    res.json({ url: session.url });
  } catch (e) {
    // Only release reservations when no Stripe session could have been created.
    // Ambiguous network errors stay reserved for reconciliation to prevent overselling.
    if (
      order &&
      (e.type === "StripeInvalidRequestError" ||
        e.type === "StripeAuthenticationError")
    )
      await db.$transaction(async (tx) => {
        for (const i of order.items)
          await tx.product.update({
            where: { id: i.productId },
            data: { stock: { increment: i.quantity } },
          });
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
      });
    next(e);
  }
});
app.get("/api/admin/products", auth, admin, async (req, res, next) => {
  try {
    res.json(await db.product.findMany());
  } catch (e) {
    next(e);
  }
});
const productInput = z.object({
  name: z.string().min(2).max(120),
  brand: z.string().min(1).max(80),
  category: z.enum(["Protein", "Creatine", "Pre-workout", "Essentials"]),
  description: z.string().min(5).max(2000),
  price: z.number().int().min(1).max(1000000),
  stock: z.number().int().min(0).max(100000),
  flavor: z.string().max(80),
  ingredients: z.string().max(2000),
  dietary: z.string().max(250),
  protein: z.number().int().min(0).max(100),
  servings: z.number().int().min(1).max(1000),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  published: z.boolean().optional(),
});
app.post("/api/admin/products", auth, admin, async (req, res, next) => {
  try {
    const p = productInput.parse(req.body),
      id = crypto.randomUUID();
    res
      .status(201)
      .json(
        await db.product.create({
          data: {
            ...p,
            id,
            slug:
              p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
              "-" +
              id.slice(0, 5),
          },
        }),
      );
  } catch (e) {
    next(e);
  }
});
app.patch("/api/admin/products/:id", auth, admin, async (req, res, next) => {
  try {
    res.json(
      await db.product.update({
        where: { id: req.params.id },
        data: productInput.partial().parse(req.body),
      }),
    );
  } catch (e) {
    next(e);
  }
});
app.get("/api/admin/orders", auth, admin, async (req, res, next) => {
  try {
    res.json(
      await db.order.findMany({
        include: { items: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
    );
  } catch (e) {
    next(e);
  }
});
app.patch("/api/admin/orders/:id", auth, admin, async (req, res, next) => {
  try {
    const { status } = z
      .object({ status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]) })
      .parse(req.body);
    const previous = {
      PROCESSING: "PAID",
      SHIPPED: "PROCESSING",
      DELIVERED: "SHIPPED",
    }[status];
    const result = await db.order.updateMany({
      where: { id: req.params.id, status: previous },
      data: { status },
    });
    if (!result.count)
      return res.status(409).json({ error: "Invalid order status transition" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.use("/api", (_, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.get("/robots.txt", (_, res) =>
  res
    .type("text")
    .send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /checkout\nSitemap: ${origin}/sitemap.xml`,
    ),
);
const xml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
app.get("/sitemap.xml", async (_, res, next) => {
  try {
    const products = await db.product.findMany({ where: { published: true } });
    const paths = [
      "/",
      "/shop",
      ...["protein", "creatine", "pre-workout", "essentials"].map(
        (x) => "/category/" + x,
      ),
      ...products.map((x) => "/product/" + x.slug),
    ];
    res
      .type("xml")
      .send(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          paths
            .map((p) => "<url><loc>" + xml(origin + p) + "</loc></url>")
            .join("") +
          "</urlset>",
      );
  } catch (e) {
    next(e);
  }
});
if (process.env.NODE_ENV === "production") {
  app.get(
    [
      "/",
      "/shop",
      "/category/:category",
      "/product/:slug",
      "/admin",
      "/checkout",
      "/account",
    ],
    async (req, res, next) => {
      try {
        let title = "FORGE — Fuel your next.",
          description =
            "Shop sports nutrition: protein, creatine, pre-workout and everyday essentials.",
          schema = "";
        if (req.params.slug) {
          const p = await db.product.findUnique({
            where: { slug: req.params.slug },
          });
          if (!p || !p.published)
            return res.status(404).send("Product not found");
          title = p.name + " | FORGE";
          description = p.description;
          schema =
            '<script type="application/ld+json" id="product-schema">' +
            JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: p.name,
              description: p.description,
              sku: p.id,
              brand: { "@type": "Brand", name: p.brand },
              offers: {
                "@type": "Offer",
                url: origin + req.path,
                priceCurrency: "USD",
                price: (p.price / 100).toFixed(2),
                availability:
                  "https://schema.org/" + (p.stock ? "InStock" : "OutOfStock"),
              },
            }).replace(/</g, "\\u003c") +
            "</script>";
        } else if (req.params.category) {
          if (
            !["protein", "creatine", "pre-workout", "essentials"].includes(
              req.params.category,
            )
          )
            return res.status(404).send("Category not found");
          title = req.params.category + " Supplements | FORGE";
        }
        const html = await readFile(
          new URL("../dist/index.html", import.meta.url),
          "utf8",
        );
        res.send(
          html
            .replace(/<title>.*?<\/title>/, "<title>" + xml(title) + "</title>")
            .replace(
              /<meta name="description"[^>]*>/,
              '<meta name="description" content="' + xml(description) + '"/>',
            )
            .replace(
              "</head>",
              '<link rel="canonical" href="' +
                xml(origin + req.path) +
                '"/><meta property="og:title" content="' +
                xml(title) +
                '"/><meta property="og:description" content="' +
                xml(description) +
                '"/>' +
                (["/admin", "/account", "/checkout"].includes(req.path)
                  ? '<meta name="robots" content="noindex"/>'
                  : "") +
                schema +
                "</head>",
            ),
        );
      } catch (e) {
        next(e);
      }
    },
  );
  app.use(express.static("dist"));
  app.get("/{*path}", (_, res) =>
    res.sendFile(new URL("../dist/index.html", import.meta.url).pathname),
  );
} else if (process.env.NODE_ENV !== "test") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) => {
  console.error(err.message);
  res
    .status(err instanceof z.ZodError ? 400 : 500)
    .json({
      error:
        err instanceof z.ZodError
          ? "Please check the submitted fields"
          : err.message?.includes("stock")
            ? err.message
            : "Unable to complete request. Please try again.",
    });
});
export { app, db };
if (process.env.NODE_ENV !== "test")
  app.listen(process.env.PORT || 3000, () => console.log("FORGE server ready"));
