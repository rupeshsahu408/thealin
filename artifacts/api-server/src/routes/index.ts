import { Router, type IRouter } from "express";
import healthRouter from "./health";
import planetsRouter from "./planets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(planetsRouter);

export default router;
