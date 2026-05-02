import { Router, type IRouter } from "express";
import { ordersRouter } from "./orders.js";
import { orderItemsRouter } from "./items.js";
import { kitchenRouter } from "./kitchen.js";
import { checkoutRouter } from "./checkout.js";
import { paymentsRouter } from "./payments.js";
import { voidRouter } from "./void.js";
import { receiptSendRouter } from "../receipts/index.js";

const ordersBarrel: IRouter = Router();

// Main order routes (create, get, list)
ordersBarrel.use("/", ordersRouter);

// Sub-resource routes (mergeParams so :id flows through)
ordersBarrel.use("/:id/items", orderItemsRouter);
ordersBarrel.use("/:id/send-to-kitchen", kitchenRouter);
ordersBarrel.use("/:id/checkout", checkoutRouter);
ordersBarrel.use("/:id/payments", paymentsRouter);
ordersBarrel.use("/:id/void", voidRouter);
ordersBarrel.use("/:id/receipts", receiptSendRouter);

export { ordersBarrel as ordersRouter };
