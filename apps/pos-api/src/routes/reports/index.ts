import { Router, type IRouter } from "express";
import { endOfDayRouter } from "./end-of-day.js";
import { csvRouter } from "./csv.js";
import { listReportsRouter } from "./list.js";

export const reportsRouter: IRouter = Router();

reportsRouter.use("/end-of-day", endOfDayRouter);
reportsRouter.use("/end-of-day.csv", csvRouter);
reportsRouter.use("/daily-history", listReportsRouter);
