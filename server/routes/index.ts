import express from "express";

import apiRouter from "./api";
import authRouter from "./auth";

export default function router() {
    const router = express.Router({ strict: true });

    router.use(apiRouter());
    router.use(authRouter());

    return router;
}
