import express from "express";

import apiRouter from "./api/index.ts";
import authRouter from "./auth/index.ts";
import cors from "cors";

export default function router() {
    const router = express.Router({ strict: true });

    router.use(apiRouter());
    router.use(authRouter());
    router.use(cors());

    return router;
}
