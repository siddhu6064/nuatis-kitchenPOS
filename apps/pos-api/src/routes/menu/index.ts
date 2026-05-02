import { Router, type IRouter } from "express";
import { categoriesRouter } from "./categories.js";
import { itemsRouter } from "./items.js";
import { modifierGroupsRouter } from "./modifier-groups.js";
import { modifierOptionsRouter } from "./modifier-options.js";
import { linksRouter } from "./links.js";
import { treeRouter } from "./tree.js";

export const menuRouter: IRouter = Router();

menuRouter.use("/categories", categoriesRouter);
menuRouter.use("/items", itemsRouter);
menuRouter.use("/modifier-groups", modifierGroupsRouter);
menuRouter.use("/modifier-options", modifierOptionsRouter);
menuRouter.use("/items/:item_id/modifier-groups", linksRouter);
menuRouter.use("/tree", treeRouter);
