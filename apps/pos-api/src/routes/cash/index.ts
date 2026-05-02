import { Router, type IRouter } from "express";
import { sessionsRouter } from "./sessions.js";

export const cashRouter: IRouter = Router();

cashRouter.use("/sessions", sessionsRouter);
