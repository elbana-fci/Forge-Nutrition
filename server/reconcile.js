import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
if (!process.env.STRIPE_SECRET_KEY)
  throw Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY),
  db = new PrismaClient();
try {
  for (const order of await db.order.findMany({
    where: { status: "PENDING" },
    include: { items: true },
  })) {
    let session = order.stripeSessionId
      ? await stripe.checkout.sessions.retrieve(order.stripeSessionId)
      : null;
    if (!session) {
      const sessions = stripe.checkout.sessions.list({
        created: {
          gte: Math.floor(order.createdAt.getTime() / 1000) - 60,
          lte: Math.floor(order.createdAt.getTime() / 1000) + 86400,
        },
        limit: 100,
      });
      for await (const candidate of sessions) {
        if (candidate.metadata?.orderId === order.id) {
          session = candidate;
          break;
        }
      }
      if (session)
        await db.order.update({
          where: { id: order.id },
          data: { stripeSessionId: session.id },
        });
    }
    const paid = session?.payment_status === "paid";
    const expired =
      session?.status === "expired" ||
      (!session && Date.now() - order.createdAt.getTime() > 86400000);
    if (paid || expired)
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING" },
          data: { status: paid ? "PAID" : "CANCELLED" },
        });
        if (updated.count && !paid)
          for (const i of order.items)
            await tx.product.update({
              where: { id: i.productId },
              data: { stock: { increment: i.quantity } },
            });
      });
    console.log(order.id, paid ? "paid" : expired ? "cancelled" : "pending");
  }
} finally {
  await db.$disconnect();
}
